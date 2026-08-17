(() => {
  'use strict';

  const CONTROL_MAP = Object.freeze({
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

  const state = {
    authenticated: false,
    preferences: {},
    appliedReader: null,
    applying: false,
    saveTimer: null
  };

  function cloudApi() {
    return window.MarkSetGoCloud || null;
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

  function captureReadingDefaults() {
    const readingDefaults = {};
    Object.entries(CONTROL_MAP).forEach(([selector, [key, type]]) => {
      const element = document.querySelector(selector);
      if (!element) return;
      readingDefaults[key] = readControl(element, type);
    });
    return readingDefaults;
  }

  function emit(status, detail = {}) {
    document.dispatchEvent(new CustomEvent('marksetgo:preferences-sync', {
      detail: { status, ...detail }
    }));
  }

  async function saveReadingDefaults() {
    const api = cloudApi();
    if (!state.authenticated || !api?.preferences?.save) return;

    const readingDefaults = captureReadingDefaults();
    state.preferences = {
      ...state.preferences,
      readingDefaults
    };

    emit('saving');
    try {
      const result = await api.preferences.save(state.preferences);
      const saved = result?.preferences || state.preferences;
      state.preferences = saved;
      emit('saved', { preferences: saved, updatedAt: result?.updatedAt || null });
    } catch (error) {
      emit('error', { error: error?.message || 'Preferences could not be saved.' });
      console.error('Cloud preference save failed:', error);
    }
  }

  function scheduleSave() {
    if (state.applying || !state.authenticated) return;
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(saveReadingDefaults, 450);
  }

  function applyReadingDefaults() {
    const reader = document.querySelector('#reader');
    const defaults = state.preferences?.readingDefaults;
    if (!reader || !defaults || typeof defaults !== 'object') return;
    if (state.appliedReader === reader) return;

    state.applying = true;
    try {
      Object.entries(CONTROL_MAP).forEach(([selector, [key, type]]) => {
        if (!(key in defaults)) return;
        const element = document.querySelector(selector);
        if (!element) return;
        const before = readControl(element, type);
        const next = defaults[key];
        if (String(before) === String(next)) return;
        writeControl(element, next, type);
        element.dispatchEvent(new Event('change', { bubbles: true }));
      });
      state.appliedReader = reader;
      emit('applied', { preferences: defaults });
    } finally {
      state.applying = false;
    }
  }

  function acceptBootstrap(payload) {
    state.authenticated = true;
    state.preferences = payload?.preferences && typeof payload.preferences === 'object'
      ? payload.preferences
      : {};
    queueMicrotask(applyReadingDefaults);
  }

  document.addEventListener('marksetgo:cloud-ready', (event) => {
    acceptBootstrap(event.detail || {});
  });

  document.addEventListener('marksetgo:auth-changed', (event) => {
    state.authenticated = Boolean(event.detail?.authenticated);
    if (!state.authenticated) {
      state.preferences = {};
      state.appliedReader = null;
      window.clearTimeout(state.saveTimer);
    }
  });

  document.addEventListener('change', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !Object.hasOwn(CONTROL_MAP, `#${target.id}`)) return;
    scheduleSave();
  });

  document.addEventListener('input', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !Object.hasOwn(CONTROL_MAP, `#${target.id}`)) return;
    scheduleSave();
  });

  const scheduleReaderDefaultsApply = () => {
    [0, 60, 180, 420].forEach((delay) => window.setTimeout(applyReadingDefaults, delay));
  };
  document.addEventListener('marksetgo:document-available', scheduleReaderDefaultsApply);
  window.addEventListener('pageshow', scheduleReaderDefaultsApply);

  // Handle the case where authentication/bootstrap completed before this adapter loaded.
  queueMicrotask(() => {
    const api = cloudApi();
    const bootstrap = api?.state?.bootstrap;
    if (bootstrap) acceptBootstrap(bootstrap);
  });

  window.MarkSetGoCloudPreferences = Object.freeze({
    capture: captureReadingDefaults,
    apply: applyReadingDefaults,
    save: saveReadingDefaults
  });
})();
