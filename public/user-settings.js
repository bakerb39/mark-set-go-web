(() => {
  'use strict';

  const STORAGE_KEY = 'markSetGoUserSettingsV1';
  const VERSION = 1;
  const CLOUD_FIELD = 'appSettings';

  const READER_CONTROLS = Object.freeze({
    '#mode-select': ['mode', 'value'],
    '#speed': ['wpm', 'number'],
    '#word-count': ['wordCount', 'number'],
    '#meaningful-chunks': ['meaningfulChunks', 'checked'],
    '#pointer-style': ['pointerStyle', 'value'],
    '#pointer-color': ['pointerColor', 'value'],
    '#focus-anchor': ['focusAnchor', 'checked'],
    '#focus-anchor-font-size': ['focusAnchorFontSize', 'number'],
    '#focus-anchor-color': ['focusAnchorColor', 'value'],
    '#focus-anchor-bold': ['focusAnchorBold', 'checked'],
    '#font-family': ['fontFamily', 'value'],
    '#font-size': ['fontSize', 'number'],
    '#theme-select': ['theme', 'value'],
    '#bionic-reading': ['bionic', 'checked'],
    '#book-pages': ['bookPages', 'checked'],
    '#illustration-mode': ['illustrationMode', 'value']
  });

  const PORTABLE_LOCAL_KEYS = Object.freeze([
    'markSetGoBrowseLayoutV1',
    'markSetGoListViewPreferencesV1',
    'markSetGoPushTrainingV1',
    'markSetGoStudyLanguageV1',
    'markSetGoActionNotificationSettingsV1',
    'markSetGoEmailPreferencesV1',
    'msg-topic-feeds-left-pane-open',
    'msg_companion_persona_v2',
    'msg_companion_persona_v1',
    'markSetGoMusic',
    'markSetGoVideoSidePanelWidthV1',
    'markSetGoMediaDockModeV1',
    'msg-workspace-layout-mode-v1'
  ]);

  const SETTINGS_EVENT_SELECTOR = [
    ...Object.keys(READER_CONTROLS),
    '[data-profile-feature]',
    '[data-profile-preset]',
    '[data-profile-appearance]',
    '[data-vd-background-mode]',
    '[data-vd-background-source]',
    '[data-vd-background-url]',
    '[data-vd-background-fit]',
    '[data-vd-background-color]',
    '[data-vd-ui-scale]',
    '[data-crypto-ticker-toggle]',
    '[data-market-indexes-toggle]'
  ].join(',');

  const state = {
    authenticated: false,
    syncEnabled: true,
    canonicalPreferences: {},
    saveTimer: 0,
    applying: false,
    cloudSaveOwner: false,
    cloudSaveWrapped: false,
    originalCloudSave: null,
    initialized: false
  };

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch { return value; }
  }

  function parseIso(value) {
    const time = Date.parse(String(value || ''));
    return Number.isFinite(time) ? time : 0;
  }

  function readEnvelope() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeEnvelope(snapshot) {
    const previous = readEnvelope() || {};
    const envelope = {
      version: VERSION,
      syncEnabled: previous.syncEnabled !== false && state.syncEnabled !== false,
      snapshot,
      updatedAt: new Date().toISOString()
    };
    state.syncEnabled = envelope.syncEnabled;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    return envelope;
  }

  function setEnvelopeSyncEnabled(enabled) {
    state.syncEnabled = Boolean(enabled);
    const current = readEnvelope() || {};
    const envelope = {
      version: VERSION,
      syncEnabled: state.syncEnabled,
      snapshot: current.snapshot || null,
      updatedAt: current.updatedAt || new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    return envelope;
  }

  function emit(status, detail = {}) {
    document.dispatchEvent(new CustomEvent('marksetgo:user-settings-status', {
      detail: { status, ...detail }
    }));
  }

  function readControl(element, type) {
    if (type === 'checked') return Boolean(element.checked);
    if (type === 'number') return Number(element.value);
    return element.value;
  }

  function writeControl(element, value, type) {
    if (type === 'checked') element.checked = Boolean(value);
    else if (type === 'number') element.value = String(Number(value));
    else element.value = String(value);
  }

  function captureReaderDefaults() {
    try {
      const existing = window.MarkSetGoCloudPreferences?.capture?.();
      if (existing && typeof existing === 'object' && Object.keys(existing).length) return clone(existing);
    } catch {}

    const direct = {};
    Object.entries(READER_CONTROLS).forEach(([selector, [key, type]]) => {
      const element = document.querySelector(selector);
      if (element) direct[key] = readControl(element, type);
    });
    if (Object.keys(direct).length) return direct;

    const cloud = state.canonicalPreferences?.readingDefaults;
    if (cloud && typeof cloud === 'object' && Object.keys(cloud).length) return clone(cloud);

    const local = readEnvelope()?.snapshot?.readerDefaults;
    return local && typeof local === 'object' ? clone(local) : {};
  }

  function capturePortableLocalSettings() {
    const values = {};
    for (const key of PORTABLE_LOCAL_KEYS) {
      try {
        const value = localStorage.getItem(key);
        if (value !== null && value.length <= 100000) values[key] = value;
      } catch {}
    }
    return values;
  }

  function captureProfile() {
    try {
      const profile = window.MarkSetGoExperienceProfile?.get?.();
      return profile && typeof profile === 'object' ? clone(profile) : null;
    } catch {
      return null;
    }
  }

  function captureDesigner() {
    try {
      const designer = window.MarkSetGoVisualDesigner || window.MarkSetGoExplorerVisualDesigner;
      const value = designer?.getConfig?.();
      return value && typeof value === 'object' ? clone(value) : null;
    } catch {
      return null;
    }
  }

  function captureDisplayOptions() {
    const host = (() => {
      try {
        if (window.parent && window.parent !== window && window.parent.document) return window.parent;
      } catch {}
      return window;
    })();

    const enabled = (apiName, storageKey) => {
      try {
        const api = host?.[apiName] || window?.[apiName];
        if (typeof api?.enabled === 'function') return Boolean(api.enabled());
      } catch {}
      try {
        const stored = host.localStorage?.getItem(storageKey) ?? localStorage.getItem(storageKey);
        return stored === '1';
      } catch {
        return false;
      }
    };

    return {
      cryptoTicker: enabled('MarkSetGoCryptoTicker', 'markSetGoCryptoTickerEnabledV1'),
      marketIndexes: enabled('MarkSetGoMarketIndexes', 'markSetGoMarketIndexesEnabledV1')
    };
  }

  function captureSnapshot() {
    return {
      version: VERSION,
      savedAt: new Date().toISOString(),
      profile: captureProfile(),
      designer: captureDesigner(),
      readerDefaults: captureReaderDefaults(),
      displayOptions: captureDisplayOptions(),
      localSettings: capturePortableLocalSettings()
    };
  }

  function sanitizeSnapshot(value) {
    const raw = value?.snapshot && typeof value.snapshot === 'object' ? value.snapshot : value;
    if (!raw || typeof raw !== 'object') throw new Error('This is not a Mark, Set, Go! settings file.');

    const localSettings = {};
    if (raw.localSettings && typeof raw.localSettings === 'object') {
      for (const key of PORTABLE_LOCAL_KEYS) {
        if (!(key in raw.localSettings)) continue;
        const text = String(raw.localSettings[key] ?? '');
        if (text.length <= 100000) localSettings[key] = text;
      }
    }

    const readerDefaults = {};
    if (raw.readerDefaults && typeof raw.readerDefaults === 'object') {
      const allowed = new Set(Object.values(READER_CONTROLS).map(([key]) => key));
      for (const [key, setting] of Object.entries(raw.readerDefaults)) {
        if (allowed.has(key)) readerDefaults[key] = setting;
      }
    }

    return {
      version: VERSION,
      savedAt: String(raw.savedAt || new Date().toISOString()),
      profile: raw.profile && typeof raw.profile === 'object' ? clone(raw.profile) : null,
      designer: raw.designer && typeof raw.designer === 'object' ? clone(raw.designer) : null,
      readerDefaults,
      displayOptions:{
        cryptoTicker:Boolean(raw.displayOptions?.cryptoTicker),
        marketIndexes:Boolean(raw.displayOptions?.marketIndexes)
      },
      localSettings
    };
  }

  function applyPortableLocalSettings(values = {}) {
    for (const key of PORTABLE_LOCAL_KEYS) {
      try {
        if (Object.hasOwn(values, key)) localStorage.setItem(key, String(values[key]));
      } catch (error) {
        console.warn(`Setting ${key} could not be restored.`, error);
      }
    }
  }

  function applyReaderDefaults(defaults = {}) {
    let applied = 0;
    state.applying = true;
    try {
      Object.entries(READER_CONTROLS).forEach(([selector, [key, type]]) => {
        if (!(key in defaults)) return;
        const element = document.querySelector(selector);
        if (!element) return;
        const before = readControl(element, type);
        const next = defaults[key];
        if (String(before) !== String(next)) {
          writeControl(element, next, type);
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
        applied += 1;
      });
    } finally {
      state.applying = false;
    }
    return applied;
  }

  function applyReaderDefaultsWithBoundedRetry(defaults = {}) {
    const total = Object.keys(defaults || {}).length;
    if (!total) return;
    let attempts = 0;
    const tryApply = () => {
      attempts += 1;
      const count = applyReaderDefaults(defaults);
      if (count >= total || attempts >= 12) return;
      window.setTimeout(tryApply, attempts < 4 ? 100 : 250);
    };
    tryApply();
  }

  async function applySnapshot(value, { persistLocal = true } = {}) {
    const snapshot = sanitizeSnapshot(value);
    state.applying = true;
    try {
      applyPortableLocalSettings(snapshot.localSettings);

      const applyDisplayOption = (apiName, storageKey, enabled) => {
        const host = (() => {
          try {
            if (window.parent && window.parent !== window && window.parent.document) return window.parent;
          } catch {}
          return window;
        })();

        try {
          const api = host?.[apiName] || window?.[apiName];
          if (typeof api?.setEnabled === 'function') {
            api.setEnabled(Boolean(enabled));
            return;
          }
        } catch {}

        try {
          host.localStorage?.setItem(storageKey, enabled ? '1' : '0');
          if (host !== window) localStorage.setItem(storageKey, enabled ? '1' : '0');
        } catch {}
      };

      if (snapshot.displayOptions) {
        applyDisplayOption(
          'MarkSetGoCryptoTicker',
          'markSetGoCryptoTickerEnabledV1',
          snapshot.displayOptions.cryptoTicker
        );
        applyDisplayOption(
          'MarkSetGoMarketIndexes',
          'markSetGoMarketIndexesEnabledV1',
          snapshot.displayOptions.marketIndexes
        );
      }

      if (snapshot.profile) {
        try {
          window.MarkSetGoExperienceProfile?.save?.(snapshot.profile);
          window.MarkSetGoExperienceProfile?.apply?.(snapshot.profile);
        } catch (error) {
          console.warn('Experience settings could not be restored.', error);
        }
      }

      if (snapshot.designer) {
        try {
          const designer = window.MarkSetGoVisualDesigner || window.MarkSetGoExplorerVisualDesigner;
          designer?.applyConfig?.(snapshot.designer, { persist:true });
        } catch (error) {
          console.warn('Visual Designer settings could not be restored.', error);
        }
      }

      applyReaderDefaultsWithBoundedRetry(snapshot.readerDefaults);
      if (persistLocal) writeEnvelope(snapshot);

      document.dispatchEvent(new CustomEvent('marksetgo:user-settings-applied', {
        detail: { snapshot: clone(snapshot) }
      }));
    } finally {
      state.applying = false;
    }
    return snapshot;
  }

  function installCloudMergeGuard() {
    if (state.cloudSaveWrapped) return true;
    const preferences = window.MarkSetGoCloud?.preferences;
    if (!preferences || typeof preferences.save !== 'function') return false;

    const original = preferences.save.bind(preferences);
    state.originalCloudSave = original;

    preferences.save = async (incoming = {}) => {
      const supplied = incoming && typeof incoming === 'object' ? incoming : {};
      const safeIncoming = { ...supplied };
      if (!state.cloudSaveOwner) delete safeIncoming[CLOUD_FIELD];

      const merged = {
        ...(state.canonicalPreferences || {}),
        ...safeIncoming
      };

      const result = await original(merged);
      state.canonicalPreferences = clone(result?.preferences || merged);
      return result;
    };

    state.cloudSaveWrapped = true;
    return true;
  }

  async function saveSnapshotToCloud(snapshot) {
    if (!state.authenticated || state.syncEnabled === false) return false;
    if (!installCloudMergeGuard()) return false;

    const preferences = window.MarkSetGoCloud?.preferences;
    if (!preferences?.save) return false;

    const merged = {
      ...(state.canonicalPreferences || {}),
      readingDefaults: clone(snapshot.readerDefaults || {}),
      [CLOUD_FIELD]: clone(snapshot)
    };

    state.cloudSaveOwner = true;
    emit('saving-cloud');
    try {
      const result = await preferences.save(merged);
      state.canonicalPreferences = clone(result?.preferences || merged);
      emit('saved-cloud', { updatedAt: result?.updatedAt || snapshot.savedAt });
      return true;
    } finally {
      state.cloudSaveOwner = false;
    }
  }

  async function saveCurrent({ reason = 'manual' } = {}) {
    const snapshot = sanitizeSnapshot(captureSnapshot());
    writeEnvelope(snapshot);
    const cloudSaved = await saveSnapshotToCloud(snapshot).catch((error) => {
      console.warn('Unified settings cloud save failed.', error);
      emit('cloud-error', { error: error?.message || String(error) });
      return false;
    });
    emit('saved', { reason, cloudSaved, snapshot: clone(snapshot) });
    return { snapshot, cloudSaved };
  }

  function scheduleSave(reason = 'automatic') {
    if (state.applying) return;
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => {
      void saveCurrent({ reason });
    }, 700);
  }

  function cloudSnapshot() {
    const value = state.canonicalPreferences?.[CLOUD_FIELD];
    if (!value || typeof value !== 'object') return null;
    try { return sanitizeSnapshot(value); }
    catch { return null; }
  }

  function localSnapshot() {
    const value = readEnvelope()?.snapshot;
    if (!value) return null;
    try { return sanitizeSnapshot(value); }
    catch { return null; }
  }

  async function restore({ preferCloud = true } = {}) {
    let source = 'local';
    let snapshot = localSnapshot();
    const cloud = cloudSnapshot();
    if (preferCloud && cloud) {
      source = 'cloud';
      snapshot = cloud;
    }
    if (!snapshot) throw new Error('No saved settings are available yet.');
    await applySnapshot(snapshot, { persistLocal:true });
    emit('restored', { source });
    return { source, snapshot };
  }

  async function reconcileAfterCloudReady() {
    if (state.syncEnabled === false) return;
    const cloud = cloudSnapshot();
    const local = localSnapshot();

    if (cloud && (!local || parseIso(cloud.savedAt) > parseIso(local.savedAt))) {
      await applySnapshot(cloud, { persistLocal:true });
      emit('restored-cloud-newer');
      return;
    }

    if (local && (!cloud || parseIso(local.savedAt) > parseIso(cloud.savedAt))) {
      await saveSnapshotToCloud(local);
      emit('uploaded-local-newer');
    }
  }

  async function setSyncEnabled(enabled) {
    setEnvelopeSyncEnabled(Boolean(enabled));
    if (state.syncEnabled && state.authenticated) {
      await saveCurrent({ reason:'sync-enabled' });
    }
    emit('sync-changed', { enabled:state.syncEnabled });
    return state.syncEnabled;
  }

  function exportSettings() {
    const snapshot = sanitizeSnapshot(captureSnapshot());
    writeEnvelope(snapshot);
    const payload = {
      product:'Mark, Set, Go!',
      kind:'settings',
      version:VERSION,
      exportedAt:new Date().toISOString(),
      snapshot
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mark-set-go-settings-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return payload;
  }

  async function importFile(file, { apply = true, save = true } = {}) {
    if (!(file instanceof Blob)) throw new Error('Choose a JSON settings file.');
    if (file.size > 2 * 1024 * 1024) throw new Error('The settings file is unexpectedly large.');
    const text = await file.text();
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { throw new Error('The settings file is not valid JSON.'); }

    if (parsed?.kind && parsed.kind !== 'settings') {
      throw new Error('That JSON file is not a Mark, Set, Go! settings export.');
    }

    const snapshot = sanitizeSnapshot(parsed);
    if (apply) await applySnapshot(snapshot, { persistLocal:true });
    if (save) await saveSnapshotToCloud(snapshot).catch(() => false);
    emit('imported');
    return snapshot;
  }

  async function reset({ sync = true } = {}) {
    state.applying = true;
    try {
      for (const key of PORTABLE_LOCAL_KEYS) {
        try { localStorage.removeItem(key); } catch {}
      }
      try { localStorage.removeItem('markSetGoExperienceProfileV1'); } catch {}
      try { localStorage.removeItem(STORAGE_KEY); } catch {}

      try {
        await (window.MarkSetGoVisualDesigner || window.MarkSetGoExplorerVisualDesigner)?.reset?.();
      } catch {}

      const profileApi = window.MarkSetGoExperienceProfile;
      try {
        const defaultPreset = profileApi?.presets?.simple
          ? { preset:'simple', appearance:'default', features:{...profileApi.presets.simple.features} }
          : { preset:'custom', appearance:'default', features:{} };
        profileApi?.save?.(defaultPreset);
        profileApi?.apply?.(defaultPreset);
      } catch {}

      const empty = {
        version:VERSION,
        savedAt:new Date().toISOString(),
        profile:captureProfile(),
        designer:captureDesigner(),
        readerDefaults:{},
        displayOptions:{cryptoTicker:false,marketIndexes:false},
        localSettings:{}
      };
      writeEnvelope(empty);

      if (sync && state.authenticated && state.syncEnabled !== false && installCloudMergeGuard()) {
        state.cloudSaveOwner = true;
        try {
          const preferences = {
            ...(state.canonicalPreferences || {}),
            readingDefaults:{},
            [CLOUD_FIELD]:clone(empty)
          };
          const result = await window.MarkSetGoCloud.preferences.save(preferences);
          state.canonicalPreferences = clone(result?.preferences || preferences);
        } finally {
          state.cloudSaveOwner = false;
        }
      }
    } finally {
      state.applying = false;
    }
    emit('reset');
    return true;
  }

  function status() {
    const local = localSnapshot();
    const cloud = cloudSnapshot();
    return {
      authenticated:Boolean(state.authenticated),
      syncEnabled:state.syncEnabled !== false,
      hasLocalSettings:Boolean(local),
      hasCloudSettings:Boolean(cloud),
      localSavedAt:local?.savedAt || '',
      cloudSavedAt:cloud?.savedAt || ''
    };
  }

  function acceptCloudReady(payload = {}) {
    state.authenticated = true;
    state.canonicalPreferences = clone(
      payload?.preferences && typeof payload.preferences === 'object'
        ? payload.preferences
        : {}
    );
    installCloudMergeGuard();
    void reconcileAfterCloudReady().catch((error) => {
      console.warn('Unified settings reconciliation failed.', error);
    });
    emit('cloud-ready');
  }

  function bindAutomaticCapture() {
    document.addEventListener('marksetgo:experience-profile-changed', () => scheduleSave('appearance'));
    document.addEventListener('marksetgo:visual-designer-saved', () => scheduleSave('visual-designer'));

    document.addEventListener('change', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.matches?.(SETTINGS_EVENT_SELECTOR)) return;
      scheduleSave('control-change');
    });

    document.addEventListener('input', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.matches?.(SETTINGS_EVENT_SELECTOR)) return;
      scheduleSave('control-input');
    });

    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element
        ? event.target.closest('[data-companion],[data-companion-persona],[data-topic-pane-toggle]')
        : null;
      if (target) scheduleSave('app-choice');
    });

    document.addEventListener('marksetgo:reader-session-changed', () => {
      const snapshot = localSnapshot();
      if (snapshot?.readerDefaults) applyReaderDefaultsWithBoundedRetry(snapshot.readerDefaults);
    });

    window.addEventListener('pagehide', () => {
      if (!state.applying) {
        try { writeEnvelope(sanitizeSnapshot(captureSnapshot())); } catch {}
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && !state.applying) {
        try { writeEnvelope(sanitizeSnapshot(captureSnapshot())); } catch {}
      }
    });
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;

    const envelope = readEnvelope();
    state.syncEnabled = envelope?.syncEnabled !== false;

    installCloudMergeGuard();
    bindAutomaticCapture();

    document.addEventListener('marksetgo:cloud-ready', (event) => {
      acceptCloudReady(event.detail || {});
    });

    document.addEventListener('marksetgo:auth-changed', (event) => {
      state.authenticated = Boolean(event.detail?.authenticated);
      if (!state.authenticated) {
        state.canonicalPreferences = {};
        emit('signed-out');
      }
    });

    const bootstrap = window.MarkSetGoCloud?.state?.bootstrap;
    if (bootstrap) acceptCloudReady(bootstrap);

    const local = localSnapshot();
    if (local) {
      void applySnapshot(local, { persistLocal:false }).catch((error) => {
        console.warn('Local unified settings could not be restored.', error);
      });
    }

    emit('ready');
  }

  window.MarkSetGoUserSettings = Object.freeze({
    capture:captureSnapshot,
    saveCurrent,
    restore,
    apply:applySnapshot,
    export:exportSettings,
    importFile,
    reset,
    setSyncEnabled,
    status
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();
