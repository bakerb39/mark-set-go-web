'use strict';

const express = require('express');
const cheerio = require('cheerio');
const dns = require('node:dns').promises;
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
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
const MAX_ACCOUNT_DOCUMENT_BYTES = 5 * 1024 * 1024;
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


function directUrlFromEmbeddedText(value, preferredHost = '') {
  const raw = String(value || '');
  if (!raw) return '';

  const normalized = raw
    .replace(/\\u002f/gi, '/')
    .replace(/\\u003a/gi, ':')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&');

  const candidates = new Set();

  const addCandidate = (candidate) => {
    if (!candidate) return;
    let value = String(candidate)
      .replace(/^[("'[\s]+/, '')
      .replace(/[)"'\]>,;\s]+$/, '');
    try { value = decodeURIComponent(value); } catch {}
    if (/^https?:\/\//i.test(value)) candidates.add(value);
  };

  for (const match of normalized.matchAll(/https?:\/\/[^\s"'<>\\]+/gi)) addCandidate(match[0]);
  for (const match of normalized.matchAll(/https?%3A%2F%2F[^\s"'<>\\]+/gi)) addCandidate(match[0]);

  const preferred = String(preferredHost || '').toLowerCase().replace(/^www\./, '');
  const blockedHosts = [
    'news.google.com', 'google.com', 'www.google.com', 'gstatic.com', 'googleusercontent.com',
    'w3.org', 'www.w3.org', 'schema.org', 'www.schema.org',
    'purl.org', 'www.purl.org', 'xmlns.com', 'www.xmlns.com'
  ];

  const ranked = [...candidates].map((url) => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      if (blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) return null;

      const preferredMatch = Boolean(preferred) &&
        (host === preferred || host.endsWith(`.${preferred}`) || preferred.endsWith(`.${host}`));

      // If we know the publisher hostname, do not accept random URLs embedded in
      // XML namespaces, tracking markup, ads, schema metadata, or related links.
      if (preferred && !preferredMatch) return null;

      const pathScore = parsed.pathname.split('/').filter(Boolean).length;
      return { url: parsed.toString(), preferredMatch, pathScore };
    } catch {
      return null;
    }
  }).filter(Boolean);

  ranked.sort((a, b) =>
    Number(b.preferredMatch) - Number(a.preferredMatch) ||
    b.pathScore - a.pathScore
  );

  return ranked[0]?.url || '';
}

async function directUrlFromGoogleNewsPage(rawUrl, publisherUrl = '') {
  const googleUrl = await validatePublicUrl(rawUrl);
  let preferredHost = '';
  try { preferredHost = publisherUrl ? new URL(publisherUrl).hostname : ''; } catch {}

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(googleUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MarkSetGoWeb/2.6; +google-news-resolver)',
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.1'
      }
    });
    if (!response.ok) return '';

    const html = await response.text();

    // The Google News wrapper often carries the real publisher URL somewhere in
    // its HTML/serialized page data even when the HTTP redirect itself stays on Google.
    let direct = directUrlFromEmbeddedText(html, preferredHost);
    if (direct) return direct;

    const $ = cheerio.load(html);
    const hrefs = $('a[href]').toArray().map((element) => $(element).attr('href')).filter(Boolean);
    direct = directUrlFromEmbeddedText(hrefs.join('\n'), preferredHost);
    return direct || '';
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
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
      const googleOrPrimaryLink = atomLink || rssLink || item.find('guid').first().text().trim();

      const title = stripMarkup(item.find('title').first().text()) || 'Untitled article';
      const rawDescription =
        item.find('description').first().text() ||
        item.find('summary').first().text() ||
        item.find('content\\:encoded').first().text() ||
        item.find('content').first().text();

      const sourceElement = item.children('source').first();
      let sourceUrl = sourceElement.attr('url') || '';
      if (sourceUrl && /w3\.org|schema\.org|xmlns\.com|purl\.org/i.test(sourceUrl)) sourceUrl = '';

      let preferredHost = '';
      try { preferredHost = sourceUrl ? new URL(sourceUrl).hostname : ''; } catch {}

      // IMPORTANT: inspect the raw RSS description before stripMarkup removes links.
      // If Google embeds a direct publisher URL in the item content, use that URL
      // instead of the opaque news.google.com wrapper.
      const embeddedPublisherUrl = directUrlFromEmbeddedText(rawDescription, preferredHost);
      const link = embeddedPublisherUrl || googleOrPrimaryLink;

      const published =
        item.find('pubDate').first().text() ||
        item.find('published').first().text() ||
        item.find('updated').first().text();

      return {
        title,
        link,
        googleLink: embeddedPublisherUrl ? googleOrPrimaryLink : '',
        sourceUrl,
        summary: stripMarkup(rawDescription).slice(0, 1800),
        published
      };
    }).filter((item) => item.link && /^https?:\/\//i.test(item.link));
  } finally {
    clearTimeout(timeout);
  }
}


async function discoverPublisherFeed(rawUrl) {
  const parsed = await validatePublicUrl(rawUrl);
  const origin = parsed.origin;
  const candidates = [];
  const seen = new Set();

  const add = (value) => {
    if (!value) return;
    let absolute = '';
    try { absolute = new URL(value, parsed).toString(); } catch { return; }
    if (!/^https?:\/\//i.test(absolute) || seen.has(absolute)) return;
    seen.add(absolute);
    candidates.push(absolute);
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(parsed, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MarkSetGoWeb/2.3; +feed discovery)',
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.1'
      }
    });
    if (response.ok) {
      const html = await response.text();
      const $ = cheerio.load(html);
      $('link[rel="alternate"]').each((_i, element) => {
        const type = String($(element).attr('type') || '').toLowerCase();
        const href = $(element).attr('href');
        if (href && (type.includes('rss') || type.includes('atom') || type.includes('xml'))) add(href);
      });
    }
  } catch (_) {
    // Continue to conventional feed paths.
  } finally {
    clearTimeout(timeout);
  }

  [
    '/feed', '/feed/', '/rss', '/rss/', '/rss.xml', '/feed.xml',
    '/atom.xml', '/index.xml', '/feeds/posts/default?alt=rss'
  ].forEach((path) => add(new URL(path, origin).toString()));

  for (const feedUrl of candidates.slice(0, 12)) {
    try {
      const items = await fetchFeedItems({ feedUrl });
      if (items.length) return { feedUrl, items };
    } catch (_) {}
  }

  return null;
}


function samePublisherHost(a, b) {
  const normalize = (host) => String(host || '').toLowerCase().replace(/^www\./, '');
  const left = normalize(a);
  const right = normalize(b);
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function likelyArticlePath(pathname = '') {
  const path = String(pathname || '').toLowerCase();
  if (!path || path === '/' || path.length < 8) return false;
  if (/\/(?:tag|tags|author|authors|category|categories|topic|topics|page|search|about|contact|privacy|terms|newsletter|podcast|video|videos|markets?|news)\/?$/.test(path)) return false;
  if (/\.(?:jpg|jpeg|png|gif|webp|svg|pdf|xml|rss|atom|css|js)$/i.test(path)) return false;
  const segments = path.split('/').filter(Boolean);
  return segments.length >= 2 || /-\w+-\w+/.test(path);
}

async function discoverPublisherPageArticles(rawUrl, topic = '') {
  const parsed = await validatePublicUrl(rawUrl);
  const origin = parsed.origin;

  const pageCandidates = [];
  const seenPages = new Set();
  const addPage = (value) => {
    try {
      const url = new URL(value, parsed).toString();
      if (!seenPages.has(url)) {
        seenPages.add(url);
        pageCandidates.push(url);
      }
    } catch {}
  };

  addPage(parsed.toString());
  ['/news', '/latest', '/articles', '/blog', '/markets'].forEach((path) => addPage(new URL(path, origin).toString()));

  const topicWords = String(topic || '').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3);
  const results = [];
  const seenUrls = new Set();

  for (const pageUrl of pageCandidates.slice(0, 6)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(await validatePublicUrl(pageUrl), {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MarkSetGoWeb/2.4; +publisher discovery)',
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.1'
        }
      });
      if (!response.ok) continue;
      const html = await response.text();
      const $ = cheerio.load(html);
      const pageBase = response.url || pageUrl;

      $('a[href]').each((_i, element) => {
        const anchor = $(element);
        const label = stripMarkup(anchor.text()).replace(/\s+/g, ' ').trim();
        if (label.length < 24 || label.length > 220) return;

        let absolute;
        try { absolute = new URL(anchor.attr('href'), pageBase); } catch { return; }
        if (!/^https?:$/.test(absolute.protocol)) return;
        if (!samePublisherHost(absolute.hostname, parsed.hostname)) return;
        if (!likelyArticlePath(absolute.pathname)) return;

        const cleanUrl = absolute.toString().split('#')[0];
        if (seenUrls.has(cleanUrl)) return;

        const lowerLabel = label.toLowerCase();
        const topicMatch = !topicWords.length || topicWords.some((word) => lowerLabel.includes(word));
        const articleClassHint = `${anchor.attr('class') || ''} ${anchor.parent().attr('class') || ''} ${anchor.closest('article').attr('class') || ''}`.toLowerCase();
        const structuralHint = Boolean(anchor.closest('article').length) || /article|story|post|headline|title|card/.test(articleClassHint);

        // Keep obvious article links even when the exact topic word is absent.
        if (!topicMatch && !structuralHint) return;

        const container = anchor.closest('article').length ? anchor.closest('article') : anchor.parent();
        const summary = stripMarkup(container.find('p').first().text()).slice(0, 1800);
        const timeText = container.find('time').first().attr('datetime') || container.find('time').first().text() || '';

        seenUrls.add(cleanUrl);
        results.push({
          title: label,
          link: cleanUrl,
          summary,
          published: String(timeText || '').trim()
        });
      });

      if (results.length >= 20) break;
    } catch (_) {
      // Try the next likely listing page.
    } finally {
      clearTimeout(timeout);
    }
  }

  return results.slice(0, 30);
}


app.disable('x-powered-by');
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false, limit: '8mb' }));
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
    res.json({ ok: true, version: '7.7.15.4', database, betaAccessEnabled: BETA_ACCESS_ENABLED });
  } catch (error) {
    res.status(503).json({ ok: false, version: '7.7.15.4', database: { configured: databaseConfigured(), connected: false, error: error.message }, betaAccessEnabled: BETA_ACCESS_ENABLED });
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
  const client = await pool?.connect().catch(() => null);
  try {
    const user = await requireAccountUser(req, res);
    if (!user) return;
    if (!client) return res.status(503).json({ error: 'The account database is unavailable.' });

    await client.query(`
      delete from library_books b
      where b.user_id = $1
        and not exists (
          select 1
          from account_documents d
          where d.user_id = b.user_id
            and d.book_id = b.id
        )
    `, [user.id]);

    const result = await client.query(`
      select b.id, b.client_record_id, b.title, b.author, b.source_type, b.source_id,
             b.source_url, b.cover_url, b.metadata, b.added_at, b.updated_at,
             p.mode, p.playback_index, p.viewport_anchor_index, p.viewport_offset_px,
             p.word_index, p.scroll_ratio, p.page_number, p.position_data,
             p.updated_at as progress_updated_at,
             d.content_gzip, d.raw_bytes as document_raw_bytes,
             d.compressed_bytes as document_compressed_bytes,
             d.updated_at as document_updated_at
      from library_books b
      join account_documents d on d.user_id = b.user_id and d.book_id = b.id
      left join reading_positions p on p.user_id = b.user_id and p.book_id = b.id
      where b.user_id = $1
      order by coalesce(p.updated_at, d.updated_at, b.updated_at) desc
    `, [user.id]);

    const books = [];
    const invalidIds = [];

    for (const row of result.rows) {
      let readable = false;
      try {
        if (row.content_gzip && Number(row.document_raw_bytes) > 0 && Number(row.document_compressed_bytes) > 0) {
          const text = zlib.gunzipSync(row.content_gzip).toString('utf8');
          readable = Boolean(text.trim());
        }
      } catch (_) {
        readable = false;
      }

      if (!readable) {
        invalidIds.push(row.id);
        continue;
      }

      const { content_gzip, ...book } = row;
      books.push({ ...book, document_stored: true });
    }

    if (invalidIds.length) {
      await client.query(
        'delete from library_books where user_id = $1 and id = any($2::uuid[])',
        [user.id, invalidIds]
      );
    }

    res.json({ books });
  } catch (error) {
    console.error('Library load failed:', error);
    res.status(500).json({ error: 'Unable to load the library.' });
  } finally {
    client?.release();
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

app.get('/api/account/library/:bookId/document/info', async (req, res) => {
  try {
    const user = await requireAccountUser(req, res);
    if (!user) return;
    const result = await query(`
      select d.raw_bytes, d.compressed_bytes, d.content_sha256, d.updated_at
      from account_documents d
      join library_books b on b.id = d.book_id and b.user_id = d.user_id
      where d.user_id = $1 and d.book_id = $2
    `, [user.id, req.params.bookId]);
    res.json({ document: result.rows[0] || null, maxRawBytes: MAX_ACCOUNT_DOCUMENT_BYTES });
  } catch (error) {
    console.error('Document info load failed:', error);
    res.status(500).json({ error: 'Unable to load document storage information.' });
  }
});

app.get('/api/account/library/:bookId/document', async (req, res) => {
  try {
    const user = await requireAccountUser(req, res);
    if (!user) return;
    const result = await query(`
      select d.content_gzip, d.raw_bytes, d.compressed_bytes, d.content_sha256, d.updated_at,
             b.title, b.author, b.source_type, b.source_id, b.source_url, b.metadata
      from account_documents d
      join library_books b on b.id = d.book_id and b.user_id = d.user_id
      where d.user_id = $1 and d.book_id = $2
    `, [user.id, req.params.bookId]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Cloud document not found.' });
    const text = zlib.gunzipSync(row.content_gzip).toString('utf8');
    res.json({
      document: {
        text,
        rawBytes: row.raw_bytes,
        compressedBytes: row.compressed_bytes,
        sha256: row.content_sha256,
        updatedAt: row.updated_at,
        title: row.title,
        author: row.author,
        source: {
          type: row.source_type,
          id: row.source_id,
          url: row.source_url,
          ...(row.metadata?.source || {})
        }
      }
    });
  } catch (error) {
    console.error('Document load failed:', error);
    res.status(500).json({ error: 'Unable to load the cloud document.' });
  }
});

app.put('/api/account/library/:bookId/document', express.text({ type: 'text/plain', limit: '6mb' }), async (req, res) => {
  try {
    const user = await requireAccountUser(req, res);
    if (!user) return;
    const owned = await query('select id from library_books where id = $1 and user_id = $2', [req.params.bookId, user.id]);
    if (!owned.rows[0]) return res.status(404).json({ error: 'Book not found.' });
    const text = typeof req.body === 'string' ? req.body : '';
    const raw = Buffer.from(text, 'utf8');
    if (!raw.length) return res.status(400).json({ error: 'Document text is required.' });
    if (raw.length > MAX_ACCOUNT_DOCUMENT_BYTES) {
      return res.status(413).json({
        error: `This document is too large for database storage (${raw.length.toLocaleString()} bytes). The current limit is ${MAX_ACCOUNT_DOCUMENT_BYTES.toLocaleString()} bytes.`,
        maxRawBytes: MAX_ACCOUNT_DOCUMENT_BYTES
      });
    }
    const compressed = zlib.gzipSync(raw, { level: 9 });
    const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
    const result = await query(`
      insert into account_documents
        (user_id, book_id, content_gzip, raw_bytes, compressed_bytes, content_sha256, updated_at)
      values ($1, $2, $3, $4, $5, $6, now())
      on conflict (user_id, book_id) do update set
        content_gzip = excluded.content_gzip,
        raw_bytes = excluded.raw_bytes,
        compressed_bytes = excluded.compressed_bytes,
        content_sha256 = excluded.content_sha256,
        updated_at = now()
      returning raw_bytes, compressed_bytes, content_sha256, updated_at
    `, [user.id, req.params.bookId, compressed, raw.length, compressed.length, sha256]);
    res.json({ document: result.rows[0], maxRawBytes: MAX_ACCOUNT_DOCUMENT_BYTES });
  } catch (error) {
    const status = error?.type === 'entity.too.large' ? 413 : 500;
    console.error('Document save failed:', error);
    res.status(status).json({ error: status === 413 ? 'The document exceeds the upload limit.' : 'Unable to save the cloud document.' });
  }
});

app.delete('/api/account/library/:bookId/document', async (req, res) => {
  try {
    const user = await requireAccountUser(req, res);
    if (!user) return;
    const result = await query('delete from account_documents where user_id = $1 and book_id = $2 returning book_id', [user.id, req.params.bookId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Cloud document not found.' });
    res.json({ deleted: true, bookId: result.rows[0].book_id });
  } catch (error) {
    console.error('Document delete failed:', error);
    res.status(500).json({ error: 'Unable to delete the cloud document.' });
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

/* Random Notes cloud service v7.7.16 --------------------------------------
   Independent from the protected reader runtime.
*/
function cleanNoteHtml(value) {
  const html = String(value || '');
  if (Buffer.byteLength(html, 'utf8') > 6 * 1024 * 1024) throw new Error('Random note is too large.');
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*(["']).*?\1/gi, '');
}
app.get('/api/account/random-notes', async (req, res) => {
  try {
    const user = await requireAccountUser(req, res); if (!user) return;
    const result = await query(`select id,title,content_html,content_text,tags,pinned,favorite,related_book_ids,created_at,updated_at from random_notes where user_id=$1 order by pinned desc, updated_at desc`, [user.id]);
    res.json({ notes: result.rows });
  } catch (error) { console.error('Random notes load failed:', error); res.status(500).json({ error: 'Unable to load Random Notes.' }); }
});
app.post('/api/account/random-notes', async (req, res) => {
  try {
    const user = await requireAccountUser(req, res); if (!user) return;
    const html = cleanNoteHtml(req.body?.contentHtml);
    const text = cleanText(req.body?.contentText, 500000);
    const title = cleanText(req.body?.title, 240) || 'Untitled note';
    const result = await query(`insert into random_notes(user_id,title,content_html,content_text,tags,pinned,favorite,related_book_ids) values($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb) returning *`, [user.id,title,html,text,JSON.stringify(Array.isArray(req.body?.tags)?req.body.tags.slice(0,30):[]),Boolean(req.body?.pinned),Boolean(req.body?.favorite),JSON.stringify(Array.isArray(req.body?.relatedBookIds)?req.body.relatedBookIds.slice(0,50):[])]);
    res.status(201).json({ note: result.rows[0] });
  } catch (error) { console.error('Random note create failed:', error); res.status(/too large/i.test(error.message)?413:500).json({ error: error.message || 'Unable to save Random Note.' }); }
});
app.put('/api/account/random-notes/:id', async (req, res) => {
  try {
    const user = await requireAccountUser(req, res); if (!user) return;
    const html = cleanNoteHtml(req.body?.contentHtml);
    const result = await query(`update random_notes set title=$3,content_html=$4,content_text=$5,tags=$6::jsonb,pinned=$7,favorite=$8,related_book_ids=$9::jsonb,updated_at=now() where id=$2 and user_id=$1 returning *`, [user.id,req.params.id,cleanText(req.body?.title,240)||'Untitled note',html,cleanText(req.body?.contentText,500000),JSON.stringify(Array.isArray(req.body?.tags)?req.body.tags.slice(0,30):[]),Boolean(req.body?.pinned),Boolean(req.body?.favorite),JSON.stringify(Array.isArray(req.body?.relatedBookIds)?req.body.relatedBookIds.slice(0,50):[])]);
    if (!result.rows[0]) return res.status(404).json({ error:'Random Note not found.' });
    res.json({ note: result.rows[0] });
  } catch (error) { console.error('Random note update failed:', error); res.status(/too large/i.test(error.message)?413:500).json({ error:error.message || 'Unable to update Random Note.' }); }
});
app.delete('/api/account/random-notes/:id', async (req, res) => {
  try { const user=await requireAccountUser(req,res); if(!user)return; const result=await query('delete from random_notes where id=$2 and user_id=$1 returning id',[user.id,req.params.id]); if(!result.rows[0])return res.status(404).json({error:'Random Note not found.'}); res.json({ok:true}); }
  catch(error){console.error('Random note delete failed:',error);res.status(500).json({error:'Unable to delete Random Note.'});}
});
function randomNoteAttachments(html) {
  const matches=[...String(html||'').matchAll(/<img[^>]+src=["']data:(image\/(?:png|jpeg|gif|webp));base64,([^"']+)["'][^>]*>/gi)].slice(0,5);
  return matches.map((m,i)=>({ filename:`random-note-image-${i+1}.${m[1].split('/')[1].replace('jpeg','jpg')}`, content:m[2] }));
}
app.post('/api/account/random-notes/email', async (req,res)=>{
  try {
    const user=await requireAccountUser(req,res); if(!user)return;
    const pref=await query('select * from user_email_preferences where user_id=$1 and active=true',[user.id]);
    const email=pref.rows[0]?.email || user.email;
    if(!email) return res.status(400).json({error:'Save an email address first.'});
    const ids=Array.isArray(req.body?.ids)?req.body.ids.slice(0,100):[];
    const result=await query(`select * from random_notes where user_id=$1 and ($2::uuid[] is null or id=any($2::uuid[])) order by updated_at desc`,[user.id,ids.length?ids:null]);
    if(!result.rows.length)return res.status(400).json({error:'There are no Random Notes to email.'});
    const attachments=[]; const items=result.rows.map((n)=>{attachments.push(...randomNoteAttachments(n.content_html));return `<li style="margin-bottom:20px"><strong>${escapeEmail(n.title)}</strong><div style="font-size:12px;color:#667">Updated ${escapeEmail(new Date(n.updated_at).toLocaleString())}</div><div style="white-space:pre-wrap;margin-top:8px">${escapeEmail(n.content_text)}</div></li>`}).join('');
    await sendResendEmail({to:email,subject:`Your ${result.rows.length} Random ${result.rows.length===1?'Note':'Notes'} from Mark, Set, Go!`,html:emailFrame('Random Notes',`<ol>${items}</ol>`,''),text:result.rows.map(n=>`${n.title}\n${n.content_text}`).join('\n\n---\n\n'),attachments:attachments.slice(0,10)});
    res.json({ok:true,count:result.rows.length,attachments:attachments.length});
  } catch(error){console.error('Random notes email failed:',error);res.status(503).json({error:error.message});}
});

function rateLimitEmail(req, key, limit = 8, windowMs = 3600000) {
  const id = `${req.ip}|${key}`; const now = Date.now();
  const recent = (emailRateLimits.get(id) || []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now); emailRateLimits.set(id, recent); return true;
}
function escapeEmail(value) { return String(value || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function sendResendEmail({ to, subject, html, text, attachments = [] }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) throw new Error('Email is not configured. Add RESEND_API_KEY.');
  const response = await fetch('https://api.resend.com/emails', { method:'POST', headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' }, body:JSON.stringify({ from:EMAIL_FROM, to:[to], subject, html, text, ...(attachments.length ? { attachments } : {}) }) });
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
app.get('/api/email/preferences', async (req,res)=>{
  try { const user=await requireAccountUser(req,res); if(!user)return; const result=await query('select email,reminders,newsletter,notes,notes_frequency,timezone,active,updated_at from user_email_preferences where user_id=$1',[user.id]); res.json({preferences:result.rows[0]||null,configured:emailConfigured()}); }
  catch(error){console.error('Email preference load failed:',error);res.status(500).json({error:'Unable to load email preferences.'});}
});
app.post('/api/email/preferences', async (req, res) => {
  const clientId=String(req.body?.clientId||'').trim().slice(0,100); const email=String(req.body?.email||'').trim().toLowerCase();
  if (!clientId || !validEmail(email)) return res.status(400).json({error:'Enter a valid email address.'});
  const record={ ...(emailSubscriptions.get(clientId)||{}), clientId, email, newsletter:Boolean(req.body?.newsletter), reminders:Boolean(req.body?.reminders), notes:Boolean(req.body?.notes), notesFrequency:['daily','weekly','monthly'].includes(req.body?.notesFrequency)?req.body.notesFrequency:'weekly', timezone:String(req.body?.timezone||'America/New_York').slice(0,80), active:true, updatedAt:new Date().toISOString() };
  emailSubscriptions.set(clientId, record);
  try { const user=await requireAccountUser(req,res); if(!user)return; const result=await query(`insert into user_email_preferences(user_id,email,reminders,newsletter,notes,notes_frequency,timezone,active,updated_at) values($1,$2,$3,$4,$5,$6,$7,true,now()) on conflict(user_id) do update set email=excluded.email,reminders=excluded.reminders,newsletter=excluded.newsletter,notes=excluded.notes,notes_frequency=excluded.notes_frequency,timezone=excluded.timezone,active=true,updated_at=now() returning *`,[user.id,email,record.reminders,record.newsletter,record.notes,record.notesFrequency,record.timezone]); res.json({ok:true,configured:emailConfigured(),preferences:record,durable:true,updatedAt:result.rows[0].updated_at}); }
  catch(error){console.error('Email preference save failed:',error);res.status(500).json({error:'Unable to save email preferences.'});}
});
app.post('/api/email/sync-goals', (req, res) => {
  const clientId=String(req.body?.clientId||'').trim().slice(0,100); const record=emailSubscriptions.get(clientId);
  if (!record?.active) return res.status(404).json({error:'Save email preferences first.'});
  const goals=req.body?.goals||{}; const metrics=req.body?.metrics||{};
  record.goalProgress={enabled:Boolean(goals.enabled),emailProgress:Boolean(goals.emailProgress),annualBooks:Number(goals.annualBooks)||0,targetWpm:Number(goals.targetWpm)||0,targetComprehension:Number(goals.targetComprehension)||0,weeklyMinutes:Number(goals.weeklyMinutes)||0,completedBooks:Number(metrics.completedBooks)||0,annualPercent:Number(metrics.annualPercent)||0,avgWpm:Number(metrics.avgWpm)||0,avgComprehension:Number(metrics.avgComprehension)||0,currentWeeklyMinutes:Number(metrics.weeklyMinutes)||0,updatedAt:new Date().toISOString()};
  record.updatedAt=new Date().toISOString(); emailSubscriptions.set(clientId,record); res.json({ok:true});
});
function goalProgressEmail(record){ const g=record?.goalProgress; if(!g?.enabled||!g?.emailProgress)return {html:'',text:''}; return {html:`<div style="margin-top:18px;padding:14px;background:#eef8ff;border-radius:10px"><strong>Reading goal progress</strong><p>${g.completedBooks} of ${g.annualBooks} books · ${g.annualPercent}% of annual challenge<br>${g.currentWeeklyMinutes}/${g.weeklyMinutes} minutes this week · ${g.avgWpm||'—'}/${g.targetWpm} WPM · ${g.avgComprehension||'—'}/${g.targetComprehension}% comprehension</p></div>`,text:` Reading goals: ${g.completedBooks}/${g.annualBooks} books (${g.annualPercent}%), ${g.currentWeeklyMinutes}/${g.weeklyMinutes} weekly minutes, ${g.avgWpm||'—'}/${g.targetWpm} WPM, ${g.avgComprehension||'—'}/${g.targetComprehension}% comprehension.`}; }

app.post('/api/email/sync-actions', async (req, res) => {
  try {
    const user = await requireAccountUser(req, res);
    if (!user) return;

    const clientId = String(req.body?.clientId || '').trim().slice(0,100);
    const incoming = (Array.isArray(req.body?.actions) ? req.body.actions : []).slice(0,200);
    const prefResult = await query(
      'select email, reminders, newsletter, notes, notes_frequency, timezone, active, actions from user_email_preferences where user_id=$1',
      [user.id]
    );
    const pref = prefResult.rows[0];
    if (!pref?.active) return res.status(404).json({ error:'Save email preferences first.' });

    const existing = new Map(
      (Array.isArray(pref.actions) ? pref.actions : []).map((action) => [String(action.id || ''), action])
    );

    const actions = incoming.map((a) => {
      const normalized = {
        id:String(a.id||'').slice(0,100),
        title:String(a.title||'').slice(0,180),
        dueAt:a.dueAt||'',
        reminder:a.reminder||'none',
        status:a.status||'active',
        sourceTitle:String(a.sourceTitle||'').slice(0,180),
        updatedAt:a.updatedAt||'',
        lastEmailSignature:''
      };
      const previous = existing.get(normalized.id);
      const sameSchedule = previous
        && previous.dueAt === normalized.dueAt
        && previous.reminder === normalized.reminder
        && previous.updatedAt === normalized.updatedAt;
      if (sameSchedule) normalized.lastEmailSignature = previous.lastEmailSignature || '';
      return normalized;
    });

    await query(
      'update user_email_preferences set actions=$2::jsonb, updated_at=now() where user_id=$1',
      [user.id, JSON.stringify(actions)]
    );

    // Keep the in-process cache synchronized for local/dev and immediate sends.
    if (clientId) {
      const record = {
        ...(emailSubscriptions.get(clientId) || {}),
        clientId,
        email: pref.email,
        reminders: Boolean(pref.reminders),
        newsletter: Boolean(pref.newsletter),
        notes: Boolean(pref.notes),
        notesFrequency: pref.notes_frequency || 'weekly',
        timezone: pref.timezone || 'America/New_York',
        active: Boolean(pref.active),
        actions,
        updatedAt: new Date().toISOString()
      };
      emailSubscriptions.set(clientId, record);
    }

    res.json({ ok:true, count:actions.length, durable:true });
  } catch (error) {
    console.error('Action reminder sync failed:', error);
    res.status(500).json({ error:'Unable to save action reminders.' });
  }
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
  if(!emailConfigured()) return;

  const now = Date.now();
  const offsets = { at_time:0, min10:10, min30:30, hour1:60, day1:1440 };

  try {
    const result = await query(`
      select user_id, email, reminders, newsletter, notes, notes_frequency, timezone, active, actions
      from user_email_preferences
      where active=true and reminders=true
    `);

    for (const pref of result.rows) {
      const actions = Array.isArray(pref.actions) ? pref.actions : [];
      let changed = false;

      for (const action of actions) {
        if(action.status==='completed'||!action.dueAt||action.reminder==='none') continue;
        const due=Date.parse(action.dueAt);
        if(!Number.isFinite(due)) continue;

        const notifyAt=due-(offsets[action.reminder]??0)*60000;
        const signature=`${action.id}|${action.dueAt}|${action.reminder}|${action.updatedAt}`;

        // Never lose a reminder merely because Render slept/restarted or the
        // scheduler woke more than ten minutes late. Send the first time the
        // server observes that it is due, then persist the signature.
        if(now<notifyAt || action.lastEmailSignature===signature) continue;

        try {
          const record = {
            email: pref.email,
            reminders: pref.reminders,
            newsletter: pref.newsletter,
            notes: pref.notes,
            notesFrequency: pref.notes_frequency,
            timezone: pref.timezone,
            active: pref.active,
            actions
          };
          const gp=goalProgressEmail(record);
          await sendResendEmail({
            to:pref.email,
            subject:`Reminder: ${action.title}`,
            html:emailFrame(
              'Reading action reminder',
              `<p><strong>${escapeEmail(action.title)}</strong></p><p>Due ${escapeEmail(new Date(due).toLocaleString())}${action.sourceTitle?` · ${escapeEmail(action.sourceTitle)}`:''}</p>${gp.html}`,
              ''
            ),
            text:`Reminder: ${action.title}. Due ${new Date(due).toLocaleString()}.${gp.text}`
          });
          action.lastEmailSignature=signature;
          changed=true;
        } catch(error) {
          console.error('Email reminder failed:',error.message);
        }
      }

      if(changed) {
        await query(
          'update user_email_preferences set actions=$2::jsonb, updated_at=now() where user_id=$1',
          [pref.user_id, JSON.stringify(actions)]
        );
      }
    }
  } catch (error) {
    console.error('Reminder scheduler failed:', error.message);
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
      const gp=goalProgressEmail(record);
      await sendResendEmail({to:record.email,subject:`Your ${record.notesFrequency} reading notes digest`,html:emailFrame('Reading notes digest',content.html+gp.html,record.clientId),text:content.text+gp.text});
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
  const scope = String(req.body?.scope || 'passage').trim();
  const wholeGuide = scope === 'whole_guide';
  const broadScope = wholeGuide || ['read_so_far', 'whole_text'].includes(scope);
  const requestedQuestionCount = Number(req.body?.questionCount);
  const questionCount = Number.isInteger(requestedQuestionCount)
    ? Math.max(wholeGuide ? 1 : 4, Math.min(25, requestedQuestionCount))
    : (wholeGuide ? 10 : 4);
  const scopeLabel = String(req.body?.scopeLabel || '').trim().slice(0, 200);
  const sampled = Boolean(req.body?.sampled);
  const questionMode = wholeGuide && ['new', 'mixed'].includes(String(req.body?.questionMode || '').trim())
    ? String(req.body.questionMode).trim()
    : 'new';
  const avoidQuestions = wholeGuide && Array.isArray(req.body?.avoidQuestions)
    ? req.body.avoidQuestions.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 100)
    : [];
  const wordCount = passage ? passage.split(/\s+/).length : 0;
  const sourceWordCount = Math.max(wordCount, Number(req.body?.sourceWordCount) || 0);

  if (wordCount < 120) {
    return res.status(400).json({ error: 'Read at least 120 words before starting a comprehension check.' });
  }
  const maxWords = broadScope ? 12000 : 12000;
  const maxCharacters = broadScope ? 100000 : 100000;
  if (wordCount > maxWords || passage.length > maxCharacters) {
    return res.status(400).json({
      error: broadScope ? 'The selected comprehension scope is too large to process safely.' : 'The comprehension passage is too large.'
    });
  }

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        minItems: questionCount,
        maxItems: questionCount,
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

  const avoidPrompt = avoidQuestions.length
    ? `\nDo not repeat or lightly paraphrase any of these previously used questions:\n${avoidQuestions.map((question, index) => `${index + 1}. ${question}`).join('\n')}`
    : '';
  const prompt = wholeGuide
    ? `Create exactly ${questionCount} multiple-choice comprehension questions based ONLY on the complete reading guide "${title}".
Treat the supplied text as the entire guide, not as a local passage. Spread the questions across different major sections and ideas so the quiz tests understanding of the guide as a whole.
Use a balanced mix of factual recall, main idea, inference, and deeper-understanding questions.
Each question must be answerable from the supplied guide itself. Do not rely on outside knowledge or facts not present in the guide.
Use plausible distractors. Keep explanations concise and refer to the relevant idea without long quotation.${avoidPrompt}`
    : `Create exactly ${questionCount} multiple-choice comprehension questions based ONLY on the supplied material from "${title}".
Quiz scope: ${scopeLabel || scope}. ${sampled ? `The supplied material is a balanced sample drawn across a larger ${sourceWordCount}-word scope. Distribute questions broadly across the supplied sample rather than concentrating on one adjacent passage.` : ''}
Use a balanced mix of factual recall, main idea, inference, and deeper-understanding questions. When there are more than four questions, vary the types across the quiz rather than repeating one type in a block.
Each question must be answerable from the supplied material itself. Do not rely on outside knowledge, later parts of the work that are not supplied, or facts not present in the material.
Use plausible distractors. Keep explanations concise and refer to the relevant idea without long quotation.`;

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
    if (!Array.isArray(quiz.questions) || quiz.questions.length !== questionCount) throw new Error('Unexpected quiz structure.');

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



app.post('/api/create-modern-guide', async (req, res) => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(503).json({
      error: 'Guide creation is not configured. Add OPENAI_API_KEY to the server environment.'
    });
  }

  const title = String(req.body?.title || '').trim().slice(0, 300);
  const author = String(req.body?.author || '').trim().slice(0, 300);
  const depth = req.body?.depth === 'standard' ? 'standard' : 'extended';
  const requestedGreatIdea = String(req.body?.requestedGreatIdea || '').trim().slice(0, 100);
  const sourceMaterial = String(req.body?.sourceMaterial || '').trim().slice(0, 60000);

  if (!title) return res.status(400).json({ error: 'Enter a book title.' });

  const sectionCount = depth === 'standard' ? 12 : 18;
  const schema = {
    type:'object',
    additionalProperties:false,
    required:['overview','greatIdea','sections','actionTitle','actionType','actionNote','dueDays','priority','repeat','reminder'],
    properties:{
      overview:{type:'string'},
      greatIdea:{type:'string'},
      sections:{
        type:'array',
        minItems:sectionCount,
        maxItems:sectionCount,
        items:{
          type:'object',
          additionalProperties:false,
          required:['title','content'],
          properties:{
            title:{type:'string'},
            content:{type:'string'}
          }
        }
      },
      actionTitle:{type:'string'},
      actionType:{type:'string',enum:['task','habit','review','reflection','experiment','discussion']},
      actionNote:{type:'string'},
      dueDays:{type:'integer',minimum:1,maximum:30},
      priority:{type:'string',enum:['low','normal','high']},
      repeat:{type:'string',enum:['none','daily','weekly','monthly']},
      reminder:{type:'string',enum:['none','at_time','min10','min30','hour1','day1']}
    }
  };

  const instructions = `Create an original, independent educational reading guide to the identified book for use inside Mark, Set, Go!.
This is NOT the original book and must not substitute for it by reproducing copyrighted expression.
Do not quote passages from the book. Do not imitate the author's prose.
Explain ideas, themes, arguments, context, structure, application, and useful comparisons in your own words.
Do not invent plot events, claims, characters, or facts. If the title is ambiguous or your knowledge is uncertain, state uncertainty inside the relevant section rather than fabricating detail.
The result should be substantial and useful for serious adult readers.
Create exactly ${sectionCount} sections.
Each section should contain multiple developed paragraphs, normally 250-450 words, with no questions addressed directly to the reader.
Do not put quizzes, "Ask Mark" prompts, action links, or UI directions into the prose; the app adds those interactions separately.
Prefer conceptual organization over a chapter-by-chapter substitute for the original.
Include one appropriate Great Idea connection such as Freedom, Justice, Habit, Education, Nature, Prudence, Happiness, Love, Duty, Work, Mind, or another concise concept.
Also design one concrete Action Center activity with a sensible action type, priority, due window, repeat setting, and reminder.
${requestedGreatIdea ? `Use "${requestedGreatIdea}" as the Great Idea connection if it is genuinely relevant.` : ''}
${sourceMaterial ? 'The user supplied notes or source material. Use it only as supporting context and do not reproduce long passages from it.' : 'No source material was supplied. Be conservative about uncertain details.'}`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method:'POST',
      headers:{
        Authorization:`Bearer ${apiKey}`,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({
        model:COMPREHENSION_MODEL,
        reasoning:{effort:'medium'},
        store:false,
        input:[
          {role:'developer',content:[{type:'input_text',text:instructions}]},
          {role:'user',content:[{type:'input_text',text:JSON.stringify({
            book:{title,author},
            sourceMaterial:sourceMaterial || null
          })}]}
        ],
        text:{
          format:{
            type:'json_schema',
            name:'custom_modern_guide',
            strict:true,
            schema
          }
        }
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.error?.message || `OpenAI returned HTTP ${response.status}.`;
      return res.status(502).json({ error:'Unable to create the guide.', detail });
    }

    const outputText = extractOpenAIOutputText(payload);
    if (!outputText) throw new Error('OpenAI returned no structured guide.');
    const guide = JSON.parse(outputText);
    res.json({ model:COMPREHENSION_MODEL, guide });
  } catch (error) {
    console.error('Custom Modern Guide generation failed:', error);
    res.status(502).json({ error:'Unable to create the guide.' });
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




app.post('/api/flashcards', async (req, res) => {
  const apiKey=String(process.env.OPENAI_API_KEY||'').trim();
  if(!apiKey) return res.status(503).json({error:'Flash card generation is not configured.'});

  const title=String(req.body?.title||'Current reading').trim().slice(0,300);
  const passage=String(req.body?.passage||'').replace(/\s+/g,' ').trim().slice(0,18000);
  if(!passage) return res.status(400).json({error:'No readable text was supplied.'});

  const schema={type:'object',additionalProperties:false,required:['cards'],properties:{
    cards:{type:'array',minItems:5,maxItems:10,items:{type:'object',additionalProperties:false,required:['front','back','category','hint'],properties:{
      front:{type:'string'},back:{type:'string'},category:{type:'string'},hint:{type:'string'}
    }}}
  }};

  const instructions=`Create a compact set of high-quality study flash cards for "${title}" using only the supplied reading.
Prefer important ideas, relationships, arguments, names, definitions, chronology, and cause/effect over trivia.
Each front must be a clear retrieval question or cue. Each back must be concise enough to review quickly but complete enough to teach.
Avoid duplicate cards, vague prompts, and questions about the guide/app itself unless that is genuinely the subject of the reading.
The hint should be a short retrieval cue that does not simply reveal the answer.`;

  try {
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({
      model:COMPREHENSION_MODEL,reasoning:{effort:'low'},store:false,
      input:[{role:'developer',content:[{type:'input_text',text:instructions}]},{role:'user',content:[{type:'input_text',text:passage}]}],
      text:{format:{type:'json_schema',name:'reading_flashcards',strict:true,schema}}
    })});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) return res.status(502).json({error:'Unable to create flash cards.',detail:payload?.error?.message||`HTTP ${response.status}`});
    const outputText=extractOpenAIOutputText(payload);
    if(!outputText) throw new Error('No structured flash card response.');
    res.json(JSON.parse(outputText));
  } catch(error) {
    console.error('Flash card generation failed:',error);
    res.status(502).json({error:'Unable to create flash cards.'});
  }
});

app.post('/api/memory-tools', async (req, res) => {
  const apiKey=String(process.env.OPENAI_API_KEY||'').trim();
  if(!apiKey) return res.status(503).json({error:'Memory tool generation is not configured.'});

  const title=String(req.body?.title||'Current reading').trim().slice(0,300);
  const passage=String(req.body?.passage||'').replace(/\s+/g,' ').trim().slice(0,18000);
  if(!passage) return res.status(400).json({error:'No readable text was supplied.'});

  const schema={type:'object',additionalProperties:false,required:['tools'],properties:{
    tools:{type:'array',minItems:3,maxItems:6,items:{type:'object',additionalProperties:false,required:['label','target','remember','anchor','why','test'],properties:{
      label:{type:'string'},target:{type:'string'},remember:{type:'string'},anchor:{type:'string'},why:{type:'string'},test:{type:'string'}
    }}}
  }};

  const instructions=`Create practical memory tools for a reader studying "${title}", grounded only in the supplied reading.
Do not produce a generic list of mnemonic techniques. Instead identify the few things in this passage actually worth retaining.
For each:
- label: a short memorable name
- target: what knowledge it helps retain
- remember: the fact/idea/relationship in concise language
- anchor: one vivid but academically appropriate association, acronym, contrast, sequence, image, or chunking device
- why: one sentence explaining why the anchor maps correctly to the reading
- test: a short retrieval question the reader can answer later without looking
Make the output easy to scan and useful for serious study. Avoid forced or silly mnemonics when a simple conceptual anchor is better.`;

  try {
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({
      model:COMPREHENSION_MODEL,reasoning:{effort:'low'},store:false,
      input:[{role:'developer',content:[{type:'input_text',text:instructions}]},{role:'user',content:[{type:'input_text',text:passage}]}],
      text:{format:{type:'json_schema',name:'reading_memory_tools',strict:true,schema}}
    })});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) return res.status(502).json({error:'Unable to create memory tools.',detail:payload?.error?.message||`HTTP ${response.status}`});
    const outputText=extractOpenAIOutputText(payload);
    if(!outputText) throw new Error('No structured memory-tool response.');
    res.json(JSON.parse(outputText));
  } catch(error) {
    console.error('Memory tool generation failed:',error);
    res.status(502).json({error:'Unable to create memory tools.'});
  }
});

app.post('/api/mnemonics', async (req, res) => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return res.status(503).json({ error:'Mnemonic generation is not configured.' });

  const title = String(req.body?.title || 'Untitled').trim().slice(0,300);
  const focus = String(req.body?.focus || '').trim().slice(0,500);
  const style = String(req.body?.style || 'mixed').trim().slice(0,40);
  const sample = String(req.body?.sample || '').replace(/\s+/g,' ').trim().slice(0,40000);
  if (!sample) return res.status(400).json({ error:'No readable book text was supplied.' });

  const schema={type:'object',additionalProperties:false,required:['mnemonics'],properties:{
    mnemonics:{type:'array',minItems:4,maxItems:8,items:{type:'object',additionalProperties:false,required:['type','name','device','use'],properties:{
      type:{type:'string'},name:{type:'string'},device:{type:'string'},use:{type:'string'}
    }}}
  }};

  const instructions=`Create practical memory aids for a reader studying "${title}".
Ground every mnemonic in the supplied reading sample. Do not invent facts not supported by the sample.
Focus requested by the reader: ${focus || 'the most important ideas, names, sequence, arguments, or themes'}.
Preferred style: ${style}.
Make the devices memorable but academically useful. Explain exactly what each mnemonic helps the reader retain.`;

  try {
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({
      model:COMPREHENSION_MODEL,reasoning:{effort:'low'},store:false,
      input:[{role:'developer',content:[{type:'input_text',text:instructions}]},{role:'user',content:[{type:'input_text',text:sample}]}],
      text:{format:{type:'json_schema',name:'book_mnemonics',strict:true,schema}}
    })});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) return res.status(502).json({error:'Unable to create mnemonics.',detail:payload?.error?.message||`HTTP ${response.status}`});
    const outputText=extractOpenAIOutputText(payload);
    if(!outputText) throw new Error('No structured mnemonic response.');
    res.json(JSON.parse(outputText));
  } catch(error) {
    console.error('Mnemonic generation failed:',error);
    res.status(502).json({error:'Unable to create mnemonics.'});
  }
});

app.post('/api/language-lesson', async (req, res) => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return res.status(503).json({ error:'Language lessons are not configured.' });

  const title=String(req.body?.title||'Untitled').trim().slice(0,300);
  const language=String(req.body?.language||'Spanish').trim().slice(0,80);
  const level=['beginner','intermediate','advanced'].includes(req.body?.level)?req.body.level:'beginner';
  const sample=String(req.body?.sample||'').replace(/\s+/g,' ').trim().slice(0,18000);
  if(!sample) return res.status(400).json({error:'No readable book text was supplied.'});

  const schema={type:'object',additionalProperties:false,required:['passage','vocabulary','notes','exercises'],properties:{
    passage:{type:'string'},
    vocabulary:{type:'array',minItems:6,maxItems:12,items:{type:'object',additionalProperties:false,required:['term','meaning'],properties:{term:{type:'string'},meaning:{type:'string'}}}},
    notes:{type:'array',minItems:3,maxItems:8,items:{type:'string'}},
    exercises:{type:'array',minItems:4,maxItems:8,items:{type:'string'}}
  }};

  const instructions=`Create a ${level} ${language} language-learning lesson based on the meaning and subject matter of the supplied passage from "${title}".
Write an original short adapted passage in ${language}; do not translate or reproduce a long copyrighted passage.
Use the reader's familiarity with the book to teach vocabulary and comprehension.
Vocabulary meanings and instructional notes may be explained in English.
Exercises should include comprehension, vocabulary, and short translation or production practice.
Do not provide answer keys in the exercise text.`;

  try {
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({
      model:COMPREHENSION_MODEL,reasoning:{effort:'low'},store:false,
      input:[{role:'developer',content:[{type:'input_text',text:instructions}]},{role:'user',content:[{type:'input_text',text:sample}]}],
      text:{format:{type:'json_schema',name:'language_reading_lesson',strict:true,schema}}
    })});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) return res.status(502).json({error:'Unable to create the language lesson.',detail:payload?.error?.message||`HTTP ${response.status}`});
    const outputText=extractOpenAIOutputText(payload);
    if(!outputText) throw new Error('No structured language lesson.');
    res.json({lesson:JSON.parse(outputText)});
  } catch(error) {
    console.error('Language lesson generation failed:',error);
    res.status(502).json({error:'Unable to create the language lesson.'});
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


app.post('/api/app-help', async (req, res) => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return res.status(503).json({ error: 'Mark help is not configured. Add OPENAI_API_KEY to the server environment.' });

  const pageKey = String(req.body?.pageKey || 'unknown').trim().slice(0, 120);
  const pageTitle = String(req.body?.pageTitle || 'Current page').trim().slice(0, 200);
  const question = String(req.body?.question || '').trim().slice(0, 800);
  const safeObject = (value, maxChars) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    try { return JSON.parse(JSON.stringify(value).slice(0, maxChars)); } catch { return {}; }
  };
  const pageHelp = safeObject(req.body?.pageHelp, 14000);
  const globalHelp = safeObject(req.body?.globalHelp, 7000);
  if (!question) return res.status(400).json({ error: 'Enter a help question.' });

  const schema = {
    type: 'object', additionalProperties: false, required: ['inScope','answer'],
    properties: { inScope: { type: 'boolean' }, answer: { type: 'string' } }
  };
  const prompt = `You are Mark, the in-app help companion for Mark, Set, Go!.
Your ONLY job in this mode is to answer questions about how to use the CURRENT APP PAGE, the controls/features described for that page, or closely related navigation needed to complete a task from that page.
Use the supplied STORED PAGE HELP as the primary authority and GLOBAL APP HELP only for supporting navigation/context.
Do not answer general knowledge, book-content questions, personal advice, current events, coding, or unrelated questions.
Do not discuss highlighted reading text in this mode.
Do not invent controls, behavior, storage guarantees, or features that are not supported by the supplied help knowledge.
When the user asks how to accomplish something, give short concrete steps and name the actual control/page when the knowledge supplies one.
When troubleshooting, distinguish what the help knowledge confirms from what may require checking another part of the app.
If the question is outside this narrow app-help scope, set inScope=false and answer briefly: "I can help with how to use this page. Ask me about its controls, options, or where to go next."
If it is in scope, set inScope=true.`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: COMPREHENSION_MODEL,
        reasoning: { effort: 'low' },
        store: false,
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: prompt }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ pageKey, pageTitle, storedPageHelp: pageHelp, globalAppHelp: globalHelp, question }) }] }
        ],
        text: { format: { type: 'json_schema', name: 'app_help_response', strict: true, schema } }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(502).json({ error: 'Mark could not answer that help question.', detail: payload?.error?.message || `HTTP ${response.status}` });
    const outputText = extractOpenAIOutputText(payload);
    if (!outputText) throw new Error('No response text.');
    const result = JSON.parse(outputText);
    res.json({ inScope: !!result.inScope, answer: String(result.answer || '').trim() });
  } catch (error) {
    console.error('App help failed:', error);
    res.status(502).json({ error: 'Mark could not answer that help question.' });
  }
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



function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function docxBufferToDocument(buffer) {
  const zip = new AdmZip(buffer);
  const documentEntry = zip.getEntry('word/document.xml');
  if (!documentEntry) throw new Error('This DOCX file does not contain word/document.xml.');
  const xml = documentEntry.getData().toString('utf8');
  const text = decodeXmlEntities(xml
    .replace(/<w:tab\b[^>]*\/>/gi, '\t')
    .replace(/<w:br\b[^>]*\/>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n\n')
    .replace(/<\/w:tr>/gi, '\n')
    .replace(/<\/w:tc>/gi, '\t')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 20) throw new Error('The Word document did not contain enough readable text.');
  let title = '';
  const core = zip.getEntry('docProps/core.xml');
  if (core) {
    const coreXml = core.getData().toString('utf8');
    title = decodeXmlEntities(coreXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1] || '').replace(/<[^>]+>/g, '').trim();
  }
  return { title, text };
}

app.post('/api/import/docx', express.raw({
  type: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream'],
  limit: '25mb'
}), (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Choose a DOCX file.' });
    return res.json(docxBufferToDocument(req.body));
  } catch (error) {
    return res.status(400).json({ error: error?.message || 'The Word document could not be imported.' });
  }
});

app.post('/capture', (req, res) => {
  const payload = {
    title: String(req.body?.title || 'Web Article').trim().slice(0, 500),
    author: String(req.body?.author || '').trim().slice(0, 300),
    url: String(req.body?.url || '').trim().slice(0, 4000),
    text: String(req.body?.text || '').trim().slice(0, 5_000_000),
    captureType: req.body?.captureType === 'selection' ? 'selection' : 'page',
    context: String(req.body?.context || '').trim().slice(0, 10000)
  };
  if (!payload.text) return res.status(400).send('No readable webpage text was received.');
  const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
  res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Opening Mark, Set, Go!</title><p>Opening the captured content in Mark, Set, Go!…</p><script>localStorage.setItem('markSetGoPendingWebCaptureV1',${JSON.stringify(serialized)});location.replace('/#read-anything-capture=1');<\/script>`);
});

app.post('/api/fetch-text', async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!url) return res.status(400).json({ error: 'A URL is required.' });
  try {
    const text = await fetchReadableText(url);
    if (!text) return res.status(422).json({ error: 'No readable text was found on that page.' });
    return res.json({ title: new URL(url).hostname, author: '', text: text.slice(0, 500000), sourceUrl: url });
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



async function resolvePublisherArticleUrl(publisherUrl, expectedTitle) {
  if (!publisherUrl || !expectedTitle) return '';

  const parsed = await validatePublicUrl(publisherUrl);
  const origin = parsed.origin;
  const candidates = [
    parsed.toString(),
    new URL('/news', origin).toString(),
    new URL('/latest', origin).toString(),
    new URL('/articles', origin).toString(),
    new URL('/blog', origin).toString(),
    new URL('/markets', origin).toString()
  ];

  let bestUrl = '';
  let bestScore = 0;
  const expectedWords = normalizedHeadlineWords(expectedTitle);

  for (const pageUrl of [...new Set(candidates)]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(await validatePublicUrl(pageUrl), {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MarkSetGoWeb/2.5; +article resolver)',
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.1'
        }
      });
      if (!response.ok) continue;

      const html = await response.text();
      const $ = cheerio.load(html);
      const responseBase = response.url || pageUrl;

      $('a[href]').each((_i, element) => {
        const label = stripMarkup($(element).text()).replace(/\s+/g, ' ').trim();
        if (label.length < 15) return;

        const actualWords = normalizedHeadlineWords(label);
        if (!expectedWords.size || !actualWords.size) return;

        let matches = 0;
        for (const word of expectedWords) if (actualWords.has(word)) matches += 1;
        const score = matches / Math.max(expectedWords.size, actualWords.size);
        if (matches < Math.min(3, Math.ceil(expectedWords.size * 0.45))) return;
        if (score < bestScore) return;

        let absolute;
        try { absolute = new URL($(element).attr('href'), responseBase); } catch { return; }
        if (!/^https?:$/.test(absolute.protocol)) return;
        if (!samePublisherHost(absolute.hostname, parsed.hostname)) return;
        if (!likelyArticlePath(absolute.pathname)) return;

        bestScore = score;
        bestUrl = absolute.toString().split('#')[0];
      });

      if (bestScore >= 0.8 && bestUrl) break;
    } catch (_) {
      // Continue through likely publisher listing pages.
    } finally {
      clearTimeout(timeout);
    }
  }

  return bestUrl;
}

app.post('/api/current/article', async (req, res) => {
  const originalUrl = String(req.body?.url || '').trim();
  const title = String(req.body?.title || 'Article').trim();
  const summary = String(req.body?.summary || '').trim();
  const source = String(req.body?.source || 'Feed').trim();
  const publisherUrl = String(req.body?.publisherUrl || '').trim();
  if (!originalUrl) return res.status(400).json({ error: 'The article URL is missing.' });

  let articleUrl = originalUrl;

  try {
    const host = new URL(originalUrl).hostname.toLowerCase();
    const isGoogleWrapper = host === 'news.google.com' || host.endsWith('.news.google.com');
    const isMetadataUrl =
      host === 'w3.org' || host.endsWith('.w3.org') ||
      host === 'schema.org' || host.endsWith('.schema.org') ||
      host === 'purl.org' || host.endsWith('.purl.org') ||
      host === 'xmlns.com' || host.endsWith('.xmlns.com');

    if (isGoogleWrapper) {
      const embedded = await directUrlFromGoogleNewsPage(originalUrl, publisherUrl);
      if (embedded) {
        articleUrl = embedded;
      } else {
        const resolved = await resolvePublisherArticleUrl(publisherUrl, title);
        if (resolved) articleUrl = resolved;
      }
    } else if (isMetadataUrl) {
      // Bad URL from an RSS/XML namespace is never an article. Resolve the
      // headline against the actual publisher site instead.
      const resolved = await resolvePublisherArticleUrl(publisherUrl, title);
      if (resolved) articleUrl = resolved;
    }
  } catch {}

  try {
    try {
      const resolvedHost = new URL(articleUrl).hostname.toLowerCase();
      if (
        resolvedHost === 'w3.org' || resolvedHost.endsWith('.w3.org') ||
        resolvedHost === 'schema.org' || resolvedHost.endsWith('.schema.org') ||
        resolvedHost === 'purl.org' || resolvedHost.endsWith('.purl.org') ||
        resolvedHost === 'xmlns.com' || resolvedHost.endsWith('.xmlns.com')
      ) {
        throw new Error('The feed supplied XML metadata instead of an article URL.');
      }
    } catch (error) {
      if (error?.message?.includes('XML metadata')) throw error;
    }

    const articleText = await fetchArticleForFeed(articleUrl, title);
    return res.json({
      title,
      fullArticle: true,
      sourceUrl: articleUrl,
      resolvedFromGoogleNews: articleUrl !== originalUrl,
      text: `${title}\n\n${articleText}\n\nSource: ${source}\n${articleUrl}`
    });
  } catch (error) {
    if (summary) {
      return res.json({
        title,
        fullArticle: false,
        sourceUrl: articleUrl,
        resolvedFromGoogleNews: articleUrl !== originalUrl,
        text: `${title}\n\n${summary}\n\nFull article text could not be imported from the publisher.\n\nSource: ${source}\n${articleUrl}`,
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




// DRM-free discovery catalog.
// Free/open book results are normalized from machine-readable sources.
// Commercial entries are store/publisher destinations; they are not scraped
// into a local copy of copyrighted catalogs.
const DRM_FREE_COMMERCIAL_SOURCES = [
  { id:'smashwords', name:'Smashwords', url:'https://www.smashwords.com/', availability:'paid', formats:['epub','pdf','mobi'], categories:['fiction','romance','mystery','thriller','fantasy','science-fiction','nonfiction','indie'], note:'Large independent and self-published catalog. DRM-free by default.' },
  { id:'baen', name:'Baen Books', url:'https://www.baen.com/', availability:'mixed', formats:['epub','mobi'], categories:['science-fiction','fantasy'], note:'Science fiction and fantasy publisher with DRM-free ebooks and a free library.' },
  { id:'storybundle', name:'StoryBundle', url:'https://storybundle.com/', availability:'paid', formats:['epub','mobi'], categories:['science-fiction','fantasy','mystery','nonfiction','comics'], note:'Rotating themed bundles of DRM-free ebooks.' },
  { id:'weightless', name:'Weightless Books', url:'https://weightlessbooks.com/', availability:'paid', formats:['epub','pdf'], categories:['science-fiction','fantasy','literature','comics','magazines'], note:'Curated independent speculative fiction, magazines, anthologies, and literary titles.' },
  { id:'ebooks-com', name:'eBooks.com', url:'https://www.ebooks.com/', availability:'paid', formats:['epub','pdf'], categories:['fiction','nonfiction','history','business','science','technology','biography','religion','psychology'], note:'Large general ebook store; use its DRM-free filters and verify the individual title.' },
  { id:'humble', name:'Humble Bundle', url:'https://www.humblebundle.com/books', availability:'paid', formats:['epub','pdf','mobi'], categories:['technology','science-fiction','fantasy','comics','nonfiction','games'], note:'Rotating DRM-free ebook bundles, often grouped by publisher or topic.' },
  { id:'fanatical', name:'Fanatical', url:'https://www.fanatical.com/en/bundle/books', availability:'paid', formats:['epub','pdf'], categories:['technology','science-fiction','fantasy','nonfiction'], note:'Discounted rotating book bundles; verify the formats listed for the current bundle.' },
  { id:'bookshop', name:'Bookshop.org', url:'https://bookshop.org/ebooks', availability:'paid', formats:['epub'], categories:['fiction','nonfiction','history','biography','science','politics','philosophy','religion'], note:'Mainstream catalog with DRM status shown per ebook; supports independent bookstores.' },
  { id:'pragmatic', name:'Pragmatic Bookshelf', url:'https://pragprog.com/', availability:'paid', formats:['epub','pdf','mobi'], categories:['technology','programming','software','business'], note:'Technical and software-development books sold in DRM-free formats.' },
  { id:'nostarch', name:'No Starch Press', url:'https://nostarch.com/', availability:'paid', formats:['epub','pdf','mobi'], categories:['technology','programming','cybersecurity','science','math'], note:'Technical, cybersecurity, programming, hardware, science, and math books.' },
  { id:'manning', name:'Manning', url:'https://www.manning.com/', availability:'paid', formats:['epub','pdf'], categories:['technology','programming','data-science','ai','software'], note:'Software, data, AI, and engineering books; direct ebook purchases are DRM-free.' },
  { id:'leanpub', name:'Leanpub', url:'https://leanpub.com/', availability:'paid', formats:['epub','pdf'], categories:['technology','programming','business','data-science','nonfiction'], note:'Author-published technical and nonfiction books, generally DRM-free.' },
  { id:'tor', name:'Tor / Tor Publishing Group', url:'https://torpublishinggroup.com/', availability:'paid', formats:['epub'], categories:['science-fiction','fantasy','fiction'], note:'Major science-fiction and fantasy publisher known for DRM-free ebook policy.' }
];

const DRM_FREE_CATEGORY_TOPICS = {
  fiction:'fiction',
  literature:'literature',
  classics:'classics',
  mystery:'mystery',
  thriller:'thriller',
  'science-fiction':'science fiction',
  fantasy:'fantasy',
  romance:'romance',
  history:'history',
  biography:'biography',
  philosophy:'philosophy',
  religion:'religion',
  science:'science',
  mathematics:'mathematics',
  technology:'technology',
  programming:'programming',
  business:'business',
  economics:'economics',
  politics:'politics',
  psychology:'psychology',
  education:'education',
  children:'children',
  poetry:'poetry',
  drama:'drama',
  reference:'reference'
};

function normalizeDrmFreeCategory(value='') {
  const raw=String(value||'').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(DRM_FREE_CATEGORY_TOPICS,raw) ? raw : 'all';
}

function drmFreeBookFormats(formats={}) {
  const keys=Object.keys(formats||{});
  const list=[];
  if(keys.some(key=>/application\/epub\+zip/i.test(key))) list.push('epub');
  if(keys.some(key=>/application\/pdf/i.test(key))) list.push('pdf');
  if(keys.some(key=>/^text\/plain/i.test(key))) list.push('text');
  return list;
}

function normalizeDrmFreeGutenberg(raw) {
  const formats=drmFreeBookFormats(raw?.formats||{});
  const cover=Object.entries(raw?.formats||{}).find(([mime,url])=>/^image\//i.test(mime)&&typeof url==='string')?.[1]||'';
  return {
    kind:'book',
    rights:'public-domain',
    availability:'free',
    provider:'gutenberg',
    sourceLabel:'Project Gutenberg',
    id:String(raw?.id||''),
    title:String(raw?.title||'Untitled'),
    author:authorNames(raw?.authors),
    language:Array.isArray(raw?.languages)?raw.languages.join(', '):'',
    subjects:Array.isArray(raw?.subjects)?raw.subjects.slice(0,8):[],
    categories:Array.isArray(raw?.bookshelves)?raw.bookshelves.slice(0,6):[],
    formats,
    cover,
    downloadCount:Number(raw?.download_count||0),
    readable:formats.includes('text')||formats.includes('epub'),
    externalUrl:raw?.id?`https://www.gutenberg.org/ebooks/${raw.id}`:''
  };
}

async function searchDrmFreeGutenberg({q='',category='all',language='en',limit=24}={}) {
  const params=new URLSearchParams();
  if(q) params.set('search',q);
  if(category!=='all') params.set('topic',DRM_FREE_CATEGORY_TOPICS[category]||category);
  if(language && language!=='all') params.set('languages',language);
  const payload=await fetchJsonWithRetry(`${GUTENDEX_BASE}/books/?${params}`,{
    timeoutMs:18000,attempts:1,cacheTtlMs:LIBRARY_CACHE_MS
  });
  return (payload.results||[]).slice(0,limit).map(normalizeDrmFreeGutenberg);
}

async function searchDrmFreeStandardEbooks({q='',category='all',limit=24}={}) {
  const {buffer}=await fetchBuffer('https://standardebooks.org/opds/all',{
    timeoutMs:25000,maxBytes:9*1024*1024,
    headers:{Accept:'application/atom+xml,application/xml,text/xml'}
  });
  const $=cheerio.load(buffer.toString('utf8'),{xmlMode:true});
  const needle=String(q||'').trim().toLowerCase();
  const categoryNeedle=category==='all'?'':String(DRM_FREE_CATEGORY_TOPICS[category]||category).toLowerCase();
  const results=[];
  $('entry').each((_i,node)=>{
    if(results.length>=limit) return;
    const entry=$(node);
    const title=entry.find('title').first().text().trim();
    const author=entry.find('author name').map((_j,n)=>$(n).text().trim()).get().join(', ');
    const summary=stripMarkup(entry.find('summary,content').first().text()).trim();
    const subjects=entry.find('category').map((_j,n)=>$(n).attr('term')||$(n).text()).get().filter(Boolean);
    const haystack=[title,author,summary,...subjects].join(' ').toLowerCase();
    if(needle && !haystack.includes(needle)) return;
    if(categoryNeedle && !haystack.includes(categoryNeedle)) return;

    const acquisition=entry.find('link').filter((_j,n)=>
      /opds-spec\.org\/acquisition/i.test($(n).attr('rel')||'') &&
      /epub/i.test($(n).attr('type')||'')
    ).first().attr('href')||'';
    if(!acquisition) return;
    const alternate=entry.find('link[rel="alternate"]').first().attr('href')||entry.find('id').first().text().trim();
    const cover=entry.find('link').filter((_j,n)=>/image\/jpeg|image\/png/i.test($(n).attr('type')||'')).first().attr('href')||'';
    results.push({
      kind:'book',
      rights:'public-domain',
      availability:'free',
      provider:'standardebooks',
      sourceLabel:'Standard Ebooks',
      id:Buffer.from(acquisition).toString('base64url'),
      title:title||'Untitled',
      author,
      language:'en',
      subjects:subjects.slice(0,8),
      categories:subjects.slice(0,6),
      formats:['epub'],
      cover,
      downloadCount:0,
      readable:true,
      externalUrl:alternate,
      description:summary.slice(0,360)
    });
  });
  return results;
}


function dspaceMetadataMap(item={}) {
  const map={};
  const values=Array.isArray(item.metadata)
    ? item.metadata
    : Array.isArray(item?.expand?.metadata)
      ? item.expand.metadata
      : [];
  values.forEach(entry=>{
    const key=String(entry?.key||[
      entry?.schema,
      entry?.element,
      entry?.qualifier
    ].filter(Boolean).join('.')).trim();
    const value=String(entry?.value||'').trim();
    if(!key||!value) return;
    if(!map[key]) map[key]=[];
    map[key].push(value);
  });
  return map;
}

function firstMetadata(meta, keys=[]) {
  for(const key of keys){
    const value=meta[key];
    if(Array.isArray(value)&&value.length) return value[0];
  }
  return '';
}

function allMetadata(meta, keys=[]) {
  const out=[];
  keys.forEach(key=>{
    const values=Array.isArray(meta[key])?meta[key]:[];
    values.forEach(value=>{ if(value&&!out.includes(value)) out.push(value); });
  });
  return out;
}

function extractDspaceBitstreams(item={}) {
  const raw=Array.isArray(item.bitstreams)
    ? item.bitstreams
    : Array.isArray(item?.expand?.bitstreams)
      ? item.expand.bitstreams
      : [];
  return raw.map(bitstream=>({
    name:String(bitstream?.name||bitstream?.bundleName||''),
    mime:String(bitstream?.mimeType||bitstream?.format||bitstream?.formatDescription||'').toLowerCase(),
    url:String(bitstream?.retrieveLink||bitstream?.downloadUrl||bitstream?.link||'')
  })).filter(item=>item.url);
}

function normalizeOpenAccessDspaceBook(raw,{provider,sourceLabel,baseUrl}={}) {
  const meta=dspaceMetadataMap(raw);
  const title=firstMetadata(meta,['dc.title','dc.title.other'])||String(raw?.name||'Untitled');
  const authors=allMetadata(meta,['dc.contributor.author','dc.creator','dc.contributor.editor']);
  const subjects=allMetadata(meta,['dc.subject','dc.subject.other','dc.subject.classification']).slice(0,10);
  const languages=allMetadata(meta,['dc.language.iso','dc.language']).slice(0,3);
  const date=firstMetadata(meta,['dc.date.issued','dc.date.available','dc.date.created']);
  const license=firstMetadata(meta,['dc.rights','dc.rights.uri','dc.rights.license']);
  const publisher=firstMetadata(meta,['dc.publisher']);
  const description=firstMetadata(meta,['dc.description.abstract','dc.description']);
  const handle=String(raw?.handle||firstMetadata(meta,['dc.identifier.uri'])||'');
  const bitstreams=extractDspaceBitstreams(raw);
  const pdf=bitstreams.find(file=>/pdf/.test(file.mime)||/\.pdf(?:$|\?)/i.test(file.url)||/\.pdf$/i.test(file.name));
  const epub=bitstreams.find(file=>/epub/.test(file.mime)||/\.epub(?:$|\?)/i.test(file.url)||/\.epub$/i.test(file.name));
  const formats=[];
  if(epub) formats.push('epub');
  if(pdf) formats.push('pdf');

  const absolutize=(url)=>{
    if(!url) return '';
    try{return new URL(url,baseUrl).toString();}catch{return '';}
  };
  const externalUrl=/^https?:\/\//i.test(handle)
    ? handle
    : handle
      ? `${baseUrl.replace(/\/$/,'')}/handle/${handle}`
      : baseUrl;

  return {
    kind:'book',
    rights:'open-access',
    availability:'free',
    provider,
    sourceLabel,
    id:String(raw?.uuid||raw?.id||handle||title),
    title,
    author:authors.join(', '),
    year:String(date||'').match(/\d{4}/)?.[0]||'',
    language:languages.join(', '),
    subjects,
    categories:subjects.slice(0,6),
    formats,
    cover:'',
    downloadCount:0,
    readable:false,
    externalUrl,
    downloadUrl:absolutize(epub?.url||pdf?.url||''),
    downloadFormat:epub?'epub':pdf?'pdf':'',
    license,
    publisher,
    description:String(description||'').replace(/\s+/g,' ').trim().slice(0,420)
  };
}

async function searchOpenAccessDspace({endpoint,provider,sourceLabel,baseUrl,q='',category='all',language='all',yearFrom='',yearTo='',limit=24}={}) {
  const parts=[];
  const searchText=String(q||'').trim();
  if(searchText) parts.push(searchText);
  if(category!=='all') parts.push(`dc.subject:${JSON.stringify(DRM_FREE_CATEGORY_TOPICS[category]||category)}`);
  if(language&&language!=='all') parts.push(`dc.language.iso:${JSON.stringify(language)}`);
  if(yearFrom) parts.push(`dc.date.issued_dt:[${yearFrom}-01-01 TO *]`);
  if(yearTo) parts.push(`dc.date.issued_dt:[* TO ${yearTo}-12-31]`);
  const query=parts.length?parts.join(' AND '):'*';

  const params=new URLSearchParams({
    query,
    expand:'metadata,bitstreams',
    limit:String(Math.max(1,Math.min(50,limit)))
  });
  const payload=await fetchJsonWithRetry(`${endpoint}?${params}`,{
    timeoutMs:22000,attempts:1,cacheTtlMs:LIBRARY_CACHE_MS
  });
  const rows=Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.results)
        ? payload.results
        : [];
  return rows.slice(0,limit).map(item=>normalizeOpenAccessDspaceBook(item,{provider,sourceLabel,baseUrl}));
}

async function searchDrmFreeDoab(options={}) {
  return searchOpenAccessDspace({
    ...options,
    endpoint:'https://directory.doabooks.org/rest/search',
    provider:'doab',
    sourceLabel:'DOAB',
    baseUrl:'https://directory.doabooks.org'
  });
}

async function searchDrmFreeOapen(options={}) {
  return searchOpenAccessDspace({
    ...options,
    endpoint:'https://library.oapen.org/rest/search',
    provider:'oapen',
    sourceLabel:'OAPEN',
    baseUrl:'https://library.oapen.org'
  });
}

async function searchDrmFreeOpenLibrary({q='',category='all',language='all',yearFrom='',yearTo='',limit=24}={}) {
  const terms=[];
  if(q) terms.push(String(q).trim());
  if(category!=='all') terms.push(`subject_key:${JSON.stringify((DRM_FREE_CATEGORY_TOPICS[category]||category).replace(/\s+/g,'_'))}`);
  terms.push('ebook_access:public');
  if(language&&language!=='all') terms.push(`language:${language}`);
  if(yearFrom||yearTo) terms.push(`first_publish_year:[${yearFrom||0} TO ${yearTo||3000}]`);
  const params=new URLSearchParams({
    q:terms.join(' '),
    limit:String(Math.max(1,Math.min(50,limit))),
    fields:'key,title,author_name,first_publish_year,cover_i,language,ebook_access,ia,subject'
  });
  const payload=await fetchJsonWithRetry(`https://openlibrary.org/search.json?${params}`,{
    timeoutMs:20000,attempts:1,cacheTtlMs:LIBRARY_CACHE_MS,
    headers:{'User-Agent':'MarkSetGoWeb/2.0 (DRM-free book discovery)'}
  });
  return (payload.docs||[]).slice(0,limit).map(book=>{
    const archiveId=Array.isArray(book.ia)?book.ia[0]:'';
    return {
      kind:'book',
      rights:'public-access',
      availability:'free',
      provider:archiveId?'internetarchive':'openlibrary',
      sourceLabel:'Open Library',
      id:archiveId||String(book.key||'').replace('/works/',''),
      title:book.title||'Untitled',
      author:authorNames(book.author_name),
      year:book.first_publish_year||'',
      language:Array.isArray(book.language)?book.language.slice(0,3).join(', '):'',
      subjects:Array.isArray(book.subject)?book.subject.slice(0,8):[],
      categories:Array.isArray(book.subject)?book.subject.slice(0,6):[],
      formats:archiveId?['text']:[],
      cover:book.cover_i?`https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`:'',
      downloadCount:0,
      readable:Boolean(archiveId),
      externalUrl:book.key?`https://openlibrary.org${book.key}`:'https://openlibrary.org/',
      description:archiveId?'Publicly readable edition linked through Open Library / Internet Archive.':'Public-access catalog record from Open Library.'
    };
  });
}

function searchDrmFreeCommercialSources({q='',category='all',format='all'}={}) {
  const needle=String(q||'').trim().toLowerCase();
  return DRM_FREE_COMMERCIAL_SOURCES.filter(source=>{
    const haystack=[source.name,source.note,...source.categories,...source.formats].join(' ').toLowerCase();
    if(needle && !haystack.includes(needle)) return false;
    if(category!=='all' && !source.categories.includes(category)) return false;
    if(format!=='all' && !source.formats.includes(format)) return false;
    return true;
  }).map(source=>({kind:'store',...source,rights:'commercial-drm-free',sourceLabel:source.name}));
}

app.get('/api/drm-free/search', async (req,res)=>{
  const q=String(req.query.q||'').trim().slice(0,180);
  const category=normalizeDrmFreeCategory(req.query.category);
  const availability=String(req.query.availability||'all').toLowerCase();
  const format=String(req.query.format||'all').toLowerCase();
  const source=String(req.query.source||'all').toLowerCase();
  const language=String(req.query.language||'en').toLowerCase();
  const sort=String(req.query.sort||'popular').toLowerCase();
  const yearFrom=String(req.query.yearFrom||'').replace(/\D/g,'').slice(0,4);
  const yearTo=String(req.query.yearTo||'').replace(/\D/g,'').slice(0,4);
  const license=String(req.query.license||'all').toLowerCase();

  if(!['all','free','paid'].includes(availability)) return res.status(400).json({error:'Unknown availability filter.'});
  if(!['all','epub','pdf','text','mobi'].includes(format)) return res.status(400).json({error:'Unknown format filter.'});
  if(!['all','gutenberg','standardebooks','openlibrary','doab','oapen','commercial'].includes(source)) return res.status(400).json({error:'Unknown DRM-free source.'});
  if(!['all','public-domain','open-access'].includes(license)) return res.status(400).json({error:'Unknown rights filter.'});

  const cacheKey=`drmfree:${q}:${category}:${availability}:${format}:${source}:${language}:${sort}:${yearFrom}:${yearTo}:${license}`;
  const cached=librarySearchCache.get(cacheKey);
  if(cached&&cached.expiresAt>Date.now()) return res.json(cached.payload);

  const tasks=[];
  const labels=[];
  if(availability!=='paid' && (source==='all'||source==='gutenberg')){
    labels.push('gutenberg');
    tasks.push(searchDrmFreeGutenberg({q,category,language,limit:32}));
  }
  if(availability!=='paid' && (source==='all'||source==='standardebooks')){
    labels.push('standardebooks');
    tasks.push(searchDrmFreeStandardEbooks({q,category,limit:24}));
  }
  if(availability!=='paid' && (source==='all'||source==='openlibrary')){
    labels.push('openlibrary');
    tasks.push(searchDrmFreeOpenLibrary({q,category,language,yearFrom,yearTo,limit:24}));
  }
  if(availability!=='paid' && license!=='public-domain' && (source==='all'||source==='doab')){
    labels.push('doab');
    tasks.push(searchDrmFreeDoab({q,category,language,yearFrom,yearTo,limit:24}));
  }
  if(availability!=='paid' && license!=='public-domain' && (source==='all'||source==='oapen')){
    labels.push('oapen');
    tasks.push(searchDrmFreeOapen({q,category,language,yearFrom,yearTo,limit:24}));
  }

  const settled=await Promise.allSettled(tasks);
  let books=[];
  const errors=[];
  settled.forEach((result,index)=>{
    if(result.status==='fulfilled') books.push(...result.value);
    else errors.push({source:labels[index],error:result.reason?.message||'Unavailable'});
  });

  if(format!=='all') books=books.filter(book=>Array.isArray(book.formats)&&book.formats.includes(format));
  if(license==='public-domain') books=books.filter(book=>book.rights==='public-domain');
  if(license==='open-access') books=books.filter(book=>book.rights==='open-access'||book.rights==='public-access');
  if(yearFrom) books=books.filter(book=>!book.year||Number(book.year)>=Number(yearFrom));
  if(yearTo) books=books.filter(book=>!book.year||Number(book.year)<=Number(yearTo));

  const seen=new Set();
  books=books.filter(book=>{
    const key=`${String(book.title||'').toLowerCase()}|${String(book.author||'').toLowerCase()}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if(sort==='title') books.sort((a,b)=>String(a.title).localeCompare(String(b.title)));
  else if(sort==='author') books.sort((a,b)=>String(a.author).localeCompare(String(b.author)));
  else if(sort==='newest') books.sort((a,b)=>Number(b.year||0)-Number(a.year||0));
  else if(sort==='oldest') books.sort((a,b)=>Number(a.year||9999)-Number(b.year||9999));
  else if(sort==='downloads') books.sort((a,b)=>Number(b.downloadCount||0)-Number(a.downloadCount||0));
  else books.sort((a,b)=>Number(b.downloadCount||0)-Number(a.downloadCount||0));

  const stores=(availability!=='free' && (source==='all'||source==='commercial'))
    ? searchDrmFreeCommercialSources({q,category,format})
    : [];

  const payload={
    query:q,category,availability,format,source,language,sort,yearFrom,yearTo,license,
    books:books.slice(0,80),
    stores:stores.slice(0,30),
    errors,
    note:'Federated search covers supported public-domain/open-access catalogs plus a curated commercial DRM-free directory. No single complete index of every DRM-free ebook on the internet exists, so coverage will expand source by source.'
  };
  librarySearchCache.set(cacheKey,{payload,expiresAt:Date.now()+LIBRARY_CACHE_MS});
  return res.json(payload);
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
    availableFormats: [], cover: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg` : '', readable: false,
    externalUrl: book.key ? `https://openlibrary.org${book.key}` : 'https://openlibrary.org/',
    description: book.public_scan_b ? 'A public scan may be available from a linked archive.' : 'Edition and catalog information from Open Library.'
  }));
}

async function searchInternetArchive(q) {
  const query = `(title:(${JSON.stringify(q)}) OR creator:(${JSON.stringify(q)})) AND mediatype:texts`;
  const params = new URLSearchParams({ q: query, fl: 'identifier,title,creator,date,language,description,format', rows: '12', page: '1', output: 'json', sort: 'downloads desc' });
  const payload = await fetchJsonWithRetry(`https://archive.org/advancedsearch.php?${params}`, { timeoutMs: 20000, attempts: 2, cacheTtlMs: LIBRARY_CACHE_MS });
  return (payload.response?.docs || []).slice(0, 10).map((book) => ({
    provider: 'internetarchive', id: book.identifier, title: Array.isArray(book.title) ? book.title[0] : book.title || 'Untitled',
    author: Array.isArray(book.creator) ? book.creator.join(', ') : book.creator || '', year: String(book.date || '').slice(0,4),
    language: Array.isArray(book.language) ? book.language[0] : book.language || '', cover: `https://archive.org/services/img/${encodeURIComponent(book.identifier)}`,
    readable: true, availableFormats: (Array.isArray(book.format) ? book.format : [book.format]).filter(Boolean).reduce((formats, value) => { const label = String(value).toLowerCase(); if (label.includes('epub') && !formats.includes('epub')) formats.push('epub'); if (label.includes('pdf') && !formats.includes('pdf')) formats.push('pdf'); if ((label.includes('text') || label.includes('djvu')) && !formats.includes('text')) formats.push('text'); return formats; }, []), externalUrl: `https://archive.org/details/${encodeURIComponent(book.identifier)}`,
    description: stripMarkup(Array.isArray(book.description) ? book.description[0] : book.description || '').slice(0, 280)
  }));
}

async function searchWikisource(q) {
  const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: q, gsrnamespace: '0', gsrlimit: '10', prop: 'extracts|info|pageimages', exintro: '1', explaintext: '1', exchars: '280', inprop: 'url', piprop: 'thumbnail', pithumbsize: '300', format: 'json', origin: '*' });
  const payload = await fetchJsonWithRetry(`https://en.wikisource.org/w/api.php?${params}`, { timeoutMs: 18000, attempts: 2, cacheTtlMs: LIBRARY_CACHE_MS });
  return Object.values(payload.query?.pages || {}).map((page) => ({
    provider: 'wikisource', id: String(page.pageid), title: page.title || 'Untitled', author: '', language: 'English', availableFormats:['text'],
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
    results.push({ provider: 'standardebooks', id, title, author, language: 'English', format: 'EPUB', availableFormats:['epub'], cover, readable: Boolean(acquisition), externalUrl: alternate, description: stripMarkup(entry.find('summary,content').first().text()).slice(0,280) });
  });
  return results;
}

async function searchGutenbergUnified(q) {
  const params = new URLSearchParams({ search: q, languages: 'en' });
  const payload = await fetchJsonWithRetry(`${GUTENDEX_BASE}/books/?${params}`, { timeoutMs: 18000, attempts: 1, cacheTtlMs: LIBRARY_CACHE_MS });
  return (payload.results || []).slice(0, 10).map((raw) => { const book = normalizeGutenbergBook(raw); const formatKeys = Object.keys(raw?.formats || {}); const availableFormats = []; if (formatKeys.some((key) => key.startsWith('text/plain'))) availableFormats.push('text'); if (formatKeys.some((key) => /application\/epub\+zip/i.test(key))) availableFormats.push('epub'); if (formatKeys.some((key) => /application\/pdf/i.test(key))) availableFormats.push('pdf'); return {
    provider: 'gutenberg', id: String(book.id), title: book.title, author: book.authors.join(', '), language: book.languages.join(', '),
    cover: book.cover, readable: true, availableFormats, externalUrl: book.gutenbergUrl, description: book.subjects.slice(0,2).join(' · '), format: availableFormats.map((item) => item === 'text' ? 'Plain text' : item.toUpperCase()).join(' · ')
  }; });
}

app.get('/api/library/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 160);
  const provider = String(req.query.provider || 'all').toLowerCase();
  const format = String(req.query.format || 'best').toLowerCase();
  if (!['best','text','epub','pdf'].includes(format)) return res.status(400).json({ error: 'Unknown book format.' });
  if (q.length < 2) return res.status(400).json({ error: 'Enter at least two characters to search.' });
  const available = { standardebooks: searchStandardEbooks, internetarchive: searchInternetArchive, openlibrary: searchOpenLibrary, wikisource: searchWikisource, gutenberg: searchGutenbergUnified };
  if (provider !== 'all' && !available[provider]) return res.status(400).json({ error: 'Unknown library source.' });
  const cacheKey = `${provider}:${format}:${q.toLowerCase()}`;
  const cached = librarySearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.payload);
  const targets = provider === 'all' ? Object.entries(available) : [[provider, available[provider]]];
  const settled = await Promise.allSettled(targets.map(async ([name, fn]) => [name, await fn(q)]));
  const books = []; const errors = [];
  settled.forEach((result, index) => {
    const name = targets[index][0];
    if (result.status === 'fulfilled') books.push(...result.value[1]); else errors.push({ provider: name, error: result.reason?.message || 'Unavailable' });
  });
  const filteredBooks = format === 'best' ? books : books.filter((book) => Array.isArray(book.availableFormats) && book.availableFormats.includes(format));
  const payload = { query: q, provider, format, books: filteredBooks.slice(0, provider === 'all' ? 30 : 15), errors };
  if (filteredBooks.length) librarySearchCache.set(cacheKey, { payload, expiresAt: Date.now() + LIBRARY_CACHE_MS });
  if (!filteredBooks.length && !books.length && errors.length === targets.length) return res.status(502).json({ error: 'The selected libraries could not be reached. Please try again shortly.', details: errors });
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


function selectArchiveFormatFile(files, format) {
  const candidates = (Array.isArray(files) ? files : []).filter((file) => Number(file?.size || 0) > 0);
  const within = (file, max) => Number(file.size || 0) <= max;
  if (format === 'epub') return candidates.find((file) => /\.epub$/i.test(file.name || '') && within(file, 60 * 1024 * 1024));
  if (format === 'pdf') return candidates.find((file) => /\.pdf$/i.test(file.name || '') && !/(text|searchable|bw)\.pdf$/i.test(file.name || '') && within(file, 100 * 1024 * 1024))
    || candidates.find((file) => /\.pdf$/i.test(file.name || '') && within(file, 100 * 1024 * 1024));
  return candidates.find((file) => /_djvu\.txt$/i.test(file.name || '') && within(file, 25 * 1024 * 1024))
    || candidates.find((file) => /\.txt$/i.test(file.name || '') && within(file, 25 * 1024 * 1024));
}

function selectGutenbergFormatUrl(formats, format) {
  const entries = Object.entries(formats || {}).filter(([, url]) => typeof url === 'string' && /^https?:\/\//i.test(url));
  if (format === 'epub') return entries.find(([mime]) => /application\/epub\+zip/i.test(mime))?.[1] || '';
  if (format === 'pdf') return entries.find(([mime]) => /application\/pdf/i.test(mime))?.[1] || '';
  return entries.find(([mime]) => /^text\/plain/i.test(mime) && /utf-8/i.test(mime))?.[1]
    || entries.find(([mime]) => /^text\/plain/i.test(mime))?.[1] || '';
}

app.get('/api/library/download', async (req, res) => {
  const provider = String(req.query.provider || '').toLowerCase();
  const id = String(req.query.id || '').trim().slice(0, 700);
  const format = String(req.query.format || '').toLowerCase();
  if (!id || !['epub','pdf'].includes(format)) return res.status(400).json({ error: 'Choose an EPUB or PDF edition.' });
  try {
    let sourceUrl = '';
    if (provider === 'internetarchive') {
      const metadata = await fetchJsonWithRetry(`https://archive.org/metadata/${encodeURIComponent(id)}`, { timeoutMs:22000, attempts:2, cacheTtlMs:LIBRARY_CACHE_MS });
      const file = selectArchiveFormatFile(metadata.files, format);
      if (!file) throw new Error(`No ${format.toUpperCase()} edition was found for this Internet Archive item.`);
      sourceUrl = `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(file.name).replace(/%2F/g, '/')}`;
    } else if (provider === 'standardebooks' && format === 'epub') {
      try { sourceUrl = Buffer.from(id, 'base64url').toString('utf8'); } catch {}
      const parsed = new URL(sourceUrl);
      if (parsed.hostname !== 'standardebooks.org' && !parsed.hostname.endsWith('.standardebooks.org')) throw new Error('Invalid Standard Ebooks download host.');
    } else if (provider === 'gutenberg') {
      const numericId = Number.parseInt(id, 10);
      const payload = await fetchJsonWithRetry(`${GUTENDEX_BASE}/books/${numericId}`, { timeoutMs:20000, attempts:1, cacheTtlMs:LIBRARY_CACHE_MS });
      sourceUrl = selectGutenbergFormatUrl(payload?.formats, format);
      if (!sourceUrl) throw new Error(`Project Gutenberg does not list a ${format.toUpperCase()} edition for this book.`);
    } else {
      throw new Error(`This source does not provide a direct ${format.toUpperCase()} edition.`);
    }
    const { buffer, contentType } = await fetchBuffer(sourceUrl, { maxBytes: format === 'pdf' ? 100 * 1024 * 1024 : 60 * 1024 * 1024, timeoutMs:45000 });
    res.setHeader('Content-Type', format === 'epub' ? 'application/epub+zip' : (contentType || 'application/pdf'));
    res.setHeader('Content-Disposition', `attachment; filename="mark-set-go-book.${format}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(buffer);
  } catch (error) {
    return res.status(502).json({ error: error?.name === 'AbortError' ? 'The selected edition took too long to download.' : error?.message || 'The selected edition could not be downloaded.' });
  }
});

app.get('/api/library/read', async (req, res) => {
  const provider = String(req.query.provider || '').toLowerCase();
  const id = String(req.query.id || '').trim().slice(0, 700);
  const format = String(req.query.format || 'best').toLowerCase();
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



app.post('/api/read-anything/summarize', async (req, res) => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return res.status(503).json({ error: 'Summarization is not configured. Add OPENAI_API_KEY to the server environment.' });
  const title = String(req.body?.title || 'Untitled').trim().slice(0, 300);
  const text = String(req.body?.text || '').replace(/\r/g, '').trim();
  const customInstructions = String(req.body?.instructions || '').trim().slice(0, 2000);
  const style = String(req.body?.style || 'quick').trim().toLowerCase();
  if (text.length < 20) return res.status(400).json({ error: 'There is not enough text to summarize.' });
  if (text.length > 120000) return res.status(413).json({ error: 'This document is too long to summarize in one request. Try a chapter or shorter selection.' });
  const model = process.env.OPENAI_STUDY_MODEL || process.env.OPENAI_COMPREHENSION_MODEL || 'gpt-5.6-luna';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 80000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, reasoning: { effort: 'low' }, store: false,
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: 'Summarize the supplied reading according to the requested style. Quick: no more than 75 words or 5 short bullets. Study: 180–250 words with the main argument, essential evidence, and key qualifications. Detailed: a concise section-by-section summary that remains substantially shorter than the source. Omit repetition and minor examples unless essential. Preserve critical names, dates, numbers, and uncertainty. Do not invent information, add opinions, or mention these instructions. Return only the summary.' }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ title, text, style, customInstructions: customInstructions || undefined }) }] }
        ]
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `OpenAI returned HTTP ${response.status}.`);
    const output = extractOpenAIOutputText(payload).trim();
    if (!output) throw new Error('No summary was returned.');
    return res.json({ title, text: output });
  } catch (error) {
    console.error('Read Anything summary failed:', error);
    return res.status(502).json({
      error: error?.name === 'AbortError' ? 'The summary took too long.' : 'The summary could not be created.',
      detail: error?.name === 'AbortError' ? 'Try a shorter article or passage.' : error?.message || 'Unknown summary error.'
    });
  } finally { clearTimeout(timeout); }
});


app.post('/api/read-anything/transform', async (req, res) => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return res.status(503).json({ error: 'Custom transformation is not configured. Add OPENAI_API_KEY to the server environment.' });
  const title = String(req.body?.title || 'Untitled').trim().slice(0, 300);
  const text = String(req.body?.text || '').replace(/\r/g, '').trim();
  const instructions = String(req.body?.instructions || '').trim().slice(0, 3000);
  if (text.length < 20) return res.status(400).json({ error: 'There is not enough text to transform.' });
  if (!instructions) return res.status(400).json({ error: 'Enter transformation instructions.' });
  if (text.length > 120000) return res.status(413).json({ error: 'This document is too long to transform in one request. Try a chapter or shorter selection.' });
  const model = process.env.OPENAI_STUDY_MODEL || process.env.OPENAI_COMPREHENSION_MODEL || 'gpt-5.6-luna';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 135000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, reasoning: { effort: 'low' }, store: false,
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: 'Transform the supplied reading exactly according to the user instruction. Preserve factual accuracy, names, dates, numbers, uncertainty, and source meaning. Do not add unsupported facts. Return only the transformed text, with readable paragraph spacing and headings when appropriate.' }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ title, instructions, text }) }] }
        ]
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `OpenAI returned HTTP ${response.status}.`);
    const output = extractOpenAIOutputText(payload).trim();
    if (!output) throw new Error('No transformed text was returned.');
    return res.json({ title, instructions, text: output });
  } catch (error) {
    console.error('Read Anything custom transform failed:', error);
    return res.status(502).json({
      error: error?.name === 'AbortError' ? 'The transformation took too long.' : 'The transformation could not be created.',
      detail: error?.name === 'AbortError' ? 'Try a shorter article or passage.' : error?.message || 'Unknown transformation error.'
    });
  } finally { clearTimeout(timeout); }
});

app.post('/api/read-anything/adapt', async (req, res) => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return res.status(503).json({ error: 'Reading-level adaptation is not configured. Add OPENAI_API_KEY to the server environment.' });
  const title = String(req.body?.title || 'Untitled').trim().slice(0, 300);
  const level = String(req.body?.level || '').trim().toLowerCase();
  const instructions = {
    graduate: 'Rewrite for a graduate-level reader. Preserve all nuance, technical precision, qualifications, and domain terminology while improving organization and scholarly clarity.',
    college: 'Rewrite for an adult college-level reader. Preserve nuance and technical accuracy while improving organization and clarity.',
    highschool: 'Rewrite for a typical high-school reader. Use clear sentences and explain difficult vocabulary without removing important detail.',
    grade8: 'Rewrite for an eighth-grade reader. Use direct sentences, familiar vocabulary, and short explanations for necessary difficult terms.',
    grade6: 'Rewrite for a sixth-grade reader. Use shorter sentences, common vocabulary, and clear paragraph structure while preserving all essential facts.',
    grade4: 'Rewrite for a fourth-grade reader. Use short, concrete sentences and familiar words. Explain essential difficult ideas simply without changing the facts.'
  };
  if (!instructions[level]) return res.status(400).json({ error: 'Choose a supported reading level.' });
  const text = String(req.body?.text || '').replace(/\r/g, '').trim();
  if (text.length < 20) return res.status(400).json({ error: 'There is not enough text to adapt.' });
  if (text.length > 120000) return res.status(413).json({ error: 'This document is too long to adapt reliably in one request. Try a chapter or shorter article.' });

  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > 9000) { chunks.push(current); current = ''; }
    current += `${current ? '\n\n' : ''}${paragraph}`;
  }
  if (current) chunks.push(current);
  if (chunks.length > 14) return res.status(413).json({ error: 'This document produces too many adaptation sections. Try a chapter or shorter selection.' });

  const prompt = `You adapt reading material without changing its meaning. ${instructions[level]}\nPreserve names, dates, numbers, factual qualifications, sequence, headings, and paragraph breaks. Do not summarize, omit claims, add opinions, invent facts, or mention these instructions. Keep direct quotations unchanged when practical. Return only the adapted text for this section.`;
  const model = process.env.OPENAI_STUDY_MODEL || process.env.OPENAI_COMPREHENSION_MODEL || 'gpt-5.6-luna';

  async function adaptChunk(chunk, index) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 65000);
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          reasoning: { effort: 'low' },
          store: false,
          input: [
            { role: 'developer', content: [{ type: 'input_text', text: prompt }] },
            { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ title, section: index + 1, totalSections: chunks.length, text: chunk }) }] }
          ]
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || `OpenAI returned HTTP ${response.status}.`);
      const output = extractOpenAIOutputText(payload);
      if (!output) throw new Error(`No adapted text was returned for section ${index + 1}.`);
      return output.trim();
    } finally {
      clearTimeout(timeout);
    }
  }

  try {
    const results = new Array(chunks.length);
    let nextIndex = 0;
    const workerCount = Math.min(3, chunks.length);
    async function worker() {
      while (nextIndex < chunks.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await adaptChunk(chunks[index], index);
      }
    }
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return res.json({ level, title, text: results.join('\n\n'), sections: chunks.length });
  } catch (error) {
    console.error('Read Anything adaptation failed:', error);
    const timedOut = error?.name === 'AbortError';
    return res.status(502).json({
      error: timedOut ? 'The reading-level adaptation took too long.' : 'The reading-level version could not be created.',
      detail: timedOut ? 'Try a shorter article or section.' : error?.message || 'Unknown adaptation error.'
    });
  }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
/* Topic Feeds beta ---------------------------------------------------------
   User-defined RSS/Atom or website sources. Website URLs are converted to a
   topic-filtered Google News RSS query for that domain. Custom URLs are
   validated with the same public-URL guard used by webpage import.
*/
function topicFeedGoogleNewsUrl(topic, hostname) {
  const queryText = `${topic}${hostname ? ` site:${hostname.replace(/^www\./i, '')}` : ''}`;
  const params = new URLSearchParams({
    q: queryText,
    hl: 'en-US',
    gl: 'US',
    ceid: 'US:en'
  });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

app.post('/api/topic-feeds/fetch', async (req, res) => {
  const topic = cleanText(req.body?.topic, 200);
  const requestedSources = Array.isArray(req.body?.sources) ? req.body.sources.slice(0, 30) : [];
  if (!topic) return res.status(400).json({ error: 'A topic is required.' });
  if (!requestedSources.length) return res.status(400).json({ error: 'Add at least one source.' });

  const articles = [];
  const sourceResults = [];

  for (const rawSource of requestedSources) {
    const type = rawSource?.type === 'rss' ? 'rss' : 'website';
    const rawUrl = cleanText(rawSource?.url, 2000);
    const name = cleanText(rawSource?.name, 200) || rawUrl;
    if (!rawUrl) continue;

    try {
      const parsed = await validatePublicUrl(rawUrl);
      let feedUrl = parsed.toString();
      let items = [];
      let mode = 'rss';

      if (type === 'website') {
        const discoveredFeed = await discoverPublisherFeed(parsed.toString());

        if (discoveredFeed?.items?.length) {
          feedUrl = discoveredFeed.feedUrl;
          items = discoveredFeed.items;
          mode = 'publisher-feed';
        } else {
          const publisherItems = await discoverPublisherPageArticles(parsed.toString(), topic);
          if (publisherItems.length) {
            items = publisherItems;
            feedUrl = parsed.toString();
            mode = 'publisher-page';
          } else {
            feedUrl = topicFeedGoogleNewsUrl(topic, parsed.hostname);
            items = await fetchFeedItems({ feedUrl });
            mode = 'google-news-fallback';
          }
        }
      } else {
        items = await fetchFeedItems({ feedUrl });
      }

      for (const item of items) {
        articles.push({
          id: crypto.createHash('sha1').update(`${name}|${item.link}|${item.title}`).digest('hex'),
          title: item.title,
          url: item.link,
          summary: item.summary || '',
          published: item.published || '',
          sourceName: name,
          sourceUrl: rawUrl,
          sourceType: type,
          feedMode: mode
        });
      }

      sourceResults.push({
        name,
        url: rawUrl,
        ok: true,
        count: items.length,
        feedUrl,
        mode
      });
    } catch (error) {
      sourceResults.push({
        name,
        url: rawUrl,
        ok: false,
        count: 0,
        error: error?.message || 'The source could not be refreshed.'
      });
    }
  }

  const seen = new Set();
  const deduped = articles
    .filter((article) => {
      const key = String(article.url || '').trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const at = Date.parse(a.published || '') || 0;
      const bt = Date.parse(b.published || '') || 0;
      return bt - at;
    })
    .slice(0, 300);

  res.json({ topic, articles: deduped, sources: sourceResults });
});

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
