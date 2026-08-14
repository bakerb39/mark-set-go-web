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
  const sources = Array.isArray(req.body?.sources) ? req.body.sources.slice(0, 30) : [];
  if (!topic) return res.status(400).json({ error: 'A topic is required.' });
  if (!sources.length) return res.status(400).json({ error: 'Add at least one source.' });

  const results = await Promise.all(sources.map(async (rawSource, sourceOrder) => {
    const id = cleanText(rawSource?.id, 200) || `source-${sourceOrder + 1}`;
    const name = cleanText(rawSource?.name, 200) || `Source ${sourceOrder + 1}`;
    const type = rawSource?.type === 'rss' ? 'rss' : 'website';
    const rawUrl = cleanText(rawSource?.url, 2000);
    try {
      if (!rawUrl) throw new Error('Source URL is required.');
      const parsed = await validatePublicUrl(rawUrl);
      const feedUrl = type === 'rss'
        ? parsed.href
        : topicFeedGoogleNewsUrl(topic, parsed.hostname);

      if (type === 'rss') await validatePublicUrl(feedUrl);

      const items = await fetchFeedItems({ feedUrl });
      return {
        id,
        name,
        ok: true,
        articles: items.slice(0, 20).map((item, index) => ({
          id: crypto.createHash('sha1').update(`${id}|${item.link}|${item.title}`).digest('hex'),
          sourceId: id,
          sourceName: name,
          sourceRank: index,
          title: item.title,
          url: item.link,
          summary: item.summary,
          published: item.published || ''
        }))
      };
    } catch (error) {
      return { id, name, ok: false, error: error.message || 'Source could not be loaded.', articles: [] };
    }
  }));

  const seenUrls = new Set();
  const articles = [];
  for (const result of results) {
    for (const article of result.articles) {
      const key = String(article.url || '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
      if (!key || seenUrls.has(key)) continue;
      seenUrls.add(key);
      articles.push(article);
    }
  }

  articles.sort((a, b) => {
    const left = new Date(a.published || 0).getTime() || 0;
    const right = new Date(b.published || 0).getTime() || 0;
    return right - left;
  });

  res.json({
    topic,
    articles: articles.slice(0, 300),
    errors: results.filter((result) => !result.ok).map((result) => ({
      sourceId: result.id,
      sourceName: result.name,
      error: result.error
    }))
  });
});
