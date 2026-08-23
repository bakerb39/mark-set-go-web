(() => {
  'use strict';

  const state = {
    authenticated: false,
    bootstrap: null,
    status: 'idle',
    lastError: null
  };

  function emit(status, detail = {}) {
    state.status = status;
    if (detail.error) state.lastError = detail.error;
    document.dispatchEvent(new CustomEvent('marksetgo:cloud-status', {
      detail: { status, ...detail }
    }));
  }

  async function request(path, options = {}) {
    emit(options.method && options.method !== 'GET' ? 'saving' : 'loading', { path });
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `Request failed with HTTP ${response.status}.`);
      error.status = response.status;
      emit('error', { path, error: error.message });
      throw error;
    }
    emit('saved', { path, updatedAt: new Date().toISOString() });
    return payload;
  }

  const api = {
    get state() { return { ...state }; },
    async bootstrap() {
      const payload = await request('/api/account/bootstrap');
      state.bootstrap = payload;
      return payload;
    },
    preferences: {
      load: () => request('/api/account/preferences'),
      save: (preferences) => request('/api/account/preferences', {
        method: 'PUT', body: JSON.stringify({ preferences })
      })
    },
    library: {
      list: () => request('/api/account/library'),
      save: (book) => request('/api/account/library', {
        method: 'POST', body: JSON.stringify(book)
      }),
      remove: (bookId) => request(`/api/account/library/${encodeURIComponent(bookId)}`, {
        method: 'DELETE'
      }),
      loadProgress: (bookId) => request(`/api/account/library/${encodeURIComponent(bookId)}/progress`),
      saveProgress: (bookId, progress) => request(`/api/account/library/${encodeURIComponent(bookId)}/progress`, {
        method: 'PUT', body: JSON.stringify(progress)
      }),
      documentInfo: (bookId) => request(`/api/account/library/${encodeURIComponent(bookId)}/document/info`),
      loadDocument: (bookId) => request(`/api/account/library/${encodeURIComponent(bookId)}/document`),
      saveDocument: (bookId, text) => request(`/api/account/library/${encodeURIComponent(bookId)}/document`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: String(text || '')
      }),
      removeDocument: (bookId) => request(`/api/account/library/${encodeURIComponent(bookId)}/document`, { method: 'DELETE' })
    },
    symposium: {
      list: (includeArchived = false) => request(`/api/account/symposiums${includeArchived ? '?includeArchived=1' : ''}`),
      load: (sessionId) => request(`/api/account/symposiums/${encodeURIComponent(sessionId)}`),
      create: (session) => request('/api/account/symposiums', {
        method: 'POST', body: JSON.stringify(session || {})
      }),
      update: (sessionId, changes) => request(`/api/account/symposiums/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH', body: JSON.stringify(changes || {})
      }),
      addTurn: (sessionId, turn) => request(`/api/account/symposiums/${encodeURIComponent(sessionId)}/turns`, {
        method: 'POST', body: JSON.stringify(turn || {})
      }),
      remove: (sessionId) => request(`/api/account/symposiums/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE'
      })
    }
  };

  window.MarkSetGoCloud = api;

  document.addEventListener('marksetgo:auth-changed', async (event) => {
    state.authenticated = Boolean(event.detail?.authenticated);
    if (!state.authenticated) {
      state.bootstrap = null;
      emit('idle');
      return;
    }
    try {
      await api.bootstrap();
      document.dispatchEvent(new CustomEvent('marksetgo:cloud-ready', { detail: state.bootstrap }));
    } catch (error) {
      console.error('Cloud account bootstrap failed:', error);
    }
  });
})();
