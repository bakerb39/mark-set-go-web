(() => {
  'use strict';

  const STORAGE_KEY = 'markSetGoTopicFeedsV1';
  const app = document.getElementById('app');
  let state = loadState();
  let activeTopicId = state.topics[0]?.id || null;
  let activeTab = 'recommended';
  let loading = false;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"topics":[]}');
      if (parsed && Array.isArray(parsed.topics)) return parsed;
    } catch {}
    return { topics: [] };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function closeMenus() {
    document.querySelectorAll('.site-header details[open]').forEach((menu) => menu.removeAttribute('open'));
  }

  function currentTopic() {
    return state.topics.find((item) => item.id === activeTopicId) || null;
  }

  function cleanUrl(value) {
    let url = String(value || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { return new URL(url).href; } catch { return ''; }
  }

  function textTokens(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3);
  }

  function titleSimilarity(a, b) {
    const left = new Set(textTokens(a));
    const right = new Set(textTokens(b));
    if (!left.size || !right.size) return 0;
    let overlap = 0;
    left.forEach((word) => { if (right.has(word)) overlap += 1; });
    return overlap / Math.min(left.size, right.size);
  }

  function articleScore(article, topic) {
    const body = `${article.title} ${article.summary}`.toLowerCase();
    const topicTerms = textTokens(topic.name);
    const preferenceTerms = textTokens(topic.preferences);
    let score = 0;

    topicTerms.forEach((term) => { if (body.includes(term)) score += 8; });
    preferenceTerms.forEach((term) => { if (body.includes(term)) score += 3; });

    const published = new Date(article.published || 0).getTime();
    if (Number.isFinite(published) && published > 0) {
      const ageHours = Math.max(0, (Date.now() - published) / 3600000);
      score += Math.max(0, 14 - (ageHours / 8));
    }

    score += Math.max(0, 8 - (Number(article.sourceRank) || 0));
    return score;
  }

  function curate(topic) {
    const ranked = [...(topic.articles || [])]
      .map((article) => ({ ...article, score: articleScore(article, topic) }))
      .sort((a, b) => b.score - a.score);

    const recommended = [];
    for (const article of ranked) {
      if (recommended.some((picked) => titleSimilarity(picked.title, article.title) >= 0.66)) continue;
      recommended.push(article);
      if (recommended.length >= (Number(topic.maxRecommended) || 8)) break;
    }
    const recommendedIds = new Set(recommended.map((article) => article.id));
    topic.articles = ranked.map((article) => ({
      ...article,
      recommended: recommendedIds.has(article.id)
    }));
  }

  function refreshIsDue(topic) {
    if (!topic.lastRefresh) return true;
    const elapsed = Date.now() - new Date(topic.lastRefresh).getTime();
    return elapsed >= (topic.cadence === 'weekly' ? 6.5 * 86400000 : 20 * 3600000);
  }

  async function refreshTopic() {
    const topic = currentTopic();
    if (!topic || loading || !topic.sources.length) return;
    loading = true;
    render();

    try {
      const response = await fetch('/api/topic-feeds/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.name,
          sources: topic.sources
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to refresh topic feeds.');

      const existingRead = new Set((topic.articles || []).filter((article) => article.read).map((article) => article.url));
      topic.articles = (payload.articles || []).map((article) => ({
        ...article,
        read: existingRead.has(article.url)
      }));
      topic.lastErrors = payload.errors || [];
      topic.lastRefresh = new Date().toISOString();
      curate(topic);
      saveState();
    } catch (error) {
      topic.lastErrors = [error.message];
    } finally {
      loading = false;
      render();
    }
  }

  async function openArticle(article) {
    const status = document.getElementById('topic-feed-status');
    if (status) {
      status.className = 'status';
      status.textContent = 'Extracting article text…';
    }

    try {
      const response = await fetch('/api/fetch-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: article.url })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The article could not be imported.');
      if (!window.MarkSetGoReadAnything?.openDocument) throw new Error('The Reader importer is not ready.');

      const topic = currentTopic();
      article.read = true;
      saveState();

      window.MarkSetGoReadAnything.openDocument({
        title: payload.title || article.title,
        author: payload.author || article.author || article.sourceName,
        text: payload.text,
        source: {
          type: 'topic-feed',
          url: article.url,
          topic: topic?.name || '',
          feedSource: article.sourceName,
          importedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      if (status) {
        status.className = 'status error';
        status.textContent = error.message;
      }
    }
  }

  function starterCryptoTopic() {
    const topic = {
      id: uid(),
      name: 'Cryptocurrency',
      cadence: 'daily',
      maxRecommended: 8,
      preferences: 'market-moving news, regulation, institutional adoption, security incidents, substantive analysis',
      sources: [
        { id: uid(), name: 'CoinDesk', type: 'website', url: 'https://www.coindesk.com/' },
        { id: uid(), name: 'Bitcoin Magazine', type: 'website', url: 'https://bitcoinmagazine.com/' },
        { id: uid(), name: 'SEC', type: 'website', url: 'https://www.sec.gov/' }
      ],
      articles: [],
      lastRefresh: null,
      lastErrors: []
    };
    state.topics.push(topic);
    activeTopicId = topic.id;
    saveState();
    render();
    refreshTopic();
  }

  function articleCard(article) {
    const published = article.published ? new Date(article.published) : null;
    const dateLabel = published && !Number.isNaN(published.getTime())
      ? published.toLocaleString()
      : '';
    return `
      <article class="topic-feed-article ${article.read ? 'is-read' : ''}">
        <div class="topic-feed-article-main">
          <div class="topic-feed-kicker">
            <span>${escapeHtml(article.sourceName)}</span>
            ${article.recommended ? '<span class="topic-feed-pick">Recommended</span>' : ''}
            ${article.read ? '<span class="topic-feed-read-state">Read</span>' : ''}
          </div>
          <h3>${escapeHtml(article.title)}</h3>
          <p>${escapeHtml(article.summary || 'No summary was supplied by this feed.')}</p>
          <small>${escapeHtml(dateLabel)}${article.author ? ` · ${escapeHtml(article.author)}` : ''}</small>
          ${article.recommended ? '<div class="topic-feed-why"><strong>Why it surfaced:</strong> recent, relevant to this topic/preferences, and selected to reduce duplicate coverage.</div>' : ''}
        </div>
        <div class="topic-feed-article-actions">
          <button class="primary" data-topic-read="${escapeHtml(article.id)}" type="button">Read in Reader</button>
          <a class="secondary button-link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener">Original</a>
        </div>
      </article>`;
  }

  function render() {
    if (!app) return;
    closeMenus();
    const topic = currentTopic();

    if (!topic) {
      app.innerHTML = `
        <section class="panel topic-feeds-page">
          <header class="topic-feeds-hero">
            <div>
              <span class="source-category">Personal Reading Feeds · Beta</span>
              <h1>Topic Feeds</h1>
              <p>Choose a topic and the sources you trust. Mark, Set, Go! builds a recommended reading edition while keeping every article available.</p>
            </div>
          </header>
          <div class="topic-feeds-empty">
            <h2>Build your first reading feed</h2>
            <p>Add normal website URLs or direct RSS/Atom feeds. You can always switch between Recommended and All Articles.</p>
            <div class="source-actions">
              <button class="primary" id="topic-new" type="button">+ New Topic</button>
              <button class="secondary" id="topic-crypto-starter" type="button">Start with Cryptocurrency</button>
            </div>
          </div>
          <div id="topic-feed-status" class="status" aria-live="polite"></div>
        </section>`;
      bindMain();
      return;
    }

    const all = topic.articles || [];
    const visible = activeTab === 'all' ? all : all.filter((article) => article.recommended);
    const recommendedCount = all.filter((article) => article.recommended).length;

    app.innerHTML = `
      <section class="panel topic-feeds-page">
        <header class="topic-feeds-hero">
          <div>
            <span class="source-category">Personal Reading Feeds · Beta</span>
            <h1>${escapeHtml(topic.name)}</h1>
            <p>${topic.cadence === 'weekly' ? 'Weekly' : 'Daily'} edition · ${topic.sources.length} source${topic.sources.length === 1 ? '' : 's'} · ${all.length} article${all.length === 1 ? '' : 's'}</p>
          </div>
          <div class="topic-feeds-hero-actions">
            <button class="secondary" id="topic-manage" type="button">Manage</button>
            <button class="primary" id="topic-refresh" type="button" ${loading ? 'disabled' : ''}>${loading ? 'Refreshing…' : 'Refresh now'}</button>
          </div>
        </header>

        <div class="topic-feeds-layout">
          <aside class="topic-feeds-sidebar">
            <div class="topic-feed-sidebar-head">
              <strong>Your topics</strong>
              <button id="topic-new" type="button" aria-label="New topic">+</button>
            </div>
            ${state.topics.map((item) => `
              <button class="topic-feed-topic ${item.id === topic.id ? 'active' : ''}" data-topic-id="${escapeHtml(item.id)}" type="button">
                <strong>${escapeHtml(item.name)}</strong>
                <small>${(item.articles || []).filter((article) => article.recommended).length} recommended · ${(item.articles || []).length} all</small>
              </button>`).join('')}
          </aside>

          <div class="topic-feeds-content">
            <div class="topic-feed-toolbar">
              <div class="topic-feed-tabs">
                <button class="${activeTab === 'recommended' ? 'active' : ''}" data-topic-tab="recommended" type="button">Recommended (${recommendedCount})</button>
                <button class="${activeTab === 'all' ? 'active' : ''}" data-topic-tab="all" type="button">All Articles (${all.length})</button>
              </div>
              <span>${topic.lastRefresh ? `Updated ${escapeHtml(new Date(topic.lastRefresh).toLocaleString())}` : 'Not refreshed yet'}</span>
            </div>

            ${visible.length ? `<div class="topic-feed-list">${visible.map(articleCard).join('')}</div>` : `
              <div class="topic-feeds-empty compact">
                <h2>${loading ? 'Gathering articles…' : 'No articles yet'}</h2>
                <p>${loading ? 'Checking your sources and assembling this edition.' : 'Refresh this topic to build its first edition.'}</p>
              </div>`}

            <div id="topic-feed-status" class="status ${topic.lastErrors?.length ? 'error' : ''}" aria-live="polite">
              ${topic.lastErrors?.length ? escapeHtml(`${topic.lastErrors.length} source(s) could not be loaded. Successful sources were kept.`) : ''}
            </div>
          </div>
        </div>
      </section>`;

    bindMain();

    if (!loading && topic.sources.length && refreshIsDue(topic) && !all.length) {
      refreshTopic();
    }
  }

  function sourceRow(source = { id: uid(), name: '', type: 'website', url: '' }) {
    return `
      <div class="topic-feed-source-row" data-source-id="${escapeHtml(source.id)}">
        <input class="topic-source-name" value="${escapeHtml(source.name)}" placeholder="Source name" required>
        <select class="topic-source-type">
          <option value="website" ${source.type === 'website' ? 'selected' : ''}>Website URL</option>
          <option value="rss" ${source.type === 'rss' ? 'selected' : ''}>RSS / Atom</option>
        </select>
        <input class="topic-source-url" type="url" value="${escapeHtml(source.url)}" placeholder="https://…" required>
        <button class="secondary topic-source-remove" type="button">Remove</button>
      </div>`;
  }

  function showManager() {
    const topic = currentTopic();
    app.innerHTML = `
      <section class="panel topic-feeds-page">
        <header class="topic-feeds-hero">
          <div>
            <span class="source-category">Topic Setup</span>
            <h1>${topic ? 'Edit Topic' : 'New Topic'}</h1>
            <p>Direct RSS/Atom URLs are read as feeds. A normal website URL is converted into a topic-filtered Google News feed for that domain.</p>
          </div>
        </header>

        <form id="topic-feed-form" class="topic-feed-form">
          <label>Topic name
            <input id="topic-name" required value="${escapeHtml(topic?.name || '')}" placeholder="Cryptocurrency">
          </label>

          <div class="topic-feed-form-row">
            <label>Edition
              <select id="topic-cadence">
                <option value="daily" ${topic?.cadence !== 'weekly' ? 'selected' : ''}>Every day</option>
                <option value="weekly" ${topic?.cadence === 'weekly' ? 'selected' : ''}>Every week</option>
              </select>
            </label>
            <label>Recommended articles
              <input id="topic-max" type="number" min="1" max="25" value="${Number(topic?.maxRecommended) || 8}">
            </label>
          </div>

          <label>What should be prioritized?
            <textarea id="topic-preferences" rows="3" placeholder="market-moving news, regulation, security incidents, substantive analysis">${escapeHtml(topic?.preferences || '')}</textarea>
          </label>

          <section class="topic-feed-source-editor">
            <div class="topic-feed-sidebar-head">
              <strong>Sources</strong>
              <button id="topic-add-source" type="button">+ Add source</button>
            </div>
            <div id="topic-source-rows">${(topic?.sources || []).map(sourceRow).join('')}</div>
          </section>

          <div class="source-actions">
            <button class="primary" type="submit">Save Topic</button>
            <button class="secondary" id="topic-cancel" type="button">Cancel</button>
            ${topic ? '<button class="danger" id="topic-delete" type="button">Delete Topic</button>' : ''}
          </div>
          <div id="topic-feed-status" class="status" aria-live="polite"></div>
        </form>
      </section>`;
    bindManager(topic);
  }

  function bindManager(existing) {
    document.getElementById('topic-cancel')?.addEventListener('click', render);
    document.getElementById('topic-add-source')?.addEventListener('click', () => {
      document.getElementById('topic-source-rows')?.insertAdjacentHTML('beforeend', sourceRow());
    });
    document.getElementById('topic-source-rows')?.addEventListener('click', (event) => {
      event.target.closest('.topic-source-remove')?.closest('.topic-feed-source-row')?.remove();
    });
    document.getElementById('topic-delete')?.addEventListener('click', () => {
      state.topics = state.topics.filter((item) => item.id !== existing.id);
      activeTopicId = state.topics[0]?.id || null;
      saveState();
      render();
    });
    document.getElementById('topic-feed-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const sources = [...document.querySelectorAll('.topic-feed-source-row')].map((row) => ({
        id: row.dataset.sourceId || uid(),
        name: row.querySelector('.topic-source-name').value.trim(),
        type: row.querySelector('.topic-source-type').value,
        url: cleanUrl(row.querySelector('.topic-source-url').value)
      })).filter((source) => source.name && source.url);

      const record = existing || { id: uid(), articles: [], lastRefresh: null, lastErrors: [] };
      Object.assign(record, {
        name: document.getElementById('topic-name').value.trim(),
        cadence: document.getElementById('topic-cadence').value,
        maxRecommended: Number(document.getElementById('topic-max').value) || 8,
        preferences: document.getElementById('topic-preferences').value.trim(),
        sources
      });
      if (!existing) state.topics.push(record);
      activeTopicId = record.id;
      saveState();
      render();
      refreshTopic();
    });
  }

  function bindMain() {
    document.getElementById('topic-new')?.addEventListener('click', () => {
      activeTopicId = null;
      showManager();
    });
    document.getElementById('topic-crypto-starter')?.addEventListener('click', starterCryptoTopic);
    document.getElementById('topic-manage')?.addEventListener('click', showManager);
    document.getElementById('topic-refresh')?.addEventListener('click', refreshTopic);

    document.querySelectorAll('[data-topic-id]').forEach((button) => {
      button.addEventListener('click', () => {
        activeTopicId = button.dataset.topicId;
        activeTab = 'recommended';
        render();
      });
    });

    document.querySelectorAll('[data-topic-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        activeTab = button.dataset.topicTab;
        render();
      });
    });

    document.querySelectorAll('[data-topic-read]').forEach((button) => {
      button.addEventListener('click', () => {
        const article = currentTopic()?.articles?.find((item) => item.id === button.dataset.topicRead);
        if (article) openArticle(article);
      });
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest?.('[data-action="topic-feeds"]');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    render();
  }, true);

  window.MarkSetGoTopicFeeds = Object.freeze({
    render,
    refresh: refreshTopic
  });
})();