(() => {
  'use strict';

  // 20260822-v7.21-stability-consolidation: nonblocking feeds + explicit UI sync, no DOM mutation observers.

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

  // Cloud reads/writes can overlap authentication and the Topic editor. Track
  // intentional local topic changes so an older cloud snapshot can never erase
  // a topic the reader just saved. Local state remains authoritative until the
  // same revision has been confirmed by a successful cloud write.
  let localTopicRevision = 0;
  let cloudSyncedTopicRevision = 0;
  let cloudWriteChain = Promise.resolve(true);

  function markLocalTopicRevision() {
    localTopicRevision += 1;
    return localTopicRevision;
  }

  // New/Edit Topic is a transactional screen. Background cloud hydration,
  // authentication refreshes, and in-flight feed refreshes must never replace
  // it while the reader is typing.
  let topicManagerOpen = false;
  let deferredCloudState = null;

  // The Topic editor keeps explicit AI recommendation choices separately from
  // the topic's existing source rows. This prevents an older/polluted source
  // list from being mistaken for the sources selected in the current edit.
  let managerSelectedRecommendationSources = new Map();
  let managerNewManualSourceIds = new Set();

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
    const topics = repairTopicFeedSourceIds(Array.isArray(value?.topics) ? value.topics : []).map((topic) => ({
      ...topic,
      sourceMode: topic?.sourceMode === 'ai' || topic?.sourceMode === 'hybrid' ? topic.sourceMode : 'manual',
      aiSourcesUpdatedAt: topic?.aiSourcesUpdatedAt || null,
      selectedSourceUrls: [...new Set((Array.isArray(topic?.selectedSourceUrls) ? topic.selectedSourceUrls : [])
        .map((value) => cleanUrl(value)).filter(Boolean))].slice(0, 30),
      dismissedArticleIds: [...new Set((Array.isArray(topic?.dismissedArticleIds) ? topic.dismissedArticleIds : []).map(String).filter(Boolean))].slice(-500)
    }));
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

  function topicStateIdentity(value = state) {
    // This signature is deliberately metadata-only: it is cheap enough for
    // cross-pane synchronization but changes whenever the Reader navigation,
    // source attribution, unread state, or topic configuration should change.
    return JSON.stringify({
      preferences: [
        String(value?.preferences?.timezone || ''),
        Number(value?.preferences?.morningHour ?? 5),
        String(value?.preferences?.dailyOpenSourceId || '')
      ],
      topics: (value?.topics || []).map((topic) => [
        String(topic?.id || ''),
        String(topic?.name || ''),
        String(topic?.sourceMode || ''),
        String(topic?.cadence || ''),
        Number(topic?.maxRecommended || 0),
        String(topic?.preferences || ''),
        String(topic?.aiSourcesUpdatedAt || ''),
        (topic?.selectedSourceUrls || []).map(String),
        String(topic?.lastRefresh || ''),
        (topic?.dismissedArticleIds || []).map(String),
        (topic?.sources || []).map((source) => [
          String(source?.id || ''),
          String(source?.name || ''),
          String(source?.type || ''),
          String(source?.url || ''),
          String(source?.origin || '')
        ]),
        (topic?.articles || []).map((article) => [
          String(article?.id || ''),
          String(article?.sourceClientId || ''),
          String(article?.sourceName || ''),
          String(article?.url || ''),
          String(article?.title || ''),
          String(article?.published || article?.publishedAt || ''),
          Boolean(article?.read),
          Boolean(article?.prepared),
          Boolean(article?.recommended)
        ])
      ])
    });
  }

  function announceTopicStateChange() {
    // localStorage's storage event updates sibling frames, while this message
    // gives the outer app an immediate signal even when browser storage-event
    // timing is delayed. Never send the full article payload through postMessage.
    if (window.parent !== window) {
      try {
        window.parent.postMessage({ type:'msg-topic-feeds-state-changed' }, window.location.origin);
      } catch {}
    }
  }

  function adoptSharedTopicState() {
    if (topicManagerIsOpen()) return false;
    const incoming = loadState();
    if (topicStateIdentity(incoming) === topicStateIdentity(state)) return false;

    state = incoming;
    if (!state.preferences.timezone) state.preferences.timezone = defaultTimezone;
    if (!state.topics.some((topic) => topic.id === activeTopicId)) {
      activeTopicId = state.topics[0]?.id || null;
      activeSourceId = '';
    }

    // Treat a state received from another same-origin pane as a real local
    // revision. Until cloud confirms it, a stale hydration response may not
    // replace the topic list in this window.
    markLocalTopicRevision();
    scheduleReaderNavigation();

    if (document.querySelector('.topic-feeds-page') && !topicManagerIsOpen()) {
      render({ force:true });
    }
    if (cloudAuthenticated) void syncCloudNow();
    return true;
  }

  const LOCAL_CACHE_TARGET_CHARS = 220000;
  const LOCAL_CACHE_EMERGENCY_CHARS = 70000;

  function compactTopicSourceForStorage(source) {
    return {
      id: String(source?.id || '').slice(0, 180),
      name: String(source?.name || '').slice(0, 240),
      type: String(source?.type || 'website').slice(0, 40),
      url: String(source?.url || '').slice(0, 1600),
      origin: String(source?.origin || '').slice(0, 80),
      recommendationKey: String(source?.recommendationKey || '').slice(0, 160)
    };
  }

  function compactTopicArticleForStorage(article, { includeSummary = true } = {}) {
    return {
      id: String(article?.id || '').slice(0, 220),
      cloudId: String(article?.cloudId || '').slice(0, 220),
      title: String(article?.title || '').slice(0, 420),
      url: String(article?.url || '').slice(0, 1600),
      summary: includeSummary ? String(article?.summary || '').slice(0, 420) : '',
      published: String(article?.published || '').slice(0, 80),
      author: String(article?.author || '').slice(0, 220),
      sourceName: String(article?.sourceName || '').slice(0, 220),
      sourceUrl: String(article?.sourceUrl || '').slice(0, 1200),
      sourceType: String(article?.sourceType || '').slice(0, 50),
      sourceClientId: String(article?.sourceClientId || '').slice(0, 180),
      sourceRank: Number(article?.sourceRank) || 0,
      feedMode: String(article?.feedMode || '').slice(0, 50),
      recommended: Boolean(article?.recommended),
      prepared: Boolean(article?.prepared),
      read: Boolean(article?.read)
    };
  }

  function compactTopicMetadataForStorage(topic) {
    return {
      id: String(topic?.id || '').slice(0, 180),
      name: String(topic?.name || '').slice(0, 240),
      cadence: topic?.cadence === 'weekly' ? 'weekly' : 'daily',
      maxRecommended: Math.max(1, Math.min(25, Number(topic?.maxRecommended) || 8)),
      preferences: String(topic?.preferences || '').slice(0, 700),
      sourceMode: topic?.sourceMode === 'ai' || topic?.sourceMode === 'hybrid' ? topic.sourceMode : 'manual',
      aiSourcesUpdatedAt: String(topic?.aiSourcesUpdatedAt || '').slice(0, 80),
      selectedSourceUrls: [...new Set((Array.isArray(topic?.selectedSourceUrls) ? topic.selectedSourceUrls : [])
        .map((value) => cleanUrl(value)).filter(Boolean))].slice(0, 30),
      lastRefresh: String(topic?.lastRefresh || '').slice(0, 80),
      preparedAt: String(topic?.preparedAt || '').slice(0, 80),
      lastErrors: (Array.isArray(topic?.lastErrors) ? topic.lastErrors : [])
        .slice(0, 8)
        .map((item) => String(item || '').slice(0, 300)),
      dismissedArticleIds: [...new Set((Array.isArray(topic?.dismissedArticleIds) ? topic.dismissedArticleIds : []).map(String).filter(Boolean))].slice(-500),
      sources: (Array.isArray(topic?.sources) ? topic.sources : [])
        .slice(0, 30)
        .map(compactTopicSourceForStorage),
      articles: []
    };
  }

  function compactStateForStorage(value, { targetChars = LOCAL_CACHE_TARGET_CHARS, includeSummaries = true } = {}) {
    const normalized = normalizeState(value);
    const topics = (Array.isArray(value?.topics) ? value.topics : []).map(compactTopicMetadataForStorage);
    const result = { preferences: normalized.preferences, topics };

    // localStorage is only a lightweight/offline index. Full Topic Feed state
    // and prepared article bodies remain in the cloud/server path. Add recent
    // article metadata only while the serialized cache stays under a fixed
    // budget so this feature can never consume the app's entire local quota.
    let used = JSON.stringify(result).length;
    const sourceTopics = Array.isArray(value?.topics) ? value.topics : [];
    let added = true;
    let articleIndex = 0;

    while (added && used < targetChars) {
      added = false;
      for (let topicIndex = 0; topicIndex < sourceTopics.length; topicIndex += 1) {
        const article = sourceTopics[topicIndex]?.articles?.[articleIndex];
        if (!article) continue;
        const compact = compactTopicArticleForStorage(article, { includeSummary: includeSummaries });
        const cost = JSON.stringify(compact).length + 1;
        if (used + cost > targetChars) continue;
        result.topics[topicIndex].articles.push(compact);
        used += cost;
        added = true;
      }
      articleIndex += 1;
      if (articleIndex >= 80) break;
    }

    return result;
  }

  function saveLocalState() {
    const write = (payload) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      announceTopicStateChange();
      return true;
    };

    try {
      return write(compactStateForStorage(state));
    } catch (error) {
      const quota = error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED';
      if (!quota) {
        console.warn('Topic Feed local cache could not be saved.', error);
        return false;
      }

      // Self-heal an older oversized Topic Feed cache. Replacing this one key
      // with a much smaller metadata-only snapshot frees quota immediately and
      // leaves cloud state untouched.
      try {
        const emergency = compactStateForStorage(state, {
          targetChars: LOCAL_CACHE_EMERGENCY_CHARS,
          includeSummaries: false
        });
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
        return write(emergency);
      } catch (retryError) {
        console.warn('Topic Feed local cache could not be saved.', retryError);
        return false;
      }
    }
  }

  function cloudPayload() {
    return {
      topics: state.topics,
      preferences: state.preferences
    };
  }

  function syncCloudNow() {
    if (!cloudAuthenticated) return Promise.resolve(false);

    // Serialize account writes. Two PUTs completing out of order can otherwise
    // put an older topic list back in the database after a newer Save Topic.
    cloudWriteChain = cloudWriteChain.catch(() => false).then(async () => {
      if (!cloudAuthenticated) return false;
      const revisionBeingSaved = localTopicRevision;
      const payloadBeingSaved = cloudPayload();
      try {
        const response = await fetch('/api/topic-feeds/state', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadBeingSaved)
        });
        if (response.status === 401 || response.status === 503) {
          cloudAuthenticated = false;
          return false;
        }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Unable to sync Topic Feeds.');
        cloudSyncedTopicRevision = Math.max(cloudSyncedTopicRevision, revisionBeingSaved);
        return true;
      } catch (error) {
        console.warn('Topic Feed cloud sync was deferred.', error);
        return false;
      }
    });
    return cloudWriteChain;
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
    const revisionWhenHydrationStarted = localTopicRevision;
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

      // If the user saved/edited a topic while this GET was in flight, or a
      // local topic revision has not yet been confirmed by cloud, this response
      // is older by definition. Never let it replace the local topic list.
      if (revisionWhenHydrationStarted !== localTopicRevision || localTopicRevision > cloudSyncedTopicRevision) {
        void syncCloudNow();
        return true;
      }

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

  function sourceMatchKey(source) {
    return {
      id: String(source?.id || '').trim(),
      name: String(source?.name || '').trim().toLowerCase(),
      url: String(source?.url || '').trim().replace(/\/+$/, '').toLowerCase()
    };
  }

  function articleBelongsToSources(article, sources) {
    const allowed = (Array.isArray(sources) ? sources : []).map(sourceMatchKey);

    const articleId = String(article?.sourceClientId || '').trim();
    const articleName = String(article?.sourceName || '').trim().toLowerCase();
    const articleUrl = String(article?.sourceUrl || '').trim().replace(/\/+$/, '').toLowerCase();

    return allowed.some((source) => Boolean(
      (articleId && source.id && articleId === source.id) ||
      (articleUrl && source.url && articleUrl === source.url) ||
      (articleName && source.name && articleName === source.name)
    ));
  }

  function filterArticlesForSources(articles, sources) {
    const list = Array.isArray(articles) ? articles : [];
    if (!Array.isArray(sources) || !sources.length) return [];
    return list.filter((article) => articleBelongsToSources(article, sources));
  }

  async function syncTopicConfigurationBeforeRefresh() {
    if (!cloudAuthenticated) return true;

    // A normal saveState() intentionally batches writes. Topic configuration
    // is different: Refresh reads the server's saved source list, so the source
    // edit must reach the database BEFORE Refresh can start.
    clearTimeout(cloudSaveTimer);

    const synced = await syncCloudNow();
    if (!synced) {
      // Keep the normal retry path alive, but tell the caller not to use the
      // stale server-side refresh until that retry succeeds.
      scheduleCloudSave();
    }
    return synced;
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

  function articleRelevance(article, topic) {
    const body = `${article.title || ''} ${article.summary || ''}`.toLowerCase();
    const title = String(article.title || '').toLowerCase();
    const topicTerms = textTokens(topic.name);
    const preferenceTerms = textTokens(topic.preferences);
    const phrase = String(topic.name || '').trim().toLowerCase();
    const topicHits = topicTerms.reduce((count, term) => count + Number(body.includes(term)), 0);
    const preferenceHits = preferenceTerms.reduce((count, term) => count + Number(body.includes(term)), 0);
    const minimumHits = topicTerms.length ? Math.min(2, Math.max(1, Math.ceil(topicTerms.length * .35))) : 0;
    const exactPhrase = phrase.length >= 4 && body.includes(phrase);
    let score = Math.max(0, 6 - (Number(article.sourceRank) || 0));
    score += topicHits * 12;
    score += preferenceHits * 4;
    if (exactPhrase) score += 22;
    if (phrase && title.includes(phrase)) score += 14;
    const published = new Date(article.published || 0).getTime();
    if (Number.isFinite(published) && published > 0) {
      const ageHours = Math.max(0, (Date.now() - published) / 3600000);
      score += Math.max(0, 10 - ageHours / 12);
    }
    return { score, relevant: !topicTerms.length || exactPhrase || topicHits >= minimumHits };
  }

  function curate(topic) {
    const ranked = [...(topic.articles || [])]
      .map((article) => ({ ...article, ...articleRelevance(article, topic) }))
      .sort((a, b) => b.score - a.score);
    const recommended = [];
    for (const article of ranked) {
      if (!article.relevant) continue;
      if (recommended.some((picked) => titleSimilarity(picked.title, article.title) >= 0.66)) continue;
      recommended.push(article);
      if (recommended.length >= (Number(topic.maxRecommended) || 8)) break;
    }
    const ids = new Set(recommended.map((article) => article.id));
    topic.articles = ranked.map(({ relevant, ...article }) => ({ ...article, recommended: ids.has(article.id) }));
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

  function warmReaderArticlesInBackground(topic) {
    const articles = Array.isArray(topic?.articles) ? topic.articles : [];
    if (!articles.length) return;
    const selected = [...articles]
      .sort((a,b) => Number(b.recommended) - Number(a.recommended) || (Date.parse(b.published || '') || 0) - (Date.parse(a.published || '') || 0))
      .slice(0, 16);
    // Deliberately fire-and-forget. Refresh renders the new edition immediately;
    // Reader extraction/cache warming must never hold the Topic Feeds UI hostage.
    void prefetchArticles(selected, { wait: false });
  }

  async function refreshTopic({ forceLocal = false, preserveReader = false } = {}) {
    const topic = currentTopic();
    if (!topic || loading) return;
    if (!topic.sources.length && topic.sourceMode !== 'ai' && topic.sourceMode !== 'hybrid') return;
    loading = true;
    if (preserveReader) scheduleReaderNavigation();
    else render();
    try {
      if (cloudAuthenticated && !forceLocal) {
        const response = await fetch('/api/topic-feeds/refresh', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topicId: topic.id })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Unable to refresh topic feeds.');

        const index = state.topics.findIndex((item) => item.id === topic.id);
        if (index >= 0 && payload.topic) {
          const live = state.topics[index];

          // Refresh owns downloaded article data, but it must NEVER own the
          // reader's source configuration. A stale server response therefore
          // cannot resurrect a feed that was just removed.
          const dismissed = new Set((live.dismissedArticleIds || []).map(String));
          const mode = live.sourceMode === 'ai' || live.sourceMode === 'hybrid' ? live.sourceMode : 'manual';
          const refreshedSources = mode === 'manual'
            ? live.sources
            : (Array.isArray(payload.topic.sources) && payload.topic.sources.length ? payload.topic.sources : live.sources);
          const refreshedArticles = filterArticlesForSources(
            payload.topic.articles,
            refreshedSources
          ).filter((article) => !dismissed.has(String(article?.id || '')));

          state.topics[index] = {
            ...payload.topic,
            id: live.id,
            name: live.name,
            cadence: live.cadence,
            maxRecommended: live.maxRecommended,
            preferences: live.preferences,
            sourceMode: mode,
            aiSourcesUpdatedAt: payload.topic.aiSourcesUpdatedAt || live.aiSourcesUpdatedAt || null,
            selectedSourceUrls: Array.isArray(live.selectedSourceUrls) ? live.selectedSourceUrls : [],
            sources: refreshedSources,
            dismissedArticleIds: [...dismissed],
            articles: refreshedArticles,
            lastErrors: Array.isArray(payload.topic.lastErrors)
              ? payload.topic.lastErrors
              : (live.lastErrors || [])
          };
        }
        saveState({ cloud: false });
        warmReaderArticlesInBackground(state.topics[index] || currentTopic());
      } else {
        if (!topic.sources.length && (topic.sourceMode === 'ai' || topic.sourceMode === 'hybrid')) {
          const recResponse = await fetch(`/api/topic-feeds/recommend?topic=${encodeURIComponent(topic.name)}&preferences=${encodeURIComponent(topic.preferences || '')}`);
          const recPayload = await recResponse.json().catch(() => ({}));
          if (recResponse.ok && Array.isArray(recPayload.sources)) {
            topic.sources = recPayload.sources.map((source) => ({
              id: uid(), name: source.name || '', type:'website', url:cleanUrl(source.url || ''),
              origin:'ai', recommendationKey:source.key || ''
            })).filter((source) => source.name && source.url);
            topic.aiSourcesUpdatedAt = new Date().toISOString();
          }
        }
        if (!topic.sources.length) throw new Error('No topic-specific sources could be found yet. Try adding more detail to the topic or priorities.');
        const response = await fetch('/api/topic-feeds/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: topic.name, sources: topic.sources })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Unable to refresh topic feeds.');
        const existingRead = new Set((topic.articles || []).filter((article) => article.read).map((article) => article.url));
        const dismissed = new Set((topic.dismissedArticleIds || []).map(String));
        topic.articles = (payload.articles || [])
          .filter((article) => !dismissed.has(String(article?.id || '')))
          .map((article) => ({ ...article, read: existingRead.has(article.url) }));
        topic.lastErrors = payload.sources?.filter?.((source) => !source.ok).map((source) => source.error) || [];
        topic.lastRefresh = new Date().toISOString();
        topic.preparedAt = '';
        curate(topic);
        saveState();
        warmReaderArticlesInBackground(topic);
      }
    } catch (error) {
      const live = currentTopic();
      if (live) live.lastErrors = [error.message];
    } finally {
      preparing = false;
      loading = false;
      if (preserveReader) {
        const pane = document.querySelector('#navigation-pane');
        const view = pane?.querySelector('[data-reader-view="contents"]');
        if (view) {
          // Rebuild only the My Topics list after refresh while preserving the
          // Reader's native Bookmark button and the currently open article.
          const bookmarkButton = view.querySelector('#add-bookmark');
          if (bookmarkButton) bookmarkButton.remove();
          view.querySelector('.topic-reader-nav')?.remove();
          if (bookmarkButton) view.appendChild(bookmarkButton);
        }
        scheduleReaderNavigation();
      } else {
        render();
      }
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

  let topicFeedStoryHeaderReflowTimer = 0;

  function topicFeedStoryHeaderParts(reader = document.querySelector('#reader')) {
    if (!reader) return {};

    const readerFrame = reader.closest('#reader-frame');
    if (!readerFrame) return {};

    let header = readerFrame.querySelector(':scope > [data-topic-feed-story-header-external]');
    if (!header) {
      header = document.createElement('div');
      header.className = 'topic-feed-story-header-external';
      header.dataset.topicFeedStoryHeaderExternal = '1';
      header.setAttribute('aria-label', 'Topic Feed article header');
      readerFrame.insertBefore(header, reader);
    }

    // Recover nodes from the broken in-reader implementation without cloning
    // them. The Reader action buttons keep their existing handlers when moved.
    let meta = header.querySelector(':scope > [data-topic-feed-story-meta-overlay]');
    const inReaderMeta = reader.querySelector(':scope > [data-topic-feed-story-meta-overlay]');
    if (!meta && inReaderMeta) {
      meta = inReaderMeta;
      header.appendChild(meta);
    }
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'topic-feed-story-meta-overlay';
      meta.dataset.topicFeedStoryMetaOverlay = '1';
      header.appendChild(meta);
    }

    let spacer = reader.querySelector(':scope > [data-topic-feed-story-header-spacer]');
    if (!spacer) {
      spacer = document.createElement('div');
      spacer.className = 'topic-feed-story-header-spacer';
      spacer.dataset.topicFeedStoryHeaderSpacer = '1';
      spacer.setAttribute('aria-hidden', 'true');
      reader.prepend(spacer);
    }

    const actionRow = document.querySelector('#read-anything-article-summary-action');
    if (actionRow && actionRow.parentElement !== header) {
      header.appendChild(actionRow);
    }

    // Remove the later direct-child marker; this header is deliberately owned
    // by #reader-frame so it cannot travel with the scrolling article.
    reader.classList.remove('topic-feed-story-header-managed');

    return { readerFrame, header, spacer, meta, actionRow };
  }

  function scheduleTopicFeedStoryBookReflow() {
    window.clearTimeout(topicFeedStoryHeaderReflowTimer);
    topicFeedStoryHeaderReflowTimer = window.setTimeout(() => {
      const reader = document.querySelector('#reader');
      if (!reader?.classList.contains('book-pages-layout')) return;
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    }, 70);
  }

  function positionTopicFeedStoryHeader() {
    if (!isTopicFeedReaderActive()) return;

    const reader = document.querySelector('#reader');
    if (!reader) return;

    const { readerFrame, header, spacer, meta, actionRow } = topicFeedStoryHeaderParts(reader);
    if (!readerFrame || !header || !spacer || !meta) return;

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

    // Anchor the header to the viewport/frame, never to #reader's scrollable
    // content. Scrolling #reader therefore cannot move this band by one pixel.
    const frameRect = readerFrame.getBoundingClientRect();
    const readerRect = reader.getBoundingClientRect();
    const left = Math.max(0, readerRect.left - frameRect.left + paddingLeft);
    const top = Math.max(0, readerRect.top - frameRect.top + paddingTop);

    header.style.setProperty('left', `${left}px`, 'important');
    header.style.setProperty('top', `${top}px`, 'important');
    header.style.setProperty('width', `${headerWidth}px`, 'important');
    header.style.setProperty('max-width', `${headerWidth}px`, 'important');

    // Undo inline positioning left behind by the broken direct-child version.
    if (actionRow?.isConnected) {
      actionRow.style.removeProperty('left');
      actionRow.style.removeProperty('top');
      actionRow.style.removeProperty('position');
      actionRow.style.removeProperty('max-width');
      actionRow.style.removeProperty('z-index');
    }

    window.requestAnimationFrame(() => {
      if (!reader.isConnected || !header.isConnected || !spacer.isConnected) return;

      const headerHeight = Math.ceil(header.getBoundingClientRect().height || 0);
      // Reserve the initial header footprint plus one text-line buffer. That
      // spacer scrolls away with the article; the external header never does.
      const requiredHeight = Math.max(fontSize * 2, headerHeight + fontSize);
      const previousHeight = Number.parseFloat(spacer.style.height) || 0;
      spacer.style.width = '100%';
      spacer.style.maxWidth = `${headerWidth}px`;

      if (Math.abs(requiredHeight - previousHeight) > 1) {
        spacer.style.height = `${Math.ceil(requiredHeight)}px`;
        scheduleTopicFeedStoryBookReflow();
      }
    });
  }

  function keepTopicFeedArticleActionsInHeader() {
    if (!isTopicFeedReaderActive()) return;

    const reader = document.querySelector('#reader');
    if (!reader) return;

    const parts = topicFeedStoryHeaderParts(reader);
    if (!parts.header) return;

    const actionRow = document.querySelector('#read-anything-article-summary-action');
    if (actionRow && actionRow.parentElement !== parts.header) {
      // Moving the existing node preserves all Read Anything click/hover/focus
      // handlers. Do not clone, rebuild, or hide these controls.
      parts.header.appendChild(actionRow);
    }

    positionTopicFeedStoryHeader();
  }


  let activeTopicFeedHeaderContext = null;

  function clearReaderArticleContext() {
    activeTopicFeedHeaderContext = null;
    window.MSGTopicFeedReaderContext = null;

    const reader = document.querySelector('#reader');
    const frame = reader?.closest('#reader-frame');
    frame?.querySelector(':scope > [data-topic-feed-story-header-external]')?.remove();
    reader?.querySelector(':scope > [data-topic-feed-story-header-spacer]')?.remove();
    reader?.querySelectorAll('[data-topic-feed-import-recovery]').forEach((node) => node.remove());
    removeTopicBookDivider();
  }

  function stripTrailingTopicFeedProvenance(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    return raw.replace(/\n{2,}\s*Source:\s*[^\n]+\nhttps?:\/\/\S+\s*$/i, '').trim();
  }

  const TOPIC_FEED_IMPORT_FALLBACK_TEXT = 'Full article text could not be imported from the publisher.';

  function topicFeedImportFallbackNeeded(payload = {}) {
    const warning = String(payload?.warning || '');
    const body = String(payload?.text || '');
    return Boolean(
      payload?.fullArticle === false ||
      warning.includes(TOPIC_FEED_IMPORT_FALLBACK_TEXT) ||
      body.includes(TOPIC_FEED_IMPORT_FALLBACK_TEXT)
    );
  }

  function ensureTopicFeedImportRecoveryStyles() {
    if (document.getElementById('topic-feed-import-recovery-styles')) return;
    const style = document.createElement('style');
    style.id = 'topic-feed-import-recovery-styles';
    style.textContent = `
      .topic-feed-import-recovery-inline {
        font-size: .94em;
        line-height: 1.4;
        color: var(--msg-theme-ink, inherit);
      }
      .topic-feed-import-recovery-inline a {
        color: var(--msg-theme-accent, currentColor);
        font-weight: 700;
        text-decoration: underline;
        text-underline-offset: 2px;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  function openReadAnythingFromTopicFeed(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (typeof window.MarkSetGoReadAnything?.render === 'function') {
      window.MarkSetGoReadAnything.render();
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        const bookmarkletButton = document.querySelector('#read-anything-bookmarklet');
        bookmarkletButton?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      }));
      return;
    }

    document.querySelector('[data-read="upload"], [data-action="read-anything"]')?.click?.();
  }

  function decorateTopicFeedImportRecovery(payload = activeTopicFeedHeaderContext?.payload || {}) {
    const reader = document.querySelector('#reader');
    if (!reader) return false;

    const existing = reader.querySelector('[data-topic-feed-import-recovery]');
    if (!isTopicFeedReaderActive() || !topicFeedImportFallbackNeeded(payload)) {
      existing?.remove();
      return false;
    }
    if (existing) return true;

    ensureTopicFeedImportRecoveryStyles();

    // Important: keep this INLINE. The Reader's multicolumn/layout engine can assign
    // very large used heights to direct block children even when they have zero
    // padding. An inline note stays in the normal article text flow and cannot
    // become a 200+ px callout slot.
    const notice = document.createElement('span');
    notice.className = 'topic-feed-import-recovery-inline';
    notice.dataset.topicFeedImportRecovery = '1';
    notice.setAttribute('role', 'note');
    notice.innerHTML = `<br><br><strong>Want the full article?</strong>
      Click <strong>View original</strong> above, then use the
      <strong>Read with Mark</strong> bookmarklet to import the publisher page.
      You can find the bookmarklet in the
      <a href="#read-anything" data-topic-feed-open-read-anything>Read Anything section</a>.`;

    notice.querySelector('[data-topic-feed-open-read-anything]')
      ?.addEventListener('click', openReadAnythingFromTopicFeed);

    reader.appendChild(notice);
    return true;
  }

  function scheduleTopicFeedImportRecovery(payload = activeTopicFeedHeaderContext?.payload || {}) {
    [0, 80, 220, 520, 900].forEach((delay) => {
      window.setTimeout(() => {
        if (isTopicFeedReaderActive()) decorateTopicFeedImportRecovery(payload);
      }, delay);
    });
  }

  function refreshActiveTopicFeedHeader() {
    if (!isTopicFeedReaderActive()) return;
    const context = activeTopicFeedHeaderContext;
    if (!context?.topic || !context?.article) return;
    topicFeedSourceCredit(context.topic, context.article, context.payload || {});
  }

  function sourceHostLabel(value) {
    try {
      return new URL(String(value || '')).hostname.replace(/^www\./i, '');
    } catch {
      return '';
    }
  }

  function topicFeedSourceCredit(topic, article, payload) {
    const originalUrl = String(payload?.sourceUrl || article?.url || '').trim();
    const configuredSource = (topic?.sources || []).find(
      (source) => String(source?.id || '') === String(article?.sourceClientId || '')
    );
    const preparedSite = String(payload?.siteName || payload?.site || '').trim();
    const sourceName = String(
      preparedSite ||
      configuredSource?.name ||
      article?.sourceName ||
      sourceHostLabel(originalUrl) ||
      'Topic Feed'
    ).trim();
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
      if (!isTopicFeedReaderActive()) return false;
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

      // Keep the existing Read Anything action row in the permanent external
      // header so it never moves with article scrolling.
      keepTopicFeedArticleActionsInHeader();
      positionTopicFeedStoryHeader();

      return true;
    };

    // The article action row may be installed just after openDocument(), so
    // retry long enough to place the credit beneath it rather than above it.
    [0, 40, 100, 220, 480, 900, 1500, 2500].forEach((delay) => {
      window.setTimeout(() => {
        if (apply()) {
          keepTopicFeedArticleActionsInHeader();
          positionTopicFeedStoryHeader();
          decorateTopicFeedArticleFooter();
        }
      }, delay);
    });
  }

  function receiveWorkspaceArticleContext(topic, article, payload) {
    // Synchronize state/context only. Do NOT render from this function: rendering
    // the outer app here can destroy the workspace pane that initiated the read.
    adoptSharedTopicState();
    const liveTopic = state.topics.find((item) => String(item?.id || '') === String(topic?.id || '')) || topic;
    const liveArticle = liveTopic?.articles?.find?.((item) => String(item?.id || '') === String(article?.id || '')) || article;
    const sourceDisplayName = String(
      payload?.siteName ||
      payload?.site ||
      (liveTopic?.sources || []).find((source) => String(source?.id || '') === String(liveArticle?.sourceClientId || ''))?.name ||
      liveArticle?.sourceName ||
      sourceHostLabel(payload?.sourceUrl || liveArticle?.url) ||
      'Topic Feed'
    ).trim();

    window.MSGTopicFeedReaderContext = {
      topicId: liveTopic?.id || '',
      topicName: liveTopic?.name || '',
      sourceId: liveArticle?.sourceClientId || '',
      sourceName: sourceDisplayName,
      articleId: liveArticle?.id || '',
      updatedAt: new Date().toISOString()
    };
    activeTopicFeedHeaderContext = { topic: liveTopic, article: liveArticle, payload };
    return true;
  }

  function openPreparedArticle(topic, article, payload, options = {}) {
    const isWorkspacePane = window.parent !== window && (
      Boolean(window.__MSG_WORKSPACE_PANE__) ||
      new URLSearchParams(window.location.search).has('msgWorkspaceMode')
    );

    const sourceDisplayName = String(
      payload?.siteName ||
      payload?.site ||
      (topic?.sources || []).find((source) => String(source?.id || '') === String(article?.sourceClientId || ''))?.name ||
      article.sourceName ||
      sourceHostLabel(payload?.sourceUrl || article?.url) ||
      'Topic Feed'
    ).trim();

    const readerText = stripTrailingTopicFeedProvenance(payload?.text);
    const documentRecord = {
      title: payload.title || article.title,
      author: payload?.author || article.author || sourceDisplayName,
      text: readerText || String(article.feedText || article.summary || '').trim() || 'Open the original article to continue reading.',
      source: {
        type: 'topic-feed',
        url: payload.sourceUrl || article.url,
        topic: topic?.name || '',
        topicId: topic?.id || '',
        feedSource: sourceDisplayName,
        feedSourceId: article.sourceClientId || '',
        articleId: article.id || '',
        fullArticle: payload.fullArticle !== false,
        importWarning: payload.warning || '',
        documentToc: Array.isArray(payload.documentToc) ? payload.documentToc : [],
        importedAt: new Date().toISOString()
      }
    };

    // A Topic Feed page opened in the secondary workspace is a persistent source
    // pane. Do not route this read through MSGWorkspaceReaderHandoff: that generic
    // handoff is allowed to transition/replace the secondary pane. Instead invoke
    // the OUTER app's Read Anything importer directly. The iframe that initiated
    // the read is never navigated, rendered over, hidden, or closed here.
    if (isWorkspacePane && !options.fromOuterWorkspacePane) {
      announceTopicStateChange();
      try {
        const parentFeeds = window.parent.MarkSetGoTopicFeeds;
        parentFeeds?.receiveWorkspaceArticleContext?.(topic, article, payload);

        const parentImporter = window.parent.MarkSetGoReadAnything;
        if (typeof parentImporter?.openDocument === 'function') {
          parentImporter.openDocument(documentRecord);

          // The parent Reader and article-action row finish in separate explicit
          // passes. Re-apply Topic Feed chrome through bounded retries only; no
          // DOM observer is used and the source workspace pane is left untouched.
          [0, 80, 220, 520].forEach((delay) => {
            window.parent.setTimeout(() => {
              try { parentFeeds?.refreshReaderArticleChrome?.(); } catch {}
            }, delay);
          });
          return true;
        }
      } catch (error) {
        console.warn('Workspace could not open the Topic Feed article in the outer Reader.', error);
      }
      // If the outer importer is not ready, fall through to the existing local
      // path so the action still works rather than silently doing nothing.
    }

    if (!window.MarkSetGoReadAnything?.openDocument) throw new Error('The Reader importer is not ready.');

    window.MSGTopicFeedReaderContext = {
      topicId: topic?.id || '',
      topicName: topic?.name || '',
      sourceId: article.sourceClientId || '',
      sourceName: sourceDisplayName,
      articleId: article.id || '',
      updatedAt: new Date().toISOString()
    };
    activeTopicFeedHeaderContext = { topic, article, payload };
    window.MarkSetGoReadAnything.openDocument(documentRecord);
    topicFeedSourceCredit(topic, article, payload);
    scheduleTopicFeedImportRecovery(payload);
    scheduleReaderNavigation();
    return true;
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
            url: article.url, title: article.title, summary: article.summary || '', feedText: article.feedText || '',
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

  function explicitReaderOwnsCurrentView() {
    // 20260824 bookmarklet race guard: a background Topic Feed hydration must
    // never replace content the user explicitly opened in the Reader. The
    // capture hash can disappear immediately after a successful bookmarklet
    // handoff, so also check the live Reader/view rather than relying on the hash.
    if (String(location.hash || '').includes('read-anything-capture=')) return true;
    if (app?.dataset?.viewKey === 'reader') return true;
    if (document.querySelector('#reader')) return true;
    try {
      const current = window.MarkSetGoCurrentReaderDocument?.get?.();
      if (current?.text || current?.source) return true;
    } catch {}
    return false;
  }

  async function maybeAutoOpenDailyArticle() {
    if (!cloudAuthenticated || dailyAutoOpenAttempted || !state.preferences.dailyOpenSourceId) return;

    // Daily auto-open is a startup convenience only. If an explicit Reader is
    // already active (including Read with Mark), skip it for this app session.
    // This prevents auth/cloud hydration from replacing a newly captured page.
    if (explicitReaderOwnsCurrentView()) {
      dailyAutoOpenAttempted = true;
      return;
    }

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
        // The Reader may have been opened while the daily-open request was in
        // flight. Re-check immediately before takeover, not only before fetch.
        if (explicitReaderOwnsCurrentView()) return;
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
          <p>${topic.cadence === 'weekly' ? 'Weekly' : 'Daily'} edition · ${topic.sources.length} feed${topic.sources.length === 1 ? '' : 's'} · ${all.length} article${all.length === 1 ? '' : 's'}${topic.preparedAt ? ' · Reader cache warmed' : ''}</p></div>
          <div class="topic-feeds-hero-actions">
            <button class="secondary" id="topic-manage" type="button">Manage</button>
            <button class="primary" id="topic-refresh" type="button" ${loading ? 'disabled' : ''}>${loading ? 'Refreshing…' : 'Refresh latest'}</button>
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
    if (!loading && (topic.sources.length || topic.sourceMode === 'ai' || topic.sourceMode === 'hybrid') && refreshIsDue(topic) && !all.length) refreshTopic();
  }

  function sourceRow(source = { id: uid(), name: '', type: 'website', url: '', origin:'manual', recommendationKey:'' }) {
    const daily = state.preferences.dailyOpenSourceId === source.id;
    const explicit = source.origin !== 'ai';
    return `
      <div class="topic-feed-source-row" data-source-id="${escapeHtml(source.id)}"
           data-source-origin="${escapeHtml(source.origin || 'manual')}"
           data-source-explicit="${explicit ? '1' : '0'}"
           data-source-session-added="${source.sessionAdded ? '1' : '0'}"
           data-recommendation-key="${escapeHtml(source.recommendationKey || '')}">
        <input class="topic-source-name" value="${escapeHtml(source.name)}" placeholder="Feed name" required>
        <select class="topic-source-type"><option value="website" ${source.type === 'website' ? 'selected' : ''}>Website URL</option><option value="rss" ${source.type === 'rss' ? 'selected' : ''}>RSS / Atom</option></select>
        <input class="topic-source-url" type="url" value="${escapeHtml(source.url)}" placeholder="https://…" required>
        <label class="topic-source-daily"><input type="radio" name="topic-daily-source" value="${escapeHtml(source.id)}" ${daily ? 'checked' : ''}> Daily start</label>
        <button class="secondary topic-source-remove" type="button">Remove</button>
      </div>`;
  }

  async function loadRecommendations(topicName) {
    const websiteContainer = document.getElementById('topic-feed-recommendations');
    const rssContainer = document.getElementById('topic-feed-rss-recommendations');
    if (!websiteContainer && !rssContainer) return;

    const setBoth = (websiteHtml, rssHtml = websiteHtml) => {
      if (websiteContainer) websiteContainer.innerHTML = websiteHtml;
      if (rssContainer) rssContainer.innerHTML = rssHtml;
    };
    const name = String(topicName || '').trim();
    if (name.length < 2) {
      setBoth(
        '<p class="topic-recommendation-note">Enter a topic name and recommended sources will appear here.</p>',
        '<p class="topic-recommendation-note">Enter a topic name and verified RSS feeds will appear here.</p>'
      );
      return;
    }
    setBoth(
      '<p class="topic-recommendation-note">Finding topic-specific sources…</p>',
      '<p class="topic-recommendation-note">Discovering and verifying RSS feeds…</p>'
    );

    const renderItems = (items, emptyMessage) => items.length ? items.map((source) => {
      const sourceUrl = cleanUrl(source.url);
      const selected = Boolean(sourceUrl && managerSelectedRecommendationSources.has(sourceUrl));
      return `
        <article class="topic-feed-recommendation ${selected ? 'selected' : ''}">
          <div><strong>${escapeHtml(source.name)}</strong><p>${escapeHtml(source.description || '')}</p>${source.reason ? `<small>${escapeHtml(source.reason)}</small>` : ''}</div>
          <button type="button" data-add-recommended-feed="${escapeHtml(source.key)}"
                  data-feed-name="${escapeHtml(source.name)}" data-feed-type="${escapeHtml(source.type || 'website')}"
                  data-feed-url="${escapeHtml(source.url)}" data-selected="${selected ? '1' : '0'}" aria-pressed="${selected ? 'true' : 'false'}">${selected ? 'Selected' : 'Add'}</button>
        </article>`;
    }).join('') : `<p class="topic-recommendation-note">${escapeHtml(emptyMessage)}</p>`;

    try {
      const priorities = document.getElementById('topic-preferences')?.value?.trim() || '';
      const response = await fetch(`/api/topic-feeds/recommend?topic=${encodeURIComponent(name)}&preferences=${encodeURIComponent(priorities)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Recommendations unavailable.');

      // Keep website recommendations and direct RSS/Atom feeds visibly separate.
      // Both use the same explicit-selection Map, so the v2.4.8 invariant still
      // applies: selecting N recommendations saves exactly those N URLs.
      const websites = Array.isArray(payload.sources) ? payload.sources : [];
      const rssFeeds = Array.isArray(payload.rssFeeds) ? payload.rssFeeds : [];
      if (websiteContainer) websiteContainer.innerHTML = renderItems(websites, 'No website suggestions are available yet for this topic.');
      if (rssContainer) rssContainer.innerHTML = renderItems(rssFeeds, 'No verified RSS / Atom feeds were found for these publishers yet.');
    } catch (error) {
      setBoth(
        `<p class="topic-recommendation-note">${escapeHtml(error.message)}</p>`,
        `<p class="topic-recommendation-note">${escapeHtml(error.message)}</p>`
      );
    }
  }

  function showManager() {
    topicManagerOpen = true;
    deferredCloudState = null;
    managerSelectedRecommendationSources = new Map();
    managerNewManualSourceIds = new Set();

    const topic = currentTopic();
    app.innerHTML = `
      <section class="panel topic-feeds-page">
        <header class="topic-feeds-hero">
          <div><span class="source-category">Topic Setup</span><h1>${topic ? 'Edit Topic' : 'New Topic'}</h1>
          <p>Add your own feeds and choose from recommendations. One feed can also be your daily Reader start from the latest downloaded edition.</p></div>
        </header>
        <form id="topic-feed-form" class="topic-feed-form">
          <label>Topic name<input id="topic-name" required value="${escapeHtml(topic?.name || '')}" placeholder="Artificial Intelligence"></label>
          <label>Source discovery
            <select id="topic-source-mode">
              <option value="ai" ${(topic?.sourceMode || (!topic ? 'ai' : 'manual')) === 'ai' ? 'selected' : ''}>AI-managed — choose and maintain sources automatically</option>
              <option value="hybrid" ${topic?.sourceMode === 'hybrid' ? 'selected' : ''}>AI + my own sources</option>
              <option value="manual" ${(topic?.sourceMode || (!topic ? 'ai' : 'manual')) === 'manual' ? 'selected' : ''}>Selected sources only</option>
            </select>
          </label>
          <p id="topic-source-mode-note" class="topic-source-help"></p>
          <section class="topic-feed-recommendation-box">
            <div class="topic-feed-sidebar-head"><strong>Recommended websites</strong><span>AI · topic-specific</span></div>
            <div id="topic-feed-recommendations"></div>
          </section>
          <section class="topic-feed-recommendation-box topic-feed-rss-recommendation-box">
            <div class="topic-feed-sidebar-head"><strong>Recommended RSS feeds</strong><span>Verified direct feeds</span></div>
            <p class="topic-source-help">These RSS / Atom URLs are discovered and validated from the recommended publishers, not guessed by AI.</p>
            <div id="topic-feed-rss-recommendations"></div>
          </section>
          <div class="topic-feed-form-row">
            <label>Edition<select id="topic-cadence"><option value="daily" ${topic?.cadence !== 'weekly' ? 'selected' : ''}>Every day</option><option value="weekly" ${topic?.cadence === 'weekly' ? 'selected' : ''}>Every week</option></select></label>
            <label>Recommended articles<input id="topic-max" type="number" min="1" max="25" value="${Number(topic?.maxRecommended) || 8}"></label>
          </div>
          <label>What should be prioritized?<textarea id="topic-preferences" rows="3" placeholder="substantive analysis, policy changes, major product releases…">${escapeHtml(topic?.preferences || '')}</textarea></label>
          <section class="topic-feed-source-editor" id="topic-manual-source-editor">
            <div class="topic-feed-sidebar-head"><strong>Your feeds</strong><button id="topic-add-source" type="button">+ Add your own</button></div>
            <p class="topic-source-help">Selected sources live here. Choosing an AI suggestion explicitly uses only the sources you select unless you choose “AI + selected sources.”</p>
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
    const switchToExplicitSourceSelection = () => {
      const select = document.getElementById('topic-source-mode');
      if (!select || select.value !== 'ai') return false;

      // Clicking a specific recommendation is an explicit choice. Never keep
      // AI-managed mode in that case, because AI-managed intentionally replaces
      // the source set with a broader AI-maintained collection.
      select.value = 'manual';

      // When converting an existing AI-managed topic to selected-only mode,
      // discard only sources that AI added automatically. User-added/pinned
      // sources remain available alongside the newly selected recommendation.
      document.querySelectorAll('.topic-feed-source-row[data-source-origin="ai"]').forEach((row) => row.remove());
      return true;
    };

    const syncSourceModeUi = () => {
      const mode = document.getElementById('topic-source-mode')?.value || 'manual';
      const editor = document.getElementById('topic-manual-source-editor');
      if (editor) editor.hidden = mode === 'ai';
      const note = document.getElementById('topic-source-mode-note');
      if (note) note.textContent = mode === 'ai'
        ? 'AI will choose highly topic-specific sources and refresh that source set periodically. You do not need to enter URLs.'
        : mode === 'hybrid'
          ? 'AI will maintain topic-specific sources while also keeping the feeds you add yourself.'
          : 'Only the sources you select or add below will be used.';
    };
    document.getElementById('topic-source-mode')?.addEventListener('change', syncSourceModeUi);
    syncSourceModeUi();
    document.getElementById('topic-preferences')?.addEventListener('input', () => {
      clearTimeout(recommendationTimer);
      recommendationTimer = window.setTimeout(() => loadRecommendations(document.getElementById('topic-name')?.value || ''), 650);
    });
    document.getElementById('topic-cancel')?.addEventListener('click', () => {
      // Cancel means discard unsaved edits. If a newer cloud snapshot arrived
      // while the form was open, it is now safe to apply it.
      leaveTopicManager({ applyDeferred: true });
      render({ force: true });
    });
    document.getElementById('topic-add-source')?.addEventListener('click', (event) => {
      // This is an editor action, never a form-submit/navigation action.
      event.preventDefault();
      event.stopPropagation();
      if (switchToExplicitSourceSelection()) syncSourceModeUi();
      const source = { id: uid(), name:'', type:'website', url:'', origin:'manual', recommendationKey:'', sessionAdded:true };
      managerNewManualSourceIds.add(source.id);
      document.getElementById('topic-source-rows')?.insertAdjacentHTML('beforeend', sourceRow(source));
    });
    document.getElementById('topic-name')?.addEventListener('input', (event) => {
      clearTimeout(recommendationTimer);
      recommendationTimer = window.setTimeout(() => loadRecommendations(event.target.value), 650);
    });
    const bindRecommendationPicker = (containerId) => {
      document.getElementById(containerId)?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-add-recommended-feed]');
        if (!button) return;

        // Recommendation clicks are selection only. They never submit, refresh,
        // navigate, or close a Topic Setup/workspace pane.
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

        const url = cleanUrl(button.dataset.feedUrl || '');
        if (!url) return;
        const selected = managerSelectedRecommendationSources.has(url);

        if (selected) {
          managerSelectedRecommendationSources.delete(url);
          button.dataset.selected = '0';
          button.classList.remove('selected');
          button.closest('.topic-feed-recommendation')?.classList.remove('selected');
          button.textContent = 'Add';
          button.setAttribute('aria-pressed', 'false');
        } else {
          managerSelectedRecommendationSources.set(url, {
            id: uid(),
            name: button.dataset.feedName || '',
            type: button.dataset.feedType === 'rss' ? 'rss' : 'website',
            url,
            origin: 'recommended',
            recommendationKey: button.dataset.addRecommendedFeed || ''
          });
          button.dataset.selected = '1';
          button.classList.add('selected');
          button.closest('.topic-feed-recommendation')?.classList.add('selected');
          button.textContent = 'Selected';
          button.setAttribute('aria-pressed', 'true');

          // Reflect the contract in the selector without rebuilding either
          // recommendation section. The explicit Map remains authoritative.
          const modeSelect = document.getElementById('topic-source-mode');
          if (modeSelect?.value === 'ai') modeSelect.value = 'manual';
          const editor = document.getElementById('topic-manual-source-editor');
          if (editor) editor.hidden = false;
          const note = document.getElementById('topic-source-mode-note');
          if (note) note.textContent = 'Only the sources you select or add below will be used.';
        }
      });
    };
    bindRecommendationPicker('topic-feed-recommendations');
    bindRecommendationPicker('topic-feed-rss-recommendations');

    document.getElementById('topic-source-rows')?.addEventListener('click', (event) => {
      const remove = event.target.closest('.topic-source-remove');
      if (!remove) return;
      const row = remove.closest('.topic-feed-source-row');
      const removedId = row?.dataset.sourceId || '';
      if (removedId) managerNewManualSourceIds.delete(removedId);
      row?.remove();
      if (state.preferences.dailyOpenSourceId === removedId) state.preferences.dailyOpenSourceId = '';
    });
    document.getElementById('topic-delete')?.addEventListener('click', () => {
      const removedSourceIds = new Set((existing.sources || []).map((source) => source.id));
      state.topics = state.topics.filter((item) => item.id !== existing.id);
      markLocalTopicRevision();
      if (removedSourceIds.has(state.preferences.dailyOpenSourceId)) state.preferences.dailyOpenSourceId = '';
      activeTopicId = state.topics[0]?.id || null;
      activeSourceId = '';

      // This user action wins over any cloud snapshot that arrived while the
      // editor was open.
      leaveTopicManager({ applyDeferred: false });
      saveState();
      render({ force: true });
    });
    document.getElementById('topic-feed-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const requestedSourceMode = document.getElementById('topic-source-mode')?.value || 'manual';
      const rows = [...document.querySelectorAll('.topic-feed-source-row')];
      const rowSources = rows.map((row) => ({
        id: row.dataset.sourceId || uid(),
        name: row.querySelector('.topic-source-name').value.trim(),
        type: row.querySelector('.topic-source-type').value,
        url: cleanUrl(row.querySelector('.topic-source-url').value),
        origin: row.dataset.sourceOrigin === 'ai' ? 'ai' : row.dataset.sourceOrigin === 'recommended' ? 'recommended' : 'manual',
        recommendationKey: row.dataset.recommendationKey || '',
        sessionAdded: row.dataset.sourceSessionAdded === '1' || managerNewManualSourceIds.has(row.dataset.sourceId || '')
      })).filter((source) => source.name && source.url);
      const selectedRecommendations = [...managerSelectedRecommendationSources.values()]
        .map((source) => ({ ...source, url: cleanUrl(source.url) }))
        .filter((source) => source.name && source.url);
      const hasCurrentRecommendationSelection = selectedRecommendations.length > 0;

      // Explicit clicks in THIS editor session are authoritative. A stale source
      // row from an older AI-managed/polluted topic can never silently join them.
      const sourceMode = requestedSourceMode === 'hybrid'
        ? 'hybrid'
        : hasCurrentRecommendationSelection
          ? 'manual'
          : requestedSourceMode;

      const dedupeSourceList = (list) => {
        const seen = new Set();
        return list.filter((source) => {
          const key = cleanUrl(source.url).replace(/\/+$/, '').toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };

      let sources = [];
      if (sourceMode === 'hybrid') {
        // Hybrid deliberately combines automatic AI sources with user-selected
        // sources. Current explicit clicks are pinned alongside manual URL rows.
        sources = dedupeSourceList([
          ...rowSources.filter((source) => source.origin !== 'ai'),
          ...selectedRecommendations
        ]);
      } else if (sourceMode === 'manual' && hasCurrentRecommendationSelection) {
        // Critical invariant: if the reader clicked 1 or 2 recommendations, save
        // exactly those clicks plus genuinely hand-entered URL rows. Do not carry
        // old AI/recommended rows forward from a prior broken save.
        sources = dedupeSourceList([
          ...rowSources.filter((source) => source.origin === 'manual' && source.sessionAdded),
          ...selectedRecommendations
        ]);
      } else if (sourceMode === 'manual') {
        sources = dedupeSourceList(rowSources.filter((source) => source.origin !== 'ai'));
      }

      sources = sources.map(({ sessionAdded, ...source }) => source);

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
        sourceMode: sourceMode === 'ai' || sourceMode === 'hybrid' ? sourceMode : 'manual',
        aiSourcesUpdatedAt: sourceMode === 'manual' ? null : (existing?.aiSourcesUpdatedAt || null),
        selectedSourceUrls: sourceMode === 'manual'
          ? sources.map((source) => cleanUrl(source.url)).filter(Boolean)
          : [],
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

        record = {
          ...live,
          ...formValues,
          id: existing.id,

          // Removing a feed means removing that feed's old downloaded stories
          // from this topic as well. Otherwise stale articles can keep making a
          // deleted source look alive after the source itself is gone.
          articles: filterArticlesForSources(live.articles, sources)
        };

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

      // From this point forward, no cloud hydration that began before this save
      // may replace the local topic list. The revision is cleared only by a
      // successful serialized PUT of this state (or a newer one).
      markLocalTopicRevision();

      activeTopicId = record.id;
      activeSourceId = '';

      // Save means the form intentionally wins over any cloud snapshot received
      // while editing.
      leaveTopicManager({ applyDeferred: false });

      // Save the local view immediately, but do NOT start the old delayed cloud
      // write + server refresh race.
      saveLocalState();
      scheduleReaderNavigation();
      render({ force: true });

      // The database source list must be current before /refresh reads it.
      const cloudReady = await syncTopicConfigurationBeforeRefresh();

      // If the immediate DB sync failed, refresh directly from the source list
      // we just saved instead of asking the server to refresh stale sources.
      await refreshTopic({ forceLocal: cloudAuthenticated && !cloudReady });
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
    document.getElementById('topic-refresh')?.addEventListener('click', () => { void refreshTopic(); });
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
    // Save the user's intent BEFORE app.js changes the layout so the explicit
    // post-click synchronization cannot immediately undo a close/open choice.
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


  function currentReaderSourceType() {
    try {
      return String(window.MarkSetGoCurrentReaderDocument?.get?.()?.source?.type || '').toLowerCase();
    } catch {
      return '';
    }
  }

  function isCapturedArticleReaderActive() {
    return ['bookmarklet', 'website'].includes(currentReaderSourceType());
  }

  function isArticleHubReaderActive() {
    return isTopicFeedReaderActive() || isCapturedArticleReaderActive();
  }

  function capturedArticles() {
    try {
      const items = window.MarkSetGoReadAnything?.getCapturedArticles?.();
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }

  let topicBookPageGeometryTimer = 0;
  let topicBookDividerResizeObserver = null;
  let topicBookDividerFrame = null;

  function removeTopicBookDivider() {
    topicBookDividerResizeObserver?.disconnect?.();
    topicBookDividerResizeObserver = null;

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
      const contextKey = `${String(window.MSGTopicFeedReaderContext?.topicId || '')}:${String(window.MSGTopicFeedReaderContext?.articleId || '')}`;
      const signature = `${contextKey}:${readerWidth}:${paneWidth}`;

      // One sync per article + final geometry. The Reader DOM can be reused when
      // opening a different story, so width alone is not a safe cache key: a new
      // article opened from the topic manager could otherwise inherit the prior
      // article's "already synced" marker and leave its header at startup geometry.
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
        window.requestAnimationFrame(() => {
          // Re-anchor the permanent source/action header after the navigation
          // pane and Book Pages have reached their final geometry. Do this
          // explicitly rather than relying on a resize callback firing.
          keepTopicFeedArticleActionsInHeader();
          positionTopicFeedStoryHeader();
          ensureTopicBookDivider();
        });
      });
    };

    topicBookPageGeometryTimer = window.setTimeout(() => attempt(0), 70);
  }

  function applyTopicReaderPanePreference() {
    if (!isArticleHubReaderActive()) return;

    // A real user click always wins over automatic restoration. This prevents
    // explicit post-click synchronization from undoing the reader's choice.
    if (Date.now() < topicPaneUserIntentUntil) return;

    const layout = document.querySelector('#reader-layout');
    const toggle = document.querySelector('#toggle-navigation-pane');
    if (!layout || !toggle || applyingTopicReaderPanePreference) return;

    const shouldOpen = topicReaderPaneShouldBeOpen();
    const isOpen = !layout.classList.contains('navigation-hidden');

    if (shouldOpen === isOpen) {
      if (shouldOpen && isTopicFeedReaderActive()) scheduleTopicBookPageGeometrySync();
      return;
    }

    applyingTopicReaderPanePreference = true;
    try {
      // Let the Reader's own layout code perform the actual open/close.
      toggle.click();
    } finally {
      window.setTimeout(() => {
        applyingTopicReaderPanePreference = false;
        if (topicReaderPaneShouldBeOpen() && isTopicFeedReaderActive()) scheduleTopicBookPageGeometrySync();
      }, 0);
    }
  }

  function bindTopicReaderPanePreference() {
    const toggle = document.querySelector('#toggle-navigation-pane');
    const close = document.querySelector('#close-navigation-pane');

    if (toggle && toggle.dataset.topicFeedStickyBound !== '1') {
      toggle.dataset.topicFeedStickyBound = '1';

      // Capture phase is deliberate: persist the desired state before app.js's
      // own click handler changes the Reader layout.
      toggle.addEventListener('click', () => {
        if (applyingTopicReaderPanePreference || !isArticleHubReaderActive()) return;

        const layout = document.querySelector('#reader-layout');
        if (!layout) return;
        const currentlyOpen = !layout.classList.contains('navigation-hidden');
        markTopicPaneUserIntent(!currentlyOpen);
      }, true);
    }

    if (close && close.dataset.topicFeedStickyBound !== '1') {
      close.dataset.topicFeedStickyBound = '1';
      close.addEventListener('click', () => {
        if (applyingTopicReaderPanePreference || !isArticleHubReaderActive()) return;
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

  function ensureTopicReaderDeleteStyles() {
    if (document.getElementById('topic-reader-delete-styles')) return;
    const style = document.createElement('style');
    style.id = 'topic-reader-delete-styles';
    style.textContent = `
      #app .topic-reader-article-row { position:relative; min-width:0; }
      #app .topic-reader-article-row > .topic-reader-article { width:100%; padding-right:2rem !important; }
      #app .topic-reader-captured .topic-reader-article { display:grid; gap:.1rem; text-align:left; }
      #app .topic-reader-captured .topic-reader-article > small { font-size:.66rem; font-weight:500; opacity:.62; line-height:1.2; }
      #app .topic-reader-captured .topic-reader-article-row[aria-current="true"] > .topic-reader-article {
        background:rgba(201,137,0,.08); box-shadow:inset 2px 0 0 rgba(201,137,0,.55);
      }
      #app .topic-reader-article-delete {
        position:absolute; top:.22rem; right:.22rem; z-index:4; width:1.3rem; height:1.3rem; min-width:1.3rem;
        padding:0; border:0; border-radius:999px; display:grid; place-items:center;
        background:transparent; color:inherit; opacity:.46; font:700 .86rem/1 system-ui,sans-serif; cursor:pointer;
      }
      #app .topic-reader-article-delete:hover { opacity:1; background:rgba(160,45,45,.11); color:#9f2222; }
    `;
    document.head.appendChild(style);
  }

  function rebuildTopicReaderContents() {
    const view = document.querySelector('#navigation-pane [data-reader-view="contents"]');
    if (!view) return;
    const bookmark = view.querySelector('#add-bookmark');
    if (bookmark) bookmark.remove();
    view.querySelector('.topic-reader-nav')?.remove();
    delete view.dataset.topicReaderNavigationSignature;
    if (bookmark) view.appendChild(bookmark);
    scheduleReaderNavigation();
  }

  async function deleteTopicReaderArticle(topicId, articleId) {
    const topic = state.topics.find((item) => String(item.id) === String(topicId));
    if (!topic || !articleId) return;
    const id = String(articleId);
    topic.dismissedArticleIds = [...new Set([...(topic.dismissedArticleIds || []).map(String), id])].slice(-500);
    topic.articles = (topic.articles || []).filter((article) => String(article?.id || '') !== id);
    saveState({ cloud: false });
    rebuildTopicReaderContents();

    if (cloudAuthenticated) {
      try {
        const response = await fetch(`/api/topic-feeds/article/${encodeURIComponent(id)}?topicId=${encodeURIComponent(String(topic.id || ''))}`, {
          method:'DELETE', credentials:'same-origin'
        });
        if (!response.ok) throw new Error('Cloud delete failed.');
      } catch (error) {
        console.warn('Topic Feed article removal will sync on the next state save.', error);
        scheduleCloudSave();
      }
    } else {
      scheduleCloudSave();
    }
  }

  function readerTopicNavigationSignature() {
    // The Reader-side My Topics pane is long-lived. A newly created topic can
    // therefore change state.topics while the old navigation DOM is still
    // present. Build a lightweight structural signature so we refresh the pane
    // only when its actual topic/article contents changed, not on every UI pass.
    const captured = capturedArticles().map((article) => [
      String(article?.key || ''),
      String(article?.title || ''),
      String(article?.importedAt || '')
    ]);
    const topics = state.topics.map((topic) => [
      String(topic?.id || ''),
      String(topic?.name || ''),
      (topic?.sources || []).map((source) => [String(source?.id || ''), String(source?.name || '')]),
      (topic?.articles || []).map((article) => [
        String(article?.id || ''),
        String(article?.title || ''),
        String(article?.sourceClientId || '')
      ])
    ]);
    return JSON.stringify([captured, topics]);
  }

  function readerTopicListMarkup() {
    const captured = capturedArticles();
    const capturedActive = isCapturedArticleReaderActive();
    const currentCapturedKey = (() => {
      try {
        return String(window.MarkSetGoCurrentReaderDocument?.get?.()?.source?.readAnythingKey || '');
      } catch {
        return '';
      }
    })();

    const capturedMarkup = `<details class="topic-reader-group topic-reader-captured" ${capturedActive ? 'open' : ''}>
      <summary><strong>Captured Articles</strong><span>${captured.length}</span></summary>
      <div class="topic-reader-source" data-reader-captured-source>
        ${captured.length ? captured.map((article) => `<div class="topic-reader-article-row"
             ${String(article.key || '') === currentCapturedKey ? 'aria-current="true"' : ''}>
             <button type="button"
               class="topic-reader-article ${String(article.key || '') === currentCapturedKey ? 'is-read' : ''}"
               data-reader-captured-article="${escapeHtml(article.key || '')}">
               ${escapeHtml(article.title || 'Web Article')}
               <small>${escapeHtml(article.sourceName || 'Web article')}${article.importedAt ? ` · ${escapeHtml(new Date(article.importedAt).toLocaleDateString(undefined, { month:'short', day:'numeric' }))}` : ''}</small>
             </button>
             <button type="button" class="topic-reader-article-delete"
               data-reader-captured-delete="${escapeHtml(article.key || '')}"
               aria-label="Remove ${escapeHtml(article.title || 'article')} from Captured Articles"
               title="Remove from queue">×</button>
           </div>`).join('') : '<small>No captured articles yet.</small>'}
      </div>
    </details>`;

    return `<div class="topic-reader-nav">
      <div class="topic-reader-nav-head">
        <h2>My Topics</h2>
        <div class="topic-reader-nav-actions">
          <span data-reader-bookmark-slot></span>
          <button type="button" data-reader-refresh-topics ${loading ? 'disabled' : ''}>${loading ? 'Refreshing…' : 'Refresh'}</button>
          <button type="button" data-reader-manage-topics>Manage</button>
        </div>
      </div>
      ${capturedMarkup}
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
              ${articles.length ? articles.map((article, index) => `<div class="topic-reader-article-row"
                 ${index >= initialLimit ? 'hidden data-reader-topic-overflow="1"' : ''}>
                 <button type="button"
                   class="topic-reader-article ${article.read ? 'is-read' : ''}"
                   data-reader-topic-article="${escapeHtml(article.id)}"
                   data-reader-topic-parent="${escapeHtml(topic.id)}">
                   ${escapeHtml(article.title)}</button>
                 <button type="button" class="topic-reader-article-delete"
                   data-reader-topic-delete="${escapeHtml(article.id)}"
                   data-reader-topic-parent="${escapeHtml(topic.id)}"
                   aria-label="Remove ${escapeHtml(article.title)} from My Topics"
                   title="Remove from queue">×</button>
               </div>`).join('') : '<small>No downloaded articles yet.</small>'}
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
    if (!isArticleHubReaderActive()) return;
    ensureTopicReaderDeleteStyles();
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

    const navigationSignature = readerTopicNavigationSignature();
    const navigationIsStale = !view.querySelector('.topic-reader-nav')
      || view.dataset.topicReaderNavigationSignature !== navigationSignature;

    if (navigationIsStale) {
      // IMPORTANT: renderNavigationPane() has already bound the Reader's
      // #add-bookmark button to its native addBookmark() function. Keep that
      // exact DOM node before replacing Contents so bookmarks continue to use
      // the established Reader implementation.
      const nativeBookmarkButton = view.querySelector('#add-bookmark');

      view.innerHTML = readerTopicListMarkup();
      view.dataset.topicReaderNavigationSignature = navigationSignature;

      const bookmarkSlot = view.querySelector('[data-reader-bookmark-slot]');
      if (nativeBookmarkButton && bookmarkSlot) {
        nativeBookmarkButton.classList.add('topic-reader-bookmark-button');
        nativeBookmarkButton.textContent = '＋ Bookmark';
        nativeBookmarkButton.title = 'Bookmark the current reading position';
        bookmarkSlot.replaceChildren(nativeBookmarkButton);
      }
    }

    view.querySelector('[data-reader-refresh-topics]')?.addEventListener('click', () => {
      const readerTopicId = String(window.MSGTopicFeedReaderContext?.topicId || '');
      if (readerTopicId && state.topics.some((topic) => topic.id === readerTopicId)) {
        activeTopicId = readerTopicId;
      }
      void refreshTopic({ preserveReader: true });
    }, { once:true });

    view.querySelectorAll('[data-reader-captured-article]').forEach((button) => {
      if (button.dataset.bound === '1') return;
      button.dataset.bound = '1';
      button.addEventListener('click', async () => {
        try {
          await window.MarkSetGoReadAnything?.openCapturedArticle?.(button.dataset.readerCapturedArticle);
        } catch (error) {
          console.warn('Captured article could not be opened.', error);
        }
      });
    });

    view.querySelectorAll('[data-reader-captured-delete]').forEach((button) => {
      if (button.dataset.bound === '1') return;
      button.dataset.bound = '1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void window.MarkSetGoReadAnything?.deleteCapturedArticle?.(button.dataset.readerCapturedDelete);
      });
    });

    view.querySelector('[data-reader-manage-topics]')?.addEventListener('click', () => {
      render();
    }, { once:true });

    view.querySelectorAll('[data-reader-topic-delete]').forEach((button) => {
      if (button.dataset.bound === '1') return;
      button.dataset.bound = '1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void deleteTopicReaderArticle(button.dataset.readerTopicParent, button.dataset.readerTopicDelete);
      });
    });

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

    // My Topics is the shared navigation pane for Topic Feed and Captured
    // Articles. Only Topic Feed stories receive Topic Feed page geometry/header
    // treatment; captured articles keep their Read Anything chrome.
    window.setTimeout(applyTopicReaderPanePreference, 0);
    if (isTopicFeedReaderActive()) {
      scheduleTopicBookPageGeometrySync();
      window.setTimeout(ensureTopicBookDivider, 0);
      window.setTimeout(ensureTopicBookDivider, 160);
      window.setTimeout(ensureTopicBookDivider, 420);
      scheduleTopicReaderScrollRestore();
      decorateTopicFeedArticleFooter();
    } else {
      removeTopicBookDivider();
    }
  }

  function scheduleReaderNavigation() {
    cancelAnimationFrame(navFrame);
    navFrame = requestAnimationFrame(decorateReaderNavigation);
  }

  // Keep Topic Feed navigation/header geometry synchronized through explicit
  // app events and user interactions. Do not observe DOM mutations.
  const scheduleTopicFeedUiSync = () => {
    // Topic Setup is a transaction. Reader-side click/change synchronization
    // must stay completely dormant while the form is open.
    if (topicManagerIsOpen()) return;
    if (!isTopicFeedReaderActive()) return;
    window.setTimeout(() => {
      scheduleReaderNavigation();
      keepTopicFeedArticleActionsInHeader();
      positionTopicFeedStoryHeader();
      ensureTopicBookDivider();
    }, 0);
  };

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest?.('#app')) return;
    scheduleTopicFeedUiSync();
  }, true);

  document.addEventListener('change', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest?.('#app')) return;
    scheduleTopicFeedUiSync();
  }, true);

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    adoptSharedTopicState();
  });

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== 'msg-topic-feeds-state-changed') return;
    adoptSharedTopicState();
  });

  document.addEventListener('marksetgo:auth-changed', (event) => {
    if (event.detail?.authenticated) void hydrateCloudState();
    else cloudAuthenticated = false;
  });

  document.addEventListener('marksetgo:article-actions-updated', () => {
    if (!isTopicFeedReaderActive()) return;
    // Read Anything explicitly announces when it creates/rebuilds the row.
    // Re-home that same node without observing DOM mutations.
    [0, 40, 120].forEach((delay) => {
      window.setTimeout(() => {
        keepTopicFeedArticleActionsInHeader();
        positionTopicFeedStoryHeader();
      }, delay);
    });
  });

  document.addEventListener('marksetgo:document-available', () => {
    window.setTimeout(scheduleReaderNavigation, 40);
    if (!isTopicFeedReaderActive()) {
      activeTopicFeedHeaderContext = null;
      return;
    }
    // openDocument() can rebuild the Reader after the first source/header pass.
    // Re-attach Topic Feed provenance only while the current Reader source is
    // still a Topic Feed article. Each delayed callback rechecks that invariant.
    [40, 140, 360, 820, 1600].forEach((delay) => {
      window.setTimeout(() => {
        if (isTopicFeedReaderActive()) refreshActiveTopicFeedHeader();
      }, delay);
    });
  });

  document.addEventListener('marksetgo:article-queue-updated', () => {
    if (!isArticleHubReaderActive()) return;
    rebuildTopicReaderContents();
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

  // Rewrite any legacy oversized Topic Feed local cache using the bounded
  // metadata format even before the next manual refresh.
  window.setTimeout(() => { saveLocalState(); }, 250);

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

  function refreshReaderArticleChrome() {
    if (!isTopicFeedReaderActive() || !activeTopicFeedHeaderContext) return false;
    refreshActiveTopicFeedHeader();
    scheduleTopicFeedImportRecovery(activeTopicFeedHeaderContext.payload || {});
    scheduleReaderNavigation();
    return true;
  }

  window.MarkSetGoTopicFeeds = Object.freeze({
    render,
    refresh: refreshTopic,
    hydrate: hydrateCloudState,
    state: () => state,
    refreshReaderNavigation: () => {
      if (isArticleHubReaderActive()) scheduleReaderNavigation();
    },
    clearReaderArticleContext,
    openPreparedArticle,
    receiveWorkspaceArticleContext,
    refreshReaderArticleChrome,
    syncSharedState: adoptSharedTopicState
  });
})();