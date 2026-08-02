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

  const READING_PROGRESS_KEY = 'markSetGoReadingProgressV1';

  function parseJsonObject(value) {
    try {
      const parsed = JSON.parse(String(value ?? ''));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function timestamp(value) {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function mergeProgressRecord(localRecord, cloudRecord) {
    const local = localRecord && typeof localRecord === 'object' ? localRecord : {};
    const cloud = cloudRecord && typeof cloudRecord === 'object' ? cloudRecord : {};
    const localTime = timestamp(local.lastReadAt);
    const cloudTime = timestamp(cloud.lastReadAt);
    const newest = localTime >= cloudTime ? local : cloud;
    const older = newest === local ? cloud : local;

    const localLastWord = Math.max(0, finiteNumber(local.lastWord));
    const cloudLastWord = Math.max(0, finiteNumber(cloud.lastWord));
    let lastWord = finiteNumber(newest.lastWord);

    // A zero resume point is frequently produced during startup before the
    // document has been restored. Do not let that transient value erase a
    // valid checkpoint from the other copy. An explicit reset can later be
    // represented by a dedicated reset marker rather than an ambiguous zero.
    if (lastWord <= 0) {
      lastWord = newest === local ? cloudLastWord : localLastWord;
    }

    return {
      ...older,
      ...newest,
      documentId: newest.documentId || older.documentId,
      lastWord: Math.max(0, finiteNumber(lastWord)),
      furthestWord: Math.max(
        finiteNumber(local.furthestWord),
        finiteNumber(cloud.furthestWord),
        finiteNumber(lastWord)
      ),
      totalSeconds: Math.max(finiteNumber(local.totalSeconds), finiteNumber(cloud.totalSeconds)),
      totalWordsRead: Math.max(finiteNumber(local.totalWordsRead), finiteNumber(cloud.totalWordsRead)),
      sessions: Math.max(finiteNumber(local.sessions), finiteNumber(cloud.sessions)),
      lastReadAt: localTime >= cloudTime
        ? (local.lastReadAt || cloud.lastReadAt)
        : (cloud.lastReadAt || local.lastReadAt)
    };
  }

  function mergeReadingProgress(localValue, cloudValue) {
    const local = parseJsonObject(localValue);
    const cloud = parseJsonObject(cloudValue);
    const merged = {};
    const documentIds = new Set([...Object.keys(cloud), ...Object.keys(local)]);

    documentIds.forEach((documentId) => {
      if (!(documentId in local)) {
        merged[documentId] = cloud[documentId];
      } else if (!(documentId in cloud)) {
        merged[documentId] = local[documentId];
      } else {
        merged[documentId] = mergeProgressRecord(local[documentId], cloud[documentId]);
      }
    });

    return JSON.stringify(merged);
  }

  function resolveEntry(key, localValue, cloudValue) {
    if (key === READING_PROGRESS_KEY && localValue != null && cloudValue != null) {
      return mergeReadingProgress(localValue, cloudValue);
    }
    return cloudValue != null ? String(cloudValue) : String(localValue ?? '');
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
    const resolved = {};
    const updatesForCloud = {};
    const keys = new Set([...Object.keys(cloud), ...Object.keys(local)]);

    keys.forEach((key) => {
      if (!isManagedKey(key)) return;
      const value = resolveEntry(key, local[key], cloud[key]);
      resolved[key] = value;
      if (!(key in cloud) || String(cloud[key] ?? '') !== value) {
        updatesForCloud[key] = value;
      }
    });

    state.applying = true;
    try {
      Object.entries(resolved).forEach(([key, value]) => {
        nativeSetItem.call(localStorage, key, value);
      });
    } finally {
      state.applying = false;
    }

    if (Object.keys(updatesForCloud).length) {
      await request('/api/account/state', {
        method: 'PUT',
        body: JSON.stringify({ entries: updatesForCloud })
      });
    }

    state.ready = true;
    document.dispatchEvent(new CustomEvent('marksetgo:state-ready', {
      detail: { cloudKeys: Object.keys(cloud).length, migratedKeys: Object.keys(updatesForCloud).length }
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
