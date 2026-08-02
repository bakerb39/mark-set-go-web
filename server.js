'use strict';

const express = require('express');
const cheerio = require('cheerio');
const dns = require('node:dns').promises;
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { pool, checkDatabase, databaseConfigured, closeDatabase, query } = require('./db');

const CLERK_PUBLISHABLE_KEY = String(process.env.CLERK_PUBLISHABLE_KEY || '').trim();
const CLERK_SECRET_KEY = String(process.env.CLERK_SECRET_KEY || '').trim();
const clerkConfigured = Boolean(CLERK_PUBLISHABLE_KEY && CLERK_SECRET_KEY);
const BETA_ACCESS_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.BETA_ACCESS_ENABLED || '').trim());
const BETA_ALLOWED_EMAILS = new Set(String(process.env.BETA_ALLOWED_EMAILS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
const BETA_ALLOWED_USER_IDS = new Set(String(process.env.BETA_ALLOWED_USER_IDS || '').split(',').map((value) => value.trim()).filter(Boolean));
let clerkMiddleware = null;
let getAuth = null;
let clerkClient = null;
if (clerkConfigured) {
  ({ clerkMiddleware, getAuth, clerkClient } = require('@clerk/express'));
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_TRANSLATION_CHARS = 120000;
const MAX_GUTENBERG_BOOK_BYTES = 12 * 1024 * 1024;
const GUTENDEX_BASE = 'https://gutendex.com';
const GUTENBERG_MIRROR_BASES = (process.env.GUTENBERG_MIRROR_BASES || process.env.GUTENBERG_MIRROR_BASE || 'https://gutenberg.pglaf.org,https://mirrors.xmission.com/gutenberg').split(',').map((value) => value.trim().replace(/\/+$/, '')).filter(Boolean);

const CURRENT_READING_SOURCES = [
  { id: 'bbc-world', category: 'news', name: 'BBC World News', description: 'World headlines from BBC News.', feedUrl: 'https://feeds.bbci.co.uk/news/world/rss.xml', siteUrl: 'https://www.bbc.com/news/world' },
  { id: 'bbc-us-canada', category: 'news', name: 'BBC US & Canada', description: 'United States and Canada headlines from BBC News.', feedUrl: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', siteUrl: 'https://www.bbc.com/news/world/us_and_canada' },
  { id: 'npr-news', category: 'news', name: 'NPR News', description: 'Top news stories and analysis from NPR.', feedUrl: 'https://feeds.npr.org/1001/rss.xml', siteUrl: 'https://www.npr.org/sections/news/' },
  { id: 'bbc-sport', category: 'sports', name: 'BBC Sport', description: 'Major sports headlines and results.', feedUrl: 'https://feeds.bbci.co.uk/sport/rss.xml?edition=us', siteUrl: 'https://www.bbc.com/sport' },
  { id: 'espn-top', category: 'sports', name: 'ESPN Top Headlines', description: 'Top sports headlines supplied by ESPN.', feedUrl: 'https://www.espn.com/espn/rss/news', siteUrl: 'https://www.espn.com/' },
  { id: 'archaeology', category: 'interests', name: 'Archaeology', description: 'Recent archaeology stories from Google News.', feedUrl: 'https://news.google.com/rss/search?q=archaeology&hl=en-US&gl=US&ceid=US:en', siteUrl: 'https://news.google.com/search?q=archaeology' },
  { id: 'biblical-archaeology', category: 'interests', name: 'Biblical Archaeology', description: 'Recent biblical archaeology stories.', feedUrl: 'https://news.google.com/rss/search?q=%22biblical+archaeology%22&hl=en-US&gl=US&ceid=US:en', siteUrl: 'https://news.google.com/search?q=biblical%20archaeology' },
  { id: 'history', category: 'interests', name: 'History', description: 'Recent history and historical-discovery stories.', feedUrl: 'https://news.google.com/rss/search?q=history+historical+discovery&hl=en-US&gl=US&ceid=US:en', siteUrl: 'https://news.google.com/search?q=history' },
  { id: 'fly-fishing', category: 'interests', name: 'Fly Fishing', description: 'Fly-fishing news, techniques, and destinations.', feedUrl: 'https://news.google.com/rss/search?q=%22fly+fishing%22&hl=en-US&gl=US&ceid=US:en', siteUrl: 'https://news.google.com/search?q=fly%20fishing' },
  { id: 'outdoors', category: 'interests', name: 'Outdoors', description: 'Outdoor recreation, parks, hiking, and conservation.', feedUrl: 'https://news.google.com/rss/search?q=outdoor+recreation+parks+hiking&hl=en-US&gl=US&ceid=US:en', siteUrl: 'https://news.google.com/search?q=outdoor%20recreation' },
  { id: 'astronomy', category: 'interests', name: 'Astronomy & Space', description: 'Astronomy, space science, and exploration.', feedUrl: 'https://news.google.com/rss/search?q=astronomy+space+science&hl=en-US&gl=US&ceid=US:en', siteUrl: 'https://news.google.com/search?q=astronomy' },
  { id: 'ai-ml', category: 'interests', name: 'AI & Machine Learning', description: 'Artificial intelligence and machine-learning developments.', feedUrl: 'https://news.google.com/rss/search?q=%22artificial+intelligence%22+machine+learning&hl=en-US&gl=US&ceid=US:en', siteUrl: 'https://news.google.com/search?q=artificial%20intelligence' },
  { id: 'books', category: 'interests', name: 'Books & Literary Culture', description: 'Books, authors, criticism, and literary culture.', feedUrl: 'https://news.google.com/rss/search?q=books+literary+criticism+authors&hl=en-US&gl=US&ceid=US:en', siteUrl: 'https://news.google.com/search?q=books%20literary%20criticism' }
];

function stripMarkup(value) {
  const $ = cheerio.load(`<div>${String(value || '')}</div>`);
  return $('div').text().replace(/\s+/g, ' ').trim();
}

async function fetchFeedItems(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(source.feedUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'MarkSetGoWeb/1.4 (+RSS reader)', Accept: 'application/rss+xml,application/atom+xml,text/xml,*/*;q=0.1' }
    });
    if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}.`);
    const xml = await response.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const nodes = $('item, entry').toArray().slice(0, 30);
    return nodes.map((node) => {
      const item = $(node);
      const atomLink = item.find('link[rel="alternate"]').attr('href') || item.find('link').attr('href');
      const rssLink = item.find('link').first().text().trim();
      const link = atomLink || rssLink || item.find('guid').first().text().trim();
      const title = stripMarkup(item.find('title').first().text()) || 'Untitled article';
      const description = item.find('description').first().text() || item.find('summary').first().text() || item.find('content\:encoded').first().text() || item.find('content').first().text();
      const published = item.find('pubDate').first().text() || item.find('published').first().text() || item.find('updated').first().text();
      return { title, link, summary: stripMarkup(description).slice(0, 1800), published };
    }).filter((item) => item.link && /^https?:\/\//i.test(item.link));
  } finally {
    clearTimeout(timeout);
  }
}


app.disable('x-powered-by');
app.use(express.json({ limit: '150kb' }));
if (clerkConfigured) app.use(clerkMiddleware());


app.get('/api/auth/config', (_req, res) => {
  res.json({
    configured: clerkConfigured,
    publishableKey: clerkConfigured ? CLERK_PUBLISHABLE_KEY : '',
    provider: 'clerk',
    betaAccessEnabled: BETA_ACCESS_ENABLED
  });
});

function betaAccessFor(authSubject, email) {
  if (!BETA_ACCESS_ENABLED) return { enabled: false, granted: true };
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const granted = BETA_ALLOWED_USER_IDS.has(String(authSubject || '')) || (normalizedEmail && BETA_ALLOWED_EMAILS.has(normalizedEmail));
  return { enabled: true, granted: Boolean(granted) };
}

function unauthenticatedSession() {
  return { authenticated: false, user: null, planCode: 'guest', betaAccess: { enabled: BETA_ACCESS_ENABLED, granted: false } };
}

app.get('/api/auth/session', async (req, res) => {
  if (!clerkConfigured) return res.json({ ...unauthenticatedSession(), configured: false });
  const auth = getAuth(req);
  if (!auth?.isAuthenticated || !auth.userId) return res.json({ ...unauthenticatedSession(), configured: true });
  if (!databaseConfigured()) return res.status(503).json({ error: 'The account database is not configured.' });

  try {
    const clerkUser = await clerkClient.users.getUser(auth.userId);
    const primaryEmail = clerkUser.emailAddresses?.find((entry) => entry.id === clerkUser.primaryEmailAddressId)?.emailAddress
      || clerkUser.emailAddresses?.[0]?.emailAddress
      || null;
    const displayName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim()
      || clerkUser.username
      || primaryEmail
      || 'Reader';
    const result = await query(`
      insert into app_users (auth_provider, auth_subject, email, display_name, last_seen_at, updated_at)
      values ('clerk', $1, $2, $3, now(), now())
      on conflict (auth_subject) do update set
        email = excluded.email,
        display_name = excluded.display_name,
        last_seen_at = now(),
        updated_at = now()
      returning id, email, display_name, plan_code, status, created_at
    `, [auth.userId, primaryEmail, displayName]);
    const user = result.rows[0];
    res.json({
      configured: true,
      authenticated: true,
      user: {
        id: user.id,
        authSubject: auth.userId,
        email: user.email,
        displayName: user.display_name,
        planCode: user.plan_code,
        status: user.status,
        createdAt: user.created_at
      },
      planCode: user.plan_code,
      betaAccess: betaAccessFor(auth.userId, user.email)
    });
  } catch (error) {
    console.error('Authentication session sync failed:', error);
    res.status(500).json({ error: 'Unable to load the signed-in account.' });
  }
});

app.get('/api/account', async (req, res) => {
  if (!clerkConfigured) return res.status(503).json({ error: 'Authentication is not configured.' });
  const auth = getAuth(req);
  if (!auth?.isAuthenticated || !auth.userId) return res.status(401).json({ error: 'Sign in is required.' });
  const result = await query('select id, email, display_name, plan_code, status, created_at, last_seen_at from app_users where auth_subject = $1', [auth.userId]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Account profile has not been initialized.' });
  res.json({ account: result.rows[0] });
});

app.get('/api/health', async (_req, res) => {
  try {
    const database = await checkDatabase();
    res.json({ ok: true, version: '7.7.13', database, betaAccessEnabled: BETA_ACCESS_ENABLED });
  } catch (error) {
    res.status(503).json({ ok: false, version: '7.7.13', database: { configured: databaseConfigured(), connected: false, error: error.message }, betaAccessEnabled: BETA_ACCESS_ENABLED });
  }
});

// While private beta access is enabled, protect every application API after the
// public health/config/session endpoints. The browser gate improves UX; this
// middleware is the actual server-side enforcement boundary.
app.use('/api', async (req, res, next) => {
  if (!BETA_ACCESS_ENABLED) return next();
  if (!clerkConfigured) return res.status(503).json({ error: 'Beta access requires Clerk authentication.' });
  const auth = getAuth(req);
  if (!auth?.isAuthenticated || !auth.userId) return res.status(401).json({ error: 'Sign in is required during the private beta.' });
  try {
    const clerkUser = await clerkClient.users.getUser(auth.userId);
    const email = clerkUser.emailAddresses?.find((entry) => entry.id === clerkUser.primaryEmailAddressId)?.emailAddress
      || clerkUser.emailAddresses?.[0]?.emailAddress
      || '';
    if (!betaAccessFor(auth.userId, email).granted) return res.status(403).json({ error: 'This account is not approved for the private beta.' });
    next();
  } catch (error) {
    console.error('Beta access check failed:', error);
    res.status(500).json({ error: 'Unable to verify beta access.' });
  }
});


/* Cloud-first account data v7.7.13 ---------------------------------------
   PostgreSQL is the persistent source of truth for authenticated users.
   The protected reader runtime is not modified here. Playback cursor and
   viewport anchor are persisted as independent values.
*/
function clampInteger(value, minimum = 0, maximum = 2147483647) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return minimum;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function cleanText(value, maximum = 500) {
  return String(value ?? '').trim().slice(0, maximum);
}

function cleanJsonObject(value, maximumBytes = 50000) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > maximumBytes) throw new Error('JSON payload is too large.');
  return value;
}

async function requireAccountUser(req, res) {
  if (!clerkConfigured) {
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

app.get('/api/account/bootstrap', async (req, res) => {
  try {
    const user = await requireAccountUser(req, res);
    if (!user) return;
    const [preferencesResult, booksResult] = await Promise.all([
      query('select preferences, updated_at from user_preferences where user_id = $1', [user.id]),
      query(`
        select b.id, b.client_record_id, b.title, b.author, b.source_type, b.source_id,
               b.source_url, b.cover_url, b.metadata, b.added_at, b.updated_at,
               p.mode, p.playback_index, p.viewport_anchor_index, p.viewport_offset_px,
               p.word_index, p.scroll_ratio, p.page_number, p.position_data,
               p.updated_at as progress_updated_at
        from library_books b
        left join reading_positions p on p.user_id = b.user_id and p.book_id = b.id
        where b.user_id = $1
        order by coalesce(p.updated_at, b.updated_at) desc
      `, [user.id])
    ]);
    res.json({
      account: { id: user.id, email: user.email, displayName: user.display_name, planCode: user.plan_code },
      preferences: preferencesResult.rows[0]?.preferences || {},
      preferencesUpdatedAt: preferencesResult.rows[0]?.updated_at || null,
      library: booksResult.rows
    });
  } catch (error) {
    console.error('Account bootstrap failed:', error);
    res.status(500).json({ error: 'Unable to load account data.' });
  }
});

app.get('/api/account/preferences', async (req, res) => {
  try {
    const user = await requireAccountUser(req, res);
    if (!user) return;
    const result = await query('select preferences, updated_at from user_preferences where user_id = $1', [user.id]);
    res.json({ preferences: result.rows[0]?.preferences || {}, updatedAt: result.rows[0]?.updated_at || null });
  } catch (error) {
    console.error('Preference load failed:', error);
    res.status(500).json({ error: 'Unable to load preferences.' });
  }
});

app.put('/api/account/preferences', async (req, res) => {
  try {
    const user = await requireAccountUser(req, res);
    if (!user) return;
    const preferences = cleanJsonObject(req.body?.preferences, 75000);
    const result = await query(`
      insert into user_preferences (user_id, preferences, created_at, updated_at)
      values ($1, $2::jsonb, now(), now())
      on conflict (user_id) do update set preferences = excluded.preferences, updated_at = now()
      returning preferences, updated_at
    `, [user.id, JSON.stringify(preferences)]);
    res.json({ preferences: result.rows[0].preferences, updatedAt: result.rows[0].updated_at });
  } catch (error) {
    const status = /too large/i.test(error.message) ? 413 : 500;
    console.error('Preference save failed:', error);
    res.status(status).json({ error: status === 413 ? error.message : 'Unable to save preferences.' });
  }
});

app.get('/api/account/library', async (req, res) => {
  try {
    const user = await requireAccountUser(req, res);
    if (!user) return;
    const result = await query(`
      select b.id, b.client_record_id, b.title, b.author, b.source_type, b.source_id,
             b.source_url, b.cover_url, b.metadata, b.added_at, b.updated_at,
             p.mode, p.playback_index, p.viewport_anchor_index, p.viewport_offset_px,
             p.word_index, p.scroll_ratio, p.page_number, p.position_data,
             p.updated_at as progress_updated_at
      from library_books b
      left join reading_positions p on p.user_id = b.user_id and p.book_id = b.id
      where b.user_id = $1
      order by coalesce(p.updated_at, b.updated_at) desc
    `, [user.id]);
    res.json({ books: result.rows });
  } catch (error) {
    console.error('Library load failed:', error);
    res.status(500).json({ error: 'Unable to load the library.' });
  }
});

app.post('/api/account/library', async (req, res) => {
  try {
    const user = await requireAccountUser(req, res);
    if (!user) return;
    const title = cleanText(req.body?.title, 500);
    if (!title) return res.status(400).json({ error: 'A book title is required.' });
    const clientRecordId = cleanText(req.body?.clientRecordId, 200) || null;
    const metadata = cleanJsonObject(req.body?.metadata, 100000);
    const result = await query(`
      insert into library_books
        (user_id, client_record_id, title, author, source_type, source_id, source_url, cover_url, metadata, added_at, updated_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now(), now())
      on conflict (user_id, client_record_id) do update set
        title = excluded.title,
        author = excluded.author,
        source_type = excluded.source_type,
        source_id = excluded.source_id,
        source_url = excluded.source_url,
        cover_url = excluded.cover_url,
        metadata = excluded.metadata,
        updated_at = now()
      returning *
    `, [
      user.id, clientRecordId, title, cleanText(req.body?.author, 300) || null,
      cleanText(req.body?.sourceType, 80) || null, cleanText(req.body?.sourceId, 300) || null,
      cleanText(req.body?.sourceUrl, 2000) || null, cleanText(req.body?.coverUrl, 2000) || null,
      JSON.stringify(metadata)
    ]);
    res.status(201).json({ book: result.rows[0] });
  } catch (error) {
    const status = /too large/i.test(error.message) ? 413 : 500;
    console.error('Library save failed:', error);
    res.status(status).json({ error: status === 413 ? error.message : 'Unable to save the book.' });
  }
});

app.delete('/api/account/library/:bookId', async (req, res) => {
  try {
    const user = await requireAccountUser(req, res);
    if (!user) return;
    const result = await query('delete from library_books where id = $1 and user_id = $2 returning id', [req.params.bookId, user.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Book not found.' });
    res.json({ deleted: true, bookId: result.rows[0].id });
  } catch (error) {
    console.error('Library delete failed:', error);
    res.status(500).json({ error: 'Unable to delete the book.' });
  }
});

app.get('/api/account/library/:bookId/progress', async (req, res) => {
  try {
    const user = await requireAccountUser(req, res);
    if (!user) return;
    const result = await query(`
      select mode, playback_index, viewport_anchor_index, viewport_offset_px,
             word_index, scroll_ratio, page_number, position_data, updated_at
      from reading_positions where user_id = $1 and book_id = $2
    `, [user.id, req.params.bookId]);
    res.json({ progress: result.rows[0] || null });
  } catch (error) {
    console.error('Reading progress load failed:', error);
    res.status(500).json({ error: 'Unable to load reading progress.' });
  }
});

app.put('/api/account/library/:bookId/progress', async (req, res) => {
  const client = await pool?.connect().catch(() => null);
  try {
    const user = await requireAccountUser(req, res);
    if (!user) return;
    if (!client) return res.status(503).json({ error: 'The account database is unavailable.' });
    const bookCheck = await client.query('select id from library_books where id = $1 and user_id = $2', [req.params.bookId, user.id]);
    if (!bookCheck.rows[0]) return res.status(404).json({ error: 'Book not found.' });

    const playbackIndex = clampInteger(req.body?.playbackIndex ?? req.body?.wordIndex);
    const viewportAnchorIndex = clampInteger(req.body?.viewportAnchorIndex ?? playbackIndex);
    const viewportOffsetPx = clampInteger(req.body?.viewportOffsetPx, -100000, 100000);
    const positionData = cleanJsonObject(req.body?.positionData, 75000);
    const scrollRatioRaw = Number(req.body?.scrollRatio);
    const scrollRatio = Number.isFinite(scrollRatioRaw) ? Math.max(0, Math.min(1, scrollRatioRaw)) : 0;
    const pageNumber = req.body?.pageNumber == null ? null : clampInteger(req.body.pageNumber, 1);

    const result = await client.query(`
      insert into reading_positions
        (user_id, book_id, mode, word_index, playback_index, viewport_anchor_index,
         viewport_offset_px, scroll_ratio, page_number, position_data, updated_at)
      values ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9::jsonb, now())
      on conflict (user_id, book_id) do update set
        mode = excluded.mode,
        word_index = excluded.word_index,
        playback_index = excluded.playback_index,
        viewport_anchor_index = excluded.viewport_anchor_index,
        viewport_offset_px = excluded.viewport_offset_px,
        scroll_ratio = excluded.scroll_ratio,
        page_number = excluded.page_number,
        position_data = excluded.position_data,
        updated_at = now()
      returning mode, playback_index, viewport_anchor_index, viewport_offset_px,
                word_index, scroll_ratio, page_number, position_data, updated_at
    `, [
      user.id, req.params.bookId, cleanText(req.body?.mode, 80) || null,
      playbackIndex, viewportAnchorIndex, viewportOffsetPx, scrollRatio, pageNumber,
      JSON.stringify(positionData)
    ]);
    res.json({ progress: result.rows[0] });
  } catch (error) {
    const status = /too large/i.test(error.message) ? 413 : 500;
    console.error('Reading progress save failed:', error);
    res.status(status).json({ error: status === 413 ? error.message : 'Unable to save reading progress.' });
  } finally {
    client?.release();
  }
});


/* Email delivery v7.5.1 ----------------------------------------------------
   Provider: Resend. Configure RESEND_API_KEY, EMAIL_FROM, and PUBLIC_APP_URL.
   This local-first prototype keeps subscriptions in server memory; production
   should replace the Map with PostgreSQL before relying on durable delivery.
*/
const emailSubscriptions = new Map();
const emailRateLimits = new Map();
const EMAIL_FROM = String(process.env.EMAIL_FROM || 'Mark, Set, Go! <onboarding@resend.dev>').trim();
const PUBLIC_APP_URL = String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');

function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()); }
function emailConfigured() { return Boolean(String(process.env.RESEND_API_KEY || '').trim()); }
function rateLimitEmail(req, key, limit = 8, windowMs = 3600000) {
  const id = `${req.ip}|${key}`; const now = Date.now();
  const recent = (emailRateLimits.get(id) || []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now); emailRateLimits.set(id, recent); return true;
}
function escapeEmail(value) { return String(value || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function sendResendEmail({ to, subject, html, text }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) throw new Error('Email is not configured. Add RESEND_API_KEY.');
  const response = await fetch('https://api.resend.com/emails', { method:'POST', headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' }, body:JSON.stringify({ from:EMAIL_FROM, to:[to], subject, html, text }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || `Email provider returned HTTP ${response.status}.`);
  return payload;
}
function unsubscribeUrl(clientId) { return PUBLIC_APP_URL ? `${PUBLIC_APP_URL}/api/email/unsubscribe?clientId=${encodeURIComponent(clientId)}` : ''; }
function emailFrame(title, body, clientId) {
  const unsub = unsubscribeUrl(clientId);
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f7f6;padding:24px"><main style="max-width:620px;margin:auto;background:white;border-radius:14px;padding:28px"><h1 style="font-size:24px">${escapeEmail(title)}</h1>${body}<hr style="border:0;border-top:1px solid #ddd;margin:28px 0"><p style="font-size:12px;color:#666">Mark, Set, Go!${unsub ? ` · <a href="${unsub}">Unsubscribe</a>` : ''}</p></main></body></html>`;
}

app.get('/api/email/status', (_req, res) => res.json({ configured:emailConfigured(), provider:'Resend', from:EMAIL_FROM, durable:false }));
app.post('/api/email/preferences', (req, res) => {
  const clientId=String(req.body?.clientId||'').trim().slice(0,100); const email=String(req.body?.email||'').trim().toLowerCase();
  if (!clientId || !validEmail(email)) return res.status(400).json({error:'Enter a valid email address.'});
  const record={ ...(emailSubscriptions.get(clientId)||{}), clientId, email, newsletter:Boolean(req.body?.newsletter), reminders:Boolean(req.body?.reminders), notes:Boolean(req.body?.notes), notesFrequency:['daily','weekly','monthly'].includes(req.body?.notesFrequency)?req.body.notesFrequency:'weekly', timezone:String(req.body?.timezone||'America/New_York').slice(0,80), active:true, updatedAt:new Date().toISOString() };
  emailSubscriptions.set(clientId, record); res.json({ok:true, configured:emailConfigured(), preferences:record});
});
app.post('/api/email/sync-actions', (req, res) => {
  const clientId=String(req.body?.clientId||'').trim().slice(0,100); const record=emailSubscriptions.get(clientId);
  if (!record?.active) return res.status(404).json({error:'Save email preferences first.'});
  record.actions=(Array.isArray(req.body?.actions)?req.body.actions:[]).slice(0,200).map(a=>({id:String(a.id||'').slice(0,100),title:String(a.title||'').slice(0,180),dueAt:a.dueAt||'',reminder:a.reminder||'none',status:a.status||'active',sourceTitle:String(a.sourceTitle||'').slice(0,180),updatedAt:a.updatedAt||'',lastEmailSignature:a.lastEmailSignature||''}));
  record.updatedAt=new Date().toISOString(); emailSubscriptions.set(clientId,record); res.json({ok:true,count:record.actions.length});
});
app.post('/api/email/test', async (req,res)=>{
  const clientId=String(req.body?.clientId||'').trim().slice(0,100); const record=emailSubscriptions.get(clientId);
  if (!record?.active) return res.status(404).json({error:'Save email preferences first.'});
  if (!rateLimitEmail(req,`test:${record.email}`,3)) return res.status(429).json({error:'Too many test emails. Try again later.'});
  try { await sendResendEmail({to:record.email,subject:'Your Mark, Set, Go! email is ready',html:emailFrame('Email notifications are ready','<p>You can now receive reading reminders, newsletter updates, and scheduled notes according to your preferences.</p>',clientId),text:'Your Mark, Set, Go! email notifications are ready.'}); res.json({ok:true}); }
  catch(error){ res.status(503).json({error:error.message}); }
});
function normalizeEmailNotes(input) {
  return (Array.isArray(input) ? input : []).slice(0, 200).map((note, index) => {
    const body = String(note?.body || note?.note || note?.text || note?.selection || note?.result?.response || '').trim();
    return {
      id: String(note?.id || `email-note-${index}`).slice(0, 120),
      title: String(note?.title || note?.documentTitle || 'Reading note').trim().slice(0, 220),
      body: body.slice(0, 12000),
      context: String(note?.context || note?.chapter || note?.pageContext || note?.word || '').trim().slice(0, 500),
      type: String(note?.type || note?.recordType || 'note').trim().slice(0, 60),
      updatedAt: String(note?.updatedAt || note?.createdAt || new Date().toISOString()).slice(0, 50)
    };
  }).filter((note) => note.body);
}
function notesEmailContent(notes) {
  const items = notes.map((note) => `<li style="margin-bottom:18px"><strong>${escapeEmail(note.title)}</strong>${note.context ? `<div style="font-size:12px;color:#667;margin:3px 0 7px">${escapeEmail(note.context)}</div>` : ''}<div style="white-space:pre-wrap">${escapeEmail(note.body)}</div></li>`).join('');
  const text = notes.map((note) => `${note.title}${note.context ? ` — ${note.context}` : ''}\n${note.body}`).join('\n\n---\n\n');
  return { html: `<p>Here are ${notes.length} saved ${notes.length === 1 ? 'note' : 'notes'}:</p><ol>${items}</ol>`, text };
}
app.post('/api/email/sync-notes', (req,res) => {
  const clientId=String(req.body?.clientId||'').trim().slice(0,100); const record=emailSubscriptions.get(clientId);
  if (!record?.active) return res.status(404).json({error:'Save email preferences first.'});
  record.notesData=normalizeEmailNotes(req.body?.notes);
  record.updatedAt=new Date().toISOString(); emailSubscriptions.set(clientId,record);
  res.json({ok:true,count:record.notesData.length});
});
app.post('/api/email/send-notes', async (req,res)=>{
  const clientId=String(req.body?.clientId||'').trim().slice(0,100); const record=emailSubscriptions.get(clientId);
  if (!record?.active || !record.notes) return res.status(400).json({error:'Notes email is not enabled.'});
  const notes=normalizeEmailNotes(req.body?.notes?.length ? req.body.notes : record.notesData);
  if (!notes.length) return res.status(400).json({error:'There are no note contents to email. Save a reader note or a Mark Notebook entry first.'});
  if (!rateLimitEmail(req,`notes:${record.email}`,8)) return res.status(429).json({error:'Too many note emails. Try again later.'});
  const content=notesEmailContent(notes);
  try { await sendResendEmail({to:record.email,subject:`Your ${notes.length} reading ${notes.length === 1 ? 'note' : 'notes'} from Mark, Set, Go!`,html:emailFrame('Your reading notes',content.html,clientId),text:content.text}); record.notesData=notes; record.lastNotesEmailAt=new Date().toISOString(); res.json({ok:true,count:notes.length}); }
  catch(error){ res.status(503).json({error:error.message}); }
});
app.post('/api/email/newsletter-preview', async (req,res)=>{
  const clientId=String(req.body?.clientId||'').trim().slice(0,100); const record=emailSubscriptions.get(clientId);
  if (!record?.active || !record.newsletter) return res.status(400).json({error:'Newsletter subscription is not enabled.'});
  if (!rateLimitEmail(req,`newsletter:${record.email}`,3)) return res.status(429).json({error:'Too many newsletter previews. Try again later.'});
  const body='<p>Your newsletter subscription is working.</p><p>Future editions can include reading progress, new Mark, Set, Go! features, recommended books, learning prompts, and practical ways to turn reading into action.</p><p><strong>This is a delivery preview, not a recurring published edition.</strong></p>';
  try { await sendResendEmail({to:record.email,subject:'Mark, Set, Go! newsletter preview',html:emailFrame('Newsletter preview',body,clientId),text:'Your Mark, Set, Go! newsletter subscription is working. This is a delivery preview, not a recurring published edition.'}); res.json({ok:true}); }
  catch(error){ res.status(503).json({error:error.message}); }
});
app.get('/api/email/unsubscribe', (req,res)=>{ const id=String(req.query.clientId||''); const record=emailSubscriptions.get(id); if(record){record.active=false;record.newsletter=false;record.reminders=false;record.notes=false;} res.type('html').send('<h1>You are unsubscribed</h1><p>You will no longer receive Mark, Set, Go! emails.</p>'); });

setInterval(async()=>{
  if(!emailConfigured()) return; const now=Date.now(); const offsets={at_time:0,min10:10,min30:30,hour1:60,day1:1440};
  for(const record of emailSubscriptions.values()){
    if(!record.active||!record.reminders) continue;
    for(const action of record.actions||[]){
      if(action.status==='completed'||!action.dueAt||action.reminder==='none') continue;
      const due=Date.parse(action.dueAt); if(!Number.isFinite(due)) continue;
      const notifyAt=due-(offsets[action.reminder]??0)*60000; const signature=`${action.id}|${action.dueAt}|${action.reminder}|${action.updatedAt}`;
      if(now<notifyAt||now-notifyAt>10*60000||action.lastEmailSignature===signature) continue;
      try { await sendResendEmail({to:record.email,subject:`Reminder: ${action.title}`,html:emailFrame('Reading action reminder',`<p><strong>${escapeEmail(action.title)}</strong></p><p>Due ${escapeEmail(new Date(due).toLocaleString())}${action.sourceTitle?` · ${escapeEmail(action.sourceTitle)}`:''}</p>`,record.clientId),text:`Reminder: ${action.title}. Due ${new Date(due).toLocaleString()}.`}); action.lastEmailSignature=signature; }
      catch(error){ console.error('Email reminder failed:',error.message); }
    }
  }
},60000).unref();


setInterval(async()=>{
  if(!emailConfigured()) return;
  const now=Date.now();
  const intervals={daily:24*60*60*1000,weekly:7*24*60*60*1000,monthly:30*24*60*60*1000};
  for(const record of emailSubscriptions.values()){
    if(!record.active||!record.notes||!record.notesData?.length) continue;
    const interval=intervals[record.notesFrequency]||intervals.weekly;
    const last=Date.parse(record.lastNotesDigestAt||record.updatedAt||0)||0;
    if(now-last<interval) continue;
    const changed=record.notesData.filter(note=>(Date.parse(note.updatedAt)||0)>last);
    const notes=changed.length?changed:record.notesData;
    const content=notesEmailContent(notes);
    try {
      await sendResendEmail({to:record.email,subject:`Your ${record.notesFrequency} reading notes digest`,html:emailFrame('Reading notes digest',content.html,record.clientId),text:content.text});
      record.lastNotesDigestAt=new Date().toISOString();
    } catch(error){ console.error('Notes digest email failed:',error.message); }
  }
},15*60*1000).unref();

const COMPREHENSION_MODEL = process.env.OPENAI_COMPREHENSION_MODEL || 'gpt-5.6-luna';

function extractOpenAIOutputText(payload) {
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return '';
}

app.post('/api/comprehension', async (req, res) => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(503).json({
      error: 'Comprehension AI is not configured. Add OPENAI_API_KEY to the server environment.'
    });
  }

  const passage = String(req.body?.passage || '').replace(/\s+/g, ' ').trim();
  const title = String(req.body?.title || 'Untitled reading').trim().slice(0, 300);
  const wordCount = passage ? passage.split(/\s+/).length : 0;

  if (wordCount < 120) {
    return res.status(400).json({ error: 'Read at least 120 words before starting a comprehension check.' });
  }
  if (wordCount > 1200 || passage.length > 12000) {
    return res.status(400).json({ error: 'The comprehension passage is too large.' });
  }

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        minItems: 4,
        maxItems: 4,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'question', 'choices', 'correctIndex', 'explanation'],
          properties: {
            type: { type: 'string', enum: ['recall', 'main_idea', 'inference', 'deeper_understanding'] },
            question: { type: 'string' },
            choices: {
              type: 'array',
              minItems: 4,
              maxItems: 4,
              items: { type: 'string' }
            },
            correctIndex: { type: 'integer', minimum: 0, maximum: 3 },
            explanation: { type: 'string' }
          }
        }
      }
    }
  };

  const prompt = `Create exactly four multiple-choice comprehension questions based ONLY on the supplied passage from "${title}".
The four question types must be, in this order: factual recall, main idea, inference, and deeper understanding.
Each question must be answerable from the passage itself. Do not rely on outside knowledge, later parts of the work, or facts not present in the passage.
Use plausible distractors. Keep explanations concise and cite the relevant idea from the passage without long quotation.`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: COMPREHENSION_MODEL,
        reasoning: { effort: 'low' },
        store: false,
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: prompt }] },
          { role: 'user', content: [{ type: 'input_text', text: passage }] }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'comprehension_quiz',
            strict: true,
            schema
          }
        }
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.error?.message || `OpenAI returned HTTP ${response.status}.`;
      console.error('Comprehension API error:', detail);
      return res.status(502).json({ error: 'Unable to generate comprehension questions.', detail });
    }

    const outputText = extractOpenAIOutputText(payload);
    if (!outputText) throw new Error('OpenAI returned no structured text output.');
    const quiz = JSON.parse(outputText);
    if (!Array.isArray(quiz.questions) || quiz.questions.length !== 4) throw new Error('Unexpected quiz structure.');

    res.json({
      title,
      wordCount,
      model: COMPREHENSION_MODEL,
      questions: quiz.questions
    });
  } catch (error) {
    console.error('Comprehension generation failed:', error);
    res.status(502).json({ error: 'Unable to generate comprehension questions.' });
  }
});



app.post('/api/reading-profile', async (req, res) => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(503).json({
      error: 'Reading Profile AI is not configured. Add OPENAI_API_KEY to the server environment.'
    });
  }

  const book = req.body?.book && typeof req.body.book === 'object' ? req.body.book : {};
  const localProfile = req.body?.localProfile && typeof req.body.localProfile === 'object'
    ? req.body.localProfile
    : {};
  const sample = String(req.body?.sample || '').replace(/\s+/g, ' ').trim().slice(0, 30000);

  const title = String(book.title || 'Untitled').trim().slice(0, 300);
  const author = String(book.author || '').trim().slice(0, 300);
  const description = String(book.description || '').trim().slice(0, 3000);
  const subjects = Array.isArray(book.subjects)
    ? book.subjects.slice(0, 20).map((item) => String(item).slice(0, 180))
    : String(book.subjects || '').split(/[,;|]/).slice(0, 20);

  if (!title && !sample) {
    return res.status(400).json({ error: 'A title or text sample is required.' });
  }

  const scoreProperty = { type: 'integer', minimum: 0, maximum: 100 };
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'textualDifficulty',
      'interpretationDifficulty',
      'contextualDifficulty',
      'literaryComplexity',
      'summary',
      'confidence',
      'evidence',
      'preparationTopics',
      'interpretiveFeatures',
      'cautions'
    ],
    properties: {
      textualDifficulty: scoreProperty,
      interpretationDifficulty: scoreProperty,
      contextualDifficulty: scoreProperty,
      literaryComplexity: scoreProperty,
      summary: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      evidence: {
        type: 'array',
        minItems: 4,
        maxItems: 10,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['dimension', 'finding', 'basis'],
          properties: {
            dimension: {
              type: 'string',
              enum: ['textual', 'interpretive', 'contextual', 'literary_structure']
            },
            finding: { type: 'string' },
            basis: {
              type: 'string',
              enum: ['text_sample', 'metadata', 'established_work_characteristic']
            }
          }
        }
      },
      preparationTopics: {
        type: 'array',
        minItems: 0,
        maxItems: 8,
        items: { type: 'string' }
      },
      interpretiveFeatures: {
        type: 'array',
        minItems: 0,
        maxItems: 8,
        items: { type: 'string' }
      },
      cautions: {
        type: 'array',
        minItems: 0,
        maxItems: 5,
        items: { type: 'string' }
      }
    }
  };

  const instructions = `You are evaluating a book's reading profile for an adult reading application.

Treat these as four separate constructs:
1. Textual difficulty: vocabulary, sentence syntax, grammar, and decoding effort.
2. Interpretive difficulty: ambiguity, implication, irony, symbolism, subtext, philosophical depth, and unstated meaning.
3. Contextual difficulty: historical, geographical, cultural, theological, scientific, political, or specialized knowledge expected.
4. Literary structure: chronology, narrators, viewpoints, character burden, framing, fragmentation, and formal experimentation.

Critical calibration rules:
- Never treat literary prestige, seriousness, profundity, or emotional power as evidence of difficult syntax.
- Never treat dialogue or quotation marks as narrative complexity.
- Direct, short prose may be accessible to read but challenging to interpret.
- Hemingway is a canonical example: generally direct vocabulary and syntax; interpretation may be harder because of omission, subtext, and the iceberg method.
- Do not invent textual evidence. Distinguish evidence from the supplied sample, metadata, and established characteristics of the work.
- The local linguistic metrics are evidence, not a verdict.
- Scores should be conservative. Scores above 80 are reserved for genuinely exceptional difficulty.
- Avoid spoilers.
- If title or edition identity is uncertain, lower confidence and state that uncertainty in cautions.`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: COMPREHENSION_MODEL,
        reasoning: { effort: 'medium' },
        store: false,
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: instructions }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({
            book: {
              title,
              author,
              year: String(book.year || '').slice(0, 30),
              language: String(book.language || '').slice(0, 50),
              description,
              subjects
            },
            localLinguisticProfile: {
              textualDifficulty: Number(localProfile.textualDifficulty) || 0,
              interpretationDifficulty: Number(localProfile.interpretationDifficulty) || 0,
              contextualDifficulty: Number(localProfile.contextualDifficulty) || 0,
              literaryComplexity: Number(localProfile.literaryComplexity) || 0,
              dimensions: localProfile.dimensions || {},
              evidence: localProfile.evidence || {}
            },
            textSample: sample || null
          }) }] }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'hybrid_reading_profile',
            strict: true,
            schema
          }
        }
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.error?.message || `OpenAI returned HTTP ${response.status}.`;
      return res.status(502).json({ error: 'Unable to enhance the Reading Profile.', detail });
    }

    const outputText = extractOpenAIOutputText(payload);
    if (!outputText) throw new Error('OpenAI returned no structured Reading Profile.');
    const profile = JSON.parse(outputText);
    res.json({ model: COMPREHENSION_MODEL, profile });
  } catch (error) {
    console.error('Reading Profile generation failed:', error);
    res.status(502).json({ error: 'Unable to enhance the Reading Profile.' });
  }
});


app.post('/api/book-guide', async (req, res) => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(503).json({
      error: 'Book Guide AI is not configured. Add OPENAI_API_KEY to the server environment.'
    });
  }

  const book = req.body?.book && typeof req.body.book === 'object' ? req.body.book : {};
  const sample = String(req.body?.sample || '').replace(/\s+/g, ' ').trim().slice(0, 24000);
  const spoilerMode = ['none', 'light', 'full'].includes(req.body?.spoilerMode)
    ? req.body.spoilerMode
    : 'none';

  const title = String(book.title || 'Untitled').trim().slice(0, 300);
  const author = String(book.author || '').trim().slice(0, 300);

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'overview',
      'setting',
      'characters',
      'themes',
      'structure',
      'context',
      'symbolsAndMotifs',
      'readingTips',
      'spoilerNote'
    ],
    properties: {
      overview: { type: 'string' },
      setting: { type: 'string' },
      characters: {
        type: 'array',
        minItems: 0,
        maxItems: 12,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'role'],
          properties: {
            name: { type: 'string' },
            role: { type: 'string' }
          }
        }
      },
      themes: {
        type: 'array',
        minItems: 2,
        maxItems: 10,
        items: { type: 'string' }
      },
      structure: { type: 'string' },
      context: {
        type: 'array',
        minItems: 0,
        maxItems: 10,
        items: { type: 'string' }
      },
      symbolsAndMotifs: {
        type: 'array',
        minItems: 0,
        maxItems: 10,
        items: { type: 'string' }
      },
      readingTips: {
        type: 'array',
        minItems: 2,
        maxItems: 8,
        items: { type: 'string' }
      },
      spoilerNote: { type: 'string' }
    }
  };

  const spoilerInstruction = spoilerMode === 'full'
    ? 'A full-work guide is allowed, including major plot developments and ending significance.'
    : spoilerMode === 'light'
      ? 'Mention only early-premise information and broad developments; do not reveal the ending or major twists.'
      : 'Avoid spoilers completely. Describe only the premise, setting, initial character roles, themes, structure, context, and what to notice.';

  const instructions = `Create a concise, dependable quick book guide for an adult reader.
${spoilerInstruction}
Do not imitate or claim affiliation with any commercial study-guide publisher.
Be specific to the identified work and edition when possible.
Do not invent characters, events, symbols, or historical facts.
When information is uncertain, say so.
Keep each section compact and useful before or during reading.`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: COMPREHENSION_MODEL,
        reasoning: { effort: 'medium' },
        store: false,
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: instructions }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({
            book: {
              title,
              author,
              year: book.year || '',
              description: String(book.description || '').slice(0, 3000),
              subjects: book.subjects || []
            },
            textSample: sample || null
          }) }] }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'quick_book_guide',
            strict: true,
            schema
          }
        }
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.error?.message || `OpenAI returned HTTP ${response.status}.`;
      return res.status(502).json({ error: 'Unable to create the Quick Book Guide.', detail });
    }

    const outputText = extractOpenAIOutputText(payload);
    if (!outputText) throw new Error('OpenAI returned no structured Book Guide.');
    const guide = JSON.parse(outputText);
    res.json({ model: COMPREHENSION_MODEL, guide });
  } catch (error) {
    console.error('Book Guide generation failed:', error);
    res.status(502).json({ error: 'Unable to create the Quick Book Guide.' });
  }
});


app.post('/api/mark-selection', async (req, res) => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return res.status(503).json({ error: 'Mark is not configured. Add OPENAI_API_KEY to the server environment.' });

  const action = String(req.body?.action || 'explain').trim();
  const allowed = new Set(['explain','summarize','analyze','simplify','context','related','ask','translate']);
  if (!allowed.has(action)) return res.status(400).json({ error: 'Unsupported Mark action.' });

  const selection = String(req.body?.selection || '').replace(/\s+/g,' ').trim().slice(0,12000);
  const before = String(req.body?.before || '').replace(/\s+/g,' ').trim().slice(-5000);
  const after = String(req.body?.after || '').replace(/\s+/g,' ').trim().slice(0,5000);
  const question = String(req.body?.question || '').trim().slice(0,1200);
  const title = String(req.body?.title || 'Untitled').trim().slice(0,300);
  const chapter = String(req.body?.chapter || '').trim().slice(0,300);
  const targetLanguage = String(req.body?.targetLanguage || '').trim().slice(0,80);
  if (!selection || selection.split(/\s+/).length > 1800) return res.status(400).json({ error: 'Select between 1 and 1,800 words.' });

  const actionInstructions = {
    explain: 'Explain the selected passage clearly. Clarify what it says, what is implied, and any difficult references. Avoid unnecessary plot spoilers.',
    summarize: 'Summarize only the selected passage concisely. Preserve its central idea, movement, and important qualifications.',
    analyze: 'Analyze the selected passage as literature or argument. Discuss structure, tone, imagery, rhetoric, subtext, and significance only where supported.',
    simplify: 'Rewrite the meaning in plain modern English without flattening important distinctions. Do not quote more than a few words.',
    context: 'Provide only the historical, cultural, geographical, philosophical, theological, scientific, or literary context genuinely needed to understand this passage.',
    related: 'Identify up to five relevant ideas, works, traditions, or passages that illuminate this selection. Explain each connection briefly and avoid invented relationships.',
    ask: 'Answer the reader question about the selected passage. Ground the answer in the selection and surrounding context; distinguish inference from fact.',
    translate: `Translate the selected passage into ${targetLanguage || 'the requested language'}. Preserve paragraphing, tone, names, and meaning. Add only a very brief note for unavoidable ambiguity.`
  };

  const schema={type:'object',additionalProperties:false,required:['heading','response','keyPoints','cautions'],properties:{
    heading:{type:'string'}, response:{type:'string'},
    keyPoints:{type:'array',minItems:0,maxItems:6,items:{type:'string'}},
    cautions:{type:'array',minItems:0,maxItems:4,items:{type:'string'}}
  }};
  const prompt=`You are Mark, a careful reading companion inside an e-reader. ${actionInstructions[action]}
Use the surrounding text only to disambiguate the selection. Never summarize or reveal later plot beyond the supplied context. Do not invent facts, allusions, authorial intentions, or quotations. State uncertainty plainly. Keep the response useful and proportionate to the selection.`;
  try {
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({
      model:COMPREHENSION_MODEL,reasoning:{effort:action==='analyze'||action==='related'?'medium':'low'},store:false,
      input:[{role:'developer',content:[{type:'input_text',text:prompt}]},{role:'user',content:[{type:'input_text',text:JSON.stringify({title,chapter,question:question||null,before,selection,after})}]}],
      text:{format:{type:'json_schema',name:'mark_selection_response',strict:true,schema}}
    })});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) return res.status(502).json({error:'Mark could not complete the request.',detail:payload?.error?.message||`HTTP ${response.status}`});
    const outputText=extractOpenAIOutputText(payload); if(!outputText) throw new Error('No response text.');
    res.json({model:COMPREHENSION_MODEL,action,result:JSON.parse(outputText)});
  } catch(error){ console.error('Mark selection failed:',error); res.status(502).json({error:'Mark could not complete the request.'}); }
});

app.post('/api/progress-recommendations', async (req, res) => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(503).json({
      error: 'Progress AI is not configured. Add OPENAI_API_KEY to the server environment.'
    });
  }

  const summary = req.body?.summary && typeof req.body.summary === 'object' ? req.body.summary : {};
  const daily = Array.isArray(req.body?.daily) ? req.body.daily.slice(-14) : [];
  const weekly = Array.isArray(req.body?.weekly) ? req.body.weekly.slice(-12) : [];

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['recommendations'],
    properties: {
      recommendations: {
        type: 'array',
        minItems: 3,
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title','recommendation','reason'],
          properties: {
            title: { type:'string' },
            recommendation: { type:'string' },
            reason: { type:'string' }
          }
        }
      }
    }
  };

  const prompt = `Act as a supportive reading coach. Analyze only the supplied reading metrics.
Give 3 to 5 specific, achievable recommendations that balance reading consistency, speed, comprehension, and annual book goals.
Do not diagnose health or learning disorders. Do not shame the reader. Do not invent missing measurements.
Make each recommendation practical for the next one to four weeks.`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method:'POST',
      headers:{
        Authorization:`Bearer ${apiKey}`,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({
        model:COMPREHENSION_MODEL,
        reasoning:{effort:'low'},
        store:false,
        input:[
          {role:'developer',content:[{type:'input_text',text:prompt}]},
          {role:'user',content:[{type:'input_text',text:JSON.stringify({summary,daily,weekly})}]}
        ],
        text:{
          format:{
            type:'json_schema',
            name:'reading_progress_recommendations',
            strict:true,
            schema
          }
        }
      })
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) {
      const detail=payload?.error?.message||`OpenAI returned HTTP ${response.status}.`;
      return res.status(502).json({error:'Unable to generate progress recommendations.',detail});
    }
    const outputText=extractOpenAIOutputText(payload);
    if(!outputText) throw new Error('OpenAI returned no structured output.');
    return res.json(JSON.parse(outputText));
  } catch(error) {
    console.error('Progress recommendation error:',error);
    return res.status(500).json({error:'Unable to generate progress recommendations.',detail:error.message});
  }
});


app.post('/api/study-guide', async (req, res) => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return res.status(503).json({ error: 'AI study tools are not configured. Add OPENAI_API_KEY to the server environment.' });

  const title = String(req.body?.title || 'Untitled').trim().slice(0, 300);
  const author = String(req.body?.author || '').trim().slice(0, 200);
  const sourceType = String(req.body?.sourceType || 'great-book').trim();
  const language = String(req.body?.language || 'English').trim().slice(0, 100);
  const passage = String(req.body?.passage || '').replace(/\s+/g, ' ').trim().slice(0, 14000);

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['overview', 'context', 'greatIdeas', 'studyQuestions', 'connections'],
    properties: {
      overview: { type: 'string' },
      context: { type: 'string' },
      greatIdeas: {
        type: 'array', minItems: 3, maxItems: 7,
        items: {
          type: 'object', additionalProperties: false,
          required: ['idea', 'whyItMatters', 'questions'],
          properties: {
            idea: { type: 'string' },
            whyItMatters: { type: 'string' },
            questions: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } }
          }
        }
      },
      studyQuestions: { type: 'array', minItems: 4, maxItems: 8, items: { type: 'string' } },
      connections: {
        type: 'array', minItems: 2, maxItems: 6,
        items: {
          type: 'object', additionalProperties: false,
          required: ['work', 'connection'],
          properties: { work: { type: 'string' }, connection: { type: 'string' } }
        }
      }
    }
  };

  const instruction = sourceType === 'bible'
    ? `Create a careful study guide for the supplied Bible passage. Stay grounded in the supplied text. Distinguish observation from interpretation. Identify major theological, ethical, literary, and philosophical ideas. Connections may name other biblical passages or Great Books only when you are confident; do not invent quotations or claim a disputed interpretation is certain.`
    : `Create a study guide for this Great Book or passage using syntopical reading principles. Explain context, identify durable Great Ideas, pose interpretive questions, and connect the work to other major works or authors. Do not reproduce copyrighted commentary or the Britannica Syntopicon; create an original study guide.`;
  const localizedInstruction = `${instruction}
Write the entire response in ${language}.`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_STUDY_MODEL || process.env.OPENAI_COMPREHENSION_MODEL || 'gpt-5.6-luna',
        reasoning: { effort: 'low' },
        store: false,
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: localizedInstruction }] },
          { role: 'user', content: [{ type: 'input_text', text: `Title: ${title}\nAuthor: ${author || 'N/A'}\n${passage ? `Passage:\n${passage}` : 'No passage supplied; provide a work-level orientation.'}` }] }
        ],
        text: { format: { type: 'json_schema', name: 'study_guide', strict: true, schema } }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(502).json({ error: payload?.error?.message || 'Unable to generate study guide.' });
    const outputText = extractOpenAIOutputText(payload);
    if (!outputText) throw new Error('No structured study output returned.');
    res.json(JSON.parse(outputText));
  } catch (error) {
    console.error('Study guide generation failed:', error);
    res.status(502).json({ error: 'Unable to generate study guide.' });
  }
});

// Free Use Bible API proxy. The upstream service requires no API key.
app.get('/api/bible/translations', async (_req, res) => {
  try {
    const response = await fetch('https://bible.helloao.org/api/available_translations.json');
    if (!response.ok) throw new Error(`Bible service returned HTTP ${response.status}.`);
    const payload = await response.json();
    const translations = (payload.translations || [])
      .map((item) => ({
        id: item.id,
        name: item.englishName || item.name,
        nativeName: item.name || item.englishName,
        shortName: item.shortName || item.id,
        language: item.language || '',
        languageName: item.languageEnglishName || item.languageName || item.language || 'Unknown',
        website: item.website,
        licenseUrl: item.licenseUrl,
        numberOfBooks: item.numberOfBooks,
        totalNumberOfVerses: item.totalNumberOfVerses
      }))
      .sort((a,b) => `${a.languageName} ${a.name}`.localeCompare(`${b.languageName} ${b.name}`));
    res.json({ translations });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Bible translations unavailable.' });
  }
});

app.get('/api/bible/:translation/books', async (req, res) => {
  try {
    const translation = encodeURIComponent(String(req.params.translation || ''));
    const response = await fetch(`https://bible.helloao.org/api/${translation}/books.json`);
    if (!response.ok) throw new Error(`Bible service returned HTTP ${response.status}.`);
    const payload = await response.json();
    res.json({
      translation: payload.translation,
      books: (payload.books || []).map((book) => ({
        id: book.id, name: book.commonName || book.name, title: book.title,
        order: book.order, numberOfChapters: book.numberOfChapters, isApocryphal: Boolean(book.isApocryphal)
      }))
    });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Bible books unavailable.' });
  }
});

app.get('/api/bible/:translation/:book/:chapter', async (req, res) => {
  try {
    const translation = encodeURIComponent(String(req.params.translation || ''));
    const book = encodeURIComponent(String(req.params.book || ''));
    const chapter = Math.max(1, Number(req.params.chapter) || 1);
    const response = await fetch(`https://bible.helloao.org/api/${translation}/${book}/${chapter}.json`);
    if (!response.ok) throw new Error(`Bible service returned HTTP ${response.status}.`);
    const payload = await response.json();
    res.json(payload);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Bible chapter unavailable.' });
  }
});


app.get('/api/bible/commentaries', async (_req, res) => {
  try {
    const response = await fetch('https://bible.helloao.org/api/available_commentaries.json');
    if (!response.ok) throw new Error(`Bible service returned HTTP ${response.status}.`);
    const payload = await response.json();
    const commentaries = (payload.commentaries || [])
      .filter((item) => item.language === 'eng' || item.languageEnglishName === 'English')
      .map((item) => ({
        id: item.id,
        name: item.englishName || item.name,
        website: item.website,
        licenseUrl: item.licenseUrl,
        numberOfBooks: item.numberOfBooks,
        totalNumberOfProfiles: item.totalNumberOfProfiles || 0
      }))
      .sort((a,b) => a.name.localeCompare(b.name));
    res.json({ commentaries });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Bible commentaries unavailable.' });
  }
});

app.get('/api/bible/commentary/:commentary/:book/:chapter', async (req, res) => {
  try {
    const commentary = encodeURIComponent(String(req.params.commentary || ''));
    const book = encodeURIComponent(String(req.params.book || ''));
    const chapter = Math.max(1, Number(req.params.chapter) || 1);
    const response = await fetch(`https://bible.helloao.org/api/c/${commentary}/${book}/${chapter}.json`);
    if (!response.ok) throw new Error(`Bible service returned HTTP ${response.status}.`);
    res.json(await response.json());
  } catch (error) {
    res.status(502).json({ error: error.message || 'Commentary chapter unavailable.' });
  }
});

app.get('/api/bible/datasets', async (_req, res) => {
  try {
    const response = await fetch('https://bible.helloao.org/api/available_datasets.json');
    if (!response.ok) throw new Error(`Bible service returned HTTP ${response.status}.`);
    const payload = await response.json();
    const datasets = (payload.datasets || []).map((item) => ({
      id: item.id,
      name: item.englishName || item.name,
      website: item.website,
      licenseUrl: item.licenseUrl,
      numberOfBooks: item.numberOfBooks,
      totalNumberOfReferences: item.totalNumberOfReferences || 0
    }));
    res.json({ datasets });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Bible datasets unavailable.' });
  }
});

app.get('/api/bible/dataset/:dataset/:book/:chapter', async (req, res) => {
  try {
    const dataset = encodeURIComponent(String(req.params.dataset || ''));
    const book = encodeURIComponent(String(req.params.book || ''));
    const chapter = Math.max(1, Number(req.params.chapter) || 1);
    const response = await fetch(`https://bible.helloao.org/api/d/${dataset}/${book}/${chapter}.json`);
    if (!response.ok) throw new Error(`Bible service returned HTTP ${response.status}.`);
    res.json(await response.json());
  } catch (error) {
    res.status(502).json({ error: error.message || 'Bible dataset chapter unavailable.' });
  }
});

app.get('/api/bible/commentary/:commentary/profiles', async (req, res) => {
  try {
    const commentary = encodeURIComponent(String(req.params.commentary || ''));
    const response = await fetch(`https://bible.helloao.org/api/c/${commentary}/profiles.json`);
    if (!response.ok) throw new Error(`Bible service returned HTTP ${response.status}.`);
    res.json(await response.json());
  } catch (error) {
    res.status(502).json({ error: error.message || 'Commentary profiles unavailable.' });
  }
});

app.get('/api/bible/commentary/:commentary/profiles/:profile', async (req, res) => {
  try {
    const commentary = encodeURIComponent(String(req.params.commentary || ''));
    const profile = encodeURIComponent(String(req.params.profile || ''));
    const response = await fetch(`https://bible.helloao.org/api/c/${commentary}/profiles/${profile}.json`);
    if (!response.ok) throw new Error(`Bible service returned HTTP ${response.status}.`);
    res.json(await response.json());
  } catch (error) {
    res.status(502).json({ error: error.message || 'Commentary profile unavailable.' });
  }
});

app.get('/api/bible/:translation/:book/complete', async (req, res) => {
  try {
    const translation = encodeURIComponent(String(req.params.translation || ''));
    const bookId = String(req.params.book || '');
    const booksResponse = await fetch(`https://bible.helloao.org/api/${translation}/books.json`);
    if (!booksResponse.ok) throw new Error(`Bible service returned HTTP ${booksResponse.status}.`);
    const booksPayload = await booksResponse.json();
    const book = (booksPayload.books || []).find((item) => item.id === bookId);
    if (!book) return res.status(404).json({ error: 'Book not found in this translation.' });

    const chapters = [];
    for (let chapter = Number(book.firstChapterNumber || 1); chapter <= Number(book.lastChapterNumber || book.numberOfChapters || 1); chapter += 1) {
      const response = await fetch(`https://bible.helloao.org/api/${translation}/${encodeURIComponent(bookId)}/${chapter}.json`);
      if (!response.ok) throw new Error(`Bible service returned HTTP ${response.status} while loading chapter ${chapter}.`);
      chapters.push(await response.json());
    }
    res.json({ translation: booksPayload.translation, book, chapters });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Bible book unavailable.' });
  }
});


app.post('/api/syntopicon', async (req, res) => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return res.status(503).json({ error: 'Syntopical AI is not configured. Add OPENAI_API_KEY to the server environment.' });

  const idea = String(req.body?.idea || '').trim().slice(0, 200);
  const language = String(req.body?.language || 'English').trim().slice(0, 100);
  const sources = Array.isArray(req.body?.sources) ? req.body.sources.slice(0, 12) : [];
  if (!idea) return res.status(400).json({ error: 'Choose or enter a Great Idea first.' });
  if (sources.length < 2) return res.status(400).json({ error: 'Choose at least two sources for a syntopical comparison.' });

  const normalizedSources = sources.map((source, index) => ({
    id: String(source?.id || `source-${index + 1}`).slice(0, 100),
    title: String(source?.title || 'Untitled').slice(0, 300),
    author: String(source?.author || '').slice(0, 200),
    type: String(source?.type || 'great-book').slice(0, 50),
    excerpt: String(source?.excerpt || '').replace(/\s+/g, ' ').trim().slice(0, 9000)
  }));

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['idea', 'centralQuestion', 'terms', 'sourcePositions', 'agreements', 'disagreements', 'distinctions', 'studyQuestions', 'readingPath'],
    properties: {
      idea: { type: 'string' },
      centralQuestion: { type: 'string' },
      terms: {
        type: 'array', minItems: 3, maxItems: 8,
        items: {
          type: 'object', additionalProperties: false,
          required: ['term', 'meaning'],
          properties: { term: { type: 'string' }, meaning: { type: 'string' } }
        }
      },
      sourcePositions: {
        type: 'array', minItems: 2, maxItems: 12,
        items: {
          type: 'object', additionalProperties: false,
          required: ['source', 'position', 'evidenceBasis', 'questions'],
          properties: {
            source: { type: 'string' },
            position: { type: 'string' },
            evidenceBasis: { type: 'string' },
            questions: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } }
          }
        }
      },
      agreements: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string' } },
      disagreements: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string' } },
      distinctions: { type: 'array', minItems: 2, maxItems: 8, items: { type: 'string' } },
      studyQuestions: { type: 'array', minItems: 4, maxItems: 10, items: { type: 'string' } },
      readingPath: {
        type: 'array', minItems: 2, maxItems: 12,
        items: {
          type: 'object', additionalProperties: false,
          required: ['source', 'reason'],
          properties: { source: { type: 'string' }, reason: { type: 'string' } }
        }
      }
    }
  };

  const sourceText = normalizedSources.map((source, index) =>
    `SOURCE ${index + 1}\nTitle: ${source.title}\nAuthor: ${source.author || 'N/A'}\nType: ${source.type}\n${source.excerpt ? `Excerpt supplied by user/app:\n${source.excerpt}` : 'No excerpt supplied; use only broadly established knowledge of this work and clearly avoid fabricated quotation or page-level claims.'}`
  ).join('\n\n');

  const instruction = `Perform a genuine syntopical comparison centered on the Great Idea "${idea}".
Follow the spirit of syntopical reading: establish a neutral central question, define shared terms, identify each source's position, compare agreements and disagreements, distinguish meanings that look similar but are not identical, and propose further questions and an efficient reading order.
Do not reproduce or imitate copyrighted Syntopicon entries. Produce original analysis.
When an excerpt is supplied, ground claims in that excerpt. When no excerpt is supplied, limit yourself to broadly established features of the work and explicitly avoid invented quotations, chapter references, or precise textual claims.
Bible sources may involve contested interpretations; distinguish text, interpretation, and inference.
Write the entire response in ${language}.`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_STUDY_MODEL || process.env.OPENAI_COMPREHENSION_MODEL || 'gpt-5.6-luna',
        reasoning: { effort: 'medium' },
        store: false,
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: instruction }] },
          { role: 'user', content: [{ type: 'input_text', text: sourceText }] }
        ],
        text: { format: { type: 'json_schema', name: 'syntopical_analysis', strict: true, schema } }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(502).json({ error: payload?.error?.message || 'Unable to create syntopical analysis.' });
    const outputText = extractOpenAIOutputText(payload);
    if (!outputText) throw new Error('No structured syntopical output returned.');
    res.json(JSON.parse(outputText));
  } catch (error) {
    console.error('Syntopicon generation failed:', error);
    res.status(502).json({ error: 'Unable to create syntopical analysis.' });
  }
});

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));

function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const parts = address.split('.').map(Number);
    return (
      parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
      parts[0] >= 224
    );
  }

  if (net.isIPv6(address)) {
    const value = address.toLowerCase();
    return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') ||
      value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb');
  }
  return true;
}

async function validatePublicUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new Error('Enter a valid URL, including https:// or http://.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.');
  if (parsed.username || parsed.password) throw new Error('URLs containing credentials are not supported.');

  const results = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
  if (!results.length || results.some(({ address }) => isPrivateIp(address))) {
    throw new Error('That address cannot be fetched by this server.');
  }
  return parsed;
}

async function fetchReadableText(rawUrl) {
  const parsed = await validatePublicUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(parsed, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'MarkSetGoWeb/1.1 (+reading application)',
        Accept: 'text/html,text/plain;q=0.9,*/*;q=0.1'
      }
    });
    if (!response.ok) throw new Error(`The remote server returned HTTP ${response.status}.`);

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new Error('The URL did not return readable HTML or plain text.');
    }

    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_RESPONSE_BYTES) throw new Error('The page is too large to import.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_RESPONSE_BYTES) throw new Error('The page is too large to import.');

    const source = buffer.toString('utf8');
    if (contentType.includes('text/plain')) return source.replace(/\s+/g, ' ').trim();

    const $ = cheerio.load(source);
    $('script, style, noscript, svg, iframe, form, nav, footer').remove();
    const title = $('title').first().text().replace(/\s+/g, ' ').trim();
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    return title ? `${title}\n\n${text}` : text;
  } finally {
    clearTimeout(timeout);
  }
}



function normalizedHeadlineWords(value) {
  return new Set(String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3));
}

function headlineMatches(expectedTitle, pageTitle) {
  const expected = normalizedHeadlineWords(expectedTitle);
  const actual = normalizedHeadlineWords(pageTitle);
  if (!expected.size || !actual.size) return true;
  let matches = 0;
  for (const word of expected) if (actual.has(word)) matches += 1;
  return matches >= Math.min(2, Math.ceil(expected.size * 0.25));
}

async function fetchArticleForFeed(rawUrl, expectedTitle) {
  const parsed = await validatePublicUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);
  try {
    const response = await fetch(parsed, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MarkSetGoWeb/2.2; +reader)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.1'
      }
    });
    if (!response.ok) throw new Error(`The publisher returned HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_RESPONSE_BYTES) throw new Error('The article is too large to import.');
    const source = buffer.toString('utf8');
    if (contentType.includes('text/plain')) {
      const text = source.replace(/\s+/g, ' ').trim();
      if (text.length < 300) throw new Error('The publisher did not return enough article text.');
      return text;
    }

    const $ = cheerio.load(source);
    $('script, style, noscript, svg, iframe, form, nav, footer, header, aside, dialog, [aria-hidden="true"]').remove();
    const pageTitle = $('meta[property="og:title"]').attr('content') || $('h1').first().text() || $('title').first().text();
    if (!headlineMatches(expectedTitle, pageTitle)) {
      throw new Error('The publisher returned a navigation or unrelated page instead of this article.');
    }

    const selectors = [
      'article [itemprop="articleBody"]', '[itemprop="articleBody"]',
      'article .article-body', 'article .story-body', 'article .entry-content',
      'article .post-content', 'article .content-body', 'article',
      'main .article-body', 'main .story-body', 'main .entry-content',
      'main .post-content', 'main [role="article"]', 'main'
    ];
    let best = '';
    for (const selector of selectors) {
      $(selector).each((_index, element) => {
        const container = $(element).clone();
        container.find('nav, footer, header, aside, form, button, figure, figcaption, .advertisement, .ad, [class*="promo"], [class*="related"], [class*="newsletter"]').remove();
        const paragraphs = container.find('p').toArray()
          .map((p) => $(p).text().replace(/\s+/g, ' ').trim())
          .filter((text) => text.length >= 35);
        const candidate = paragraphs.length >= 3
          ? paragraphs.join('\n\n')
          : container.text().replace(/\s+/g, ' ').trim();
        if (candidate.length > best.length) best = candidate;
      });
      if (best.length >= 1200) break;
    }
    if (best.length < 350) throw new Error('The publisher did not expose readable article text.');
    const genericSignals = ['sign in to continue', 'enable javascript', 'accept all cookies', 'latest news and headlines'];
    const lower = best.toLowerCase();
    if (genericSignals.some((signal) => lower.includes(signal)) && best.length < 1200) {
      throw new Error('The publisher returned a consent or navigation page instead of article text.');
    }
    return best.slice(0, 500000);
  } finally {
    clearTimeout(timeout);
  }
}


const gutenbergJsonCache = new Map();

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 22000;
  const attempts = Math.max(1, Number(options.attempts) || 2);
  const cacheTtlMs = Math.max(0, Number(options.cacheTtlMs) || (10 * 60 * 1000));
  const cached = gutenbergJsonCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'MarkSetGoWeb/2.0 (+Project Gutenberg reader)',
          Accept: 'application/json'
        }
      });
      if (!response.ok) {
        const error = new Error(`Catalog service returned HTTP ${response.status}.`);
        error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw error;
      }
      const payload = await response.json();
      gutenbergJsonCache.set(url, { payload, expiresAt: Date.now() + cacheTtlMs });
      return payload;
    } catch (error) {
      lastError = error;
      const retryable = error?.name === 'AbortError' || error?.retryable || error instanceof TypeError;
      if (!retryable || attempt >= attempts) break;
      await wait(800 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  // A recently successful response is better than a hard failure during a brief outage.
  if (cached?.payload) return cached.payload;
  throw lastError;
}

function normalizeGutenbergBook(book) {
  const authors = Array.isArray(book?.authors)
    ? book.authors.map((author) => author?.name).filter(Boolean)
    : [];
  const languages = Array.isArray(book?.languages) ? book.languages.filter(Boolean) : [];
  const formats = book?.formats && typeof book.formats === 'object' ? book.formats : {};
  const cover = formats['image/jpeg'] || formats['image/png'] || '';
  return {
    id: Number(book?.id),
    title: String(book?.title || 'Untitled'),
    authors,
    languages,
    downloadCount: Number(book?.download_count || 0),
    subjects: Array.isArray(book?.subjects) ? book.subjects.slice(0, 4) : [],
    cover,
    gutenbergUrl: Number.isFinite(Number(book?.id)) ? `https://www.gutenberg.org/ebooks/${Number(book.id)}` : ''
  };
}

function selectGutenbergTextUrl(formats) {
  if (!formats || typeof formats !== 'object') return '';
  const entries = Object.entries(formats).filter(([mime, url]) =>
    mime.startsWith('text/plain') && typeof url === 'string' && url
  );
  const preferred = entries.find(([mime]) => /charset=utf-8/i.test(mime)) || entries[0];
  return preferred?.[1] || '';
}

function validateGutenbergDownloadUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new Error('The catalog returned an invalid book URL.'); }
  const hostname = parsed.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(parsed.protocol) || !(hostname === 'gutenberg.org' || hostname.endsWith('.gutenberg.org'))) {
    throw new Error('The catalog did not provide an approved Project Gutenberg text address.');
  }
  return parsed;
}

function removeGutenbergBoilerplate(text) {
  let value = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const startPatterns = [
    /^\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*\s*$/im,
    /^\*\*\*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*\s*$/im
  ];
  const endPatterns = [
    /^\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*\s*$/im,
    /^\*\*\*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*\s*$/im
  ];
  for (const pattern of startPatterns) {
    const match = pattern.exec(value);
    if (match) { value = value.slice(match.index + match[0].length); break; }
  }
  for (const pattern of endPatterns) {
    const match = pattern.exec(value);
    if (match) { value = value.slice(0, match.index); break; }
  }
  return value.replace(/\n{4,}/g, '\n\n\n').trim();
}


const gutenbergMemoryCache = new Map();

function readCachedGutenbergBook(id) {
  const cached = gutenbergMemoryCache.get(id);
  if (!cached) return null;
  return { text: cached.text, metadata: cached.metadata, cached: true };
}

function writeCachedGutenbergBook(id, text, metadata) {
  gutenbergMemoryCache.set(id, { text, metadata, cachedAt: Date.now() });
}

function mirrorTextCandidates(base, id) {
  return [
    `${base}/cache/epub/${id}/pg${id}.txt`,
    `${base}/cache/epub/${id}/pg${id}.txt.utf-8`,
    `${base}/ebooks/${id}.txt.utf-8`,
    `${base}/files/${id}/${id}-0.txt`,
    `${base}/files/${id}/${id}.txt`
  ];
}

const gitenbergRepositoryCache = new Map();

async function fetchTextResponse(url, userAgent) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/plain,*/*;q=0.1'
      }
    });
    if (!response.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}.`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_GUTENBERG_BOOK_BYTES) throw new Error('This book is too large to load.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_GUTENBERG_BOOK_BYTES) throw new Error('This book is too large to load.');
    const text = removeGutenbergBoilerplate(buffer.toString('utf8'));
    if (text.length < 500) throw new Error('The source returned insufficient readable text.');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveGitenbergRepository(id) {
  if (gitenbergRepositoryCache.has(id)) return gitenbergRepositoryCache.get(id);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://www.gitenberg.org/book/${id}`, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'MarkSetGoWeb/3.3 (+public-domain reader)', Accept: 'text/html' }
    });
    if (!response.ok) throw new Error(`GITenberg returned HTTP ${response.status}.`);
    const html = await response.text();
    const $ = cheerio.load(html);
    const href = $('a[href*="github.com/GITenberg/"]').map((_index, element) => $(element).attr('href')).get()
      .find((value) => /github\.com\/GITenberg\/[^/]+/i.test(value || ''));
    if (!href) throw new Error('No GITenberg repository was found for this title.');
    const match = href.match(/github\.com\/(GITenberg)\/([^/#?]+)/i);
    if (!match) throw new Error('The GITenberg repository address was invalid.');
    const repository = { owner: match[1], repo: match[2].replace(/\.git$/i, '') };
    gitenbergRepositoryCache.set(id, repository);
    return repository;
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadGitenbergText(id) {
  const { owner, repo } = await resolveGitenbergRepository(id);
  let lastError = null;
  for (const branch of ['master', 'main']) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const treeResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'MarkSetGoWeb/3.3',
          Accept: 'application/vnd.github+json'
        }
      });
      if (!treeResponse.ok) throw new Error(`GitHub returned HTTP ${treeResponse.status}.`);
      const tree = await treeResponse.json();
      const files = Array.isArray(tree?.tree) ? tree.tree.filter((item) => item.type === 'blob' && /\.txt$/i.test(item.path || '')) : [];
      const ranked = files.sort((a, b) => {
        const score = (item) => {
          const path = String(item.path || '').toLowerCase();
          let value = 0;
          if (path === `${id}.txt` || path.endsWith(`/${id}.txt`)) value += 100;
          if (path.includes(`pg${id}`)) value += 80;
          if (path.includes('README'.toLowerCase())) value -= 100;
          if (path.includes('metadata')) value -= 80;
          if (path.includes('cover')) value -= 40;
          value -= path.split('/').length;
          return value;
        };
        return score(b) - score(a);
      });
      if (!ranked.length) throw new Error('No plain-text file was found in the GITenberg repository.');
      for (const file of ranked.slice(0, 5)) {
        try {
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
          const text = await fetchTextResponse(rawUrl, 'MarkSetGoWeb/3.3 (+public-domain reader)');
          return { text, downloadedFrom: rawUrl };
        } catch (error) {
          lastError = error;
        }
      }
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error('GITenberg did not provide a readable text file.');
}

async function downloadGutenbergTextFromMirrors(id) {
  const candidates = [];
  for (const base of GUTENBERG_MIRROR_BASES) candidates.push(...mirrorTextCandidates(base, id));

  let lastError = null;
  for (const url of [...new Set(candidates)]) {
    try {
      const text = await fetchTextResponse(url, 'MarkSetGoWeb/3.3 (+public-domain reader)');
      return { text, downloadedFrom: url };
    } catch (error) {
      lastError = error;
    }
  }

  // GITenberg repositories are hosted on GitHub and avoid falling back to the
  // blocked gutenberg.org download URL from Gutendex.
  try {
    return await downloadGitenbergText(id);
  } catch (error) {
    lastError = error;
  }

  throw lastError || new Error('No free text mirror returned this book.');
}

function translatorConfig() {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  const endpoint = (process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com').replace(/\/$/, '');
  if (!key || !region) {
    throw new Error('Translation is not configured on this server. Add AZURE_TRANSLATOR_KEY and AZURE_TRANSLATOR_REGION.');
  }
  return { key, region, endpoint };
}

function splitTranslationChunks(text, maxLength = 4500) {
  const normalized = String(text).replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const chunks = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt < maxLength * 0.55) splitAt = remaining.lastIndexOf('. ', maxLength);
    if (splitAt < maxLength * 0.55) splitAt = remaining.lastIndexOf(' ', maxLength);
    if (splitAt <= 0) splitAt = maxLength;
    else if (remaining.slice(splitAt, splitAt + 2) === '. ') splitAt += 1;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function azureTranslate(texts, to, from) {
  const { key, region, endpoint } = translatorConfig();
  const params = new URLSearchParams({ 'api-version': '3.0', to });
  if (from) params.set('from', from);
  const response = await fetch(`${endpoint}/translate?${params}`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Ocp-Apim-Subscription-Region': region,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-ClientTraceId': crypto.randomUUID()
    },
    body: JSON.stringify(texts.map((Text) => ({ Text })))
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.error?.message || `Translation service returned HTTP ${response.status}.`;
    throw new Error(detail);
  }
  return payload.map((entry) => entry?.translations?.[0]?.text || '').filter(Boolean);
}



const illustrationCache = new Map();

function cleanCommonsText(value) {
  if (!value) return '';
  const $ = cheerio.load(`<div>${String(value)}</div>`);
  return $('div').text().replace(/\s+/g, ' ').trim();
}

const ILLUSTRATION_STOPWORDS = new Set([
  'the','and','that','with','from','this','there','their','have','were','which','would','could','should','into','about','after','before','through','because','while','where','when','upon','your','them','then','than','been','being','also','very','what','such','some','more','most','over','under','only','much','many','each','other','another','between','within','without','against','during','toward','towards','shall','will','might','must','cannot','cant','ours','ourselves','herself','himself','itself','they','those','these','said','says','made','make','like','just','unto','thou','thee','thy','ever','still','well','here','there','again','chapter','book','part','section'
]);
const NEGATIVE_ILLUSTRATION_TERMS = ['book cover','cover art','front cover','back cover','dust jacket','title page','logo','icon','poster','advertisement','banner','audio book','audiobook','ebook'];
const POSITIVE_ILLUSTRATION_TERMS = ['illustration','engraving','painting','drawing','portrait','map','scene','photograph','woodcut','etching'];

function tokenizeIllustrationText(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token && token.length >= 3 && !ILLUSTRATION_STOPWORDS.has(token));
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildIllustrationQueries(payload) {
  const title = String(payload?.title || '').replace(/\s+/g, ' ').trim();
  const heading = String(payload?.heading || '').replace(/\s+/g, ' ').trim();
  const context = String(payload?.context || '').replace(/\s+/g, ' ').trim();
  const suppliedKeywords = Array.isArray(payload?.keywords) ? payload.keywords.map((item) => String(item || '').trim()).filter(Boolean) : [];
  const derivedKeywords = tokenizeIllustrationText(context).slice(0, 12);
  const titleTokens = tokenizeIllustrationText(title);
  const headingTokens = tokenizeIllustrationText(heading);
  const keywords = uniqueList([...suppliedKeywords, ...headingTokens, ...derivedKeywords]).filter((word) => !titleTokens.includes(word)).slice(0, 8);

  const phraseKeywords = keywords.slice(0, 4).join(' ');
  const queries = uniqueList([
    [heading, phraseKeywords].filter(Boolean).join(' '),
    [title, heading, phraseKeywords].filter(Boolean).join(' '),
    [title, phraseKeywords, 'illustration'].filter(Boolean).join(' '),
    [phraseKeywords, 'illustration'].filter(Boolean).join(' '),
    [title, heading].filter(Boolean).join(' '),
    [title, 'illustration'].filter(Boolean).join(' '),
    title
  ].map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean));

  return { title, heading, context, keywords, queries: queries.slice(0, 6) };
}

async function searchCommonsImages(query) {
  const normalized = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (!normalized) return [];
  const cacheKey = `commons:${normalized.toLocaleLowerCase()}`;
  const cached = illustrationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.results;

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: `${normalized} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '10',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1200'
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MarkSetGoWeb/3.1 (illustrated reading; Wikimedia Commons client)'
      }
    });
    if (!response.ok) throw new Error(`Wikimedia Commons returned HTTP ${response.status}.`);
    const payload = await response.json();
    const pages = Array.isArray(payload?.query?.pages) ? payload.query.pages : [];
    const results = pages.map((page) => {
      const info = page?.imageinfo?.[0];
      const metadata = info?.extmetadata || {};
      if (!info?.thumburl || !String(info.mime || '').startsWith('image/')) return null;
      if (Number(info.width || 0) < 500 || Number(info.height || 0) < 300) return null;
      const description = cleanCommonsText(metadata.ImageDescription?.value || metadata.ObjectName?.value || page.title?.replace(/^File:/, ''));
      const artist = cleanCommonsText(metadata.Artist?.value || metadata.Credit?.value || 'Wikimedia Commons contributor');
      const license = cleanCommonsText(metadata.LicenseShortName?.value || metadata.UsageTerms?.value || 'See source for license');
      const licenseUrl = metadata.LicenseUrl?.value || '';
      return {
        title: String(page.title || '').replace(/^File:/, ''),
        description: description.slice(0, 500),
        artist: artist.slice(0, 300),
        license: license.slice(0, 120),
        licenseUrl,
        imageUrl: info.thumburl,
        originalUrl: info.descriptionurl || info.url,
        width: Number(info.thumbwidth || info.width || 0),
        height: Number(info.thumbheight || info.height || 0),
        _sourceQuery: normalized
      };
    }).filter(Boolean).slice(0, 10);
    illustrationCache.set(cacheKey, { results, expiresAt: Date.now() + (6 * 60 * 60 * 1000) });
    return results;
  } finally {
    clearTimeout(timeout);
  }
}

function scoreIllustrationResult(item, context) {
  const haystack = `${item.title || ''} ${item.description || ''} ${item.artist || ''}`.toLocaleLowerCase();
  const titleTokens = tokenizeIllustrationText(context.title);
  const headingTokens = tokenizeIllustrationText(context.heading);
  const keywordTokens = context.keywords || [];
  let score = 0;

  for (const token of keywordTokens) {
    if (haystack.includes(token.toLocaleLowerCase())) score += 5;
  }
  for (const token of headingTokens) {
    if (haystack.includes(token.toLocaleLowerCase())) score += 4;
  }
  for (const token of titleTokens.slice(0, 5)) {
    if (haystack.includes(token.toLocaleLowerCase())) score += 1;
  }
  for (const token of POSITIVE_ILLUSTRATION_TERMS) {
    if (haystack.includes(token)) score += 3;
  }
  for (const token of NEGATIVE_ILLUSTRATION_TERMS) {
    if (haystack.includes(token)) score -= 8;
  }

  if (item.width && item.height) {
    const ratio = item.width / Math.max(1, item.height);
    if (ratio > 0.5 && ratio < 2.5) score += 1;
  }
  if (context.heading && keywordTokens.length && !keywordTokens.some((token) => haystack.includes(token.toLocaleLowerCase())) && headingTokens.length && !headingTokens.some((token) => haystack.includes(token.toLocaleLowerCase()))) {
    score -= 3;
  }
  return score;
}

async function findRelevantIllustrations(payload) {
  const context = buildIllustrationQueries(payload);
  const merged = [];
  const seen = new Set();

  for (const query of context.queries) {
    const results = await searchCommonsImages(query);
    for (const item of results) {
      const key = item.originalUrl || `${item.title}|${item.imageUrl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const scored = { ...item, _score: scoreIllustrationResult(item, context) };
      merged.push(scored);
    }
    if (merged.length >= 20) break;
  }

  const ranked = merged.sort((a, b) => b._score - a._score || b.width - a.width);
  let selected = ranked.filter((item) => {
    const text = `${item.title || ''} ${item.description || ''}`.toLocaleLowerCase();
    return !NEGATIVE_ILLUSTRATION_TERMS.some((term) => text.includes(term)) || item._score >= 5;
  });
  if (!selected.length) selected = ranked.filter((item) => item._score > -5);
  return selected.slice(0, 8).map(({ _score, _sourceQuery, ...rest }) => rest);
}

app.get('/api/illustrations/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.status(400).json({ error: 'An illustration search phrase is required.' });
  try {
    const results = await findRelevantIllustrations({ title: query, heading: '', context: query, keywords: tokenizeIllustrationText(query).slice(0, 5) });
    return res.json({ query, results });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'The image library took too long to respond.'
      : error?.message || 'Illustrations could not be loaded.';
    return res.status(502).json({ error: message });
  }
});

app.post('/api/illustrations/search', async (req, res) => {
  const payload = req.body || {};
  if (!payload || (!payload.title && !payload.heading && !payload.context)) {
    return res.status(400).json({ error: 'Illustration context is required.' });
  }
  try {
    const results = await findRelevantIllustrations(payload);
    return res.json({ results });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'The image library took too long to respond.'
      : error?.message || 'Illustrations could not be loaded.';
    return res.status(502).json({ error: message });
  }
});


function normalizeBookMatchText(value) {
  return String(value || '').toLocaleLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function bookMatchScore(book, title, author) {
  const wantedTitle = normalizeBookMatchText(title);
  const wantedAuthor = normalizeBookMatchText(author);
  const bookTitle = normalizeBookMatchText(book?.title);
  const authors = (book?.authors || []).map((item) => normalizeBookMatchText(item?.name)).join(' ');
  let score = 0;
  if (bookTitle === wantedTitle) score += 100;
  else if (bookTitle.includes(wantedTitle) || wantedTitle.includes(bookTitle)) score += 55;
  const wantedWords = wantedTitle.split(' ').filter((word) => word.length > 2);
  const matchedWords = wantedWords.filter((word) => bookTitle.includes(word)).length;
  score += matchedWords * 8;
  if (wantedAuthor && authors.includes(wantedAuthor)) score += 35;
  else if (wantedAuthor) {
    const surname = wantedAuthor.split(' ').at(-1);
    if (surname && authors.includes(surname)) score += 18;
  }
  return score;
}

app.get('/api/free-text/search', async (req, res) => {
  const title = String(req.query.title || '').trim().slice(0, 180);
  const author = String(req.query.author || '').trim().slice(0, 140);
  if (!title) return res.status(400).json({ error: 'A book title is required.' });
  try {
    const search = [title, author].filter(Boolean).join(' ');
    const params = new URLSearchParams({ search, languages: 'en' });
    const payload = await fetchJsonWithRetry(`${GUTENDEX_BASE}/books/?${params}`, { timeoutMs: 22000, attempts: 2, cacheTtlMs: 30 * 60 * 1000 });
    const books = Array.isArray(payload?.results) ? payload.results : [];
    const ranked = books.map((book) => ({ book, score: bookMatchScore(book, title, author) })).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (best?.score >= 30) {
      return res.json({
        found: true,
        provider: 'Project Gutenberg',
        book: normalizeGutenbergBook(best.book),
        textEndpoint: `/api/gutenberg/books/${best.book.id}/text`,
        sourceUrl: `https://www.gutenberg.org/ebooks/${best.book.id}`
      });
    }
    return res.json({
      found: false,
      alternatives: [
        { provider: 'Standard Ebooks', url: `https://standardebooks.org/ebooks?query=${encodeURIComponent(title)}` },
        { provider: 'Internet Archive', url: `https://archive.org/search?query=${encodeURIComponent(`title:(\"${title}\")${author ? ` AND creator:(\"${author}\")` : ''}`)}` },
        { provider: 'Google Books', url: `https://books.google.com/books?q=${encodeURIComponent([title, author].filter(Boolean).join(' '))}&as_brr=1` }
      ]
    });
  } catch (error) {
    return res.status(502).json({ error: error?.message || 'Free-text sources could not be searched.' });
  }
});

const youtubeSearchCache = new Map();

function extractYouTubeCandidates(html) {
  const ids = [];
  const seen = new Set();
  for (const match of String(html || '').matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= 12) break;
  }
  return ids;
}

app.get('/api/youtube/search', async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 180);
  if (!query) return res.status(400).json({ error: 'A music search is required.' });
  const cacheKey = query.toLocaleLowerCase();
  const cached = youtubeSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.payload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!response.ok) throw new Error(`YouTube returned HTTP ${response.status}.`);
    const html = await response.text();
    const videoIds = extractYouTubeCandidates(html);
    if (!videoIds.length) throw new Error('No playable YouTube results were found.');
    const payload = { query, videoIds };
    youtubeSearchCache.set(cacheKey, { payload, expiresAt: Date.now() + 20 * 60 * 1000 });
    return res.json(payload);
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'YouTube search took too long to respond.' : error?.message || 'Music search failed.';
    return res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
});



function normalizeZipEntryName(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function safeIllustratedBookManifest(manifest, zip) {
  if (!manifest || typeof manifest !== 'object') throw new Error('manifest.json must contain a JSON object.');
  const title = String(manifest.title || '').trim() || 'Illustrated Book';
  const author = String(manifest.author || '').trim();
  const textFile = normalizeZipEntryName(manifest.textFile || 'book.txt');
  const textEntry = zip.getEntry(textFile);
  if (!textEntry || textEntry.isDirectory) throw new Error(`The text file “${textFile}” was not found in the ZIP.`);
  const text = textEntry.getData().toString('utf8').replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('The book text file is empty.');
  if (text.length > 3_000_000) throw new Error('The book text is too large.');

  const mappings = Array.isArray(manifest.illustrations) ? manifest.illustrations : [];
  const illustrations = [];
  let totalImageBytes = 0;
  for (const mapping of mappings.slice(0, 250)) {
    const heading = String(mapping?.heading || '').trim();
    const imagePath = normalizeZipEntryName(mapping?.image || '');
    if (!heading || !imagePath) continue;
    const entry = zip.getEntry(imagePath);
    if (!entry || entry.isDirectory) continue;
    const extension = imagePath.split('.').pop()?.toLowerCase();
    const mime = extension === 'png' ? 'image/png'
      : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg'
      : extension === 'webp' ? 'image/webp'
      : extension === 'gif' ? 'image/gif'
      : '';
    if (!mime) continue;
    const buffer = entry.getData();
    if (buffer.length > 8 * 1024 * 1024) continue;
    totalImageBytes += buffer.length;
    if (totalImageBytes > 28 * 1024 * 1024) throw new Error('The combined illustration files are too large.');
    illustrations.push({
      heading,
      caption: String(mapping.caption || '').trim(),
      alt: String(mapping.alt || mapping.caption || heading).trim(),
      image: `data:${mime};base64,${buffer.toString('base64')}`,
      filename: imagePath
    });
  }
  if (!illustrations.length) throw new Error('No supported chapter illustrations were found in the ZIP. Use PNG, JPG, WEBP, or GIF files.');
  return { title, author, text, illustrations };
}

app.post('/api/illustrated-book/import', express.raw({
  type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
  limit: '35mb'
}), (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Choose an illustrated-book ZIP file.' });
    const zip = new AdmZip(req.body);
    const manifestEntry = zip.getEntry('manifest.json') || zip.getEntries().find((entry) => normalizeZipEntryName(entry.entryName).toLowerCase().endsWith('/manifest.json'));
    if (!manifestEntry) return res.status(400).json({ error: 'The ZIP must contain manifest.json.' });
    let manifest;
    try { manifest = JSON.parse(manifestEntry.getData().toString('utf8').replace(/^\uFEFF/, '')); }
    catch { return res.status(400).json({ error: 'manifest.json is not valid JSON.' }); }
    const result = safeIllustratedBookManifest(manifest, zip);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error?.message || 'The illustrated book could not be imported.' });
  }
});

app.get('/api/dictionary/:word', async (req, res) => {
  const word = String(req.params.word || '').trim().toLocaleLowerCase();
  if (!/^[\p{L}'’-]{1,80}$/u.test(word)) return res.status(400).json({ error: 'Enter a single valid word.' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'MarkSetGoWeb/1.5 (+dictionary lookup)', Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload)) return res.status(404).json({ error: `No English definition was found for “${word}”.` });
    const entry = payload[0] || {};
    let selected = null;
    for (const meaning of entry.meanings || []) {
      for (const definition of meaning.definitions || []) {
        if (definition?.definition) {
          selected = { definition: definition.definition, example: definition.example || '', partOfSpeech: meaning.partOfSpeech || '' };
          break;
        }
      }
      if (selected) break;
    }
    if (!selected) return res.status(404).json({ error: `No English definition was found for “${word}”.` });
    return res.json({ word: entry.word || word, phonetic: entry.phonetic || '', ...selected });
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'The dictionary service took too long to respond.' : 'The dictionary lookup failed.';
    return res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
});

app.post('/api/fetch-text', async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!url) return res.status(400).json({ error: 'A URL is required.' });
  try {
    const text = await fetchReadableText(url);
    if (!text) return res.status(422).json({ error: 'No readable text was found on that page.' });
    return res.json({ text: text.slice(0, 500000) });
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'The website took too long to respond.' : error?.message || 'The page could not be imported.';
    return res.status(400).json({ error: message });
  }
});

app.post('/api/translate', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const to = typeof req.body?.to === 'string' ? req.body.to.trim() : '';
  if (!text || !to) return res.status(400).json({ error: 'Text and a target language are required.' });
  if (text.length > MAX_TRANSLATION_CHARS) return res.status(413).json({ error: `Text is too long. The limit is ${MAX_TRANSLATION_CHARS.toLocaleString()} characters.` });

  try {
    const chunks = splitTranslationChunks(text);
    const translated = [];
    for (let index = 0; index < chunks.length; index += 90) {
      const batch = chunks.slice(index, index + 90);
      translated.push(...await azureTranslate(batch, to));
    }
    return res.json({ text: translated.join('\n\n') });
  } catch (error) {
    return res.status(502).json({ error: error?.message || 'Translation failed.' });
  }
});

app.post('/api/translate-word', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const from = typeof req.body?.from === 'string' ? req.body.from.trim() : '';
  if (!text || !from) return res.status(400).json({ error: 'A word and source language are required.' });
  if (text.length > 100) return res.status(400).json({ error: 'Select a single word or short phrase.' });
  try {
    const [translation] = await azureTranslate([text], 'en', from);
    return res.json({ text: translation || 'No translation was returned.' });
  } catch (error) {
    return res.status(502).json({ error: error?.message || 'Word translation failed.' });
  }
});



app.get('/api/gutenberg/books', async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 160) : '';
  const language = typeof req.query.language === 'string' ? req.query.language.trim().toLowerCase() : 'en';
  const page = Math.max(1, Math.min(1000, Number.parseInt(req.query.page, 10) || 1));
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set('search', search);
  if (/^[a-z]{2}$/.test(language)) params.set('languages', language);

  try {
    const payload = await fetchJsonWithRetry(`${GUTENDEX_BASE}/books/?${params}`, { timeoutMs: 22000, attempts: 2, cacheTtlMs: 10 * 60 * 1000 });
    const books = Array.isArray(payload?.results) ? payload.results.map(normalizeGutenbergBook) : [];
    return res.json({
      count: Number(payload?.count || 0),
      page,
      hasNext: Boolean(payload?.next),
      hasPrevious: Boolean(payload?.previous),
      books
    });
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'The Gutenberg catalog is responding slowly. Please try again in a moment.' : error?.message || 'The Gutenberg catalog could not be loaded.';
    return res.status(502).json({ error: message });
  }
});

app.get('/api/gutenberg/books/:id/text', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Gutenberg book number.' });

  try {
    const cached = readCachedGutenbergBook(id);
    if (cached) {
      return res.json({
        id,
        title: cached.metadata.title || `Project Gutenberg eBook #${id}`,
        authors: Array.isArray(cached.metadata.authors) ? cached.metadata.authors : [],
        text: cached.text,
        sourceUrl: cached.metadata.sourceUrl || `https://www.gutenberg.org/ebooks/${id}`,
        cached: true
      });
    }

    const payload = await fetchJsonWithRetry(`${GUTENDEX_BASE}/books/${id}`, { timeoutMs: 22000, attempts: 2, cacheTtlMs: 30 * 60 * 1000 });
    const catalogTextUrl = selectGutenbergTextUrl(payload?.formats);
    if (!catalogTextUrl) return res.status(422).json({ error: 'This title does not have a plain-text edition available through the catalog.' });

    const downloaded = await downloadGutenbergTextFromMirrors(id, catalogTextUrl);
    const metadata = {
      id,
      title: String(payload?.title || `Project Gutenberg eBook #${id}`),
      authors: Array.isArray(payload?.authors) ? payload.authors.map((author) => author?.name).filter(Boolean) : [],
      sourceUrl: `https://www.gutenberg.org/ebooks/${id}`,
      downloadedFrom: downloaded.downloadedFrom,
      cachedAt: new Date().toISOString()
    };
    writeCachedGutenbergBook(id, downloaded.text, metadata);

    return res.json({
      id,
      title: metadata.title,
      authors: metadata.authors,
      text: downloaded.text,
      sourceUrl: metadata.sourceUrl,
      cached: false
    });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'The free-text mirrors took too long to respond.'
      : error?.message || 'The book could not be loaded.';
    return res.status(502).json({
      error: message,
      landingPage: `https://www.gutenberg.org/ebooks/${id}`
    });
  }
});


app.post('/api/current/article', async (req, res) => {
  const url = String(req.body?.url || '').trim();
  const title = String(req.body?.title || 'Article').trim();
  const summary = String(req.body?.summary || '').trim();
  const source = String(req.body?.source || 'Feed').trim();
  if (!url) return res.status(400).json({ error: 'The article URL is missing.' });
  try {
    const articleText = await fetchArticleForFeed(url, title);
    return res.json({
      title,
      fullArticle: true,
      text: `${title}\n\n${articleText}\n\nSource: ${source}\n${url}`
    });
  } catch (error) {
    if (summary) {
      return res.json({
        title,
        fullArticle: false,
        text: `${title}\n\n${summary}\n\nFull article text could not be imported from the publisher.\n\nSource: ${source}\n${url}`,
        warning: error?.message || 'The publisher did not expose readable article text.'
      });
    }
    const message = error?.name === 'AbortError'
      ? 'The article took too long to respond.'
      : error?.message || 'The article could not be imported.';
    return res.status(502).json({ error: message });
  }
});

app.get('/api/current/sources', (_req, res) => {
  return res.json({ sources: CURRENT_READING_SOURCES.map(({ feedUrl, ...source }) => source) });
});

app.get('/api/current/feed/:id', async (req, res) => {
  const source = CURRENT_READING_SOURCES.find((item) => item.id === req.params.id);
  if (!source) return res.status(404).json({ error: 'Unknown reading source.' });
  try {
    const items = await fetchFeedItems(source);
    return res.json({ source: { id: source.id, category: source.category, name: source.name, description: source.description, siteUrl: source.siteUrl }, items });
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'The feed took too long to respond.' : error?.message || 'The feed could not be loaded.';
    return res.status(502).json({ error: message });
  }
});

let billboardCache = { expiresAt: 0, payload: null };

function tidyChartText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseChartRows(html) {
  const $ = cheerio.load(html);
  const songs = [];
  const seen = new Set();
  const rowSelectors = [
    'li.o-chart-results-list__item',
    '.chart-item',
    '.chart-results-list__item',
    '[class*="chart-item"]',
    '[class*="chart-results-item"]'
  ];
  const rows = $(rowSelectors.join(',')).toArray();
  for (const row of rows) {
    const item = $(row);
    const rankText = tidyChartText(item.find('.chart-position, .position, [class*="position"], .c-label').first().text());
    const rankMatch = rankText.match(/\b(\d{1,3})\b/);
    const rank = rankMatch ? Number(rankMatch[1]) : songs.length + 1;
    const title = tidyChartText(item.find('h3#title-of-a-story, .chart-name, .title, [class*="chart-name"], [class*="track-title"], h2, h3').first().text());
    const artist = tidyChartText(item.find('.chart-artist, .artist, [class*="chart-artist"], [class*="artist-name"], .c-label.a-no-trucate').first().text());
    if (!title || !artist || title.length > 180 || artist.length > 180) continue;
    const key = `${title.toLowerCase()}|${artist.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    songs.push({ rank, title, artist });
    if (songs.length >= 25) break;
  }
  return songs.sort((a, b) => a.rank - b.rank).slice(0, 25);
}

async function fetchChartHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MarkSetGoWeb/1.5; +music chart reader)',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!response.ok) throw new Error(`Chart source returned HTTP ${response.status}.`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

app.get('/api/music/billboard', async (_req, res) => {
  if (billboardCache.payload && billboardCache.expiresAt > Date.now()) return res.json(billboardCache.payload);
  const sources = [
    { url: 'https://www.officialcharts.com/charts/billboard-hot-100-chart/', name: 'Official Charts' },
    { url: 'https://ca.billboard.com/charts/hot-100', name: 'Billboard Canada' },
    { url: 'https://www.billboard.com/charts/hot-100/', name: 'Billboard' }
  ];
  let lastError;
  for (const source of sources) {
    try {
      const html = await fetchChartHtml(source.url);
      const songs = parseChartRows(html);
      if (songs.length >= 10) {
        const $ = cheerio.load(html);
        const chartDate = tidyChartText($('time, [class*="chart-date"], [class*="date-selector"]').first().text()).slice(0, 80);
        const payload = { songs, chartDate, source: source.name, sourceUrl: source.url };
        billboardCache = { payload, expiresAt: Date.now() + (30 * 60 * 1000) };
        return res.json(payload);
      }
      lastError = new Error('The chart layout was not recognized.');
    } catch (error) {
      lastError = error;
    }
  }
  return res.status(502).json({ error: lastError?.message || 'The Billboard chart is temporarily unavailable.' });
});

app.get('/api/news', async (_req, res) => {
  try {
    const text = await fetchReadableText('https://legiblenews.com/');
    return res.json({ text: text.slice(0, 500000) });
  } catch (error) {
    return res.status(502).json({ error: error?.message || 'News could not be loaded.' });
  }
});

const weatherCache = new Map();

async function fetchJsonWithTimeout(url, { timeoutMs = 20000, headers = {} } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mark-Set-Go-Reader/1.0 (public reading application)',
        ...headers
      }
    });
    if (!response.ok) throw new Error(`Weather service returned ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function weatherDayLabel(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  }).format(date);
}

function formatWeatherAsReaderText(location, days) {
  const sections = [`Weather for ${location}`];
  for (const day of days) {
    sections.push('', day.label.toUpperCase());
    for (const period of day.periods) {
      const precipitation = Number.isFinite(period.precipitation)
        ? ` Chance of precipitation: ${period.precipitation}%.`
        : '';
      sections.push(
        '',
        `${period.name}: ${period.temperature}°${period.temperatureUnit}. ${period.shortForecast}.`,
        `${period.detailedForecast}${precipitation} Wind ${period.windSpeed} ${period.windDirection}.`
      );
    }
  }
  return sections.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

app.get('/api/weather', async (req, res) => {
  const zip = String(req.query.zip || '').trim();
  if (!/^\d{5}$/.test(zip)) {
    return res.status(400).json({ error: 'Enter a valid five-digit U.S. ZIP code.' });
  }

  const cached = weatherCache.get(zip);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.payload);

  try {
    const placeData = await fetchJsonWithTimeout(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`);
    const place = placeData.places?.[0];
    if (!place) throw new Error('That ZIP code could not be located.');

    const latitude = Number(place.latitude);
    const longitude = Number(place.longitude);
    const pointData = await fetchJsonWithTimeout(`https://api.weather.gov/points/${latitude},${longitude}`);
    const forecastUrl = pointData.properties?.forecast;
    if (!forecastUrl) throw new Error('A forecast is not available for that location.');

    const forecastData = await fetchJsonWithTimeout(forecastUrl);
    const rawPeriods = forecastData.properties?.periods || [];
    const grouped = new Map();

    for (const period of rawPeriods) {
      const dateKey = String(period.startTime || '').slice(0, 10);
      if (!dateKey) continue;
      if (!grouped.has(dateKey)) grouped.set(dateKey, []);
      grouped.get(dateKey).push({
        name: period.name || (period.isDaytime ? 'Day' : 'Night'),
        isDaytime: Boolean(period.isDaytime),
        temperature: period.temperature,
        temperatureUnit: period.temperatureUnit || 'F',
        windSpeed: period.windSpeed || 'Calm',
        windDirection: period.windDirection || '',
        shortForecast: period.shortForecast || '',
        detailedForecast: period.detailedForecast || period.shortForecast || '',
        precipitation: period.probabilityOfPrecipitation?.value ?? null,
        startTime: period.startTime,
        endTime: period.endTime
      });
    }

    const days = [...grouped.entries()].slice(0, 7).map(([date, periods]) => ({
      date,
      label: weatherDayLabel(date),
      periods
    }));
    const location = `${place['place name']}, ${place['state abbreviation']}`;
    const payload = {
      zip,
      location,
      updated: forecastData.properties?.updated || new Date().toISOString(),
      days,
      text: formatWeatherAsReaderText(location, days)
    };
    weatherCache.set(zip, { payload, expiresAt: Date.now() + (15 * 60 * 1000) });
    return res.json(payload);
  } catch (error) {
    return res.status(502).json({ error: error?.message || 'Weather could not be loaded.' });
  }
});



// Unified public-library search and reading endpoints.
const librarySearchCache = new Map();
const LIBRARY_CACHE_MS = 15 * 60 * 1000;

async function fetchBuffer(url, { timeoutMs = 25000, maxBytes = 18 * 1024 * 1024, headers = {} } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'MarkSetGoWeb/2.0 (+public-domain reader)', Accept: '*/*', ...headers }
    });
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared && declared > maxBytes) throw new Error('That book file is too large to open in the browser reader.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error('That book file is too large to open in the browser reader.');
    return { buffer, contentType: response.headers.get('content-type') || '', finalUrl: response.url };
  } finally { clearTimeout(timeout); }
}

function cleanLibraryText(text) {
  return String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
}

function epubBufferToText(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory && /\.(x?html?|xml)$/i.test(entry.entryName));
  const preferred = entries.filter((entry) => !/(nav|toc|container)\.(x?html?|xml)$/i.test(entry.entryName));
  const parts = (preferred.length ? preferred : entries).map((entry) => {
    try {
      const html = entry.getData().toString('utf8');
      const $ = cheerio.load(html);
      $('script,style,nav,svg').remove();
      $('h1,h2,h3,h4,h5,h6,p,blockquote,li,br').each((_i, node) => $(node).append('\n'));
      return $.root().text().replace(/\u00a0/g, ' ');
    } catch { return ''; }
  }).filter(Boolean);
  return cleanLibraryText(parts.join('\n\n'));
}

function authorNames(value) {
  if (!Array.isArray(value)) return '';
  return value.map((item) => typeof item === 'string' ? item : item?.name).filter(Boolean).join(', ');
}

async function searchOpenLibrary(q) {
  const params = new URLSearchParams({ q, limit: '12', fields: 'key,title,author_name,first_publish_year,cover_i,language,edition_key,public_scan_b,ia' });
  const payload = await fetchJsonWithRetry(`https://openlibrary.org/search.json?${params}`, { timeoutMs: 18000, attempts: 2, cacheTtlMs: LIBRARY_CACHE_MS });
  return (payload.docs || []).slice(0, 10).map((book) => ({
    provider: 'openlibrary', id: String(book.key || '').replace('/works/', ''), title: book.title || 'Untitled',
    author: authorNames(book.author_name), year: book.first_publish_year || '', language: Array.isArray(book.language) ? book.language[0] : '',
    cover: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg` : '', readable: false,
    externalUrl: book.key ? `https://openlibrary.org${book.key}` : 'https://openlibrary.org/',
    description: book.public_scan_b ? 'A public scan may be available from a linked archive.' : 'Edition and catalog information from Open Library.'
  }));
}

async function searchInternetArchive(q) {
  const query = `(title:(${JSON.stringify(q)}) OR creator:(${JSON.stringify(q)})) AND mediatype:texts`;
  const params = new URLSearchParams({ q: query, fl: 'identifier,title,creator,date,language,description', rows: '12', page: '1', output: 'json', sort: 'downloads desc' });
  const payload = await fetchJsonWithRetry(`https://archive.org/advancedsearch.php?${params}`, { timeoutMs: 20000, attempts: 2, cacheTtlMs: LIBRARY_CACHE_MS });
  return (payload.response?.docs || []).slice(0, 10).map((book) => ({
    provider: 'internetarchive', id: book.identifier, title: Array.isArray(book.title) ? book.title[0] : book.title || 'Untitled',
    author: Array.isArray(book.creator) ? book.creator.join(', ') : book.creator || '', year: String(book.date || '').slice(0,4),
    language: Array.isArray(book.language) ? book.language[0] : book.language || '', cover: `https://archive.org/services/img/${encodeURIComponent(book.identifier)}`,
    readable: true, externalUrl: `https://archive.org/details/${encodeURIComponent(book.identifier)}`,
    description: stripMarkup(Array.isArray(book.description) ? book.description[0] : book.description || '').slice(0, 280)
  }));
}

async function searchWikisource(q) {
  const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: q, gsrnamespace: '0', gsrlimit: '10', prop: 'extracts|info|pageimages', exintro: '1', explaintext: '1', exchars: '280', inprop: 'url', piprop: 'thumbnail', pithumbsize: '300', format: 'json', origin: '*' });
  const payload = await fetchJsonWithRetry(`https://en.wikisource.org/w/api.php?${params}`, { timeoutMs: 18000, attempts: 2, cacheTtlMs: LIBRARY_CACHE_MS });
  return Object.values(payload.query?.pages || {}).map((page) => ({
    provider: 'wikisource', id: String(page.pageid), title: page.title || 'Untitled', author: '', language: 'English',
    cover: page.thumbnail?.source || '', readable: true, externalUrl: page.fullurl || `https://en.wikisource.org/?curid=${page.pageid}`,
    description: page.extract || 'Proofread text from Wikisource.'
  }));
}

async function searchStandardEbooks(q) {
  const url = 'https://standardebooks.org/opds/all';
  const { buffer } = await fetchBuffer(url, { timeoutMs: 25000, maxBytes: 8 * 1024 * 1024, headers: { Accept: 'application/atom+xml,application/xml,text/xml' } });
  const $ = cheerio.load(buffer.toString('utf8'), { xmlMode: true });
  const needle = q.toLowerCase();
  const results = [];
  $('entry').each((_i, node) => {
    if (results.length >= 10) return;
    const entry = $(node); const title = entry.find('title').first().text().trim();
    const author = entry.find('author name').map((_j, n) => $(n).text().trim()).get().join(', ');
    if (!`${title} ${author}`.toLowerCase().includes(needle)) return;
    const acquisition = entry.find('link').filter((_j,n) => /opds-spec\.org\/acquisition/i.test($(n).attr('rel') || '') && /epub/i.test($(n).attr('type') || '')).first().attr('href') || '';
    const alternate = entry.find('link[rel="alternate"]').first().attr('href') || entry.find('id').first().text().trim();
    const cover = entry.find('link').filter((_j,n) => /image\/jpeg|image\/png/i.test($(n).attr('type') || '')).first().attr('href') || '';
    const id = Buffer.from(acquisition || alternate).toString('base64url');
    results.push({ provider: 'standardebooks', id, title, author, language: 'English', format: 'EPUB', cover, readable: Boolean(acquisition), externalUrl: alternate, description: stripMarkup(entry.find('summary,content').first().text()).slice(0,280) });
  });
  return results;
}

async function searchGutenbergUnified(q) {
  const params = new URLSearchParams({ search: q, languages: 'en' });
  const payload = await fetchJsonWithRetry(`${GUTENDEX_BASE}/books/?${params}`, { timeoutMs: 18000, attempts: 1, cacheTtlMs: LIBRARY_CACHE_MS });
  return (payload.results || []).slice(0, 10).map((raw) => { const book = normalizeGutenbergBook(raw); return {
    provider: 'gutenberg', id: String(book.id), title: book.title, author: book.authors.join(', '), language: book.languages.join(', '),
    cover: book.cover, readable: true, externalUrl: book.gutenbergUrl, description: book.subjects.slice(0,2).join(' · '), format: 'Plain text'
  }; });
}

app.get('/api/library/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 160);
  const provider = String(req.query.provider || 'all').toLowerCase();
  if (q.length < 2) return res.status(400).json({ error: 'Enter at least two characters to search.' });
  const available = { standardebooks: searchStandardEbooks, internetarchive: searchInternetArchive, openlibrary: searchOpenLibrary, wikisource: searchWikisource, gutenberg: searchGutenbergUnified };
  if (provider !== 'all' && !available[provider]) return res.status(400).json({ error: 'Unknown library source.' });
  const cacheKey = `${provider}:${q.toLowerCase()}`;
  const cached = librarySearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.payload);
  const targets = provider === 'all' ? Object.entries(available) : [[provider, available[provider]]];
  const settled = await Promise.allSettled(targets.map(async ([name, fn]) => [name, await fn(q)]));
  const books = []; const errors = [];
  settled.forEach((result, index) => {
    const name = targets[index][0];
    if (result.status === 'fulfilled') books.push(...result.value[1]); else errors.push({ provider: name, error: result.reason?.message || 'Unavailable' });
  });
  const payload = { query: q, provider, books: books.slice(0, provider === 'all' ? 30 : 15), errors };
  if (books.length) librarySearchCache.set(cacheKey, { payload, expiresAt: Date.now() + LIBRARY_CACHE_MS });
  if (!books.length && errors.length === targets.length) return res.status(502).json({ error: 'The selected libraries could not be reached. Please try again shortly.', details: errors });
  return res.json(payload);
});

async function readInternetArchive(id) {
  const metadata = await fetchJsonWithRetry(`https://archive.org/metadata/${encodeURIComponent(id)}`, { timeoutMs: 22000, attempts: 2, cacheTtlMs: LIBRARY_CACHE_MS });
  const files = Array.isArray(metadata.files) ? metadata.files : [];
  const choose = (patterns) => files.find((file) => patterns.some((pattern) => pattern.test(file.name || '')) && Number(file.size || 0) < 18 * 1024 * 1024);
  const file = choose([/_djvu\.txt$/i, /\.txt$/i]) || choose([/\.epub$/i]);
  if (!file) throw new Error('No readable text or EPUB file was found for this Internet Archive item.');
  const sourceUrl = `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(file.name).replace(/%2F/g, '/')}`;
  const { buffer } = await fetchBuffer(sourceUrl);
  const text = /\.epub$/i.test(file.name) ? epubBufferToText(buffer) : cleanLibraryText(buffer.toString('utf8'));
  if (text.length < 200) throw new Error('The selected archive file did not contain enough readable text.');
  return { title: metadata.metadata?.title || id, author: Array.isArray(metadata.metadata?.creator) ? metadata.metadata.creator.join(', ') : metadata.metadata?.creator || '', text, sourceUrl: `https://archive.org/details/${encodeURIComponent(id)}` };
}

async function readWikisource(id) {
  const params = new URLSearchParams({ action: 'query', pageids: id, prop: 'extracts|info', explaintext: '1', redirects: '1', inprop: 'url', format: 'json', origin: '*' });
  const payload = await fetchJsonWithRetry(`https://en.wikisource.org/w/api.php?${params}`, { timeoutMs: 22000, attempts: 2, cacheTtlMs: LIBRARY_CACHE_MS });
  const page = Object.values(payload.query?.pages || {})[0];
  const text = cleanLibraryText(page?.extract || '');
  if (text.length < 200) throw new Error('This Wikisource page does not expose enough readable text through the API.');
  return { title: page.title || 'Wikisource text', author: '', text, sourceUrl: page.fullurl || `https://en.wikisource.org/?curid=${id}` };
}

async function readStandardEbooks(id) {
  let sourceUrl = '';
  try { sourceUrl = Buffer.from(id, 'base64url').toString('utf8'); } catch {}
  if (!/^https:\/\//i.test(sourceUrl)) throw new Error('Invalid Standard Ebooks download address.');
  const parsed = new URL(sourceUrl);
  if (parsed.hostname !== 'standardebooks.org' && !parsed.hostname.endsWith('.standardebooks.org')) throw new Error('Invalid Standard Ebooks download host.');
  const { buffer } = await fetchBuffer(sourceUrl);
  const text = epubBufferToText(buffer);
  if (text.length < 200) throw new Error('The Standard Ebooks file did not contain enough readable text.');
  const title = sourceUrl.split('/').filter(Boolean).at(-1)?.replace(/\.epub.*$/i, '').replaceAll('-', ' ') || 'Standard Ebook';
  return { title, author: '', text, sourceUrl };
}

app.get('/api/library/read', async (req, res) => {
  const provider = String(req.query.provider || '').toLowerCase();
  const id = String(req.query.id || '').trim().slice(0, 700);
  if (!id) return res.status(400).json({ error: 'A book identifier is required.' });
  try {
    if (provider === 'internetarchive') return res.json(await readInternetArchive(id));
    if (provider === 'wikisource') return res.json(await readWikisource(id));
    if (provider === 'standardebooks') return res.json(await readStandardEbooks(id));
    if (provider === 'gutenberg') {
      const numericId = Number.parseInt(id, 10);
      const cached = readCachedGutenbergBook(numericId);
      if (cached) return res.json({ title: cached.metadata.title, author: (cached.metadata.authors || []).join(', '), text: cached.text, sourceUrl: cached.metadata.sourceUrl });
      const payload = await fetchJsonWithRetry(`${GUTENDEX_BASE}/books/${numericId}`, { timeoutMs: 20000, attempts: 1, cacheTtlMs: LIBRARY_CACHE_MS });
      const downloaded = await downloadGutenbergTextFromMirrors(numericId, selectGutenbergTextUrl(payload?.formats));
      return res.json({ title: payload.title || `Project Gutenberg eBook #${numericId}`, author: authorNames(payload.authors), text: downloaded.text, sourceUrl: `https://www.gutenberg.org/ebooks/${numericId}` });
    }
    return res.status(422).json({ error: 'This source provides discovery or borrowing links but not direct text for the reader.' });
  } catch (error) {
    return res.status(502).json({ error: error?.name === 'AbortError' ? 'The book source took too long to respond.' : error?.message || 'The book could not be opened.' });
  }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
const server = app.listen(PORT, () => console.log(`Mark, Set, Go! is running at http://localhost:${PORT}`));

async function shutdown(signal) {
  console.log(`${signal} received; shutting down.`);
  server.close(async () => {
    await closeDatabase().catch((error) => console.error('Database shutdown error:', error.message));
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
