'use strict';

/*
 * Mark, Set, Go! Chat
 * -------------------
 * Integrated chat backend for the existing Mark, Set, Go! Express app.
 * Uses its own msgchat_* PostgreSQL tables and does not touch BB Chat data.
 */
module.exports = function installMarkSetGoChat(app, { query, databaseConfigured }) {
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
  const ALLOWED_REACTIONS = new Set(['👍', '❤️', '😂', '😮', '😢', '🎉']);
  let initialized = false;
  let initialization = null;

  function clean(value, max = 500) {
    return String(value ?? '').trim().slice(0, max);
  }

  function int(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  function normalizeReactions(value) {
    let source = value;
    if (typeof source === 'string') {
      try { source = JSON.parse(source); } catch { source = {}; }
    }
    if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
    const output = {};
    for (const [emoji, names] of Object.entries(source)) {
      if (!ALLOWED_REACTIONS.has(emoji) || !Array.isArray(names)) continue;
      const unique = [...new Set(names.map(name => clean(name, 80)).filter(Boolean))];
      if (unique.length) output[emoji] = unique;
    }
    return output;
  }

  function parseImageDataUrl(value) {
    if (!value) return null;
    const match = String(value).match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/i);
    if (!match) throw Object.assign(new Error('Use a PNG, JPEG, WebP, or GIF image.'), { status: 400 });
    const mime = match[1].toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(mime)) throw Object.assign(new Error('Unsupported image type.'), { status: 400 });
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
      throw Object.assign(new Error('Images must be 5 MB or smaller.'), { status: 413 });
    }
    return { mime, buffer };
  }

  function serializeMessage(row) {
    return {
      id: Number(row.id),
      conversation_id: Number(row.conversation_id),
      sender: row.sender,
      body: row.body || '',
      created_at: row.created_at,
      updated_at: row.updated_at || row.created_at,
      edited_at: row.edited_at || null,
      deleted_at: row.deleted_at || null,
      reactions: normalizeReactions(row.reactions),
      image_data: row.image_data ? Buffer.from(row.image_data).toString('base64') : null,
      image_mime: row.image_mime || null,
      image_name: row.image_name || null
    };
  }

  async function ensureTables() {
    if (initialized) return;
    if (initialization) return initialization;
    if (!databaseConfigured()) throw Object.assign(new Error('The account database is not configured.'), { status: 503 });

    initialization = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS msgchat_conversations (
          id BIGSERIAL PRIMARY KEY,
          title VARCHAR(120) NOT NULL,
          created_by VARCHAR(80) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS msgchat_messages (
          id BIGSERIAL PRIMARY KEY,
          conversation_id BIGINT NOT NULL REFERENCES msgchat_conversations(id) ON DELETE CASCADE,
          sender VARCHAR(80) NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          edited_at TIMESTAMPTZ,
          deleted_at TIMESTAMPTZ,
          reactions JSONB NOT NULL DEFAULT '{}'::jsonb,
          image_data BYTEA,
          image_mime VARCHAR(80),
          image_name VARCHAR(255)
        )
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_msgchat_messages_conversation_id_id
        ON msgchat_messages (conversation_id, id)
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_msgchat_messages_conversation_updated
        ON msgchat_messages (conversation_id, updated_at)
      `);

      const count = await query('SELECT COUNT(*)::int AS count FROM msgchat_conversations');
      if (Number(count.rows?.[0]?.count || 0) === 0) {
        const created = await query(
          `INSERT INTO msgchat_conversations (title, created_by)
           VALUES ($1, $2) RETURNING id`,
          ['Welcome', 'System']
        );
        await query(
          `INSERT INTO msgchat_messages (conversation_id, sender, body)
           VALUES ($1, $2, $3)`,
          [created.rows[0].id, 'System', 'Welcome to Mark, Set, Go! Chat. Start a conversation about a book, passage, article, or idea.']
        );
      }

      initialized = true;
    })();

    try {
      await initialization;
    } finally {
      initialization = null;
    }
  }

  function asyncRoute(handler) {
    return async (req, res) => {
      try {
        await ensureTables();
        await handler(req, res);
      } catch (error) {
        console.error('Mark, Set, Go! Chat error:', error);
        res.status(Number(error?.status) || 500).json({ error: error?.message || 'Chat request failed.' });
      }
    };
  }

  app.get('/api/msg-chat/health', asyncRoute(async (_req, res) => {
    res.json({ ok: true, app: 'Mark, Set, Go! Chat', storage: 'postgres' });
  }));

  app.get('/api/msg-chat/conversations', asyncRoute(async (_req, res) => {
    const result = await query(`
      SELECT
        c.id, c.title, c.created_by, c.created_at,
        COALESCE(MAX(m.id), 0)::bigint AS last_message_id,
        COALESCE(MAX(m.created_at), c.created_at) AS last_message_at,
        COALESCE((
          SELECT CASE
            WHEN m2.deleted_at IS NOT NULL THEN 'Message deleted'
            WHEN NULLIF(m2.body, '') IS NOT NULL THEN LEFT(m2.body, 100)
            WHEN m2.image_data IS NOT NULL THEN '📷 Photo'
            ELSE ''
          END
          FROM msgchat_messages m2
          WHERE m2.conversation_id = c.id
          ORDER BY m2.id DESC
          LIMIT 1
        ), '') AS last_message_preview
      FROM msgchat_conversations c
      LEFT JOIN msgchat_messages m ON m.conversation_id = c.id
      GROUP BY c.id
      ORDER BY last_message_at DESC, c.id DESC
      LIMIT 100
    `);
    res.json(result.rows);
  }));

  app.post('/api/msg-chat/conversations', asyncRoute(async (req, res) => {
    const title = clean(req.body?.title, 120);
    const createdBy = clean(req.body?.createdBy, 80);
    if (!title || !createdBy) return res.status(400).json({ error: 'Conversation title and display name are required.' });

    const result = await query(
      `INSERT INTO msgchat_conversations (title, created_by)
       VALUES ($1, $2)
       RETURNING id, title, created_by, created_at`,
      [title, createdBy]
    );

    res.status(201).json({
      ...result.rows[0],
      last_message_id: 0,
      last_message_at: result.rows[0].created_at,
      last_message_preview: ''
    });
  }));

  app.delete('/api/msg-chat/conversations/:id', asyncRoute(async (req, res) => {
    const id = int(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid conversation ID.' });
    const result = await query('DELETE FROM msgchat_conversations WHERE id = $1 RETURNING id', [id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Conversation not found.' });
    res.json({ ok: true, id: Number(result.rows[0].id) });
  }));

  app.get('/api/msg-chat/conversations/:id/messages', asyncRoute(async (req, res) => {
    const conversationId = int(req.params.id);
    const after = int(req.query.after, 0);
    const changedAfterRaw = clean(req.query.changedAfter, 80);
    const changedAfterDate = changedAfterRaw ? new Date(changedAfterRaw) : null;
    const changedAfter = changedAfterDate && !Number.isNaN(changedAfterDate.getTime())
      ? changedAfterDate.toISOString()
      : null;

    if (!conversationId) return res.status(400).json({ error: 'Invalid conversation ID.' });

    const syncTime = new Date().toISOString();
    res.setHeader('X-MSGChat-Sync-Time', syncTime);

    const result = changedAfter
      ? await query(`
          SELECT *
          FROM msgchat_messages
          WHERE conversation_id = $1
            AND (id > $2 OR updated_at > $3::timestamptz)
          ORDER BY id ASC
          LIMIT 500
        `, [conversationId, after, changedAfter])
      : await query(`
          SELECT *
          FROM msgchat_messages
          WHERE conversation_id = $1 AND id > $2
          ORDER BY id ASC
          LIMIT 500
        `, [conversationId, after]);

    res.json(result.rows.map(serializeMessage));
  }));

  app.post('/api/msg-chat/conversations/:id/messages', asyncRoute(async (req, res) => {
    const conversationId = int(req.params.id);
    const sender = clean(req.body?.sender, 80);
    const body = clean(req.body?.body, 4000);
    const image = parseImageDataUrl(req.body?.imageData);
    const imageName = clean(req.body?.imageName, 255);

    if (!conversationId || !sender) return res.status(400).json({ error: 'Conversation and display name are required.' });
    if (!body && !image) return res.status(400).json({ error: 'Enter a message or attach a photo.' });

    const result = await query(`
      INSERT INTO msgchat_messages
        (conversation_id, sender, body, image_data, image_mime, image_name)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [conversationId, sender, body, image?.buffer || null, image?.mime || null, imageName || null]);

    res.status(201).json(serializeMessage(result.rows[0]));
  }));

  app.patch('/api/msg-chat/conversations/:conversationId/messages/:messageId', asyncRoute(async (req, res) => {
    const conversationId = int(req.params.conversationId);
    const messageId = int(req.params.messageId);
    const sender = clean(req.body?.sender, 80);
    const body = clean(req.body?.body, 4000);

    if (!conversationId || !messageId || !sender) return res.status(400).json({ error: 'Invalid message request.' });

    const result = await query(`
      UPDATE msgchat_messages
      SET body = $1, edited_at = NOW(), updated_at = NOW()
      WHERE id = $2 AND conversation_id = $3 AND sender = $4 AND deleted_at IS NULL
      RETURNING *
    `, [body, messageId, conversationId, sender]);

    if (!result.rowCount) return res.status(404).json({ error: 'Message not found or cannot be edited.' });
    res.json(serializeMessage(result.rows[0]));
  }));

  app.delete('/api/msg-chat/conversations/:conversationId/messages/:messageId', asyncRoute(async (req, res) => {
    const conversationId = int(req.params.conversationId);
    const messageId = int(req.params.messageId);
    const sender = clean(req.body?.sender, 80);

    if (!conversationId || !messageId || !sender) return res.status(400).json({ error: 'Invalid message request.' });

    const result = await query(`
      UPDATE msgchat_messages
      SET body = '', image_data = NULL, image_mime = NULL, image_name = NULL,
          reactions = '{}'::jsonb, deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND conversation_id = $2 AND sender = $3 AND deleted_at IS NULL
      RETURNING *
    `, [messageId, conversationId, sender]);

    if (!result.rowCount) return res.status(404).json({ error: 'Message not found or cannot be deleted.' });
    res.json(serializeMessage(result.rows[0]));
  }));

  app.post('/api/msg-chat/conversations/:conversationId/messages/:messageId/reactions', asyncRoute(async (req, res) => {
    const conversationId = int(req.params.conversationId);
    const messageId = int(req.params.messageId);
    const sender = clean(req.body?.sender, 80);
    const emoji = clean(req.body?.emoji, 8);

    if (!conversationId || !messageId || !sender || !ALLOWED_REACTIONS.has(emoji)) {
      return res.status(400).json({ error: 'Invalid reaction request.' });
    }

    const current = await query(
      `SELECT reactions FROM msgchat_messages
       WHERE id = $1 AND conversation_id = $2 AND deleted_at IS NULL`,
      [messageId, conversationId]
    );
    if (!current.rowCount) return res.status(404).json({ error: 'Message not found.' });

    const reactions = normalizeReactions(current.rows[0].reactions);
    const names = new Set(reactions[emoji] || []);
    if (names.has(sender)) names.delete(sender);
    else names.add(sender);
    if (names.size) reactions[emoji] = [...names];
    else delete reactions[emoji];

    const result = await query(`
      UPDATE msgchat_messages
      SET reactions = $1::jsonb, updated_at = NOW()
      WHERE id = $2 AND conversation_id = $3
      RETURNING *
    `, [JSON.stringify(reactions), messageId, conversationId]);

    res.json(serializeMessage(result.rows[0]));
  }));
};
