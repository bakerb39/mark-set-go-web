(() => {
  'use strict';

  const STORAGE_KEY = 'markSetGoTopicFeedsV1';
  const app = document.getElementById('app');
  const defaultTimezone = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'; }
    catch { return 'America/New_York'; }
  })();

  let state = loadState();
  let activeTopicId = state.topics[0]?.id || null;
  let activeSourceId = '';
  let activeTab = 'recommended';
  let loading = false;
  let preparing = false;
  let cloudAuthenticated = false;
  let cloudHydrating = false;
  let cloudSaveTimer = 0;
  let recommendationTimer = 0;
  let dailyAutoOpenAttempted = false;
  let navFrame = 0;

  // New/Edit Topic is a transactional screen. Background cloud hydration,
  // authentication refreshes, and in-flight feed refreshes must never replace
  // it while the reader is typing.
  let topicManagerOpen = false;
  let deferredCloudState = null;

  function topicManagerIsOpen() {
    return Boolean(
      topicManagerOpen &&
      document.getElementById('topic-feed-form')
    );
  }

  function applyDeferredCloudState() {
    if (!deferredCloudState) return false;

    state = deferredCloudState;
    deferredCloudState = null;

    if (!state.preferences.timezone) state.preferences.timezone = defaultTimezone;
    if (!state.topics.some((topic) => topic.id === activeTopicId)) {
      activeTopicId = state.topics[0]?.id || null;
      activeSourceId = '';
    }

    saveLocalState();
    return true;
  }

  function leaveTopicManager({ applyDeferred = false } = {}) {
    topicManagerOpen = false;
    clearTimeout(recommendationTimer);

    if (applyDeferred) applyDeferredCloudState();
    else deferredCloudState = null;
  }

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

  function repairTopicFeedSourceIds(topics) {
    return (Array.isArray(topics) ? topics : []).map((topic) => {
      const sources = Array.isArray(topic?.sources) ? topic.sources : [];
      const articles = (Array.isArray(topic?.articles) ? topic.articles : []).map((article) => {
        if (article?.sourceClientId) return article;
        const source = sources.find((candidate) => {
          const sourceUrl = String(candidate?.url || '').trim().replace(/\/+$/, '').toLowerCase();
          const articleUrl = String(article?.sourceUrl || '').trim().replace(/\/+$/, '').toLowerCase();
          const sourceName = String(candidate?.name || '').trim().toLowerCase();
          const articleName = String(article?.sourceName || '').trim().toLowerCase();
          return Boolean(
            (sourceUrl && articleUrl && sourceUrl === articleUrl) ||
            (sourceName && articleName && sourceName === articleName)
          );
        });
        return source?.id ? { ...article, sourceClientId: source.id } : article;
      });
      return { ...topic, sources, articles };
    });
  }

  function normalizeState(value) {
    const topics = repairTopicFeedSourceIds(Array.isArray(value?.topics) ? value.topics : []);
    return {
      topics,
      preferences: {
        timezone: String(value?.preferences?.timezone || defaultTimezone),
        morningHour: Math.max(0, Math.min(23, Number(value?.preferences?.morningHour ?? 5) || 5)),
        dailyOpenSourceId: String(value?.preferences?.dailyOpenSourceId || '')
      }
    };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"topics":[]}');
      if (parsed && Array.isArray(parsed.topics)) return normalizeState(parsed);
    } catch {}
    return normalizeState({ topics: [] });
  }

  function compactStateForStorage(value) {
    return {
      preferences: normalizeState(value).preferences,
      topics: (Array.isArray(value?.topics) ? value.topics : []).map((topic) => ({
        ...topic,
        sources: (Array.isArray(topic?.sources) ? topic.sources : []).slice(0, 30),
        articles: (Array.isArray(topic?.articles) ? topic.articles : [])
          .slice(0, 180)
          .map((article) => ({
            id: article.id,
            cloudId: article.cloudId || '',
            title: String(article.title || '').slice(0, 500),
            url: String(article.url || '').slice(0, 4000),
            summary: String(article.summary || '').slice(0, 1600),
            published: article.published || '',
            author: article.author || '',
            sourceName: article.sourceName || '',
            sourceUrl: article.sourceUrl || '',
            sourceType: article.sourceType || '',
            sourceClientId: article.sourceClientId || '',
            sourceRank: Number(article.sourceRank) || 0,
            feedMode: article.feedMode || '',
            recommended: Boolean(article.recommended),
            prepared: Boolean(article.prepared),
            read: Boolean(article.read)
          }))
      }))
    };
  }

  function saveLocalState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compactStateForStorage(state)));
      return true;
    } catch (error) {
      console.warn('Topic Feed local cache could not be saved.', error);
      return false;
    }
  }

  function cloudPayload() {
    return {
      topics: state.topics,
      preferences: state.preferences
    };
  }

  async function syncCloudNow() {
    if (!cloudAuthenticated) return false;
    try {
      const response = await fetch('/api/topic-feeds/state', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cloudPayload())
      });
      if (response.status === 401 || response.status === 503) {
        cloudAuthenticated = false;
        return false;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to sync Topic Feeds.');
      return true;
    } catch (error) {
      console.warn('Topic Feed cloud sync was deferred.', error);
      return false;
    }
  }

  function scheduleCloudSave() {
    if (!cloudAuthenticated) return;
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = window.setTimeout(() => { void syncCloudNow(); }, 450);
  }

  function saveState({ cloud = true } = {}) {
    saveLocalState();
    if (cloud) scheduleCloudSave();
    scheduleReaderNavigation();
  }

  async function hydrateCloudState() {
    if (cloudHydrating) return false;
    cloudHydrating = true;
    try {
      const response = await fetch('/api/topic-feeds/state', { credentials: 'same-origin' });
      if (response.status === 401 || response.status === 503 || response.status === 409) {
        cloudAuthenticated = false;
        return false;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load Topic Feeds.');

      cloudAuthenticated = true;
      let remote = normalizeState(payload);
      if (!remote.topics.length && state.topics.length) {
        const importResponse = await fetch('/api/topic-feeds/import', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cloudPayload())
        });
        const imported = await importResponse.json().catch(() => ({}));
        if (importResponse.ok) remote = normalizeState(imported);
      }

      if (topicManagerIsOpen()) {
        // Do not throw away unsaved form edits. Hold the newest cloud snapshot
        // until the editor is explicitly cancelled. If the reader saves, their
        // local form values intentionally win and are synced back to cloud.
        deferredCloudState = remote;
        return true;
      }

      state = remote;
      if (!state.preferences.timezone) state.preferences.timezone = defaultTimezone;
      if (!state.topics.some((topic) => topic.id === activeTopicId)) {
        activeTopicId = state.topics[0]?.id || null;
        activeSourceId = '';
      }
      saveLocalState();
      if (document.querySelector('.topic-feeds-page')) render();
      scheduleReaderNavigation();
      void maybeAutoOpenDailyArticle();
      return true;
    } catch (error) {
      console.warn('Topic Feed cloud hydration failed; using the local cache.', error);
      return false;
    } finally {
      cloudHydrating = false;
    }
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
    return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 3);
  }

  function titleSimilarity(a, b) {
    const left = new Set(textTokens(a)), right = new Set(textTokens(b));
    if (!left.size || !right.size) return 0;
    let overlap = 0;
    left.forEach((word) => { if (right.has(word)) overlap += 1; });
    return overlap / Math.min(left.size, right.size);
  }

  function articleScore(article, topic) {
    const body = `${article.title} ${article.summary}`.toLowerCase();
    const topicTerms = textTokens(topic.name);
    const preferenceTerms = textTokens(topic.preferences);
    let score = Math.max(0, 8 - (Number(article.sourceRank) || 0));
    topicTerms.forEach((term) => { if (body.includes(term)) score += 8; });
    preferenceTerms.forEach((term) => { if (body.includes(term)) score += 3; });
    const published = new Date(article.published || 0).getTime();
    if (Number.isFinite(published) && published > 0) {
      const ageHours = Math.max(0, (Date.now() - published) / 3600000);
      score += Math.max(0, 14 - ageHours / 8);
    }
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
    const ids = new Set(recommended.map((article) => article.id));
    topic.articles = ranked.map((article) => ({ ...article, recommended: ids.has(article.id) }));
  }

  function refreshIsDue(topic) {
    if (!topic.lastRefresh) return true;
    const elapsed = Date.now() - new Date(topic.lastRefresh).getTime();
    return elapsed >= (topic.cadence === 'weekly' ? 6.5 * 86400000 : 20 * 3600000);
  }

  async function prefetchArticles(articles, { wait = true } = {}) {
    const list = Array.isArray(articles) ? articles.filter((article) => article?.url).slice(0, 60) : [];
    if (!list.length) return { prepared: 0, failed: 0 };
    const request = fetch('/api/topic-feeds/prefetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles: list })
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Article preparation failed.');
      return payload;
    });
    if (!wait) { request.catch(() => {}); return null; }
    return request;
  }

  async function refreshTopic() {
    const topic = currentTopic();
    if (!topic || loading || !topic.sources.length) return;
    loading = true;
    render();
    try {
      if (cloudAuthenticated) {
        preparing = true;
        render();
        const response = await fetch('/api/topic-feeds/refresh', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topicId: topic.id })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Unable to refresh topic feeds.');
        const index = state.topics.findIndex((item) => item.id === topic.id);
        if (index >= 0 && payload.topic) state.topics[index] = payload.topic;
        saveState({ cloud: false });
      } else {
        const response = await fetch('/api/topic-feeds/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: topic.name, sources: topic.sources })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Unable to refresh topic feeds.');
        const existingRead = new Set((topic.articles || []).filter((article) => article.read).map((article) => article.url));
        topic.articles = (payload.articles || []).map((article) => ({ ...article, read: existingRead.has(article.url) }));
        topic.lastErrors = payload.sources?.filter?.((source) => !source.ok).map((source) => source.error) || [];
        topic.lastRefresh = new Date().toISOString();
        curate(topic);
        saveState();
        preparing = true;
        render();
        const selected = [...topic.articles].sort((a,b) => Number(b.recommended)-Number(a.recommended)).slice(0,60);
        await prefetchArticles(selected, { wait: true }).catch(() => null);
        topic.preparedAt = new Date().toISOString();
        saveState();
      }
    } catch (error) {
      const live = currentTopic();
      if (live) live.lastErrors = [error.message];
    } finally {
      preparing = false;
      loading = false;
      render();
    }
  }

  function decorateTopicFeedArticleFooter() {
    if (!isTopicFeedReaderActive()) return;

    const reader = document.querySelector('#reader');
    if (!reader) return;

    reader.querySelectorAll(
      '.topic-feed-article-footer, .topic-feed-article-footer-source, .topic-feed-article-footer-url'
    ).forEach((node) => {
      node.classList.remove(
        'topic-feed-article-footer',
        'topic-feed-article-footer-source',
        'topic-feed-article-footer-url'
      );
    });
    reader.querySelectorAll('.topic-feed-article-footer-break').forEach((node) => {
      node.classList.remove('topic-feed-article-footer-break');
    });

    const words = Array.from(reader.querySelectorAll('.reader-word[data-index]'));
    if (!words.length) return;

    // Publisher imports often end with:
    //   Source: TechCrunch
    //   https://...
    // Find only a Source marker near the end so ordinary uses of the word
    // "source" inside an article are never restyled.
    const tail = words.slice(Math.max(0, words.length - 80));
    let sourceWord = null;
    for (let index = tail.length - 1; index >= 0; index -= 1) {
      const text = String(tail[index].textContent || '').trim();
      if (/^source:?$/i.test(text)) {
        sourceWord = tail[index];
        break;
      }
    }
    if (!sourceWord) return;

    const sourceIndex = Number(sourceWord.dataset.index);
    if (!Number.isFinite(sourceIndex)) return;

    const sourceGroup = sourceWord.closest('.reader-group[data-start-index]');
    if (!sourceGroup) return;

    const previous = sourceGroup.previousElementSibling;
    if (previous?.classList.contains('reader-paragraph-break')) {
      previous.classList.add('topic-feed-article-footer-break');
    }

    const groups = Array.from(reader.querySelectorAll('.reader-group[data-start-index]'));
    groups.forEach((group) => {
      const start = Number(group.dataset.startIndex);
      const end = Number(group.dataset.endIndex);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= sourceIndex) return;

      group.classList.add('topic-feed-article-footer');
      if (start <= sourceIndex && end > sourceIndex) {
        group.classList.add('topic-feed-article-footer-source');
      }
    });

    words.forEach((word) => {
      const index = Number(word.dataset.index);
      if (!Number.isFinite(index) || index < sourceIndex) return;
      const text = String(word.textContent || '').trim();
      if (/^https?:\/\//i.test(text)) {
        word.classList.add('topic-feed-article-footer-url');
      }
    });
  }

  let topicFeedStoryHeaderObserver = null;
  let topicFeedStoryHeaderReader = null;
  let topicFeedStoryHeaderReflowTimer = 0;

  function topicFeedStoryHeaderParts(reader = document.querySelector('#reader')) {
    if (!reader) return {};

    // Clean up the previous nested-overlay implementation if this script is
    // hot-reloaded in a browser session. Preserve the existing action-row node.
    const legacyOverlay = reader.querySelector(':scope > [data-topic-feed-story-header]');
    if (legacyOverlay) {
      const legacyAction = legacyOverlay.querySelector('#read-anything-article-summary-action');
      if (legacyAction) reader.prepend(legacyAction);
      legacyOverlay.remove();
    }

    let spacer = reader.querySelector(':scope > [data-topic-feed-story-header-spacer]');
    if (!spacer) {
      spacer = document.createElement('div');
      spacer.className = 'topic-feed-story-header-spacer';
      spacer.dataset.topicFeedStoryHeaderSpacer = '1';
      spacer.setAttribute('aria-hidden', 'true');
      reader.prepend(spacer);
    }

    let meta = reader.querySelector(':scope > [data-topic-feed-story-meta-overlay]');
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'topic-feed-story-meta-overlay';
      meta.dataset.topicFeedStoryMetaOverlay = '1';
      reader.appendChild(meta);
    }

    reader.classList.add('topic-feed-story-header-managed');

    return {
      spacer,
      meta,
      actionRow: document.querySelector('#read-anything-article-summary-action')
    };
  }

  function scheduleTopicFeedStoryBookReflow() {
    window.clearTimeout(topicFeedStoryHeaderReflowTimer);
    topicFeedStoryHeaderReflowTimer = window.setTimeout(() => {
      const reader = document.querySelector('#reader');
      if (!reader?.classList.contains('book-pages-layout')) return;

      // Use the Reader's own resize/reflow path after the reserved first-page
      // header height changes.
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    }, 70);
  }

  function positionTopicFeedStoryHeader() {
    if (!isTopicFeedReaderActive()) return;

    const reader = document.querySelector('#reader');
    if (!reader) return;

    const { spacer, meta } = topicFeedStoryHeaderParts(reader);
    const actionRow = document.querySelector('#read-anything-article-summary-action');
    if (!spacer || !meta) return;

    const styles = getComputedStyle(reader);
    const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
    const columnGap = Number.parseFloat(styles.columnGap) || 0;
    const fontSize = Number.parseFloat(styles.fontSize) || 14;
    const usableWidth = Math.max(1, reader.clientWidth - paddingLeft - paddingRight);

    const headerWidth = reader.classList.contains('book-pages-layout')
      ? Math.max(1, (usableWidth - columnGap) / 2)
      : usableWidth;

    meta.style.left = `${paddingLeft}px`;
    meta.style.top = `${paddingTop}px`;
    meta.style.width = `${headerWidth}px`;

    if (actionRow) {
      // Read Anything deliberately requires this node to remain a direct child
      // of #reader. Leave it there and change only its visual placement.
      actionRow.style.setProperty('position', 'absolute', 'important');
      actionRow.style.setProperty('left', `${paddingLeft}px`, 'important');
      actionRow.style.setProperty('width', `${headerWidth}px`, 'important');
      actionRow.style.setProperty('box-sizing', 'border-box', 'important');
      actionRow.style.setProperty('margin', '0', 'important');
      actionRow.style.setProperty('padding', '0', 'important');
      actionRow.style.setProperty('break-inside', 'auto', 'important');
      actionRow.style.setProperty('page-break-inside', 'auto', 'important');
      actionRow.style.setProperty('z-index', '8', 'important');
    }

    window.requestAnimationFrame(() => {
      if (!reader.isConnected || !meta.isConnected) return;

      const metaHeight = Math.ceil(meta.getBoundingClientRect().height || 0);
      const actionGap = Math.max(5, Math.round(fontSize * 0.35));

      if (actionRow?.isConnected) {
        actionRow.style.setProperty(
          'top',
          `${paddingTop + metaHeight + actionGap}px`,
          'important'
        );
      }

      window.requestAnimationFrame(() => {
        if (!reader.isConnected || !spacer.isConnected) return;

        const actionHeight = actionRow?.isConnected
          ? Math.ceil(actionRow.getBoundingClientRect().height || 0)
          : 0;

        // Source/share + small gap + actions + exactly one body-text line.
        const requiredHeight = Math.max(
          fontSize * 2,
          metaHeight + actionGap + actionHeight + fontSize
        );
        const previousHeight = Number.parseFloat(spacer.style.height) || 0;

        spacer.style.width = '100%';
        spacer.style.maxWidth = `${headerWidth}px`;

        if (Math.abs(requiredHeight - previousHeight) > 1) {
          spacer.style.height = `${Math.ceil(requiredHeight)}px`;
          scheduleTopicFeedStoryBookReflow();
        }
      });
    });
  }

  function keepTopicFeedArticleActionsInHeader() {
    if (!isTopicFeedReaderActive()) return;

    const reader = document.querySelector('#reader');
    const actionRow = document.querySelector('#read-anything-article-summary-action');
    if (!reader || !actionRow) {
      positionTopicFeedStoryHeader();
      return;
    }

    // Read Anything may re-prepend the row. That is expected and no longer a
    // conflict: direct-child ownership is preserved, while CSS positioning puts
    // it beneath the source/share divider.
    if (actionRow.parentElement !== reader) {
      reader.prepend(actionRow);
    }

    positionTopicFeedStoryHeader();
  }

  function observeTopicFeedStoryHeader() {
    const reader = document.querySelector('#reader');
    if (!reader || reader === topicFeedStoryHeaderReader) return;

    topicFeedStoryHeaderObserver?.disconnect?.();
    topicFeedStoryHeaderReader = reader;

    topicFeedStoryHeaderObserver = new MutationObserver(() => {
      if (!isTopicFeedReaderActive()) return;
      window.requestAnimationFrame(() => {
        keepTopicFeedArticleActionsInHeader();
      });
    });

    topicFeedStoryHeaderObserver.observe(reader, { childList: true });
  }

  function topicFeedSourceCredit(topic, article, payload) {
    const sourceName = String(article?.sourceName || 'Topic Feed').trim();
    const originalUrl = String(payload?.sourceUrl || article?.url || '').trim();
    const rawDate = article?.published || article?.publishedAt || '';
    let dateLabel = '';

    if (rawDate) {
      const published = new Date(rawDate);
      if (!Number.isNaN(published.getTime())) {
        dateLabel = published.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      }
    }

    const apply = () => {
      const reader =
        document.querySelector('#reader') ||
        document.querySelector('.reader, .interactive-reader');
      if (!reader) return false;

      reader.querySelectorAll('[data-topic-feed-source-credit]').forEach((node) => node.remove());

      const credit = document.createElement('div');
      credit.className = 'topic-feed-reader-credit';
      credit.dataset.topicFeedSourceCredit = '1';
      credit.setAttribute('aria-label', `Source: ${sourceName}${dateLabel ? `, ${dateLabel}` : ''}`);

      const label = document.createElement('span');
      label.className = 'topic-feed-reader-credit-label';
      label.textContent = 'Source';

      const source = document.createElement('strong');
      source.textContent = sourceName;

      credit.append(label, source);

      if (dateLabel) {
        const separator = document.createElement('span');
        separator.className = 'topic-feed-reader-credit-separator';
        separator.setAttribute('aria-hidden', 'true');
        separator.textContent = '·';

        const date = document.createElement('span');
        date.textContent = dateLabel;

        credit.append(separator, date);
      }

      if (originalUrl) {
        const separator = document.createElement('span');
        separator.className = 'topic-feed-reader-credit-separator';
        separator.setAttribute('aria-hidden', 'true');
        separator.textContent = '·';

        const link = document.createElement('a');
        link.href = originalUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'View original ↗';

        credit.append(separator, link);
      }

      const shareUrl = originalUrl;
      const shareTitle = String(payload?.title || article?.title || document.title || 'Article').trim();

      if (shareUrl) {
        const share = document.createElement('div');
        share.className = 'topic-feed-reader-share';
        share.setAttribute('aria-label', 'Share this story');

        const encodedUrl = encodeURIComponent(shareUrl);
        const encodedTitle = encodeURIComponent(shareTitle);
        const encodedText = encodeURIComponent(`${shareTitle} — ${shareUrl}`);

        const shareItems = [
          {
            id: 'x',
            label: 'Share on X',
            href: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
            icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.24 2H21l-6.03 6.9L22.06 22h-5.55l-4.35-5.69L7.19 22H4.42l6.45-7.37L4.07 2h5.69l3.93 5.2L18.24 2Zm-.97 17.7h1.53L8.92 4.18H7.28L17.27 19.7Z"/></svg>`
          },
          {
            id: 'facebook',
            label: 'Share on Facebook',
            href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
            icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.7 22v-9h3l.45-3.5H13.7V7.26c0-1.01.28-1.7 1.74-1.7h1.86V2.43A24.8 24.8 0 0 0 14.59 2c-2.68 0-4.52 1.64-4.52 4.65V9.5H7v3.5h3.07v9h3.63Z"/></svg>`
          },
          {
            id: 'linkedin',
            label: 'Share on LinkedIn',
            href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
            icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.34 3.5A2.34 2.34 0 1 1 5.34 8.18a2.34 2.34 0 0 1 0-4.68ZM3.32 9.75h4.04V22H3.32V9.75Zm6.43 0h3.87v1.67h.05c.54-1.02 1.86-2.1 3.82-2.1 4.09 0 4.84 2.69 4.84 6.19V22h-4.03v-5.75c0-1.37-.03-3.13-1.91-3.13-1.91 0-2.2 1.49-2.2 3.03V22H9.75V9.75Z"/></svg>`
          },
          {
            id: 'reddit',
            label: 'Share on Reddit',
            href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
            icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.9 11.25a2.3 2.3 0 0 0-3.9-1.65 11.2 11.2 0 0 0-4.32-1.37l.73-3.42 2.39.51a1.76 1.76 0 1 0 .19-.91l-2.84-.6a.46.46 0 0 0-.55.35l-.86 4.02A11.3 11.3 0 0 0 7 9.62a2.3 2.3 0 1 0-2.53 3.73 4.17 4.17 0 0 0-.08.8c0 3.26 3.39 5.9 7.57 5.9s7.57-2.64 7.57-5.9c0-.28-.03-.55-.08-.82a2.3 2.3 0 0 0 1.45-2.08Zm-13.2 2.14a1.24 1.24 0 1 1 0-2.48 1.24 1.24 0 0 1 0 2.48Zm7.62 3.1c-.95.95-2.75 1.02-3.28 1.02-.54 0-2.35-.07-3.3-1.02a.48.48 0 0 1 .68-.68c.6.6 1.94.73 2.62.73.68 0 2.02-.13 2.61-.73a.48.48 0 1 1 .67.68Zm.98-3.1a1.24 1.24 0 1 1 0-2.48 1.24 1.24 0 0 1 0 2.48Z"/></svg>`
          },
          {
            id: 'email',
            label: 'Share by email',
            href: `mailto:?subject=${encodedTitle}&body=${encodedText}`,
            icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm9 7.1L20.2 7H3.8L12 12.1Zm0 2.2L3 8.72V17h18V8.72l-9 5.58Z"/></svg>`
          }
        ];

        share.innerHTML = shareItems.map((item) => `
          <a class="topic-feed-share-button topic-feed-share-${item.id}"
             href="${item.href}"
             ${item.id === 'email' ? '' : 'target="_blank" rel="noopener noreferrer"'}
             aria-label="${item.label}"
             title="${item.label}">
            ${item.icon}
          </a>
        `).join('');

        // Keep the share cluster visually at the top-right of the visible story
        // header, aligned with the source credit rather than inside article text.
        credit.appendChild(share);
      }

      const { meta } = topicFeedStoryHeaderParts(reader);
      if (!meta) return false;

      meta.replaceChildren(credit);

      // Read Anything keeps Summarize / Analyze as a direct child of #reader.
      // We preserve that contract and position it visually below this source row.
      keepTopicFeedArticleActionsInHeader();
      observeTopicFeedStoryHeader();
      positionTopicFeedStoryHeader();

      return true;
    };

    // The article action row may be installed just after openDocument(), so
    // retry long enough to place the credit beneath it rather than above it.
    [0, 40, 100, 220, 480, 900].forEach((delay) => {
      window.setTimeout(() => {
        if (apply()) {
          keepTopicFeedArticleActionsInHeader();
          positionTopicFeedStoryHeader();
          decorateTopicFeedArticleFooter();
        }
      }, delay);
    });
  }

  function openPreparedArticle(topic, article, payload) {
    if (!window.MarkSetGoReadAnything?.openDocument) throw new Error('The Reader importer is not ready.');
    window.MSGTopicFeedReaderContext = {
      topicId: topic?.id || '',
      topicName: topic?.name || '',
      sourceId: article.sourceClientId || '',
      sourceName: article.sourceName || '',
      articleId: article.id || '',
      updatedAt: new Date().toISOString()
    };
    window.MarkSetGoReadAnything.openDocument({
      title: payload.title || article.title,
      author: article.author || article.sourceName,
      text: payload.text,
      source: {
        type: 'topic-feed',
        url: payload.sourceUrl || article.url,
        topic: topic?.name || '',
        topicId: topic?.id || '',
        feedSource: article.sourceName || '',
        feedSourceId: article.sourceClientId || '',
        articleId: article.id || '',
        fullArticle: payload.fullArticle !== false,
        importWarning: payload.warning || '',
        documentToc: Array.isArray(payload.documentToc) ? payload.documentToc : [],
        importedAt: new Date().toISOString()
      }
    });
    topicFeedSourceCredit(topic, article, payload);
    scheduleReaderNavigation();
  }

  async function openArticle(article, trigger = null, topicOverride = null) {
    const topic = topicOverride || currentTopic() || state.topics.find((item) => (item.articles || []).some((candidate) => candidate.id === article.id));
    const status = document.getElementById('topic-feed-status');
    const originalLabel = trigger?.textContent || 'Read in Reader';
    if (trigger) { trigger.disabled = true; trigger.textContent = 'Opening…'; }
    if (status) { status.className = 'status'; status.textContent = article.prepared ? 'Opening downloaded article…' : 'Preparing article…'; }

    try {
      let payload;
      if (cloudAuthenticated && article.id) {
        const response = await fetch('/api/topic-feeds/open', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articleId: article.id })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'The prepared article could not be opened.');
        payload = result.payload;
        Object.assign(article, result.article || {}, { read: true, prepared: true });
        saveState({ cloud: false });
      } else {
        const response = await fetch('/api/current/article', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: article.url, title: article.title, summary: article.summary || '',
            source: article.sourceName || 'Topic Feed', publisherUrl: article.sourceUrl || ''
          })
        });
        payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'The article could not be imported.');
        article.read = true;
        saveState();
      }
      openPreparedArticle(topic, article, payload);
    } catch (error) {
      if (status) { status.className = 'status error'; status.textContent = error.message; }
    } finally {
      if (trigger?.isConnected) { trigger.disabled = false; trigger.textContent = originalLabel; }
    }
  }

  async function maybeAutoOpenDailyArticle() {
    if (!cloudAuthenticated || dailyAutoOpenAttempted || !state.preferences.dailyOpenSourceId) return;
    dailyAutoOpenAttempted = true;
    try {
      const response = await fetch('/api/topic-feeds/daily-open', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.article || !result.payload) return;
      const topic = state.topics.find((item) => item.id === result.topic?.id) || { id: result.topic?.id || '', name: result.topic?.name || '' };
      const localArticle = topic.articles?.find?.((item) => item.id === result.article.id);
      if (localArticle) Object.assign(localArticle, result.article, { read: true, prepared: true });
      saveState({ cloud: false });
      const tryOpen = (attempt = 0) => {
        if (window.MarkSetGoReadAnything?.openDocument) {
          openPreparedArticle(topic, localArticle || result.article, result.payload);
        } else if (attempt < 5) {
          window.setTimeout(() => tryOpen(attempt + 1), 300);
        }
      };
      tryOpen();
    } catch (error) {
      console.warn('Daily Topic Feed auto-open was skipped.', error);
    }
  }

  function starterCryptoTopic() {
    const topic = {
      id: uid(), name: 'Cryptocurrency', cadence: 'daily', maxRecommended: 8,
      preferences: 'market-moving news, regulation, institutional adoption, security incidents, substantive analysis',
      sources: [
        { id: uid(), name: 'CoinDesk', type: 'website', url: 'https://www.coindesk.com/', origin:'recommended', recommendationKey:'coindesk' },
        { id: uid(), name: 'Bitcoin Magazine', type: 'website', url: 'https://bitcoinmagazine.com/', origin:'recommended', recommendationKey:'bitcoin-magazine' },
        { id: uid(), name: 'U.S. Securities and Exchange Commission', type: 'website', url: 'https://www.sec.gov/', origin:'recommended', recommendationKey:'sec' }
      ],
      articles: [], lastRefresh: null, lastErrors: []
    };
    state.topics.push(topic);
    activeTopicId = topic.id;
    activeSourceId = '';
    saveState();
    render();
    refreshTopic();
  }

  function sourceArticleCount(topic, sourceId, unreadOnly = false) {
    return (topic.articles || []).filter((article) =>
      article.sourceClientId === sourceId && (!unreadOnly || !article.read)
    ).length;
  }

  function sidebarMarkup(activeTopic) {
    return state.topics.map((topic) => `
      <div class="topic-feed-topic-group ${topic.id === activeTopic?.id ? 'active' : ''}">
        <button class="topic-feed-topic ${topic.id === activeTopic?.id && !activeSourceId ? 'active' : ''}" data-topic-id="${escapeHtml(topic.id)}" type="button">
          <strong>${escapeHtml(topic.name)}</strong>
          <small>${(topic.articles || []).filter((article) => !article.read).length} unread · ${(topic.articles || []).length} articles</small>
        </button>
        <div class="topic-feed-source-list">
          ${(topic.sources || []).map((source) => {
            const daily = state.preferences.dailyOpenSourceId === source.id;
            return `<div class="topic-feed-source-nav ${topic.id === activeTopic?.id && activeSourceId === source.id ? 'active' : ''}">
              <button type="button" data-topic-source="${escapeHtml(source.id)}" data-topic-parent="${escapeHtml(topic.id)}">
                <span>${escapeHtml(source.name)}</span>
                <small>${sourceArticleCount(topic, source.id, true)} new</small>
              </button>
              <button class="topic-daily-choice ${daily ? 'active' : ''}" type="button"
                      data-daily-source="${escapeHtml(source.id)}" title="${daily ? 'Daily opening feed' : 'Open this feed automatically once each day'}">
                ${daily ? 'Daily ✓' : 'Daily'}
              </button>
            </div>`;
          }).join('')}
        </div>
      </div>`).join('');
  }

  function articleCard(article) {
    const published = article.published ? new Date(article.published) : null;
    const dateLabel = published && !Number.isNaN(published.getTime()) ? published.toLocaleString() : '';
    return `
      <article class="topic-feed-article ${article.read ? 'is-read' : ''}">
        <div class="topic-feed-article-main">
          <div class="topic-feed-kicker">
            <span>${escapeHtml(article.sourceName)}</span>
            ${article.prepared ? '<span class="topic-feed-downloaded">Downloaded</span>' : ''}
            ${article.recommended ? '<span class="topic-feed-pick">Recommended</span>' : ''}
            ${article.read ? '<span class="topic-feed-read-state">Read</span>' : ''}
          </div>
          <h3>${escapeHtml(article.title)}</h3>
          <p>${escapeHtml(article.summary || 'No summary was supplied by this feed.')}</p>
          <small>${escapeHtml(dateLabel)}${article.author ? ` · ${escapeHtml(article.author)}` : ''}</small>
          ${article.recommended ? '<div class="topic-feed-why"><strong>Why it surfaced:</strong> recent, relevant, and selected to reduce duplicate coverage.</div>' : ''}
        </div>
        <div class="topic-feed-article-actions">
          <button class="primary" data-topic-read="${escapeHtml(article.id)}" type="button">Read in Reader</button>
          <a class="secondary button-link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener">Original</a>
        </div>
      </article>`;
  }

  function render({ force = false } = {}) {
    if (!app) return;

    // Background refresh/hydration code calls render() in several places.
    // While New/Edit Topic is open, those calls should update data quietly but
    // must not navigate away from the unsaved form.
    if (!force && topicManagerIsOpen()) return;

    closeMenus();
    const topic = currentTopic();
    if (!topic) {
      app.innerHTML = `
        <section class="panel topic-feeds-page">
          <header class="topic-feeds-hero">
            <div><span class="source-category">My Topics</span><h1>Topic Feeds</h1>
            <p>Create the subjects you care about. We’ll suggest useful feeds, and Refresh downloads the latest Reader-ready articles to your signed-in account.</p></div>
          </header>
          <div class="topic-feeds-empty">
            <h2>Build your first topic</h2>
            <p>Add your own publishers or choose from recommended feeds when you create the topic.</p>
            <div class="source-actions"><button class="primary" id="topic-new" type="button">+ New Topic</button>
            <button class="secondary" id="topic-crypto-starter" type="button">Start with Cryptocurrency</button></div>
          </div>
          <div id="topic-feed-status" class="status" aria-live="polite"></div>
        </section>`;
      bindMain();
      return;
    }

    const all = topic.articles || [];
    const base = activeTab === 'all' ? all : all.filter((article) => article.recommended);
    const visible = activeSourceId ? base.filter((article) => article.sourceClientId === activeSourceId) : base;
    const recommendedCount = all.filter((article) => article.recommended).length;
    const activeSource = topic.sources.find((source) => source.id === activeSourceId);

    app.innerHTML = `
      <section class="panel topic-feeds-page">
        <header class="topic-feeds-hero">
          <div><span class="source-category">My Topics</span><h1>${escapeHtml(topic.name)}</h1>
          <p>${topic.cadence === 'weekly' ? 'Weekly' : 'Daily'} edition · ${topic.sources.length} feed${topic.sources.length === 1 ? '' : 's'} · ${all.length} article${all.length === 1 ? '' : 's'}${topic.preparedAt ? ' · downloaded and Reader-ready' : ''}</p></div>
          <div class="topic-feeds-hero-actions">
            <button class="secondary" id="topic-manage" type="button">Manage</button>
            <button class="primary" id="topic-refresh" type="button" ${(loading || preparing) ? 'disabled' : ''}>${preparing ? 'Downloading articles…' : loading ? 'Refreshing…' : 'Refresh & download latest'}</button>
          </div>
        </header>
        <div class="topic-feeds-layout">
          <aside class="topic-feeds-sidebar">
            <div class="topic-feed-sidebar-head"><strong>Topics &amp; feeds</strong><button id="topic-new" type="button" aria-label="New topic">+</button></div>
            ${sidebarMarkup(topic)}
          </aside>
          <div class="topic-feeds-content">
            <div class="topic-feed-toolbar">
              <div class="topic-feed-tabs">
                <button class="${activeTab === 'recommended' ? 'active' : ''}" data-topic-tab="recommended" type="button">Recommended (${recommendedCount})</button>
                <button class="${activeTab === 'all' ? 'active' : ''}" data-topic-tab="all" type="button">All Articles (${all.length})</button>
              </div>
              <span>${activeSource ? `Feed: ${escapeHtml(activeSource.name)} · ` : ''}${topic.lastRefresh ? `Updated ${escapeHtml(new Date(topic.lastRefresh).toLocaleString())}` : 'Not refreshed yet'}</span>
            </div>
            ${activeSource ? `<button class="topic-feed-clear-source" id="topic-clear-source" type="button">← Show all ${escapeHtml(topic.name)} feeds</button>` : ''}
            ${visible.length ? `<div class="topic-feed-list">${visible.map(articleCard).join('')}</div>` : `
              <div class="topic-feeds-empty compact"><h2>${loading ? 'Gathering articles…' : 'No articles yet'}</h2>
              <p>${loading ? 'Checking your feeds and assembling this edition.' : 'Refresh this topic to build its first edition.'}</p></div>`}
            <div id="topic-feed-status" class="status ${topic.lastErrors?.length ? 'error' : ''}" aria-live="polite">
              ${topic.lastErrors?.length ? escapeHtml(`${topic.lastErrors.length} feed(s) could not be loaded. Successful feeds were kept.`) : ''}
            </div>
          </div>
        </div>
      </section>`;
    bindMain();
    if (!loading && topic.sources.length && refreshIsDue(topic) && !all.length) refreshTopic();
  }

  function sourceRow(source = { id: uid(), name: '', type: 'website', url: '', origin:'manual', recommendationKey:'' }) {
    const daily = state.preferences.dailyOpenSourceId === source.id;
    return `
      <div class="topic-feed-source-row" data-source-id="${escapeHtml(source.id)}"
           data-source-origin="${escapeHtml(source.origin || 'manual')}"
           data-recommendation-key="${escapeHtml(source.recommendationKey || '')}">
        <input class="topic-source-name" value="${escapeHtml(source.name)}" placeholder="Feed name" required>
        <select class="topic-source-type"><option value="website" ${source.type === 'website' ? 'selected' : ''}>Website URL</option><option value="rss" ${source.type === 'rss' ? 'selected' : ''}>RSS / Atom</option></select>
        <input class="topic-source-url" type="url" value="${escapeHtml(source.url)}" placeholder="https://…" required>
        <label class="topic-source-daily"><input type="radio" name="topic-daily-source" value="${escapeHtml(source.id)}" ${daily ? 'checked' : ''}> Daily start</label>
        <button class="secondary topic-source-remove" type="button">Remove</button>
      </div>`;
  }

  async function loadRecommendations(topicName) {
    const container = document.getElementById('topic-feed-recommendations');
    if (!container) return;
    const name = String(topicName || '').trim();
    if (name.length < 2) {
      container.innerHTML = '<p class="topic-recommendation-note">Enter a topic name and recommended feeds will appear here.</p>';
      return;
    }
    container.innerHTML = '<p class="topic-recommendation-note">Finding recommended feeds…</p>';
    try {
      const response = await fetch(`/api/topic-feeds/recommend?topic=${encodeURIComponent(name)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Recommendations unavailable.');
      const existing = new Set([...document.querySelectorAll('.topic-source-url')].map((input) => cleanUrl(input.value)).filter(Boolean));
      const items = (payload.sources || []).filter((source) => !existing.has(cleanUrl(source.url)));
      container.innerHTML = items.length ? items.map((source) => `
        <article class="topic-feed-recommendation">
          <div><strong>${escapeHtml(source.name)}</strong><p>${escapeHtml(source.description || '')}</p></div>
          <button type="button" data-add-recommended-feed="${escapeHtml(source.key)}"
                  data-feed-name="${escapeHtml(source.name)}" data-feed-type="${escapeHtml(source.type || 'website')}"
                  data-feed-url="${escapeHtml(source.url)}">Add</button>
        </article>`).join('') : '<p class="topic-recommendation-note">You already added the recommended feeds shown for this topic.</p>';
    } catch (error) {
      container.innerHTML = `<p class="topic-recommendation-note">${escapeHtml(error.message)}</p>`;
    }
  }

  function showManager() {
    topicManagerOpen = true;
    deferredCloudState = null;

    const topic = currentTopic();
    app.innerHTML = `
      <section class="panel topic-feeds-page">
        <header class="topic-feeds-hero">
          <div><span class="source-category">Topic Setup</span><h1>${topic ? 'Edit Topic' : 'New Topic'}</h1>
          <p>Add your own feeds and choose from recommendations. One feed can also be your daily Reader start from the latest downloaded edition.</p></div>
        </header>
        <form id="topic-feed-form" class="topic-feed-form">
          <label>Topic name<input id="topic-name" required value="${escapeHtml(topic?.name || '')}" placeholder="Artificial Intelligence"></label>
          <section class="topic-feed-recommendation-box">
            <div class="topic-feed-sidebar-head"><strong>Recommended feeds for this topic</strong><span>Optional</span></div>
            <div id="topic-feed-recommendations"></div>
          </section>
          <div class="topic-feed-form-row">
            <label>Edition<select id="topic-cadence"><option value="daily" ${topic?.cadence !== 'weekly' ? 'selected' : ''}>Every day</option><option value="weekly" ${topic?.cadence === 'weekly' ? 'selected' : ''}>Every week</option></select></label>
            <label>Recommended articles<input id="topic-max" type="number" min="1" max="25" value="${Number(topic?.maxRecommended) || 8}"></label>
          </div>
          <label>What should be prioritized?<textarea id="topic-preferences" rows="3" placeholder="substantive analysis, policy changes, major product releases…">${escapeHtml(topic?.preferences || '')}</textarea></label>
          <section class="topic-feed-source-editor">
            <div class="topic-feed-sidebar-head"><strong>Your feeds</strong><button id="topic-add-source" type="button">+ Add your own</button></div>
            <p class="topic-source-help">Select “Daily start” on one feed if you want its newest unread downloaded article to open automatically in the Reader once each day.</p>
            <div id="topic-source-rows">${(topic?.sources || []).map(sourceRow).join('')}</div>
          </section>
          <div class="topic-morning-settings">
            <strong>Refresh behavior</strong>
            <span>Saving a topic refreshes it immediately. After that, use “Refresh &amp; download latest” to pull the newest feed items and store Reader-ready article text in your account.</span>
          </div>
          <div class="source-actions">
            <button class="primary" type="submit">Save Topic</button><button class="secondary" id="topic-cancel" type="button">Cancel</button>
            ${topic ? '<button class="danger" id="topic-delete" type="button">Delete Topic</button>' : ''}
          </div>
          <div id="topic-feed-status" class="status" aria-live="polite"></div>
        </form>
      </section>`;
    bindManager(topic);
    void loadRecommendations(topic?.name || '');
  }

  function bindManager(existing) {
    document.getElementById('topic-cancel')?.addEventListener('click', () => {
      // Cancel means discard unsaved edits. If a newer cloud snapshot arrived
      // while the form was open, it is now safe to apply it.
      leaveTopicManager({ applyDeferred: true });
      render({ force: true });
    });
    document.getElementById('topic-add-source')?.addEventListener('click', () => {
      document.getElementById('topic-source-rows')?.insertAdjacentHTML('beforeend', sourceRow());
    });
    document.getElementById('topic-name')?.addEventListener('input', (event) => {
      clearTimeout(recommendationTimer);
      recommendationTimer = window.setTimeout(() => loadRecommendations(event.target.value), 350);
    });
    document.getElementById('topic-feed-recommendations')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-add-recommended-feed]');
      if (!button) return;
      const source = {
        id: uid(), name: button.dataset.feedName || '', type: button.dataset.feedType === 'rss' ? 'rss' : 'website',
        url: button.dataset.feedUrl || '', origin:'recommended', recommendationKey:button.dataset.addRecommendedFeed || ''
      };
      document.getElementById('topic-source-rows')?.insertAdjacentHTML('beforeend', sourceRow(source));
      void loadRecommendations(document.getElementById('topic-name')?.value || '');
    });
    document.getElementById('topic-source-rows')?.addEventListener('click', (event) => {
      const remove = event.target.closest('.topic-source-remove');
      if (!remove) return;
      const row = remove.closest('.topic-feed-source-row');
      const removedId = row?.dataset.sourceId || '';
      row?.remove();
      if (state.preferences.dailyOpenSourceId === removedId) state.preferences.dailyOpenSourceId = '';
    });
    document.getElementById('topic-delete')?.addEventListener('click', () => {
      const removedSourceIds = new Set((existing.sources || []).map((source) => source.id));
      state.topics = state.topics.filter((item) => item.id !== existing.id);
      if (removedSourceIds.has(state.preferences.dailyOpenSourceId)) state.preferences.dailyOpenSourceId = '';
      activeTopicId = state.topics[0]?.id || null;
      activeSourceId = '';

      // This user action wins over any cloud snapshot that arrived while the
      // editor was open.
      leaveTopicManager({ applyDeferred: false });
      saveState();
      render({ force: true });
    });
    document.getElementById('topic-feed-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const rows = [...document.querySelectorAll('.topic-feed-source-row')];
      const sources = rows.map((row) => ({
        id: row.dataset.sourceId || uid(),
        name: row.querySelector('.topic-source-name').value.trim(),
        type: row.querySelector('.topic-source-type').value,
        url: cleanUrl(row.querySelector('.topic-source-url').value),
        origin: row.dataset.sourceOrigin === 'recommended' ? 'recommended' : 'manual',
        recommendationKey: row.dataset.recommendationKey || ''
      })).filter((source) => source.name && source.url);

      const selectedDaily = document.querySelector('input[name="topic-daily-source"]:checked')?.value || '';
      const existingSourceIds = new Set(sources.map((source) => source.id));
      if (selectedDaily) state.preferences.dailyOpenSourceId = selectedDaily;
      else if (existing && (existing.sources || []).some((source) => source.id === state.preferences.dailyOpenSourceId) && !existingSourceIds.has(state.preferences.dailyOpenSourceId)) {
        state.preferences.dailyOpenSourceId = '';
      }
      state.preferences.timezone = defaultTimezone;

      const formValues = {
        name: document.getElementById('topic-name').value.trim(),
        cadence: document.getElementById('topic-cadence').value,
        maxRecommended: Number(document.getElementById('topic-max').value) || 8,
        preferences: document.getElementById('topic-preferences').value.trim(),
        sources
      };

      let record;
      if (existing?.id) {
        // A feed refresh may have replaced this topic object in state while the
        // editor was open. Always merge the form into the CURRENT live record
        // so refreshed articles are preserved and unsaved settings are not lost.
        const liveIndex = state.topics.findIndex((item) => item.id === existing.id);
        const live = liveIndex >= 0
          ? state.topics[liveIndex]
          : { ...existing };

        record = { ...live, ...formValues, id: existing.id };

        if (liveIndex >= 0) state.topics[liveIndex] = record;
        else state.topics.push(record);
      } else {
        record = {
          id: uid(),
          articles: [],
          lastRefresh: null,
          lastErrors: [],
          ...formValues
        };
        state.topics.push(record);
      }

      activeTopicId = record.id;
      activeSourceId = '';

      // Save means the form intentionally wins over any cloud snapshot received
      // while editing. Push this saved state back to cloud, then refresh feeds.
      leaveTopicManager({ applyDeferred: false });
      saveState();
      render({ force: true });
      refreshTopic();
    });
  }

  function setDailySource(sourceId) {
    state.preferences.dailyOpenSourceId = state.preferences.dailyOpenSourceId === sourceId ? '' : sourceId;
    state.preferences.timezone = defaultTimezone;
    saveState();
    render();
  }

  function bindMain() {
    document.getElementById('topic-new')?.addEventListener('click', () => {
      activeTopicId = null; activeSourceId = ''; showManager();
    });
    document.getElementById('topic-crypto-starter')?.addEventListener('click', starterCryptoTopic);
    document.getElementById('topic-manage')?.addEventListener('click', showManager);
    document.getElementById('topic-refresh')?.addEventListener('click', refreshTopic);
    document.getElementById('topic-clear-source')?.addEventListener('click', () => { activeSourceId = ''; render(); });

    document.querySelectorAll('[data-topic-id]').forEach((button) => button.addEventListener('click', () => {
      activeTopicId = button.dataset.topicId; activeSourceId = ''; activeTab = 'recommended'; render();
    }));
    document.querySelectorAll('[data-topic-source]').forEach((button) => button.addEventListener('click', () => {
      activeTopicId = button.dataset.topicParent; activeSourceId = button.dataset.topicSource; activeTab = 'all'; render();
    }));
    document.querySelectorAll('[data-daily-source]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation(); setDailySource(button.dataset.dailySource);
    }));
    document.querySelectorAll('[data-topic-tab]').forEach((button) => button.addEventListener('click', () => {
      activeTab = button.dataset.topicTab; render();
    }));
    document.querySelectorAll('[data-topic-read]').forEach((button) => button.addEventListener('click', () => {
      const article = currentTopic()?.articles?.find((item) => item.id === button.dataset.topicRead);
      if (article) openArticle(article, button);
    }));
  }

  const TOPIC_READER_PANE_PREF_KEY = 'msg-topic-feeds-left-pane-open';
  let applyingTopicReaderPanePreference = false;
  let topicPaneUserIntentUntil = 0;

  function markTopicPaneUserIntent(open) {
    // Save the user's intent BEFORE app.js changes the layout. The My Topics
    // MutationObserver can run during the same click; without this guard it can
    // see the old "open" preference and immediately reopen a panel the user
    // just closed.
    saveTopicReaderPanePreference(open);
    topicPaneUserIntentUntil = Date.now() + 220;

    if (!open) {
      window.clearTimeout(topicBookPageGeometryTimer);
    } else {
      window.setTimeout(scheduleTopicBookPageGeometrySync, 240);
    }
  }

  function topicReaderPaneShouldBeOpen() {
    try {
      const saved = localStorage.getItem(TOPIC_READER_PANE_PREF_KEY);
      if (saved === '0') return false;
      if (saved === '1') return true;
    } catch {}
    // Topic Feed reading uses My Topics as primary navigation.
    // Open it by default until the reader explicitly closes it.
    return true;
  }

  function saveTopicReaderPanePreference(open) {
    try {
      localStorage.setItem(TOPIC_READER_PANE_PREF_KEY, open ? '1' : '0');
    } catch {}
  }

  function isTopicFeedReaderActive() {
    try {
      const doc = window.MarkSetGoCurrentReaderDocument?.get?.();
      if (doc?.source) return doc.source.type === 'topic-feed';
    } catch {}
    return Boolean(window.MSGTopicFeedReaderContext);
  }

  let topicBookPageGeometryTimer = 0;
  let topicBookDividerResizeObserver = null;
  let topicBookDividerClassObserver = null;
  let topicBookDividerFrame = null;

  function removeTopicBookDivider() {
    topicBookDividerResizeObserver?.disconnect?.();
    topicBookDividerResizeObserver = null;
    topicBookDividerClassObserver?.disconnect?.();
    topicBookDividerClassObserver = null;

    const frame = topicBookDividerFrame || document.querySelector('#reader-frame');
    frame?.querySelectorAll('[data-topic-feed-book-divider]').forEach((node) => node.remove());
    document.querySelector('#reader')?.classList.remove('topic-feed-divider-managed');
    topicBookDividerFrame = null;
  }

  function positionTopicBookDivider() {
    if (!isTopicFeedReaderActive()) {
      removeTopicBookDivider();
      return;
    }

    const frame = document.querySelector('#reader-frame');
    const reader = document.querySelector('#reader');
    if (!frame || !reader) return;

    if (!reader.classList.contains('book-pages-layout')) {
      frame.querySelectorAll('[data-topic-feed-book-divider]').forEach((node) => node.remove());
      reader.classList.remove('topic-feed-divider-managed');
      return;
    }

    reader.classList.add('topic-feed-divider-managed');

    let divider = frame.querySelector('[data-topic-feed-book-divider]');
    if (!divider) {
      divider = document.createElement('div');
      divider.className = 'topic-feed-book-divider-overlay';
      divider.dataset.topicFeedBookDivider = '1';
      divider.setAttribute('aria-hidden', 'true');
      frame.appendChild(divider);
    }

    const frameRect = frame.getBoundingClientRect();
    const readerRect = reader.getBoundingClientRect();
    const left = (readerRect.left - frameRect.left) + (readerRect.width / 2);
    const top = readerRect.top - frameRect.top;

    divider.style.left = `${Math.round(left)}px`;
    divider.style.top = `${Math.round(top)}px`;
    divider.style.height = `${Math.round(readerRect.height)}px`;
  }

  function ensureTopicBookDivider() {
    if (!isTopicFeedReaderActive()) {
      removeTopicBookDivider();
      return;
    }

    const frame = document.querySelector('#reader-frame');
    const reader = document.querySelector('#reader');
    if (!frame || !reader) return;

    if (topicBookDividerFrame !== frame) {
      removeTopicBookDivider();
      topicBookDividerFrame = frame;

      if (typeof ResizeObserver === 'function') {
        topicBookDividerResizeObserver = new ResizeObserver(() => {
          window.requestAnimationFrame(() => {
            positionTopicBookDivider();
            positionTopicFeedStoryHeader();
          });
        });
        topicBookDividerResizeObserver.observe(frame);
        topicBookDividerResizeObserver.observe(reader);
      }

      topicBookDividerClassObserver = new MutationObserver(() => {
        window.requestAnimationFrame(() => {
          positionTopicBookDivider();
          positionTopicFeedStoryHeader();
        });
      });
      topicBookDividerClassObserver.observe(reader, {
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }

    positionTopicBookDivider();
  }

  function scheduleTopicBookPageGeometrySync() {
    window.clearTimeout(topicBookPageGeometryTimer);

    const attempt = (number = 0) => {
      if (!isTopicFeedReaderActive()) return;

      const layout = document.querySelector('#reader-layout');
      const pane = document.querySelector('#navigation-pane');
      const reader = document.querySelector('#reader');

      if (!layout || !pane || !reader) return;

      // Wait until My Topics is actually open and Book Pages has been restored.
      // The first Reader render can reach this point before the saved Book Pages
      // preference has finished applying.
      const paneIsOpen = !layout.classList.contains('navigation-hidden');
      const bookPagesActive = reader.classList.contains('book-pages-layout');

      if (!paneIsOpen || !bookPagesActive) {
        if (number < 7) {
          topicBookPageGeometryTimer = window.setTimeout(
            () => attempt(number + 1),
            90 + (number * 55)
          );
        }
        return;
      }

      const readerWidth = Math.round(reader.getBoundingClientRect().width || 0);
      const paneWidth = Math.round(pane.getBoundingClientRect().width || 0);
      const signature = `${readerWidth}:${paneWidth}`;

      // One sync per final geometry for this Reader DOM.
      if (reader.dataset.topicFeedGeometrySynced === signature) return;
      reader.dataset.topicFeedGeometrySynced = signature;

      // app.js already has the correct Book Pages reflow logic and a
      // ResizeObserver on #reader. A temporary 4px navigation-width nudge makes
      // that existing observer see the final panel geometry after state.bookPages
      // is active. The property is restored immediately on the next frame.
      const previousInline = layout.style.getPropertyValue('--navigation-width');
      const computedPaneWidth = Math.max(260, paneWidth || 300);

      layout.style.setProperty('--navigation-width', `${computedPaneWidth + 4}px`);
      window.requestAnimationFrame(() => {
        if (previousInline) {
          layout.style.setProperty('--navigation-width', previousInline);
        } else {
          layout.style.removeProperty('--navigation-width');
        }
        window.dispatchEvent(new Event('resize'));
        window.requestAnimationFrame(ensureTopicBookDivider);
      });
    };

    topicBookPageGeometryTimer = window.setTimeout(() => attempt(0), 70);
  }

  function applyTopicReaderPanePreference() {
    if (!isTopicFeedReaderActive()) return;

    // A real user click always wins over automatic restoration. This prevents
    // the close/open flicker caused by decorateReaderNavigation() running from
    // MutationObserver changes during the same interaction.
    if (Date.now() < topicPaneUserIntentUntil) return;

    const layout = document.querySelector('#reader-layout');
    const toggle = document.querySelector('#toggle-navigation-pane');
    if (!layout || !toggle || applyingTopicReaderPanePreference) return;

    const shouldOpen = topicReaderPaneShouldBeOpen();
    const isOpen = !layout.classList.contains('navigation-hidden');

    if (shouldOpen === isOpen) {
      if (shouldOpen) scheduleTopicBookPageGeometrySync();
      return;
    }

    applyingTopicReaderPanePreference = true;
    try {
      // Let the Reader's own layout code perform the actual open/close.
      toggle.click();
    } finally {
      window.setTimeout(() => {
        applyingTopicReaderPanePreference = false;
        if (topicReaderPaneShouldBeOpen()) scheduleTopicBookPageGeometrySync();
      }, 0);
    }
  }

  function bindTopicReaderPanePreference() {
    const toggle = document.querySelector('#toggle-navigation-pane');
    const close = document.querySelector('#close-navigation-pane');

    if (toggle && toggle.dataset.topicFeedStickyBound !== '1') {
      toggle.dataset.topicFeedStickyBound = '1';

      // Capture phase is deliberate: persist the desired state before app.js's
      // own click handler changes classes and triggers MutationObserver work.
      toggle.addEventListener('click', () => {
        if (applyingTopicReaderPanePreference || !isTopicFeedReaderActive()) return;

        const layout = document.querySelector('#reader-layout');
        if (!layout) return;
        const currentlyOpen = !layout.classList.contains('navigation-hidden');
        markTopicPaneUserIntent(!currentlyOpen);
      }, true);
    }

    if (close && close.dataset.topicFeedStickyBound !== '1') {
      close.dataset.topicFeedStickyBound = '1';
      close.addEventListener('click', () => {
        if (applyingTopicReaderPanePreference || !isTopicFeedReaderActive()) return;
        markTopicPaneUserIntent(false);
      }, true);
    }
  }

  let pendingTopicReaderScrollRestore = null;
  let topicReaderScrollRestoreTimer = 0;

  function captureTopicReaderScroll(articleId = '') {
    const pane = document.querySelector('#navigation-pane');
    if (!pane) return;

    pendingTopicReaderScrollRestore = {
      scrollTop: Math.max(0, Number(pane.scrollTop) || 0),
      articleId: String(articleId || ''),
      capturedAt: Date.now()
    };
  }

  function restoreTopicReaderScroll() {
    if (!pendingTopicReaderScrollRestore) return;

    const pane = document.querySelector('#navigation-pane');
    if (!pane || !isTopicFeedReaderActive()) return;

    const targetTop = Math.max(0, Number(pendingTopicReaderScrollRestore.scrollTop) || 0);
    pane.scrollTop = targetTop;

    // If the rebuilt list is still finishing layout, keep the selected story in
    // view as a fallback rather than letting the panel jump all the way to top.
    const articleId = pendingTopicReaderScrollRestore.articleId;
    if (articleId && Math.abs((Number(pane.scrollTop) || 0) - targetTop) > 6) {
      const button = pane.querySelector(
        `[data-reader-topic-article="${CSS.escape(articleId)}"]`
      );
      button?.scrollIntoView?.({ block: 'nearest' });
    }
  }

  function scheduleTopicReaderScrollRestore() {
    if (!pendingTopicReaderScrollRestore) return;

    window.clearTimeout(topicReaderScrollRestoreTimer);

    const delays = [0, 50, 130, 260, 520];
    delays.forEach((delay, index) => {
      window.setTimeout(() => {
        restoreTopicReaderScroll();

        if (index === delays.length - 1) {
          pendingTopicReaderScrollRestore = null;
        }
      }, delay);
    });
  }

  function readerTopicListMarkup() {
    return `<div class="topic-reader-nav">
      <div class="topic-reader-nav-head">
        <h2>My Topics</h2>
        <div class="topic-reader-nav-actions">
          <span data-reader-bookmark-slot></span>
          <button type="button" data-reader-manage-topics>Manage</button>
        </div>
      </div>
      ${state.topics.length ? state.topics.map((topic) => `
        <details class="topic-reader-group" ${topic.id === window.MSGTopicFeedReaderContext?.topicId ? 'open' : ''}>
          <summary><strong>${escapeHtml(topic.name)}</strong><span>${(topic.articles || []).filter((a) => !a.read).length} unread</span></summary>
          ${(topic.sources || []).map((source) => {
            const articles = (topic.articles || [])
              .filter((article) => article.sourceClientId === source.id)
              .sort((a, b) => new Date(b.publishedAt || b.fetchedAt || 0) - new Date(a.publishedAt || a.fetchedAt || 0));
            const initialLimit = 10;
            return `<div class="topic-reader-source" data-reader-topic-source-block="${escapeHtml(source.id)}">
              <div class="topic-reader-source-head"><strong>${escapeHtml(source.name)}</strong><span>${sourceArticleCount(topic, source.id, true)} new</span></div>
              ${articles.length ? articles.map((article, index) => `<button type="button"
                 class="topic-reader-article ${article.read ? 'is-read' : ''}"
                 ${index >= initialLimit ? 'hidden data-reader-topic-overflow="1"' : ''}
                 data-reader-topic-article="${escapeHtml(article.id)}"
                 data-reader-topic-parent="${escapeHtml(topic.id)}">
                 ${escapeHtml(article.title)}</button>`).join('') : '<small>No downloaded articles yet.</small>'}
              ${articles.length > initialLimit ? `<button type="button"
                 class="topic-reader-show-more"
                 data-reader-topic-more
                 aria-expanded="false">
                 Show all ${articles.length} stories
               </button>` : ''}
            </div>`;
          }).join('')}
        </details>`).join('') : '<p class="navigation-empty">No Topic Feeds yet.</p>'}
    </div>`;
  }

  function decorateReaderNavigation() {
    if (!isTopicFeedReaderActive()) return;
    const pane = document.querySelector('#navigation-pane');
    if (!pane) return;
    const tab = pane.querySelector('[data-reader-tab="contents"]');
    const view = pane.querySelector('[data-reader-view="contents"]');
    if (!tab || !view) return;

    tab.textContent = 'My Topics';
    const heading = pane.querySelector('.reader-library-header strong');
    if (heading) heading.textContent = 'My Topics';

    const toggle = document.querySelector('#toggle-navigation-pane');
    if (toggle && !toggle.dataset.topicFeedLabel) {
      const icon = toggle.querySelector('span[aria-hidden="true"]')?.outerHTML || '<span aria-hidden="true">☰</span>';
      toggle.innerHTML = `${icon} My Topics`;
      toggle.setAttribute('aria-label', 'Open or close My Topics');
      toggle.dataset.topicFeedLabel = '1';
    }

    pane.setAttribute('aria-label', 'My Topics');
    const closeButton = pane.querySelector('#close-navigation-pane');
    if (closeButton) closeButton.setAttribute('aria-label', 'Close My Topics');

    bindTopicReaderPanePreference();

    if (!view.querySelector('.topic-reader-nav')) {
      // IMPORTANT: renderNavigationPane() has already bound the Reader's
      // #add-bookmark button to its native addBookmark() function. Keep that
      // exact DOM node before replacing Contents so bookmarks continue to use
      // the established Reader implementation.
      const nativeBookmarkButton = view.querySelector('#add-bookmark');

      view.innerHTML = readerTopicListMarkup();

      const bookmarkSlot = view.querySelector('[data-reader-bookmark-slot]');
      if (nativeBookmarkButton && bookmarkSlot) {
        nativeBookmarkButton.classList.add('topic-reader-bookmark-button');
        nativeBookmarkButton.textContent = '＋ Bookmark';
        nativeBookmarkButton.title = 'Bookmark the current reading position';
        bookmarkSlot.replaceChildren(nativeBookmarkButton);
      }
    }

    view.querySelector('[data-reader-manage-topics]')?.addEventListener('click', () => {
      render();
    }, { once:true });

    view.querySelectorAll('[data-reader-topic-article]').forEach((button) => {
      if (button.dataset.bound === '1') return;
      button.dataset.bound = '1';
      button.addEventListener('click', () => {
        const topic = state.topics.find((item) => item.id === button.dataset.readerTopicParent);
        const article = topic?.articles?.find((item) => item.id === button.dataset.readerTopicArticle);
        if (topic && article) {
          captureTopicReaderScroll(article.id);
          openArticle(article, button, topic);
        }
      });
    });

    view.querySelectorAll('[data-reader-topic-more]').forEach((button) => {
      if (button.dataset.bound === '1') return;
      button.dataset.bound = '1';
      button.addEventListener('click', () => {
        const sourceBlock = button.closest('.topic-reader-source');
        if (!sourceBlock) return;
        const expanded = button.getAttribute('aria-expanded') === 'true';
        sourceBlock.querySelectorAll('[data-reader-topic-overflow="1"]').forEach((articleButton) => {
          articleButton.hidden = expanded;
        });
        button.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        const total = sourceBlock.querySelectorAll('[data-reader-topic-article]').length;
        button.textContent = expanded ? `Show all ${total} stories` : 'Show fewer';
      });
    });

    // app.js starts Reader side panes closed when a Reader view is rebuilt.
    // Topic Feed articles restore the reader's explicit My Topics preference.
    window.setTimeout(applyTopicReaderPanePreference, 0);
    scheduleTopicBookPageGeometrySync();
    window.setTimeout(ensureTopicBookDivider, 0);
    window.setTimeout(ensureTopicBookDivider, 160);
    window.setTimeout(ensureTopicBookDivider, 420);

    // Opening another story rebuilds the Reader DOM. Put My Topics back at the
    // exact place the reader was browsing instead of resetting to the top.
    scheduleTopicReaderScrollRestore();

    // Reader mode/word-count changes rebuild .reader-group elements. Reapply
    // the small provenance footer treatment without altering currentText.
    decorateTopicFeedArticleFooter();
  }

  function scheduleReaderNavigation() {
    cancelAnimationFrame(navFrame);
    navFrame = requestAnimationFrame(decorateReaderNavigation);
  }

  const appObserver = app ? new MutationObserver(() => scheduleReaderNavigation()) : null;
  if (appObserver && app) appObserver.observe(app, { childList:true, subtree:true });

  document.addEventListener('marksetgo:auth-changed', (event) => {
    if (event.detail?.authenticated) void hydrateCloudState();
    else cloudAuthenticated = false;
  });

  document.addEventListener('marksetgo:document-available', () => {
    window.setTimeout(scheduleReaderNavigation, 40);
  });

  document.addEventListener('click', (event) => {
    const target = event.target.closest?.('[data-action="topic-feeds"]');
    if (!target) return;

    // Do not use capture + stopImmediatePropagation here. The main app's
    // navigation listener still needs to close the Library menu and save normal
    // navigation continuity. Topic Feeds simply supplies the destination that
    // app.js intentionally does not render itself.
    event.preventDefault();

    if (topicManagerIsOpen()) leaveTopicManager({ applyDeferred: true });
    render({ force: true });

    if (app) app.dataset.viewKey = 'topic-feeds';
  });

  // Browse is a nested <details> inside My Library. Native summary toggling is
  // normally sufficient, but multiple document-level navigation handlers can
  // make the interaction unreliable. Own only this summary's toggle explicitly
  // without blocking the rest of the Library menu.
  document.addEventListener('click', (event) => {
    const summary = event.target.closest?.('.library-browse-submenu > summary');
    if (!summary) return;

    const details = summary.closest('.library-browse-submenu');
    if (!details) return;

    event.preventDefault();
    details.open = !details.open;
  });

  window.addEventListener('DOMContentLoaded', () => {
    if (window.MarkSetGoAuth?.session?.authenticated) void hydrateCloudState();
    else window.setTimeout(() => {
      if (window.MarkSetGoAuth?.session?.authenticated) void hydrateCloudState();
    }, 800);
  }, { once:true });

  window.addEventListener('resize', () => {
    if (isTopicFeedReaderActive()) {
      window.requestAnimationFrame(() => {
        ensureTopicBookDivider();
        positionTopicFeedStoryHeader();
      });
    }
  });

  window.MarkSetGoTopicFeeds = Object.freeze({
    render,
    refresh: refreshTopic,
    hydrate: hydrateCloudState,
    state: () => state
  });
})();