'use strict';

const express = require('express');
const cheerio = require('cheerio');
const dns = require('node:dns').promises;
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_TRANSLATION_CHARS = 120000;

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

app.get('/api/news', async (_req, res) => {
  try {
    const text = await fetchReadableText('https://legiblenews.com/');
    return res.json({ text: text.slice(0, 500000) });
  } catch (error) {
    return res.status(502).json({ error: error?.message || 'News could not be loaded.' });
  }
});

app.get('/api/weather', async (_req, res) => {
  const url = 'https://forecast.weather.gov/MapClick.php?lat=41.8795&lon=-72.9802&unit=0&lg=english&FcstType=text&TextType=1';
  try {
    const text = await fetchReadableText(url);
    return res.json({ text: text.slice(0, 500000) });
  } catch (error) {
    return res.status(502).json({ error: error?.message || 'Weather could not be loaded.' });
  }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Mark, Set, Go! is running at http://localhost:${PORT}`));
