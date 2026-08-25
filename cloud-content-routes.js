'use strict';

const { query, databaseConfigured } = require('./db');

const CLERK_PUBLISHABLE_KEY = String(process.env.CLERK_PUBLISHABLE_KEY || '').trim();
const CLERK_SECRET_KEY = String(process.env.CLERK_SECRET_KEY || '').trim();
const clerkConfigured = Boolean(CLERK_PUBLISHABLE_KEY && CLERK_SECRET_KEY);

let getAuth = null;
if (clerkConfigured) {
  ({ getAuth } = require('@clerk/express'));
}

const MAX_CONTENT_BYTES = 6 * 1024 * 1024;

const EXACT_KEYS = new Set([
  'mark-notebook:insights:v1',
  'mark-notebook:history:v1',
  'syntopicon:saved:v1'
]);

const PREFIXES = [
  'reader-annotations:',
  'whole-guide-questions:'
];

function allowedContentKey(value) {
  const key = String(value || '').trim();
  if (!key || key.length > 220) return '';
  if (EXACT_KEYS.has(key)) return key;
  if (PREFIXES.some((prefix) => key.startsWith(prefix))) return key;
  return '';
}

function normalizeClientUpdatedAt(value) {
  const date = new Date(String(value || ''));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function validatePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error('Content payload must be a JSON object.');
    error.status = 400;
    throw error;
  }
  const serialized = JSON.stringify(value);
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > MAX_CONTENT_BYTES) {
    const error = new Error(`This learning-data record is too large for account sync (${bytes.toLocaleString()} bytes).`);
    error.status = 413;
    throw error;
  }
  return { serialized, bytes };
}

async function requireAccountUser(req, res) {
  if (!clerkConfigured || typeof getAuth !== 'function') {
    res.status(503).json({ error: 'Authentication is not configured.' });
    return null;
  }
  if (!databaseConfigured()) {
    res.status(503).json({ error: 'The account database is not configured.' });
    return null;
  }

  const auth = getAuth(req);
  if (!auth?.isAuthenticated || !auth.userId) {
    res.status(401).json({ error: 'Sign in is required.' });
    return null;
  }

  const result = await query(
    'select id, email, display_name, plan_code, status from app_users where auth_subject = $1',
    [auth.userId]
  );

  if (!result.rows[0]) {
    res.status(409).json({ error: 'Account session must be initialized before account data can be used.' });
    return null;
  }

  return result.rows[0];
}

module.exports = function installCloudContentRoutes(app) {
  if (!app || typeof app.get !== 'function' || typeof app.put !== 'function') {
    throw new Error('Cloud content routes require an Express application.');
  }

  app.locals ||= {};
  if (app.locals.__markSetGoCloudContentRoutesInstalled) return;
  app.locals.__markSetGoCloudContentRoutesInstalled = true;

  let schemaPromise = null;

  async function ensureSchema() {
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
      await query(`
        create table if not exists user_content_snapshots (
          user_id text not null,
          content_key varchar(220) not null,
          payload jsonb not null,
          client_updated_at timestamptz not null default now(),
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          primary key (user_id, content_key)
        )
      `);

      await query(`
        create index if not exists idx_user_content_snapshots_user_updated
        on user_content_snapshots (user_id, updated_at desc)
      `);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });

    return schemaPromise;
  }

  const formatRow = (row) => ({
    key: row.content_key,
    payload: row.payload || {},
    clientUpdatedAt: row.client_updated_at,
    updatedAt: row.updated_at
  });

  app.get('/api/account/content-sync', async (req, res) => {
    try {
      const user = await requireAccountUser(req, res);
      if (!user) return;
      await ensureSchema();

      const result = await query(`
        select content_key, payload, client_updated_at, updated_at
        from user_content_snapshots
        where user_id = $1
        order by updated_at desc
      `, [String(user.id)]);

      res.json({ records: result.rows.map(formatRow) });
    } catch (error) {
      console.error('Account content load failed:', error);
      res.status(500).json({ error: 'Unable to load account learning data.' });
    }
  });

  app.put('/api/account/content-sync/:contentKey', async (req, res) => {
    try {
      const user = await requireAccountUser(req, res);
      if (!user) return;
      await ensureSchema();

      const key = allowedContentKey(req.params.contentKey);
      if (!key) return res.status(400).json({ error: 'Unsupported account content key.' });

      const payload = validatePayload(req.body?.payload);
      const clientUpdatedAt = normalizeClientUpdatedAt(req.body?.clientUpdatedAt);

      const result = await query(`
        insert into user_content_snapshots
          (user_id, content_key, payload, client_updated_at, created_at, updated_at)
        values ($1, $2, $3::jsonb, $4::timestamptz, now(), now())
        on conflict (user_id, content_key) do update set
          payload = excluded.payload,
          client_updated_at = excluded.client_updated_at,
          updated_at = now()
        where user_content_snapshots.client_updated_at <= excluded.client_updated_at
        returning content_key, payload, client_updated_at, updated_at
      `, [String(user.id), key, payload.serialized, clientUpdatedAt]);

      if (result.rows[0]) {
        return res.json({ record: formatRow(result.rows[0]), bytes: payload.bytes });
      }

      const current = await query(`
        select content_key, payload, client_updated_at, updated_at
        from user_content_snapshots
        where user_id = $1 and content_key = $2
      `, [String(user.id), key]);

      res.json({
        record: current.rows[0] ? formatRow(current.rows[0]) : null,
        staleWriteIgnored: true
      });
    } catch (error) {
      const status = Number(error.status) || (/too large/i.test(error.message) ? 413 : 500);
      console.error('Account content save failed:', error);
      res.status(status).json({
        error: status >= 500 ? 'Unable to save account learning data.' : error.message
      });
    }
  });

  app.delete('/api/account/content-sync/:contentKey', async (req, res) => {
    try {
      const user = await requireAccountUser(req, res);
      if (!user) return;
      await ensureSchema();

      const key = allowedContentKey(req.params.contentKey);
      if (!key) return res.status(400).json({ error: 'Unsupported account content key.' });

      const result = await query(`
        delete from user_content_snapshots
        where user_id = $1 and content_key = $2
        returning content_key
      `, [String(user.id), key]);

      res.json({ deleted: Boolean(result.rows[0]), key });
    } catch (error) {
      console.error('Account content delete failed:', error);
      res.status(500).json({ error: 'Unable to delete account learning data.' });
    }
  });

  console.log('[cloud-sync bootstrap] Account content routes registered.');
};
