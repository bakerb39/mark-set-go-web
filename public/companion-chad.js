(() => {
  'use strict';

  const STORAGE_KEY = 'msg_companion_persona_v2';
  const LEGACY_KEY = 'msg_companion_persona_v1';

  const CHAD = Object.freeze({
    id: 'chad',
    name: 'Chad',
    ask: 'Ask Chad',
    avatar: '/assets/companions/chad/chad-avatar.png',
    specialty: 'Financial analysis, investing, markets, business, and economics'
  });

  function selectedId() {
    const live = window.MSGCompanion?.config?.id;
    if (['mark', 'beth', 'chad'].includes(live)) return live;

    try {
      const stored = String(
        localStorage.getItem(STORAGE_KEY) ||
        localStorage.getItem(LEGACY_KEY) ||
        'mark'
      ).toLowerCase();
      return ['mark', 'beth', 'chad'].includes(stored) ? stored : 'mark';
    } catch {
      return 'mark';
    }
  }

  function installFetchBridge() {
    if (window.__MSG_CHAD_FETCH_WRAPPED__) return;

    const nativeFetch = window.fetch.bind(window);

    window.fetch = async function companionAwareFetch(input, init = {}) {
      let url = '';
      try {
        url = typeof input === 'string' ? input : input?.url || '';
      } catch {}

      const shouldInject = [
        '/api/mark-selection',
        '/api/read-anything/investor-analysis',
        '/api/read-anything/article-followup',
        '/api/app-help'
      ].some((path) => url.includes(path));

      if (shouldInject && typeof init?.body === 'string') {
        const headers = new Headers(init.headers || {});
        const contentType = headers.get('Content-Type') || '';

        if (contentType.includes('application/json')) {
          try {
            const body = JSON.parse(init.body);
            body.companion = selectedId();
            init = { ...init, body: JSON.stringify(body) };
          } catch {}
        }
      }

      return nativeFetch(input, init);
    };

    window.__MSG_CHAD_FETCH_WRAPPED__ = true;
  }

  installFetchBridge();

  // Chad no longer creates, clones, or falls back to a second profile selector.
  // companion-persona-safe.js is now the single owner of Mark/Beth/Chad.
  window.MSGChad = Object.freeze({
    config: CHAD,
    selected: () => selectedId() === 'chad',
    select() {
      window.MSGCompanion?.set?.('chad');
    },
    apply() {
      window.MSGCompanion?.apply?.();
      window.MSGCompanionCopySync?.apply?.();
    }
  });
})();
