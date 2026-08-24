'use strict';

/*
 * Mark, Set, Go! beta feedback API.
 * Additive module: does not touch the reader engine or reader state.
 *
 * Required Render environment variables for admin access:
 *   BETA_ADMIN_EMAILS=your-admin-email@example.com
 * and/or
 *   BETA_ADMIN_USER_IDS=user_...
 */
module.exports = function installBetaFeedback({
  app,
  query,
  requireAccountUser,
  clerkConfigured,
  getAuth,
  clerkClient
}) {
  const ADMIN_EMAILS = new Set(
    String(process.env.BETA_ADMIN_EMAILS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  const ADMIN_USER_IDS = new Set(
    String(process.env.BETA_ADMIN_USER_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );

  const allowedTypes = new Set(['bug', 'feature', 'general']);
  const allowedStatuses = new Set(['new', 'reviewing', 'planned', 'in_progress', 'completed', 'closed']);
  const allowedPriorities = new Set(['low', 'normal', 'high', 'critical']);

  function clean(value, max = 1000) {
    return String(value ?? '').trim().slice(0, max);
  }

  function parseScreenshot(dataUrl) {
    const value = String(dataUrl || '');
    if (!value) return { mime: null, bytes: null };
    const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i);
    if (!match) throw new Error('Screenshot must be a PNG, JPEG, or WEBP image.');
    const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    if (!bytes.length) throw new Error('Screenshot is empty.');
    if (bytes.length > 5 * 1024 * 1024) throw new Error('Screenshot must be 5 MB or smaller.');
    return { mime: match[1].toLowerCase(), bytes };
  }

  async function adminIdentity(req) {
    if (!clerkConfigured) return { admin: false };
    const auth = getAuth(req);
    if (!auth?.isAuthenticated || !auth.userId) return { admin: false };

    if (ADMIN_USER_IDS.has(auth.userId)) {
      return { admin: true, userId: auth.userId, email: '' };
    }

    if (!ADMIN_EMAILS.size) return { admin: false, userId: auth.userId, email: '' };

    const clerkUser = await clerkClient.users.getUser(auth.userId);
    const email = clerkUser.emailAddresses?.find(
      (entry) => entry.id === clerkUser.primaryEmailAddressId
    )?.emailAddress || clerkUser.emailAddresses?.[0]?.emailAddress || '';

    return {
      admin: ADMIN_EMAILS.has(String(email).trim().toLowerCase()),
      userId: auth.userId,
      email
    };
  }

  async function requireAdmin(req, res) {
    try {
      const identity = await adminIdentity(req);
      if (!identity.admin) {
        res.status(403).json({ error: 'Administrator access is required.' });
        return null;
      }
      return identity;
    } catch (error) {
      console.error('Beta feedback admin check failed:', error);
      res.status(500).json({ error: 'Unable to verify administrator access.' });
      return null;
    }
  }

  app.get('/api/beta-feedback/admin-status', async (req, res) => {
    try {
      const identity = await adminIdentity(req);
      res.json({ admin: Boolean(identity.admin) });
    } catch (error) {
      console.error('Beta admin status failed:', error);
      res.json({ admin: false });
    }
  });

  app.post('/api/beta-feedback', async (req, res) => {
    try {
      const user = await requireAccountUser(req, res);
      if (!user) return;

      const type = allowedTypes.has(req.body?.type) ? req.body.type : 'bug';
      const title = clean(req.body?.title, 180);
      const description = clean(req.body?.description, 12000);
      if (!description) return res.status(400).json({ error: 'Describe the issue or request.' });

      const screenshot = parseScreenshot(req.body?.screenshotDataUrl);
      const metadata = {
        url: clean(req.body?.url, 3000),
        viewKey: clean(req.body?.viewKey, 300),
        userAgent: clean(req.body?.userAgent, 1200),
        viewport: clean(req.body?.viewport, 120),
        appVersion: clean(req.body?.appVersion, 120),
        captureMethod: clean(req.body?.captureMethod, 80)
      };

      const result = await query(`
        insert into beta_feedback
          (user_id, feedback_type, title, description, status, priority,
           screenshot_mime, screenshot_bytes, metadata, created_at, updated_at)
        values ($1, $2, $3, $4, 'new', 'normal', $5, $6, $7::jsonb, now(), now())
        returning id, feedback_type, title, description, status, priority,
                  (screenshot_bytes is not null) as has_screenshot, created_at
      `, [
        user.id,
        type,
        title || null,
        description,
        screenshot.mime,
        screenshot.bytes,
        JSON.stringify(metadata)
      ]);

      res.status(201).json({ feedback: result.rows[0] });
    } catch (error) {
      const status = /5 MB|Screenshot|too large/i.test(error.message) ? 413 : 500;
      console.error('Beta feedback submit failed:', error);
      res.status(status).json({
        error: status === 413 ? error.message : 'Unable to save the report.'
      });
    }
  });

  app.get('/api/admin/beta-feedback', async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const status = clean(req.query?.status, 40);
      const type = clean(req.query?.type, 40);
      const search = clean(req.query?.q, 200);
      const params = [];
      const clauses = [];

      if (status && allowedStatuses.has(status)) {
        params.push(status);
        clauses.push(`f.status = $${params.length}`);
      }
      if (type && allowedTypes.has(type)) {
        params.push(type);
        clauses.push(`f.feedback_type = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        clauses.push(`(coalesce(f.title,'') ilike $${params.length} or f.description ilike $${params.length})`);
      }

      const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
      const result = await query(`
        select f.id, f.feedback_type, f.title, f.description, f.status, f.priority,
               f.admin_notes, f.metadata, f.created_at, f.updated_at,
               (f.screenshot_bytes is not null) as has_screenshot,
               u.email as reporter_email, u.display_name as reporter_name
        from beta_feedback f
        join app_users u on u.id = f.user_id
        ${where}
        order by
          case f.priority when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
          f.created_at desc
        limit 500
      `, params);

      res.json({ feedback: result.rows });
    } catch (error) {
      console.error('Beta feedback admin list failed:', error);
      res.status(500).json({ error: 'Unable to load beta feedback.' });
    }
  });

  app.get('/api/admin/beta-feedback/:id/screenshot', async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const result = await query(
        'select screenshot_mime, screenshot_bytes from beta_feedback where id = $1',
        [req.params.id]
      );
      const row = result.rows[0];
      if (!row?.screenshot_bytes) return res.status(404).send('Screenshot not found.');
      res.setHeader('Content-Type', row.screenshot_mime || 'image/png');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(row.screenshot_bytes);
    } catch (error) {
      console.error('Beta feedback screenshot failed:', error);
      res.status(500).json({ error: 'Unable to load screenshot.' });
    }
  });

  app.delete('/api/admin/beta-feedback/:id', async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const result = await query(
        'delete from beta_feedback where id = $1 returning id',
        [req.params.id]
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'Feedback item not found.' });
      res.json({ deleted: true, id: result.rows[0].id });
    } catch (error) {
      console.error('Beta feedback delete failed:', error);
      res.status(500).json({ error: 'Unable to delete feedback.' });
    }
  });

  app.patch('/api/admin/beta-feedback/:id', async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const status = allowedStatuses.has(req.body?.status) ? req.body.status : null;
      const priority = allowedPriorities.has(req.body?.priority) ? req.body.priority : null;
      const adminNotes = req.body?.adminNotes == null ? null : clean(req.body.adminNotes, 12000);

      const result = await query(`
        update beta_feedback
        set status = coalesce($2, status),
            priority = coalesce($3, priority),
            admin_notes = case when $4::text is null then admin_notes else $4 end,
            updated_at = now()
        where id = $1
        returning id, feedback_type, title, description, status, priority,
                  admin_notes, metadata, created_at, updated_at,
                  (screenshot_bytes is not null) as has_screenshot
      `, [req.params.id, status, priority, adminNotes]);

      if (!result.rows[0]) return res.status(404).json({ error: 'Feedback item not found.' });
      res.json({ feedback: result.rows[0] });
    } catch (error) {
      console.error('Beta feedback update failed:', error);
      res.status(500).json({ error: 'Unable to update feedback.' });
    }
  });
};
