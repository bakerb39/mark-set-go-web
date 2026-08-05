(() => {
  'use strict';

  const VERSION = 1;
  const MANIFEST_KEY = 'markSetGoCloudSyncManifestV1';
  const DEBOUNCE_MS = 20000;
  const MAX_VALUE_BYTES = 350000;
  const encoder = new TextEncoder();

  // Account-worthy state only. Documents and reading positions have dedicated APIs.
  const CLOUD_KEYS = new Set([
    'markSetGoReadingActivityV1',
    'markSetGoAnnualReadingGoalV1',
    'markSetGoComprehensionV1',
    'markSetGoDefinitionsV1',
    'markSetGoNotesV1',
    'markSetGoReadingListV1',
    'markSetGoBookmarksV1',
    'markSetGoSyntopiconSavedV1',
    'markSetGoActionsV1',
    'markSetGoActionNotificationSettingsV1',
    'markSetGoMyLinksV1',
    'markSetGoBookMusicV1',
    'markSetGoPreferredMusic'
  ]);

  const state = {
    authenticated: false,
    applying: false,
    dirty: new Set(),
    timer: null,
    saving: false,
    retryDelay: 2000,
    lastSyncedAt: null,
    lastError: null
  };

  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch { return fallback; }
  }

  function manifest() {
    const value = readJson(MANIFEST_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function writeManifest(value) {
    nativeSetItem.call(localStorage, MANIFEST_KEY, JSON.stringify(value));
  }

  function markChanged(key, removed = false) {
    if (state.applying || !CLOUD_KEYS.has(key)) return;
    const next = manifest();
    next[key] = { updatedAt: new Date().toISOString(), removed: Boolean(removed) };
    writeManifest(next);
    state.dirty.add(key);
    schedule();
    emit('pending');
  }

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    nativeSetItem.call(this, key, value);
    if (this === localStorage) markChanged(String(key), false);
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key) {
    nativeRemoveItem.call(this, key);
    if (this === localStorage) markChanged(String(key), true);
  };

  function emit(status, detail = {}) {
    document.dispatchEvent(new CustomEvent('marksetgo:sync-foundation', {
      detail: { status, lastSyncedAt: state.lastSyncedAt, ...detail }
    }));
  }

  function schedule(delay = DEBOUNCE_MS) {
    if (!state.authenticated) return;
    clearTimeout(state.timer);
    state.timer = setTimeout(() => void flush(), delay);
  }

  function localRecord(key) {
    const meta = manifest()[key] || {};
    const value = localStorage.getItem(key);
    return {
      value: value == null ? null : value,
      updatedAt: meta.updatedAt || new Date(0).toISOString(),
      removed: value == null || Boolean(meta.removed)
    };
  }

  function validRecord(record) {
    return record && typeof record === 'object' && typeof record.updatedAt === 'string';
  }

  function cloudAppState(preferences) {
    const appState = preferences?.appState;
    return appState && typeof appState === 'object' && !Array.isArray(appState) ? appState : {};
  }

  function applyCloud(preferences) {
    const remote = cloudAppState(preferences);
    const localMeta = manifest();
    let manifestChanged = false;
    state.applying = true;
    try {
      for (const key of CLOUD_KEYS) {
        const cloud = remote[key];
        if (!validRecord(cloud)) continue;
        const localTime = Date.parse(localMeta[key]?.updatedAt || 0) || 0;
        const cloudTime = Date.parse(cloud.updatedAt) || 0;
        if (cloudTime <= localTime) continue;
        if (cloud.removed || cloud.value == null) nativeRemoveItem.call(localStorage, key);
        else nativeSetItem.call(localStorage, key, String(cloud.value));
        localMeta[key] = { updatedAt: cloud.updatedAt, removed: Boolean(cloud.removed) };
        manifestChanged = true;
      }
    } finally {
      state.applying = false;
    }
    if (manifestChanged) writeManifest(localMeta);
    document.dispatchEvent(new CustomEvent('marksetgo:cloud-state-applied'));
  }

  async function flush() {
    clearTimeout(state.timer);
    if (!state.authenticated || state.saving || !state.dirty.size) return;
    if (!navigator.onLine) {
      emit('offline');
      schedule(30000);
      return;
    }
    const api = window.MarkSetGoCloud;
    if (!api?.preferences?.save) return;
    state.saving = true;
    emit('saving');
    const keys = [...state.dirty];
    try {
      const current = api.state?.bootstrap?.preferences || {};
      const appState = { ...cloudAppState(current) };
      for (const key of keys) {
        const record = localRecord(key);
        if (record.value != null && encoder.encode(record.value).byteLength > MAX_VALUE_BYTES) {
          console.warn(`Cloud state skipped oversized value: ${key}`);
          state.dirty.delete(key);
          continue;
        }
        const existingTime = Date.parse(appState[key]?.updatedAt || 0) || 0;
        const localTime = Date.parse(record.updatedAt) || 0;
        if (localTime >= existingTime) appState[key] = record;
      }
      const payload = await api.preferences.save({ ...current, syncVersion: VERSION, appState });
      if (api.state?.bootstrap) api.state.bootstrap.preferences = payload?.preferences || { ...current, appState };
      keys.forEach((key) => state.dirty.delete(key));
      state.lastSyncedAt = payload?.updatedAt || new Date().toISOString();
      state.lastError = null;
      state.retryDelay = 2000;
      emit('saved');
    } catch (error) {
      state.lastError = error;
      emit('error', { error: error?.message || 'Account sync failed.' });
      clearTimeout(state.timer);
      state.timer = setTimeout(() => void flush(), state.retryDelay);
      state.retryDelay = Math.min(state.retryDelay * 2, 60000);
    } finally {
      state.saving = false;
    }
  }

  function acceptBootstrap(payload) {
    state.authenticated = true;
    applyCloud(payload?.preferences || {});
    const localMeta = manifest();
    for (const key of CLOUD_KEYS) {
      if (localStorage.getItem(key) != null && !localMeta[key]) {
        localMeta[key] = { updatedAt: new Date().toISOString(), removed: false };
        state.dirty.add(key);
      }
    }
    writeManifest(localMeta);
    schedule(1200);
  }

  document.addEventListener('marksetgo:cloud-ready', (event) => acceptBootstrap(event.detail || {}));
  document.addEventListener('marksetgo:auth-changed', (event) => {
    state.authenticated = Boolean(event.detail?.authenticated);
    if (!state.authenticated) clearTimeout(state.timer);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  window.addEventListener('online', () => schedule(100));
  window.addEventListener('pagehide', () => void flush());

  queueMicrotask(() => {
    const bootstrap = window.MarkSetGoCloud?.state?.bootstrap;
    if (bootstrap) acceptBootstrap(bootstrap);
  });

  window.MarkSetGoSync = Object.freeze({
    flush,
    get state() { return { ...state, dirty: [...state.dirty] }; },
    cloudKeys: () => [...CLOUD_KEYS]
  });
})();
