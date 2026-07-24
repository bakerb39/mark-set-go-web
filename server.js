'use strict';

const express = require('express');
const cheerio = require('cheerio');
const dns = require('node:dns').promises;
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');

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

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Mark, Set, Go! is running at http://localhost:${PORT}`));
