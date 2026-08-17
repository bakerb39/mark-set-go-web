(() => {
  'use strict';

  const STORAGE_KEY = 'msg_companion_persona_v2';
  const LEGACY_KEY = 'msg_companion_persona_v1';

  const CHAD = Object.freeze({
    id: 'chad',
    name: 'Chad',
    ask: 'Ask Chad',
    notebook: 'Chad’s Notebook',
    avatar: '/assets/companions/chad/chad-avatar.png'
  });

  const SCOTT = Object.freeze({
    id: 'scott',
    name: 'Scott',
    ask: 'Ask Scott',
    notebook: 'Scott’s Notebook',
    avatar: '/assets/companions/scott/scott-avatar.png?v=20260817'
  });

  function selected() {
    const live = window.MSGCompanion?.id;
    if (['mark', 'beth', 'chad', 'scott'].includes(live)) return live;
    try {
      const value = String(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY) || 'mark').toLowerCase();
      return ['mark', 'beth', 'chad', 'scott'].includes(value) ? value : 'mark';
    } catch {
      return 'mark';
    }
  }

  // Keep the established server request bridge, but do NOT own profile state or
  // rewrite Reader UI. companion-persona-safe.js is now the single UI/state owner.
  function installFetchBridge() {
    if (window.__MSG_COMPANION_FETCH_WRAPPED__) return;

    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function companionAwareFetch(input, init = {}) {
      let url = '';
      try { url = typeof input === 'string' ? input : input?.url || ''; } catch {}

      const shouldInject = [
        '/api/mark-selection',
        '/api/read-anything/investor-analysis',
        '/api/app-help'
      ].some((path) => url.includes(path));

      if (shouldInject && typeof init?.body === 'string') {
        const headers = new Headers(init.headers || {});
        const contentType = headers.get('Content-Type') || headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          try {
            const body = JSON.parse(init.body);
            body.companion = selected();
            init = { ...init, body: JSON.stringify(body) };
          } catch {}
        }
      }

      return nativeFetch(input, init);
    };

    window.__MSG_COMPANION_FETCH_WRAPPED__ = true;
  }

  function select(id) {
    if (window.MSGCompanion?.set) return window.MSGCompanion.set(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
      localStorage.setItem(LEGACY_KEY, id);
    } catch {}
    return true;
  }

  installFetchBridge();

  window.MSGChad = Object.freeze({
    config: CHAD,
    selected: () => selected() === 'chad',
    select: () => select('chad'),
    apply: () => window.MSGCompanion?.apply?.()
  });

  window.MSGScott = Object.freeze({
    config: SCOTT,
    selected: () => selected() === 'scott',
    select: () => select('scott'),
    apply: () => window.MSGCompanion?.apply?.()
  });
})();
