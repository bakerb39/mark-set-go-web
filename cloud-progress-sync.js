(() => {
  'use strict';

  const KEY = 'markSetGoReadingProgressV1';
  const DEBOUNCE_MS = 20000;
  const state = { authenticated: false, applying: false, timer: null, signatures: new Map(), pending: new Set() };
  const nativeSetItem = Storage.prototype.setItem;

  function records() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }

  function bookFor(documentId) {
    return window.MarkSetGoCloudLibrary?.list?.().find((book) => String(book.clientRecordId) === String(documentId)) || null;
  }

  function normalizeProgress(item = {}) {
    const wordIndex = Math.max(0, Number(item.lastWord ?? item.wordIndex ?? item.furthestWord) || 0);
    return {
      mode: String(item.mode || ''),
      wordIndex,
      playbackIndex: wordIndex,
      viewportAnchorIndex: Math.max(0, Number(item.viewportAnchorIndex ?? wordIndex) || wordIndex),
      viewportOffsetPx: Number(item.viewportOffsetPx) || 0,
      scrollRatio: Math.max(0, Math.min(1, Number(item.scrollRatio ?? item.progress) || 0)),
      pageNumber: item.pageNumber == null ? null : Math.max(1, Number(item.pageNumber) || 1),
      positionData: { documentId: item.documentId || '', title: item.title || '', updatedAt: item.updatedAt || new Date().toISOString() }
    };
  }

  function detectChanges() {
    if (state.applying) return;
    const all = records();
    for (const [id, item] of Object.entries(all)) {
      const signature = JSON.stringify([item?.lastWord, item?.furthestWord, item?.mode, item?.pageNumber, item?.updatedAt]);
      if (state.signatures.get(id) === signature) continue;
      state.signatures.set(id, signature);
      state.pending.add(id);
    }
    schedule();
  }

  Storage.prototype.setItem = function progressAwareSetItem(key, value) {
    nativeSetItem.call(this, key, value);
    if (this === localStorage && String(key) === KEY) detectChanges();
  };

  function schedule(delay = DEBOUNCE_MS) {
    if (!state.authenticated || !state.pending.size) return;
    clearTimeout(state.timer);
    state.timer = setTimeout(() => void flush(), delay);
  }

  async function flush() {
    clearTimeout(state.timer);
    if (!state.authenticated || !navigator.onLine || !state.pending.size) return;
    const all = records();
    for (const id of [...state.pending]) {
      const book = bookFor(id);
      const item = all[id];
      if (!book?.id || !item) continue;
      try {
        await window.MarkSetGoCloud.library.saveProgress(book.id, normalizeProgress({ ...item, documentId: id }));
        state.pending.delete(id);
      } catch (error) {
        console.warn('Reading progress cloud save failed.', error);
      }
    }
    document.dispatchEvent(new CustomEvent('marksetgo:progress-synced', { detail: { pending: state.pending.size } }));
    if (state.pending.size) schedule(30000);
  }

  function applyCloudBooks(books) {
    const all = records();
    let changed = false;
    state.applying = true;
    try {
      for (const raw of Array.isArray(books) ? books : []) {
        const id = raw.client_record_id || raw.clientRecordId;
        const remoteIndex = Number(raw.playback_index ?? raw.playbackIndex ?? raw.word_index ?? raw.wordIndex);
        if (!id || !Number.isFinite(remoteIndex)) continue;
        const remoteTime = Date.parse(raw.progress_updated_at || raw.progressUpdatedAt || raw.updated_at || raw.updatedAt || 0) || 0;
        const localTime = Date.parse(all[id]?.updatedAt || 0) || 0;
        const localIndex = Number(all[id]?.lastWord ?? all[id]?.furthestWord) || 0;
        if (remoteTime < localTime || (remoteTime === localTime && remoteIndex <= localIndex)) continue;
        all[id] = {
          ...(all[id] || {}),
          documentId: id,
          title: raw.title || all[id]?.title || 'Untitled',
          lastWord: Math.max(0, remoteIndex),
          furthestWord: Math.max(Number(all[id]?.furthestWord) || 0, remoteIndex),
          mode: raw.mode || all[id]?.mode || '',
          pageNumber: raw.page_number ?? raw.pageNumber ?? all[id]?.pageNumber,
          updatedAt: new Date(remoteTime || Date.now()).toISOString()
        };
        changed = true;
      }
      if (changed) nativeSetItem.call(localStorage, KEY, JSON.stringify(all));
    } finally { state.applying = false; }
    detectChanges();
  }

  document.addEventListener('marksetgo:auth-changed', (event) => { state.authenticated = Boolean(event.detail?.authenticated); });
  document.addEventListener('marksetgo:cloud-ready', (event) => {
    state.authenticated = true;
    applyCloudBooks(event.detail?.library || []);
  });
  document.addEventListener('marksetgo:cloud-library-ready', (event) => applyCloudBooks(event.detail?.books || []));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(); });
  window.addEventListener('online', () => schedule(100));
  window.addEventListener('pagehide', () => void flush());
  queueMicrotask(detectChanges);

  window.MarkSetGoProgressSync = Object.freeze({ flush, get state() { return { ...state, pending: [...state.pending] }; } });
})();
