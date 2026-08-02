(() => {
  'use strict';

  const KEY_PREFIXES = ['markSetGo', 'msg-'];
  const DEVICE_ONLY_KEYS = new Set([
    'markSetGoEmailClientIdV1',
    'markSetGoPendingLibrarySearch'
  ]);
  const state = {
    authenticated: false,
    ready: false,
    applying: false,
    queue: new Map(),
    timer: null
  };

  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;

  function isManagedKey(key) {
    const value = String(key || '');
    return !DEVICE_ONLY_KEYS.has(value) && KEY_PREFIXES.some((prefix) => value.startsWith(prefix));
  }

  function localEntries() {
    const entries = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!isManagedKey(key)) continue;
      entries[key] = localStorage.getItem(key) ?? '';
    }
    return entries;
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed with HTTP ${response.status}.`);
    return payload;
  }

  async function flush() {
    if (!state.authenticated || state.applying || !state.queue.size) return;
    const entries = Object.fromEntries(state.queue);
    state.queue.clear();
    try {
      await request('/api/account/state', {
        method: 'PUT',
        body: JSON.stringify({ entries })
      });
      document.dispatchEvent(new CustomEvent('marksetgo:state-sync', {
        detail: { status: 'saved', keys: Object.keys(entries) }
      }));
    } catch (error) {
      Object.entries(entries).forEach(([key, value]) => state.queue.set(key, value));
      document.dispatchEvent(new CustomEvent('marksetgo:state-sync', {
        detail: { status: 'error', error: error.message }
      }));
      console.error('Cloud state save failed:', error);
    }
  }

  function scheduleFlush(key, value) {
    if (!state.authenticated || state.applying || !isManagedKey(key)) return;
    state.queue.set(String(key), String(value ?? ''));
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(flush, 500);
  }

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    nativeSetItem.call(this, key, value);
    if (this === localStorage) scheduleFlush(key, value);
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key) {
    nativeRemoveItem.call(this, key);
    if (this !== localStorage || !state.authenticated || state.applying || !isManagedKey(key)) return;
    request(`/api/account/state/${encodeURIComponent(String(key))}`, { method: 'DELETE' })
      .catch((error) => console.error('Cloud state delete failed:', error));
  };

  async function synchronize(payload = {}) {
    if (!state.authenticated) return;
    const cloud = payload.appState && typeof payload.appState === 'object'
      ? payload.appState
      : (await request('/api/account/state')).state || {};
    const local = localEntries();
    const missingFromCloud = {};

    Object.entries(local).forEach(([key, value]) => {
      if (!(key in cloud)) missingFromCloud[key] = value;
    });

    state.applying = true;
    try {
      Object.entries(cloud).forEach(([key, value]) => {
        if (isManagedKey(key)) nativeSetItem.call(localStorage, key, String(value ?? ''));
      });
    } finally {
      state.applying = false;
    }

    if (Object.keys(missingFromCloud).length) {
      await request('/api/account/state', {
        method: 'PUT',
        body: JSON.stringify({ entries: missingFromCloud })
      });
    }

    state.ready = true;
    document.dispatchEvent(new CustomEvent('marksetgo:state-ready', {
      detail: { cloudKeys: Object.keys(cloud).length, migratedKeys: Object.keys(missingFromCloud).length }
    }));

    // A one-time refresh lets the existing synchronous reader code initialize
    // from the newly hydrated cache without invasive reader changes.
    const reloadKey = 'markSetGoCloudStateHydrated';
    if (Object.keys(cloud).length && sessionStorage.getItem(reloadKey) !== '1') {
      sessionStorage.setItem(reloadKey, '1');
      location.reload();
    }
  }

  document.addEventListener('marksetgo:cloud-ready', (event) => {
    state.authenticated = true;
    synchronize(event.detail || {}).catch((error) => {
      console.error('Cloud state synchronization failed:', error);
      document.dispatchEvent(new CustomEvent('marksetgo:state-sync', {
        detail: { status: 'error', error: error.message }
      }));
    });
  });

  document.addEventListener('marksetgo:auth-changed', (event) => {
    state.authenticated = Boolean(event.detail?.authenticated);
    if (!state.authenticated) {
      state.ready = false;
      state.queue.clear();
      window.clearTimeout(state.timer);
      sessionStorage.removeItem('markSetGoCloudStateHydrated');
    }
  });

  window.addEventListener('pagehide', () => {
    if (!state.queue.size || !state.authenticated) return;
    const entries = Object.fromEntries(state.queue);
    state.queue.clear();
    fetch('/api/account/state', {
      method: 'PUT',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries })
    }).catch(() => {});
  });

  window.MarkSetGoCloudState = Object.freeze({
    get ready() { return state.ready; },
    flush,
    localEntries
  });
})();
