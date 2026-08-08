'use strict';

/*
 * Mark, Set, Go! core bootstrap.
 *
 * v7.2.0 begins a staged modular refactor. Shared state, routing, the primary
 * reader renderer, imports, library features, and application initialization
 * remain here. Independent feature blocks now live under /modules.
 */
const REQUIRED_FEATURE_FUNCTIONS = [
  'startDigitalSignReader',
  'startPacmanReader',
  'renderHelp',
  'renderAbout',
  'renderContact',
  'renderPrivacy',
  'renderTerms'
];

const missingFeatureFunctions = REQUIRED_FEATURE_FUNCTIONS.filter(
  (name) => typeof window[name] !== 'function'
);

if (missingFeatureFunctions.length) {
  throw new Error(
    `Feature modules failed to load: ${missingFeatureFunctions.join(', ')}`
  );
}

const app = document.querySelector('#app');
app.dataset.viewKey = 'home';


const { BookModel, SessionManager, ReaderEngine, VirtualRenderer } = window.MarkSetGoReader || {};
if (!BookModel || !SessionManager || !ReaderEngine || !VirtualRenderer) {
  throw new Error('Reader Engine modules failed to load.');
}

const readerSessionManager = new SessionManager();
const readerEngine = new ReaderEngine();
const state = readerEngine.state;

// Public, read-only bridge for companion features that need the exact document
// currently loaded in the reader without reaching into protected reader modules.
window.MarkSetGoCurrentReaderDocument = Object.freeze({
  get: () => {
    if (!state?.documentId || !state?.currentText) return null;
    return {
      documentId: String(state.documentId),
      title: String(state.title || 'Untitled'),
      text: String(state.currentText || ''),
      source: { ...(state.source || {}) }
    };
  },

  // Resolve the active Ask Mark selection by the Reader's canonical word indexes,
  // then translate those indexes into exact character offsets in currentText.
  // This avoids fragile string matching when rendered whitespace/OCR differs.
  getSelectionRange: () => {
    const selection = state?.markSelection || state?.markPersistentSelection;
    const text = String(state?.currentText || '');
    if (!selection || !text) return null;

    const startIndex = Math.max(0, Number(selection.startIndex) || 0);
    const endIndex = Math.max(startIndex + 1, Number(selection.endIndex) || startIndex + 1);
    const tokens = Array.from(text.matchAll(/\S+/g));
    if (!tokens.length || startIndex >= tokens.length) return null;

    const safeEndIndex = Math.min(tokens.length, endIndex);
    const first = tokens[startIndex];
    const last = tokens[safeEndIndex - 1];
    if (!first || !last || !Number.isFinite(first.index) || !Number.isFinite(last.index)) return null;

    const charStart = first.index;
    const charEnd = last.index + last[0].length;

    return {
      documentId: String(state.documentId || ''),
      startIndex,
      endIndex: safeEndIndex,
      charStart,
      charEnd,
      text: text.slice(charStart, charEnd)
    };
  }
});
const virtualRenderer = new VirtualRenderer({
  getState: () => state,
  setWordContent: (element, word, index) => setWordContent(element, word, index),
  savedDefinitionAt: (index) => savedDefinitionAt(index),
  noteAt: (index) => noteAt(index),
  refreshReadingGroups: (mode, groupSize) => refreshReadingGroups(mode, groupSize),
  scheduleIllustrationsForRange: (reader, start, end, mode) => scheduleIllustrationsForRange(reader, start, end, mode),
  updateBookPageStatus: () => updateBookPageStatus()
});

// v9.2.42 Large-text virtual-window continuity guard.
// After a distant TOC jump the unrendered book is represented by large spacer
// elements. Watch the real rendered-text boundaries and shift the window before
// the viewport can enter one of those spacers. This integration guard leaves
// VirtualRenderer.js itself untouched.
const virtualSpacerGuardState = new WeakMap();

function bindVirtualSpacerGuard(reader) {
  if (!reader || virtualSpacerGuardState.has(reader)) return;

  const guard = { frame: 0, shifting: false, lastShiftAt: 0 };

  const check = () => {
    guard.frame = 0;
    if (guard.shifting || !state.virtualized || state.bookPages || !state.words.length) return;

    const topSpacer = reader.querySelector('.virtual-reader-spacer-top');
    const bottomSpacer = reader.querySelector('.virtual-reader-spacer-bottom');
    if (!topSpacer || !bottomSpacer) return;

    const readerRect = reader.getBoundingClientRect();
    const topRect = topSpacer.getBoundingClientRect();
    const bottomRect = bottomSpacer.getBoundingClientRect();
    const renderedStart = Math.max(0, Number(state.renderedWordStart) || 0);
    const renderedEnd = Math.min(state.words.length, Number(state.renderedWordEnd) || 0);
    if (renderedEnd <= renderedStart) return;

    // Start moving the virtual window before blank spacer is visible.
    const threshold = Math.max(900, reader.clientHeight * 1.75);
    const nearBottom = renderedEnd < state.words.length
      && bottomRect.top <= readerRect.bottom + threshold;
    const nearTop = renderedStart > 0
      && topRect.bottom >= readerRect.top - threshold;

    if (!nearBottom && !nearTop) return;
    if (performance.now() - guard.lastShiftAt < 90) return;

    const mode = state.renderedMode || getSelectedMode();
    if (['flash','digital-sign','two-column','auto-scroll'].includes(mode)) return;

    const groupSize = Math.max(1, Number(app.querySelector('#word-count')?.value) || 1);
    const anchor = virtualRenderer.visibleReadingAnchor(reader, state.viewportAnchorIndex ?? state.index);
    const windowSize = Math.max(1600, renderedEnd - renderedStart);
    const shift = Math.max(500, Math.min(900, Math.round(windowSize / 3)));

    let nextStart = renderedStart;
    if (nearBottom) nextStart = Math.min(
      Math.max(0, state.words.length - windowSize),
      renderedStart + shift
    );
    else if (nearTop) nextStart = Math.max(0, renderedStart - shift);

    const nextEnd = Math.min(state.words.length, nextStart + windowSize);
    if (nextStart === renderedStart && nextEnd === renderedEnd) return;

    guard.shifting = true;
    guard.lastShiftAt = performance.now();

    // renderVirtualRange can move the window while restoring the same visible
    // logical word, so scrolling continues naturally rather than jumping.
    virtualRenderer.renderVirtualRange(
      reader,
      mode,
      groupSize,
      nextStart,
      nextEnd,
      anchor
    );

    state.viewportAnchorIndex = anchor;

    requestAnimationFrame(() => requestAnimationFrame(() => {
      guard.shifting = false;
    }));
  };

  const schedule = () => {
    if (guard.frame) return;
    guard.frame = requestAnimationFrame(check);
  };

  reader.addEventListener('scroll', schedule, { passive: true });
  reader.addEventListener('wheel', schedule, { passive: true });
  virtualSpacerGuardState.set(reader, { guard, schedule });

  // A TOC jump/restored anchor may already be close to a boundary.
  requestAnimationFrame(schedule);
}
let readerSessionSaveTimer = null;
let readerReturnCheckpointTimer = null;
const READER_SESSION_META_KEY = 'markSetGoReaderSessionMetaV1';
// The top Reader button must return only to a reader explicitly opened during
// this browser/app session. Persistent IndexedDB is reserved for Home > Resume.
let activeReaderSnapshot = null;

function clearActiveReaderPane() {
  stopReader();
  activeReaderSnapshot = null;
  try { readerEngine.reset?.(); } catch {}
  state.title = '';
  state.currentText = '';
  state.originalText = '';
  state.words = [];
  state.index = 0;
  state.viewportAnchorIndex = 0;
  state.documentId = '';
  state.source = null;
}


const APP_VIEW_STATE_KEY = 'markSetGoViewStateV1';

const ReaderContinuity = {
  transitionId: 0,
  protectedControlSelector: [
    '#mode-select', '#fs-mode-select',
    '#word-count', '#fs-word-count',
    '#meaningful-chunks', '#fs-meaningful-chunks',
    '#focus-anchor', '#fs-focus-anchor',
    '#focus-anchor-font-size', '#fs-focus-anchor-font-size',
    '#focus-anchor-color', '#fs-focus-anchor-color',
    '#focus-anchor-bold', '#fs-focus-anchor-bold',
    '#font-family', '#fs-font-family',
    '#font-size', '#fs-font-size',
    '#theme-select', '#fs-theme-select',
    '#bionic-reading', '#fs-bionic-reading',
    '#book-pages', '#fs-book-pages',
    '#illustration-mode', '#fs-illustration-mode',
    '#pointer-style', '#fs-pointer-style',
    '#pointer-color', '#fs-pointer-color'
  ].join(', '),

  hasActiveReader() {
    return Boolean(state?.title && state?.words?.length && app.querySelector('#reader'));
  },

  capture() {
    if (!this.hasActiveReader()) return null;
    const location = captureReaderLocation();
    const snapshot = buildReaderSessionSnapshot();
    if (!snapshot) return null;
    // Keep the playback cursor independent from the viewport anchor.
    snapshot.index = location.cursorIndex;
    snapshot.playbackIndex = location.cursorIndex;
    snapshot.viewportAnchorIndex = location.anchorIndex;
    snapshot.wasRunning = location.wasRunning;
    snapshot.controls = { ...(snapshot.controls || {}), ...captureReaderControls() };
    snapshot.viewport = captureReaderViewport(location.anchorIndex);
    return snapshot;
  },

  commit(snapshot, { immediate = true } = {}) {
    if (!snapshot?.title || !snapshot?.currentText) return;
    activeReaderSnapshot = {
      ...snapshot,
      index: Math.max(0, Number(snapshot.index) || 0),
      controls: { ...(snapshot.controls || {}) }
    };
    state.returnIndex = activeReaderSnapshot.index;
    state.returnMode = activeReaderSnapshot.controls.mode || state.renderedMode || 'highlight';
    state.returnWasRunning = Boolean(activeReaderSnapshot.wasRunning);
    state.returnControls = { ...activeReaderSnapshot.controls };

    if (!immediate) {
      persistReaderSession();
      return;
    }

    try {
      const totalWords = state.words?.length || splitWords(snapshot.currentText || '').length;
      const documentId = snapshot.documentId || state.documentId || '';
      const savedAt = new Date().toISOString();
      localStorage.setItem(READER_SESSION_META_KEY, JSON.stringify({
        documentId,
        title: snapshot.title || state.title || 'Untitled',
        index: activeReaderSnapshot.index,
        totalWords,
        savedAt
      }));

      // Keep the My Library resume record synchronized with the live reader
      // checkpoint. Previously this record was updated only after a timed
      // reading session ended, so manual scrolling or clicking could leave
      // lastWord at 0 and Resume Reading reopened the document at the top.
      if (documentId) {
        const progress = readStoredObject(READING_PROGRESS_KEY);
        const existing = progress[documentId] || {};
        progress[documentId] = {
          ...existing,
          documentId,
          title: snapshot.title || state.title || existing.title || 'Untitled',
          totalWords,
          furthestWord: Math.max(Number(existing.furthestWord) || 0, activeReaderSnapshot.index),
          lastWord: activeReaderSnapshot.index,
          lastReadAt: savedAt,
          source: (snapshot.source || state.source)?.type === 'modern-guide'
            ? {
                type:'modern-guide',
                id:(snapshot.source || state.source)?.id || '',
                originalTitle:(snapshot.source || state.source)?.originalTitle || '',
                originalAuthor:(snapshot.source || state.source)?.originalAuthor || '',
                customGuide:Boolean((snapshot.source || state.source)?.customGuide),
                buyUrl:(snapshot.source || state.source)?.buyUrl || '',
                guideInteractions:(snapshot.source || state.source)?.guideInteractions || null
              }
            : snapshot.source || state.source || existing.source
        };
        localStorage.setItem(READING_PROGRESS_KEY, JSON.stringify(progress));
      }
    } catch {}
    writeReaderSession(activeReaderSnapshot);
  },

  scheduleCheckpoint({ immediate = false } = {}) {
    if (!this.hasActiveReader()) return;
    if (readerReturnCheckpointTimer) clearTimeout(readerReturnCheckpointTimer);
    const save = () => {
      readerReturnCheckpointTimer = null;
      const snapshot = this.capture();
      if (snapshot) this.commit(snapshot, { immediate: true });
    };
    if (immediate) save();
    else readerReturnCheckpointTimer = window.setTimeout(save, 180);
  },

  saveBeforeNavigation() {
    if (readerReturnCheckpointTimer) {
      clearTimeout(readerReturnCheckpointTimer);
      readerReturnCheckpointTimer = null;
    }
    const snapshot = this.capture();
    if (snapshot) this.commit(snapshot, { immediate: true });
    return snapshot;
  }
};

function readAppViewState() {
  try { return JSON.parse(localStorage.getItem(APP_VIEW_STATE_KEY) || '{}') || {}; }
  catch { return {}; }
}

function writeAppViewState(value) {
  try { localStorage.setItem(APP_VIEW_STATE_KEY, JSON.stringify(value || {})); } catch {}
}

function currentViewKey() {
  return app.dataset.viewKey || 'home';
}

function captureCurrentViewPosition() {
  const key = currentViewKey();
  const stateMap = readAppViewState();
  const scrollContainers = {};

  app.querySelectorAll('[data-preserve-scroll], .panel, .platform-page, .reader-side-panel').forEach((element, index) => {
    if (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) {
      const id = element.id || element.dataset.preserveScroll || `${element.className}:${index}`;
      scrollContainers[id] = { top: element.scrollTop, left: element.scrollLeft };
    }
  });

  stateMap[key] = {
    windowY: window.scrollY,
    windowX: window.scrollX,
    scrollContainers,
    savedAt: Date.now()
  };
  writeAppViewState(stateMap);
}

function restoreViewPosition(key) {
  app.dataset.viewKey = key || 'home';
  const saved = readAppViewState()[app.dataset.viewKey];
  if (!saved) {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    return;
  }

  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.scrollTo({
      top: Number(saved.windowY) || 0,
      left: Number(saved.windowX) || 0,
      behavior: 'auto'
    });

    const entries = saved.scrollContainers || {};
    app.querySelectorAll('[data-preserve-scroll], .panel, .platform-page, .reader-side-panel').forEach((element, index) => {
      const id = element.id || element.dataset.preserveScroll || `${element.className}:${index}`;
      const position = entries[id];
      if (position) {
        element.scrollTop = Number(position.top) || 0;
        element.scrollLeft = Number(position.left) || 0;
      }
    });
  }));
}

function navigationViewKey({ action, read, test } = {}) {
  if (action) return `action:${action}`;
  if (read) return `read:${read}`;
  if (test) return `test:${test}`;
  return 'home';
}


async function writeReaderSession(snapshot) {
  return readerSessionManager.write(snapshot);
}

async function readReaderSession() {
  return readerSessionManager.read();
}

async function clearReaderSession() {
  await readerSessionManager.clear();
  try { localStorage.removeItem(READER_SESSION_META_KEY); } catch {}
}

function captureReaderControls() {
  return {
    mode: app.querySelector('#mode-select')?.value || state.renderedMode || 'highlight',
    wpm: Number(app.querySelector('#speed')?.value || state.wpm || 300),
    wordCount: Number(app.querySelector('#word-count')?.value || 1),
    meaningfulChunks: Boolean(app.querySelector('#meaningful-chunks')?.checked ?? state.meaningfulChunks),
    pointerStyle: app.querySelector('#pointer-style')?.value || state.pointerStyle || 'hand',
    pointerColor: app.querySelector('#pointer-color')?.value || state.pointerColor || '#20a866',
    focusAnchor: Boolean(app.querySelector('#focus-anchor')?.checked ?? state.focusAnchor),
    focusAnchorPosition: state.focusAnchorPosition || null,
    focusAnchorFontSize: Number(app.querySelector('#focus-anchor-font-size')?.value || state.focusAnchorFontSize || 24),
    focusAnchorColor: app.querySelector('#focus-anchor-color')?.value || state.focusAnchorColor || '#20a866',
    focusAnchorBold: Boolean(app.querySelector('#focus-anchor-bold')?.checked ?? state.focusAnchorBold),
    fontFamily: app.querySelector('#font-family')?.value || 'system',
    fontSize: Number(app.querySelector('#font-size')?.value || 14),
    theme: app.querySelector('#theme-select')?.value || 'dark',
    bionic: Boolean(app.querySelector('#bionic-reading')?.checked ?? state.bionic),
    bookPages: Boolean(app.querySelector('#book-pages')?.checked ?? state.bookPages),
    illustrationMode: app.querySelector('#illustration-mode')?.value || state.illustrationMode || 'off'
  };
}

function buildReaderSessionSnapshot() {
  return readerEngine.snapshot({
    controls: captureReaderControls(),
    wasRunning: isReaderRunning()
  });
}

function persistReaderSession({ immediate = false } = {}) {
  if (walkthroughReaderSessionActive) return;
  const save = () => {
    readerSessionSaveTimer = null;
    const snapshot = buildReaderSessionSnapshot();
    if (snapshot) {
      try {
        const totalWords = Array.isArray(state.words) ? state.words.length : splitWords(snapshot.currentText || '').length;
        localStorage.setItem(READER_SESSION_META_KEY, JSON.stringify({
          documentId: snapshot.documentId || state.documentId || '',
          title: snapshot.title || state.title || 'Untitled',
          index: Math.max(0, Number(snapshot.index) || 0),
          totalWords: Math.max(0, Number(totalWords) || 0),
          savedAt: new Date().toISOString()
        }));
      } catch {}
      writeReaderSession(snapshot);
    }
  };
  window.clearTimeout(readerSessionSaveTimer);
  if (immediate) save();
  else readerSessionSaveTimer = window.setTimeout(save, 250);
}


function getCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const value = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : '';
}

function setCookie(name, value, maxAgeSeconds = 31536000) {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
}

const sources = {
  gatsby: { title: 'The Great Gatsby', path: '/texts/gg.txt' },
  hound: { title: 'The Hound of the Baskervilles', path: '/texts/hb.txt' },
  cities: { title: 'A Tale of Two Cities', path: '/texts/tt.txt' },
  pride: { title: 'Pride and Prejudice', path: '/texts/pp.txt' }
};


const BROWSE_LAYOUT_KEY = 'markSetGoBrowseLayoutV1';

const MODERN_GUIDE_LIBRARY_KEY = 'markSetGoModernGuideLibraryV1';

function compactModernGuideLibraryItem(item = {}) {
  const source = item?.source && typeof item.source === 'object' ? item.source : {};
  return {
    documentId: String(item.documentId || '').slice(0,140),
    title: String(item.title || '').slice(0,240),
    originalTitle: String(item.originalTitle || source.originalTitle || '').slice(0,220),
    author: String(item.author || source.originalAuthor || '').slice(0,180),
    firstOpenedAt: item.firstOpenedAt || '',
    lastOpenedAt: item.lastOpenedAt || item.lastReadAt || '',
    customGuide: Boolean(item.customGuide || source.customGuide),
    buyUrl: String(item.buyUrl || source.buyUrl || '').slice(0,800),
    wordCount: Math.max(0, Number(item.wordCount) || Number(item.totalWords) || 0)
  };
}

function discoverModernGuidesFromExistingStorage() {
  const byDocument = new Map();

  // Reading progress is already the canonical My Library index.
  const progress = readStoredObject(READING_PROGRESS_KEY);
  Object.values(progress).forEach((item) => {
    if (item?.source?.type !== 'modern-guide' || !item.documentId) return;
    byDocument.set(String(item.documentId), compactModernGuideLibraryItem({
      ...item,
      originalTitle:item.source?.originalTitle,
      author:item.source?.originalAuthor,
      customGuide:item.source?.customGuide,
      buyUrl:item.source?.buyUrl,
      lastOpenedAt:item.lastReadAt
    }));
  });

  // Also inspect existing saved-document metadata so a guide opened before a
  // progress checkpoint can still appear without creating another large copy.
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(DOCUMENT_STORAGE_PREFIX)) continue;
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
      if (saved?.source?.type !== 'modern-guide') continue;
      const documentId = key.slice(DOCUMENT_STORAGE_PREFIX.length);
      if (!documentId) continue;
      const existing = byDocument.get(documentId) || {};
      byDocument.set(documentId, compactModernGuideLibraryItem({
        ...existing,
        documentId,
        title:saved.title || existing.title,
        originalTitle:saved.source?.originalTitle || existing.originalTitle,
        author:saved.source?.originalAuthor || existing.author,
        customGuide:saved.source?.customGuide,
        buyUrl:saved.source?.buyUrl,
        wordCount:existing.wordCount || splitWords(saved.text || '').length,
        lastOpenedAt:existing.lastOpenedAt || ''
      }));
    }
  } catch (error) {
    console.warn('Could not inspect saved Modern Guides.', error);
  }

  return [...byDocument.values()]
    .filter((item) => item.documentId && item.title)
    .sort((a,b) => new Date(b.lastOpenedAt || b.firstOpenedAt || 0) - new Date(a.lastOpenedAt || a.firstOpenedAt || 0));
}

function readModernGuideLibrary() {
  const discovered = discoverModernGuidesFromExistingStorage();
  const byDocument = new Map(discovered.map((item) => [String(item.documentId), item]));

  // Migrate any older guide-registry metadata, but never depend on it.
  try {
    const legacy = JSON.parse(localStorage.getItem(MODERN_GUIDE_LIBRARY_KEY) || '[]');
    if (Array.isArray(legacy)) {
      legacy.map(compactModernGuideLibraryItem).forEach((item) => {
        if (!item.documentId) return;
        byDocument.set(item.documentId, { ...item, ...(byDocument.get(item.documentId) || {}) });
      });
    }
  } catch {}

  return [...byDocument.values()]
    .filter((item) => item.documentId && item.title)
    .sort((a,b) => new Date(b.lastOpenedAt || b.firstOpenedAt || 0) - new Date(a.lastOpenedAt || a.firstOpenedAt || 0));
}

function writeModernGuideLibrary(items) {
  const compact = (Array.isArray(items) ? items : [])
    .map(compactModernGuideLibraryItem)
    .filter((item) => item.documentId && item.title)
    .slice(0, 50);

  try {
    if (!compact.length) {
      localStorage.removeItem(MODERN_GUIDE_LIBRARY_KEY);
      return [];
    }
    localStorage.setItem(MODERN_GUIDE_LIBRARY_KEY, JSON.stringify(compact));
    return compact;
  } catch (error) {
    // The registry is only a lightweight cache. Existing document/progress
    // storage remains authoritative, so never break the Reader on quota errors.
    try { localStorage.removeItem(MODERN_GUIDE_LIBRARY_KEY); } catch {}
    console.warn('Modern Guide cache was skipped because browser storage is full.', error);
    return compact;
  }
}

function registerModernGuideLibraryItem({
  documentId = state?.documentId || '',
  title = state?.title || '',
  source = state?.source || null,
  text = state?.currentText || ''
} = {}) {
  if (!documentId || !title || source?.type !== 'modern-guide') return null;

  const existingItems = readModernGuideLibrary();
  const existing = existingItems.find((item) => String(item.documentId) === String(documentId)) || {};
  const now = new Date().toISOString();
  const record = compactModernGuideLibraryItem({
    ...existing,
    documentId,
    title,
    originalTitle:source?.originalTitle || existing.originalTitle,
    author:source?.originalAuthor || existing.author,
    firstOpenedAt:existing.firstOpenedAt || now,
    lastOpenedAt:now,
    customGuide:Boolean(source?.customGuide),
    buyUrl:source?.buyUrl || existing.buyUrl,
    wordCount:Array.isArray(state?.words) && state.words.length ? state.words.length : splitWords(text || '').length
  });

  // Best-effort compact cache only. My Library also discovers the guide from
  // the existing document/progress records, so failure here is harmless.
  const next = existingItems.filter((item) => String(item.documentId) !== String(documentId));
  next.unshift(record);
  writeModernGuideLibrary(next);
  return record;
}

const MODERN_GUIDE_ACTIONS_KEY = 'markSetGoModernGuideActionsV1';

function readModernGuideLibrary() {
  try {
    const value = JSON.parse(localStorage.getItem(MODERN_GUIDE_LIBRARY_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeModernGuideLibrary(items) {
  const normalized = Array.isArray(items) ? items : [];
  localStorage.setItem(MODERN_GUIDE_LIBRARY_KEY, JSON.stringify(normalized));
  return normalized;
}

function registerModernGuideLibraryItem({
  documentId = state?.documentId || '',
  title = state?.title || '',
  source = state?.source || null,
  text = state?.currentText || ''
} = {}) {
  if (!documentId || !title || source?.type !== 'modern-guide') return null;

  const items = readModernGuideLibrary();
  const existingIndex = items.findIndex((item) => String(item.documentId || '') === String(documentId));
  const now = new Date().toISOString();
  const existing = existingIndex >= 0 ? items[existingIndex] : {};

  const record = {
    ...existing,
    documentId,
    title,
    originalTitle: source?.originalTitle || existing.originalTitle || title.replace(/\s+—\s+Mark,\s*Set,\s*Go!\s+Guide$/i,''),
    author: source?.originalAuthor || existing.author || '',
    source,
    wordCount: Array.isArray(state?.words) && state.words.length ? state.words.length : splitWords(text || '').length,
    firstOpenedAt: existing.firstOpenedAt || now,
    lastOpenedAt: now,
    customGuide: Boolean(source?.customGuide),
    buyUrl: source?.buyUrl || existing.buyUrl || ''
  };

  if (existingIndex >= 0) items[existingIndex] = record;
  else items.unshift(record);

  writeModernGuideLibrary(items.slice(0, 200));
  return record;
}

function readModernGuideActions() {
  try {
    const value = JSON.parse(localStorage.getItem(MODERN_GUIDE_ACTIONS_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeModernGuideActions(items) {
  const normalized = Array.isArray(items) ? items : [];
  localStorage.setItem(MODERN_GUIDE_ACTIONS_KEY, JSON.stringify(normalized));
  return normalized;
}

function rememberModernGuideAction(action) {
  if (!action?.id || action?.origin !== 'modern-guide') return action || null;
  const items = readModernGuideActions();
  const index = items.findIndex((item) => String(item.id || '') === String(action.id));
  if (index >= 0) items[index] = { ...action };
  else items.unshift({ ...action });
  writeModernGuideActions(items.slice(0, 300));
  return action;
}

function forgetModernGuideAction(actionId) {
  if (!actionId) return;
  writeModernGuideActions(readModernGuideActions().filter((item) => String(item.id || '') !== String(actionId)));
}


const MODERN_GUIDE_SHELF = [
  {
    id: 'atomic-habits',
    title: 'Atomic Habits',
    author: 'James Clear',
    category: 'Modern guide',
    status: 'Ready to read',
    badge: 'Featured',
    actionLabel: 'Read guide',
    active: true,
    blurb: 'Small improvements, identity-based change, habit design, and practical systems for consistency.',
    detail: 'Independent guide · Self-improvement',
    buyUrl: 'https://www.amazon.com/s?k=Atomic+Habits+James+Clear',
    palette: ['#f3d36d', '#d98324', '#6a330a']
  },
  {
    id: 'deep-work',
    title: 'Deep Work',
    author: 'Cal Newport',
    category: 'Modern guide',
    status: 'Ready to read',
    badge: 'Focus',
    actionLabel: 'Read guide',
    active: true,
    blurb: 'A practical guide to distraction-free concentration, deliberate practice, and producing valuable work.',
    detail: 'Independent guide · Productivity',
    buyUrl: 'https://www.amazon.com/s?k=Deep+Work+Cal+Newport',
    palette: ['#7ec5ff', '#2f76c1', '#123963']
  },
  {
    id: 'psychology-of-money',
    title: 'The Psychology of Money',
    author: 'Morgan Housel',
    category: 'Modern guide',
    status: 'Ready to read',
    badge: 'Money',
    actionLabel: 'Read guide',
    active: true,
    blurb: 'Behavior, patience, risk, wealth, enough, and the emotional side of financial decision-making.',
    detail: 'Independent guide · Finance',
    buyUrl: 'https://www.amazon.com/s?k=The+Psychology+of+Money+Morgan+Housel',
    palette: ['#86ddaa', '#17875b', '#0e4f38']
  },
  {
    id: 'why-we-sleep',
    title: 'Why We Sleep',
    author: 'Matthew Walker',
    category: 'Modern guide',
    status: 'Ready to read',
    badge: 'Health',
    actionLabel: 'Read guide',
    active: true,
    blurb: 'Sleep cycles, circadian timing, memory, dreams, health, and practical sleep literacy—with critical context.',
    detail: 'Independent guide · Health & science',
    buyUrl: 'https://www.amazon.com/s?k=Why+We+Sleep+Matthew+Walker',
    palette: ['#ba9cff', '#7a52cc', '#322060']
  },
  {
    id: 'let-them-theory',
    title: 'The Let Them Theory',
    author: 'Mel Robbins & Sawyer Robbins',
    category: 'Modern guide',
    status: 'Ready to read',
    badge: 'New',
    actionLabel: 'Read guide',
    active: true,
    blurb: 'A guide to releasing control of other people, reclaiming agency, setting boundaries, and choosing your response.',
    detail: 'Independent guide · Relationships & mindset',
    buyUrl: 'https://www.amazon.com/s?k=The+Let+Them+Theory+Mel+Robbins',
    palette: ['#ffb28a', '#ef6d3f', '#7e2b1e']
  }
];

const MODERN_GUIDE_INTERACTIONS = {
  'atomic-habits': {
    greatIdea: 'Habit',
    actionTitle: 'Run a seven-day tiny-habit experiment',
    actionType: 'experiment',
    dueDays: 7,
    dueHour: 19,
    priority: 'normal',
    repeat: 'none',
    reminder: 'day1',
    actionNote: 'Choose one identity-based habit. Make the cue obvious, the first step easy, and the completion satisfying. Track it for seven days, then review what helped or created friction.'
  },
  'deep-work': {
    greatIdea: 'Education',
    actionTitle: 'Protect one recurring deep-work block',
    actionType: 'habit',
    dueDays: 1,
    dueHour: 9,
    priority: 'high',
    repeat: 'weekly',
    reminder: 'min30',
    actionNote: 'Schedule one distraction-free block for your highest-value cognitive task. Define the output before you begin, silence communication, and review the quality of attention afterward.'
  },
  'psychology-of-money': {
    greatIdea: 'Prudence',
    actionTitle: 'Write a personal money philosophy',
    actionType: 'reflection',
    dueDays: 3,
    dueHour: 19,
    priority: 'normal',
    repeat: 'none',
    reminder: 'day1',
    actionNote: 'Define what enough means, what money is for, which risks could permanently damage your plans, and where you need more room for error.'
  },
  'why-we-sleep': {
    greatIdea: 'Nature',
    actionTitle: 'Run a seven-day sleep-literacy log',
    actionType: 'experiment',
    dueDays: 7,
    dueHour: 19,
    priority: 'normal',
    repeat: 'none',
    reminder: 'day1',
    actionNote: 'Track bedtime, wake time, caffeine timing, morning light, exercise, evening stimulation, subjective sleep quality, and next-day reading concentration. Change only one variable after observing the baseline.'
  },
  'let-them-theory': {
    greatIdea: 'Freedom',
    actionTitle: 'Separate what belongs to them from what belongs to me',
    actionType: 'reflection',
    dueDays: 2,
    dueHour: 19,
    priority: 'normal',
    repeat: 'none',
    reminder: 'day1',
    actionNote: 'Choose one situation consuming too much mental energy. Separate what belongs to the other person from what you control, then define one boundary or constructive next action.'
  }
};


const BROWSE_FREE_BOOKS = [
  {
    id: 'gatsby',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    category: 'Free book',
    badge: 'Local',
    blurb: 'An elegant American classic already staged in Mark, Set, Go! for fast reading.',
    detail: 'Open the included reader text',
    actionLabel: 'Open now',
    action: { type: 'source', key: 'gatsby' },
    palette: ['#73c3ff', '#275f9f', '#132848']
  },
  {
    id: 'pride',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    category: 'Free book',
    badge: 'Local',
    blurb: 'Wit, courtship, and social observation from one of the most enduring novels in English.',
    detail: 'Open the included reader text',
    actionLabel: 'Open now',
    action: { type: 'source', key: 'pride' },
    palette: ['#ffb7c8', '#cb5f84', '#66243f']
  },
  {
    id: 'republic',
    title: 'The Republic',
    author: 'Plato',
    category: 'Great book',
    badge: 'Discover',
    blurb: 'Justice, education, and the ideal city—an anchor text for your Great Books shelf.',
    detail: 'Find the best readable edition',
    actionLabel: 'Find edition',
    action: { type: 'search', query: 'The Republic Plato' },
    palette: ['#99e1cf', '#1b9b83', '#0d5143']
  },
  {
    id: 'brothers',
    title: 'The Brothers Karamazov',
    author: 'Fyodor Dostoevsky',
    category: 'Free book',
    badge: 'Discover',
    blurb: 'Faith, family, doubt, and moral drama—ideal for deep reading and note-taking.',
    detail: 'Find the best readable edition',
    actionLabel: 'Find edition',
    action: { type: 'search', query: 'The Brothers Karamazov Dostoevsky' },
    palette: ['#f4a77b', '#cb6128', '#6f2613']
  },
  {
    id: 'meditations',
    title: 'Meditations',
    author: 'Marcus Aurelius',
    category: 'Free book',
    badge: 'Discover',
    blurb: 'Daily philosophical counsel for discipline, composure, and perspective.',
    detail: 'Find the best readable edition',
    actionLabel: 'Find edition',
    action: { type: 'search', query: 'Meditations Marcus Aurelius' },
    palette: ['#d4c08b', '#977a28', '#483813']
  },
  {
    id: 'federalist',
    title: 'The Federalist Papers',
    author: 'Hamilton, Madison, Jay',
    category: 'Free book',
    badge: 'Discover',
    blurb: 'American constitutional thought in a format made for study, comparison, and annotation.',
    detail: 'Find the best readable edition',
    actionLabel: 'Find edition',
    action: { type: 'search', query: 'Federalist Papers' },
    palette: ['#9bc0ff', '#3557a8', '#182850']
  }
];

const BROWSE_LIBRARY_SOURCES = [
  { provider: 'gutenberg', title: 'Project Gutenberg', note: 'Classic full texts', icon: 'PG' },
  { provider: 'archive', title: 'Internet Archive', note: 'Scans, OCR, and borrowable texts', icon: 'IA' },
  { provider: 'openlibrary', title: 'Open Library', note: 'Borrow, preview, and edition discovery', icon: 'OL' },
  { provider: 'google', title: 'Google Books', note: 'Preview modern and public-domain titles', icon: 'GB' }
];

const BROWSE_COLLECTIONS = [
  ['Great Books of the Western World', 'Great Books of the Western World'],
  ['Classics for first-time readers', 'The Great Gatsby Pride and Prejudice A Tale of Two Cities'],
  ['Philosophy foundations', 'Plato Aristotle Marcus Aurelius Augustine'],
  ['American founding & republic', 'Federalist Papers Constitution Tocqueville'],
  ['History and civilization', 'Gibbon Plutarch Herodotus Thucydides'],
  ['Science for curious readers', 'Origin of Species Darwin Euclid Newton']
];


const languages = {
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  de: 'German',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  ja: 'Japanese'
};


const musicChoices = [
  { id: 'lofi-study', category: 'Reading moods', title: 'Lofi Study Radio', description: 'Steady instrumental beats for reading and concentration.', type: 'video', youtubeId: 'jfKfPfyJRdk', searchQuery: 'Lofi Girl lofi hip hop radio beats to relax study to' },
  { id: 'sleepy-lofi', category: 'Reading moods', title: 'Sleepy Lofi', description: 'Slower, softer lofi for calm evening reading.', type: 'video', youtubeId: 'rUxyKA_-grg', searchQuery: 'Lofi Girl beats to sleep chill to' },
  { id: 'classical-reading', category: 'Reading moods', title: 'Classical Reading', description: 'A long classical playlist for books and study.', type: 'playlist', youtubeId: 'PLe4JMT6isxp-rx1IRUeEo0puoloL2N9NQ' },
  { id: 'ambient-reading', category: 'Reading moods', title: 'Ambient Reading', description: 'Relaxing ambient instrumentals for concentration.', type: 'playlist', youtubeId: 'OLAK5uy_nCi20x1Eo0ZW2q_cfufw06g2Bvn8a4u-c' },
  { id: 'deep-focus', category: 'Focus', title: 'Deep Focus', description: 'Low-distraction ambient music for sustained focus.', type: 'playlist', youtubeId: 'PLUrnxvhuvpSU0b2YvM4Gf1V3bHnLAcvBj' },
  { id: 'rain-focus', category: 'Focus', title: 'Rain & Focus', description: 'Rain and nature sounds for quiet reading.', type: 'playlist', youtubeId: 'OLAK5uy_lN5SVZjZwWb3XM5BIKUreV5wRCD0VLsqQ' },
  { id: 'anime-lofi', category: 'Lofi', title: 'Anime Lofi', description: 'Relaxed anime-inspired lofi beats.', type: 'playlist', youtubeId: 'PLApjonMF-0Y8uSA_-6ZbX1DIr-muc2nDg' },
  { id: 'classical-piano', category: 'Classical', title: 'Classical Piano', description: 'Familiar piano and orchestral selections.', type: 'playlist', youtubeId: 'PLgW6PU42e5RLa6NENfz5kusVilq58Cojm' }
];


const preferredMusicStorageKey = 'markSetGoPreferredMusic';
const bookMusicStorageKey = 'markSetGoBookMusicV1';

function currentBookMusicKey() {
  const title = String(state?.title || '').trim();
  if (!title) return '';
  return title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
}

function getBookMusicMap() {
  try {
    const saved = JSON.parse(localStorage.getItem(bookMusicStorageKey) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch { return {}; }
}

function getBookMusic(bookKey = currentBookMusicKey()) {
  if (!bookKey) return [];
  const value = getBookMusicMap()[bookKey];
  return Array.isArray(value) ? value : [];
}

function setBookMusic(bookKey, ids) {
  if (!bookKey) return;
  const map = getBookMusicMap();
  map[bookKey] = [...new Set((ids || []).filter(Boolean))].slice(0, 25);
  try { localStorage.setItem(bookMusicStorageKey, JSON.stringify(map)); } catch {}
}

function attachMusicToCurrentBook(id) {
  const key = currentBookMusicKey();
  if (!key || !id) return false;
  const ids = getBookMusic(key);
  if (ids.includes(id)) return false;
  ids.push(id);
  setBookMusic(key, ids);
  return true;
}

function detachMusicFromCurrentBook(id) {
  const key = currentBookMusicKey();
  if (!key) return;
  setBookMusic(key, getBookMusic(key).filter((itemId) => itemId !== id));
}


function getPreferredMusic() {
  try {
    const saved = JSON.parse(localStorage.getItem(preferredMusicStorageKey) || '[]');
    return Array.isArray(saved) ? saved.filter((item) => item && item.id && item.title) : [];
  } catch {
    return [];
  }
}

function setPreferredMusic(items) {
  try { localStorage.setItem(preferredMusicStorageKey, JSON.stringify(items.slice(0, 100))); } catch {}
}

function preferredMusicId(item) {
  const source = item.choiceId || item.src || item.title || String(Date.now());
  let hash = 0;
  for (const char of String(source)) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `preferred-${Math.abs(hash)}`;
}

function addPreferredMusic(item) {
  if (!item?.title) return false;
  const next = { ...item, id: item.id || preferredMusicId(item) };
  const items = getPreferredMusic();
  const duplicate = items.some((saved) => saved.id === next.id || (next.choiceId && saved.choiceId === next.choiceId) || (next.src && saved.src === next.src));
  if (duplicate) return false;
  items.push(next);
  setPreferredMusic(items);
  return true;
}

function removePreferredMusic(id) {
  setPreferredMusic(getPreferredMusic().filter((item) => item.id !== id));
}

function preferredMusicOptionsMarkup() {
  const items = getPreferredMusic();
  return `
    <option value="">Preferred music…</option>
    ${items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join('')}
    <option value="__manage__">Manage preferred music…</option>`;
}

function mediaMatchOptionsMarkup() {
  const items = getPreferredMusic();
  return `
    <option value="music">♫ Music score</option>
    ${items.length ? `<optgroup label="Preferred music">${items.map((item) => `<option value="preferred:${escapeHtml(item.id)}">♫ ${escapeHtml(item.title)}</option>`).join('')}</optgroup>` : ''}
    <option value="manage-music">Manage preferred music…</option>
    <option value="news">▶ News video</option>`;
}

function playPreferredMusic(id) {
  const item = getPreferredMusic().find((saved) => saved.id === id);
  if (!item) return;
  if (item.choiceId) {
    const choice = musicChoices.find((candidate) => candidate.id === item.choiceId);
    if (choice) return playMusic(choice);
  }
  if (item.src) return playMusic({ title: item.title, source: item.source || 'Preferred music', provider: item.provider, src: item.src });
}

function bindPreferredMusicSelectors() {
  const selects = [...app.querySelectorAll('[data-preferred-music-select]')];
  selects.forEach((select) => {
    select.addEventListener('change', () => {
      const value = select.value;
      if (!value) return;
      if (value === '__manage__') {
        renderMusicLibrary();
        return;
      }
      playPreferredMusic(value);
      selects.forEach((other) => { if (other !== select) other.value = value; });
    });
  });
}


const bookMusicProfiles = [
  { match: /pride and prejudice/i, score: 'Pride and Prejudice film soundtrack', mood: 'English countryside classical reading music' },
  { match: /great gatsby/i, score: 'The Great Gatsby movie soundtrack', mood: '1920s jazz reading music' },
  { match: /hound of the baskervilles|sherlock holmes/i, score: 'Sherlock Holmes film soundtrack', mood: 'Victorian mystery ambience reading music' },
  { match: /tale of two cities/i, score: 'A Tale of Two Cities film soundtrack', mood: 'French Revolution classical ambience' },
  { match: /iliad|odyssey|homer/i, score: 'Troy movie soundtrack', mood: 'Ancient Greek epic ambience' },
  { match: /aeneid|virgil/i, score: 'Roman Empire epic film soundtrack', mood: 'Ancient Rome ambience reading music' },
  { match: /divine comedy|dante/i, score: 'Dante Inferno soundtrack', mood: 'medieval sacred ambience reading music' },
  { match: /shakespeare|hamlet|macbeth|romeo and juliet|king lear/i, score: 'Shakespeare film soundtrack', mood: 'Elizabethan instrumental reading music' },
  { match: /don quixote|cervantes/i, score: 'Don Quixote film soundtrack', mood: 'Spanish classical guitar reading music' },
  { match: /paradise lost|milton/i, score: 'Paradise Lost cinematic soundtrack', mood: 'dark sacred choral reading music' },
  { match: /war and peace|anna karenina|tolstoy/i, score: 'War and Peace film soundtrack', mood: 'Russian classical reading music' },
  { match: /crime and punishment|brothers karamazov|dostoevsky/i, score: 'Dostoevsky film soundtrack', mood: 'dark Russian classical reading music' },
  { match: /moby dick|melville/i, score: 'Moby Dick film soundtrack', mood: 'ocean ambience orchestral reading music' },
  { match: /frankenstein|mary shelley/i, score: 'Frankenstein film soundtrack', mood: 'gothic classical reading ambience' },
  { match: /dracula|bram stoker/i, score: 'Dracula film soundtrack', mood: 'gothic horror classical reading music' },
  { match: /alice in wonderland|lewis carroll/i, score: 'Alice in Wonderland film soundtrack', mood: 'whimsical fantasy reading music' },
  { match: /treasure island|robert louis stevenson/i, score: 'Treasure Island film soundtrack', mood: 'pirate adventure ambience reading music' },
  { match: /jane eyre|charlotte bronte/i, score: 'Jane Eyre film soundtrack', mood: 'gothic romantic classical reading music' },
  { match: /wuthering heights|emily bronte/i, score: 'Wuthering Heights film soundtrack', mood: 'windswept moor ambience reading music' },
  { match: /little women|louisa may alcott/i, score: 'Little Women film soundtrack', mood: 'warm period drama reading music' }
];

function youtubeSearchUrl(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function recommendedBookMusic(title, author = '') {
  const key = `${title || ''} ${author || ''}`.trim();
  const profile = bookMusicProfiles.find((item) => item.match.test(key));
  if (profile) {
    return [
      { label: 'Adaptation score', query: profile.score },
      { label: 'Reading mood', query: profile.mood }
    ];
  }
  const cleanTitle = String(title || 'this book').replace(/\s*[—-].*$/, '').trim();
  return [
    { label: 'Film or TV score', query: `${cleanTitle} movie soundtrack` },
    { label: 'Reading mood', query: `${cleanTitle} instrumental reading ambience` }
  ];
}

function bookMusicMarkup(title, author = '') {
  const recommendations = recommendedBookMusic(title, author);
  return `<div class="book-music-recommendations"><span>Suggested music</span>${recommendations.map((item) => `<a class="book-music-link" href="${youtubeSearchUrl(item.query)}" target="_blank" rel="noopener noreferrer">♫ ${escapeHtml(item.label)}</a>`).join('')}</div>`;
}

function inferReadingMoodQuery(title = '', text = '') {
  const cleanTitle = String(title || 'this book').replace(/\s*[—-].*$/, '').trim();
  const sample = `${cleanTitle} ${String(text || '').slice(0, 12000)}`.toLocaleLowerCase();
  const profile = bookMusicProfiles.find((item) => item.match.test(cleanTitle));
  if (profile?.mood) return profile.mood;

  const signals = [
    { test: /mystery|detective|murder|crime|suspense|noir|sherlock|gothic|haunted|horror|dracula|frankenstein/, query: 'dark Victorian mystery ambience instrumental reading music' },
    { test: /romance|courtship|love|regency|austen|bronte|drawing room|ballroom/, query: 'romantic period drama classical instrumental reading music' },
    { test: /fantasy|magic|wizard|myth|legend|wonderland|fairy|dragon/, query: 'enchanted fantasy ambience instrumental reading music' },
    { test: /adventure|voyage|expedition|pirate|treasure|island|jungle/, query: 'cinematic adventure ambience instrumental reading music' },
    { test: /ocean|sea|ship|whale|sailor|maritime/, query: 'ocean voyage ambience orchestral instrumental reading music' },
    { test: /war|battle|revolution|empire|army|soldier/, query: 'historical epic orchestral ambience reading music' },
    { test: /ancient greek|greece|homer|odyssey|iliad|trojan/, query: 'Ancient Greek lyre epic ambience reading music' },
    { test: /roman|rome|aeneid|virgil|caesar/, query: 'Ancient Rome ambience instrumental reading music' },
    { test: /medieval|monastery|knight|castle|dante|pilgrim/, query: 'medieval sacred instrumental ambience reading music' },
    { test: /nature|forest|river|mountain|outdoor|fishing|rain|storm/, query: 'nature ambience gentle instrumental reading music' },
    { test: /1920|jazz|gatsby|speakeasy|new york city/, query: '1920s jazz ambience instrumental reading music' },
    { test: /science fiction|spaceship|planet|future|robot|alien/, query: 'space ambient science fiction instrumental reading music' },
    { test: /philosoph|theology|ethics|history|science|politic|essay|treatise/, query: 'quiet scholarly classical instrumental deep reading music' },
    { test: /children|childhood|family|little women|warm|home/, query: 'warm nostalgic period drama instrumental reading music' }
  ];
  const match = signals.find((item) => item.test.test(sample));
  return match?.query || `${cleanTitle} atmospheric instrumental reading music`;
}

function recommendedPlayerChoice(title = '', text = '') {
  const searches = recommendedBookMusic(title);
  return {
    scoreQuery: searches.find((item) => /adaptation|film|tv|score/i.test(item.label))?.query || `${title} adaptation soundtrack`,
    moodQuery: inferReadingMoodQuery(title, text),
    searches
  };
}

function grokipediaSearchUrl(title, author = '') {
  const cleanTitle = String(title || '').replace(/\s*[—-].*$/, '').trim();
  const query = `${cleanTitle}${author ? ` ${author}` : ''}`.trim();
  return `https://grokipedia.com/search?q=${encodeURIComponent(query)}`;
}

function bindReaderMusicControls(title, text, source = {}) {
  const mediaSelect = app.querySelector('#media-match-select');
  const mediaButton = app.querySelector('#play-media-match');
  const moodButton = app.querySelector('#play-reading-mood');
  const grokipediaLink = app.querySelector('#grokipedia-book-link');
  const recommendation = recommendedPlayerChoice(title, text);
  const isNewsReading = ['article', 'feed-summary', 'news'].includes(source?.type);
  const newsSource = String(source?.source || '').trim();
  const newsVideoQuery = `${title}${newsSource ? ` ${newsSource}` : ''} news video`;
  if (mediaSelect) {
    mediaSelect.value = isNewsReading ? 'news' : 'music';
    mediaSelect.title = isNewsReading
      ? 'Choose news video coverage or a music score for this reading'
      : 'Choose a music score or search for video coverage related to this text';
  }
  if (mediaButton) {
    const syncMediaButton = () => {
      const choice = mediaSelect?.value || (isNewsReading ? 'news' : 'music');
      mediaButton.textContent = choice === 'news' ? '▶ Watch news video' : '♫ Play music score';
      mediaButton.title = choice === 'news'
        ? `Find video coverage for ${title}`
        : `Play an adaptation or cinematic score for ${title}`;
    };
    syncMediaButton();
    mediaSelect?.addEventListener('change', () => {
      const choice = mediaSelect.value;
      if (choice === 'manage-music') {
        renderMusicLibrary();
        return;
      }
      if (choice.startsWith('preferred:')) {
        playPreferredMusic(choice.slice('preferred:'.length));
        return;
      }
      syncMediaButton();
    });
    mediaButton.addEventListener('click', () => {
      const choice = mediaSelect?.value || (isNewsReading ? 'news' : 'music');
      if (choice === 'news') {
        playYouTubeSearch(newsVideoQuery, `${title} — news video`);
      } else if (choice.startsWith('preferred:')) {
        playPreferredMusic(choice.slice('preferred:'.length));
      } else if (choice === 'manage-music') {
        renderMusicLibrary();
      } else {
        playYouTubeSearch(recommendation.scoreQuery, `${title} — music score`);
      }
    });
  }
  if (moodButton) {
    moodButton.title = `Play a reading mood selected for ${title}`;
    moodButton.addEventListener('click', () => playYouTubeSearch(
      recommendation.moodQuery,
      `${title} — reading mood`
    ));
  }
  if (grokipediaLink) grokipediaLink.href = grokipediaSearchUrl(title, source?.author || '');
}

const musicDock = document.querySelector('#music-dock');
const musicPlayer = document.querySelector('#music-player');
const musicPlayerWrap = document.querySelector('#music-player-wrap');
const musicNowTitle = document.querySelector('#music-now-title');
const musicNowSource = document.querySelector('#music-now-source');
const musicNextButton = document.querySelector('#music-next');
let musicSearchState = null;

function musicSearchQuery(choice) {
  return choice.searchQuery || `${choice.title || 'reading music'} YouTube`;
}

function musicWatchUrl(choice) {
  if (choice.type === 'playlist') return `https://www.youtube.com/playlist?list=${encodeURIComponent(choice.youtubeId)}`;
  return `https://www.youtube.com/watch?v=${encodeURIComponent(choice.youtubeId)}`;
}

function youtubeEmbedFromChoice(choice) {
  if (choice.type === 'playlist') {
    return `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(choice.youtubeId)}&playsinline=1&rel=0`;
  }
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(choice.youtubeId)}?playsinline=1&rel=0`;
}

function parseSpotifyInput(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) throw new Error('Paste a Spotify playlist, album, track, artist, show, or episode link.');
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('Enter a valid Spotify URL.'); }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'open.spotify.com') throw new Error('Only open.spotify.com links can be embedded.');
  const parts = parsed.pathname.split('/').filter(Boolean);
  const offset = parts[0]?.startsWith('intl-') ? 1 : 0;
  const type = parts[offset];
  const id = parts[offset + 1];
  const allowed = new Set(['playlist', 'album', 'track', 'artist', 'show', 'episode']);
  if (!allowed.has(type) || !id || !/^[A-Za-z0-9]+$/.test(id)) {
    throw new Error('That Spotify link is not a supported playlist, album, track, artist, show, or episode.');
  }
  const labels = { playlist: 'Spotify playlist', album: 'Spotify album', track: 'Spotify track', artist: 'Spotify artist', show: 'Spotify show', episode: 'Spotify episode' };
  return {
    title: labels[type],
    provider: 'spotify',
    source: 'Spotify',
    originalUrl: `https://open.spotify.com/${type}/${id}`,
    src: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`
  };
}

function parseMusicInput(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) throw new Error('Paste a Spotify or YouTube link.');
  let host = '';
  try { host = new URL(raw).hostname.toLowerCase(); } catch { throw new Error('Enter a valid Spotify or YouTube URL.'); }
  return host.includes('spotify.com') ? parseSpotifyInput(raw) : parseYouTubeInput(raw);
}

function parseYouTubeInput(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) throw new Error('Paste a YouTube video or playlist link.');
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('Enter a valid YouTube URL.'); }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) {
    throw new Error('Only YouTube links can be loaded in the music player.');
  }
  const list = parsed.searchParams.get('list');
  if (list) return { title: 'YouTube playlist', src: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}&playsinline=1&rel=0` };
  let videoId = host === 'youtu.be' ? parsed.pathname.split('/').filter(Boolean)[0] : parsed.searchParams.get('v');
  if (!videoId && parsed.pathname.startsWith('/shorts/')) videoId = parsed.pathname.split('/')[2];
  if (!videoId && parsed.pathname.startsWith('/embed/')) videoId = parsed.pathname.split('/')[2];
  if (!videoId || !/^[\w-]{6,20}$/.test(videoId)) throw new Error('That link does not contain a recognizable YouTube video or playlist.');
  return { title: 'YouTube video', src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?playsinline=1&rel=0` };
}

async function playYouTubeSearch(query, title = 'YouTube search') {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return;
  musicNowTitle.textContent = title;
  musicNowSource.textContent = 'Searching YouTube…';
  musicDock.hidden = false;
  musicDock.classList.remove('minimized');
  musicPlayerWrap.hidden = false;
  musicPlayer.src = '';
  if (musicNextButton) musicNextButton.hidden = true;
  try {
    const payload = await loadApiPayload(`/api/youtube/search?q=${encodeURIComponent(cleanQuery)}`);
    const videoIds = Array.isArray(payload.videoIds) ? payload.videoIds : [];
    if (!videoIds.length) throw new Error('No playable results were found.');
    musicSearchState = { query: cleanQuery, title, videoIds, index: 0 };
    playMusicSearchCandidate(0);
  } catch (error) {
    musicSearchState = null;
    musicNowSource.textContent = error?.message || 'Music search failed';
    musicPlayer.src = '';
  }
}

function playMusicSearchCandidate(index) {
  if (!musicSearchState?.videoIds?.length) return;
  const safeIndex = ((index % musicSearchState.videoIds.length) + musicSearchState.videoIds.length) % musicSearchState.videoIds.length;
  musicSearchState.index = safeIndex;
  const videoId = musicSearchState.videoIds[safeIndex];
  musicNowTitle.textContent = musicSearchState.title;
  musicNowSource.textContent = `YouTube result ${safeIndex + 1} of ${musicSearchState.videoIds.length}`;
  musicPlayer.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&rel=0`;
  musicDock.hidden = false;
  musicDock.classList.remove('minimized');
  musicPlayerWrap.hidden = false;
  if (musicNextButton) musicNextButton.hidden = musicSearchState.videoIds.length < 2;
  try {
    localStorage.setItem('markSetGoMusic', JSON.stringify({
      title: musicNowTitle.textContent,
      source: musicNowSource.textContent,
      src: musicPlayer.src,
      search: musicSearchState
    }));
  } catch {}
}

function playMusic(choiceOrParsed) {
  musicSearchState = choiceOrParsed?.search || null;
  if (musicNextButton) musicNextButton.hidden = !musicSearchState?.videoIds?.length;
  const isChoice = Boolean(choiceOrParsed?.youtubeId);
  const src = isChoice ? youtubeEmbedFromChoice(choiceOrParsed) : choiceOrParsed.src;
  musicNowTitle.textContent = choiceOrParsed.title || 'Music';
  musicNowSource.textContent = isChoice ? choiceOrParsed.category : (choiceOrParsed.source || (choiceOrParsed.provider === 'spotify' ? 'Spotify' : 'YouTube'));
  musicPlayer.src = src;
  musicDock.hidden = false;
  musicDock.classList.remove('minimized');
  musicPlayerWrap.hidden = false;
  try { localStorage.setItem('markSetGoMusic', JSON.stringify({ title: musicNowTitle.textContent, source: musicNowSource.textContent, provider: choiceOrParsed.provider || (isChoice ? 'youtube' : ''), src })); } catch {}
}

function stopMusic() {
  musicSearchState = null;
  if (musicNextButton) musicNextButton.hidden = true;
  musicPlayer.src = '';
  musicDock.hidden = true;
  try { localStorage.removeItem('markSetGoMusic'); } catch {}
}

function renderMusicLibrary() {
  stopReader();
  const preferred = getPreferredMusic();
  const bookKey = currentBookMusicKey();
  const bookIds = getBookMusic(bookKey);
  const bookItems = bookIds.map((id) => preferred.find((item) => item.id === id)).filter(Boolean);
  const currentBookLabel = state?.title ? `“${escapeHtml(state.title)}”` : 'No book open';
  const quickChoices = musicChoices.slice(0, 6);

  app.innerHTML = `
    <section class="panel music-library music-simple-page">
      <div class="library-heading music-page-heading">
        <div>
          <h1>Music &amp; Focus</h1>
          <p>Choose something to listen to while you read. You can save it for later or connect it to the current book.</p>
        </div>
      </div>

      <section class="music-current-book" aria-label="Current book">
        <span>Current book</span>
        <strong>${currentBookLabel}</strong>
        ${bookKey ? `<small>${bookItems.length ? `${bookItems.length} saved music ${bookItems.length === 1 ? 'selection' : 'selections'}` : 'No music saved for this book yet'}</small>` : '<small>Open a book to save music specifically for it.</small>'}
      </section>

      <section class="music-primary-section">
        <div class="music-section-heading">
          <div><span class="music-step">1</span><h2>Start listening</h2></div>
          <p>Pick a focus option or paste a Spotify or YouTube link.</p>
        </div>

        <div class="music-quick-picks">
          ${quickChoices.map((item) => `<button class="music-quick-button" type="button" data-play-music="${escapeHtml(item.id)}"><span aria-hidden="true">♫</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.category)}</small></span></button>`).join('')}
        </div>

        <div class="music-or"><span>or use your own music</span></div>

        <form id="music-url-form" class="music-simple-form">
          <label for="music-service-url">Spotify or YouTube link</label>
          <div class="music-link-row">
            <input id="music-service-url" type="url" required placeholder="Paste a playlist, album, track, or video link">
            <button class="primary" type="submit">Play</button>
          </div>
          <details class="music-optional-name">
            <summary>Add a custom name</summary>
            <label for="music-service-name" class="sr-only">Custom name</label>
            <input id="music-service-name" type="text" maxlength="80" placeholder="Example: Dracula reading soundtrack">
          </details>
          <div class="music-save-row">
            <button id="save-music-preferred" class="secondary" type="button">Save to My Music</button>
            ${bookKey ? '<button id="save-music-to-book" class="secondary" type="button">Save for this book</button>' : ''}
          </div>
          <span id="music-service-status" class="status" aria-live="polite"></span>
        </form>
      </section>

      <section class="music-secondary-section">
        <div class="music-section-heading">
          <div><span class="music-step">2</span><h2>Your saved music</h2></div>
          <p>Play a saved selection or connect it to ${bookKey ? currentBookLabel : 'a book later'}.</p>
        </div>
        <div id="preferred-music-list" class="preferred-music-list music-saved-list">
          ${preferred.length ? preferred.map((item) => `
            <article class="preferred-music-item music-saved-item">
              <div class="music-saved-info"><span class="music-provider-badge">${escapeHtml(item.provider === 'spotify' ? 'Spotify' : 'YouTube')}</span><strong>${escapeHtml(item.title)}</strong>${bookIds.includes(item.id) ? '<small>Saved for this book</small>' : ''}</div>
              <div class="preferred-music-actions"><button class="primary" type="button" data-play-preferred="${escapeHtml(item.id)}">Play</button>${bookKey ? `<button class="secondary" type="button" data-attach-book-music="${escapeHtml(item.id)}">${bookIds.includes(item.id) ? 'Remove from book' : 'Save for book'}</button>` : ''}<button class="text-button danger-text" type="button" data-remove-preferred="${escapeHtml(item.id)}">Delete</button></div>
            </article>`).join('') : '<div class="music-empty-state"><strong>No saved music yet</strong><span>Play a link above, then choose “Save to My Music.”</span></div>'}
        </div>
      </section>

      ${bookKey && bookItems.length ? `<details class="music-book-details"><summary>Music saved for ${currentBookLabel} <span>${bookItems.length}</span></summary><div class="preferred-music-list">${bookItems.map((item) => `<article class="preferred-music-item"><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.source || 'Music')}</span></div><div class="preferred-music-actions"><button class="secondary" type="button" data-play-preferred="${escapeHtml(item.id)}">Play</button><button class="text-button" type="button" data-detach-book-music="${escapeHtml(item.id)}">Remove</button></div></article>`).join('')}</div></details>` : ''}

      <details class="music-browse-details">
        <summary>Browse more focus music <span>${musicChoices.length}</span></summary>
        <div class="music-browse-list">
          ${musicChoices.map((item) => `<article><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.description)}</span></div><div><button class="secondary" type="button" data-play-music="${escapeHtml(item.id)}">Play</button><button class="text-button" type="button" data-save-music="${escapeHtml(item.id)}">Save</button></div></article>`).join('')}
        </div>
      </details>

      <p class="library-note music-service-note">Playback is provided by Spotify or YouTube. Mark, Set, Go! stores only links and book associations.</p>
    </section>`;

  app.querySelectorAll('[data-play-music]').forEach((button) => button.addEventListener('click', () => {
    const choice = musicChoices.find((item) => item.id === button.dataset.playMusic);
    if (choice) playMusic(choice);
  }));
  app.querySelectorAll('[data-save-music]').forEach((button) => button.addEventListener('click', () => {
    const choice = musicChoices.find((item) => item.id === button.dataset.saveMusic);
    if (!choice) return;
    const added = addPreferredMusic({ title: choice.title, source: choice.category, provider: 'youtube', choiceId: choice.id });
    button.textContent = added ? 'Saved ✓' : 'Saved';
    button.disabled = true;
  }));
  app.querySelectorAll('[data-play-preferred]').forEach((button) => button.addEventListener('click', () => playPreferredMusic(button.dataset.playPreferred)));
  app.querySelectorAll('[data-remove-preferred]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.removePreferred;
    removePreferredMusic(id);
    const map = getBookMusicMap();
    Object.keys(map).forEach((key) => { map[key] = (map[key] || []).filter((itemId) => itemId !== id); });
    try { localStorage.setItem(bookMusicStorageKey, JSON.stringify(map)); } catch {}
    renderMusicLibrary();
  }));
  app.querySelectorAll('[data-attach-book-music]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.attachBookMusic;
    if (bookIds.includes(id)) detachMusicFromCurrentBook(id);
    else attachMusicToCurrentBook(id);
    renderMusicLibrary();
  }));
  app.querySelectorAll('[data-detach-book-music]').forEach((button) => button.addEventListener('click', () => {
    detachMusicFromCurrentBook(button.dataset.detachBookMusic);
    renderMusicLibrary();
  }));

  const parseFormMusic = () => {
    const parsed = parseMusicInput(app.querySelector('#music-service-url')?.value);
    const customName = app.querySelector('#music-service-name')?.value.trim();
    if (customName) parsed.title = customName;
    return parsed;
  };
  const saveFormMusic = (attachToBook = false) => {
    const status = app.querySelector('#music-service-status');
    try {
      const parsed = parseFormMusic();
      const before = getPreferredMusic();
      const added = addPreferredMusic({ title: parsed.title, source: parsed.source, provider: parsed.provider || 'youtube', src: parsed.src, originalUrl: parsed.originalUrl || '' });
      const after = getPreferredMusic();
      const saved = after.find((item) => !before.some((oldItem) => oldItem.id === item.id)) || after.find((item) => item.src === parsed.src || item.originalUrl === parsed.originalUrl);
      if (attachToBook && saved && bookKey) attachMusicToCurrentBook(saved.id);
      status.className = 'status';
      status.textContent = attachToBook ? `Saved “${parsed.title}” for this book.` : (added ? `Saved “${parsed.title}” to My Music.` : 'That selection is already saved.');
      window.setTimeout(renderMusicLibrary, 500);
    } catch (error) {
      status.className = 'status error';
      status.textContent = error.message;
    }
  };
  app.querySelector('#music-url-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const status = app.querySelector('#music-service-status');
    try {
      const parsed = parseFormMusic();
      playMusic(parsed);
      status.className = 'status';
      status.textContent = `Now playing ${parsed.title}.`;
    } catch (error) {
      status.className = 'status error';
      status.textContent = error.message;
    }
  });
  app.querySelector('#save-music-preferred')?.addEventListener('click', () => saveFormMusic(false));
  app.querySelector('#save-music-to-book')?.addEventListener('click', () => saveFormMusic(true));
}

async function loadBillboardSongs() {
  const status = app.querySelector('#billboard-status');
  const list = app.querySelector('#billboard-list');
  if (!status || !list) return;
  try {
    const payload = await loadApiPayload('/api/music/billboard');
    const songs = Array.isArray(payload.songs) ? payload.songs.slice(0, 25) : [];
    if (!songs.length) throw new Error('The current chart could not be parsed.');
    status.textContent = payload.chartDate ? `Chart dated ${payload.chartDate}` : 'Current chart';
    list.innerHTML = songs.map((song) => {
      const query = encodeURIComponent(`${song.title} ${song.artist} official audio`);
      return `<li><span class="billboard-rank">${song.rank}</span><div><strong>${escapeHtml(song.title)}</strong><span>${escapeHtml(song.artist)}</span></div><a class="secondary button-link" href="https://www.youtube.com/results?search_query=${query}" target="_blank" rel="noopener noreferrer">Find on YouTube</a></li>`;
    }).join('');
  } catch (error) {
    status.className = 'status error';
    status.textContent = `${error.message} You can still open Billboard or paste any YouTube link above.`;
  }
}


const greatBooksCatalog = [
  {
    "volume": 0,
    "era": "Bible",
    "author": "The Bible",
    "title": "Exodus",
    "query": "Bible Exodus"
  },
  {
    "volume": 0,
    "era": "Bible",
    "author": "The Bible",
    "title": "Genesis",
    "query": "Bible Genesis"
  },
  {
    "volume": 0,
    "era": "Bible",
    "author": "The Bible",
    "title": "Isaiah",
    "query": "Bible Isaiah"
  },
  {
    "volume": 0,
    "era": "Bible",
    "author": "The Bible",
    "title": "Proverbs",
    "query": "Bible Proverbs"
  },
  {
    "volume": 0,
    "era": "Bible",
    "author": "The Bible",
    "title": "Psalms",
    "query": "Bible Psalms"
  },
  {
    "volume": 0,
    "era": "Bible",
    "author": "The Bible",
    "title": "Revelation",
    "query": "Bible Revelation"
  },
  {
    "volume": 0,
    "era": "Bible",
    "author": "The Bible",
    "title": "The Acts of the Apostles",
    "query": "Bible Acts"
  },
  {
    "volume": 0,
    "era": "Bible",
    "author": "The Bible",
    "title": "The Epistle to the Romans",
    "query": "Bible Romans"
  },
  {
    "volume": 0,
    "era": "Bible",
    "author": "The Bible",
    "title": "The Gospel According to John",
    "query": "Bible John"
  },
  {
    "volume": 0,
    "era": "Bible",
    "author": "The Bible",
    "title": "The Gospel According to Matthew",
    "query": "Bible Matthew"
  },
  {
    "volume": 3,
    "era": "Ancient",
    "author": "Homer",
    "title": "The Iliad",
    "query": "Iliad Homer"
  },
  {
    "volume": 3,
    "era": "Ancient",
    "author": "Homer",
    "title": "The Odyssey",
    "query": "Odyssey Homer"
  },
  {
    "volume": 4,
    "era": "Ancient Drama",
    "author": "Aeschylus",
    "title": "Agamemnon",
    "query": "Aeschylus Agamemnon"
  },
  {
    "volume": 4,
    "era": "Ancient Drama",
    "author": "Aeschylus",
    "title": "Plays",
    "query": "Aeschylus plays"
  },
  {
    "volume": 4,
    "era": "Ancient Drama",
    "author": "Aeschylus",
    "title": "Prometheus Bound",
    "query": "Aeschylus Prometheus Bound"
  },
  {
    "volume": 4,
    "era": "Ancient Drama",
    "author": "Aeschylus",
    "title": "The Eumenides",
    "query": "Aeschylus Eumenides"
  },
  {
    "volume": 4,
    "era": "Ancient Drama",
    "author": "Aeschylus",
    "title": "The Libation Bearers",
    "query": "Aeschylus Libation Bearers"
  },
  {
    "volume": 4,
    "era": "Ancient Drama",
    "author": "Aristophanes",
    "title": "Plays",
    "query": "Aristophanes plays"
  },
  {
    "volume": 4,
    "era": "Ancient Drama",
    "author": "Aristophanes",
    "title": "The Birds",
    "query": "Aristophanes Birds"
  },
  {
    "volume": 4,
    "era": "Ancient Drama",
    "author": "Aristophanes",
    "title": "The Clouds",
    "query": "Aristophanes Clouds"
  },
  {
    "volume": 4,
    "era": "Ancient Drama",
    "author": "Aristophanes",
    "title": "The Frogs",
    "query": "Aristophanes Frogs"
  },
  {
    "volume": 4,
    "era": "Ancient Drama",
    "author": "Euripides",
    "title": "Hippolytus",
    "query": "Euripides Hippolytus"
  },
  {
    "volume": 4,
    "era": "Ancient Drama",
    "author": "Euripides",
    "title": "Medea",
    "query": "Euripides Medea"
  },
  {
    "volume": 4,
    "era": "Ancient Drama",
    "author": "Euripides",
    "title": "Plays",
    "query": "Euripides plays"
  },
  {
    "volume": 4,
    "era": "Ancient Drama",
    "author": "Euripides",
    "title": "The Bacchae",
    "query": "Euripides Bacchae"
  },
  {
    "volume": 4,
    "era": "Ancient Drama",
    "author": "Sophocles",
    "title": "Antigone",
    "query": "Sophocles Antigone"
  },
  {
    "volume": 4,
    "era": "Ancient Drama",
    "author": "Sophocles",
    "title": "Oedipus at Colonus",
    "query": "Sophocles Oedipus Colonus"
  },
  {
    "volume": 4,
    "era": "Ancient Drama",
    "author": "Sophocles",
    "title": "Oedipus the King",
    "query": "Sophocles Oedipus Rex"
  },
  {
    "volume": 4,
    "era": "Ancient Drama",
    "author": "Sophocles",
    "title": "Plays",
    "query": "Sophocles plays"
  },
  {
    "volume": 5,
    "era": "Ancient History",
    "author": "Herodotus",
    "title": "The History of the Persian Wars",
    "query": "Herodotus Persian Wars"
  },
  {
    "volume": 5,
    "era": "Ancient History",
    "author": "Thucydides",
    "title": "The History of the Peloponnesian War",
    "query": "Thucydides Peloponnesian War"
  },
  {
    "volume": 6,
    "era": "Ancient Philosophy",
    "author": "Plato",
    "title": "Apology",
    "query": "Plato Apology"
  },
  {
    "volume": 6,
    "era": "Ancient Philosophy",
    "author": "Plato",
    "title": "Crito",
    "query": "Plato Crito"
  },
  {
    "volume": 6,
    "era": "Ancient Philosophy",
    "author": "Plato",
    "title": "Dialogues and The Seventh Letter",
    "query": "Plato Dialogues"
  },
  {
    "volume": 6,
    "era": "Ancient Philosophy",
    "author": "Plato",
    "title": "Laws",
    "query": "Plato Laws"
  },
  {
    "volume": 6,
    "era": "Ancient Philosophy",
    "author": "Plato",
    "title": "Phaedo",
    "query": "Plato Phaedo"
  },
  {
    "volume": 6,
    "era": "Ancient Philosophy",
    "author": "Plato",
    "title": "Phaedrus",
    "query": "Plato Phaedrus"
  },
  {
    "volume": 6,
    "era": "Ancient Philosophy",
    "author": "Plato",
    "title": "Republic",
    "query": "Plato Republic"
  },
  {
    "volume": 6,
    "era": "Ancient Philosophy",
    "author": "Plato",
    "title": "Symposium",
    "query": "Plato Symposium"
  },
  {
    "volume": 6,
    "era": "Ancient Philosophy",
    "author": "Plato",
    "title": "Theaetetus",
    "query": "Plato Theaetetus"
  },
  {
    "volume": 6,
    "era": "Ancient Philosophy",
    "author": "Plato",
    "title": "Timaeus",
    "query": "Plato Timaeus"
  },
  {
    "volume": 7,
    "era": "Ancient Philosophy",
    "author": "Aristotle",
    "title": "Categories",
    "query": "Aristotle Categories"
  },
  {
    "volume": 7,
    "era": "Ancient Philosophy",
    "author": "Aristotle",
    "title": "Metaphysics",
    "query": "Aristotle Metaphysics"
  },
  {
    "volume": 7,
    "era": "Ancient Philosophy",
    "author": "Aristotle",
    "title": "On Interpretation",
    "query": "Aristotle On Interpretation"
  },
  {
    "volume": 7,
    "era": "Ancient Philosophy",
    "author": "Aristotle",
    "title": "Physics",
    "query": "Aristotle Physics"
  },
  {
    "volume": 7,
    "era": "Ancient Philosophy",
    "author": "Aristotle",
    "title": "Posterior Analytics",
    "query": "Aristotle Posterior Analytics"
  },
  {
    "volume": 7,
    "era": "Ancient Philosophy",
    "author": "Aristotle",
    "title": "Prior Analytics",
    "query": "Aristotle Prior Analytics"
  },
  {
    "volume": 7,
    "era": "Ancient Philosophy",
    "author": "Aristotle",
    "title": "Works, Volume I",
    "query": "Aristotle works"
  },
  {
    "volume": 8,
    "era": "Ancient Philosophy",
    "author": "Aristotle",
    "title": "Nicomachean Ethics",
    "query": "Aristotle Nicomachean Ethics"
  },
  {
    "volume": 8,
    "era": "Ancient Philosophy",
    "author": "Aristotle",
    "title": "On the Soul",
    "query": "Aristotle On the Soul"
  },
  {
    "volume": 8,
    "era": "Ancient Philosophy",
    "author": "Aristotle",
    "title": "Poetics",
    "query": "Aristotle Poetics"
  },
  {
    "volume": 8,
    "era": "Ancient Philosophy",
    "author": "Aristotle",
    "title": "Politics",
    "query": "Aristotle Politics"
  },
  {
    "volume": 8,
    "era": "Ancient Philosophy",
    "author": "Aristotle",
    "title": "Rhetoric",
    "query": "Aristotle Rhetoric"
  },
  {
    "volume": 8,
    "era": "Ancient Philosophy",
    "author": "Aristotle",
    "title": "Works, Volume II",
    "query": "Aristotle works"
  },
  {
    "volume": 9,
    "era": "Ancient Science & Medicine",
    "author": "Galen",
    "title": "On the Natural Faculties",
    "query": "Galen Natural Faculties"
  },
  {
    "volume": 9,
    "era": "Ancient Science & Medicine",
    "author": "Hippocrates",
    "title": "Works",
    "query": "Hippocrates works"
  },
  {
    "volume": 10,
    "era": "Ancient Mathematics",
    "author": "Archimedes",
    "title": "Works",
    "query": "Archimedes works"
  },
  {
    "volume": 10,
    "era": "Ancient Mathematics",
    "author": "Euclid",
    "title": "Elements",
    "query": "Euclid Elements"
  },
  {
    "volume": 10,
    "era": "Ancient Mathematics",
    "author": "Nicomachus",
    "title": "Introduction to Arithmetic",
    "query": "Nicomachus Introduction Arithmetic"
  },
  {
    "volume": 11,
    "era": "Ancient Philosophy",
    "author": "Epictetus",
    "title": "Discourses",
    "query": "Epictetus Discourses"
  },
  {
    "volume": 11,
    "era": "Ancient Philosophy",
    "author": "Lucretius",
    "title": "The Way Things Are",
    "query": "Lucretius Nature Things"
  },
  {
    "volume": 11,
    "era": "Ancient Philosophy",
    "author": "Marcus Aurelius",
    "title": "Meditations",
    "query": "Marcus Aurelius Meditations"
  },
  {
    "volume": 11,
    "era": "Ancient Philosophy",
    "author": "Plotinus",
    "title": "The Six Enneads",
    "query": "Plotinus Enneads"
  },
  {
    "volume": 12,
    "era": "Roman Literature",
    "author": "Virgil",
    "title": "Eclogues, Georgics, and The Aeneid",
    "query": "Virgil Aeneid"
  },
  {
    "volume": 13,
    "era": "Roman History",
    "author": "Plutarch",
    "title": "The Lives of the Noble Grecians and Romans",
    "query": "Plutarch Lives"
  },
  {
    "volume": 14,
    "era": "Roman History",
    "author": "Tacitus",
    "title": "The Annals and The Histories",
    "query": "Tacitus Annals Histories"
  },
  {
    "volume": 15,
    "era": "Astronomy",
    "author": "Johannes Kepler",
    "title": "Epitome of Copernican Astronomy and Harmonies of the World",
    "query": "Kepler Copernican Astronomy Harmonies World"
  },
  {
    "volume": 15,
    "era": "Astronomy",
    "author": "Nicolaus Copernicus",
    "title": "On the Revolutions of the Heavenly Spheres",
    "query": "Copernicus Revolutions Heavenly Spheres"
  },
  {
    "volume": 15,
    "era": "Astronomy",
    "author": "Ptolemy",
    "title": "The Almagest",
    "query": "Ptolemy Almagest"
  },
  {
    "volume": 16,
    "era": "Christian Thought",
    "author": "Saint Augustine",
    "title": "On Christian Doctrine",
    "query": "Augustine Christian Doctrine"
  },
  {
    "volume": 16,
    "era": "Christian Thought",
    "author": "Saint Augustine",
    "title": "The City of God",
    "query": "Augustine City of God"
  },
  {
    "volume": 16,
    "era": "Christian Thought",
    "author": "Saint Augustine",
    "title": "The Confessions",
    "query": "Augustine Confessions"
  },
  {
    "volume": 17,
    "era": "Medieval Philosophy & Theology",
    "author": "Thomas Aquinas",
    "title": "Summa Theologica, Part I",
    "query": "Aquinas Summa Theologica"
  },
  {
    "volume": 18,
    "era": "Medieval Philosophy & Theology",
    "author": "Thomas Aquinas",
    "title": "Summa Theologica, Part II",
    "query": "Aquinas Summa Theologica"
  },
  {
    "volume": 19,
    "era": "Medieval Literature",
    "author": "Dante Alighieri",
    "title": "The Divine Comedy",
    "query": "Dante Divine Comedy"
  },
  {
    "volume": 19,
    "era": "Medieval Literature",
    "author": "Geoffrey Chaucer",
    "title": "The Canterbury Tales",
    "query": "Chaucer Canterbury Tales"
  },
  {
    "volume": 19,
    "era": "Medieval Literature",
    "author": "Geoffrey Chaucer",
    "title": "Troilus and Criseyde",
    "query": "Chaucer Troilus Criseyde"
  },
  {
    "volume": 20,
    "era": "Reformation",
    "author": "John Calvin",
    "title": "Institutes of the Christian Religion",
    "query": "Calvin Institutes Christian Religion"
  },
  {
    "volume": 21,
    "era": "Political Philosophy",
    "author": "Niccolò Machiavelli",
    "title": "The Prince",
    "query": "Machiavelli Prince"
  },
  {
    "volume": 21,
    "era": "Political Philosophy",
    "author": "Thomas Hobbes",
    "title": "Leviathan",
    "query": "Hobbes Leviathan"
  },
  {
    "volume": 22,
    "era": "Renaissance Literature",
    "author": "François Rabelais",
    "title": "Gargantua and Pantagruel",
    "query": "Rabelais Gargantua Pantagruel"
  },
  {
    "volume": 23,
    "era": "Renaissance Thought",
    "author": "Desiderius Erasmus",
    "title": "Praise of Folly",
    "query": "Erasmus Praise Folly"
  },
  {
    "volume": 23,
    "era": "Renaissance Thought",
    "author": "Michel de Montaigne",
    "title": "Essays",
    "query": "Montaigne Essays"
  },
  {
    "volume": 23,
    "era": "Renaissance",
    "author": "Michel de Montaigne",
    "title": "Of Cannibals",
    "query": "Montaigne Of Cannibals"
  },
  {
    "volume": 23,
    "era": "Renaissance",
    "author": "Michel de Montaigne",
    "title": "Of Experience",
    "query": "Montaigne Of Experience"
  },
  {
    "volume": 24,
    "era": "Drama",
    "author": "William Shakespeare",
    "title": "Hamlet",
    "query": "Shakespeare Hamlet"
  },
  {
    "volume": 24,
    "era": "Drama",
    "author": "William Shakespeare",
    "title": "Julius Caesar",
    "query": "Shakespeare Julius Caesar"
  },
  {
    "volume": 24,
    "era": "Drama",
    "author": "William Shakespeare",
    "title": "King Lear",
    "query": "Shakespeare King Lear"
  },
  {
    "volume": 24,
    "era": "Drama",
    "author": "William Shakespeare",
    "title": "Macbeth",
    "query": "Shakespeare Macbeth"
  },
  {
    "volume": 24,
    "era": "Drama",
    "author": "William Shakespeare",
    "title": "Othello",
    "query": "Shakespeare Othello"
  },
  {
    "volume": 24,
    "era": "Shakespeare",
    "author": "William Shakespeare",
    "title": "Plays, Volume I",
    "query": "Shakespeare plays"
  },
  {
    "volume": 24,
    "era": "Drama",
    "author": "William Shakespeare",
    "title": "Romeo and Juliet",
    "query": "Shakespeare Romeo Juliet"
  },
  {
    "volume": 24,
    "era": "Drama",
    "author": "William Shakespeare",
    "title": "The Tempest",
    "query": "Shakespeare Tempest"
  },
  {
    "volume": 25,
    "era": "Drama",
    "author": "William Shakespeare",
    "title": "A Midsummer Night's Dream",
    "query": "Shakespeare Midsummer Night Dream"
  },
  {
    "volume": 25,
    "era": "Drama",
    "author": "William Shakespeare",
    "title": "Much Ado About Nothing",
    "query": "Shakespeare Much Ado"
  },
  {
    "volume": 25,
    "era": "Shakespeare",
    "author": "William Shakespeare",
    "title": "Plays, Volume II and Sonnets",
    "query": "Shakespeare Sonnets plays"
  },
  {
    "volume": 25,
    "era": "Poetry",
    "author": "William Shakespeare",
    "title": "Sonnets",
    "query": "Shakespeare Sonnets"
  },
  {
    "volume": 25,
    "era": "Drama",
    "author": "William Shakespeare",
    "title": "The Merchant of Venice",
    "query": "Shakespeare Merchant Venice"
  },
  {
    "volume": 25,
    "era": "Drama",
    "author": "William Shakespeare",
    "title": "Twelfth Night",
    "query": "Shakespeare Twelfth Night"
  },
  {
    "volume": 26,
    "era": "Early Modern Science",
    "author": "Galileo Galilei",
    "title": "Dialogues Concerning the Two New Sciences",
    "query": "Galileo Two New Sciences"
  },
  {
    "volume": 26,
    "era": "Early Modern Science",
    "author": "William Gilbert",
    "title": "On the Loadstone and Magnetic Bodies",
    "query": "William Gilbert Loadstone"
  },
  {
    "volume": 26,
    "era": "Early Modern Science",
    "author": "William Harvey",
    "title": "Works on the Heart, Blood, and Generation",
    "query": "William Harvey heart blood animals"
  },
  {
    "volume": 27,
    "era": "Early Modern Literature",
    "author": "Miguel de Cervantes",
    "title": "Don Quixote",
    "query": "Cervantes Don Quixote"
  },
  {
    "volume": 28,
    "era": "Early Modern Philosophy",
    "author": "Benedict de Spinoza",
    "title": "Ethics",
    "query": "Spinoza Ethics"
  },
  {
    "volume": 28,
    "era": "Early Modern Philosophy",
    "author": "Francis Bacon",
    "title": "Advancement of Learning, Novum Organum, and New Atlantis",
    "query": "Francis Bacon Novum Organum"
  },
  {
    "volume": 28,
    "era": "Early Modern Philosophy",
    "author": "Francis Bacon",
    "title": "New Atlantis",
    "query": "Bacon New Atlantis"
  },
  {
    "volume": 28,
    "era": "Early Modern Philosophy",
    "author": "Francis Bacon",
    "title": "Novum Organum",
    "query": "Bacon Novum Organum"
  },
  {
    "volume": 28,
    "era": "Early Modern Philosophy",
    "author": "Francis Bacon",
    "title": "The Advancement of Learning",
    "query": "Bacon Advancement Learning"
  },
  {
    "volume": 28,
    "era": "Early Modern Philosophy",
    "author": "René Descartes",
    "title": "Discourse on the Method",
    "query": "Descartes Discourse Method"
  },
  {
    "volume": 28,
    "era": "Early Modern Philosophy",
    "author": "René Descartes",
    "title": "Major Philosophical Works",
    "query": "Descartes Discourse Method Meditations"
  },
  {
    "volume": 28,
    "era": "Early Modern Philosophy",
    "author": "René Descartes",
    "title": "Meditations on First Philosophy",
    "query": "Descartes Meditations"
  },
  {
    "volume": 29,
    "era": "Early Modern Literature",
    "author": "John Milton",
    "title": "Paradise Lost and Other Works",
    "query": "Milton Paradise Lost"
  },
  {
    "volume": 30,
    "era": "Philosophy & Science",
    "author": "Blaise Pascal",
    "title": "Pensées",
    "query": "Pascal Pensees"
  },
  {
    "volume": 30,
    "era": "Early Modern Thought",
    "author": "Blaise Pascal",
    "title": "Provincial Letters, Pensées, and Scientific Treatises",
    "query": "Pascal Pensees"
  },
  {
    "volume": 31,
    "era": "French Drama",
    "author": "Jean Racine",
    "title": "Berenice and Phaedra",
    "query": "Racine Phaedra Berenice"
  },
  {
    "volume": 31,
    "era": "French Drama",
    "author": "Molière",
    "title": "Major Plays",
    "query": "Moliere plays"
  },
  {
    "volume": 32,
    "era": "Science",
    "author": "Christiaan Huygens",
    "title": "Treatise on Light",
    "query": "Huygens Treatise Light"
  },
  {
    "volume": 32,
    "era": "Science",
    "author": "Isaac Newton",
    "title": "Mathematical Principles of Natural Philosophy and Optics",
    "query": "Newton Principia Opticks"
  },
  {
    "volume": 33,
    "era": "Enlightenment Philosophy",
    "author": "David Hume",
    "title": "An Enquiry Concerning Human Understanding",
    "query": "Hume Enquiry Human Understanding"
  },
  {
    "volume": 33,
    "era": "Enlightenment Philosophy",
    "author": "George Berkeley",
    "title": "The Principles of Human Knowledge",
    "query": "Berkeley Human Knowledge"
  },
  {
    "volume": 33,
    "era": "Empiricism",
    "author": "John Locke",
    "title": "A Letter Concerning Toleration",
    "query": "Locke Letter Toleration"
  },
  {
    "volume": 33,
    "era": "Enlightenment Philosophy",
    "author": "John Locke",
    "title": "A Letter Concerning Toleration, Civil Government, and Human Understanding",
    "query": "Locke Human Understanding Government"
  },
  {
    "volume": 33,
    "era": "Empiricism",
    "author": "John Locke",
    "title": "An Essay Concerning Human Understanding",
    "query": "Locke Human Understanding"
  },
  {
    "volume": 33,
    "era": "Empiricism",
    "author": "John Locke",
    "title": "Second Treatise of Government",
    "query": "Locke Second Treatise Government"
  },
  {
    "volume": 34,
    "era": "Enlightenment Literature",
    "author": "Denis Diderot",
    "title": "Rameau’s Nephew",
    "query": "Diderot Rameau Nephew"
  },
  {
    "volume": 34,
    "era": "Enlightenment Literature",
    "author": "Jonathan Swift",
    "title": "Gulliver’s Travels",
    "query": "Swift Gulliver Travels"
  },
  {
    "volume": 34,
    "era": "Enlightenment Literature",
    "author": "Voltaire",
    "title": "Candide",
    "query": "Voltaire Candide"
  },
  {
    "volume": 35,
    "era": "Political Philosophy",
    "author": "Jean-Jacques Rousseau",
    "title": "Discourse on Inequality",
    "query": "Rousseau Discourse Inequality"
  },
  {
    "volume": 35,
    "era": "Political Philosophy",
    "author": "Jean-Jacques Rousseau",
    "title": "Political Writings including The Social Contract",
    "query": "Rousseau Social Contract"
  },
  {
    "volume": 35,
    "era": "Political Philosophy",
    "author": "Jean-Jacques Rousseau",
    "title": "The Social Contract",
    "query": "Rousseau Social Contract"
  },
  {
    "volume": 35,
    "era": "Political Philosophy",
    "author": "Montesquieu",
    "title": "The Spirit of Laws",
    "query": "Montesquieu Spirit Laws"
  },
  {
    "volume": 36,
    "era": "Economics",
    "author": "Adam Smith",
    "title": "The Wealth of Nations",
    "query": "Adam Smith Wealth Nations"
  },
  {
    "volume": 37,
    "era": "History",
    "author": "Edward Gibbon",
    "title": "The Decline and Fall of the Roman Empire, Volume I",
    "query": "Gibbon Decline Fall Roman Empire"
  },
  {
    "volume": 38,
    "era": "History",
    "author": "Edward Gibbon",
    "title": "The Decline and Fall of the Roman Empire, Volume II",
    "query": "Gibbon Decline Fall Roman Empire"
  },
  {
    "volume": 39,
    "era": "Modern Philosophy",
    "author": "Immanuel Kant",
    "title": "Major Critical and Moral Works",
    "query": "Kant Critique Pure Reason"
  },
  {
    "volume": 40,
    "era": "American Political Thought",
    "author": "Alexander Hamilton, James Madison, John Jay",
    "title": "The Federalist Papers",
    "query": "Federalist Papers"
  },
  {
    "volume": 40,
    "era": "Political Philosophy",
    "author": "John Stuart Mill",
    "title": "On Liberty",
    "query": "Mill On Liberty"
  },
  {
    "volume": 40,
    "era": "Liberal Political Thought",
    "author": "John Stuart Mill",
    "title": "On Liberty, Representative Government, and Utilitarianism",
    "query": "John Stuart Mill On Liberty"
  },
  {
    "volume": 40,
    "era": "Political Philosophy",
    "author": "John Stuart Mill",
    "title": "Utilitarianism",
    "query": "Mill Utilitarianism"
  },
  {
    "volume": 40,
    "era": "American Political Thought",
    "author": "United States",
    "title": "Declaration, Articles of Confederation, and Constitution",
    "query": "United States Constitution Declaration Independence"
  },
  {
    "volume": 41,
    "era": "Biography",
    "author": "James Boswell",
    "title": "The Life of Samuel Johnson",
    "query": "Boswell Life Samuel Johnson"
  },
  {
    "volume": 42,
    "era": "Science",
    "author": "Antoine Lavoisier",
    "title": "Elements of Chemistry",
    "query": "Lavoisier Elements Chemistry"
  },
  {
    "volume": 42,
    "era": "Science",
    "author": "Michael Faraday",
    "title": "Experimental Researches in Electricity",
    "query": "Faraday Experimental Researches Electricity"
  },
  {
    "volume": 43,
    "era": "Modern Philosophy",
    "author": "Friedrich Nietzsche",
    "title": "Beyond Good and Evil",
    "query": "Nietzsche Beyond Good Evil"
  },
  {
    "volume": 43,
    "era": "Modern Philosophy",
    "author": "G. W. F. Hegel",
    "title": "The Philosophy of Right and The Philosophy of History",
    "query": "Hegel Philosophy Right History"
  },
  {
    "volume": 43,
    "era": "Modern Philosophy",
    "author": "Søren Kierkegaard",
    "title": "Fear and Trembling",
    "query": "Kierkegaard Fear Trembling"
  },
  {
    "volume": 44,
    "era": "Political Thought",
    "author": "Alexis de Tocqueville",
    "title": "Democracy in America",
    "query": "Tocqueville Democracy America"
  },
  {
    "volume": 45,
    "era": "Literature",
    "author": "Honoré de Balzac",
    "title": "Cousin Bette",
    "query": "Balzac Cousin Bette"
  },
  {
    "volume": 45,
    "era": "Literature",
    "author": "Johann Wolfgang von Goethe",
    "title": "Faust",
    "query": "Goethe Faust"
  },
  {
    "volume": 46,
    "era": "Literature",
    "author": "George Eliot",
    "title": "Middlemarch",
    "query": "George Eliot Middlemarch"
  },
  {
    "volume": 46,
    "era": "Literature",
    "author": "Jane Austen",
    "title": "Emma",
    "query": "Jane Austen Emma"
  },
  {
    "volume": 47,
    "era": "Literature",
    "author": "Charles Dickens",
    "title": "Little Dorrit",
    "query": "Dickens Little Dorrit"
  },
  {
    "volume": 48,
    "era": "Literature",
    "author": "Herman Melville",
    "title": "Moby-Dick",
    "query": "Melville Moby Dick"
  },
  {
    "volume": 48,
    "era": "Literature",
    "author": "Mark Twain",
    "title": "Adventures of Huckleberry Finn",
    "query": "Mark Twain Huckleberry Finn"
  },
  {
    "volume": 49,
    "era": "Science",
    "author": "Charles Darwin",
    "title": "The Descent of Man",
    "query": "Darwin Descent Man"
  },
  {
    "volume": 49,
    "era": "Science",
    "author": "Charles Darwin",
    "title": "The Origin of Species",
    "query": "Darwin Origin Species"
  },
  {
    "volume": 50,
    "era": "Political Economy",
    "author": "Karl Marx",
    "title": "Capital, Volume I",
    "query": "Marx Capital Volume 1"
  },
  {
    "volume": 50,
    "era": "Political Economy",
    "author": "Karl Marx and Friedrich Engels",
    "title": "Manifesto of the Communist Party",
    "query": "Communist Manifesto Marx Engels"
  },
  {
    "volume": 51,
    "era": "Literature",
    "author": "Leo Tolstoy",
    "title": "War and Peace",
    "query": "Tolstoy War Peace"
  },
  {
    "volume": 52,
    "era": "Literature",
    "author": "Fyodor Dostoevsky",
    "title": "The Brothers Karamazov",
    "query": "Dostoevsky Brothers Karamazov"
  },
  {
    "volume": 52,
    "era": "Literature",
    "author": "Henrik Ibsen",
    "title": "A Doll’s House, The Wild Duck, Hedda Gabler, and The Master Builder",
    "query": "Ibsen plays"
  },
  {
    "volume": 53,
    "era": "Psychology",
    "author": "William James",
    "title": "The Principles of Psychology",
    "query": "William James Principles Psychology"
  },
  {
    "volume": 54,
    "era": "Psychology",
    "author": "Sigmund Freud",
    "title": "Major Works",
    "query": "Freud Interpretation Dreams Psychoanalysis"
  },
  {
    "volume": 55,
    "era": "20th Century Philosophy & Religion",
    "author": "Alfred North Whitehead",
    "title": "Science and the Modern World",
    "query": "Whitehead Science Modern World"
  },
  {
    "volume": 55,
    "era": "20th Century Philosophy & Religion",
    "author": "Bertrand Russell",
    "title": "The Problems of Philosophy",
    "query": "Russell Problems Philosophy"
  },
  {
    "volume": 55,
    "era": "20th Century Philosophy & Religion",
    "author": "Henri Bergson",
    "title": "An Introduction to Metaphysics",
    "query": "Bergson Introduction Metaphysics"
  },
  {
    "volume": 55,
    "era": "20th Century Philosophy & Religion",
    "author": "John Dewey",
    "title": "Experience and Education",
    "query": "Dewey Experience Education"
  },
  {
    "volume": 55,
    "era": "20th Century Philosophy & Religion",
    "author": "Karl Barth",
    "title": "The Word of God and the Word of Man",
    "query": "Karl Barth Word God Word Man"
  },
  {
    "volume": 55,
    "era": "20th Century Philosophy & Religion",
    "author": "Ludwig Wittgenstein",
    "title": "Philosophical Investigations",
    "query": "Wittgenstein Philosophical Investigations"
  },
  {
    "volume": 55,
    "era": "20th Century Philosophy & Religion",
    "author": "Martin Heidegger",
    "title": "What Is Metaphysics?",
    "query": "Heidegger What Is Metaphysics"
  },
  {
    "volume": 55,
    "era": "20th Century Philosophy & Religion",
    "author": "William James",
    "title": "Pragmatism",
    "query": "William James Pragmatism"
  },
  {
    "volume": 56,
    "era": "20th Century Science",
    "author": "Albert Einstein",
    "title": "Relativity: The Special and General Theory",
    "query": "Einstein Relativity"
  },
  {
    "volume": 56,
    "era": "20th Century Natural Science",
    "author": "Albert Einstein",
    "title": "Relativity: The Special and the General Theory",
    "query": "Einstein Relativity"
  },
  {
    "volume": 56,
    "era": "20th Century Natural Science",
    "author": "Alfred North Whitehead",
    "title": "An Introduction to Mathematics",
    "query": "Whitehead Introduction Mathematics"
  },
  {
    "volume": 56,
    "era": "20th Century Natural Science",
    "author": "Arthur Eddington",
    "title": "The Expanding Universe",
    "query": "Eddington Expanding Universe"
  },
  {
    "volume": 56,
    "era": "20th Century Natural Science",
    "author": "C. H. Waddington",
    "title": "The Nature of Life",
    "query": "Waddington Nature Life"
  },
  {
    "volume": 56,
    "era": "20th Century Natural Science",
    "author": "Erwin Schrödinger",
    "title": "What Is Life?",
    "query": "Schrodinger What Is Life"
  },
  {
    "volume": 56,
    "era": "20th Century Science",
    "author": "G. H. Hardy",
    "title": "A Mathematician's Apology",
    "query": "Hardy Mathematician Apology"
  },
  {
    "volume": 56,
    "era": "20th Century Natural Science",
    "author": "G. H. Hardy",
    "title": "A Mathematician’s Apology",
    "query": "Hardy Mathematician Apology"
  },
  {
    "volume": 56,
    "era": "20th Century Natural Science",
    "author": "Henri Poincaré",
    "title": "Science and Hypothesis",
    "query": "Poincare Science Hypothesis"
  },
  {
    "volume": 56,
    "era": "20th Century Natural Science",
    "author": "Max Planck",
    "title": "Scientific Autobiography and Other Papers",
    "query": "Planck Scientific Autobiography"
  },
  {
    "volume": 56,
    "era": "20th Century Natural Science",
    "author": "Niels Bohr",
    "title": "Atomic Theory and Selected Essays",
    "query": "Bohr Atomic Theory"
  },
  {
    "volume": 56,
    "era": "20th Century Natural Science",
    "author": "Theodosius Dobzhansky",
    "title": "Genetics and the Origin of Species",
    "query": "Dobzhansky Genetics Origin Species"
  },
  {
    "volume": 56,
    "era": "20th Century Natural Science",
    "author": "Werner Heisenberg",
    "title": "Physics and Philosophy",
    "query": "Heisenberg Physics Philosophy"
  },
  {
    "volume": 57,
    "era": "20th Century Social Science",
    "author": "John Maynard Keynes",
    "title": "The General Theory of Employment, Interest and Money",
    "query": "Keynes General Theory Employment Interest Money"
  },
  {
    "volume": 57,
    "era": "20th Century Social Science",
    "author": "R. H. Tawney",
    "title": "The Acquisitive Society",
    "query": "Tawney Acquisitive Society"
  },
  {
    "volume": 57,
    "era": "20th Century Social Science",
    "author": "Thorstein Veblen",
    "title": "The Theory of the Leisure Class",
    "query": "Veblen Theory Leisure Class"
  },
  {
    "volume": 58,
    "era": "20th Century Social Science",
    "author": "Claude Lévi-Strauss",
    "title": "Structural Anthropology (selections)",
    "query": "Levi Strauss Structural Anthropology"
  },
  {
    "volume": 58,
    "era": "20th Century Social Science",
    "author": "James George Frazer",
    "title": "The Golden Bough (selections)",
    "query": "Frazer Golden Bough"
  },
  {
    "volume": 58,
    "era": "20th Century Social Science",
    "author": "Johan Huizinga",
    "title": "The Waning of the Middle Ages",
    "query": "Huizinga Waning Middle Ages"
  },
  {
    "volume": 58,
    "era": "20th Century Social Science",
    "author": "Max Weber",
    "title": "Essays in Sociology (selections)",
    "query": "Max Weber Sociology Essays"
  },
  {
    "volume": 59,
    "era": "20th Century Literature",
    "author": "Anton Chekhov",
    "title": "Uncle Vanya",
    "query": "Chekhov Uncle Vanya"
  },
  {
    "volume": 59,
    "era": "20th Century Literature",
    "author": "George Bernard Shaw",
    "title": "Saint Joan",
    "query": "Shaw Saint Joan"
  },
  {
    "volume": 59,
    "era": "20th Century Literature",
    "author": "Henry James",
    "title": "The Beast in the Jungle",
    "query": "Henry James Beast Jungle"
  },
  {
    "volume": 59,
    "era": "20th Century Literature",
    "author": "James Joyce",
    "title": "A Portrait of the Artist as a Young Man",
    "query": "Joyce Portrait Artist Young Man"
  },
  {
    "volume": 59,
    "era": "20th Century Literature",
    "author": "Joseph Conrad",
    "title": "Heart of Darkness",
    "query": "Conrad Heart Darkness"
  },
  {
    "volume": 59,
    "era": "20th Century Literature",
    "author": "Luigi Pirandello",
    "title": "Six Characters in Search of an Author",
    "query": "Pirandello Six Characters"
  },
  {
    "volume": 59,
    "era": "20th Century Literature",
    "author": "Marcel Proust",
    "title": "Swann in Love",
    "query": "Proust Swann in Love"
  },
  {
    "volume": 59,
    "era": "20th Century Literature",
    "author": "Thomas Mann",
    "title": "Death in Venice",
    "query": "Thomas Mann Death Venice"
  },
  {
    "volume": 59,
    "era": "20th Century Literature",
    "author": "Willa Cather",
    "title": "A Lost Lady",
    "query": "Willa Cather Lost Lady"
  },
  {
    "volume": 60,
    "era": "20th Century Literature",
    "author": "Bertolt Brecht",
    "title": "Mother Courage and Her Children",
    "query": "Brecht Mother Courage"
  },
  {
    "volume": 60,
    "era": "20th Century Literature",
    "author": "D. H. Lawrence",
    "title": "The Prussian Officer",
    "query": "Lawrence Prussian Officer"
  },
  {
    "volume": 60,
    "era": "20th Century Literature",
    "author": "Ernest Hemingway",
    "title": "The Short Happy Life of Francis Macomber",
    "query": "Hemingway Francis Macomber"
  },
  {
    "volume": 60,
    "era": "20th Century Literature",
    "author": "Eugene O’Neill",
    "title": "Mourning Becomes Electra",
    "query": "O'Neill Mourning Becomes Electra"
  },
  {
    "volume": 60,
    "era": "20th Century Literature",
    "author": "F. Scott Fitzgerald",
    "title": "The Great Gatsby",
    "query": "Fitzgerald Great Gatsby"
  },
  {
    "volume": 60,
    "era": "20th Century Literature",
    "author": "Franz Kafka",
    "title": "The Metamorphosis",
    "query": "Kafka Metamorphosis"
  },
  {
    "volume": 60,
    "era": "20th Century Literature",
    "author": "George Orwell",
    "title": "Animal Farm",
    "query": "Orwell Animal Farm"
  },
  {
    "volume": 60,
    "era": "20th Century Literature",
    "author": "Samuel Beckett",
    "title": "Waiting for Godot",
    "query": "Beckett Waiting Godot"
  },
  {
    "volume": 60,
    "era": "20th Century Literature",
    "author": "T. S. Eliot",
    "title": "The Waste Land",
    "query": "Eliot Waste Land"
  },
  {
    "volume": 60,
    "era": "20th Century Literature",
    "author": "Virginia Woolf",
    "title": "To the Lighthouse",
    "query": "Woolf To Lighthouse"
  },
  {
    "volume": 60,
    "era": "20th Century Literature",
    "author": "William Faulkner",
    "title": "A Rose for Emily",
    "query": "Faulkner Rose Emily"
  }
];

const CLASSIC_GUIDE_PATHS = Object.freeze({
  'Iliad Homer': { id:'iliad', dataPath:'/classic-guides/data/homer/iliad.json' },
  'Odyssey Homer': { id:'odyssey', legacyPath:'/classic-guides/odyssey.html' },
  'Aeschylus Agamemnon': { id:'agamemnon', legacyPath:'/classic-guides/agamemnon.html' },
  'Aeschylus plays': { id:'aeschylus-plays', legacyPath:'/classic-guides/aeschylus-plays.html' },
  'Aeschylus Prometheus Bound': { id:'prometheus-bound', legacyPath:'/classic-guides/prometheus-bound.html' },
  'Aeschylus Eumenides': { id:'eumenides', legacyPath:'/classic-guides/eumenides.html' },
  'Aeschylus Libation Bearers': { id:'libation-bearers', legacyPath:'/classic-guides/libation-bearers.html' },
  'Aristophanes plays': { id:'aristophanes-plays', legacyPath:'/classic-guides/aristophanes-plays.html' },
  'Aristophanes Birds': { id:'the-birds', legacyPath:'/classic-guides/the-birds.html' },
  'Aristophanes Clouds': { id:'the-clouds', legacyPath:'/classic-guides/the-clouds.html' }
});

function classicGuidePathForGreatBook(book) {
  const guide = CLASSIC_GUIDE_PATHS[String(book?.query || '')];
  return guide?.dataPath || guide?.legacyPath || '';
}

function classicGuideRecordForGreatBook(book) {
  return CLASSIC_GUIDE_PATHS[String(book?.query || '')] || null;
}

function classicGuideReaderText(guide = {}) {
  const lines = [];
  const push = (...items) => items.forEach((item) => {
    const value = String(item ?? '').trim();
    if (value) lines.push(value);
  });
  const blank = () => { if (lines.length && lines[lines.length - 1] !== '') lines.push(''); };

  push('THE ILIAD — CLASSIC GUIDE');
  push('Homer · Mark, Set, Go!');
  blank();
  push(guide.dek || guide.subtitle || 'A book-by-book companion to Homer’s Iliad.');
  blank();
  push('HOW TO USE THIS GUIDE');
  push('Read the guide beside Homer rather than instead of Homer. Each Book section gives you the action, the people to watch, the interpretive stakes, and questions worth carrying back into the text.');
  blank();

  if (Array.isArray(guide.greatIdeas) && guide.greatIdeas.length) {
    push('GREAT IDEAS');
    push(guide.greatIdeas.join(' · '));
    blank();
  }

  push('BOOK-BY-BOOK GUIDE');
  blank();
  (guide.bookGuide || []).forEach((entry) => {
    push(`BOOK ${entry.book} — ${String(entry.title || '').toUpperCase()}`);
    blank();
    push('Summary');
    push(entry.summary);
    blank();

    if (Array.isArray(entry.keyEvents) && entry.keyEvents.length) {
      push('Key Events');
      entry.keyEvents.forEach((event) => push(`• ${event}`));
      blank();
    }

    if (Array.isArray(entry.characters) && entry.characters.length) {
      push('Characters in Focus');
      push(entry.characters.join(' · '));
      blank();
    }

    if (entry.whyItMatters) {
      push('Why This Book Matters');
      push(entry.whyItMatters);
      blank();
    }

    if (entry.watch) {
      push('Watch For');
      push(entry.watch);
      blank();
    }

    if (Array.isArray(entry.questions) && entry.questions.length) {
      push('Questions to Consider');
      entry.questions.forEach((question, index) => push(`${index + 1}. ${question}`));
      blank();
    }
  });

  if (Array.isArray(guide.sections) && guide.sections.length) {
    push('DEEPER STUDY');
    blank();
    guide.sections.forEach((section) => {
      push(String(section.title || '').toUpperCase());
      (section.body || section.paragraphs || []).forEach((paragraph) => { push(paragraph); blank(); });
      if (section.takeaway || section.remember) {
        push('Key Takeaway');
        push(section.takeaway || section.remember);
        blank();
      }
    });
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function loadClassicGuideInReader(bookOrQuery) {
  const book = typeof bookOrQuery === 'string'
    ? greatBooksCatalog.find((item) => item.query === bookOrQuery)
    : bookOrQuery;
  const guideRecord = classicGuideRecordForGreatBook(book);
  if (!guideRecord) return;

  // The Iliad is the first native Reader-format Classic Guide. Other guides
  // keep their existing legacy path until they are converted to the same format.
  if (!guideRecord.dataPath) {
    if (guideRecord.legacyPath) window.location.href = guideRecord.legacyPath;
    return;
  }

  const response = await fetch(guideRecord.dataPath, { cache:'no-store' });
  if (!response.ok) throw new Error(`Could not load the Classic Guide for ${book?.title || 'this work'}.`);
  const guide = await response.json();
  const text = classicGuideReaderText(guide);
  if (!text) throw new Error('The Classic Guide did not contain readable text.');

  renderReaderWithText(`${guide.title || book?.title || 'Classic Guide'} — Classic Guide`, text, {
    type:'classic-guide',
    id:guide.id || guideRecord.id || '',
    originalTitle:guide.title || book?.title || '',
    originalAuthor:guide.author || book?.author || '',
    subtitle:guide.subtitle || 'An independent Mark, Set, Go! Classic Guide',
    dataPath:guideRecord.dataPath
  });
}

async function loadBundledClassicGuideDocument(source = {}) {
  const dataPath = String(source?.dataPath || '').trim();
  if (!dataPath) return null;
  const response = await fetch(dataPath, { cache:'no-store' });
  if (!response.ok) return null;
  const guide = await response.json();
  const text = classicGuideReaderText(guide);
  if (!text) return null;
  return {
    title:`${guide.title || source?.originalTitle || 'Classic Guide'} — Classic Guide`,
    text,
    source:{ ...source, type:'classic-guide', id:guide.id || source?.id || '', dataPath }
  };
}

// Reader state is owned by ReaderEngine (Sprint 1).

function closeMenus() {
  document.querySelectorAll('details[open]').forEach((menu) => menu.removeAttribute('open'));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function splitWords(text) {
  return text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}


const STRONG_CHUNK_END = /[.!?]["'”’\)\]]*$/u;
const SOFT_CHUNK_END = /[,;:—–]["'”’\)\]]*$/u;
const CHUNK_STARTERS = new Set([
  'and', 'but', 'or', 'yet', 'so', 'because', 'although', 'though', 'while', 'when', 'if',
  'after', 'before', 'since', 'until', 'unless', 'who', 'whom', 'whose', 'which', 'that',
  'in', 'on', 'at', 'by', 'for', 'from', 'of', 'to', 'with', 'without', 'through', 'across',
  'along', 'around', 'behind', 'beneath', 'beside', 'between', 'beyond', 'during', 'into',
  'near', 'over', 'under', 'upon', 'within', 'toward', 'towards'
]);
const DANGLING_CHUNK_ENDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'to', 'of', 'in', 'on',
  'at', 'by', 'from', 'with', 'without', 'into', 'onto', 'as', 'than', 'that', 'which', 'who',
  'whose', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'do',
  'does', 'did', 'will', 'would', 'can', 'could', 'shall', 'should', 'may', 'might', 'must'
]);

function normalizedChunkWord(word) {
  return cleanLookupWord(word).toLocaleLowerCase();
}

function modeSupportsMeaningfulChunks(mode) {
  return ['highlight', 'bold-focus', 'smooth-glide', 'pointing-guide', 'marquee', 'flash'].includes(mode);
}

function modeSupportsBookPages(mode) {
  return ['highlight', 'bold-focus', 'smooth-glide', 'pointing-guide', 'marquee'].includes(mode);
}

function chooseMeaningfulChunkEnd(startIndex, maximumEnd) {
  if (maximumEnd <= startIndex + 1) return maximumEnd;

  // Sentence endings always complete the current phrase, even when that makes
  // the phrase shorter than the user's selected maximum.
  for (let index = startIndex; index < maximumEnd; index += 1) {
    if (STRONG_CHUNK_END.test(state.words[index])) return index + 1;
  }

  // Commas, semicolons, colons, and dashes are natural breath points. Avoid a
  // one-word fragment unless that is all the selected maximum allows.
  for (let index = startIndex + 1; index < maximumEnd; index += 1) {
    if (SOFT_CHUNK_END.test(state.words[index])) return index + 1;
  }

  // Prefer beginning a new chunk at a conjunction, relative clause, or
  // prepositional phrase instead of splitting indiscriminately in its middle.
  for (let index = startIndex + 2; index < maximumEnd; index += 1) {
    if (CHUNK_STARTERS.has(normalizedChunkWord(state.words[index]))) return index;
  }

  let end = maximumEnd;
  // Do not leave an article, preposition, conjunction, or helping verb hanging
  // at the end when moving it to the next phrase still leaves a useful chunk.
  while (end > startIndex + 1 && DANGLING_CHUNK_ENDS.has(normalizedChunkWord(state.words[end - 1]))) {
    end -= 1;
  }
  return end > startIndex ? end : maximumEnd;
}

function buildReadingGroups(mode, maximumWords) {
  const maxWords = Math.min(10, Math.max(1, Number(maximumWords) || 1));
  const useMeaning = state.meaningfulChunks && modeSupportsMeaningfulChunks(mode) && maxWords > 1;
  const groups = [];
  const starts = state.structureByStart || new Map();
  const boundaries = new Set([
    ...state.structure.flatMap((entry) => [entry.start, entry.end]),
    ...Array.from(state.paragraphBreaks || [])
  ]);

  for (let start = 0; start < state.words.length;) {
    const structure = starts.get(start);
    if (structure) {
      const end = Math.min(state.words.length, Math.max(start + 1, structure.end));
      groups.push({ start, end, structure });
      start = end;
      continue;
    }

    let maximumEnd = Math.min(state.words.length, start + maxWords);
    for (let candidate = start + 1; candidate < maximumEnd; candidate += 1) {
      if (boundaries.has(candidate)) { maximumEnd = candidate; break; }
    }
    const end = useMeaning ? chooseMeaningfulChunkEnd(start, maximumEnd) : maximumEnd;
    groups.push({ start, end: Math.max(start + 1, end) });
    start = Math.max(start + 1, end);
  }
  return groups;
}

function refreshReadingGroups(mode, groupSize) {
  state.readingGroups = buildReadingGroups(mode, groupSize);
  state.groupIndexByStart = new Map(state.readingGroups.map((group, index) => [group.start, index]));
  state.renderedMeaningfulChunks = state.meaningfulChunks && modeSupportsMeaningfulChunks(mode);
}

function findReadingGroup(startIndex) {
  const directIndex = state.groupIndexByStart.get(startIndex);
  if (directIndex !== undefined) return state.readingGroups[directIndex];
  // Pointing Guide can stop early at a visual line break, placing the next
  // step inside a semantic phrase. In that case, keep the remainder together.
  return state.readingGroups.find((group) => group.start <= startIndex && group.end > startIndex) || null;
}

function cleanLookupWord(word) {
  return String(word).replace(/^[^\p{L}\p{N}'’-]+|[^\p{L}\p{N}'’-]+$/gu, '').trim();
}

function getBionicParts(word) {
  const value = String(word);
  const match = value.match(/^(?<leading>[^\p{L}\p{N}]*)(?<core>[\p{L}\p{N}'’-]+)(?<trailing>[^\p{L}\p{N}]*)$/u);
  if (!match?.groups?.core) return { leading: '', bold: value, rest: '', trailing: '' };

  const coreCharacters = Array.from(match.groups.core);
  // Bold roughly the first half of the readable portion. Short words retain a
  // single bold character so the line stays readable rather than overly dark.
  const boldLength = Math.max(1, Math.ceil(coreCharacters.length * 0.45));
  return {
    leading: match.groups.leading,
    bold: coreCharacters.slice(0, boldLength).join(''),
    rest: coreCharacters.slice(boldLength).join(''),
    trailing: match.groups.trailing
  };
}

function setWordContent(element, word, index = null) {
  const guideAction = state?.source?.type === 'modern-guide' ? modernGuideActionToken(word) : '';
  if (guideAction) {
    if (guideAction === 'section') {
      element.classList.add('modern-guide-section-marker');
      element.setAttribute('aria-hidden', 'true');
      return;
    }

    const resolvedIndex = Number.isFinite(Number(index))
      ? Number(index)
      : Number(element?.dataset?.index ?? element?.dataset?.startIndex);

    element.classList.add('modern-guide-action-word');
    element.dataset.guideAction = guideAction;

    if (guideAction === 'buy' && state.source?.buyUrl) {
      const link = document.createElement('a');
      link.className = 'modern-guide-inline-action modern-guide-inline-buy';
      link.href = state.source.buyUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = modernGuideActionLabel(guideAction);
      link.setAttribute('aria-label', `${modernGuideActionLabel(guideAction)} in a new tab`);
      element.append(link);
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    const actionClass = guideAction === 'action' ? 'add' : guideAction;
    button.className = `modern-guide-inline-action modern-guide-inline-${actionClass}`;
    button.dataset.modernGuideInlineAction = guideAction;
    if (Number.isFinite(resolvedIndex)) button.dataset.guideWordIndex = String(resolvedIndex);
    button.textContent = modernGuideActionLabel(guideAction);
    element.append(button);
    return;
  }

  element.replaceChildren();

  if (Number.isFinite(Number(index)) && state.verseNumberIndexes?.has(Number(index))) {
    const verse = document.createElement('sup');
    verse.className = 'bible-verse-number';
    verse.textContent = String(word).replace(/[.]+$/, '');
    element.append(verse);
    return;
  }

  if (!state.bionic) {
    element.textContent = word;
    return;
  }

  const parts = getBionicParts(word);
  if (parts.leading) element.append(document.createTextNode(parts.leading));
  const strong = document.createElement('strong');
  strong.className = 'bionic-prefix';
  strong.textContent = parts.bold;
  element.append(strong);
  if (parts.rest) element.append(document.createTextNode(parts.rest));
  if (parts.trailing) element.append(document.createTextNode(parts.trailing));
}

function renderPhrase(element, words) {
  element.replaceChildren();
  words.forEach((word, index) => {
    const span = document.createElement('span');
    span.className = 'reader-word';
    setWordContent(span, word);

    // Keep the separator inside the word element. Plain text-node spaces can
    // disappear when the Flash reader is a flex container.
    if (index < words.length - 1) {
      span.append(document.createTextNode('\u00A0'));
    }

    element.append(span);
  });
}

function focusAnchorIndex(word) {
  const match = String(word || '').match(/^(?<leading>[^\p{L}\p{N}]*)(?<core>[\p{L}\p{N}][\p{L}\p{N}'’’-]*)(?<trailing>[^\p{L}\p{N}]*)$/u);
  const core = Array.from(match?.groups?.core || String(word || ''));
  if (!core.length) return 0;
  // Place the fixation point slightly left of center for longer words.
  if (core.length <= 1) return 0;
  if (core.length <= 5) return 1;
  if (core.length <= 9) return 2;
  if (core.length <= 13) return 3;
  return 4;
}

function renderFocusAnchorPhrase(element, words) {
  const phrase = words.join(' ');
  const chars = Array.from(phrase);
  const anchor = Math.min(chars.length - 1, focusAnchorIndex(phrase));
  const stage = document.createElement('span');
  stage.className = 'focus-anchor-stage';

  const left = document.createElement('span');
  left.className = 'focus-anchor-left';
  left.textContent = chars.slice(0, anchor).join('');

  const pivot = document.createElement('span');
  pivot.className = 'focus-anchor-letter';
  pivot.textContent = chars[anchor] || '';

  const right = document.createElement('span');
  right.className = 'focus-anchor-right';
  right.textContent = chars.slice(anchor + 1).join('');

  stage.append(left, pivot, right);
  const anchorColor = app.querySelector('#focus-anchor-color')?.value || state.focusAnchorColor || '#20a866';
  const anchorBold = Boolean(app.querySelector('#focus-anchor-bold')?.checked ?? state.focusAnchorBold);
  stage.style.setProperty('--focus-anchor-color', anchorColor);
  stage.classList.toggle('focus-anchor-bold', anchorBold);
  element.replaceChildren(stage);
}

function modeSupportsFocusAnchorOverlay(mode) {
  return ['highlight', 'bold-focus', 'smooth-glide', 'pointing-guide', 'marquee', 'flash'].includes(mode);
}

function refreshFocusAnchorStyle() {
  const color = app.querySelector('#focus-anchor-color')?.value || state.focusAnchorColor || '#20a866';
  const bold = Boolean(app.querySelector('#focus-anchor-bold')?.checked ?? state.focusAnchorBold);
  state.focusAnchorColor = color;
  state.focusAnchorBold = bold;
  app.querySelectorAll('.focus-anchor-stage, #focus-anchor-overlay').forEach((element) => {
    element.style.setProperty('--focus-anchor-color', color);
    element.classList.toggle('focus-anchor-bold', bold);
  });
}

function applyFocusAnchorReaderClearance() {
  const overlay = app.querySelector('#focus-anchor-overlay');
  const frame = overlay?.closest('.reader-frame');
  const reader = frame?.querySelector('.interactive-reader');

  if (!reader) return;

  if (!overlay || overlay.hidden) {
    reader.classList.remove('focus-anchor-clearance');
    reader.style.removeProperty('--focus-anchor-clearance');
    return;
  }

  if (focusAnchorIsFullscreen(overlay)) {
    const overlayRect = overlay.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const clearance = Math.max(72, Math.ceil(overlayRect.bottom - frameRect.top + 14));
    reader.classList.add('focus-anchor-clearance');
    reader.style.setProperty('--focus-anchor-clearance', `${clearance}px`, 'important');
    return;
  }

  // Normal Reader:
  // Keep the original top reading band reserved at all times. The Focus Anchor
  // may then be dragged anywhere over the text without changing this padding,
  // so moving the anchor never pushes/reflows the book.
  //
  // The reserved amount is based on the anchor's default top placement,
  // not its current dragged position.
  const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
  const defaultTop = 2.7 * rootFontSize;
  const overlayHeight = Math.max(42, overlay.getBoundingClientRect().height || 0);

  // Match the original dynamic top-band result at the default top position:
  // default top + overlay height + the original 14px breathing room.
  const clearance = Math.max(96, Math.ceil(defaultTop + overlayHeight + 14));

  reader.classList.add('focus-anchor-clearance');
  reader.style.setProperty('--focus-anchor-clearance', `${clearance}px`, 'important');
}

function focusAnchorIsFullscreen(overlay) {
  const frame = overlay?.closest('.reader-frame');
  return Boolean(frame && (document.fullscreenElement === frame || frame.classList.contains('fullscreen-fallback')));
}

function applyFocusAnchorPosition(overlay) {
  if (!overlay) return;
  if (focusAnchorIsFullscreen(overlay)) {
    // Fullscreen uses a dedicated, stable top band so the reading text always begins below it.
    overlay.classList.add('focus-anchor-fullscreen-band');
    overlay.style.left = '50%';
    overlay.style.top = '0.75rem';
    overlay.style.transform = 'translateX(-50%)';
  } else {
    overlay.classList.remove('focus-anchor-fullscreen-band');
    const position = state.focusAnchorPosition;
    if (position) {
      overlay.style.left = `${Math.max(0, Math.min(100, position.x))}%`;
      overlay.style.top = `${Math.max(0, Math.min(100, position.y))}%`;
      overlay.style.transform = 'translate(-50%, -50%)';
    } else {
      overlay.style.left = '50%';
      overlay.style.top = '2.7rem';
      overlay.style.transform = 'translateX(-50%)';
    }
  }
  requestAnimationFrame(applyFocusAnchorReaderClearance);
}

function refreshFocusAnchorFullscreenLayout() {
  const overlay = app.querySelector('#focus-anchor-overlay');
  if (!overlay || overlay.hidden) return;
  applyFocusAnchorPosition(overlay);
  refreshFocusAnchorStyle();
}

function bindDraggableFocusAnchor(overlay) {
  if (!overlay || overlay.dataset.dragBound === 'true') return;
  overlay.dataset.dragBound = 'true';
  overlay.title = 'Drag the Focus Anchor to reposition it';

  overlay.addEventListener('pointerdown', (event) => {
    if (overlay.hidden || focusAnchorIsFullscreen(overlay)) return;
    if (event.button !== undefined && event.button !== 0) return;

    const frame = overlay.closest('.reader-frame');
    if (!frame) return;

    event.preventDefault();
    event.stopPropagation();
    overlay.classList.add('focus-anchor-dragging');
    state.focusAnchorSuppressClick = false;
    const dragStartX = Number(event.clientX) || 0;
    const dragStartY = Number(event.clientY) || 0;

    const move = (moveEvent) => {
      const dx = (Number(moveEvent.clientX) || 0) - dragStartX;
      const dy = (Number(moveEvent.clientY) || 0) - dragStartY;
      if (Math.hypot(dx, dy) > 4) state.focusAnchorSuppressClick = true;

      const rect = frame.getBoundingClientRect();
      const x = ((moveEvent.clientX - rect.left) / Math.max(1, rect.width)) * 100;
      const y = ((moveEvent.clientY - rect.top) / Math.max(1, rect.height)) * 100;
      state.focusAnchorPosition = {
        x: Math.max(3, Math.min(97, x)),
        y: Math.max(5, Math.min(95, y))
      };
      applyFocusAnchorPosition(overlay);
    };

    const stop = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', stop, true);
      window.removeEventListener('pointercancel', stop, true);
      overlay.classList.remove('focus-anchor-dragging');
      persistReaderSession({ immediate: true });
    };

    // Track at window level. This remains reliable even when the pointer leaves
    // the overlay or crosses the reading text while dragging.
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', stop, true);
    window.addEventListener('pointercancel', stop, true);

    move(event);
  });
}

function updateFocusAnchorOverlay(words = []) {
  const overlay = app.querySelector('#focus-anchor-overlay');
  const mode = getSelectedMode();
  if (!overlay) return;
  const enabled = Boolean(state.focusAnchor) && modeSupportsFocusAnchorOverlay(mode) && mode !== 'flash';
  overlay.hidden = !enabled;
  if (!enabled) {
    overlay.replaceChildren();
    applyFocusAnchorReaderClearance();
    return;
  }
  const fontSize = Math.max(10, Number(app.querySelector('#focus-anchor-font-size')?.value || state.focusAnchorFontSize || 24));
  overlay.style.fontSize = `${fontSize}px`;
  overlay.style.setProperty('--focus-anchor-color', app.querySelector('#focus-anchor-color')?.value || state.focusAnchorColor || '#20a866');
  overlay.classList.toggle('focus-anchor-bold', Boolean(app.querySelector('#focus-anchor-bold')?.checked ?? state.focusAnchorBold));
  bindDraggableFocusAnchor(overlay);
  applyFocusAnchorPosition(overlay);
  if (words.length) renderFocusAnchorPhrase(overlay, words);
  requestAnimationFrame(applyFocusAnchorReaderClearance);
}

async function loadLocalText(key) {
  const source = sources[key];
  if (!source) throw new Error('Unknown reading selection.');
  const response = await fetch(source.path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not load ${source.path}. Copy the matching book text file into public/texts/.`);
  }
  return { title: source.title, text: await response.text() };
}

async function loadApiPayload(endpoint, options) {
  const response = await fetch(endpoint, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
  return payload;
}

async function loadApiText(endpoint, options) {
  return (await loadApiPayload(endpoint, options)).text;
}

function rememberReaderForReturn() {
  return ReaderContinuity.saveBeforeNavigation();
}

function applyReaderSessionSnapshot(snapshot, { resumePlayback = true } = {}) {
  if (!snapshot?.title || !snapshot?.currentText) return false;
  const controls = snapshot.controls || {};

  renderReaderWithText(snapshot.title, snapshot.currentText, snapshot.source || { type: 'restored' });

  state.originalText = snapshot.originalText || snapshot.currentText;
  state.currentText = snapshot.currentText;
  state.language = snapshot.language || 'en';
  state.wpm = Number(controls.wpm ?? snapshot.wpm ?? 300);
  state.bionic = Boolean(controls.bionic ?? snapshot.bionic);
  state.meaningfulChunks = Boolean(controls.meaningfulChunks ?? snapshot.meaningfulChunks);
  state.focusAnchor = Boolean(controls.focusAnchor ?? snapshot.focusAnchor);
  state.focusAnchorPosition = controls.focusAnchorPosition || snapshot.focusAnchorPosition || null;
  state.focusAnchorFontSize = Number(controls.focusAnchorFontSize ?? snapshot.focusAnchorFontSize ?? 24);
  state.focusAnchorColor = controls.focusAnchorColor || snapshot.focusAnchorColor || '#20a866';
  state.focusAnchorBold = Boolean(controls.focusAnchorBold ?? snapshot.focusAnchorBold);
  state.bookPages = Boolean(controls.bookPages ?? snapshot.bookPages);
  state.illustrationMode = controls.illustrationMode || snapshot.illustrationMode || 'off';

  const requestedMode = controls.mode || snapshot.mode || 'highlight';
  const mode = requestedMode === 'two-column' ? 'highlight' : requestedMode;
  const wordCount = Math.max(1, Number(controls.wordCount ?? 1));
  const fontSize = Math.max(10, Number(controls.fontSize ?? 14));
  const fontFamily = controls.fontFamily || 'system';
  const theme = controls.theme || 'dark';
  const savedIndex = Math.max(0, Number(snapshot.playbackIndex ?? snapshot.index) || 0);
  const savedViewportAnchor = Math.max(0, Number(snapshot.viewportAnchorIndex ?? savedIndex) || 0);

  state.returnIndex = savedIndex;
  state.viewportAnchorIndex = savedViewportAnchor;
  state.returnMode = mode;
  state.returnWasRunning = Boolean(snapshot.wasRunning);
  state.returnControls = {
    mode,
    wpm: state.wpm,
    wordCount,
    meaningfulChunks: state.meaningfulChunks,
    pointerStyle: state.pointerStyle || 'hand',
    pointerColor: state.pointerColor || '#20a866',
    focusAnchor: state.focusAnchor,
    focusAnchorPosition: state.focusAnchorPosition,
    focusAnchorFontSize: state.focusAnchorFontSize,
    focusAnchorColor: state.focusAnchorColor,
    focusAnchorBold: state.focusAnchorBold,
    fontFamily,
    fontSize,
    theme,
    bionic: state.bionic,
    bookPages: state.bookPages,
    illustrationMode: state.illustrationMode
  };

  const values = {
    '#mode-select': mode,
    '#fs-mode-select': mode,
    '#speed': state.wpm,
    '#fs-speed': state.wpm,
    '#word-count': wordCount,
    '#fs-word-count': wordCount,
    '#pointer-style': state.pointerStyle || 'hand',
    '#fs-pointer-style': state.pointerStyle || 'hand',
    '#pointer-color': state.pointerColor || '#20a866',
    '#fs-pointer-color': state.pointerColor || '#20a866',
    '#font-family': fontFamily,
    '#fs-font-family': fontFamily,
    '#font-size': fontSize,
    '#fs-font-size': fontSize,
    '#theme-select': theme,
    '#fs-theme-select': theme,
    '#illustration-mode': state.illustrationMode,
    '#fs-illustration-mode': state.illustrationMode,
    '#focus-anchor-font-size': state.focusAnchorFontSize,
    '#fs-focus-anchor-font-size': state.focusAnchorFontSize,
    '#focus-anchor-color': state.focusAnchorColor,
    '#fs-focus-anchor-color': state.focusAnchorColor
  };
  Object.entries(values).forEach(([selector, value]) => {
    const element = app.querySelector(selector);
    if (element && value !== undefined && value !== null) element.value = String(value);
  });

  const checks = {
    '#bionic-reading': state.bionic,
    '#fs-bionic-reading': state.bionic,
    '#meaningful-chunks': state.meaningfulChunks,
    '#fs-meaningful-chunks': state.meaningfulChunks,
    '#focus-anchor': state.focusAnchor,
    '#fs-focus-anchor': state.focusAnchor,
    '#focus-anchor-bold': state.focusAnchorBold,
    '#fs-focus-anchor-bold': state.focusAnchorBold,
    '#book-pages': state.bookPages,
    '#fs-book-pages': state.bookPages
  };
  Object.entries(checks).forEach(([selector, checked]) => {
    const element = app.querySelector(selector);
    if (element) element.checked = Boolean(checked);
  });

  const reader = app.querySelector('#reader');
  if (reader) {
    const fontFamilies = {
      system: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      serif: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, serif',
      georgia: 'Georgia, "Times New Roman", serif',
      verdana: 'Verdana, Geneva, sans-serif',
      trebuchet: '"Trebuchet MS", Arial, sans-serif',
      monospace: 'Consolas, "Courier New", monospace',
      dyslexic: '"Arial", "Verdana", sans-serif'
    };
    reader.style.fontSize = `${fontSize}px`;
    reader.style.fontFamily = fontFamilies[fontFamily] || fontFamilies.system;
    reader.classList.toggle('dyslexia-friendly-font', fontFamily === 'dyslexic');
    reader.classList.toggle('light', theme === 'light');
  }

  // Set the position only after the new reader has been constructed, then
  // rebuild the active renderer using the restored settings.
  readerEngine.setPosition(savedIndex);
  state.index = savedIndex;
  prepareReaderView(mode, wordCount);
  updateModeControls(mode);
  refreshFocusAnchorStyle();
  updateFocusAnchorOverlay();

  // Protected Book Pages refresh restoration:
  // restore the visible spread from the saved viewport anchor while keeping
  // the independent playback cursor at savedIndex.
  requestAnimationFrame(() => {
    if (!state.bookPages) return;
    scheduleBookPageReflow({ anchorIndex: savedViewportAnchor });
    requestAnimationFrame(() => {
      restoreBookPageWordAnchor(savedViewportAnchor);
      state.viewportAnchorIndex = savedViewportAnchor;
      state.index = savedIndex;
      readerEngine.setPosition(savedIndex);
      updateReaderStatus();
    });
  });

  const restoreSavedViewport = () => {
    const activeReader = app.querySelector('#reader');
    if (!activeReader || state.bookPages) return;

    ensureWordsRendered(activeReader, mode, wordCount, state.index + 100);

    // The exact viewport is the most reliable source for a same-document
    // return from My Library. Earlier versions saved scrollTop but ignored it,
    // then tried to reconstruct the location from a word index. When the
    // virtual renderer reported index 0, Resume Reading always opened at the
    // top even though the correct viewport had been saved.
    const savedScrollTop = Number(snapshot.viewport?.scrollTop);
    const savedScrollLeft = Number(snapshot.viewport?.scrollLeft);
    if (Number.isFinite(savedScrollTop) && savedScrollTop > 0) {
      activeReader.scrollTop = Math.max(0, savedScrollTop);
      if (Number.isFinite(savedScrollLeft)) activeReader.scrollLeft = Math.max(0, savedScrollLeft);
      return;
    }

    const target =
      activeReader.querySelector(`.reader-word[data-index="${state.index}"]`) ||
      activeReader.querySelector(`.reader-group[data-start-index="${state.index}"]`);
    if (target) {
      const readerRect = activeReader.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const desiredOffset = Number(snapshot.viewport?.anchorOffsetTop);
      const offset = Number.isFinite(desiredOffset) ? desiredOffset : 24;
      activeReader.scrollTop = Math.max(0, activeReader.scrollTop + targetRect.top - readerRect.top - offset);
      if (Number.isFinite(savedScrollLeft)) activeReader.scrollLeft = Math.max(0, savedScrollLeft);
    }
  };

  // Restore after the immediate render and again after delayed layout work.
  // The second pass prevents font/image/virtual-render layout from moving the
  // viewport back to the beginning after Resume Reading is clicked.
  requestAnimationFrame(() => requestAnimationFrame(restoreSavedViewport));
  window.setTimeout(restoreSavedViewport, 80);
  window.setTimeout(() => {
    restoreSavedViewport();
    updateReaderStatus(`Resumed at word ${(state.index + 1).toLocaleString()}.`);
    if (resumePlayback && snapshot.wasRunning) startReader();
  }, 220);

  activeReaderSnapshot = {
    ...snapshot,
    index: state.index,
    playbackIndex: state.index,
    viewportAnchorIndex: state.viewportAnchorIndex ?? state.index,
    wasRunning: Boolean(snapshot.wasRunning),
    controls: { ...(snapshot.controls || {}), ...(state.returnControls || {}) }
  };
  return true;
}



const BOOK_BUILDER_DRAFT_KEY = 'markSetGoBookBuilderDraftV1';

function normalizeBuilderText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function detectBuilderSections(text) {
  const lines = normalizeBuilderText(text).split('\n');
  const headingPattern = /^(?:(?:chapter|book|part|section|canto|act)\s+(?:[ivxlcdm]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*[:.\-–—]\s*.*)?|(?:prologue|epilogue|introduction|preface|foreword|afterword|conclusion|appendix)(?:\s*[:.\-–—]\s*.*)?)$/i;
  const allCapsPattern = /^[A-Z0-9][A-Z0-9 '\u2019\-–—,:;.]{2,80}$/;
  const headings = [];
  lines.forEach((raw, lineIndex) => {
    const title = raw.trim().replace(/\s+/g, ' ');
    if (!title || title.length > 100) return;
    const previousBlank = lineIndex === 0 || !lines[lineIndex - 1].trim();
    const nextBlank = lineIndex === lines.length - 1 || !lines[lineIndex + 1].trim();
    if (headingPattern.test(title) || (previousBlank && nextBlank && allCapsPattern.test(title) && /[A-Z]/.test(title))) {
      headings.push({ title, lineIndex });
    }
  });
  if (!headings.length && normalizeBuilderText(text)) headings.push({ title: 'Full Text', lineIndex: 0 });
  return headings.slice(0, 300);
}

function builderWordCount(text) {
  return (String(text || '').match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length;
}

function normalizedSourceLine(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .replace(/[“”‘’'\"`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function removePrintedTocFromText(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const markerIndex = lines.findIndex((line, index) => index < Math.min(lines.length, 1800) && /^(?:table\s+of\s+contents|contents)$/i.test(line.trim()));
  if (markerIndex < 0) return { text: String(text || ''), removedLines: 0, detected: false };

  const candidates = [];
  for (let index = markerIndex + 1; index < Math.min(lines.length, markerIndex + 320); index += 1) {
    const line = lines[index].replace(/\s+/g, ' ').trim();
    if (!line || /^\[PDF Page \d+\]$/i.test(line)) continue;
    const wordCount = splitWords(line).length;
    const cleaned = line
      .replace(/(?:\.{2,}|\s{2,})\s*(?:\d+|[ivxlcdm]+)\s*$/iu, '')
      .replace(/\s+(?:\d+|[ivxlcdm]+)\s*$/iu, '')
      .trim();
    const structural = Boolean(classifyStructureLine(cleaned, splitWords(cleaned).length));
    const pageLike = /(?:\.{2,}|\s{2,})\s*(?:\d+|[ivxlcdm]+)\s*$/iu.test(line);
    if (cleaned && cleaned.length <= 170 && wordCount <= 26 && (structural || pageLike || /^[A-Z0-9IVXLC][^.!?]{1,120}$/u.test(cleaned))) {
      const key = normalizeTocTitle(cleaned) || normalizedSourceLine(cleaned);
      if (key.length >= 2) candidates.push({ index, title: cleaned, key });
    }
  }
  if (candidates.length < 3) return { text: String(text || ''), removedLines: 0, detected: true };

  let bodyStart = -1;
  const candidateKeys = new Set(candidates.map((item) => item.key));
  const searchFrom = Math.max(candidates.at(-1)?.index + 1 || markerIndex + 1, markerIndex + 8);
  for (let index = searchFrom; index < lines.length; index += 1) {
    const line = lines[index].replace(/\s+/g, ' ').trim();
    if (!line || /^\[PDF Page \d+\]$/i.test(line)) continue;
    const key = normalizeTocTitle(line) || normalizedSourceLine(line);
    if (candidateKeys.has(key) && classifyStructureLine(line, splitWords(line).length)) {
      bodyStart = index;
      break;
    }
  }

  // Fallback for scanned/flattened contents pages: require a strongly page-numbered list
  // before removing through the first clearly prose-like paragraph.
  if (bodyStart < 0) {
    const pageNumbered = lines.slice(markerIndex + 1, Math.min(lines.length, markerIndex + 320))
      .filter((line) => /(?:\.{2,}|\s{2,})\s*\d+\s*$/.test(line.trim())).length;
    if (pageNumbered < 5) return { text: String(text || ''), removedLines: 0, detected: true };
    for (let index = candidates.at(-1).index + 1; index < Math.min(lines.length, markerIndex + 420); index += 1) {
      const line = lines[index].replace(/\s+/g, ' ').trim();
      if (/^\[PDF Page \d+\]$/i.test(line) || !line) continue;
      if (splitWords(line).length >= 18 && /[.!?][”\"']?$/.test(line)) { bodyStart = index; break; }
    }
  }

  if (bodyStart < 0) return { text: String(text || ''), removedLines: 0, detected: true };
  const removedLines = bodyStart - markerIndex;
  lines.splice(markerIndex, removedLines);
  return {
    text: lines.join('\n').replace(/\n{4,}/g, '\n\n\n').trim(),
    removedLines,
    detected: true
  };
}

function isLikelyRealSectionHeading(value) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return /^(?:(?:chapter|chap\.?|book|part|section|article|canto|act)\s+(?:[ivxlcdm]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b|(?:prologue|epilogue|introduction|preface|foreword|afterword|conclusion|appendix)(?:\s+[a-z0-9ivxlcdm]+)?\b)/i.test(clean);
}

function removeRepeatedSourceHeaders(text, { title = '', author = '' } = {}) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const counts = new Map();
  const titleKey = normalizedSourceLine(String(title).split(' — ')[0]);
  const authorKey = normalizedSourceLine(author);
  for (const line of lines) {
    const clean = line.replace(/\s+/g, ' ').trim();
    if (!clean || clean.length > 120 || /^\[PDF Page \d+\]$/i.test(clean)) continue;
    const key = normalizedSourceLine(clean);
    if (!key || key.length < 2) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const repeated = new Set([...counts.entries()].filter(([, count]) => count >= 4).map(([key]) => key));
  let seenTitle = false;
  let removed = 0;
  const output = [];
  for (const raw of lines) {
    const clean = raw.replace(/\s+/g, ' ').trim();
    const key = normalizedSourceLine(clean);
    const isTitle = Boolean(titleKey && key === titleKey);
    const isAuthor = Boolean(authorKey && key === authorKey);
    const isStandalonePage = /^\s*(?:page\s+)?\d{1,5}\s*$/i.test(clean);
    const safeRepeatedHeader = repeated.has(key)
      && clean.length <= 100
      && !isLikelyRealSectionHeading(clean)
      && !/[.!?][”\"']?$/.test(clean);

    if (isTitle) {
      if (!seenTitle) { seenTitle = true; output.push(raw); }
      else removed += 1;
      continue;
    }
    if ((isAuthor && counts.get(key) >= 3) || safeRepeatedHeader || isStandalonePage) {
      removed += 1;
      continue;
    }
    output.push(raw);
  }
  return { text: output.join('\n').replace(/\n{4,}/g, '\n\n\n').trim(), removedLines: removed };
}

function normalizeImportedBookText(text, options = {}) {
  let value = normalizeBuilderText(text);
  const report = { printedTocLines: 0, repeatedHeaderLines: 0 };
  if (options.removePrintedToc !== false) {
    const cleaned = removePrintedTocFromText(value);
    value = cleaned.text;
    report.printedTocLines = cleaned.removedLines;
  }
  if (options.removeRepeatedHeaders !== false) {
    const cleaned = removeRepeatedSourceHeaders(value, options);
    value = cleaned.text;
    report.repeatedHeaderLines = cleaned.removedLines;
  }
  const toc = detectTableOfContents(value);
  return { text: value, toc, report };
}

function renderBookBuilder() {
  stopReader();
  let draft = {};
  try { draft = JSON.parse(localStorage.getItem(BOOK_BUILDER_DRAFT_KEY) || '{}') || {}; } catch {}
  app.innerHTML = `
    <section class="platform-page book-builder-page">
      <header class="book-builder-header">
        <div>
          <span class="source-category">Create</span>
          <h1 id="builder-page-title">Build an app-ready book</h1>
          <p id="builder-page-description">Upload or paste raw text, clean OCR and page artifacts, review the detected chapters, and create a private reading edition.</p>
        </div>
        <button class="secondary" type="button" data-action="my-library">My Library</button>
      </header>

      <div class="book-builder-mode-switch" role="group" aria-label="What would you like to create?">
        <label class="${draft.mode === 'guide' ? '' : 'is-active'}"><input type="radio" name="builder-mode" value="book" ${draft.mode === 'guide' ? '' : 'checked'}> <span><strong>Create Book</strong><small>Prepare text you own or may legally use</small></span></label>
        <label class="${draft.mode === 'guide' ? 'is-active' : ''}"><input type="radio" name="builder-mode" value="guide" ${draft.mode === 'guide' ? 'checked' : ''}> <span><strong>Create Guide</strong><small>Build an independent interactive guide to any book</small></span></label>
      </div>

      <div class="book-builder-grid">
        <form id="book-builder-form" class="book-builder-editor">
          <div class="book-builder-fields">
            <label><span>Title</span><input id="builder-title" maxlength="180" value="${escapeHtml(draft.title || '')}" placeholder="The Republic" required></label>
            <label><span>Author</span><input id="builder-author" maxlength="180" value="${escapeHtml(draft.author || '')}" placeholder="Plato"></label>
          </div>

          <section id="builder-guide-options" class="book-builder-guide-options" ${draft.mode === 'guide' ? '' : 'hidden'}>
            <div class="section-heading">
              <div><span class="source-category">Guide options</span><h2>Create an interactive reading guide</h2><p>Mark will create original explanatory sections, not reproduce the original book.</p></div>
            </div>
            <div class="book-builder-fields">
              <label><span>Guide depth</span>
                <select id="builder-guide-depth">
                  <option value="standard" ${draft.guideDepth === 'standard' ? 'selected' : ''}>Standard · about 12 sections</option>
                  <option value="extended" ${(!draft.guideDepth || draft.guideDepth === 'extended') ? 'selected' : ''}>Extended · about 18 sections</option>
                </select>
              </label>
              <label><span>Great Idea connection</span>
                <input id="builder-guide-idea" maxlength="80" value="${escapeHtml(draft.guideIdea || '')}" placeholder="Optional — e.g. Freedom, Habit, Justice">
              </label>
            </div>
            <p class="book-builder-guide-note">You can create a guide from the title alone. Adding notes or legally available source material below can make it more specific.</p>
          </section>
          <section id="builder-import-section" class="book-builder-import">
            <div><strong>Add your text</strong><small>Upload a book/document or paste into the editor below.</small></div>
            <label class="secondary button-link book-builder-file-button">Upload File<input id="builder-file" type="file" accept=".epub,.mobi,.azw,.azw3,.prc,.pdf,.docx,.txt,.md,.markdown" hidden></label>
            <span id="builder-file-name" class="book-builder-file-name"></span>
          </section>
          <label class="book-builder-text-label"><span id="builder-text-label">Book text</span>
            <textarea id="builder-text" spellcheck="false" placeholder="Paste the complete text here, or upload EPUB, DRM-free MOBI/AZW/AZW3, PDF, Word, Markdown, or TXT. Chapter headings such as CHAPTER I, BOOK II, PART THREE, Preface, and Epilogue will be detected automatically." required>${escapeHtml(draft.text || '')}</textarea>
          </label>
          <fieldset id="builder-cleanup-section" class="book-builder-cleanup">
            <legend>Cleanup level</legend>
            <label><input type="radio" name="builder-cleanup-level" value="light" ${draft.cleanupLevel === 'light' ? 'checked' : ''}><strong>Light</strong><small>Characters, spacing, punctuation</small></label>
            <label><input type="radio" name="builder-cleanup-level" value="standard" ${draft.cleanupLevel === 'standard' ? 'checked' : ''}><strong>Standard</strong><small>OCR cleanup, paragraphs, page artifacts</small></label>
            <label><input type="radio" name="builder-cleanup-level" value="deep" ${(!draft.cleanupLevel || draft.cleanupLevel === 'deep') ? 'checked' : ''}><strong>AI Deep Clean</strong><small>Context-aware OCR repair and document structure</small></label>
          </fieldset>
          <div id="builder-book-options" class="book-builder-options">
            <label><input id="builder-clean-toc" type="checkbox" ${draft.cleanToc === false ? '' : 'checked'}> Remove a printed table of contents from the reading text and keep it in the Contents pane.</label>
            <label><input id="builder-clean-headers" type="checkbox" ${draft.cleanHeaders === false ? '' : 'checked'}> Remove repeated page headers, page numbers, and repeated book-title lines.</label>
            <label><input id="builder-rights" type="checkbox" ${draft.rights ? 'checked' : ''}> I own this text, have permission to use it, or it is in the public domain.</label>
          </div>
          <div class="book-builder-actions">
            <button id="builder-clean" class="secondary" type="button">Clean &amp; Preview</button>
            <button id="builder-analyze" class="secondary" type="button">Analyze structure</button>
            <button id="builder-submit" class="primary" type="submit">Create book</button>
            <button id="builder-clear" class="subtle-link" type="button">Clear draft</button>
          </div>
          <p id="builder-status" class="status" aria-live="polite"></p>
        </form>

        <aside class="book-builder-preview">
          <div class="book-builder-preview-heading">
            <div><span class="source-category">Preview</span><h2 id="builder-preview-title">Table of contents</h2></div>
            <span id="builder-count" class="book-builder-count">0 words</span>
          </div>
          <ol id="builder-toc" class="book-builder-toc"><li class="empty">Paste text to generate a table of contents.</li></ol>
          <div class="book-builder-note"><strong>Cleanup preview</strong><p id="builder-cleanup-report">Your original stays in the editor until you choose Clean &amp; Preview. The created book uses the cleaned edition.</p></div>
        </aside>
      </div>
    </section>`;

  const titleInput = app.querySelector('#builder-title');
  const authorInput = app.querySelector('#builder-author');
  const textInput = app.querySelector('#builder-text');
  const modeInputs = [...app.querySelectorAll('input[name="builder-mode"]')];
  const guideOptions = app.querySelector('#builder-guide-options');
  const guideDepthInput = app.querySelector('#builder-guide-depth');
  const guideIdeaInput = app.querySelector('#builder-guide-idea');
  const cleanupSection = app.querySelector('#builder-cleanup-section');
  const bookOptions = app.querySelector('#builder-book-options');
  const importSection = app.querySelector('#builder-import-section');
  const submitButton = app.querySelector('#builder-submit');
  const textLabel = app.querySelector('#builder-text-label');
  const previewTitle = app.querySelector('#builder-preview-title');
  const pageTitle = app.querySelector('#builder-page-title');
  const pageDescription = app.querySelector('#builder-page-description');
  const fileInput = app.querySelector('#builder-file');
  const fileName = app.querySelector('#builder-file-name');
  const cleanupLevelInputs = [...app.querySelectorAll('input[name="builder-cleanup-level"]')];
  const cleanTocInput = app.querySelector('#builder-clean-toc');
  const cleanHeadersInput = app.querySelector('#builder-clean-headers');
  const rightsInput = app.querySelector('#builder-rights');
  const status = app.querySelector('#builder-status');
  const toc = app.querySelector('#builder-toc');
  const count = app.querySelector('#builder-count');

  let cleanedPreview = null;
  let importedSource = draft.importedSource || null;
  const selectedMode = () => modeInputs.find((input) => input.checked)?.value || 'book';
  const selectedCleanupLevel = () => cleanupLevelInputs.find((input) => input.checked)?.value || 'deep';

  const applyBuilderMode = () => {
    const guideMode = selectedMode() === 'guide';
    modeInputs.forEach((input) => input.closest('label')?.classList.toggle('is-active', input.checked));
    if (guideOptions) guideOptions.hidden = !guideMode;
    if (cleanupSection) cleanupSection.hidden = guideMode;
    if (bookOptions) bookOptions.hidden = guideMode;
    if (importSection) {
      const strong = importSection.querySelector('strong');
      const small = importSection.querySelector('small');
      if (strong) strong.textContent = guideMode ? 'Optional notes or source material' : 'Add your text';
      if (small) small.textContent = guideMode ? 'Upload or paste material you may legally use to help make the guide more specific.' : 'Upload a book/document or paste into the editor below.';
    }
    if (textLabel) textLabel.textContent = guideMode ? 'Notes or source material (optional)' : 'Book text';
    textInput.required = !guideMode;
    textInput.placeholder = guideMode
      ? 'Optional: add your own notes, public-domain text, or other material you may legally use. You can also leave this blank and create a guide from the title and author.'
      : 'Paste the complete text here, or upload EPUB, DRM-free MOBI/AZW/AZW3, PDF, Word, Markdown, or TXT. Chapter headings such as CHAPTER I, BOOK II, PART THREE, Preface, and Epilogue will be detected automatically.';
    if (submitButton) submitButton.textContent = guideMode ? 'Create guide' : 'Create book';
    if (previewTitle) previewTitle.textContent = guideMode ? 'Guide plan' : 'Table of contents';
    if (pageTitle) pageTitle.textContent = guideMode ? 'Create a Modern Guide' : 'Build an app-ready book';
    if (pageDescription) pageDescription.textContent = guideMode
      ? 'Create an independent, interactive reading guide for any book and open it directly in the Reader.'
      : 'Upload or paste raw text, clean OCR and page artifacts, review the detected chapters, and create a private reading edition.';
    if (guideMode) {
      toc.innerHTML = '<li class="empty">Enter a title and create the guide. Mark will build the section structure.</li>';
      count.textContent = 'Interactive guide';
      app.querySelector('#builder-cleanup-report').textContent = 'The generated guide will include section-by-section Ask Mark discussion links, a whole-guide quiz, an Action Center activity, and a Great Ideas connection.';
      status.textContent = '';
    } else if (textInput.value.trim()) {
      analyze();
    }
    saveDraft();
  };

  const formatter = () => window.MarkSetGoReadAnything?.cleanupTextContent;
  const aiFormatter = () => window.MarkSetGoReadAnything?.requestAiCleanupText;

  const loadBuilderFile = async (file) => {
    if (!file) return;
    status.textContent = `Opening ${file.name}…`;
    const lower = file.name.toLowerCase();
    let parsed = null;
    if (lower.endsWith('.epub')) parsed = await parseEpubFile(file);
    else if (/\.(mobi|azw3?|prc)$/i.test(lower)) parsed = await parseKindleEbookFile(file);
    else if (lower.endsWith('.pdf')) parsed = await parsePdfFile(file, (message) => { status.textContent = message; });
    else if (lower.endsWith('.docx')) {
      const response = await fetch('/api/import/docx', { method:'POST', headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}, body:await file.arrayBuffer() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The Word document could not be imported.');
      parsed = { title:payload.title || file.name.replace(/\.docx$/i,''), text:payload.text, source:{type:'docx'} };
    } else {
      let text = await file.text();
      if (lower.endsWith('.md') || lower.endsWith('.markdown')) text = text.replace(/^#{1,6}\s+/gm,'').replace(/^\s*>\s?/gm,'').replace(/[*_~`]/g,'');
      parsed = { title:file.name.replace(/\.(txt|md|markdown)$/i,''), text, source:{type:'text-upload'} };
    }
    if (!parsed?.text?.trim()) throw new Error('No readable text was found in that file.');
    textInput.value = parsed.text.trim();
    if (!titleInput.value.trim() && parsed.title) titleInput.value = parsed.title;
    importedSource = { ...(parsed.source || {}), name:file.name, fileSize:file.size };
    if (fileName) fileName.textContent = file.name;
    cleanedPreview = null; saveDraft(); analyze();
    status.textContent = `${file.name} loaded. Choose a cleanup level, then Clean & Preview.`;
  };

  const saveDraft = () => {
    try {
      localStorage.setItem(BOOK_BUILDER_DRAFT_KEY, JSON.stringify({
        mode:selectedMode(),
        title:titleInput.value,
        author:authorInput.value,
        text:textInput.value,
        cleanupLevel:selectedCleanupLevel(),
        importedSource,
        cleanToc:cleanTocInput.checked,
        cleanHeaders:cleanHeadersInput.checked,
        rights:rightsInput.checked,
        guideDepth:guideDepthInput?.value || 'extended',
        guideIdea:guideIdeaInput?.value || ''
      }));
    } catch {}
  };
  const analyze = () => {
    const analysisSource = cleanedPreview?.text || textInput.value;
    const normalized = normalizeImportedBookText(analysisSource, {
      title: titleInput.value.trim(),
      author: authorInput.value.trim(),
      removePrintedToc: cleanTocInput.checked,
      removeRepeatedHeaders: cleanHeadersInput.checked
    });
    const text = normalized.text;
    const sections = normalized.toc.length ? normalized.toc.map((item) => ({ title:item.title, lineIndex:null, index:item.index, type:item.type })) : detectBuilderSections(text);
    const words = builderWordCount(text);
    count.textContent = `${words.toLocaleString()} words · ${sections.length} ${sections.length === 1 ? 'section' : 'sections'}`;
    toc.innerHTML = sections.length
      ? sections.map((section) => `<li><span>${escapeHtml(section.title)}</span><small>${Number.isFinite(section.index) ? `Word ${(section.index + 1).toLocaleString()}` : `Line ${(Number(section.lineIndex || 0) + 1).toLocaleString()}`}</small></li>`).join('')
      : '<li class="empty">No chapter headings detected yet.</li>';
    const cleanupBits = [];
    if (normalized.report.printedTocLines) cleanupBits.push(`removed ${normalized.report.printedTocLines} printed-TOC lines`);
    if (normalized.report.repeatedHeaderLines) cleanupBits.push(`removed ${normalized.report.repeatedHeaderLines} repeated header/page-number lines`);
    status.textContent = text ? `Detected ${sections.length} section${sections.length === 1 ? '' : 's'}${cleanupBits.length ? `; ${cleanupBits.join(' and ')}` : ''}. Review the preview, then create the book.` : '';
    saveDraft();
    return { text, sections, words, normalized };
  };

  let analyzeTimer = null;
  [titleInput, authorInput, textInput, guideDepthInput, guideIdeaInput, ...cleanupLevelInputs, cleanTocInput, cleanHeadersInput, rightsInput].filter(Boolean).forEach((input) => input.addEventListener('input', () => {
    saveDraft();
    if (input === textInput && selectedMode() === 'book') {
      cleanedPreview = null;
      clearTimeout(analyzeTimer);
      analyzeTimer = setTimeout(analyze, 350);
    }
  }));
  modeInputs.forEach((input) => input.addEventListener('change', applyBuilderMode));
  fileInput?.addEventListener('change', async (event) => {
    try { await loadBuilderFile(event.target.files?.[0]); }
    catch (error) { status.textContent = error?.message || 'The file could not be opened.'; }
  });
  app.querySelector('#builder-clean')?.addEventListener('click', async () => {
    const button = app.querySelector('#builder-clean');
    try {
      button.disabled = true;
      const level = selectedCleanupLevel();
      status.textContent = level === 'deep' ? 'AI Deep Clean is reviewing the full text…' : 'Cleaning text…';
      if (level === 'deep') {
        const fn = aiFormatter();
        if (!fn) throw new Error('The AI formatter is not ready. Refresh and try again.');
        cleanedPreview = await fn(textInput.value, titleInput.value.trim() || 'Untitled', 'deep');
      } else {
        const fn = formatter();
        if (!fn) throw new Error('The shared formatter is not ready. Refresh and try again.');
        cleanedPreview = fn(textInput.value, level);
      }
      const report = cleanedPreview.report || {};
      const bits = [];
      if (report.ai) bits.push('context-aware AI cleanup complete');
      if (report.badCharacters) bits.push(`${report.badCharacters} bad characters removed`);
      if (report.pageArtifacts) bits.push(`${report.pageArtifacts} page artifacts removed`);
      if (report.repeatedHeaders) bits.push(`${report.repeatedHeaders} repeated headers removed`);
      if (report.brokenWords) bits.push(`${report.brokenWords} broken words repaired`);
      app.querySelector('#builder-cleanup-report').textContent = `${level === 'deep' ? 'AI Deep Clean' : level} preview ready${bits.length ? `: ${bits.join(', ')}.` : '.'} Original pasted/uploaded text remains preserved in the editor.`;
      analyze();
    } catch (error) { status.textContent = error?.message || 'Cleanup could not be completed.'; }
    finally { button.disabled = false; }
  });
  app.querySelector('#builder-analyze').addEventListener('click', analyze);
  app.querySelector('#builder-clear').addEventListener('click', () => {
    if (!window.confirm('Clear this book-builder draft?')) return;
    localStorage.removeItem(BOOK_BUILDER_DRAFT_KEY);
    renderBookBuilder();
  });
  const createInteractiveGuide = async () => {
    const title = titleInput.value.trim();
    const author = authorInput.value.trim();
    if (!title) {
      titleInput.focus();
      return;
    }

    const button = submitButton;
    const originalLabel = button?.textContent || 'Create guide';
    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Creating guide…';
      }
      status.className = 'status';
      status.textContent = 'Mark is building the guide structure, explanations, application activity, and Great Ideas connection…';

      const response = await fetch('/api/create-modern-guide', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          title,
          author,
          depth:guideDepthInput?.value || 'extended',
          requestedGreatIdea:guideIdeaInput?.value.trim() || '',
          sourceMaterial:textInput.value.trim().slice(0, 60000)
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.detail || `Request failed with HTTP ${response.status}.`);
      const guide = payload.guide;
      if (!guide?.sections?.length) throw new Error('The generated guide did not contain readable sections.');

      const guideId = `custom-guide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
      const buyUrl = `https://www.amazon.com/s?k=${encodeURIComponent([title, author].filter(Boolean).join(' '))}`;

      const guideText = [
        String(title).toUpperCase(),
        'An Independent Mark, Set, Go! Reading Guide',
        author ? `Original book by ${author}` : '',
        '',
        'ABOUT THIS GUIDE',
        guide.overview || `An independent educational guide to ${title}.`,
        '',
        '[[MSG:BUY]]',
        '',
        ...guide.sections.flatMap((section, index) => [
          '[[MSG:SECTION]]',
          '',
          `${index + 1}. ${String(section.title || `Section ${index + 1}`).toUpperCase()}`,
          '',
          String(section.content || '').trim(),
          '',
          '[[MSG:DISCUSS]]',
          ''
        ]),
        '[[MSG:IDEAS]] [[MSG:ACTION]] [[MSG:QUIZ]] [[MSG:BUY]]'
      ].filter((part) => part !== null && part !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();

      const interaction = {
        greatIdea: guide.greatIdea || guideIdeaInput?.value.trim() || 'Education',
        actionTitle: guide.actionTitle || `Apply one idea from ${title}`,
        actionType: ['task','habit','review','reflection','experiment','discussion'].includes(guide.actionType) ? guide.actionType : 'reflection',
        dueDays: Math.max(1, Number(guide.dueDays) || 3),
        dueHour: 19,
        priority: ['low','normal','high'].includes(guide.priority) ? guide.priority : 'normal',
        repeat: ['none','daily','weekly','monthly'].includes(guide.repeat) ? guide.repeat : 'none',
        reminder: ['none','at_time','min10','min30','hour1','day1'].includes(guide.reminder) ? guide.reminder : 'day1',
        actionNote: guide.actionNote || `Choose one useful idea from ${title} and turn it into a concrete next step.`
      };

      localStorage.removeItem(BOOK_BUILDER_DRAFT_KEY);
      renderReaderWithText(`${title} — Mark, Set, Go! Guide`, guideText, {
        type:'modern-guide',
        id:guideId,
        customGuide:true,
        originalTitle:title,
        originalAuthor:author,
        buyUrl,
        guideInteractions:interaction,
        createdAt:new Date().toISOString(),
        private:true,
        subtitle:`An independent reading guide to ${title}`
      });
    } catch (error) {
      status.className = 'status error';
      status.textContent = error?.message || 'The guide could not be created.';
      if (button) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    }
  };

  app.querySelector('#book-builder-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    if (selectedMode() === 'guide') {
      await createInteractiveGuide();
      return;
    }

    if (selectedCleanupLevel() === 'deep' && !cleanedPreview) {
      status.textContent = 'Run Clean & Preview first so AI Deep Clean can review the source before the book is created.';
      app.querySelector('#builder-clean')?.focus();
      return;
    }
    const { text, sections, words, normalized } = analyze();
    const title = titleInput.value.trim();
    const author = authorInput.value.trim();
    if (!title) return titleInput.focus();
    if (words < 10) { status.textContent = 'Add more book text before creating the book.'; return textInput.focus(); }
    if (!rightsInput.checked) { status.textContent = 'Confirm that you have the right to use this text.'; return rightsInput.focus(); }
    const displayTitle = author ? `${title} — ${author}` : title;
    const rawOriginal = textInput.value.trim();
    const originalKey = `markSetGoBookBuilderOriginalV1:${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    try { localStorage.setItem(originalKey, rawOriginal); } catch (error) { console.warn('Original book-builder text could not be preserved separately.', error); }
    const source = {
      type: 'book-builder',
      ...(importedSource || {}),
      author,
      cleanupLevel: selectedCleanupLevel(),
      originalPreserved: true,
      originalKey,
      createdAt: new Date().toISOString(),
      documentToc: detectTableOfContents(text),
      cleanup: normalized?.report || {},
      private: true
    };
    localStorage.removeItem(BOOK_BUILDER_DRAFT_KEY);
    renderReaderWithText(displayTitle, text, source);
  });

  applyBuilderMode();
  if (selectedMode() === 'book' && textInput.value.trim()) analyze();
}

function renderEmptyReader() {
  stopReader();

  app.innerHTML = `
    <section class="panel empty-reader-page">
      <div class="empty-reader-heading">
        <div>
          <span class="source-category">Reader</span>
          <h1>Open something to read</h1>
          <p>Your reader is ready. Choose a source below and it will open here with your reading modes, Focus Anchor, Book Pages, comprehension tools, notes, and other reader controls.</p>
        </div>
      </div>

      <div class="empty-reader-canvas" aria-label="Empty reader">
        <div class="empty-reader-placeholder">
          <div class="empty-reader-icon" aria-hidden="true">📖</div>
          <h2>No text loaded yet</h2>
          <p>Import a book or choose something from Discover to begin.</p>
        </div>
      </div>

      <div class="empty-reader-actions">
        <button class="primary empty-reader-action" type="button" data-read="upload">
          <span aria-hidden="true">⬆</span>
          <span><strong>Import Book / Text</strong><small>EPUB, PDF, or TXT</small></span>
        </button>

        <button class="secondary empty-reader-action" type="button" data-read="book-builder">
          <span aria-hidden="true">✎</span>
          <span><strong>Create a Book</strong><small>Paste text and build a clean TOC</small></span>
        </button>

        <button class="secondary empty-reader-action" type="button" data-read="url">
          <span aria-hidden="true">🔗</span>
          <span><strong>Read from URL</strong><small>Open supported web content</small></span>
        </button>

        <button class="secondary empty-reader-action" type="button" data-read="unified-library">
          <span aria-hidden="true">⌕</span>
          <span><strong>Search All Libraries</strong><small>Find an open digital edition</small></span>
        </button>

        <button class="secondary empty-reader-action" type="button" data-read="great-books">
          <span aria-hidden="true">★</span>
          <span><strong>Great Books</strong><small>Read and study the Great Books collection</small></span>
        </button>

        <button class="secondary empty-reader-action" type="button" data-read="bible">
          <span aria-hidden="true">✦</span>
          <span><strong>Bible Study</strong><small>Translations, commentary, cross references, and study</small></span>
        </button>

        <button class="secondary empty-reader-action" type="button" data-action="my-library">
          <span aria-hidden="true">▤</span>
          <span><strong>My Library</strong><small>Open something you already saved</small></span>
        </button>
      </div>

      <div class="empty-reader-hint">
        <strong>Once a text is loaded:</strong>
        <span>the Reader button returns here to your active text and preserves your current reading position and settings.</span>
      </div>
    </section>`;
}

let walkthroughReaderBackup = null;
let walkthroughReaderUsedDemo = false;
let walkthroughReaderSessionActive = false;

window.MarkSetGoWalkthroughReader = Object.freeze({
  async prepare() {
    if (walkthroughReaderBackup === null) {
      let snapshot = buildReaderSessionSnapshot() || activeReaderSnapshot || null;
      if (!snapshot) {
        try { snapshot = await readReaderSession(); } catch {}
      }
      walkthroughReaderBackup = snapshot ? JSON.parse(JSON.stringify(snapshot)) : false;
    }

    walkthroughReaderSessionActive = true;

    // Once the tour has opened the real Reader, keep using that live DOM rather
    // than re-rendering a large book for every individual tour step.
    if (app.querySelector('#reader') && app.querySelector('.reader-page-panel')) {
      return { demo: walkthroughReaderUsedDemo };
    }

    const sourceSnapshot = walkthroughReaderBackup && walkthroughReaderBackup !== false
      ? JSON.parse(JSON.stringify(walkthroughReaderBackup))
      : null;

    if (sourceSnapshot?.title && sourceSnapshot?.currentText) {
      activeReaderSnapshot = sourceSnapshot;
      applyReaderSessionSnapshot(sourceSnapshot);
      walkthroughReaderUsedDemo = false;
      return { demo: false };
    }

    walkthroughReaderUsedDemo = true;
    renderReaderWithText(
      'Walkthrough Sample',
      'Reading is not simply moving quickly across a page. Strong readers coordinate attention, pace, comprehension, and memory. Mark, Set, Go! gives you tools to practice each of those skills while keeping your place in the text.',
      { type: 'walkthrough', ephemeral: true }
    );
    return { demo: true };
  },

  async demoSelection() {
    await this.prepare();
    const reader=app.querySelector('#reader');
    if(!reader || !state.words?.length) return false;

    pauseReader();
    const start=Math.max(0,Math.min(state.words.length-1,Number(state.index)||0));
    const end=Math.min(state.words.length,start+Math.min(18,Math.max(8,state.words.length-start)));
    const text=state.words.slice(start,end).map(word=>typeof word==='string'?word:(word?.text||'')).join(' ').trim();
    if(!text) return false;

    const selection={
      text,
      startIndex:start,
      endIndex:end,
      documentId:state.documentId||'',
      title:state.title||'Walkthrough Sample',
      chapter:tocTitleForWordIndex(start)||'',
      createdAt:new Date().toISOString(),
      origin:'walkthrough'
    };
    state.markSelection=selection;
    state.markPersistentSelection={...selection};
    state.markSelectionLocked=true;
    persistMarkSelectionHighlight(selection);

    const nodes=Array.from(reader.querySelectorAll('.reader-word[data-index], .reader-group[data-start-index]'))
      .filter(element=>{
        const elementStart=Number(element.dataset.index ?? element.dataset.startIndex);
        const elementEnd=Number.isFinite(Number(element.dataset.endIndex))?Number(element.dataset.endIndex):elementStart+1;
        return Number.isFinite(elementStart)&&elementStart<end&&elementEnd>start;
      });
    const rect=nodes[0]?.getBoundingClientRect?.() || reader.getBoundingClientRect();
    showMarkToolbar(selection,{
      left:rect.left,
      top:Math.max(70,rect.top),
      width:Math.max(160,Math.min(420,rect.width||320)),
      height:Math.max(24,rect.height||28)
    });
    renderMarkSelectionCard();
    return true;
  },

  async demoScrub() {
    await this.prepare();
    const reader=app.querySelector('#reader');
    if(!reader || !state.words?.length) return false;
    pauseReader();
    const target=Math.max(0,Math.min(state.words.length-1,Math.floor(state.words.length*.45)));
    state.index=target;
    updateReaderStatus(`Walkthrough: moved to word ${target+1} of ${state.words.length}.`);
    const mode=state.renderedMode||getSelectedMode();
    const groupSize=Math.max(1,Number(app.querySelector('#word-count')?.value)||1);
    if(state.bookPages) scheduleBookPageReflow({delay:0,anchorIndex:target});
    else restoreReadingAnchor(reader,mode,groupSize,target);
    persistReaderSession({immediate:true});
    return true;
  },

  async clearDemoSelection() {
    clearMarkSelectionForReadingResume();
    return true;
  },

  async openWordActions() {
    await this.prepare();
    const reader=app.querySelector('#reader');
    const word=reader?.querySelector('.reader-word[data-index], .reader-group[data-start-index]');
    const menu=app.querySelector('#word-context-menu');
    if(!word || !menu) return false;
    const rect=word.getBoundingClientRect();
    menu.hidden=false;
    menu.style.left=`${Math.max(10,Math.min(window.innerWidth-210,rect.left))}px`;
    menu.style.top=`${Math.max(70,Math.min(window.innerHeight-170,rect.bottom+6))}px`;
    return true;
  },

  async restore() {
    stopReader();
    walkthroughReaderSessionActive = false;
    if (walkthroughReaderBackup && walkthroughReaderBackup !== false) {
      const snapshot = JSON.parse(JSON.stringify(walkthroughReaderBackup));
      activeReaderSnapshot = snapshot;
      applyReaderSessionSnapshot(snapshot);
      await writeReaderSession(snapshot);
      try {
        const totalWords = splitWords(snapshot.currentText || '').length;
        localStorage.setItem(READER_SESSION_META_KEY, JSON.stringify({
          documentId: snapshot.documentId || '',
          title: snapshot.title || 'Untitled',
          index: Math.max(0, Number(snapshot.index) || 0),
          totalWords: Math.max(0, totalWords),
          savedAt: new Date().toISOString()
        }));
      } catch {}
    } else if (walkthroughReaderUsedDemo) {
      activeReaderSnapshot = null;
      await clearReaderSession();
    }
    walkthroughReaderBackup = null;
    walkthroughReaderUsedDemo = false;
  }
});

function renderCurrentReader() {
  if (!activeReaderSnapshot?.title || !activeReaderSnapshot?.currentText) {
    // Reader should still be a meaningful destination before a book is loaded.
    // Persistent saved sessions remain explicit under Home > Resume Last Reading.
    renderEmptyReader();
    return;
  }

  const snapshot = {
    ...activeReaderSnapshot,
    index: Math.max(0, Number(activeReaderSnapshot.index) || 0),
    controls: { ...(activeReaderSnapshot.controls || {}) }
  };
  applyReaderSessionSnapshot(snapshot);
}


function renderHome() {
  stopReader();

  let resumeMeta = null;
  try { resumeMeta = JSON.parse(localStorage.getItem(READER_SESSION_META_KEY) || 'null'); } catch {}
  const resumePercent = resumeMeta?.totalWords
    ? Math.min(100, Math.max(0, Math.round((Number(resumeMeta.index) || 0) / Number(resumeMeta.totalWords) * 100)))
    : null;

  app.innerHTML = `
    <section class="home-simple">
      <header class="home-simple-brand">
        <h1><span class="home-speed-mark" aria-hidden="true">≡</span>Mark, Set, Go!</h1>
        <p class="home-simple-tagline">Read Faster. Understand Deeper. Remember Longer. Apply Daily.</p>
        <p class="home-simple-subtitle">The all-in-one reading accelerator for lifelong learning and personal growth.</p>
      </header>

      <div class="home-reader-launch">
        <figure class="home-mark-card">
          <div class="home-mark-icon-stage">
            <div class="home-mark-portrait-wrap">
              <img
                class="home-mark-avatar"
                src="/assets/ask-mark/ask-mark-avatar.png"
                alt="Mark, your reading companion."
              >
            </div>
            <div class="home-mark-stage-caption">
              <strong>Your reading companion</strong>
              <span>Read faster. Understand deeper. Remember longer.</span>
            </div>
          </div>
          <figcaption>
            <strong>Meet Mark.</strong>
            <span>Practice smoother eye movement, stronger focus, faster reading, and better comprehension.</span>
          </figcaption>
        </figure>

        <section class="home-launch-panel" aria-label="Reading actions">
          <div class="home-launch-copy">
            <span class="source-category">Ready to read?</span>
            <h2>Start reading or continue where you left off.</h2>
            <p>Open the reader, measure your natural reading speed, or return to your saved book without loading anything automatically.</p>
          </div>

          <div class="home-launch-actions">
            <button class="primary home-large-action" data-action="reader" type="button">
              <span aria-hidden="true">📖</span>
              <span><strong>Open Reader</strong><small>Start or return to the active reader</small></span>
            </button>

            <button class="secondary home-large-action" data-start-home type="button">
              <span aria-hidden="true">⏱</span>
              <span><strong>WPM Test</strong><small>Measure your natural reading speed</small></span>
            </button>

            ${resumeMeta?.title ? `<button class="secondary home-large-action home-continue-reading" id="resume-last-reading" type="button">
              <span aria-hidden="true">↩</span>
              <span>
                <strong>Continue Reading</strong>
                <small>${escapeHtml(resumeMeta.title)}${resumePercent === null ? '' : ` · ${resumePercent}% complete`}</small>
                ${resumePercent === null ? '' : `<span class="progress-meter" aria-hidden="true"><span style="width:${resumePercent}%"></span></span>`}
              </span>
            </button>` : `<button class="secondary home-large-action" id="resume-last-reading" type="button" disabled>
              <span aria-hidden="true">↩</span>
              <span><strong>Continue Reading</strong><small>No saved reading yet</small></span>
            </button>`}
          </div>

          ${resumeMeta?.title ? `<button class="secondary subtle home-forget-reading" id="forget-last-reading" type="button">Clear Resume Position</button>` : ''}
        </section>
      </div>

    </section>`;

  app.querySelector('[data-start-home]')?.addEventListener('click', () => renderWpmTest('wpm'));
  app.querySelector('#resume-last-reading')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Loading saved reading…';
    try {
      const saved = await readReaderSession();
      if (!saved?.title || !saved?.currentText) {
        await clearReaderSession();
        window.alert('No resumable reading session was found. Open a book from Library or Reading Progress first.');
        button.disabled = false;
        button.textContent = original;
        return;
      }

      if (!applyReaderSessionSnapshot(saved, { resumePlayback: false })) {
        await clearReaderSession();
        window.alert('No resumable reading session was found. Open a book from Library or Reading Progress first.');
        button.disabled = false;
        button.textContent = original;
      }
    } catch (error) {
      console.error('Resume reading failed:', error);
      window.alert('The saved reading session could not be opened. You can still reopen the book from Library or Reading Progress.');
      button.disabled = false;
      button.textContent = original;
    }
  });
  app.querySelector('#forget-last-reading')?.addEventListener('click', async () => {
    await clearReaderSession();
    clearActiveReaderPane();
    renderHome();
  });

}

const WPM_TEST_OPTIONS = [
  { key: 'gatsby', label: 'The Great Gatsby' },
  { key: 'hound', label: 'The Hound of the Baskervilles' },
  { key: 'cities', label: 'A Tale of Two Cities' }
];

function readingSkillBooks() {
  const progress = Object.values(readStoredObject(READING_PROGRESS_KEY))
    .filter((item) => item?.documentId && item?.title)
    .sort((a,b) => new Date(b.lastReadAt || 0) - new Date(a.lastReadAt || 0));
  const seen = new Set();
  return progress.filter((item) => {
    const key = String(item.documentId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readingSkillBookText(book) {
  if (!book?.documentId) return null;
  let data = null;
  try { data = JSON.parse(localStorage.getItem(`${DOCUMENT_STORAGE_PREFIX}${book.documentId}`) || 'null'); } catch {}
  if (data?.text) return { title:data.title || book.title, text:data.text, source:data.source || book.source || {} };

  if (book.source?.type === 'modern-guide' || book.source?.type === 'classic-guide') {
    const bundled = book.source?.type === 'classic-guide'
      ? await loadBundledClassicGuideDocument(book.source)
      : await loadBundledModernGuideDocument(book.source);
    if (bundled?.text) return bundled;
  }

  if (
    activeReaderSnapshot?.documentId === book.documentId
    && activeReaderSnapshot?.currentText
  ) {
    return {
      title:activeReaderSnapshot.title || book.title,
      text:activeReaderSnapshot.currentText,
      source:activeReaderSnapshot.source || book.source || {}
    };
  }

  return null;
}

function readingSkillBookOptions(books, placeholder = 'Choose a book…') {
  return `<option value="">${escapeHtml(placeholder)}</option>${books.map((book) =>
    `<option value="${escapeHtml(book.documentId)}">${escapeHtml(book.title)}</option>`
  ).join('')}`;
}


function renderProfilePreferences() {
  finalizeReadingSession();
  stopReader();
  let current=getExperienceProfile();

  const featureRows=[
    ['learn','Learn','Reading Skills, quizzes, Great Ideas, and learning tools'],
    ['music','Music & Focus','Music and focus tools'],
    ['goals','Reading Goals','Goals, deadlines, and coaching targets'],
    ['actionCenter','Action Center','Reading-driven actions and reminders'],
    ['modernGuides','Modern Guides','Interactive modern book guides'],
    ['greatBooks','Great Books','Great Books collection and study'],
    ['bibleStudy','Bible Study','Bible reading and study tools'],
    ['languageLearning','Language Learning','Lessons generated from your reading'],
    ['mnemonics','Mnemonics','Memory aids tied to your books'],
    ['learningCourses','Courses & Learning Modules','YouTube, Coursera, Udemy, and related learning links'],
    ['advancedReaderTools','Advanced Reader Tools','Less-common reading modes and advanced controls']
  ];

  app.innerHTML=`
    <section class="platform-page profile-preferences-page">
      <header class="platform-hero">
        <div>
          <span class="source-category">Profile</span>
          <h1>Customize My Experience</h1>
          <p>Keep the interface simple by showing only the tools you want. Turning a feature off hides it; your saved data is not deleted.</p>
        </div>
      </header>

      <section class="profile-preset-card">
        <div class="section-heading">
          <div><span class="source-category">Quick setup</span><h2>Choose an experience</h2><p>Start with a preset, then adjust individual features below.</p></div>
        </div>
        <div class="profile-preset-grid">
          ${Object.entries(EXPERIENCE_PRESETS).map(([key,preset])=>`
            <button class="profile-preset-option ${current.preset===key?'active':''}" type="button" data-profile-preset="${escapeHtml(key)}" aria-pressed="${current.preset===key}">
              <span class="profile-preset-check" aria-hidden="true">${current.preset===key?'✓':''}</span>
              <strong>${escapeHtml(preset.label)}</strong>
              <small>${escapeHtml(preset.description)}</small>
            </button>`).join('')}
        </div>
        <p id="profile-save-status" class="status profile-save-status" role="status" aria-live="polite"></p>
      </section>

      <section class="profile-feature-card">
        <div class="section-heading">
          <div><span class="source-category">Interface</span><h2>Choose what appears</h2><p>These choices control navigation and feature visibility across the app.</p></div>
        </div>
        <div class="profile-feature-list">
          ${featureRows.map(([key,label,description])=>`
            <label class="profile-feature-row">
              <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(description)}</small></span>
              <input type="checkbox" data-profile-feature="${escapeHtml(key)}" ${current.features[key]!==false?'checked':''}>
            </label>`).join('')}
        </div>
      </section>

      <section class="profile-feature-card">
        <div class="section-heading">
          <div><span class="source-category">Mark</span><h2>Personalized coaching</h2><p>Mark uses the tools you enable when offering suggestions, encouragement, and next steps.</p></div>
        </div>
        <p class="profile-note">For example, if Mnemonics is hidden, Mark will not suggest mnemonic practice. If Reading Goals is enabled, goal progress remains available to Mark.</p>
      </section>
    </section>`;

  const status=app.querySelector('#profile-save-status');

  const reflectPresetSelection=(selectedKey='')=>{
    app.querySelectorAll('[data-profile-preset]').forEach((button)=>{
      const active=button.dataset.profilePreset===selectedKey;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
      const check=button.querySelector('.profile-preset-check');
      if(check) check.textContent=active ? '✓' : '';
    });
  };

  const reflectFeatureControls=(profile)=>{
    app.querySelectorAll('[data-profile-feature]').forEach((input)=>{
      input.checked=profile.features?.[input.dataset.profileFeature]!==false;
    });
  };

  const announceSave=(saved,label)=>{
    if(!status) return;
    status.className=`status profile-save-status ${saved.persisted ? 'success' : ''}`;
    status.textContent=saved.persisted
      ? `${label} is now active.`
      : `${label} is active for this session. Browser storage is full, so this choice may need to be selected again later.`;
  };

  const saveFromControls=()=>{
    const features={...current.features};
    app.querySelectorAll('[data-profile-feature]').forEach((input)=>{
      features[input.dataset.profileFeature]=Boolean(input.checked);
    });

    const saved=saveExperienceProfile({preset:'custom',features});
    current=normalizeExperienceProfile(saved);
    reflectPresetSelection('');
    announceSave(saved,'Custom experience');
  };

  app.querySelectorAll('[data-profile-feature]').forEach((input)=>{
    input.addEventListener('change',saveFromControls);
  });

  app.querySelectorAll('[data-profile-preset]').forEach((button)=>{
    button.addEventListener('click',(event)=>{
      event.preventDefault();
      const key=button.dataset.profilePreset;
      const preset=EXPERIENCE_PRESETS[key];
      if(!preset) return;

      const saved=saveExperienceProfile({
        preset:key,
        features:{...preset.features}
      });

      current=normalizeExperienceProfile(saved);
      reflectPresetSelection(key);
      reflectFeatureControls(current);
      announceSave(saved,preset.label);
    });
  });

  // Keep the page synchronized if the profile is changed by another app control.
  const onProfileChange=(event)=>{
    current=normalizeExperienceProfile(event.detail?.profile || getExperienceProfile());
    reflectPresetSelection(current.preset === 'custom' ? '' : current.preset);
    reflectFeatureControls(current);
  };
  document.addEventListener('marksetgo:experience-profile-changed',onProfileChange,{once:true});
}

function renderReadingSkillsHub() {
  if (!experienceFeatureEnabled('learn')) return renderProfilePreferences();
  finalizeReadingSession();
  stopReader();
  const books = readingSkillBooks();
  const results = getComprehensionResults();

  app.innerHTML = `
    <section class="platform-page reading-skills-page">
      <header class="platform-hero">
        <div>
          <span class="source-category">Learn</span>
          <h1>Reading Skills</h1>
          <p>Build speed, comprehension, memory, language ability, and deeper understanding from the books you are actually reading.</p>
        </div>
        <button class="secondary" type="button" data-action="reader">Return to Reader</button>
      </header>

      <div class="reading-skills-summary">
        <article><strong>${books.length}</strong><span>books available for practice</span></article>
        <article><strong>${results.length}</strong><span>comprehension checks completed</span></article>
      </div>

      <div class="reading-skills-grid reading-skills-primary">
        <button class="reading-skill-card" type="button" data-test="wpm"><span>⏱</span><div><h2>WPM Test</h2><p>Measure your natural reading speed and track improvement.</p></div></button>
        <button class="reading-skill-card" type="button" data-action="comprehension-library"><span>✓</span><div><h2>Comprehension Quizzes</h2><p>Generate quizzes from current or previously read books.</p></div></button>
        <button class="reading-skill-card" type="button" data-read="syntopicon"><span>★</span><div><h2>Great Ideas / Syntopicon</h2><p>Compare major ideas across books and traditions.</p></div></button>
      </div>

      <details class="reading-skills-more">
        <summary><span><strong>More learning tools</strong><small>Memory, language practice, and outside courses</small></span><span aria-hidden="true">›</span></summary>
        <div class="reading-skills-grid">
          <button class="reading-skill-card" type="button" data-action="mnemonics"><span>M</span><div><h2>Mnemonics</h2><p>Create memorable devices for arguments, people, events, themes, and concepts.</p></div></button>
          <button class="reading-skill-card" type="button" data-action="language-learning"><span>文</span><div><h2>Language Learning</h2><p>Turn familiar reading into vocabulary, translation, and comprehension practice.</p></div></button>
          <button class="reading-skill-card" type="button" data-action="learning-courses"><span>▶</span><div><h2>Courses &amp; Learning Modules</h2><p>Find videos and courses that deepen what you are reading.</p></div></button>
        </div>
      </details>
    </section>`;
}

async function generateBookComprehensionQuiz(book, button = null) {
  const original = button?.textContent;
  try {
    if (button) { button.disabled = true; button.textContent = 'Generating quiz…'; }
    const data = await readingSkillBookText(book);
    if (!data?.text) throw new Error('The text for this book is not available in this browser.');

    const words = splitWords(data.text);
    if (words.length < 120) throw new Error('There is not enough saved text to create a quiz.');
    const progressIndex = Math.max(120, Math.min(words.length, Number(book.lastWord) || Number(book.furthestWord) || words.length));
    const startIndex = Math.max(0, progressIndex - Math.min(1600, progressIndex));
    const passageWords = words.slice(startIndex, progressIndex);
    const context = {
      passage:passageWords.join(' '),
      words:passageWords.length,
      startIndex,
      endIndex:progressIndex
    };

    const response = await fetch('/api/comprehension', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ title:book.title, passage:context.passage })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.detail || `Request failed with HTTP ${response.status}.`);
    if (!Array.isArray(payload.questions) || payload.questions.length !== 4) throw new Error('The quiz response was incomplete.');

    // Existing quiz UI relies on current Reader state for result metadata.
    const old = {
      documentId:state.documentId,
      title:state.title,
      words:state.words,
      wpm:state.wpm
    };
    state.documentId = book.documentId;
    state.title = book.title;
    state.words = words;

    if (!app.querySelector('#comprehension-dialog')) {
      const dialog = document.createElement('dialog');
      dialog.id = 'comprehension-dialog';
      app.append(dialog);
    }
    renderComprehensionQuiz(payload, context);

    const dialog = app.querySelector('#comprehension-dialog');
    dialog?.addEventListener('close', () => {
      state.documentId = old.documentId;
      state.title = old.title;
      state.words = old.words;
      state.wpm = old.wpm;
    }, { once:true });
  } catch (error) {
    window.alert(`Comprehension quiz unavailable: ${error.message}`);
  } finally {
    if (button) { button.disabled = false; button.textContent = original || 'Start quiz'; }
  }
}

function renderComprehensionLibrary() {
  finalizeReadingSession();
  stopReader();
  const books = readingSkillBooks();
  const results = getComprehensionResults();
  const latestByBook = new Map();
  results.forEach((result) => {
    if (!latestByBook.has(result.documentId)) latestByBook.set(result.documentId, result);
  });

  app.innerHTML = `
    <section class="platform-page learning-tool-page">
      <header class="platform-hero">
        <div><span class="source-category">Reading Skills</span><h1>Comprehension Quizzes</h1><p>Quiz yourself on books you are reading now or have read previously.</p></div>
        <button class="secondary" type="button" data-action="reading-skills">Reading Skills</button>
      </header>

      <div class="learning-book-grid">
        ${books.length ? books.map((book) => {
          const last = latestByBook.get(book.documentId);
          const pct = book.totalWords ? Math.min(100,Math.round((Number(book.furthestWord)||0)/Number(book.totalWords)*100)) : 0;
          return `<article class="learning-book-card">
            <span class="source-category">${book.source?.type === 'classic-guide' ? 'Classic Guide' : book.source?.type === 'modern-guide' ? 'Guide' : 'Book'}</span>
            <h2>${escapeHtml(book.title)}</h2>
            <p>${pct}% read${last ? ` · Last quiz ${last.scorePercent}%` : ' · No quiz yet'}</p>
            <button class="primary" type="button" data-book-quiz="${escapeHtml(book.documentId)}">Start quiz</button>
          </article>`;
        }).join('') : '<div class="empty-library"><h2>No reading history yet</h2><p>Open a book in the Reader and it will become available here.</p></div>'}
      </div>
    </section>`;

  app.querySelectorAll('[data-book-quiz]').forEach((button) => button.addEventListener('click', async () => {
    const book = books.find((item) => String(item.documentId) === String(button.dataset.bookQuiz));
    if (book) await generateBookComprehensionQuiz(book, button);
  }));
}

function renderMnemonicsPage() {
  if (!experienceFeatureEnabled('mnemonics')) return renderProfilePreferences();
  finalizeReadingSession();
  stopReader();
  const books = readingSkillBooks();

  app.innerHTML = `
    <section class="platform-page learning-tool-page">
      <header class="platform-hero">
        <div><span class="source-category">Reading Skills</span><h1>Mnemonics</h1><p>Create memory aids for the books and guides you are reading or have already read.</p></div>
        <button class="secondary" type="button" data-action="reading-skills">Reading Skills</button>
      </header>

      <section class="learning-generator-card">
        <div class="learning-generator-fields">
          <label>Book<select id="mnemonic-book">${readingSkillBookOptions(books)}</select></label>
          <label>What should I remember?<input id="mnemonic-focus" maxlength="240" placeholder="Optional: characters, argument, timeline, major concepts…"></label>
          <label>Mnemonic style<select id="mnemonic-style"><option value="mixed">Best mix</option><option value="acronym">Acronym / acrostic</option><option value="story">Memory story</option><option value="visual">Visual associations</option><option value="palace">Memory palace</option></select></label>
        </div>
        <button id="generate-mnemonics" class="primary" type="button">Create mnemonics</button>
        <p id="mnemonic-status" class="status"></p>
      </section>

      <div id="mnemonic-output"></div>
    </section>`;

  app.querySelector('#generate-mnemonics')?.addEventListener('click', async (event) => {
    const id = app.querySelector('#mnemonic-book').value;
    const book = books.find((item) => String(item.documentId) === String(id));
    if (!book) return app.querySelector('#mnemonic-book').focus();

    const button = event.currentTarget;
    const status = app.querySelector('#mnemonic-status');
    const output = app.querySelector('#mnemonic-output');
    button.disabled = true;
    button.textContent = 'Creating…';
    status.textContent = 'Mark is building memory aids from this reading…';

    try {
      const data = await readingSkillBookText(book);
      if (!data?.text) throw new Error('The text for this book is not available.');
      const words = splitWords(data.text);
      const end = Math.max(1, Math.min(words.length, Number(book.lastWord)||Number(book.furthestWord)||words.length));
      const sample = words.slice(Math.max(0,end-4500),end).join(' ');
      const response = await fetch('/api/mnemonics', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          title:book.title,
          focus:app.querySelector('#mnemonic-focus').value.trim(),
          style:app.querySelector('#mnemonic-style').value,
          sample
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.detail || `HTTP ${response.status}`);

      output.innerHTML = `<section class="mnemonic-results">
        <div class="section-heading"><div><span class="source-category">Memory Plan</span><h2>${escapeHtml(book.title)}</h2></div></div>
        <div class="mnemonic-grid">${(payload.mnemonics || []).map((item) => `<article>
          <span>${escapeHtml(item.type)}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.device)}</p><small>${escapeHtml(item.use)}</small>
        </article>`).join('')}</div>
      </section>`;
      recordLearningActivity('mnemonic', {
        documentId:book.documentId,
        title:book.title,
        count:(payload.mnemonics || []).length || 1,
        style:app.querySelector('#mnemonic-style').value
      });
      status.textContent = 'Mnemonics ready.';
    } catch (error) {
      status.className = 'status error';
      status.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = 'Create mnemonics';
    }
  });
}

function renderLanguageLearningPage() {
  if (!experienceFeatureEnabled('languageLearning')) return renderProfilePreferences();
  finalizeReadingSession();
  stopReader();
  const books = readingSkillBooks();

  app.innerHTML = `
    <section class="platform-page learning-tool-page">
      <header class="platform-hero">
        <div><span class="source-category">Reading Skills</span><h1>Language Learning</h1><p>Use familiar books as a foundation for vocabulary, translation, and reading-comprehension practice.</p></div>
        <button class="secondary" type="button" data-action="reading-skills">Reading Skills</button>
      </header>

      <section class="learning-generator-card">
        <div class="learning-generator-fields">
          <label>Book<select id="language-book">${readingSkillBookOptions(books)}</select></label>
          <label>Language<select id="learning-language">
            <option value="Spanish">Spanish</option><option value="French">French</option><option value="German">German</option>
            <option value="Italian">Italian</option><option value="Portuguese">Portuguese</option><option value="Latin">Latin</option>
            <option value="Ancient Greek">Ancient Greek</option><option value="Modern Greek">Modern Greek</option>
          </select></label>
          <label>Level<select id="learning-level"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
        </div>
        <button id="create-language-lesson" class="primary" type="button">Create lesson</button>
        <p id="language-status" class="status"></p>
      </section>

      <div id="language-output"></div>
    </section>`;

  app.querySelector('#create-language-lesson')?.addEventListener('click', async (event) => {
    const id = app.querySelector('#language-book').value;
    const book = books.find((item) => String(item.documentId) === String(id));
    if (!book) return app.querySelector('#language-book').focus();
    const button = event.currentTarget;
    const status = app.querySelector('#language-status');
    button.disabled = true; button.textContent = 'Creating…';
    status.textContent = 'Building a lesson from your reading…';
    try {
      const data = await readingSkillBookText(book);
      if (!data?.text) throw new Error('The text for this book is not available.');
      const words = splitWords(data.text);
      const end = Math.max(1, Math.min(words.length, Number(book.lastWord)||Number(book.furthestWord)||words.length));
      const sample = words.slice(Math.max(0,end-1200),end).join(' ');
      const response = await fetch('/api/language-lesson', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          title:book.title,
          language:app.querySelector('#learning-language').value,
          level:app.querySelector('#learning-level').value,
          sample
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.detail || `HTTP ${response.status}`);

      const lesson = payload.lesson || {};
      app.querySelector('#language-output').innerHTML = `<section class="language-lesson">
        <div class="section-heading"><div><span class="source-category">${escapeHtml(app.querySelector('#learning-language').value)} practice</span><h2>${escapeHtml(book.title)}</h2></div></div>
        <article><h3>Reading passage</h3><p>${escapeHtml(lesson.passage || '')}</p></article>
        <article><h3>Vocabulary</h3><div class="language-vocab-grid">${(lesson.vocabulary || []).map((item) => `<div><strong>${escapeHtml(item.term)}</strong><span>${escapeHtml(item.meaning)}</span></div>`).join('')}</div></article>
        <article><h3>Language notes</h3><ul>${(lesson.notes || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
        <article><h3>Practice</h3><ol>${(lesson.exercises || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol></article>
      </section>`;
      recordLearningActivity('language-lesson', {
        documentId:book.documentId,
        title:book.title,
        language:app.querySelector('#learning-language').value,
        level:app.querySelector('#learning-level').value,
        vocabularyCount:(lesson.vocabulary || []).length
      });
      status.textContent = 'Lesson ready.';
    } catch (error) {
      status.className = 'status error';
      status.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = 'Create lesson';
    }
  });
}

function learningCourseLinks(title) {
  const query = encodeURIComponent(title);
  const subject = encodeURIComponent(`${title} course`);
  return [
    { name:'YouTube', label:'Videos & lectures', url:`https://www.youtube.com/results?search_query=${subject}` },
    { name:'Coursera', label:'Courses', url:`https://www.coursera.org/search?query=${query}` },
    { name:'Udemy', label:'Courses', url:`https://www.udemy.com/courses/search/?q=${query}` },
    { name:'edX', label:'University courses', url:`https://www.edx.org/search?q=${query}` },
    { name:'Khan Academy', label:'Lessons & background', url:`https://www.khanacademy.org/search?page_search_query=${query}` }
  ];
}

function renderLearningCoursesPage() {
  if (!experienceFeatureEnabled('learningCourses')) return renderProfilePreferences();
  finalizeReadingSession();
  stopReader();
  const books = readingSkillBooks();

  app.innerHTML = `
    <section class="platform-page learning-tool-page">
      <header class="platform-hero">
        <div><span class="source-category">Reading Skills</span><h1>Courses &amp; Learning Modules</h1><p>Find lectures, courses, and supporting learning material related to the books you are reading.</p></div>
        <button class="secondary" type="button" data-action="reading-skills">Reading Skills</button>
      </header>

      <div class="learning-course-books">
        ${books.length ? books.map((book) => `<article class="learning-course-book">
          <div><span class="source-category">${book.source?.type === 'classic-guide' ? 'Classic Guide' : book.source?.type === 'modern-guide' ? 'Guide' : 'Reading'}</span><h2>${escapeHtml(book.title)}</h2></div>
          <div class="learning-provider-links">
            ${learningCourseLinks(book.source?.originalTitle || book.title).map((provider) =>
              `<a class="secondary button-link" href="${escapeHtml(provider.url)}" target="_blank" rel="noopener noreferrer" data-learning-course-provider="${escapeHtml(provider.name)}" data-learning-course-book="${escapeHtml(book.documentId)}" data-learning-course-title="${escapeHtml(book.title)}"><strong>${escapeHtml(provider.name)}</strong><small>${escapeHtml(provider.label)}</small></a>`
            ).join('')}
          </div>
        </article>`).join('') : '<div class="empty-library"><h2>No books available yet</h2><p>Open a book in the Reader and course links will appear here.</p></div>'}
      </div>
    </section>`;

  app.querySelectorAll('[data-learning-course-provider]').forEach((link) => {
    link.addEventListener('click', () => {
      recordLearningActivity('course-open', {
        provider:link.dataset.learningCourseProvider || '',
        documentId:link.dataset.learningCourseBook || '',
        title:link.dataset.learningCourseTitle || ''
      });
    });
  });
}


async function renderWpmTest(key = 'wpm') {
  stopReader();

  const requested = WPM_TEST_OPTIONS.some((item) => item.key === key) ? key : 'gatsby';

  app.innerHTML = `
    <section class="panel wpm-test-page">
      <div class="library-heading">
        <div>
          <span class="source-category">Learn</span>
          <h1>WPM Test</h1>
          <p>Choose a passage, read at your natural pace, and measure your words per minute.</p>
        </div>
      </div>

      <div class="wpm-test-picker">
        <label for="wpm-test-text">
          <span>Test passage</span>
          <select id="wpm-test-text">
            ${WPM_TEST_OPTIONS.map((item) => `<option value="${item.key}" ${item.key === requested ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
          </select>
        </label>
        <span class="status" id="wpm-load-status">Loading passage…</span>
      </div>

      <div id="wpm-test-content"></div>
    </section>`;

  const selector = app.querySelector('#wpm-test-text');
  const content = app.querySelector('#wpm-test-content');
  const loadStatus = app.querySelector('#wpm-load-status');

  const loadPassage = async (selectedKey) => {
    loadStatus.className = 'status';
    loadStatus.textContent = 'Loading passage…';
    content.innerHTML = '';

    try {
      const { title, text } = await loadLocalText(selectedKey);
      const words = splitWords(text).slice(0, 250);
      if (words.length < 250) throw new Error('This WPM test requires a text file containing at least 250 words.');

      content.innerHTML = `
        <div class="wpm-test-heading">
          <h2>${escapeHtml(title)}</h2>
          <span>250-word test passage</span>
        </div>

        <div class="controls wpm-test-controls">
          <div class="control">
            <span class="label">Theme</span>
            <div class="segmented">
              <label><input type="radio" name="theme" value="light">Light</label>
              <label><input type="radio" name="theme" value="dark" checked>Dark</label>
            </div>
          </div>
          <div class="control">
            <label for="font-size">Font size</label>
            <select id="font-size">${fontOptions(14)}</select>
          </div>
        </div>

        <article id="reader" class="reader wpm-test-reader" style="font-size:14px">${escapeHtml(words.join(' '))}</article>

        <div class="controls wpm-test-actions">
          <button id="start-test" class="primary">GO!</button>
          <button id="stop-test" class="danger" disabled>Stop</button>
          <span id="test-status" class="status">Press GO!, read the passage, then press Stop.</span>
        </div>
      `;

      const reader = app.querySelector('#reader');
      bindAppearance(reader);
      const start = app.querySelector('#start-test');
      const stop = app.querySelector('#stop-test');
      const status = app.querySelector('#test-status');
      let startedAt = 0;

      start.addEventListener('click', () => {
        startedAt = performance.now();
        start.disabled = true;
        stop.disabled = false;
        selector.disabled = true;
        status.textContent = 'Begin reading…';
      });

      stop.addEventListener('click', () => {
        if (!startedAt) return;
        const elapsedMinutes = (performance.now() - startedAt) / 60000;
        const measured = Math.max(1, Math.round(words.length / elapsedMinutes));
        state.wpm = measured;
        recordLearningActivity('wpm-test', {
          wpm:measured,
          passageKey:selector.value,
          words:words.length
        });
        start.disabled = false;
        stop.disabled = true;
        selector.disabled = false;
        startedAt = 0;
        status.innerHTML = `<span class="wpm-result">Your speed: ${measured.toLocaleString()} WPM</span>`;
      });

      loadStatus.textContent = '';
    } catch (error) {
      loadStatus.className = 'status error';
      loadStatus.textContent = error.message;
      content.innerHTML = '';
    }
  };

  selector.addEventListener('change', () => loadPassage(selector.value));
  await loadPassage(requested);
}
function fontOptions(selected) {
  return Array.from({ length: 14 }, (_, i) => 10 + i * 2)
    .map((size) => `<option value="${size}" ${size === selected ? 'selected' : ''}>${size}px</option>`)
    .join('');
}

function bindAppearance(reader) {
  const font = app.querySelector('#font-size');
  font?.addEventListener('change', () => {
    const snapshot = captureReaderLocation();
    reader.style.fontSize = `${font.value}px`;
    restoreCapturedReaderLocation(snapshot);
  });

  const fontFamily = app.querySelector('#font-family');
  const fontFamilies = {
    system: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    serif: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, serif',
    georgia: 'Georgia, "Times New Roman", serif',
    verdana: 'Verdana, Geneva, sans-serif',
    trebuchet: '"Trebuchet MS", Arial, sans-serif',
    monospace: 'Consolas, "Courier New", monospace',
    dyslexic: '"Arial", "Verdana", sans-serif'
  };
  const applyFontFamily = () => {
    if (!fontFamily) return;
    reader.style.fontFamily = fontFamilies[fontFamily.value] || fontFamilies.system;
    reader.classList.toggle('dyslexia-friendly-font', fontFamily.value === 'dyslexic');
  };
  fontFamily?.addEventListener('change', () => {
    const snapshot = captureReaderLocation();
    applyFontFamily();
    restoreCapturedReaderLocation(snapshot);
  });
  applyFontFamily();

  const bookPages = app.querySelector('#book-pages');
  const applyBookPages = () => {
    const mode = getSelectedMode();
    state.bookPages = Boolean(bookPages?.checked) && modeSupportsBookPages(mode);
    reader.classList.toggle('book-pages-layout', state.bookPages);
    updateBookPageControls();
    window.requestAnimationFrame(() => updateBookPageStatus());
  };
  bookPages?.addEventListener('change', () => {
    const snapshot = captureReaderLocation();
    stopReader();
    applyBookPages();
    const mode = getSelectedMode();
    const count = Number(app.querySelector('#word-count')?.value) || 1;
    state.index = snapshot.anchorIndex;
    prepareReaderView(mode, count);
    updateModeControls(mode);
    restoreCapturedReaderLocation(snapshot, { rerendered: true });
  });
  applyBookPages();

  const themeSelect = app.querySelector('#theme-select');
  if (themeSelect) {
    const applyTheme = () => reader.classList.toggle('light', themeSelect.value === 'light');
    themeSelect.addEventListener('change', applyTheme);
    applyTheme();
    return;
  }

  app.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.addEventListener('change', () => reader.classList.toggle('light', input.value === 'light'));
  });
}

function getSelectedMode() {
  return app.querySelector('#mode-select')?.value
    || app.querySelector('input[name="mode"]:checked')?.value
    || 'highlight';
}

function isReaderRunning() {
  if (state.renderedMode === 'digital-sign') {
    return Boolean(state.tickerFrame) && !state.tickerPaused;
  }
  return Boolean(state.interval);
}


const BOOKMARK_STORAGE_KEY = 'markSetGoBookmarksV1';
const NOTE_STORAGE_KEY = 'markSetGoNotesV1';
const READING_LIST_STORAGE_KEY = 'markSetGoReadingListV1';
const READING_LIBRARY_DB = 'markSetGoLocalLibraryV1';
const READING_LIBRARY_STORE = 'books';
const DOCUMENT_STORAGE_PREFIX = 'markSetGoDocumentV1:';
const SAVED_DEFINITIONS_KEY = 'markSetGoDefinitionsV1';

const READING_PROGRESS_KEY = 'markSetGoReadingProgressV1';
const READING_ACTIVITY_KEY = 'markSetGoReadingActivityV1';
const COMPREHENSION_RESULTS_KEY = 'markSetGoComprehensionV1';
const COMPREHENSION_POSITION_KEY = 'markSetGoComprehensionPositionV1';
const READING_GOAL_KEY = 'markSetGoAnnualReadingGoalV1';
const READING_AWARDS_KEY = 'markSetGoReadingAwardsV1';

const LEARNING_ACTIVITY_KEY = 'markSetGoLearningActivityV1';

const PROFILE_EXPERIENCE_KEY = 'markSetGoExperienceProfileV1';

const EXPERIENCE_PRESETS = Object.freeze({
  simple:{
    label:'Simple Reader',
    description:'Keep the interface focused on reading, your library, Mark, and notes.',
    features:{
      learn:false,
      music:true,
      goals:false,
      actionCenter:false,
      modernGuides:true,
      bibleStudy:false,
      greatBooks:false,
      languageLearning:false,
      mnemonics:false,
      learningCourses:false,
      advancedReaderTools:false
    }
  },
  improvement:{
    label:'Reading Improvement',
    description:'Focus on speed, comprehension, goals, and measurable reading growth.',
    features:{
      learn:true,
      music:true,
      goals:true,
      actionCenter:true,
      modernGuides:true,
      bibleStudy:false,
      greatBooks:true,
      languageLearning:false,
      mnemonics:true,
      learningCourses:false,
      advancedReaderTools:true
    }
  },
  scholar:{
    label:'Student / Scholar',
    description:'Reading, learning tools, Great Ideas, languages, courses, and deeper study.',
    features:{
      learn:true,
      music:true,
      goals:true,
      actionCenter:true,
      modernGuides:true,
      bibleStudy:true,
      greatBooks:true,
      languageLearning:true,
      mnemonics:true,
      learningCourses:true,
      advancedReaderTools:true
    }
  },
  full:{
    label:'Full Experience',
    description:'Show the complete Mark, Set, Go! feature set.',
    features:{
      learn:true,
      music:true,
      goals:true,
      actionCenter:true,
      modernGuides:true,
      bibleStudy:true,
      greatBooks:true,
      languageLearning:true,
      mnemonics:true,
      learningCourses:true,
      advancedReaderTools:true
    }
  }
});

function normalizeExperienceProfile(value = {}) {
  const requestedPreset=String(value?.preset || '').trim();
  const presetKey=EXPERIENCE_PRESETS[requestedPreset] ? requestedPreset : (requestedPreset === 'custom' ? 'custom' : 'full');
  const basePreset=presetKey === 'custom' ? EXPERIENCE_PRESETS.full : EXPERIENCE_PRESETS[presetKey];

  return {
    preset:presetKey,
    features:{
      ...basePreset.features,
      ...(value.features && typeof value.features === 'object' ? value.features : {})
    }
  };
}

let activeExperienceProfile=null;

function getExperienceProfile() {
  if (activeExperienceProfile) {
    return normalizeExperienceProfile(activeExperienceProfile);
  }

  try {
    const saved=JSON.parse(localStorage.getItem(PROFILE_EXPERIENCE_KEY)||'null');
    activeExperienceProfile=normalizeExperienceProfile(saved || { preset:'full' });
  } catch {
    activeExperienceProfile=normalizeExperienceProfile({ preset:'full' });
  }
  return normalizeExperienceProfile(activeExperienceProfile);
}

function saveExperienceProfile(profile) {
  const normalized=normalizeExperienceProfile(profile);

  // Apply the choice immediately. Persistence failure must never make the
  // preset buttons appear broken (localStorage may already be near quota).
  activeExperienceProfile=normalized;
  applyExperienceProfile(normalized);

  let persisted=true;
  try {
    localStorage.setItem(PROFILE_EXPERIENCE_KEY, JSON.stringify(normalized));
  } catch (error) {
    persisted=false;
    console.warn('Experience profile could not be persisted in localStorage.', error);
  }

  document.dispatchEvent(new CustomEvent('marksetgo:experience-profile-changed', {
    detail:{ profile:normalized, persisted }
  }));

  return { ...normalized, persisted };
}

function experienceFeatureEnabled(feature) {
  return getExperienceProfile().features?.[feature] !== false;
}

function applyExperienceProfile(profile = getExperienceProfile()) {
  const normalized=normalizeExperienceProfile(profile);
  activeExperienceProfile=normalized;

  const rootEl=document.documentElement;
  const features=normalized.features || {};

  Object.entries(features).forEach(([key,enabled]) => {
    rootEl.dataset[`feature${key.charAt(0).toUpperCase()}${key.slice(1)}`]=enabled ? 'on' : 'off';
  });

  document.querySelectorAll('[data-feature-gate]').forEach((element) => {
    const key=element.getAttribute('data-feature-gate');
    const enabled=features[key] !== false;
    element.hidden=!enabled;
    element.setAttribute('aria-hidden', String(!enabled));
  });

  return normalized;
}

window.MarkSetGoExperienceProfile = Object.freeze({
  get:getExperienceProfile,
  save:saveExperienceProfile,
  enabled:experienceFeatureEnabled,
  presets:EXPERIENCE_PRESETS,
  apply:applyExperienceProfile
});


function readLearningActivity() {
  return readStoredArray(LEARNING_ACTIVITY_KEY);
}

function recordLearningActivity(type, detail = {}) {
  if (!type) return null;
  const event = {
    id:`learning-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    type:String(type),
    createdAt:new Date().toISOString(),
    ...detail
  };
  const events = readLearningActivity();
  events.unshift(event);
  try {
    localStorage.setItem(LEARNING_ACTIVITY_KEY, JSON.stringify(events.slice(0, 600)));
  } catch (error) {
    console.warn('Learning activity could not be saved.', error);
  }
  return event;
}

function learningMetricsSummary() {
  const events = readLearningActivity();
  const comprehension = getComprehensionResults();
  const byType = (type) => events.filter((item) => item.type === type);
  const wpmTests = byType('wpm-test');
  const mnemonicEvents = byType('mnemonic');
  const languageEvents = byType('language-lesson');
  const courseEvents = byType('course-open');
  const ideaEvents = byType('great-ideas');

  const wpmValues = wpmTests.map((item) => Number(item.wpm) || 0).filter(Boolean);
  const comprehensionValues = comprehension.map((item) => Number(item.scorePercent) || 0).filter((value) => Number.isFinite(value));
  const distinctLanguages = [...new Set(languageEvents.map((item) => String(item.language || '')).filter(Boolean))];
  const distinctCourseProviders = [...new Set(courseEvents.map((item) => String(item.provider || '')).filter(Boolean))];
  const distinctMnemonicBooks = [...new Set(mnemonicEvents.map((item) => String(item.documentId || item.title || '')).filter(Boolean))];

  return {
    totalActivities:events.length + comprehension.length,
    wpmTests:wpmTests.length,
    latestWpm:wpmValues[0] || 0,
    bestWpm:wpmValues.length ? Math.max(...wpmValues) : 0,
    comprehensionChecks:comprehension.length,
    comprehensionAverage:comprehensionValues.length
      ? Math.round(comprehensionValues.reduce((sum,value) => sum + value,0) / comprehensionValues.length)
      : 0,
    bestComprehension:comprehensionValues.length ? Math.max(...comprehensionValues) : 0,
    greatIdeasSessions:ideaEvents.length,
    mnemonicsCreated:mnemonicEvents.reduce((sum,item) => sum + Math.max(1,Number(item.count)||1),0),
    mnemonicBooks:distinctMnemonicBooks.length,
    languageLessons:languageEvents.length,
    languagesPracticed:distinctLanguages,
    courseOpens:courseEvents.length,
    courseProviders:distinctCourseProviders,
    recent:events.slice(0,8)
  };
}

window.MarkSetGoLearningMetrics = Object.freeze({
  getSummary:learningMetricsSummary,
  record:recordLearningActivity
});



function openReadingLibraryDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(READING_LIBRARY_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(READING_LIBRARY_STORE)) {
        db.createObjectStore(READING_LIBRARY_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getCachedReadingBook(key) {
  try {
    const db = await openReadingLibraryDb();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(READING_LIBRARY_STORE, 'readonly');
      const request = tx.objectStore(READING_LIBRARY_STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

async function cacheReadingBook(record) {
  try {
    const db = await openReadingLibraryDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(READING_LIBRARY_STORE, 'readwrite');
      tx.objectStore(READING_LIBRARY_STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch (error) {
    console.warn('Book could not be cached locally.', error);
    return false;
  }
}

async function removeCachedReadingBook(key) {
  try {
    const db = await openReadingLibraryDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(READING_LIBRARY_STORE, 'readwrite');
      tx.objectStore(READING_LIBRARY_STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {}
}

function readingCacheKey(item) {
  return `reading-list:${item.id}`;
}

function myReadingTabs(active) {
  return `<div class="my-reading-tabs" role="tablist" aria-label="My Reading">
    <button type="button" class="${active === 'list' ? 'active' : ''}" data-my-reading-tab="list">Reading List</button>
    <button type="button" class="${active === 'progress' ? 'active' : ''}" data-my-reading-tab="progress">Progress &amp; Awards</button>
  </div>`;
}

function bindMyReadingTabs() {
  app.querySelectorAll('[data-my-reading-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.myReadingTab === 'progress') renderProgressDashboard();
      else renderReadingList();
    });
  });
}


const LIST_VIEW_STORAGE_KEY = 'markSetGoListViewPreferencesV1';

function getListViewPreference(key, fallback = 'tiles') {
  try {
    const saved = JSON.parse(localStorage.getItem(LIST_VIEW_STORAGE_KEY) || '{}');
    return saved?.[key] || fallback;
  } catch {
    return fallback;
  }
}

function saveListViewPreference(key, value) {
  try {
    const saved = JSON.parse(localStorage.getItem(LIST_VIEW_STORAGE_KEY) || '{}');
    saved[key] = value;
    localStorage.setItem(LIST_VIEW_STORAGE_KEY, JSON.stringify(saved));
  } catch {}
}

function listPresentationControls(key, { collapsible = true, defaultView = 'tiles' } = {}) {
  const selected = getListViewPreference(key, defaultView);
  return `<div class="list-presentation-controls" data-list-controls="${escapeHtml(key)}">
    <span>View</span>
    <div class="segmented compact-view-toggle" role="group" aria-label="Choose item presentation">
      <button type="button" class="${selected === 'tiles' ? 'active' : ''}" data-list-view="tiles" aria-pressed="${selected === 'tiles'}">▦ Tiles</button>
      <button type="button" class="${selected === 'list' ? 'active' : ''}" data-list-view="list" aria-pressed="${selected === 'list'}">☷ List</button>
    </div>
    ${collapsible ? '<button type="button" class="secondary compact-collapse-button" data-list-collapse>Collapse all</button><button type="button" class="secondary compact-collapse-button" data-list-expand>Expand all</button>' : ''}
  </div>`;
}

function bindListPresentationControls({
  key,
  root,
  itemSelector,
  groupSelector = 'details',
  defaultView = 'tiles'
}) {
  const container = typeof root === 'string' ? app.querySelector(root) : root;
  if (!container) return;
  const controls = app.querySelector(`[data-list-controls="${CSS.escape(key)}"]`);
  const apply = (view) => {
    const selected = view === 'list' ? 'list' : 'tiles';
    container.classList.toggle('presentation-list', selected === 'list');
    container.classList.toggle('presentation-tiles', selected === 'tiles');
    saveListViewPreference(key, selected);
    controls?.querySelectorAll('[data-list-view]').forEach((button) => {
      const active = button.dataset.listView === selected;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };
  controls?.querySelectorAll('[data-list-view]').forEach((button) => {
    button.addEventListener('click', () => apply(button.dataset.listView));
  });
  controls?.querySelector('[data-list-collapse]')?.addEventListener('click', () => {
    container.querySelectorAll(groupSelector).forEach((group) => { if ('open' in group) group.open = false; });
  });
  controls?.querySelector('[data-list-expand]')?.addEventListener('click', () => {
    container.querySelectorAll(groupSelector).forEach((group) => { if ('open' in group) group.open = true; });
  });
  apply(getListViewPreference(key, defaultView));
}
function readStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function readStoredObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function beginReadingSession() {
  if (state.sessionActive || !state.documentId || !state.words.length) return;
  state.sessionActive = true;
  state.sessionStartedAt = Date.now();
  state.sessionStartIndex = Math.max(0, state.index || 0);
}

function finalizeReadingSession() {
  if (!state.sessionActive) return;
  const endedAt = Date.now();
  const seconds = Math.max(0, Math.round((endedAt - state.sessionStartedAt) / 1000));
  const endIndex = Math.max(0, Math.min(state.words.length, state.index || 0));
  const wordsRead = Math.max(0, endIndex - state.sessionStartIndex);
  state.sessionActive = false;
  if (seconds < 2 && wordsRead < 1) return;

  const activity = readStoredArray(READING_ACTIVITY_KEY);
  activity.unshift({
    id: `session-${endedAt}-${Math.random().toString(36).slice(2, 7)}`,
    documentId: state.documentId,
    title: state.title,
    startedAt: new Date(state.sessionStartedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    seconds,
    wordsRead,
    startIndex: state.sessionStartIndex,
    endIndex,
    totalWords: state.words.length,
    mode: state.renderedMode || getSelectedMode()
  });
  localStorage.setItem(READING_ACTIVITY_KEY, JSON.stringify(activity.slice(0, 500)));

  const progress = readStoredObject(READING_PROGRESS_KEY);
  const existing = progress[state.documentId] || {};
  progress[state.documentId] = {
    documentId: state.documentId,
    title: state.title,
    totalWords: state.words.length,
    furthestWord: Math.max(Number(existing.furthestWord) || 0, endIndex),
    lastWord: endIndex,
    totalSeconds: (Number(existing.totalSeconds) || 0) + seconds,
    totalWordsRead: (Number(existing.totalWordsRead) || 0) + wordsRead,
    sessions: (Number(existing.sessions) || 0) + 1,
    lastReadAt: new Date(endedAt).toISOString(),
    source: state.source?.type === 'modern-guide'
      ? {
          type:'modern-guide',
          id:state.source?.id || '',
          originalTitle:state.source?.originalTitle || '',
          originalAuthor:state.source?.originalAuthor || '',
          customGuide:Boolean(state.source?.customGuide),
          buyUrl:state.source?.buyUrl || '',
          guideInteractions:state.source?.guideInteractions || null
        }
      : state.source
  };
  try {
    localStorage.setItem(READING_PROGRESS_KEY, JSON.stringify(progress));
  } catch (error) {
    console.warn('Reading progress could not be saved because browser storage is full.', error);
  }
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${total}s`;
}

function dateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function readingStreak(activity) {
  const days = new Set(activity.filter((item) => Number(item.wordsRead) > 0 || Number(item.seconds) >= 60).map((item) => dateKey(item.endedAt)));
  let streak = 0;
  const cursor = new Date();
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}


function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0,0,0,0);
  return date;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function dateLabel(value) {
  return new Date(value).toLocaleDateString(undefined, { month:'short', day:'numeric' });
}

function getAnnualReadingGoal() {
  const stored = Number(localStorage.getItem(READING_GOAL_KEY));
  return Number.isFinite(stored) && stored > 0 ? Math.min(500, Math.round(stored)) : 25;
}

function setAnnualReadingGoal(value) {
  const goal = Math.max(1, Math.min(500, Math.round(Number(value) || 25)));
  localStorage.setItem(READING_GOAL_KEY, String(goal));
  return goal;
}

function completedBooksThisYear(progress, readingList) {
  const year = new Date().getFullYear();
  const ids = new Set();
  readingList.filter((item) => item.status === 'finished').forEach((item) => ids.add(`list:${item.id}`));
  progress.filter((item) => {
    const percent = item.totalWords ? (Number(item.furthestWord)||0) / Number(item.totalWords) : 0;
    return percent >= .95 && new Date(item.lastReadAt || 0).getFullYear() === year;
  }).forEach((item) => ids.add(`progress:${item.documentId}`));
  return ids.size;
}

function aggregateDailyReading(activity, days = 30) {
  const today = startOfDay(new Date());
  const map = new Map();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset);
    map.set(dateKey(date), {
      date,
      label: dateLabel(date),
      words: 0,
      minutes: 0,
      sessions: 0,
      wpm: 0
    });
  }
  for (const item of activity) {
    const key = dateKey(item.endedAt);
    const row = map.get(key);
    if (!row) continue;
    row.words += Number(item.wordsRead) || 0;
    row.minutes += (Number(item.seconds) || 0) / 60;
    row.sessions += 1;
  }
  return [...map.values()].map((row) => ({
    ...row,
    minutes: Math.round(row.minutes),
    wpm: row.minutes ? Math.round(row.words / row.minutes) : 0
  }));
}

function aggregateWeeklyReading(activity, weeks = 8) {
  const today = startOfDay(new Date());
  const rows = [];
  for (let offset = weeks - 1; offset >= 0; offset -= 1) {
    const end = addDays(today, -(offset * 7));
    const start = addDays(end, -6);
    const matching = activity.filter((item) => {
      const date = new Date(item.endedAt);
      return date >= start && date < addDays(end, 1);
    });
    const words = matching.reduce((sum, item) => sum + (Number(item.wordsRead)||0), 0);
    const seconds = matching.reduce((sum, item) => sum + (Number(item.seconds)||0), 0);
    rows.push({
      label: dateLabel(start),
      words,
      minutes: Math.round(seconds / 60),
      sessions: matching.length
    });
  }
  return rows;
}

function escapeSvg(value) {
  return escapeHtml(String(value));
}

function lineChartSvg(data, valueKey, { label = '', suffix = '', empty = 'No trend data yet.' } = {}) {
  const width = 760, height = 165, left = 42, right = 12, top = 10, bottom = 28;
  const values = data.map((row) => Number(row[valueKey]) || 0);
  const max = Math.max(1, ...values);
  const usableW = width - left - right;
  const usableH = height - top - bottom;
  const points = data.map((row, index) => {
    const x = left + (data.length === 1 ? usableW / 2 : index * usableW / (data.length - 1));
    const y = top + usableH - ((Number(row[valueKey]) || 0) / max) * usableH;
    return { x, y, row };
  });
  const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const nonzero = values.some(Boolean);
  return `<svg class="progress-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeSvg(label)}">
    <line x1="${left}" y1="${top+usableH}" x2="${width-right}" y2="${top+usableH}" class="chart-axis"/>
    <line x1="${left}" y1="${top}" x2="${left}" y2="${top+usableH}" class="chart-axis"/>
    ${[0,.25,.5,.75,1].map((ratio) => {
      const y=top+usableH-(ratio*usableH);
      return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" class="chart-grid"/><text x="${left-7}" y="${y+4}" text-anchor="end">${Math.round(max*ratio).toLocaleString()}</text>`;
    }).join('')}
    ${nonzero ? `<polyline points="${polyline}" class="chart-line"/>${points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3.5"><title>${escapeSvg(p.row.label)}: ${(Number(p.row[valueKey])||0).toLocaleString()}${escapeSvg(suffix)}</title></circle>`).join('')}` : `<text x="${width/2}" y="${height/2}" text-anchor="middle" class="chart-empty">${escapeSvg(empty)}</text>`}
    ${points.filter((_,i)=>i===0 || i===points.length-1 || i%7===0).map((p) => `<text x="${p.x}" y="${height-12}" text-anchor="middle">${escapeSvg(p.row.label)}</text>`).join('')}
  </svg>`;
}

function barChartSvg(data, valueKey, { label = '', suffix = '' } = {}) {
  const width=760,height=165,left=42,right=12,top=10,bottom=28;
  const max=Math.max(1,...data.map((row)=>Number(row[valueKey])||0));
  const usableW=width-left-right, usableH=height-top-bottom;
  const gap=8, barW=Math.max(8,(usableW-(gap*(data.length-1)))/Math.max(1,data.length));
  return `<svg class="progress-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeSvg(label)}">
    <line x1="${left}" y1="${top+usableH}" x2="${width-right}" y2="${top+usableH}" class="chart-axis"/>
    ${data.map((row,index)=>{
      const value=Number(row[valueKey])||0;
      const h=(value/max)*usableH;
      const x=left+index*(barW+gap), y=top+usableH-h;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4"><title>${escapeSvg(row.label)}: ${value.toLocaleString()}${escapeSvg(suffix)}</title></rect><text x="${x+barW/2}" y="${height-14}" text-anchor="middle">${escapeSvg(row.label)}</text>`;
    }).join('')}
  </svg>`;
}

function pieChartSvg(entries, { label = '' } = {}) {
  const total=entries.reduce((sum,item)=>sum+(Number(item.value)||0),0);
  let angle=-Math.PI/2;
  const cx=125,cy=125,r=92;
  const paths=entries.filter((item)=>item.value>0).map((item,index)=>{
    const slice=(item.value/Math.max(1,total))*Math.PI*2;
    const end=angle+slice;
    const x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle);
    const x2=cx+r*Math.cos(end),y2=cy+r*Math.sin(end);
    const large=slice>Math.PI?1:0;
    const d=`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    angle=end;
    return `<path d="${d}" class="chart-slice chart-slice-${(index%6)+1}"><title>${escapeSvg(item.label)}: ${item.value}</title></path>`;
  }).join('');
  return `<div class="pie-chart-layout"><svg class="pie-chart" viewBox="0 0 250 250" role="img" aria-label="${escapeSvg(label)}">${total?paths:`<circle cx="${cx}" cy="${cy}" r="${r}" class="pie-empty"/><text x="${cx}" y="${cy+5}" text-anchor="middle">No data</text>`}<circle cx="${cx}" cy="${cy}" r="46" class="pie-hole"/><text x="${cx}" y="${cy-2}" text-anchor="middle" class="pie-total">${total}</text><text x="${cx}" y="${cy+18}" text-anchor="middle">sessions</text></svg>
  <div class="pie-legend">${entries.map((item,index)=>`<div><span class="legend-dot chart-slice-${(index%6)+1}"></span><strong>${escapeHtml(item.label)}</strong><span>${Number(item.value)||0}</span></div>`).join('')}</div></div>`;
}

function calculateReadingAwards({ activity, progress, comprehension, readingList, goal }) {
  const streak = readingStreak(activity);
  const completed = completedBooksThisYear(progress, readingList);
  const totalWords = activity.reduce((sum,item)=>sum+(Number(item.wordsRead)||0),0);
  const totalMinutes = Math.round(activity.reduce((sum,item)=>sum+(Number(item.seconds)||0),0)/60);
  const activeDays = new Set(activity.map((item)=>dateKey(item.endedAt))).size;
  const monthlyDays = new Set(activity.filter((item)=>new Date(item.endedAt) >= addDays(new Date(),-30)).map((item)=>dateKey(item.endedAt))).size;
  const compAverage = comprehension.length ? Math.round(comprehension.reduce((s,i)=>s+(Number(i.scorePercent)||0),0)/comprehension.length) : 0;
  const recent = activity.slice(0,5);
  const earlier = activity.slice(5,10);
  const avgWpm=(rows)=>{
    const words=rows.reduce((s,i)=>s+(Number(i.wordsRead)||0),0);
    const seconds=rows.reduce((s,i)=>s+(Number(i.seconds)||0),0);
    return seconds ? Math.round(words/(seconds/60)) : 0;
  };
  const improvement = avgWpm(recent)-avgWpm(earlier);

  const definitions = [
    {id:'first-step',icon:'🌱',title:'First Step',description:'Complete your first recorded reading session.',earned:activity.length>=1,progress:Math.min(1,activity.length)},
    {id:'daily-reader',icon:'☀️',title:'Daily Reader',description:'Read on 3 consecutive days.',earned:streak>=3,progress:Math.min(1,streak/3)},
    {id:'week-warrior',icon:'🔥',title:'Week Warrior',description:'Maintain a 7-day reading streak.',earned:streak>=7,progress:Math.min(1,streak/7)},
    {id:'monthly-master',icon:'🗓️',title:'Monthly Master',description:'Read on 20 different days in a month.',earned:monthlyDays>=20,progress:Math.min(1,monthlyDays/20)},
    {id:'word-explorer',icon:'🧭',title:'Word Explorer',description:'Read 25,000 recorded words.',earned:totalWords>=25000,progress:Math.min(1,totalWords/25000)},
    {id:'deep-reader',icon:'🧠',title:'Deep Reader',description:'Average 80% or better on comprehension checks.',earned:comprehension.length>=3&&compAverage>=80,progress:Math.min(1,(compAverage/80)*(Math.min(1,comprehension.length/3)))},
    {id:'speed-builder',icon:'⚡',title:'Speed Builder',description:'Improve recent WPM by at least 10%.',earned:earlier.length>=3&&improvement>=Math.max(10,avgWpm(earlier)*.1),progress:earlier.length<3?0:Math.min(1,improvement/Math.max(10,avgWpm(earlier)*.1))},
    {id:'book-finisher',icon:'📚',title:'Book Finisher',description:'Finish your first book.',earned:completed>=1,progress:Math.min(1,completed)},
    {id:'goal-halfway',icon:'🥈',title:'Halfway Hero',description:'Reach half of your annual book goal.',earned:completed>=Math.ceil(goal/2),progress:Math.min(1,completed/Math.max(1,Math.ceil(goal/2)))},
    {id:'goal-champion',icon:'🏆',title:'Goal Champion',description:'Complete your annual reading goal.',earned:completed>=goal,progress:Math.min(1,completed/goal)},
    {id:'time-scholar',icon:'⏳',title:'Time Scholar',description:'Record 10 hours of focused reading.',earned:totalMinutes>=600,progress:Math.min(1,totalMinutes/600)},
    {id:'consistent-scholar',icon:'🎓',title:'Consistent Scholar',description:'Read on 30 different days.',earned:activeDays>=30,progress:Math.min(1,activeDays/30)}
  ];
  return { definitions, streak, completed, totalWords, totalMinutes, activeDays, monthlyDays, compAverage, improvement };
}

function localProgressRecommendations({ daily, weekly, awards, comprehension, goal }) {
  const recommendations=[];
  const last7=daily.slice(-7);
  const activeLast7=last7.filter((d)=>d.words>0).length;
  const wordsLast7=last7.reduce((s,d)=>s+d.words,0);
  const prior7=daily.slice(-14,-7).reduce((s,d)=>s+d.words,0);
  if (activeLast7<4) recommendations.push({title:'Build a repeatable rhythm',text:'Aim for four short reading sessions this week. Consistency is currently a bigger opportunity than session length.'});
  else recommendations.push({title:'Protect your consistency',text:`You read on ${activeLast7} of the last 7 days. Keep the same time cue and make the next session easy to start.`});
  if (prior7>0 && wordsLast7<prior7*.85) recommendations.push({title:'Reverse the recent slowdown',text:'Your recorded word volume declined from the prior week. Schedule one slightly longer recovery session rather than trying to compensate all at once.'});
  if (comprehension.length && awards.compAverage<75) recommendations.push({title:'Trade a little speed for retention',text:'Comprehension is below 75%. Reduce WPM by about 10% and use a comprehension check after each major section.'});
  else if (comprehension.length>=3 && awards.compAverage>=85) recommendations.push({title:'Increase difficulty gradually',text:'Your comprehension is strong. Increase speed in small 5–8% steps or choose denser material while protecting understanding.'});
  if (awards.completed<goal) {
    const monthsLeft=Math.max(1,12-new Date().getMonth());
    const monthly=Math.ceil((goal-awards.completed)/monthsLeft);
    recommendations.push({title:'Stay on pace for your annual goal',text:`Finish about ${monthly} book${monthly===1?'':'s'} per month for the rest of the year to reach ${goal}.`});
  }
  if (!recommendations.length) recommendations.push({title:'Keep building evidence',text:'Complete several reading sessions and comprehension checks so the dashboard can identify meaningful trends.'});
  return recommendations.slice(0,4);
}
function renderProgressDashboard() {
  finalizeReadingSession();
  stopReader();

  const activity = readStoredArray(READING_ACTIVITY_KEY);
  const progress = Object.values(readStoredObject(READING_PROGRESS_KEY));
  const readingList = getReadingList();
  const comprehension = getComprehensionResults();
  const goal = getAnnualReadingGoal();
  const daily = aggregateDailyReading(activity, 30);
  const weekly = aggregateWeeklyReading(activity, 8);
  const awards = calculateReadingAwards({ activity, progress, comprehension, readingList, goal });
  const recommendations = localProgressRecommendations({ daily, weekly, awards, comprehension, goal });

  const totalSeconds=activity.reduce((sum,item)=>sum+(Number(item.seconds)||0),0);
  const totalWords=activity.reduce((sum,item)=>sum+(Number(item.wordsRead)||0),0);
  const averageWpm=totalSeconds?Math.round(totalWords/(totalSeconds/60)):0;
  const effectiveWpm=comprehension.length
    ? Math.round(comprehension.reduce((sum,item)=>sum+(Number(item.effectiveWpm)||0),0)/comprehension.length)
    : 0;
  const earned=awards.definitions.filter((item)=>item.earned).length;
  const goalPercent=Math.min(100,Math.round(awards.completed/Math.max(1,goal)*100));
  const learning=learningMetricsSummary();

  const modeCounts = activity.reduce((map,item)=>{
    const label=({
      highlight:'Highlight',
      'pointing-guide':'Pointing Guide',
      'bold-focus':'Bold Focus',
      flash:'Flash',
      'smooth-glide':'Smooth Glide',
      marquee:'Marquee',
      'digital-sign':'Digital Sign',
      'auto-scroll':'Auto Scroll'
    })[item.mode] || 'Other';
    map[label]=(map[label]||0)+1;
    return map;
  },{});
  const modeEntries=Object.entries(modeCounts).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value).slice(0,6);

  app.innerHTML = `<section class="panel progress-analytics-page compact-progress-dashboard">
    <div class="progress-hero">
      <div>
        <span class="source-category">Recorded analysis</span>
        <h1>Progress &amp; Awards</h1>
        <p>A visual record of reading consistency, speed, comprehension, completed books, and long-term growth.</p>
      </div>
      <div class="progress-hero-actions">
        <button class="secondary" type="button" data-action="my-reading">My Reading List</button>
        <button id="clear-reading-progress" class="secondary" type="button">Clear recorded history</button>
      </div>
    </div>

    <div class="progress-stat-grid">
      <article class="progress-stat"><span>Recorded words</span><strong>${totalWords.toLocaleString()}</strong><small>${activity.length.toLocaleString()} sessions</small></article>
      <article class="progress-stat"><span>Reading time</span><strong>${formatDuration(totalSeconds)}</strong><small>${awards.activeDays} active days</small></article>
      <article class="progress-stat"><span>Average pace</span><strong>${averageWpm||'—'}</strong><small>WPM</small></article>
      <article class="progress-stat"><span>Comprehension</span><strong>${awards.compAverage||'—'}${awards.compAverage?'%':''}</strong><small>${comprehension.length} checks</small></article>
      <article class="progress-stat"><span>Learning activity</span><strong>${learning.totalActivities.toLocaleString()}</strong><small>quizzes, skills &amp; study</small></article>
      <article class="progress-stat"><span>Current streak</span><strong>${awards.streak}</strong><small>${awards.streak===1?'day':'days'}</small></article>
    </div>

    <section class="annual-goal-card">
      <div>
        <span class="source-category">Annual reading goal</span>
        <h2>${awards.completed} of ${goal} books completed</h2>
        <p>Set a yearly target and the dashboard will calculate pace, progress, and goal-based awards.</p>
      </div>
      <div class="annual-goal-control">
        <label for="annual-reading-goal">Books per year
          <input id="annual-reading-goal" type="number" min="1" max="500" value="${goal}">
        </label>
        <button id="save-annual-reading-goal" class="secondary" type="button">Save goal</button>
      </div>
      <div class="annual-goal-meter"><span style="width:${goalPercent}%"></span></div>
      <strong class="annual-goal-percent">${goalPercent}%</strong>
    </section>

    <section class="learning-progress-overview">
      <div class="section-heading">
        <div><span class="source-category">Learning</span><h2>Learning progress</h2><p>Your core reading KPIs stay visible above. Open a category when you want the details.</p></div>
        <button class="secondary" type="button" data-action="reading-skills">Open Reading Skills</button>
      </div>

      <div class="learning-progress-details">
        <details class="analytics-card learning-progress-detail">
          <summary><span><strong>Reading Speed</strong><small>WPM tests and effective pace</small></span><span>${learning.latestWpm || averageWpm || '—'} WPM</span></summary>
          <div class="progress-collapsible-body">
            <div class="analysis-grid compact-learning-analysis">
              <article><span>WPM tests</span><strong>${learning.wpmTests}</strong><small>completed</small></article>
              <article><span>Latest test</span><strong>${learning.latestWpm || '—'}</strong><small>WPM</small></article>
              <article><span>Best test</span><strong>${learning.bestWpm || '—'}</strong><small>WPM</small></article>
              <article><span>Recorded pace</span><strong>${averageWpm || '—'}</strong><small>session average</small></article>
              <article><span>Effective pace</span><strong>${effectiveWpm || '—'}</strong><small>WPM × comprehension</small></article>
            </div>
            <button class="secondary" type="button" data-test="wpm">Take WPM Test</button>
          </div>
        </details>

        <details class="analytics-card learning-progress-detail">
          <summary><span><strong>Comprehension Quizzes</strong><small>Understanding across current and past books</small></span><span>${learning.comprehensionAverage || '—'}${learning.comprehensionAverage ? '%' : ''}</span></summary>
          <div class="progress-collapsible-body">
            <div class="analysis-grid compact-learning-analysis">
              <article><span>Checks</span><strong>${learning.comprehensionChecks}</strong><small>completed</small></article>
              <article><span>Average</span><strong>${learning.comprehensionAverage || '—'}${learning.comprehensionAverage ? '%' : ''}</strong><small>all checks</small></article>
              <article><span>Best</span><strong>${learning.bestComprehension || '—'}${learning.bestComprehension ? '%' : ''}</strong><small>highest score</small></article>
            </div>
            <button class="secondary" type="button" data-action="comprehension-library">Open quizzes</button>
          </div>
        </details>

        <details class="analytics-card learning-progress-detail">
          <summary><span><strong>Great Ideas / Syntopicon</strong><small>Cross-book conceptual study</small></span><span>${learning.greatIdeasSessions} sessions</span></summary>
          <div class="progress-collapsible-body">
            <p>You have opened Great Ideas / Syntopicon ${learning.greatIdeasSessions} time${learning.greatIdeasSessions===1?'':'s'} since learning tracking began.</p>
            <button class="secondary" type="button" data-read="syntopicon">Explore Great Ideas</button>
          </div>
        </details>

        <details class="analytics-card learning-progress-detail">
          <summary><span><strong>Mnemonics</strong><small>Memory aids tied to your books</small></span><span>${learning.mnemonicsCreated} created</span></summary>
          <div class="progress-collapsible-body">
            <div class="analysis-grid compact-learning-analysis">
              <article><span>Mnemonics</span><strong>${learning.mnemonicsCreated}</strong><small>created</small></article>
              <article><span>Books covered</span><strong>${learning.mnemonicBooks}</strong><small>books / guides</small></article>
            </div>
            <button class="secondary" type="button" data-action="mnemonics">Create mnemonics</button>
          </div>
        </details>

        <details class="analytics-card learning-progress-detail">
          <summary><span><strong>Language Learning</strong><small>Lessons generated from your reading</small></span><span>${learning.languageLessons} lessons</span></summary>
          <div class="progress-collapsible-body">
            <div class="analysis-grid compact-learning-analysis">
              <article><span>Lessons</span><strong>${learning.languageLessons}</strong><small>completed</small></article>
              <article><span>Languages</span><strong>${learning.languagesPracticed.length}</strong><small>${escapeHtml(learning.languagesPracticed.slice(0,3).join(', ') || 'none yet')}</small></article>
            </div>
            <button class="secondary" type="button" data-action="language-learning">Practice a language</button>
          </div>
        </details>

        <details class="analytics-card learning-progress-detail">
          <summary><span><strong>Courses &amp; Learning Modules</strong><small>Outside learning connected to your books</small></span><span>${learning.courseOpens} opened</span></summary>
          <div class="progress-collapsible-body">
            <div class="analysis-grid compact-learning-analysis">
              <article><span>Course links opened</span><strong>${learning.courseOpens}</strong><small>tracked</small></article>
              <article><span>Providers explored</span><strong>${learning.courseProviders.length}</strong><small>${escapeHtml(learning.courseProviders.slice(0,4).join(', ') || 'none yet')}</small></article>
            </div>
            <button class="secondary" type="button" data-action="learning-courses">Find courses</button>
          </div>
        </details>
      </div>
    </section>

    <div class="progress-chart-grid">
      <section class="analytics-card">
        <div class="analytics-heading"><div><h2>Daily reading volume</h2><p>Words recorded over the last 30 days.</p></div></div>
        ${lineChartSvg(daily,'words',{label:'Daily words read during the last 30 days'})}
      </section>
      <section class="analytics-card">
        <div class="analytics-heading"><div><h2>Weekly reading time</h2><p>Minutes across the last eight weeks.</p></div></div>
        ${barChartSvg(weekly,'minutes',{label:'Weekly reading minutes',suffix:' min'})}
      </section>
      <section class="analytics-card">
        <div class="analytics-heading"><div><h2>Reading modes</h2><p>Share of recorded sessions by mode.</p></div></div>
        ${pieChartSvg(modeEntries,{label:'Reading sessions by mode'})}
      </section>
      <section class="analytics-card">
        <div class="analytics-heading"><div><h2>Pace trend</h2><p>Daily average WPM. Empty days remain visible so consistency is not hidden.</p></div></div>
        ${lineChartSvg(daily,'wpm',{label:'Daily average reading speed',suffix:' WPM'})}
      </section>
    </div>

    <details class="analytics-card progress-collapsible">
      <summary><span><span class="source-category">Statistical analysis</span><strong>What the record shows</strong></span><small>Open</small></summary>
      <div class="progress-collapsible-body">
      <div class="analysis-grid">
        <article><span>Average session</span><strong>${activity.length?Math.round(totalWords/activity.length).toLocaleString():'—'}</strong><small>words</small></article>
        <article><span>Average duration</span><strong>${activity.length?formatDuration(totalSeconds/activity.length):'—'}</strong><small>per session</small></article>
        <article><span>30-day consistency</span><strong>${awards.monthlyDays}/30</strong><small>active days</small></article>
        <article><span>Recent improvement</span><strong>${awards.improvement>0?'+':''}${awards.improvement||0}</strong><small>WPM vs prior sessions</small></article>
        <article><span>Books completed</span><strong>${awards.completed}</strong><small>this year</small></article>
        <article><span>Awards earned</span><strong>${earned}/${awards.definitions.length}</strong><small>trophies</small></article>
      </div>
      </div>
    </details>

    <details class="analytics-card recommendation-card progress-collapsible">
      <summary><span><span class="source-category">Coach</span><strong>Recommendations</strong></span><small>Open</small></summary>
      <div class="progress-collapsible-body">
      <div class="analytics-heading">
        <div><span class="source-category">Coach</span><h2>Recommendations</h2><p>Immediate guidance is calculated privately from the reading record. An optional AI analysis can add a more nuanced interpretation.</p></div>
        <button id="generate-ai-progress" class="primary" type="button">Generate AI analysis</button>
      </div>
      <div id="progress-recommendations" class="recommendation-grid">
        ${recommendations.map((item)=>`<article><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></article>`).join('')}
      </div>
      <p id="progress-ai-status" class="status"></p>
      </div>
    </details>

    <details class="analytics-card progress-collapsible">
      <summary><span><span class="source-category">Achievement cabinet</span><strong>Trophies &amp; milestones</strong></span><small>${earned} earned</small></summary>
      <div class="progress-collapsible-body">
      <div class="trophy-grid">
        ${awards.definitions.map((award)=>`<article class="trophy-card ${award.earned?'earned':'locked'}">
          <div class="trophy-icon" aria-hidden="true">${award.icon}</div>
          <div><h3>${escapeHtml(award.title)}</h3><p>${escapeHtml(award.description)}</p></div>
          <div class="trophy-progress"><span style="width:${Math.round(award.progress*100)}%"></span></div>
          <small>${award.earned?'Earned':'In progress · '+Math.round(award.progress*100)+'%'}</small>
        </article>`).join('')}
      </div>
      </div>
    </details>

    <details class="analytics-card progress-collapsible">
      <summary><span><strong>Recent books &amp; documents</strong></span><small>Open</small></summary>
      <div class="progress-collapsible-body">
      <div class="progress-book-list">${progress.sort((x,y)=>new Date(y.lastReadAt||0)-new Date(x.lastReadAt||0)).slice(0,10).map((item)=>{
        const percent=item.totalWords?Math.min(100,Math.round((Number(item.furthestWord)||0)/item.totalWords*100)):0;
        return `<article class="progress-book-card"><div><h3>${escapeHtml(item.title||'Untitled')}</h3><p>${percent}% complete · ${formatDuration(item.totalSeconds)} · ${Number(item.sessions)||0} sessions</p></div><div class="progress-meter"><span style="width:${percent}%"></span></div><button class="secondary" type="button" data-progress-open="${escapeHtml(item.documentId)}">Resume saved text</button></article>`;
      }).join('')||'<p class="navigation-empty">Complete a reading session to begin the analysis.</p>'}</div>
      </div>
    </details>
  </section>`;

  app.querySelector('#save-annual-reading-goal')?.addEventListener('click',()=>{
    setAnnualReadingGoal(app.querySelector('#annual-reading-goal')?.value);
    renderProgressDashboard();
  });

  app.querySelector('#clear-reading-progress')?.addEventListener('click',()=>{
    if(!window.confirm('Clear all recorded reading activity, progress, comprehension results, and earned award history from this browser?')) return;
    localStorage.removeItem(READING_PROGRESS_KEY);
    localStorage.removeItem(READING_ACTIVITY_KEY);
    localStorage.removeItem(COMPREHENSION_RESULTS_KEY);
    localStorage.removeItem(READING_AWARDS_KEY);
    localStorage.removeItem(LEARNING_ACTIVITY_KEY);
    renderProgressDashboard();
  });

  app.querySelectorAll('[data-progress-open]').forEach((button)=>button.addEventListener('click',()=>{
    const documentId=button.dataset.progressOpen;
    let data=null;
    try{data=JSON.parse(localStorage.getItem(`${DOCUMENT_STORAGE_PREFIX}${documentId}`)||'null');}catch{}
    if(!data?.text) return window.alert('That text is not stored in this browser. Open it again from My Reading or its original library.');
    renderReaderWithText(data.title,data.text,data.source||{type:'saved'});
    const record=readStoredObject(READING_PROGRESS_KEY)[documentId];
    requestAnimationFrame(()=>jumpToWordIndex(record?.lastWord||0));
  }));

  app.querySelector('#generate-ai-progress')?.addEventListener('click',async()=>{
    const button=app.querySelector('#generate-ai-progress');
    const status=app.querySelector('#progress-ai-status');
    const container=app.querySelector('#progress-recommendations');
    button.disabled=true;
    status.className='status';
    status.textContent='Analyzing your reading record…';
    try{
      const payload=await loadApiPayload('/api/progress-recommendations',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          summary:{
            totalWords,totalSeconds,averageWpm,effectiveWpm,
            comprehensionAverage:awards.compAverage,
            comprehensionChecks:comprehension.length,
            currentStreak:awards.streak,
            activeDays:awards.activeDays,
            completedBooks:awards.completed,
            annualGoal:goal,
            recentImprovementWpm:awards.improvement,
            learning
          },
          daily:daily.slice(-14).map(({label,words,minutes,wpm,sessions})=>({label,words,minutes,wpm,sessions})),
          weekly
        })
      });
      const items=Array.isArray(payload.recommendations)?payload.recommendations:[];
      if(!items.length) throw new Error('No recommendations were returned.');
      container.innerHTML=items.map((item)=>`<article><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.recommendation)}</p><small>${escapeHtml(item.reason||'')}</small></article>`).join('');
      status.className='status success';
      status.textContent='AI analysis complete.';
    }catch(error){
      status.className='status error';
      status.textContent=error.message||'AI analysis is unavailable.';
    }finally{button.disabled=false;}
  });
}

function getComprehensionResults() {
  return readStoredArray(COMPREHENSION_RESULTS_KEY);
}

function getComprehensionPositions() {
  return readStoredObject(COMPREHENSION_POSITION_KEY);
}

function setLastComprehensionPosition(documentId, index) {
  const positions = getComprehensionPositions();
  positions[documentId] = Math.max(0, Number(index) || 0);
  localStorage.setItem(COMPREHENSION_POSITION_KEY, JSON.stringify(positions));
}

function comprehensionPassage() {
  const endIndex = Math.max(0, Math.min(state.words.length, Number(state.index) || 0));
  const positions = getComprehensionPositions();
  const previous = Math.max(0, Math.min(endIndex, Number(positions[state.documentId]) || 0));
  let startIndex = previous;

  // Avoid huge requests when a reader has gone a long time between checks.
  if (endIndex - startIndex > 900) startIndex = Math.max(0, endIndex - 900);

  // On the first check, use up to the last 750 words.
  if (!previous) startIndex = Math.max(0, endIndex - 750);

  const passageWords = state.words
    .slice(startIndex, endIndex)
    .filter((word) => !isModernGuideActionToken(word));

  return {
    startIndex,
    endIndex,
    words: passageWords.length,
    passage: passageWords.join(' ')
  };
}

window.MarkSetGoStartComprehension = startComprehensionCheck;

function closeComprehensionDialog() {
  app.querySelector('#comprehension-dialog')?.close();
}

function renderComprehensionQuiz(quiz, context) {
  const dialog = app.querySelector('#comprehension-dialog');
  if (!dialog) return;
  const typeNames = {
    recall: 'Recall',
    main_idea: 'Main idea',
    inference: 'Inference',
    deeper_understanding: 'Deeper understanding'
  };

  dialog.innerHTML = `<form method="dialog" class="comprehension-card" id="comprehension-form">
    <div class="comprehension-heading">
      <div><span class="comprehension-kicker">Learning check</span><h2>Comprehension Check</h2><p>${context.words.toLocaleString()} words · ${escapeHtml(state.title)}</p></div>
      <button class="comprehension-close" value="cancel" type="submit" aria-label="Close">×</button>
    </div>
    <div class="comprehension-questions">
      ${quiz.questions.map((item, qIndex) => `<fieldset class="comprehension-question">
        <legend><span>${qIndex + 1}</span><div><small>${escapeHtml(typeNames[item.type] || item.type)}</small>${escapeHtml(item.question)}</div></legend>
        <div class="comprehension-choices">${item.choices.map((choice, cIndex) =>
          `<label><input type="radio" name="question-${qIndex}" value="${cIndex}"><span>${escapeHtml(choice)}</span></label>`
        ).join('')}</div>
        <div class="comprehension-explanation" id="explanation-${qIndex}" hidden></div>
      </fieldset>`).join('')}
    </div>
    <div class="comprehension-actions">
      <span id="comprehension-status" class="status"></span>
      <button id="score-comprehension" class="primary" type="button">Score Check</button>
      <button class="secondary" value="cancel" type="submit">Close</button>
    </div>
  </form>`;
  dialog.showModal();

  dialog.querySelector('#score-comprehension')?.addEventListener('click', () => {
    const unanswered = quiz.questions.some((_, index) => !dialog.querySelector(`input[name="question-${index}"]:checked`));
    if (unanswered) {
      dialog.querySelector('#comprehension-status').textContent = 'Answer all four questions first.';
      return;
    }

    let correct = 0;
    quiz.questions.forEach((item, index) => {
      const chosen = Number(dialog.querySelector(`input[name="question-${index}"]:checked`)?.value);
      const isCorrect = chosen === Number(item.correctIndex);
      if (isCorrect) correct += 1;
      dialog.querySelectorAll(`input[name="question-${index}"]`).forEach((input) => {
        input.disabled = true;
        const label = input.closest('label');
        label?.classList.toggle('answer-correct', Number(input.value) === Number(item.correctIndex));
        label?.classList.toggle('answer-wrong', input.checked && !isCorrect);
      });
      const explanation = dialog.querySelector(`#explanation-${index}`);
      explanation.hidden = false;
      explanation.innerHTML = `<strong>${isCorrect ? 'Correct.' : 'Not quite.'}</strong> ${escapeHtml(item.explanation)}`;
    });

    const percent = Math.round((correct / quiz.questions.length) * 100);
    const currentWpm = Math.max(0, Number(app.querySelector('#speed')?.value) || Number(state.wpm) || 0);
    const effectiveWpm = Math.round(currentWpm * (percent / 100));
    const result = {
      id: `comprehension-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      documentId: state.documentId,
      title: state.title,
      startIndex: context.startIndex,
      endIndex: context.endIndex,
      wordsTested: context.words,
      correct,
      total: quiz.questions.length,
      scorePercent: percent,
      wpm: currentWpm,
      effectiveWpm,
      createdAt: new Date().toISOString()
    };
    const results = getComprehensionResults();
    results.unshift(result);
    localStorage.setItem(COMPREHENSION_RESULTS_KEY, JSON.stringify(results.slice(0, 500)));
    setLastComprehensionPosition(state.documentId, context.endIndex);

    const status = dialog.querySelector('#comprehension-status');
    status.innerHTML = `<strong>${percent}% comprehension</strong>${currentWpm ? ` · ${effectiveWpm} effective WPM` : ''}`;
    const scoreButton = dialog.querySelector('#score-comprehension');
    scoreButton.disabled = true;
    scoreButton.textContent = `${correct} of ${quiz.questions.length} correct`;
  });
}

async function startComprehensionCheck() {
  if (!state.documentId || !state.words.length) return;
  const context = comprehensionPassage();
  if (context.words < 120) {
    window.alert(`Read a little farther first. You currently have ${context.words} new words available; a comprehension check needs at least 120.`);
    return;
  }

  const button = app.querySelector('#check-comprehension');
  const fsButton = app.querySelector('#fs-check-comprehension');
  const original = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Generating…'; }
  if (fsButton) { fsButton.disabled = true; fsButton.textContent = 'Generating…'; }

  const wasRunning = isReaderRunning();
  if (wasRunning) pauseReader();

  try {
    const response = await fetch('/api/comprehension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: state.title,
        passage: context.passage
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.detail || `Request failed with HTTP ${response.status}.`);
    if (!Array.isArray(payload.questions) || payload.questions.length !== 4) throw new Error('The quiz response was incomplete.');
    renderComprehensionQuiz(payload, context);
  } catch (error) {
    window.alert(`Comprehension check unavailable: ${error.message}`);
  } finally {
    if (button) { button.disabled = false; button.textContent = original || '🧠 Comprehension'; }
    if (fsButton) { fsButton.disabled = false; fsButton.textContent = 'Check comprehension'; }
  }
}

function vocabularyDue(item) {
  return !item.nextReviewAt || new Date(item.nextReviewAt).getTime() <= Date.now();
}

function updateVocabularyRating(id, rating) {
  const items = getSavedDefinitions();
  const item = items.find((entry) => entry.id === id);
  if (!item) return;
  const intervals = { again: 0, hard: 1, good: Math.max(3, (Number(item.intervalDays)||0) * 2 || 3), easy: Math.max(7, (Number(item.intervalDays)||0) * 3 || 7) };
  const days = intervals[rating] ?? 1;
  item.reviewCount = (Number(item.reviewCount) || 0) + 1;
  item.lastRating = rating;
  item.intervalDays = days;
  item.lastReviewedAt = new Date().toISOString();
  item.nextReviewAt = new Date(Date.now() + days * 86400000).toISOString();
  item.mastery = rating === 'again' ? 'learning' : rating === 'hard' ? 'familiar' : rating === 'easy' && item.reviewCount >= 3 ? 'mastered' : 'learning';
  saveDefinitions(items);
  renderVocabularyBuilder();
}

function renderVocabularyBuilder() {
  finalizeReadingSession();
  stopReader();
  const items = getSavedDefinitions().sort((a,b) => (vocabularyDue(b)?1:0) - (vocabularyDue(a)?1:0) || new Date(b.createdAt||0)-new Date(a.createdAt||0));
  const due = items.filter(vocabularyDue);
  const mastered = items.filter((item) => item.mastery === 'mastered').length;
  app.innerHTML = `<section class="panel vocabulary-builder">
    <div class="library-heading"><div><h1>Vocabulary Builder</h1><p>Review words you saved while reading. Rate each card to schedule its next review.</p></div></div>
    <div class="dashboard-stats vocabulary-stats"><article><span>Saved</span><strong>${items.length}</strong><small>words</small></article><article><span>Due now</span><strong>${due.length}</strong><small>reviews</small></article><article><span>Mastered</span><strong>${mastered}</strong><small>words</small></article></div>
    <div class="vocabulary-toolbar"><input id="vocabulary-search" type="search" placeholder="Search saved words or definitions"><select id="vocabulary-filter"><option value="all">All words</option><option value="due">Due now</option><option value="learning">Learning</option><option value="familiar">Familiar</option><option value="mastered">Mastered</option></select>${listPresentationControls('vocabulary', { collapsible:false, defaultView:'tiles' })}</div>
    <div id="vocabulary-list" class="vocabulary-list presentation-tiles"></div>
  </section>`;
  const list = app.querySelector('#vocabulary-list');
  const renderList = () => {
    const query = (app.querySelector('#vocabulary-search')?.value || '').trim().toLowerCase();
    const filter = app.querySelector('#vocabulary-filter')?.value || 'all';
    const filtered = items.filter((item) => {
      const matches = !query || `${item.word} ${item.definition} ${item.title}`.toLowerCase().includes(query);
      const status = item.mastery || 'learning';
      return matches && (filter === 'all' || (filter === 'due' ? vocabularyDue(item) : status === filter));
    });
    list.innerHTML = filtered.length ? filtered.map((item) => `<article class="vocabulary-card ${vocabularyDue(item)?'due':''}">
      <div class="vocabulary-card-head"><div><h2>${escapeHtml(item.word)}</h2><span>${escapeHtml(item.partOfSpeech || item.mastery || 'learning')}</span></div><button type="button" class="bookmark-remove" data-vocab-delete="${escapeHtml(item.id)}" aria-label="Delete word">×</button></div>
      <p>${escapeHtml(item.definition)}</p>${item.example ? `<blockquote>${escapeHtml(item.example)}</blockquote>` : ''}<small>From ${escapeHtml(item.title || 'a reading')} · ${vocabularyDue(item) ? 'Due now' : `Next review ${new Date(item.nextReviewAt).toLocaleDateString()}`}</small>
      <div class="vocabulary-rating"><button data-vocab-rate="again" data-vocab-id="${escapeHtml(item.id)}">Again</button><button data-vocab-rate="hard" data-vocab-id="${escapeHtml(item.id)}">Hard</button><button data-vocab-rate="good" data-vocab-id="${escapeHtml(item.id)}">Good</button><button data-vocab-rate="easy" data-vocab-id="${escapeHtml(item.id)}">Easy</button></div>
    </article>`).join('') : '<p class="navigation-empty">No saved words match this view. Right-click a word while reading and choose Save definition.</p>';
    list.querySelectorAll('[data-vocab-rate]').forEach((button) => button.addEventListener('click', () => updateVocabularyRating(button.dataset.vocabId, button.dataset.vocabRate)));
    list.querySelectorAll('[data-vocab-delete]').forEach((button) => button.addEventListener('click', () => { removeSavedDefinition(button.dataset.vocabDelete); renderVocabularyBuilder(); }));
  };
  bindListPresentationControls({
    key:'vocabulary',
    root:'#vocabulary-list',
    itemSelector:'.vocabulary-card',
    defaultView:'tiles'
  });
  app.querySelector('#vocabulary-search')?.addEventListener('input', renderList);
  app.querySelector('#vocabulary-filter')?.addEventListener('change', renderList);
  renderList();
}

function normalizeLookupWord(value) {
  return String(value || '').replace(/^[^\p{L}'’-]+|[^\p{L}'’-]+$/gu, '').toLocaleLowerCase();
}

// v9.2.44 Reader annotations use IndexedDB, not localStorage quota.
// The in-memory arrays preserve the existing synchronous API used throughout
// the Reader while IndexedDB provides the durable store.
const READER_DEFINITIONS_CACHE_KEY = 'reader-annotations:definitions:v1';
const READER_NOTES_CACHE_KEY = 'reader-annotations:notes:v1';

function readLegacyAnnotationArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let savedDefinitionsCache = readLegacyAnnotationArray(SAVED_DEFINITIONS_KEY).slice(0, 500);
let readerNotesCache = readLegacyAnnotationArray(NOTE_STORAGE_KEY).slice(0, 1000);
let readerAnnotationHydrated = false;

async function persistReaderAnnotationRecord(key, items) {
  const ok = await cacheReadingBook({
    key,
    type: 'reader-annotations',
    items,
    updatedAt: new Date().toISOString()
  });
  if (!ok) console.warn(`Reader annotations could not be persisted: ${key}`);
  return ok;
}

async function hydrateReaderAnnotationStores() {
  if (readerAnnotationHydrated) return;
  readerAnnotationHydrated = true;

  try {
    const [definitionRecord, noteRecord] = await Promise.all([
      getCachedReadingBook(READER_DEFINITIONS_CACHE_KEY),
      getCachedReadingBook(READER_NOTES_CACHE_KEY)
    ]);

    const indexedDefinitions = Array.isArray(definitionRecord?.items) ? definitionRecord.items : [];
    const indexedNotes = Array.isArray(noteRecord?.items) ? noteRecord.items : [];

    // If IndexedDB already has data, it is authoritative. Otherwise migrate the
    // legacy localStorage arrays once.
    if (indexedDefinitions.length) savedDefinitionsCache = indexedDefinitions;
    else if (savedDefinitionsCache.length) await persistReaderAnnotationRecord(READER_DEFINITIONS_CACHE_KEY, savedDefinitionsCache);

    if (indexedNotes.length) readerNotesCache = indexedNotes;
    else if (readerNotesCache.length) await persistReaderAnnotationRecord(READER_NOTES_CACHE_KEY, readerNotesCache);

    // Remove the bulky legacy copies only after IndexedDB has had a chance to
    // receive them. This also gives localStorage quota back to the rest of app.
    try { localStorage.removeItem(SAVED_DEFINITIONS_KEY); } catch {}
    try { localStorage.removeItem(NOTE_STORAGE_KEY); } catch {}

    if (app.querySelector('#reader')) {
      renderNavigationPane();
      applySavedDefinitionHighlights();
    }
  } catch (error) {
    console.warn('Reader annotation migration could not complete.', error);
  }
}

function getSavedDefinitions() {
  return savedDefinitionsCache;
}

function saveDefinitions(items) {
  savedDefinitionsCache = (Array.isArray(items) ? items : []).slice(0, 500);
  // Fire-and-forget durable save; never let browser quota errors break lookup.
  void persistReaderAnnotationRecord(READER_DEFINITIONS_CACHE_KEY, savedDefinitionsCache);
  return true;
}

function definitionsForCurrentDocument() {
  return getSavedDefinitions().filter((item) => item.documentId === state.documentId);
}

function savedDefinitionAt(index) {
  return definitionsForCurrentDocument().find((item) => Number(item.wordIndex) === Number(index));
}

function applySavedDefinitionHighlights() {
  if (!state.documentId) return;
  const indexes = new Set(definitionsForCurrentDocument().map((item) => String(item.wordIndex)));
  app.querySelectorAll('.reader-word[data-index]').forEach((element) => {
    element.classList.toggle('saved-definition-word', indexes.has(element.dataset.index));
  });
}

function removeSavedDefinition(id) {
  saveDefinitions(getSavedDefinitions().filter((item) => item.id !== id));
  renderNavigationPane();
  applySavedDefinitionHighlights();
}

function openSavedDefinition(id) {
  const item = getSavedDefinitions().find((entry) => entry.id === id);
  if (!item) return;
  if (item.documentId === state.documentId) jumpToWordIndex(item.wordIndex);
  showDictionaryResult(item.word, item.definition, item.partOfSpeech, item.example, true);
}



function getNotes() {
  return readerNotesCache;
}

function saveNotes(notes) {
  const trimmed = (Array.isArray(notes) ? notes : []).slice(0, 1000);
  readerNotesCache = trimmed;
  void persistReaderAnnotationRecord(READER_NOTES_CACHE_KEY, trimmed);

  // Keep only the tiny cookie used by the existing email/indicator workflow.
  const ids = trimmed.slice(0, 30).map((item) => item.id).join(',');
  document.cookie = `markSetGoNotes=${encodeURIComponent(ids)}; Max-Age=31536000; Path=/; SameSite=Lax`;
  return true;
}

// Hydrate after startup without blocking the Reader's first paint.
if (typeof requestIdleCallback === 'function') {
  requestIdleCallback(() => hydrateReaderAnnotationStores(), { timeout: 1200 });
} else {
  window.setTimeout(() => hydrateReaderAnnotationStores(), 100);
}

function collectEmailNotes() {
  const readerNotes = getNotes().map((item) => ({
    id: item.id,
    title: item.title || 'Reading note',
    body: item.note || '',
    context: [item.word ? `At “${item.word}”` : '', Number.isFinite(Number(item.wordIndex)) ? `word ${Number(item.wordIndex).toLocaleString()}` : ''].filter(Boolean).join(' · '),
    type: 'reader-note',
    updatedAt: item.updatedAt || item.createdAt
  }));
  const notebookNotes = getMarkRecords(MARK_INSIGHTS_KEY).map((item) => ({
    id: item.id,
    title: item.title || 'Notebook entry',
    body: notebookRecordFullText(item),
    context: item.chapter || item.pageContext || 'Mark Notebook',
    type: item.recordType || 'notebook-entry',
    updatedAt: item.updatedAt || item.createdAt
  }));
  const seen = new Set();
  return [...readerNotes, ...notebookNotes].filter((item) => {
    const body=String(item.body||'').trim();
    if(!body || seen.has(item.id)) return false;
    seen.add(item.id); return true;
  }).slice(0,200);
}


function collectNotebookEmailNotes() {
  const seen = new Set();
  return getMarkRecords(MARK_INSIGHTS_KEY).map((item) => ({
    id: item.id,
    title: item.title || 'Notebook entry',
    body: notebookRecordFullText(item),
    context: item.chapter || item.pageContext || 'Mark Notebook',
    type: item.recordType || 'notebook-entry',
    updatedAt: item.updatedAt || item.createdAt
  })).filter((item) => {
    const body = String(item.body || '').trim();
    if (!body || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, 200);
}

function notesForCurrentDocument() {
  return getNotes().filter((item) => item.documentId === state.documentId);
}

function noteAt(index) {
  return notesForCurrentDocument().some((item) => Number(item.wordIndex) === Number(index));
}

function ensureNoteDialog() {
  let dialog = document.querySelector('#reader-note-dialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'reader-note-dialog';
  dialog.className = 'reader-note-dialog';
  document.body.appendChild(dialog);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}

function showNoteEditor(context = state.contextWord, existing = null) {
  if (!context) return;
  const dialog = ensureNoteDialog();
  state.activeNoteId = existing?.id || null;
  dialog.innerHTML = `
    <form method="dialog" class="note-dialog-card">
      <div class="note-dialog-heading">
        <div><h2>${existing ? 'Edit note' : 'Add note'}</h2><p>At “${escapeHtml(context.word)}” · word ${Number(context.index).toLocaleString()}</p></div>
        <button class="note-dialog-close" value="cancel" aria-label="Close note editor">×</button>
      </div>
      <label for="reader-note-text">Your note</label>
      <textarea id="reader-note-text" rows="8" placeholder="Write an observation, question, quotation, or reminder…">${escapeHtml(existing?.note || '')}</textarea>
      <p id="note-editor-status" class="status"></p>
      <div class="note-dialog-actions">
        ${existing ? '<button id="delete-reader-note" class="danger" type="button">Delete</button>' : ''}
        <span></span>
        <button class="secondary" value="cancel">Cancel</button>
        <button id="save-reader-note" class="primary" type="button">Save note</button>
      </div>
    </form>`;
  dialog.querySelector('#save-reader-note')?.addEventListener('click', () => saveReaderNote(context, dialog));
  dialog.querySelector('#delete-reader-note')?.addEventListener('click', () => {
    if (state.activeNoteId) removeNote(state.activeNoteId);
    dialog.close();
  });
  if (!dialog.open) dialog.showModal();
  window.setTimeout(() => dialog.querySelector('#reader-note-text')?.focus(), 0);
}

function saveReaderNote(context, dialog = ensureNoteDialog()) {
  if (!state.documentId) return;
  const textarea = dialog.querySelector('#reader-note-text');
  const note = textarea?.value.trim();
  const status = dialog.querySelector('#note-editor-status');
  if (!note) {
    if (status) { status.className = 'status error'; status.textContent = 'Enter a note before saving.'; }
    return;
  }
  persistCurrentDocument();
  const notes = getNotes();
  const existing = notes.find((item) => item.id === state.activeNoteId);
  const item = {
    id: existing?.id || `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    documentId: state.documentId,
    title: state.title,
    word: context.word,
    wordIndex: Number(context.index),
    note,
    source: state.source,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  saveNotes([item, ...notes.filter((entry) => entry.id !== item.id)]);
  const renderedWord = app.querySelector(`.reader-word[data-index="${item.wordIndex}"]`);
  renderedWord?.classList.add('saved-note-word');
  renderNavigationPane();
  state.activeNoteId = item.id;
  if (status) { status.className = 'status'; status.textContent = 'Note saved.'; }
  window.setTimeout(() => dialog.close(), 250);
}

function removeNote(id) {
  const item = getNotes().find((entry) => entry.id === id);
  saveNotes(getNotes().filter((entry) => entry.id !== id));
  if (item?.documentId === state.documentId) {
    app.querySelector(`.reader-word[data-index="${item.wordIndex}"]`)?.classList.remove('saved-note-word');
  }
  renderNavigationPane();
}

function openSavedNote(id) {
  const item = getNotes().find((entry) => entry.id === id);
  if (!item) return;
  if (item.documentId === state.documentId) {
    jumpToWordIndex(item.wordIndex);
    requestAnimationFrame(() => {
      const element = app.querySelector(`.reader-word[data-index="${item.wordIndex}"]`);
      showNoteEditor({ word: item.word, index: item.wordIndex, element }, item);
    });
  } else {
    const dialog = ensureNoteDialog();
    dialog.innerHTML = `<form method="dialog" class="note-dialog-card"><div class="note-dialog-heading"><div><h2>${escapeHtml(item.title)}</h2><p>At “${escapeHtml(item.word)}” · word ${Number(item.wordIndex).toLocaleString()}</p></div><button class="note-dialog-close" value="cancel">×</button></div><div class="saved-note-body">${escapeHtml(item.note)}</div><p class="status">Open the related bookmark or text to return to this location.</p><div class="note-dialog-actions"><span></span><button class="primary" value="cancel">Close</button></div></form>`;
    if (!dialog.open) dialog.showModal();
  }
}

function getReadingList() {
  try {
    const parsed = JSON.parse(localStorage.getItem(READING_LIST_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveReadingList(items) {
  const trimmed = items.slice(0, 500);
  localStorage.setItem(READING_LIST_STORAGE_KEY, JSON.stringify(trimmed));
  const ids = trimmed.slice(0, 40).map((item) => item.id).join(',');
  document.cookie = `markSetGoReadingList=${encodeURIComponent(ids)}; Max-Age=31536000; Path=/; SameSite=Lax`;
}


function normalizedBookIdentity(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sameBookIdentity(left, right) {
  const a = normalizedBookIdentity(left);
  const b = normalizedBookIdentity(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

async function clearRemovedBookReferences(removed) {
  if (!removed) return;

  const removedTitle = removed.title || removed.name || '';
  const removedDocumentId = removed.documentId || removed.source?.documentId || '';

  // Clear the current in-memory Reader only when it is the removed book.
  if (
    (removedDocumentId && activeReaderSnapshot?.documentId === removedDocumentId)
    || sameBookIdentity(activeReaderSnapshot?.title, removedTitle)
  ) {
    activeReaderSnapshot = null;
  }

  // Clear the persistent Reader session stored independently in IndexedDB.
  try {
    const savedSession = await readReaderSession();
    if (
      savedSession
      && (
        (removedDocumentId && savedSession.documentId === removedDocumentId)
        || sameBookIdentity(savedSession.title, removedTitle)
      )
    ) {
      await clearReaderSession();
    }
  } catch (error) {
    console.warn('Could not inspect the saved Reader session while deleting a book.', error);
  }

  // Remove matching lightweight resume metadata even when IndexedDB is stale.
  try {
    const meta = JSON.parse(localStorage.getItem(READER_SESSION_META_KEY) || 'null');
    if (
      meta
      && (
        (removedDocumentId && meta.documentId === removedDocumentId)
        || sameBookIdentity(meta.title, removedTitle)
      )
    ) {
      localStorage.removeItem(READER_SESSION_META_KEY);
    }
  } catch {
    localStorage.removeItem(READER_SESSION_META_KEY);
  }

  // Remove matching progress and locally stored document records.
  const progress = readStoredObject(READING_PROGRESS_KEY);
  let progressChanged = false;

  Object.entries(progress).forEach(([documentId, record]) => {
    if (
      (removedDocumentId && documentId === removedDocumentId)
      || sameBookIdentity(record?.title, removedTitle)
    ) {
      delete progress[documentId];
      localStorage.removeItem(`${DOCUMENT_STORAGE_PREFIX}${documentId}`);
      progressChanged = true;
    }
  });

  if (progressChanged) {
    localStorage.setItem(READING_PROGRESS_KEY, JSON.stringify(progress));
  }

  // The live engine must not silently re-save a removed book on pagehide.
  if (
    (removedDocumentId && state.documentId === removedDocumentId)
    || sameBookIdentity(state.title, removedTitle)
  ) {
    stopReader();
    readerEngine.reset?.();
    state.title = '';
    state.currentText = '';
    state.originalText = '';
    state.words = [];
    state.index = 0;
    state.documentId = '';
    state.source = null;
  }
}

function renderReadingList() {
  stopReader();
  const items = getReadingList();
  const groups = [
    ['want-to-read', 'Want to Read'],
    ['reading', 'Currently Reading'],
    ['finished', 'Finished']
  ];
  app.innerHTML = `
    <section class="panel reading-list-page">
      <div class="library-heading"><div><h1>My Reading</h1><p>Keep your reading list, locally saved books, and progress together.</p></div></div>
      ${myReadingTabs('list')}

      <section class="my-reading-intake" aria-labelledby="my-reading-intake-title">
        <div class="my-reading-intake-copy">
          <span class="source-category">Add something to read</span>
          <h2 id="my-reading-intake-title">Bring reading into your library</h2>
        </div>
        <div class="my-reading-intake-actions">
          <button class="secondary" type="button" data-read="upload"><span aria-hidden="true">⇧</span><span>Import file</span></button>
          <button class="secondary" type="button" data-read="url"><span aria-hidden="true">↗</span><span>Read from URL</span></button>
          <button class="primary" type="button" data-read="book-builder"><span aria-hidden="true">✎</span><span>Create Book / Guide</span></button>
        </div>
      </section>

      <form id="reading-list-form" class="reading-list-form">
        <label>Title<input id="reading-list-title" required placeholder="Book title"></label>
        <label>Author<input id="reading-list-author" placeholder="Author"></label>
        <label>Status<select id="reading-list-status"><option value="want-to-read">Want to Read</option><option value="reading">Currently Reading</option><option value="finished">Finished</option></select></label>
        <label class="reading-list-note-field">Notes<input id="reading-list-note" placeholder="Optional note"></label>
        <button class="primary" type="submit">Add book</button>
        ${state.title && state.words.length ? '<button id="add-current-reading" class="secondary" type="button">Add current text</button>' : ''}
      </form>
      <div class="list-toolbar-row">
        <p id="reading-list-status-message" class="status"></p>
        ${listPresentationControls('my-reading-list', { collapsible:true, defaultView:'list' })}
      </div>
      <div class="reading-list-groups presentation-list">
        ${groups.map(([key, label]) => {
          const groupItems = items.filter((item) => item.status === key);
          return `<details class="reading-list-group" open><summary>${label} <span>${groupItems.length}</span></summary><div class="reading-list-items">${groupItems.length ? groupItems.map((item) => `
            <article class="reading-list-item" data-reading-item="${escapeHtml(item.id)}">
              <div><h3><button class="reading-title-link" type="button" data-free-text-item="${escapeHtml(item.id)}" data-free-text-title="${escapeHtml(item.title)}" data-free-text-author="${escapeHtml(item.author || '')}">${escapeHtml(item.title)}</button></h3><p>${escapeHtml(item.author || 'Author not entered')}</p>${difficultyBadge(getBookDifficulty({title:item.title, author:item.author || '', description:item.note || ''}), item)}<div class="free-text-links" data-free-text-links="${escapeHtml(item.id)}"><span>Checking local library and open sources…</span></div>${item.note ? `<p class="reading-list-item-note">${escapeHtml(item.note)}</p>` : ''}</div>
              <label>Status<select data-reading-status="${escapeHtml(item.id)}"><option value="want-to-read" ${item.status === 'want-to-read' ? 'selected' : ''}>Want to Read</option><option value="reading" ${item.status === 'reading' ? 'selected' : ''}>Currently Reading</option><option value="finished" ${item.status === 'finished' ? 'selected' : ''}>Finished</option></select></label>
              <button class="bookmark-remove" type="button" data-remove-reading="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.title)}">×</button>
            </article>`).join('') : '<p class="navigation-empty">No books in this section.</p>'}</div></details>`;
        }).join('')}
      </div>
    </section>`;

  async function resolveFreeTextForItem(item) {
    const container = app.querySelector(`[data-free-text-links="${CSS.escape(item.id)}"]`);
    const titleButton = app.querySelector(`[data-free-text-item="${CSS.escape(item.id)}"]`);
    if (!container) return;

    const cached = await getCachedReadingBook(readingCacheKey(item));
    if (cached?.text) {
      container.innerHTML = `<button class="free-text-open" type="button" data-open-cached-reading="${escapeHtml(item.id)}">Open local copy</button><span class="local-book-badge">Saved locally</span><button class="subtle-link" type="button" data-refresh-reading="${escapeHtml(item.id)}">Find another edition</button>`;
      titleButton?.setAttribute('data-open-cached-reading', item.id);
      titleButton?.setAttribute('title', 'Open the locally saved full text');
      return;
    }

    container.innerHTML = `<button class="free-text-open" type="button" data-find-reading="${escapeHtml(item.id)}">Find &amp; save full text</button><span>Searches all connected open sources</span>`;
    titleButton?.setAttribute('data-find-reading', item.id);
    titleButton?.setAttribute('title', 'Search all open sources and save the best readable edition locally');
  }

  async function findAndCacheReadingBook(item, { force = false } = {}) {
    const status = app.querySelector('#reading-list-status-message');
    const container = app.querySelector(`[data-free-text-links="${CSS.escape(item.id)}"]`);
    if (!force) {
      const cached = await getCachedReadingBook(readingCacheKey(item));
      if (cached?.text) return cached;
    }

    if (status) {
      status.className = 'status';
      status.textContent = `Searching all open sources for ${item.title}…`;
    }
    if (container) container.innerHTML = '<span>Searching Standard Ebooks, Internet Archive, Wikisource, Project Gutenberg, and other connected sources…</span>';

    const queries = [
      `${item.title} ${item.author || ''}`.trim(),
      item.title
    ].filter((value, index, all) => value && all.indexOf(value) === index);

    const candidatesByKey = new Map();
    for (const query of queries) {
      const payload = await loadApiPayload(`/api/library/search?q=${encodeURIComponent(query)}&provider=all`);
      (payload.books || []).forEach((book) => {
        if (!book?.readable) return;
        candidatesByKey.set(`${book.provider}:${book.id}`, book);
      });
    }

    const reference = { title: item.title, author: item.author || '' };
    const candidates = [...candidatesByKey.values()]
      .map((book) => ({ ...book, matchScore: scoreGreatBookCandidate(reference, book) }))
      .filter((book) => book.matchScore >= 40)
      .sort((x, y) => y.matchScore - x.matchScore);

    const failures = [];
    for (const candidate of candidates) {
      const providerLabel = LIBRARY_PROVIDERS[candidate.provider]?.label || candidate.provider;
      if (status) status.textContent = `Verifying ${providerLabel}: ${candidate.title}…`;

      try {
        const loaded = await loadApiPayload(`/api/library/read?provider=${encodeURIComponent(candidate.provider)}&id=${encodeURIComponent(candidate.id)}`);
        const text = String(loaded.text || '').trim();
        const words = splitWords(text).length;
        if (words < 1000) throw new Error('Returned text was only an excerpt or catalog description.');

        const validation = typeof validateGreatBookPrimaryText === 'function'
          ? validateGreatBookPrimaryText(reference, candidate, loaded)
          : { ok: true };
        if (!validation.ok) throw new Error(validation.reason);

        const record = {
          key: readingCacheKey(item),
          itemId: item.id,
          title: loaded.title || candidate.title || item.title,
          author: loaded.author || candidate.author || item.author || '',
          text,
          source: {
            type: candidate.provider,
            id: candidate.id,
            sourceUrl: loaded.sourceUrl || candidate.externalUrl || '',
            author: loaded.author || candidate.author || item.author || ''
          },
          provider: candidate.provider,
          savedAt: new Date().toISOString()
        };

        const saved = await cacheReadingBook(record);
        if (status) {
          status.className = saved ? 'status success' : 'status';
          status.textContent = saved
            ? `${record.title} was downloaded and saved locally.`
            : `${record.title} opened, but browser storage could not retain a local copy.`;
        }
        return record;
      } catch (error) {
        failures.push(`${providerLabel}: ${error.message}`);
      }
    }

    throw new Error(candidates.length
      ? `Matching results were found, but none contained a verified full text. ${failures.slice(0, 3).join(' · ')}`
      : 'No verified readable full-text edition was found in the connected open sources.');
  }

  async function openReadingListItem(item, { force = false } = {}) {
    const status = app.querySelector('#reading-list-status-message');
    try {
      const record = force
        ? await findAndCacheReadingBook(item, { force: true })
        : (await getCachedReadingBook(readingCacheKey(item))) || await findAndCacheReadingBook(item);
      if (!record?.text) throw new Error('No readable text is available.');
      renderReaderWithText(
        `${record.title}${record.author ? ` — ${record.author}` : ''}`,
        record.text,
        record.source || { type: 'saved-library' }
      );
    } catch (error) {
      if (status) {
        status.className = 'status error';
        status.textContent = error.message || 'The full text could not be opened.';
      }
      await resolveFreeTextForItem(item);
    }
  }

  items.forEach((item) => resolveFreeTextForItem(item));
  bindMyReadingTabs();
  bindListPresentationControls({
    key:'my-reading-list',
    root:'.reading-list-groups',
    itemSelector:'.reading-list-item',
    groupSelector:'.reading-list-group',
    defaultView:'list'
  });

  app.querySelector('.reading-list-page')?.addEventListener('click', async (event) => {
    const cachedTarget = event.target.closest('[data-open-cached-reading]');
    const findTarget = event.target.closest('[data-find-reading]');
    const refreshTarget = event.target.closest('[data-refresh-reading]');
    const id = cachedTarget?.dataset.openCachedReading || findTarget?.dataset.findReading || refreshTarget?.dataset.refreshReading;
    if (!id) return;
    const item = getReadingList().find((entry) => entry.id === id);
    if (!item) return;
    if (refreshTarget) await removeCachedReadingBook(readingCacheKey(item));
    await openReadingListItem(item, { force: Boolean(refreshTarget) });
  });

  const addItem = (title, author = '', status = 'want-to-read', note = '', source = null) => {
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) return;
    const current = getReadingList();
    const item = { id: `reading-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: cleanTitle, author: String(author || '').trim(), status, note: String(note || '').trim(), source, addedAt: new Date().toISOString() };
    saveReadingList([item, ...current]);
    renderReadingList();
  };
  app.querySelector('#reading-list-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    addItem(app.querySelector('#reading-list-title').value, app.querySelector('#reading-list-author').value, app.querySelector('#reading-list-status').value, app.querySelector('#reading-list-note').value);
  });
  app.querySelector('#add-current-reading')?.addEventListener('click', () => addItem(state.title, state.source?.author || '', 'reading', '', state.source));
  app.querySelectorAll('[data-reading-status]').forEach((select) => select.addEventListener('change', () => {
    const updated = getReadingList().map((item) => item.id === select.dataset.readingStatus ? { ...item, status: select.value, updatedAt: new Date().toISOString() } : item);
    saveReadingList(updated); renderReadingList();
  }));
  app.querySelectorAll('[data-remove-reading]').forEach((button) => button.addEventListener('click', async () => {
    const removed = getReadingList().find((item) => item.id === button.dataset.removeReading);
    saveReadingList(getReadingList().filter((item) => item.id !== button.dataset.removeReading));

    if (removed) {
      await removeCachedReadingBook(readingCacheKey(removed));
      await clearRemovedBookReferences(removed);
    }

    renderReadingList();
  }));
}

function simpleHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function documentIdFor(title, text) {
  return simpleHash(`${title}|${text.length}|${text.slice(0, 1000)}`);
}

function setBookmarkCookie(bookmarks) {
  const ids = bookmarks.slice(0, 20).map((item) => item.id).join(',');
  document.cookie = `markSetGoBookmarks=${encodeURIComponent(ids)}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function getBookmarks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BOOKMARK_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBookmarks(bookmarks) {
  const trimmed = bookmarks.slice(0, 20);
  localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(trimmed));
  setBookmarkCookie(trimmed);
}

function persistCurrentDocument() {
  if (!state.documentId || !state.currentText) return false;
  const key = `${DOCUMENT_STORAGE_PREFIX}${state.documentId}`;
  try {
    const next = {
      title: state.title,
      text: state.currentText,
      source: state.source
    };
    const existingRaw = localStorage.getItem(key);
    let shouldWrite = !existingRaw;
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw);
        shouldWrite = existing?.title !== next.title
          || existing?.text !== next.text
          || JSON.stringify(existing?.source || {}) !== JSON.stringify(next.source || {});
      } catch {
        shouldWrite = true;
      }
    }
    if (shouldWrite) {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch (error) {
        if (error?.name === 'QuotaExceededError') {
          try { localStorage.removeItem(MODERN_GUIDE_LIBRARY_KEY); } catch {}
          localStorage.setItem(key, JSON.stringify(next));
        } else {
          throw error;
        }
      }
    }
    return true;
  } catch (error) {
    console.warn('Document could not be stored in this browser.', error);
    return false;
  }
}


function registerCurrentDocumentInMyLibrary({ opened = false } = {}) {
  if (!state.documentId || !state.title || !Array.isArray(state.words) || !state.words.length) return false;

  try {
    const progress = readStoredObject(READING_PROGRESS_KEY);
    const existing = progress[state.documentId] || {};
    const now = new Date().toISOString();
    const currentIndex = Math.max(0, Math.min(state.words.length, Number(state.index) || 0));

    progress[state.documentId] = {
      ...existing,
      documentId: state.documentId,
      title: state.title,
      totalWords: state.words.length,
      furthestWord: Math.max(Number(existing.furthestWord) || 0, currentIndex),
      lastWord: Number.isFinite(Number(existing.lastWord)) ? Number(existing.lastWord) : currentIndex,
      totalSeconds: Number(existing.totalSeconds) || 0,
      totalWordsRead: Number(existing.totalWordsRead) || 0,
      sessions: Number(existing.sessions) || 0,
      firstOpenedAt: existing.firstOpenedAt || now,
      lastReadAt: opened || !existing.lastReadAt ? now : existing.lastReadAt,
      source: state.source?.type === 'modern-guide'
        ? {
            type:'modern-guide',
            id:state.source?.id || '',
            originalTitle:state.source?.originalTitle || '',
            originalAuthor:state.source?.originalAuthor || '',
            customGuide:Boolean(state.source?.customGuide),
            buyUrl:state.source?.buyUrl || '',
            guideInteractions:state.source?.guideInteractions || null
          }
        : state.source
    };

    localStorage.setItem(READING_PROGRESS_KEY, JSON.stringify(progress));
    return true;
  } catch (error) {
    console.warn('Could not register this reading in My Library.', error);
    return false;
  }
}

function classifyStructureLine(line, wordCount) {
  const clean = line.replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > 150 || wordCount > 22) return null;

  const lower = clean.toLowerCase().replace(/[.:]+$/, '').trim();
  const exactTypes = new Map([
    ['table of contents', 'contents'], ['contents', 'contents'],
    ['appendix', 'appendix'], ['appendices', 'appendix'],
    ['notes', 'notes'], ['endnotes', 'notes'], ['footnotes', 'notes'],
    ['index', 'index'], ['general index', 'index'],
    ['bibliography', 'bibliography'], ['references', 'bibliography'], ['works cited', 'bibliography'],
    ['preface', 'frontmatter'], ['foreword', 'frontmatter'], ['introduction', 'frontmatter'],
    ['prologue', 'frontmatter'], ['epilogue', 'backmatter'], ['afterword', 'backmatter'],
    ['conclusion', 'backmatter'], ['acknowledgments', 'backmatter'], ['acknowledgements', 'backmatter'],
    ['glossary', 'glossary']
  ]);
  if (exactTypes.has(lower)) return exactTypes.get(lower);

  if (/^(?:chapter|chap\.?)(?:\s+|\s*[ivxlcdm\d]+\b)/i.test(clean)) return 'chapter';
  if (/^(?:book|part)\s+(?:[ivxlcdm]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(clean)) return 'part';
  if (/^(?:section|article)\s+(?:[ivxlcdm]+|\d+|[a-z])\b/i.test(clean)) return 'section';
  if (/^appendix(?:\s+[a-z0-9ivxlcdm]+)?\b/i.test(clean)) return 'appendix';
  if (/^(?:notes?|endnotes?|footnotes?)\s+(?:to|on|for)\b/i.test(clean)) return 'notes';
  if (/^index\s+(?:of|to)\b/i.test(clean)) return 'index';
  if (/^(?:\d+|[ivxlcdm]+)\s*[.):-]\s+[A-Z][^.!?]{1,80}$/u.test(clean) && wordCount <= 10) return 'section';

  const allCaps = clean.length >= 4 && clean.length <= 90
    && /[A-Z]/.test(clean)
    && clean === clean.toUpperCase()
    && !/[.!?]$/.test(clean)
    && wordCount <= 12;
  if (allCaps) return 'section';
  return null;
}

function detectDocumentStructure(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const structures = [];
  let wordIndex = 0;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    const count = splitWords(line).length;
    const type = classifyStructureLine(line, count);
    if (type && count) {
      structures.push({
        title: line,
        type,
        start: wordIndex,
        end: wordIndex + count
      });
    }
    wordIndex += count;
  }

  // Gutenberg texts often repeat chapter titles in an early contents list.
  // Keep all structural markers for formatting, but make body occurrences the
  // preferred TOC target by marking the last repeated normalized title.
  const lastByTitle = new Map();
  structures.forEach((entry, index) => {
    const key = entry.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    lastByTitle.set(key, index);
  });
  structures.forEach((entry, index) => {
    const key = entry.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    entry.preferredToc = lastByTitle.get(key) === index;
  });
  return structures.slice(0, 1000);
}

function normalizeTocTitle(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .replace(/[.·•…]+\s*\d+\s*$/u, '')
    .replace(/^\s*(?:chapter|chap\.?|part|book|section)\s+(?:[ivxlcdm]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*[:.\-–—]?\s*/iu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function detectTableOfContents(text) {
  const structures = detectDocumentStructure(text);
  const tocTypes = new Set(['chapter', 'part', 'section', 'appendix', 'notes', 'index', 'frontmatter', 'backmatter', 'bibliography', 'glossary']);
  const contentsMarker = structures.find((entry) => entry.type === 'contents' && entry.start < 5000);

  // If the book contains a printed Contents section, use it as a guide but
  // always link each entry to a later, real heading in the body. This prevents
  // the navigation pane from becoming a copy of the printed contents pages.
  if (contentsMarker) {
    const lines = String(text).replace(/\r/g, '').split('\n');
    let running = 0, inContents = false;
    const printed = [];
    for (const raw of lines) {
      const line = raw.replace(/\s+/g, ' ').trim();
      const count = splitWords(line).length;
      if (!inContents && running <= contentsMarker.start + 10 && /^(?:table of contents|contents)$/i.test(line)) {
        inContents = true; running += count; continue;
      }
      if (inContents) {
        if (running > contentsMarker.start + 4500) break;
        if (line && line.length <= 160 && count <= 24) {
          const cleaned = line.replace(/(?:\.{2,}|\s{2,})\s*\d+\s*$/u, '').replace(/\s+\d+\s*$/u, '').trim();
          if (cleaned && !/^(?:contents|table of contents)$/i.test(cleaned)) printed.push(cleaned);
        }
      }
      running += count;
    }

    const bodyCandidates = structures.filter((e) => tocTypes.has(e.type) && e.start > contentsMarker.start + 30);
    const used = new Set();
    const matched = [];
    for (const label of printed) {
      const key = normalizeTocTitle(label);
      if (!key || key.length < 2) continue;
      let candidate = bodyCandidates.find((e) => !used.has(e.start) && normalizeTocTitle(e.title) === key);
      if (!candidate) candidate = bodyCandidates.find((e) => {
        if (used.has(e.start)) return false;
        const bodyKey = normalizeTocTitle(e.title);
        return key.length >= 5 && bodyKey.length >= 5 && (bodyKey.includes(key) || key.includes(bodyKey));
      });
      if (candidate) {
        used.add(candidate.start);
        matched.push({ title: candidate.title, index: candidate.start, type: candidate.type });
      }
    }
    if (matched.length >= 2) return matched.slice(0, 300);
  }

  // Fallback for books without a usable printed Contents section: keep only
  // unique structural headings and prefer their body occurrence.
  const seen = new Set();
  return structures
    .filter((entry) => tocTypes.has(entry.type) && entry.preferredToc)
    .filter((entry) => {
      const key = normalizeTocTitle(entry.title);
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    })
    .map((entry) => ({ title: entry.title, index: entry.start, type: entry.type }))
    .slice(0, 300);
}

function currentReadingPosition() {
  const reader = app.querySelector('#reader');
  if (!reader || !state.words.length) return Math.max(0, state.index || 0);
  if (state.index > 0 && getSelectedMode() !== 'two-column') {
    return Math.min(state.words.length - 1, state.index);
  }
  const scrollRange = Math.max(1, reader.scrollHeight - reader.clientHeight);
  const ratio = Math.max(0, Math.min(1, reader.scrollTop / scrollRange));
  return Math.min(state.words.length - 1, Math.round(ratio * (state.words.length - 1)));
}

function addBookmark() {
  if (!state.words.length) return;
  const stored = persistCurrentDocument();
  const position = currentReadingPosition();
  const bookmarks = getBookmarks();
  const item = {
    id: `${state.documentId}-${Date.now().toString(36)}`,
    documentId: state.documentId,
    title: state.title,
    wordIndex: position,
    mode: getSelectedMode(),
    createdAt: new Date().toISOString(),
    documentStored: stored,
    source: state.source
  };
  bookmarks.unshift(item);
  saveBookmarks(bookmarks);
  renderNavigationPane();
  const status = app.querySelector('#reader-status');
  if (status) status.textContent = stored
    ? `Bookmark saved at word ${position.toLocaleString()}.`
    : 'Bookmark position saved, but this large document could not be stored in this browser.';
}

function removeBookmark(id) {
  saveBookmarks(getBookmarks().filter((bookmark) => bookmark.id !== id));
  renderNavigationPane();
}

function jumpToWordIndex(wordIndex) {
  const index = Math.max(0, Math.min(state.words.length - 1, Number(wordIndex) || 0));
  stopReader();
  state.index = index;
  const mode = getSelectedMode();
  const groupSize = Number(app.querySelector('#word-count')?.value) || 1;
  prepareReaderView(mode, groupSize);

  requestAnimationFrame(() => {
    const reader = app.querySelector('#reader');
    if (!reader) return;
    if (!['flash', 'digital-sign'].includes(mode)) {
      const distantTocJump = !state.bookPages
        && (index < Number(state.renderedWordStart || 0)
          || index > Number(state.renderedWordEnd || 0) + 1600);
      if (distantTocJump) {
        virtualRenderer.renderWindowAround(reader, mode, groupSize, index);
      } else {
        ensureWordsRendered(reader, mode, groupSize, index + 100);
      }
      const target = reader.querySelector(`.reader-word[data-index="${index}"]`)
        || reader.querySelector(`.reader-group[data-start-index="${index}"]`);
      if (target) {
        if (state.bookPages) {
          const readerRect = reader.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const metrics = applyBookPageMetrics(reader);
          const absoluteLeft = targetRect.left - readerRect.left + reader.scrollLeft - metrics.paddingLeft;
          const pageIndex = Math.max(0, Math.floor((absoluteLeft + Math.min(targetRect.width / 2, metrics.pageWidth / 4)) / metrics.pagePitch));
          goToBookSpread(Math.floor(pageIndex / 2), { behavior: 'auto', ensureRendered: true });
        } else {
          const readerRect = reader.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          reader.scrollTop = Math.max(0, reader.scrollTop + targetRect.top - readerRect.top - 20);
        }
      }
    }
    updateReaderStatus();
    const start = app.querySelector('#start-reader');
    if (start) start.textContent = 'Resume';
  });
}

async function openBookmark(id) {
  const bookmark = getBookmarks().find((item) => item.id === id);
  if (!bookmark) return;
  let documentData = null;
  try {
    documentData = JSON.parse(localStorage.getItem(`${DOCUMENT_STORAGE_PREFIX}${bookmark.documentId}`) || 'null');
  } catch {
    documentData = null;
  }

  try {
    if (!documentData?.text && bookmark.source?.type === 'gutenberg' && bookmark.source.id) {
      const book = await loadApiPayload(`/api/gutenberg/books/${bookmark.source.id}/text`);
      const author = book.authors?.length ? ` — ${book.authors.join(', ')}` : '';
      documentData = { title: `${book.title}${author}`, text: book.text, source: bookmark.source };
    }
    if (!documentData?.text && bookmark.source?.type === 'built-in' && bookmark.source.key) {
      const loaded = await loadLocalText(bookmark.source.key);
      documentData = { ...loaded, source: bookmark.source };
    }
    if (!documentData?.text) throw new Error('The source text is no longer stored in this browser.');

    renderReaderWithText(documentData.title, documentData.text, documentData.source || bookmark.source || { type: 'bookmark' });
    requestAnimationFrame(() => {
      app.querySelector('#font-size')?.addEventListener('change', () => updateFocusAnchorOverlay());

  const modeSelect = app.querySelector('#mode-select');
      if (modeSelect && bookmark.mode) {
        modeSelect.value = bookmark.mode;
        prepareReaderView(bookmark.mode);
        updateModeControls(bookmark.mode);
      }
      jumpToWordIndex(bookmark.wordIndex);
    });
  } catch (error) {
    const status = app.querySelector('#reader-status');
    if (status) status.textContent = error.message;
  }
}

function renderNavigationPane() {
  const pane = app.querySelector('#navigation-pane');
  if (!pane) return;
  const bookmarks = getBookmarks();
  const pageBookmarks = getReaderBookmarks().filter((item) => item.documentId === state.documentId);
  const bookmarkCount = bookmarks.length + pageBookmarks.length;
  const tocMarkup = state.toc.length
    ? state.toc.map((entry, index) => `<button type="button" class="toc-link" data-toc-index="${entry.index}" title="Go to ${escapeHtml(entry.title)}"><span>${index + 1}</span>${escapeHtml(entry.title)}</button>`).join('')
    : '<p class="navigation-empty">No chapter headings were detected.</p>';
  const regularBookmarkMarkup = bookmarks.map((bookmark) => `<div class="bookmark-item"><button type="button" class="bookmark-open" data-open-bookmark="${escapeHtml(bookmark.id)}"><strong>${escapeHtml(bookmark.title)}</strong><span>Word ${Number(bookmark.wordIndex).toLocaleString()}</span></button><button type="button" class="bookmark-remove" data-remove-bookmark="${escapeHtml(bookmark.id)}" aria-label="Delete bookmark">×</button></div>`).join('');
  const pageBookmarkMarkup = pageBookmarks
    .sort((a,b)=>Number(a.pageNumber)-Number(b.pageNumber))
    .map((bookmark) => `<div class="bookmark-item"><button type="button" class="bookmark-open" data-open-reader-bookmark="${escapeHtml(bookmark.id)}"><strong>Page ${Number(bookmark.pageNumber)}</strong><span>Word ${Number(bookmark.wordIndex).toLocaleString()}</span></button><button type="button" class="bookmark-remove" data-remove-reader-bookmark-list="${escapeHtml(bookmark.id)}" aria-label="Delete page bookmark">×</button></div>`).join('');
  const bookmarkMarkup = bookmarkCount
    ? regularBookmarkMarkup + pageBookmarkMarkup
    : '<p class="navigation-empty">No bookmarks saved yet.</p>';
  const definitions = definitionsForCurrentDocument();
  const definitionMarkup = definitions.length
    ? definitions.map((item) => `<div class="definition-item"><button type="button" class="definition-open" data-open-definition="${escapeHtml(item.id)}"><strong>${escapeHtml(item.word)}</strong><span>${escapeHtml(item.definition)}</span></button><button type="button" class="bookmark-remove" data-remove-definition="${escapeHtml(item.id)}" aria-label="Delete saved definition">×</button></div>`).join('')
    : '<p class="navigation-empty">No saved definitions for this text.</p>';
  const notes = notesForCurrentDocument();
  const noteMarkup = notes.length
    ? notes.map((item) => `<div class="note-item"><button type="button" class="note-open" data-open-note="${escapeHtml(item.id)}"><strong>${escapeHtml(item.word)}</strong><span>${escapeHtml(item.note)}</span></button><button type="button" class="bookmark-remove" data-remove-note="${escapeHtml(item.id)}" aria-label="Delete note">×</button></div>`).join('')
    : '<p class="navigation-empty">No notes saved for this text.</p>';

  pane.innerHTML = `
    <div class="reader-library-header">
      <div><span>Reading tools</span><strong>Marks &amp; Contents</strong></div>
      <button id="close-navigation-pane" class="reader-panel-close" type="button" aria-label="Close marks and contents">×</button>
    </div>
    <div class="reader-library-tabs" role="tablist" aria-label="Reading tools">
      <button class="reader-library-tab active" type="button" role="tab" data-reader-tab="contents" aria-selected="true">Contents</button>
      <button class="reader-library-tab" type="button" role="tab" data-reader-tab="bookmarks" aria-selected="false">Bookmarks <span>${bookmarkCount}</span></button>
      <button class="reader-library-tab" type="button" role="tab" data-reader-tab="definitions" aria-selected="false">Definitions <span>${definitions.length}</span></button>
      <button class="reader-library-tab" type="button" role="tab" data-reader-tab="notes" aria-selected="false">Notes <span>${notes.length}</span></button>
    </div>
    <section class="navigation-section reader-library-view active" data-reader-view="contents">
      <div class="navigation-heading"><h2>Contents</h2><button id="add-bookmark" class="bookmark-add" type="button">＋ Bookmark</button></div>
      <div class="toc-list">${tocMarkup}</div>
    </section>
    <section class="navigation-section reader-library-view" data-reader-view="bookmarks">
      <div class="bookmark-list">${bookmarkMarkup}</div>
    </section>
    <section class="navigation-section reader-library-view" data-reader-view="definitions">
      <div class="definition-list">${definitionMarkup}</div>
    </section>
    <section class="navigation-section reader-library-view" data-reader-view="notes">
      <div class="note-list">${noteMarkup}</div>
    </section>`;

  pane.querySelectorAll('[data-reader-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.readerTab;
      pane.querySelectorAll('[data-reader-tab]').forEach((item) => {
        const selected = item === button;
        item.classList.toggle('active', selected);
        item.setAttribute('aria-selected', String(selected));
      });
      pane.querySelectorAll('[data-reader-view]').forEach((view) => {
        view.classList.toggle('active', view.dataset.readerView === tab);
      });
    });
  });
  pane.querySelector('#close-navigation-pane')?.addEventListener('click', () => {
    app.querySelector('#toggle-navigation-pane')?.click();
  });

  pane.querySelectorAll('[data-toc-index]').forEach((button) => {
    button.addEventListener('click', () => jumpToWordIndex(button.dataset.tocIndex));
  });
  pane.querySelector('#add-bookmark')?.addEventListener('click', addBookmark);
  pane.querySelectorAll('[data-open-bookmark]').forEach((button) => {
    button.addEventListener('click', () => openBookmark(button.dataset.openBookmark));
  });
  pane.querySelectorAll('[data-open-reader-bookmark]').forEach((button) => {
    button.addEventListener('click', () => {
      const bookmark = getReaderBookmarks().find((item) => item.id === button.dataset.openReaderBookmark);
      if (!bookmark) return;
      jumpToWordIndex(bookmark.wordIndex);
      requestAnimationFrame(updateReaderBookmarkMarkers);
    });
  });
  pane.querySelectorAll('[data-remove-reader-bookmark-list]').forEach((button) => {
    button.addEventListener('click', () => removeReaderBookmark(button.dataset.removeReaderBookmarkList));
  });
  pane.querySelectorAll('[data-remove-bookmark]').forEach((button) => {
    button.addEventListener('click', () => removeBookmark(button.dataset.removeBookmark));
  });
  pane.querySelectorAll('[data-open-definition]').forEach((button) => {
    button.addEventListener('click', () => openSavedDefinition(button.dataset.openDefinition));
  });
  pane.querySelectorAll('[data-remove-definition]').forEach((button) => {
    button.addEventListener('click', () => removeSavedDefinition(button.dataset.removeDefinition));
  });
  pane.querySelectorAll('[data-open-note]').forEach((button) => {
    button.addEventListener('click', () => openSavedNote(button.dataset.openNote));
  });
  pane.querySelectorAll('[data-remove-note]').forEach((button) => {
    button.addEventListener('click', () => removeNote(button.dataset.removeNote));
  });
}


function weatherPeriodMarkup(period) {
  const precipitation = Number.isFinite(period.precipitation)
    ? `<span><strong>Precipitation:</strong> ${period.precipitation}%</span>`
    : '';
  return `
    <article class="weather-period ${period.isDaytime ? 'daytime' : 'nighttime'}">
      <div class="weather-period-heading">
        <h3>${escapeHtml(period.name)}</h3>
        <strong class="weather-temperature">${escapeHtml(period.temperature)}°${escapeHtml(period.temperatureUnit)}</strong>
      </div>
      <p class="weather-short">${escapeHtml(period.shortForecast)}</p>
      <p>${escapeHtml(period.detailedForecast)}</p>
      <div class="weather-details">
        ${precipitation}
        <span><strong>Wind:</strong> ${escapeHtml(period.windSpeed)} ${escapeHtml(period.windDirection)}</span>
      </div>
    </article>`;
}

function renderWeatherResults(data) {
  const result = app.querySelector('#weather-results');
  if (!result) return;
  const days = Array.isArray(data.days) ? data.days : [];
  result.innerHTML = `
    <div class="weather-results-heading">
      <div><h2>${escapeHtml(data.location || data.zip)}</h2><p>Forecast separated by day and time period.</p></div>
      <button class="primary" id="weather-read-forecast" type="button">Load forecast into Reader</button>
    </div>
    <div class="weather-days">
      ${days.map((day) => `
        <section class="weather-day">
          <h2>${escapeHtml(day.label)}</h2>
          <div class="weather-periods">${day.periods.map(weatherPeriodMarkup).join('')}</div>
        </section>`).join('') || '<p class="status error">No forecast periods were returned.</p>'}
    </div>`;
  result.querySelector('#weather-read-forecast')?.addEventListener('click', () => {
    renderReaderWithText(`Weather for ${data.location || data.zip}`, data.text || '', {
      type: 'weather', key: data.zip, zip: data.zip
    });
  });
}

async function loadWeatherForZip(zip) {
  const status = app.querySelector('#weather-status');
  const result = app.querySelector('#weather-results');
  if (status) {
    status.className = 'status';
    status.textContent = 'Loading forecast…';
  }
  if (result) result.innerHTML = '';
  try {
    const response = await fetch(`/api/weather?zip=${encodeURIComponent(zip)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Weather could not be loaded.');
    setCookie('markSetGoWeatherZip', zip);
    if (status) status.textContent = `ZIP code ${zip} saved for future visits.`;
    renderWeatherResults(data);
  } catch (error) {
    if (status) {
      status.className = 'status error';
      status.textContent = error.message;
    }
  }
}

function renderWeather() {
  stopReader();
  const savedZip = getCookie('markSetGoWeatherZip');
  app.innerHTML = `
    <section class="panel weather-screen">
      <div class="library-heading">
        <div><h1>Local Weather</h1><p>Enter a U.S. ZIP code to display each forecast day separately.</p></div>
      </div>
      <form class="weather-zip-form" id="weather-zip-form">
        <label for="weather-zip">ZIP code</label>
        <input id="weather-zip" name="zip" inputmode="numeric" autocomplete="postal-code" maxlength="5" pattern="[0-9]{5}" value="${escapeHtml(savedZip)}" placeholder="06019" required />
        <button class="primary" type="submit">Get weather</button>
      </form>
      <p class="status" id="weather-status">${savedZip ? 'Loading your saved location…' : 'Your ZIP code is saved in a browser cookie on this device.'}</p>
      <div id="weather-results"></div>
    </section>`;
  const form = app.querySelector('#weather-zip-form');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const zip = String(new FormData(form).get('zip') || '').trim();
    if (!/^\d{5}$/.test(zip)) {
      const status = app.querySelector('#weather-status');
      status.className = 'status error';
      status.textContent = 'Enter a valid five-digit U.S. ZIP code.';
      return;
    }
    loadWeatherForZip(zip);
  });
  if (savedZip) loadWeatherForZip(savedZip);
}




const BOOK_DIFFICULTY_CACHE_KEY = 'markSetGoReadingProfileV2';

const BOOK_DIFFICULTY_LEVELS = [
  { max: 24, label: 'Accessible', className: 'accessible' },
  { max: 42, label: 'Moderate', className: 'moderate' },
  { max: 61, label: 'Challenging', className: 'challenging' },
  { max: 79, label: 'Advanced', className: 'advanced' },
  { max: 100, label: 'Expert', className: 'expert' }
];

function clampDifficulty(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function difficultyLevel(score) {
  const normalized = clampDifficulty(score);
  return BOOK_DIFFICULTY_LEVELS.find((item) => normalized <= item.max)
    || BOOK_DIFFICULTY_LEVELS[BOOK_DIFFICULTY_LEVELS.length - 1];
}

function difficultyCache() {
  try { return JSON.parse(localStorage.getItem(BOOK_DIFFICULTY_CACHE_KEY) || '{}') || {}; }
  catch { return {}; }
}

function difficultyKey({ documentId = '', title = '', author = '', provider = '', id = '' } = {}) {
  return [documentId, provider, id, title, author]
    .map((value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    .filter(Boolean)
    .join('|') || 'unknown-book';
}

function sampleBookText(text, maximumCharacters = 110000) {
  const raw = String(text || '').replace(/\r/g, '');
  if (raw.length <= maximumCharacters) return raw;

  const segments = 9;
  const perSegment = Math.floor(maximumCharacters / segments);
  const samples = [];

  for (let segment = 0; segment < segments; segment += 1) {
    const center = Math.floor((segment / Math.max(1, segments - 1)) * (raw.length - 1));
    let start = Math.max(0, Math.min(raw.length - perSegment, center - Math.floor(perSegment / 2)));
    let end = Math.min(raw.length, start + perSegment);

    const paragraphStart = raw.lastIndexOf('\n\n', start);
    if (paragraphStart >= Math.max(0, start - 500)) start = paragraphStart + 2;
    const paragraphEnd = raw.indexOf('\n\n', end);
    if (paragraphEnd > 0 && paragraphEnd <= end + 500) end = paragraphEnd;

    samples.push(raw.slice(start, end));
  }

  return samples.join('\n\n');
}

function readingProfileLevels(profile) {
  return {
    textual: difficultyLevel(profile.textualDifficulty),
    interpretation: difficultyLevel(profile.interpretationDifficulty),
    contextual: difficultyLevel(profile.contextualDifficulty),
    literary: difficultyLevel(profile.literaryComplexity)
  };
}

function summarizeReadingProfile(profile) {
  const levels = readingProfileLevels(profile);
  const reading = levels.textual.label;
  const interpretation = levels.interpretation.label;

  if (reading === interpretation) return `${reading} to read and interpret`;
  return `${reading} to read · ${interpretation} to interpret`;
}

function sentenceStatistics(text) {
  const normalized = String(text || '')
    .replace(/\[(?:PDF Page|Page)\s+\d+\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const sentences = normalized
    .match(/[^.!?]+(?:[.!?]+["'”’)]*|$)/g)
    ?.map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 3) || [];

  const lengths = sentences
    .map((sentence) => (sentence.match(/[A-Za-zÀ-ÖØ-öø-ÿĀ-ž'’-]+|\d+/g) || []).length)
    .filter((length) => length > 0 && length < 250);

  const average = lengths.reduce((sum, value) => sum + value, 0) / Math.max(1, lengths.length);
  const sorted = [...lengths].sort((x, y) => x - y);
  const percentile90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .9))] || average;
  const longRatio = lengths.filter((length) => length >= 30).length / Math.max(1, lengths.length);
  const veryLongRatio = lengths.filter((length) => length >= 45).length / Math.max(1, lengths.length);

  return { sentences, lengths, average, percentile90, longRatio, veryLongRatio };
}

function analyzeBookTextDifficulty(text, metadata = {}) {
  const sampleText = sampleBookText(text);
  const words = sampleText.match(/[A-Za-zÀ-ÖØ-öø-ÿĀ-ž'’-]+|\d+/g) || [];
  if (words.length < 120) return estimateBookDifficulty(metadata);

  const sentenceStats = sentenceStatistics(sampleText);
  const wordLengths = words
    .map((word) => word.replace(/[^A-Za-zÀ-ÖØ-öø-ÿĀ-ž]/g, '').length)
    .filter(Boolean);

  const averageWordLength = wordLengths.reduce((sum, value) => sum + value, 0) / Math.max(1, wordLengths.length);
  const longWordRatio = wordLengths.filter((length) => length >= 9).length / Math.max(1, wordLengths.length);
  const veryLongWordRatio = wordLengths.filter((length) => length >= 12).length / Math.max(1, wordLengths.length);
  const complexPunctuation = (sampleText.match(/[;:—–()[\]]/g) || []).length / Math.max(1, words.length);
  const paragraphCount = Math.max(1, sampleText.split(/\n\s*\n/).filter(Boolean).length);
  const dialogueParagraphs = sampleText.split(/\n\s*\n/)
    .filter((paragraph) => /^[\s"'“‘—-]/.test(paragraph.trim())).length;
  const dialogueRatio = dialogueParagraphs / paragraphCount;
  const properNameRatio = words.filter((word, index) => index > 0 && /^[A-Z][a-z]{2,}/.test(word)).length / Math.max(1, words.length);
  const foreignRatio = words.filter((word) => /[À-ÖØ-öø-ÿĀ-ž]/.test(word)).length / Math.max(1, words.length);
  const numeralRatio = words.filter((word) => /^\d+$/.test(word)).length / Math.max(1, words.length);
  const questionRatio = (sampleText.match(/\?/g) || []).length / Math.max(1, sentenceStats.sentences.length);
  const firstPersonRatio = (sampleText.match(/\b(?:I|me|my|mine|we|our|ours)\b/gi) || []).length / Math.max(1, words.length);
  const abstractTerms = (sampleText.match(/\b(?:truth|justice|freedom|faith|meaning|morality|conscience|existence|virtue|beauty|reason|soul|death|identity|memory|desire|power|society)\b/gi) || []).length / Math.max(1, words.length);

  const estimate = estimateBookDifficulty(metadata);

  const vocabulary = clampDifficulty(
    7 + (averageWordLength - 4.1) * 12 + longWordRatio * 145 + veryLongWordRatio * 150 + foreignRatio * 135
  );

  const syntax = clampDifficulty(
    4
    + Math.max(0, sentenceStats.average - 11) * 1.75
    + Math.max(0, sentenceStats.percentile90 - 22) * .65
    + sentenceStats.longRatio * 115
    + sentenceStats.veryLongRatio * 130
    + complexPunctuation * 310
  );

  /*
    Dialogue is not narrative complexity. The previous model treated quotation
    marks as complexity, which unfairly raised direct, dialogue-heavy writers.
  */
  const narrative = clampDifficulty(
    9
    + properNameRatio * 145
    + Math.max(0, properNameRatio - .035) * 350
    + estimate.signals.experimentalNarrative * 38
    + estimate.signals.epicScale * 18
  );

  const specialized = clampDifficulty(
    7 + numeralRatio * 360 + veryLongWordRatio * 90 + estimate.signals.specializedSubject * 38
  );

  const contextual = clampDifficulty(
    estimate.dimensions.backgroundKnowledge * .42
    + estimate.dimensions.culturalDistance * .34
    + estimate.dimensions.specializedKnowledge * .24
  );

  const allusive = clampDifficulty(
    estimate.dimensions.allusions * .72
    + estimate.dimensions.backgroundKnowledge * .18
    + estimate.dimensions.culturalDistance * .10
  );

  const conceptual = clampDifficulty(
    abstractTerms * 1550
    + questionRatio * 28
    + syntax * .15
    + specialized * .18
    + estimate.dimensions.conceptualDensity * .45
  );

  /*
    Interpretation is separate from mechanical readability. Sparse, direct
    prose can be easy to decode while still requiring inference. We keep this
    cautious because subtext cannot be measured reliably from punctuation alone.
  */
  const inferredSubtext = clampDifficulty(
    estimate.signals.interpretiveDepth * 42
    + Math.min(.035, dialogueRatio) * 300
    + Math.min(.045, firstPersonRatio) * 180
    + abstractTerms * 650
  );

  const textualDifficulty = clampDifficulty(vocabulary * .46 + syntax * .54);
  const contextualDifficulty = contextual;
  const literaryComplexity = clampDifficulty(narrative * .65 + estimate.signals.experimentalNarrative * 35);
  const interpretationDifficulty = clampDifficulty(
    conceptual * .30 + allusive * .23 + inferredSubtext * .32 + literaryComplexity * .15
  );

  const dimensions = {
    vocabulary,
    syntax,
    conceptualDensity: conceptual,
    backgroundKnowledge: estimate.dimensions.backgroundKnowledge,
    allusions: allusive,
    culturalDistance: estimate.dimensions.culturalDistance,
    narrativeComplexity: narrative,
    specializedKnowledge: specialized
  };

  const overallScore = clampDifficulty(
    textualDifficulty * .42
    + contextualDifficulty * .27
    + literaryComplexity * .13
    + interpretationDifficulty * .18
  );
  const level = difficultyLevel(overallScore);

  const profile = {
    score: overallScore,
    level: level.label,
    className: level.className,
    textualDifficulty,
    interpretationDifficulty,
    contextualDifficulty,
    literaryComplexity,
    confidence: words.length >= 5000 ? 'Analyzed' : 'Sample analyzed',
    basis: `${words.length.toLocaleString()} sampled words from the actual text`,
    dimensions,
    evidence: {
      averageSentenceLength: Number(sentenceStats.average.toFixed(1)),
      longSentencePercent: Math.round(sentenceStats.longRatio * 100),
      averageWordLength: Number(averageWordLength.toFixed(1)),
      longWordPercent: Math.round(longWordRatio * 100),
      dialoguePercent: Math.round(dialogueRatio * 100),
      properNamePercent: Number((properNameRatio * 100).toFixed(1))
    },
    reasons: topDifficultyReasons(dimensions),
    recommendations: difficultyRecommendations(overallScore, dimensions, {
      textualDifficulty,
      interpretationDifficulty,
      contextualDifficulty,
      literaryComplexity
    }),
    timeline: buildDifficultyTimeline(String(text || ''), metadata)
  };

  profile.summary = summarizeReadingProfile(profile);
  return profile;
}

function estimateBookDifficulty(book = {}) {
  const searchable = [book.title, book.author, book.description, book.subjects, book.year, book.language]
    .flat().filter(Boolean).join(' ').toLowerCase();
  const year = Number(String(book.year || '').match(/\d{4}/)?.[0]) || 0;
  const oldText = year && year < 1800 ? 18 : year && year < 1920 ? 8 : 0;
  const ancient = /(homer|plato|aristotle|aeschylus|sophocles|euripides|virgil|dante|augustine|aquinas|classics|ancient|medieval)/.test(searchable);
  const philosophy = /(philosoph|metaphys|epistem|ethic|theolog|treatise|critique|dialectic|political theory)/.test(searchable);
  const science = /(physics|mathemat|medicine|biology|chemistry|engineering|economics|law|technical|scientific)/.test(searchable);
  const experimentalNarrative = /(joyce|woolf|faulkner|proust|stream of consciousness|experimental|nonlinear|multiple narrators)/.test(searchable);
  const epicScale = /(epic|odyssey|iliad|divine comedy|paradise lost|war and peace|brothers karamazov|crime and punishment)/.test(searchable);
  const interpretiveDepth = /(symbolism|allegory|subtext|existential|modernist|literary fiction|psychological|tragedy)/.test(searchable);
  const foreign = /(russian|french|german|greek|roman|japanese|chinese|african|indian|translation|translated)/.test(searchable) || (book.language && !/^en/i.test(book.language));
  const children = /(children|juvenile|young reader|fairy tale|picture book)/.test(searchable);
  const specializedSubject = science || philosophy;

  const dimensions = {
    vocabulary: clampDifficulty(23 + oldText + (philosophy ? 16 : 0) + (science ? 13 : 0) + (experimentalNarrative ? 8 : 0) - (children ? 18 : 0)),
    syntax: clampDifficulty(21 + oldText + (philosophy ? 15 : 0) + (experimentalNarrative ? 28 : 0) + (epicScale ? 6 : 0) - (children ? 15 : 0)),
    conceptualDensity: clampDifficulty(20 + (philosophy ? 34 : 0) + (science ? 27 : 0) + (ancient ? 9 : 0) - (children ? 15 : 0)),
    backgroundKnowledge: clampDifficulty(19 + (ancient ? 30 : 0) + (philosophy ? 21 : 0) + (science ? 24 : 0) + oldText * .6),
    allusions: clampDifficulty(16 + (ancient ? 38 : 0) + (epicScale ? 20 : 0) + (philosophy ? 11 : 0)),
    culturalDistance: clampDifficulty(14 + (foreign ? 32 : 0) + (ancient ? 28 : 0) + oldText),
    narrativeComplexity: clampDifficulty(18 + (experimentalNarrative ? 44 : 0) + (epicScale ? 20 : 0) - (children ? 12 : 0)),
    specializedKnowledge: clampDifficulty(14 + (science ? 43 : 0) + (philosophy ? 27 : 0))
  };

  const textualDifficulty = clampDifficulty(dimensions.vocabulary * .46 + dimensions.syntax * .54);
  const contextualDifficulty = clampDifficulty(
    dimensions.backgroundKnowledge * .44
    + dimensions.culturalDistance * .34
    + dimensions.specializedKnowledge * .22
  );
  const literaryComplexity = dimensions.narrativeComplexity;
  const interpretationDifficulty = clampDifficulty(
    dimensions.conceptualDensity * .34
    + dimensions.allusions * .25
    + literaryComplexity * .17
    + interpretiveDepth * 24
  );

  const score = clampDifficulty(
    textualDifficulty * .42
    + contextualDifficulty * .27
    + literaryComplexity * .13
    + interpretationDifficulty * .18
  );
  const level = difficultyLevel(score);

  const profile = {
    score,
    level: level.label,
    className: level.className,
    textualDifficulty,
    interpretationDifficulty,
    contextualDifficulty,
    literaryComplexity,
    confidence: book.description || book.subjects ? 'Estimated' : 'Predicted',
    basis: book.description || book.subjects
      ? 'Estimated from catalog metadata'
      : 'Predicted from title, author, era, and available metadata',
    dimensions,
    signals: {
      experimentalNarrative: experimentalNarrative ? 1 : 0,
      epicScale: epicScale ? 1 : 0,
      interpretiveDepth: interpretiveDepth ? 1 : 0,
      specializedSubject: specializedSubject ? 1 : 0
    },
    evidence: null,
    reasons: topDifficultyReasons(dimensions),
    recommendations: difficultyRecommendations(score, dimensions, {
      textualDifficulty,
      interpretationDifficulty,
      contextualDifficulty,
      literaryComplexity
    }),
    timeline: []
  };

  profile.summary = summarizeReadingProfile(profile);
  return profile;
}

function buildDifficultyTimeline(text, metadata = {}) {
  const raw = String(text || '');
  if (raw.length < 5000) return [];

  const sections = raw
    .split(/\n\s*(?=(?:chapter|book|part|canto)\s+(?:[ivxlcdm]+|\d+|[a-z]+)\b)/i)
    .filter((section) => section.trim().length > 500);

  const chunks = sections.length >= 3
    ? sections.slice(0, 16)
    : Array.from({ length: 8 }, (_, index) => {
        const start = Math.floor((index / 8) * raw.length);
        const end = Math.floor(((index + 1) / 8) * raw.length);
        return raw.slice(start, end);
      });

  return chunks.map((chunk, index) => {
    const stats = sentenceStatistics(chunk);
    const words = chunk.match(/[A-Za-zÀ-ÖØ-öø-ÿĀ-ž'’-]+|\d+/g) || [];
    const lengths = words.map((word) => word.replace(/[^A-Za-zÀ-ÖØ-öø-ÿĀ-ž]/g, '').length).filter(Boolean);
    const longWords = lengths.filter((length) => length >= 9).length / Math.max(1, lengths.length);
    const score = clampDifficulty(
      8
      + Math.max(0, stats.average - 11) * 1.7
      + stats.longRatio * 120
      + longWords * 145
    );
    return {
      label: sections.length >= 3 ? `Section ${index + 1}` : `${Math.round((index / chunks.length) * 100)}–${Math.round(((index + 1) / chunks.length) * 100)}%`,
      score,
      level: difficultyLevel(score).label
    };
  });
}

function topDifficultyReasons(dimensions) {
  const labels = {
    vocabulary: 'uncommon or demanding vocabulary',
    syntax: 'long or structurally complex sentences',
    conceptualDensity: 'dense ideas, arguments, or implications',
    backgroundKnowledge: 'historical or subject background',
    allusions: 'literary, biblical, or classical allusions',
    culturalDistance: 'unfamiliar cultures, geography, or institutions',
    narrativeComplexity: 'characters, viewpoints, chronology, or narrative form',
    specializedKnowledge: 'technical or specialized knowledge'
  };

  return Object.entries(dimensions)
    .filter(([, value]) => value >= 35)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key]) => labels[key]);
}

function difficultyRecommendations(score, dimensions, profile = {}) {
  const recommendations = [];
  if (profile.textualDifficulty >= 70) recommendations.push('Begin around 180–220 WPM and increase gradually.');
  else if (profile.textualDifficulty >= 50) recommendations.push('Begin around 220–270 WPM.');
  else recommendations.push('Your usual reading speed should be a reasonable starting point.');

  if (profile.contextualDifficulty >= 50) recommendations.push('Use Prepare Me for historical, geographical, and cultural orientation.');
  if (dimensions.vocabulary >= 50) recommendations.push('Keep definitions available and save unfamiliar terms.');
  if (profile.literaryComplexity >= 50) recommendations.push('Use a character, chronology, or viewpoint guide.');
  if (profile.interpretationDifficulty >= 50) recommendations.push('Pause after each section to note subtext, symbols, or unresolved questions.');
  return recommendations.slice(0, 4);
}

function prepareMeTopics(profile, book = {}) {
  const topics = [];
  if (profile.dimensions.backgroundKnowledge >= 35) topics.push('Historical setting and timeline');
  if (profile.dimensions.culturalDistance >= 35) topics.push('Places, customs, institutions, and geography');
  if (profile.dimensions.allusions >= 35) topics.push('Important literary, biblical, and classical references');
  if (profile.dimensions.specializedKnowledge >= 35) topics.push('Essential subject vocabulary and concepts');
  if (profile.literaryComplexity >= 35) topics.push('Characters, narrators, chronology, and structure');
  if (profile.interpretationDifficulty >= 35) topics.push('Themes, symbols, subtext, and questions to watch');
  if (!topics.length) topics.push('Author, setting, central themes, and major characters');
  return topics;
}

function getBookDifficulty(book = {}, text = '') {
  const key = difficultyKey(book);
  const cache = difficultyCache();
  const signature = text
    ? `v2:${text.length}:${String(text).slice(0, 80)}`
    : `v2:${JSON.stringify([book.title, book.author, book.year, book.description]).slice(0, 240)}`;

  if (cache[key]?.signature === signature) return cache[key].profile;

  const profile = text ? analyzeBookTextDifficulty(text, book) : estimateBookDifficulty(book);
  cache[key] = { signature, profile, savedAt: Date.now() };
  try { localStorage.setItem(BOOK_DIFFICULTY_CACHE_KEY, JSON.stringify(cache)); } catch {}
  return profile;
}

function difficultyBadge(profile, book = {}) {
  const payload = encodeURIComponent(JSON.stringify({
    profile,
    book: { title: book.title || 'Untitled', author: book.author || '' }
  }));
  const readingLevel = difficultyLevel(profile.textualDifficulty || profile.score);
  const interpretationLevel = difficultyLevel(profile.interpretationDifficulty || profile.score);

  return `<button class="book-difficulty-badge difficulty-${escapeHtml(readingLevel.className)}" type="button"
      data-book-difficulty="${payload}" title="Open Reading Profile">
    <span>${escapeHtml(readingLevel.label)} to read</span>
    <small>${escapeHtml(interpretationLevel.label)} to interpret · ${escapeHtml(profile.confidence)}</small>
  </button>`;
}

function profileDimensionCard(icon, title, score, description) {
  const level = difficultyLevel(score);
  return `<article class="reading-profile-dimension">
    <span class="reading-profile-icon" aria-hidden="true">${icon}</span>
    <div>
      <small>${escapeHtml(title)}</small>
      <strong>${escapeHtml(level.label)}</strong>
      <p>${escapeHtml(description)}</p>
    </div>
    <span class="reading-profile-score">${clampDifficulty(score)}</span>
  </article>`;
}


function currentBookTextForProfile(book = {}) {
  if (state?.title && state?.currentText && sameBookIdentity(state.title, book.title)) {
    return state.currentText;
  }

  const progress = readStoredObject(READING_PROGRESS_KEY);
  const match = Object.values(progress).find((item) =>
    sameBookIdentity(item?.title, book.title)
    && (!book.author || !item?.author || sameBookIdentity(item.author, book.author))
  );

  if (match?.documentId) {
    try {
      const stored = localStorage.getItem(`${DOCUMENT_STORAGE_PREFIX}${match.documentId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed?.text || parsed?.currentText || '';
      }
    } catch {}
  }
  return '';
}

function boundedAiBookSample(text, maximumCharacters = 28000) {
  const sampled = sampleBookText(text, maximumCharacters);
  return sampled.replace(/\s+/g, ' ').trim().slice(0, maximumCharacters);
}

function mergeHybridReadingProfile(localProfile, aiProfile) {
  const blend = (localValue, aiValue, localWeight = .55) =>
    clampDifficulty((Number(localValue) || 0) * localWeight + (Number(aiValue) || 0) * (1 - localWeight));

  const enhanced = {
    ...localProfile,
    textualDifficulty: blend(localProfile.textualDifficulty, aiProfile.textualDifficulty, .68),
    interpretationDifficulty: blend(localProfile.interpretationDifficulty, aiProfile.interpretationDifficulty, .28),
    contextualDifficulty: blend(localProfile.contextualDifficulty, aiProfile.contextualDifficulty, .35),
    literaryComplexity: blend(localProfile.literaryComplexity, aiProfile.literaryComplexity, .40),
    confidence: `Hybrid AI + linguistic · ${aiProfile.confidence || 'medium'} confidence`,
    aiEnhanced: true,
    aiSummary: aiProfile.summary || '',
    aiEvidence: Array.isArray(aiProfile.evidence) ? aiProfile.evidence : [],
    preparationTopics: Array.isArray(aiProfile.preparationTopics) ? aiProfile.preparationTopics : [],
    interpretiveFeatures: Array.isArray(aiProfile.interpretiveFeatures) ? aiProfile.interpretiveFeatures : [],
    cautions: Array.isArray(aiProfile.cautions) ? aiProfile.cautions : []
  };

  enhanced.score = clampDifficulty(
    enhanced.textualDifficulty * .42
    + enhanced.contextualDifficulty * .27
    + enhanced.literaryComplexity * .13
    + enhanced.interpretationDifficulty * .18
  );
  const level = difficultyLevel(enhanced.score);
  enhanced.level = level.label;
  enhanced.className = level.className;
  enhanced.summary = summarizeReadingProfile(enhanced);
  return enhanced;
}

function readingProfileCacheKey(book = {}) {
  return `markSetGoHybridProfile:${difficultyKey(book)}`;
}

function savedHybridReadingProfile(book = {}) {
  try {
    const stored = JSON.parse(localStorage.getItem(readingProfileCacheKey(book)) || 'null');
    return stored?.profile || null;
  } catch {
    return null;
  }
}

function saveHybridReadingProfile(book, profile) {
  try {
    localStorage.setItem(readingProfileCacheKey(book), JSON.stringify({
      profile,
      savedAt: new Date().toISOString()
    }));
  } catch {}
}

function bookGuideCacheKey(book = {}, spoilerMode = 'none') {
  return `markSetGoBookGuide:${spoilerMode}:${difficultyKey(book)}`;
}

function savedBookGuide(book = {}, spoilerMode = 'none') {
  try {
    return JSON.parse(localStorage.getItem(bookGuideCacheKey(book, spoilerMode)) || 'null');
  } catch {
    return null;
  }
}

function saveBookGuide(book, spoilerMode, guide) {
  try {
    localStorage.setItem(bookGuideCacheKey(book, spoilerMode), JSON.stringify({
      guide,
      savedAt: new Date().toISOString()
    }));
  } catch {}
}

function renderQuickBookGuide(dialog, guide, book, spoilerMode) {
  let guidePanel = dialog.querySelector('#quick-book-guide-output');
  if (!guidePanel) {
    guidePanel = document.createElement('section');
    guidePanel.id = 'quick-book-guide-output';
    guidePanel.className = 'quick-book-guide-output';
    dialog.querySelector('.difficulty-disclaimer')?.before(guidePanel);
  }

  guidePanel.innerHTML = `
    <div class="quick-guide-heading">
      <div><span class="source-category">Quick Book Guide</span><h3>${escapeHtml(book?.title || 'Untitled')}</h3></div>
      <span>${escapeHtml(spoilerMode === 'none' ? 'Spoiler-free' : spoilerMode === 'light' ? 'Light spoilers' : 'Full guide')}</span>
    </div>
    <p class="quick-guide-overview">${escapeHtml(guide.overview || '')}</p>
    <div class="quick-guide-grid">
      <section><h4>Setting</h4><p>${escapeHtml(guide.setting || 'Not available.')}</p></section>
      <section><h4>Structure</h4><p>${escapeHtml(guide.structure || 'Not available.')}</p></section>
      <section><h4>Main characters</h4><ul>${(guide.characters || []).map((item) => `<li><strong>${escapeHtml(item.name)}</strong> — ${escapeHtml(item.role)}</li>`).join('') || '<li>No character list available.</li>'}</ul></section>
      <section><h4>Major themes</h4><ul>${(guide.themes || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>
      <section><h4>Helpful context</h4><ul>${(guide.context || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>No special background required.</li>'}</ul></section>
      <section><h4>Symbols and motifs</h4><ul>${(guide.symbolsAndMotifs || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>No major motifs listed.</li>'}</ul></section>
    </div>
    <section class="quick-guide-tips"><h4>Reading tips</h4><ul>${(guide.readingTips || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>
    <p class="quick-guide-spoiler-note">${escapeHtml(guide.spoilerNote || '')}</p>`;
  guidePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function enhanceReadingProfileWithAi({ dialog, book, localProfile, button }) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Analyzing with AI…';

  try {
    const text = currentBookTextForProfile(book);
    const response = await fetch('/api/reading-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        book,
        localProfile,
        sample: boundedAiBookSample(text)
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.detail || `Request failed with HTTP ${response.status}.`);

    const hybrid = mergeHybridReadingProfile(localProfile, payload.profile || {});
    saveHybridReadingProfile(book, hybrid);
    dialog.close();
    showBookDifficultyDialog(encodeURIComponent(JSON.stringify({ profile: hybrid, book })));
  } catch (error) {
    window.alert(`AI Reading Profile unavailable: ${error.message}`);
    button.disabled = false;
    button.textContent = original;
  }
}

async function requestQuickBookGuide({ dialog, book, spoilerMode, button }) {
  const cached = savedBookGuide(book, spoilerMode);
  if (cached?.guide) {
    renderQuickBookGuide(dialog, cached.guide, book, spoilerMode);
    return;
  }

  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Creating guide…';

  try {
    const text = currentBookTextForProfile(book);
    const response = await fetch('/api/book-guide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        book,
        spoilerMode,
        sample: boundedAiBookSample(text, 22000)
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.detail || `Request failed with HTTP ${response.status}.`);

    saveBookGuide(book, spoilerMode, payload.guide);
    renderQuickBookGuide(dialog, payload.guide, book, spoilerMode);
  } catch (error) {
    window.alert(`Quick Book Guide unavailable: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function showBookDifficultyDialog(payload) {
  let data = null;
  try { data = JSON.parse(decodeURIComponent(payload || '')); } catch {}
  if (!data?.profile) return;

  let { profile, book } = data;
  profile = savedHybridReadingProfile(book) || profile;
  const dimensions = profile.dimensions || {};
  const evidence = profile.evidence || {};
  const topics = prepareMeTopics(profile, book);

  let dialog = document.querySelector('#book-difficulty-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'book-difficulty-dialog';
    dialog.className = 'book-difficulty-dialog reading-profile-dialog';
    document.body.append(dialog);
  }

  const evidenceItems = [
    evidence.averageSentenceLength != null ? `Average sentence: ${evidence.averageSentenceLength} words` : null,
    evidence.longSentencePercent != null ? `Long sentences: ${evidence.longSentencePercent}%` : null,
    evidence.averageWordLength != null ? `Average word length: ${evidence.averageWordLength} letters` : null,
    evidence.longWordPercent != null ? `Long words: ${evidence.longWordPercent}%` : null,
    evidence.dialoguePercent != null ? `Dialogue-like paragraphs: ${evidence.dialoguePercent}%` : null,
    evidence.properNamePercent != null ? `Proper-name density: ${evidence.properNamePercent}%` : null
  ].filter(Boolean);

  dialog.innerHTML = `<div class="difficulty-dialog-header">
      <div>
        <span class="source-category">Reading Profile</span>
        <h2>${escapeHtml(book?.title || 'Untitled')}</h2>
        ${book?.author ? `<p>${escapeHtml(book.author)}</p>` : ''}
      </div>
      <button type="button" data-close-difficulty aria-label="Close">×</button>
    </div>

    <div class="reading-profile-summary">
      <strong>${escapeHtml(profile.summary || summarizeReadingProfile(profile))}</strong>
      <small>${escapeHtml(profile.confidence)} · ${escapeHtml(profile.basis)}</small>
    </div>

    <div class="reading-profile-dimension-grid">
      ${profileDimensionCard('📖', 'Textual difficulty', profile.textualDifficulty, 'Vocabulary, sentences, grammar, and decoding effort.')}
      ${profileDimensionCard('🧠', 'Interpretive difficulty', profile.interpretationDifficulty, 'Subtext, symbolism, ambiguity, themes, and implied meaning.')}
      ${profileDimensionCard('🌍', 'Contextual knowledge', profile.contextualDifficulty, 'History, geography, culture, institutions, and subject knowledge.')}
      ${profileDimensionCard('📚', 'Literary structure', profile.literaryComplexity, 'Narrators, chronology, viewpoints, characters, and formal experimentation.')}
    </div>

    <details class="reading-profile-details" open>
      <summary>Why these ratings?</summary>
      <div class="difficulty-dimensions">
        ${[
          ['Vocabulary', dimensions.vocabulary],
          ['Syntax', dimensions.syntax],
          ['Conceptual density', dimensions.conceptualDensity],
          ['Background knowledge', dimensions.backgroundKnowledge],
          ['Allusions', dimensions.allusions],
          ['Cultural distance', dimensions.culturalDistance],
          ['Narrative complexity', dimensions.narrativeComplexity],
          ['Specialized knowledge', dimensions.specializedKnowledge]
        ].map(([label, value]) => `<div>
          <span>${escapeHtml(label)}</span>
          <div class="difficulty-meter"><i style="width:${clampDifficulty(value)}%"></i></div>
          <strong>${clampDifficulty(value)}</strong>
        </div>`).join('')}
      </div>

      ${evidenceItems.length ? `<div class="reading-profile-evidence">
        ${evidenceItems.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
      </div>` : ''}

      ${(profile.reasons || []).length ? `<section>
        <h3>What may require extra effort</h3>
        <ul>${profile.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>
      </section>` : `<p class="difficulty-disclaimer">No major mechanical barriers were detected from the available text or metadata.</p>`}
    </details>

    <details class="reading-profile-details" ${profile.aiEnhanced ? 'open' : ''}>
      <summary>Hybrid AI analysis</summary>
      <div class="hybrid-profile-panel">
        ${profile.aiEnhanced ? `
          <p>${escapeHtml(profile.aiSummary || 'AI interpretation has been combined with the local linguistic analysis.')}</p>
          ${(profile.aiEvidence || []).length ? `<ul>${profile.aiEvidence.map((item) => `<li><strong>${escapeHtml(item.dimension.replace('_',' '))}:</strong> ${escapeHtml(item.finding)} <small>(${escapeHtml(item.basis.replaceAll('_',' '))})</small></li>`).join('')}</ul>` : ''}
          ${(profile.interpretiveFeatures || []).length ? `<p><strong>Interpretive features:</strong> ${escapeHtml(profile.interpretiveFeatures.join('; '))}</p>` : ''}
          ${(profile.cautions || []).length ? `<p><strong>Cautions:</strong> ${escapeHtml(profile.cautions.join('; '))}</p>` : ''}
        ` : `
          <p>Combine the transparent linguistic measurements with AI analysis of subtext, symbolism, historical context, literary form, and established characteristics of the work.</p>
          <button class="primary" type="button" data-enhance-reading-profile>Enhance with AI</button>
        `}
      </div>
    </details>

    <details class="reading-profile-details">
      <summary>Quick Book Guide</summary>
      <div class="quick-guide-request">
        <p>Generate a concise, Cliffs-style orientation only when requested. Choose how much plot information to include.</p>
        <label for="book-guide-spoilers">Spoiler level</label>
        <select id="book-guide-spoilers">
          <option value="none">Spoiler-free</option>
          <option value="light">Light spoilers</option>
          <option value="full">Full-work guide</option>
        </select>
        <button class="primary" type="button" data-create-book-guide>Create Quick Book Guide</button>
      </div>
    </details>

    <details class="reading-profile-details">
      <summary>Prepare me for this book</summary>
      <div class="prepare-me-panel">
        <p>A short orientation should cover:</p>
        <ul>${topics.map((topic) => `<li>${escapeHtml(topic)}</li>`).join('')}</ul>
        <button class="primary" type="button" data-prepare-book="${encodeURIComponent(JSON.stringify({book, topics}))}">Open with Ask Mark</button>
      </div>
    </details>

    ${profile.timeline?.length ? `<details class="reading-profile-details">
      <summary>Difficulty through the book</summary>
      <div class="difficulty-timeline">
        ${profile.timeline.map((item) => `<div title="${escapeHtml(`${item.label}: ${item.level}`)}">
          <span style="height:${Math.max(8, item.score)}%"></span>
          <small>${escapeHtml(item.label)}</small>
        </div>`).join('')}
      </div>
    </details>` : ''}

    <section>
      <h3>Recommended approach</h3>
      <ul>${(profile.recommendations || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </section>

    <p class="difficulty-disclaimer">
      Reading ease and interpretive depth are intentionally separated. A book may use simple prose while remaining profound or difficult to interpret. Metadata-only profiles are estimates and become stronger after a readable edition is opened.
    </p>`;

  dialog.querySelector('[data-enhance-reading-profile]')?.addEventListener('click', (event) => {
    enhanceReadingProfileWithAi({
      dialog,
      book,
      localProfile: profile,
      button: event.currentTarget
    });
  });

  dialog.querySelector('[data-create-book-guide]')?.addEventListener('click', (event) => {
    requestQuickBookGuide({
      dialog,
      book,
      spoilerMode: dialog.querySelector('#book-guide-spoilers')?.value || 'none',
      button: event.currentTarget
    });
  });

  dialog.querySelector('[data-close-difficulty]')?.addEventListener('click', () => dialog.close(), { once: true });
  dialog.querySelector('[data-prepare-book]')?.addEventListener('click', (event) => {
    let request = null;
    try { request = JSON.parse(decodeURIComponent(event.currentTarget.dataset.prepareBook || '')); } catch {}
    if (!request) return;
    dialog.close();
    ReaderContinuity?.saveBeforeNavigation?.();
    renderAiCenter();
    window.setTimeout(() => {
      const input = app.querySelector('textarea, input[type="text"]');
      if (input) {
        input.value = `Prepare me to read ${request.book?.title || 'this book'}${request.book?.author ? ` by ${request.book.author}` : ''}. Cover: ${(request.topics || []).join('; ')}. Keep it concise and avoid spoilers.`;
        input.focus();
      }
    }, 0);
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  }, { once: true });

  dialog.showModal();
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-book-difficulty]');
  if (!trigger) return;
  event.preventDefault();
  event.stopPropagation();
  showBookDifficultyDialog(trigger.dataset.bookDifficulty);
});

const LIBRARY_PROVIDERS = {
  standardebooks: { label: 'Standard Ebooks', icon: 'S', note: 'Carefully produced public-domain EPUB editions.' },
  internetarchive: { label: 'Internet Archive', icon: 'IA', note: 'Digitized books in EPUB, text, and OCR formats.' },
  openlibrary: { label: 'Open Library', icon: 'OL', note: 'Book discovery, editions, covers, and lending links.' },
  wikisource: { label: 'Wikisource', icon: 'W', note: 'Proofread public-domain texts from Wikimedia.' },
  gutenberg: { label: 'Project Gutenberg', icon: 'G', note: 'Public-domain ebooks with mirror fallback.' }
};

function unifiedBookCard(book, selectedFormat = 'best') {
  const provider = LIBRARY_PROVIDERS[book.provider] || { label: book.provider || 'Library', icon: '◫' };
  const canRead = Boolean(book.readable);
  const author = book.author || 'Unknown author';
  const details = [book.year, book.language, book.format].filter(Boolean).join(' · ');
  const difficulty = getBookDifficulty(book);
  const formatLabel = selectedFormat === 'epub' ? 'EPUB' : selectedFormat === 'pdf' ? 'PDF' : selectedFormat === 'text' ? 'Plain text' : '';
  return `
    <article class="unified-book-card">
      <div class="unified-cover-wrap">
        ${book.cover ? `<img class="unified-cover" src="${escapeHtml(book.cover)}" alt="Cover of ${escapeHtml(book.title)}" loading="lazy" referrerpolicy="no-referrer">` : `<div class="unified-cover-placeholder" aria-hidden="true">${escapeHtml(provider.icon)}</div>`}
        <span class="provider-badge">${escapeHtml(provider.icon)} ${escapeHtml(provider.label)}</span>
      </div>
      <div class="unified-book-body">
        <h2>${escapeHtml(book.title || 'Untitled')}</h2>
        <p class="unified-author">${escapeHtml(author)}</p>
        ${details ? `<p class="unified-meta">${escapeHtml(details)}</p>` : ''}
        ${difficultyBadge(difficulty, book)}
        ${book.description ? `<p class="unified-description">${escapeHtml(book.description)}</p>` : ''}
        <div class="unified-actions">
          ${canRead ? `<button class="primary" type="button" data-library-read="${escapeHtml(book.provider)}" data-library-id="${escapeHtml(book.id)}" data-library-format="${escapeHtml(selectedFormat)}">▸ ${formatLabel ? `Open ${formatLabel}` : 'Read now'}</button>` : ''}
          ${book.externalUrl ? `<a class="secondary button-link" href="${escapeHtml(book.externalUrl)}" target="_blank" rel="noopener noreferrer">↗ Book page</a>` : ''}
          <button class="secondary" type="button" data-library-save='${escapeHtml(JSON.stringify({title: book.title, author, sourceUrl: book.externalUrl || '', provider: book.provider}))}'>＋ Reading list</button>
        </div>
      </div>
    </article>`;
}

function browseCatalogText(item = {}) {
  return [
    item.title,
    item.author,
    item.category,
    item.badge,
    item.blurb,
    item.detail
  ].filter(Boolean).join(' ').toLocaleLowerCase();
}

function browseCatalogMatches(items = [], query = '') {
  const q = String(query || '').trim().toLocaleLowerCase();
  if (!q) return items.slice();
  return items.filter((item) => browseCatalogText(item).includes(q));
}

function browseSearchLocalCard(item, kind = 'free') {
  const paletteStyle = `--cover-a:${item.palette?.[0] || '#7cb6ff'}; --cover-b:${item.palette?.[1] || '#2d6ab7'}; --cover-c:${item.palette?.[2] || '#16355a'};`;
  const isGuide = kind === 'guide';
  return `
    <article class="unified-book-card browse-search-local-card">
      <div class="browse-search-mini-cover" style="${paletteStyle}">
        <span>${escapeHtml(isGuide ? 'Modern Guide' : (item.category || 'Free Book'))}</span>
        <strong>${escapeHtml(item.title || '')}</strong>
        <small>${escapeHtml(item.author || '')}</small>
      </div>
      <div class="unified-book-copy">
        <span class="source-category">${escapeHtml(isGuide ? 'In Mark, Set, Go!' : (item.badge || item.category || 'Browse'))}</span>
        <h2>${escapeHtml(item.title || '')}</h2>
        <p>${escapeHtml(item.blurb || '')}</p>
        <small>${escapeHtml(item.detail || '')}</small>
        <div class="unified-book-actions">
          ${isGuide
            ? `<button class="primary" type="button" data-search-open-guide="${escapeHtml(item.id)}">Read guide</button>${item.buyUrl ? `<a class="secondary button-link" href="${escapeHtml(item.buyUrl)}" target="_blank" rel="noopener noreferrer">Buy original</a>` : ''}`
            : `<button class="primary" type="button" data-search-open-free-book="${escapeHtml(item.id)}">${escapeHtml(item.actionLabel || 'Open')}</button>`}
        </div>
      </div>
    </article>`;
}

function bindBrowseSearchLocalActions(container) {
  container?.querySelectorAll('[data-search-open-guide]').forEach((button) => button.addEventListener('click', async () => {
    const guide = MODERN_GUIDE_SHELF.find((item) => item.id === button.dataset.searchOpenGuide && item.active);
    if (!guide) return;
    try {
      const response = await fetch(`/texts/modern-guides/${encodeURIComponent(guide.id)}-guide.txt`, { cache:'no-store' });
      if (!response.ok) throw new Error(`Could not load the ${guide.title} guide.`);
      const text = await response.text();
      renderReaderWithText(`${guide.title} — Mark, Set, Go! Guide`, text, {
        type:'modern-guide',
        id:guide.id,
        title:`${guide.title} — Mark, Set, Go! Guide`,
        originalTitle:guide.title,
        originalAuthor:guide.author,
        buyUrl:guide.buyUrl,
        subtitle:`An independent reading guide to ${guide.title}`
      });
    } catch (error) {
      window.alert(error?.message || 'The guide could not be opened.');
    }
  }));

  container?.querySelectorAll('[data-search-open-free-book]').forEach((button) => button.addEventListener('click', async () => {
    const item = BROWSE_FREE_BOOKS.find((entry) => entry.id === button.dataset.searchOpenFreeBook);
    if (!item?.action) return;
    if (item.action.type === 'search') {
      renderUnifiedLibrary({ query:item.action.query || item.title || '', scope:'online' });
      return;
    }
    if (item.action.type === 'source') {
      try {
        const loaded = await loadLocalText(item.action.key);
        renderReaderWithText(loaded.title, loaded.text, { type:'local-library', id:item.action.key, title:loaded.title });
      } catch (error) {
        window.alert(error?.message || 'That text could not be opened.');
      }
    }
  }));
}

function renderUnifiedLibrary(initial = {}) {
  stopReader();
  const query = initial.query || localStorage.getItem('markSetGoPendingLibrarySearch') || '';
  const provider = initial.provider || 'all';
  const scope = initial.scope || localStorage.getItem('markSetGoPendingBrowseScope') || 'all';

  const scopeLabels = {
    all: 'Everything',
    modern: 'Modern Guides',
    free: 'Free Books & Classics',
    online: 'Online Libraries',
    collections: 'Curated Collections'
  };

  app.innerHTML = `
    <section class="panel unified-library">
      <div class="library-heading unified-library-heading">
        <div>
          <button class="text-link browse-search-back" type="button" data-action="browse">← Back to Browse</button>
          <h1><span class="title-icon">⌕</span> Browse Search</h1>
          <p>Search Mark, Set, Go! guides and books together with trusted online library sources.</p>
        </div>
        <button class="secondary" type="button" data-read="upload">⇧ Import my own text</button>
      </div>

      <form id="unified-library-search" class="unified-search-form browse-results-search">
        <label class="unified-search-box"><span aria-hidden="true">⌕</span><input id="unified-library-query" type="search" value="${escapeHtml(query)}" placeholder="Search title, author, subject, or idea…" autocomplete="off"></label>
        <select id="unified-browse-scope" aria-label="What to search">
          <option value="all" ${scope === 'all' ? 'selected' : ''}>Everything</option>
          <option value="modern" ${scope === 'modern' ? 'selected' : ''}>Modern Guides</option>
          <option value="free" ${scope === 'free' ? 'selected' : ''}>Free Books & Classics</option>
          <option value="online" ${scope === 'online' ? 'selected' : ''}>Online Libraries</option>
          <option value="collections" ${scope === 'collections' ? 'selected' : ''}>Curated Collections</option>
        </select>
        <select id="unified-library-provider" aria-label="Online library source">
          <option value="all" ${provider === 'all' ? 'selected' : ''}>All online libraries</option>
          ${Object.entries(LIBRARY_PROVIDERS).map(([key, item]) => `<option value="${key}" ${provider === key ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
        </select>
        <select id="unified-library-format" aria-label="Book format">
          <option value="best">Best available</option>
          <option value="text">Plain text</option>
          <option value="epub">EPUB</option>
          <option value="pdf">PDF</option>
        </select>
        <button class="primary" type="submit">Search</button>
      </form>

      <div id="browse-local-search-results"></div>

      <section id="browse-online-search-section" class="browse-search-online-section">
        <div class="section-heading browse-online-heading">
          <div>
            <span class="source-category">Online</span>
            <h2>Online library results</h2>
            <p>Search Project Gutenberg, Internet Archive, Open Library, and Google Books.</p>
          </div>
        </div>
        <div class="provider-strip" aria-label="Library sources">
          ${Object.entries(LIBRARY_PROVIDERS).map(([key, item]) => `<button class="provider-tile ${provider === key ? 'active' : ''}" type="button" data-provider-filter="${key}"><span>${escapeHtml(item.icon)}</span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.note)}</small></button>`).join('')}
        </div>
        <div class="list-toolbar-row">
          <p id="unified-library-status" class="status">Enter a title or author to search online libraries.</p>
          ${listPresentationControls('all-libraries', { collapsible:false, defaultView:'tiles' })}
        </div>
        <div id="unified-library-results" class="unified-results presentation-tiles" aria-live="polite"></div>
        <p class="library-note">Availability differs by source and country. Open Library may link to borrowing or preview pages rather than provide downloadable text.</p>
      </section>
    </section>`;

  bindListPresentationControls({
    key:'all-libraries',
    root:'#unified-library-results',
    itemSelector:'.unified-book-card',
    defaultView:'tiles'
  });

  const form = app.querySelector('#unified-library-search');
  const status = app.querySelector('#unified-library-status');
  const results = app.querySelector('#unified-library-results');
  const localResults = app.querySelector('#browse-local-search-results');
  const onlineSection = app.querySelector('#browse-online-search-section');

  const renderLocal = (q, selectedScope) => {
    const guideMatches = ['all','modern'].includes(selectedScope) ? browseCatalogMatches(MODERN_GUIDE_SHELF, q) : [];
    const freeMatches = ['all','free'].includes(selectedScope) ? browseCatalogMatches(BROWSE_FREE_BOOKS, q) : [];
    const collectionMatches = ['all','collections'].includes(selectedScope)
      ? BROWSE_COLLECTIONS.filter(([label, collectionQuery]) => `${label} ${collectionQuery}`.toLocaleLowerCase().includes(String(q || '').toLocaleLowerCase()))
      : [];

    const count = guideMatches.length + freeMatches.length + collectionMatches.length;
    if (!['all','modern','free','collections'].includes(selectedScope)) {
      localResults.innerHTML = '';
      return;
    }

    localResults.innerHTML = `
      <section class="browse-search-local-section">
        <div class="section-heading">
          <div>
            <span class="source-category">${escapeHtml(scopeLabels[selectedScope] || 'Browse')}</span>
            <h2>${count ? `Matches in Mark, Set, Go!` : 'No matching titles in this collection'}</h2>
            <p>${count ? `${count} result${count === 1 ? '' : 's'} from Modern Guides, included classics, and curated shelves.` : 'Try a broader term or search the online libraries.'}</p>
          </div>
        </div>
        ${guideMatches.length ? `<div class="browse-search-result-group"><h3>Modern Guides</h3><div class="unified-results presentation-tiles">${guideMatches.map((item) => browseSearchLocalCard(item,'guide')).join('')}</div></div>` : ''}
        ${freeMatches.length ? `<div class="browse-search-result-group"><h3>Free Books & Classics</h3><div class="unified-results presentation-tiles">${freeMatches.map((item) => browseSearchLocalCard(item,'free')).join('')}</div></div>` : ''}
        ${collectionMatches.length ? `<div class="browse-search-result-group"><h3>Curated Collections</h3><div class="browse-collection-list">${collectionMatches.map(([label, collectionQuery]) => `<button class="browse-collection-chip" type="button" data-search-collection-query="${escapeHtml(collectionQuery)}">${escapeHtml(label)}</button>`).join('')}</div></div>` : ''}
      </section>`;

    bindBrowseSearchLocalActions(localResults);
    localResults.querySelectorAll('[data-search-collection-query]').forEach((button) => button.addEventListener('click', () => {
      app.querySelector('#unified-library-query').value = button.dataset.searchCollectionQuery || '';
      app.querySelector('#unified-browse-scope').value = 'all';
      search();
    }));
  };

  const searchOnline = async (q, source, format) => {
    status.className = 'status';
    status.textContent = `Searching ${source === 'all' ? 'all online libraries' : LIBRARY_PROVIDERS[source]?.label || source}…`;
    results.innerHTML = '<div class="library-loading"><span class="loading-book">◫</span><p>Gathering editions…</p></div>';
    try {
      const payload = await loadApiPayload(`/api/library/search?q=${encodeURIComponent(q)}&provider=${encodeURIComponent(source)}&format=${encodeURIComponent(format)}`);
      const books = Array.isArray(payload.books) ? payload.books : [];
      status.textContent = books.length ? `${books.length} online result${books.length === 1 ? '' : 's'} found.` : 'No online books found. Try a broader search.';
      results.innerHTML = books.length ? books.map((book) => unifiedBookCard(book, format)).join('') : `<div class="empty-library"><h2>No online results</h2><p>${format === 'best' ? 'Try another title, author, or source.' : `No matching ${format === 'text' ? 'plain-text' : format.toUpperCase()} edition was found. Try Best available or another source.`}</p></div>`;
      bindUnifiedLibraryActions(results);
      bindListPresentationControls({
        key:'all-libraries',
        root:results,
        itemSelector:'.unified-book-card',
        defaultView:'tiles'
      });
    } catch (error) {
      status.className = 'status error';
      status.textContent = error.message;
      results.innerHTML = '<div class="empty-library"><h2>Search unavailable</h2><p>One or more libraries may be temporarily unavailable.</p></div>';
    }
  };

  const search = async () => {
    const q = app.querySelector('#unified-library-query').value.trim();
    const selectedScope = app.querySelector('#unified-browse-scope').value;
    const source = app.querySelector('#unified-library-provider').value;
    const format = app.querySelector('#unified-library-format').value;

    localStorage.setItem('markSetGoPendingLibrarySearch', q);
    localStorage.setItem('markSetGoPendingBrowseScope', selectedScope);

    if (!q) {
      localResults.innerHTML = '';
      status.textContent = 'Enter a title, author, subject, or idea.';
      results.innerHTML = '';
      return;
    }

    renderLocal(q, selectedScope);

    const shouldSearchOnline = ['all','free','online'].includes(selectedScope);
    onlineSection.hidden = !shouldSearchOnline;
    app.querySelector('#unified-library-provider').disabled = !shouldSearchOnline;
    app.querySelector('#unified-library-format').disabled = !shouldSearchOnline;

    if (shouldSearchOnline) await searchOnline(q, source, format);
  };

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    search();
  });

  app.querySelector('#unified-browse-scope')?.addEventListener('change', () => {
    if (app.querySelector('#unified-library-query').value.trim()) search();
  });

  app.querySelectorAll('[data-provider-filter]').forEach((button) => button.addEventListener('click', () => {
    app.querySelector('#unified-library-provider').value = button.dataset.providerFilter;
    app.querySelectorAll('[data-provider-filter]').forEach((item) => item.classList.toggle('active', item === button));
    if (app.querySelector('#unified-library-query').value.trim()) search();
  }));

  if (query) search();
}

function bindUnifiedLibraryActions(container) {
  container.querySelectorAll('[data-library-read]').forEach((button) => button.addEventListener('click', async () => {
    const provider = button.dataset.libraryRead;
    const id = button.dataset.libraryId;
    const format = button.dataset.libraryFormat || 'best';
    const original = button.textContent;
    button.disabled = true; button.textContent = 'Loading…';
    try {
      if (format === 'epub' || format === 'pdf') {
        const response = await fetch(`/api/library/download?provider=${encodeURIComponent(provider)}&id=${encodeURIComponent(id)}&format=${encodeURIComponent(format)}`);
        if (!response.ok) {
          let message = `The ${format.toUpperCase()} edition could not be opened.`;
          try { message = (await response.json()).error || message; } catch {}
          throw new Error(message);
        }
        const blob = await response.blob();
        const file = new File([blob], `${provider}-${id}.${format}`, { type: format === 'epub' ? 'application/epub+zip' : 'application/pdf' });
        const parsed = format === 'epub' ? await parseEpubFile(file) : await parsePdfFile(file);
        parsed.source = { ...(parsed.source || {}), type: provider, provider, id, remoteFormat: format };
        renderReaderWithText(parsed.title, parsed.text, parsed.source);
        return;
      }
      const book = await loadApiPayload(`/api/library/read?provider=${encodeURIComponent(provider)}&id=${encodeURIComponent(id)}&format=${encodeURIComponent(format)}`);
      const fullTitle = `${book.title}${book.author ? ` — ${book.author}` : ''}`;
      const normalized = normalizeImportedBookText(book.text, { title:book.title, author:book.author });
      renderReaderWithText(fullTitle, normalized.text, { type: provider, id, sourceUrl: book.sourceUrl, remoteFormat: format === 'best' ? 'text' : format, documentToc: normalized.toc, cleanup: normalized.report });
    } catch (error) {
      window.alert(error.message);
      button.disabled = false; button.textContent = original;
    }
  }));
  container.querySelectorAll('[data-library-save]').forEach((button) => button.addEventListener('click', () => {
    try {
      const item = JSON.parse(button.dataset.librarySave);
      const list = getReadingList();
      list.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title: item.title, author: item.author, sourceUrl: item.sourceUrl, status: 'want-to-read', addedAt: new Date().toISOString() });
      saveReadingList(list);
      button.textContent = '✓ Added'; button.disabled = true;
    } catch { window.alert('This book could not be added to the reading list.'); }
  }));
}

async function renderReader(kind) {
  stopReader();

  // Backward-compatible aliases for older cached markup and early empty-reader
  // buttons. Navigation destinations must never fall through to the generic
  // "Reading unavailable" error.
  const normalizedKind = ({
    import: 'upload',
    all: 'unified-library',
    library: 'my-library'
  })[kind] || kind;

  if (normalizedKind === 'my-library') return renderMyLibraryHub();
  if (normalizedKind === 'frankenstein-demo') return loadBuiltInIllustratedDemo();
  if (normalizedKind === 'url') return renderUrlImporter();
  if (normalizedKind === 'upload') return renderUpload();
  if (normalizedKind === 'book-builder') return renderBookBuilder();
  if (normalizedKind === 'illustrated-upload') return renderIllustratedUpload();
  if (normalizedKind === 'unified-library') return renderUnifiedLibrary();
  if (normalizedKind === 'gutenberg') return renderGutenbergLibrary();
  if (normalizedKind === 'great-books') return renderGreatBooksLibrary();
  if (normalizedKind === 'syntopicon') return renderSyntopicon();
  if (normalizedKind === 'bible') return renderBibleStudy();
  if (normalizedKind === 'current-reading') return renderCurrentReading();
  if (normalizedKind === 'weather') return renderWeather();

  app.innerHTML = `<section class="panel"><h1>Loading…</h1><p class="status">Preparing your text.</p></section>`;
  try {
    let title;
    let text;
    if (sources[normalizedKind]) {
      ({ title, text } = await loadLocalText(normalizedKind));
    } else if (normalizedKind === 'news') {
      title = "Today's News";
      text = await loadApiText('/api/news');
    } else {
      throw new Error('Unknown reading selection.');
    }
    renderReaderWithText(title, text, { type: sources[normalizedKind] ? 'built-in' : normalizedKind, key: normalizedKind });
  } catch (error) {
    renderError('Reading unavailable', error.message);
  }
}


const MARK_INSIGHTS_KEY = 'markSetGoMarkInsightsV1';
const MARK_HISTORY_KEY = 'markSetGoMarkHistoryV1';

function getMarkRecords(key) {
  try { const value=JSON.parse(localStorage.getItem(key)||'[]'); return Array.isArray(value)?value:[]; }
  catch { return []; }
}
function saveMarkRecords(key, records) {
  const requested=Array.isArray(records) ? records.slice(0,300) : [];
  let candidate=requested;

  while(candidate.length){
    try {
      localStorage.setItem(key,JSON.stringify(candidate));
      const verified=getMarkRecords(key);
      return verified.length>0 && verified[0]?.id===candidate[0]?.id;
    } catch(error) {
      if(error?.name!=='QuotaExceededError' && error?.name!=='NS_ERROR_DOM_QUOTA_REACHED'){
        console.warn('Notebook records could not be saved.',error);
        return false;
      }

      // Preserve the newest entry while progressively dropping old notebook
      // history if browser storage is tight. Never silently claim success.
      if(candidate.length===1){
        console.warn('Notebook storage is full; the newest entry could not be saved.',error);
        return false;
      }
      candidate=candidate.slice(0,Math.max(1,Math.floor(candidate.length*.8)));
    }
  }
  return false;
}
function markRecordsForCurrentBook(key) { return getMarkRecords(key).filter(item=>item.documentId===state.documentId); }

const MARK_NOTEBOOK_SAVE_PAYLOADS=new Map();

function registerMarkNotebookSavePayload(payload={}) {
  const id=`mark-save-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  MARK_NOTEBOOK_SAVE_PAYLOADS.set(id,payload);
  // Avoid unbounded retained response payloads during long reading sessions.
  if(MARK_NOTEBOOK_SAVE_PAYLOADS.size>40){
    const oldest=MARK_NOTEBOOK_SAVE_PAYLOADS.keys().next().value;
    MARK_NOTEBOOK_SAVE_PAYLOADS.delete(oldest);
  }
  return id;
}

function saveRegisteredMarkNotebookInsight(id) {
  const payload=MARK_NOTEBOOK_SAVE_PAYLOADS.get(String(id||''));
  if(!payload) return {ok:false,error:'This Ask Mark response is no longer available to save.'};
  const result=saveMarkInsight(payload);
  if(result?.ok) MARK_NOTEBOOK_SAVE_PAYLOADS.delete(String(id||''));
  return result;
}

window.MarkSetGoNotebook = Object.freeze({
  saveInsight:saveRegisteredMarkNotebookInsight,
  count:()=>getMarkRecords(MARK_INSIGHTS_KEY).length
});


function nearestWordIndexForSelection(selectedText) {
  const selectedWords=splitWords(String(selectedText||'')).slice(0,12).map(w=>String(w).toLowerCase().replace(/[^\p{L}\p{N}'’-]+/gu,''));
  if(!selectedWords.length) return Math.max(0,Number(state.index)||0);
  const normalize=w=>String(w||'').toLowerCase().replace(/[^\p{L}\p{N}'’-]+/gu,'');
  const center=Math.max(0,Number(state.index)||0), radius=Math.min(state.words.length,12000);
  const start=Math.max(0,center-radius), end=Math.min(state.words.length,center+radius);
  for(let i=start;i<end-selectedWords.length;i++){
    let ok=true;
    for(let j=0;j<selectedWords.length;j++){ if(normalize(state.words[i+j])!==selectedWords[j]) { ok=false; break; } }
    if(ok) return i;
  }
  return center;
}

function captureMarkSelection() {
  const reader=app.querySelector('#reader');
  const selection=window.getSelection();
  if(!reader||!selection||selection.rangeCount===0||selection.isCollapsed) return null;
  const range=selection.getRangeAt(0);
  if(!reader.contains(range.commonAncestorContainer)) return null;
  const text=selection.toString().replace(/\s+/g,' ').trim();
  if(!text) return null;
  const startElement=(range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement)?.closest?.('.reader-word[data-index], .reader-group[data-start-index]');
  let startIndex=Number(startElement?.dataset.index ?? startElement?.dataset.startIndex);
  if(!Number.isFinite(startIndex)) startIndex=nearestWordIndexForSelection(text);
  const selectedWordCount=Math.max(1,splitWords(text).length);
  const beforeStart=Math.max(0,startIndex-220), afterEnd=Math.min(state.words.length,startIndex+selectedWordCount+220);
  return {text,startIndex,endIndex:Math.min(state.words.length,startIndex+selectedWordCount),before:state.words.slice(beforeStart,startIndex).join(' '),after:state.words.slice(startIndex+selectedWordCount,afterEnd).join(' '),title:state.title,chapter:currentTocTitle?.()||'',documentId:state.documentId,createdAt:new Date().toISOString()};
}
function tocTitleForWordIndex(wordIndex = state.index) {
  const items = Array.isArray(state.toc) ? state.toc : [];
  const target = Math.max(0, Number(wordIndex) || 0);
  let current = '';
  for (const item of items) {
    if (Number(item.index) <= target) current = item.title || current;
    else break;
  }
  return current;
}
function currentTocTitle(){
  return tocTitleForWordIndex(state.index);
}
function clearPersistentMarkSelection() {
  app.querySelectorAll('#reader .ask-mark-selected').forEach((element)=>element.classList.remove('ask-mark-selected'));
}
function clearMarkSelectionForReadingResume() {
  state.markPersistentSelection=null;
  state.markSelection=null;
  state.markSelectionLocked=false;
  state.markSuppressNextReaderClick=false;
  clearPersistentMarkSelection();
  hideMarkToolbar();
  const selection=window.getSelection?.();
  if(selection && selection.rangeCount) selection.removeAllRanges();
}
function applyPersistentMarkSelectionHighlight() {
  const selectionData=state.markPersistentSelection;
  if(!selectionData) return;
  const start=Math.max(0,Number(selectionData.startIndex)||0);
  const end=Math.max(start+1,Number(selectionData.endIndex)||start+1);
  app.querySelectorAll('#reader .reader-word[data-index], #reader .reader-group[data-start-index]').forEach((element)=>{
    const elementStart=Number(element.dataset.index ?? element.dataset.startIndex);
    const explicitEnd=Number(element.dataset.endIndex);
    const elementEnd=Number.isFinite(explicitEnd) ? explicitEnd : elementStart+1;
    if(Number.isFinite(elementStart) && elementStart<end && elementEnd>start){
      element.classList.add('ask-mark-selected');
    }
  });
}
function persistMarkSelectionHighlight(selectionData) {
  if(selectionData) state.markPersistentSelection={...selectionData};
  clearPersistentMarkSelection();
  applyPersistentMarkSelectionHighlight();
}
function showMarkToolbar(selectionData, rect) {
  const bar=app.querySelector('#mark-selection-toolbar'); if(!bar) return;
  state.markSelection=selectionData;
  persistMarkSelectionHighlight(selectionData);
  bar.hidden=false;
  const width=bar.offsetWidth||540;
  bar.style.left=`${Math.max(8,Math.min(window.innerWidth-width-8,rect.left+rect.width/2-width/2))}px`;
  bar.style.top=`${Math.max(8,rect.top-52)}px`;
}
function hideMarkToolbar(){ const bar=app.querySelector('#mark-selection-toolbar'); if(bar) bar.hidden=true; }
function openMarkPanel(tab='selection'){
  const layout=app.querySelector('#reader-layout');
  const reader=app.querySelector('#reader');
  const anchorIndex=Math.max(0,Number(state.index)||0);
  const wasRunning=isReaderRunning();
  const mode=state.renderedMode||getSelectedMode();
  const groupSize=Math.max(1,Number(app.querySelector('#word-count')?.value)||1);

  if(layout) layout.classList.remove('word-panel-hidden');

  const toolsToggle=app.querySelector('#toggle-word-panel');
  const markToggle=app.querySelector('#toggle-mark-panel');

  if(toolsToggle){
    toolsToggle.setAttribute('aria-pressed',String(tab==='tools'));
    toolsToggle.classList.remove('pane-closed');
  }
  if(markToggle){
    markToggle.setAttribute('aria-pressed',String(tab!=='tools'));
    markToggle.classList.remove('pane-closed');
  }
  activateMarkTab(tab);

  /*
    Opening a side panel can change the Reader's width and pagination geometry.
    Preserve the canonical word and running state; only selecting text pauses.
  */
  if(reader){
    window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{
      state.index=Math.max(0,Math.min(state.words.length-1,anchorIndex));
      if(state.bookPages){
        scheduleBookPageReflow({delay:0,anchorIndex});
      }else{
        restoreReadingAnchor(reader,mode,groupSize,anchorIndex);
      }
      if(wasRunning&&!isReaderRunning()) startReader();
      persistReaderSession({immediate:true});
    }));
  }
}
function activateMarkTab(tab){
  app.querySelectorAll('[data-mark-tab]').forEach(b=>b.classList.toggle('active',b.dataset.markTab===tab));
  app.querySelectorAll('[data-mark-panel]').forEach(p=>p.hidden=p.dataset.markPanel!==tab);
  if(tab==='history') renderMarkHistory();
  if(tab==='notebook') renderMarkNotebook();
}
function notifyAskMarkLegacyUpdated(kind='selection'){
  document.dispatchEvent(new CustomEvent('marksetgo:askmark-legacy-updated',{detail:{kind}}));
}
function renderMarkSelectionCard(){
  const panel=app.querySelector('#mark-selection-panel'); if(!panel) return;
  const selected=state.markSelection;
  if(!selected){ panel.innerHTML='<div class="mark-empty"><strong>Hi, I’m Ask Mark.</strong><p>Highlight any passage—or use the paragraph shortcut—and I’ll help you understand it without moving your reading position.</p></div>'; notifyAskMarkLegacyUpdated('selection'); return; }
  panel.innerHTML=`<div class="mark-selection-card"><span>Current selection · ${splitWords(selected.text).length} words</span><blockquote>${escapeHtml(selected.text.slice(0,1300))}${selected.text.length>1300?'…':''}</blockquote></div>
  <div class="mark-action-grid">${[['explain','💡','Explain'],['summarize','≡','Summarize'],['analyze','🧠','Analyze'],['simplify','A','Simplify'],['context','🏛','Context'],['related','🔗','Related ideas'],['translate','🌍','Translate'],['save','★','Save insight']].map(([id,icon,label])=>`<button type="button" data-mark-action="${id}"><span>${icon}</span>${label}</button>`).join('')}</div>
  <form id="mark-question-form" class="mark-question-form"><label for="mark-question">Ask Mark about this passage</label><div><input id="mark-question" type="text" maxlength="1200" placeholder="What does this mean here?"><button class="primary" type="submit">Ask</button></div></form>
  <div id="mark-response" class="mark-response" hidden></div>`;
  bindMarkPanelActions();
  notifyAskMarkLegacyUpdated('selection');
}
function renderMarkResult(result, action){
  const selected=state.markSelection ? {...state.markSelection} : null;
  const savePayload={
    action,
    result,
    selection:selected?.text || '',
    documentId:selected?.documentId || state.documentId || '',
    title:selected?.title || state.title || '',
    startIndex:Number(selected?.startIndex)||0,
    chapter:selected?.chapter || ''
  };
  const saveId=registerMarkNotebookSavePayload(savePayload);

  const panels=[app.querySelector('#mark-response'),fullscreenMarkResultContainer()].filter(Boolean);
  if(!panels.length)return;

  panels.forEach(panel=>{
    panel.hidden=false;
    panel.innerHTML=`<div class="mark-response-heading"><span>${escapeHtml(currentCompanionIdentity().ask)}</span><strong>${escapeHtml(result.heading||action)}</strong></div><p>${escapeHtml(result.response||'')}</p>${result.keyPoints?.length?`<ul>${result.keyPoints.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`:''}${result.cautions?.length?`<div class="mark-cautions">${result.cautions.map(x=>`<p>${escapeHtml(x)}</p>`).join('')}</div>`:''}<button type="button" class="secondary" data-save-mark-response data-mark-save-id="${escapeHtml(saveId)}">Save to notebook</button>`;

    panel.querySelector('[data-save-mark-response]')?.addEventListener('click',(event)=>{
      const button=event.currentTarget;
      const saved=saveRegisteredMarkNotebookInsight(button.dataset.markSaveId);
      if(saved?.ok){
        button.disabled=true;
        button.textContent='Saved to notebook';
      }else{
        button.textContent='Save failed — try again';
        window.setTimeout(()=>{ if(!button.disabled) button.textContent='Save to notebook'; },2200);
      }
    });
  });
  notifyAskMarkLegacyUpdated('response');
}
function saveMarkInsight(extra={}){
  const selected=state.markSelection;
  const selectionText=String(extra.selection || selected?.text || '').trim();
  const noteText=String(extra.note || '').trim();
  if(!selectionText && !noteText && !extra.result?.response){
    return {ok:false,error:'There is nothing to save.'};
  }

  const record={
    id:`mark-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    recordType:extra.recordType || (extra.result ? 'mark-response' : noteText ? 'personal-note' : 'passage'),
    documentId:extra.documentId || selected?.documentId || state.documentId || '',
    title:extra.title || selected?.title || state.title || app.querySelector('h1')?.textContent?.trim() || 'Mark, Set, Go!',
    selection:selectionText,
    startIndex:Number.isFinite(Number(extra.startIndex))
      ? Number(extra.startIndex)
      : (Number.isFinite(Number(selected?.startIndex)) ? Number(selected.startIndex) : 0),
    chapter:extra.chapter || selected?.chapter || '',
    note:noteText,
    pageContext:extra.pageContext || app.dataset.viewKey || 'app',
    createdAt:new Date().toISOString(),
    ...extra
  };

  const saved=saveMarkRecords(MARK_INSIGHTS_KEY,[record,...getMarkRecords(MARK_INSIGHTS_KEY)]);
  if(!saved){
    updateReaderStatus?.('Notebook save failed. Browser storage may be full.');
    return {ok:false,error:'Notebook save failed. Browser storage may be full.'};
  }

  const verified=getMarkRecords(MARK_INSIGHTS_KEY).some((item)=>item.id===record.id);
  if(!verified){
    updateReaderStatus?.('Notebook save could not be verified.');
    return {ok:false,error:'Notebook save could not be verified.'};
  }

  renderMarkNotebook();
  renderFullscreenMarkNotebook();
  renderGlobalNotebookEntries();
  document.dispatchEvent(new CustomEvent('marksetgo:notebook-saved',{detail:{record}}));
  updateReaderStatus?.('Saved to Mark’s notebook.');
  return {ok:true,record};
}
function openComparisonWorkspace(){
  const selected=state.markSelection;
  if(!selected?.text) return;
  const payload={
    id:`comparison-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    createdAt:new Date().toISOString(),
    primary:{
      documentId:selected.documentId||state.documentId||'',
      title:selected.title||state.title||'Current text',
      author:state.source?.author||'',
      passage:selected.text,
      startIndex:Number(selected.startIndex)||0,
      endIndex:Number(selected.endIndex)||Number(selected.startIndex)||0,
      chapter:selected.chapter||'',
      source:state.source||null
    },
    comparisonTexts:[],
    mode:'syntopicon',
    notes:''
  };
  try{localStorage.setItem('markSetGoComparisonDraftV1',JSON.stringify(payload));}catch{}
  const opened=window.open('/comparison-workspace.html','_blank');
  if(!opened){
    window.location.href='/comparison-workspace.html';
  }
  hideMarkToolbar();
}

async function runMarkAction(action,question=''){
  const selected=state.markSelection; if(!selected) return;
  if(action==='save'){saveMarkInsight({action:'selection'});return;}
  if(action==='related'){openComparisonWorkspace();return;}
  if(action==='define' && splitWords(selected.text).length===1){ state.contextWord={word:selected.text,index:selected.startIndex,element:app.querySelector(`.reader-word[data-index="${selected.startIndex}"]`)}; openWordPanelForDictionary(); activateMarkTab('tools'); performDictionaryLookup(false, 'mark'); return; }
  const responsePanels=[app.querySelector('#mark-response'),fullscreenMarkResultContainer()].filter(Boolean);responsePanels.forEach(p=>{p.hidden=false;p.innerHTML='<p class="status">I’m reading this…</p>';});
  notifyAskMarkLegacyUpdated('response');
  try{
    const targetLanguage=action==='translate'?(window.prompt('Translate into which language?','Spanish')||'').trim():''; if(action==='translate'&&!targetLanguage)return;
    const response=await fetch('/api/mark-selection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...selected,selection:selected.text,action,question,targetLanguage})});
    const payload=await response.json().catch(()=>({})); if(!response.ok) throw new Error(payload.error||payload.detail||`HTTP ${response.status}`);
    const record={id:`history-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,documentId:state.documentId,title:state.title,selection:selected.text,startIndex:selected.startIndex,chapter:selected.chapter,action,question,result:payload.result,createdAt:new Date().toISOString()};
    saveMarkRecords(MARK_HISTORY_KEY,[record,...getMarkRecords(MARK_HISTORY_KEY)]); renderMarkResult(payload.result,action);
  } catch(error){responsePanels.forEach(p=>{p.innerHTML=`<p class="status error">${escapeHtml(error.message)}</p>`;});notifyAskMarkLegacyUpdated('response');}
}
function bindMarkPanelActions(){
  app.querySelectorAll('[data-mark-action]').forEach(button=>button.addEventListener('click',()=>runMarkAction(button.dataset.markAction)));
  app.querySelector('#mark-question-form')?.addEventListener('submit',e=>{e.preventDefault();const q=app.querySelector('#mark-question')?.value.trim();if(q)runMarkAction('ask',q);});
}
function notebookRecordFullText(item) {
  const parts = [item.title || 'Untitled'];
  if (item.chapter) parts.push(`Chapter/section: ${item.chapter}`);
  parts.push(`Saved: ${new Date(item.createdAt || Date.now()).toLocaleString()}`);
  if (item.selection) parts.push(`\nRelevant passage:\n${item.selection}`);
  if (item.note) parts.push(`\nMy note:\n${item.note}`);
  if (item.question) parts.push(`\nQuestion for Ask Mark:\n${item.question}`);
  if (item.result?.heading) parts.push(`\nAsk Mark — ${item.result.heading}`);
  if (item.result?.response) parts.push(item.result.response);
  if (item.result?.keyPoints?.length) parts.push(`\nKey points:\n${item.result.keyPoints.map(x=>`- ${x}`).join('\n')}`);
  if (item.result?.cautions?.length) parts.push(`\nNotes and cautions:\n${item.result.cautions.map(x=>`- ${x}`).join('\n')}`);
  return parts.join('\n');
}

function downloadTextFile(filename, text) {
  const blob=new Blob([String(text||'')],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=filename;
  document.body.append(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function safeNotebookFilename(value) {
  return String(value||'mark-notebook').replace(/[<>:"/\\|?*\u0000-\u001f]+/g,'-').replace(/\s+/g,' ').trim().slice(0,90)||'mark-notebook';
}

function exportNotebookRecords(records,label='Mark Notebook') {
  if(!records?.length)return window.alert('There are no notebook entries to export.');
  const header=`${label}\nExported ${new Date().toLocaleString()}\n${'='.repeat(72)}\n`;
  const body=[...records].reverse().map((item,index)=>`\nENTRY ${index+1}\n${'-'.repeat(72)}\n${notebookRecordFullText(item)}`).join('\n');
  downloadTextFile(`${safeNotebookFilename(label)}.txt`,`${header}${body}\n`);
}

async function emailNotebookRecords(records,label='Mark Notebook') {
  if(!records?.length) return window.alert('There are no notebook entries to email.');
  const prefs=readEmailPreferences();
  if(!prefs.email) return window.alert('Add and save your email address in Action Center first.');
  if(!prefs.notes) return window.alert('Enable “Email my saved notes and reading digest” in Action Center first.');
  const notes=records.map((item)=>({
    id:item.id,
    title:item.title||'Notebook entry',
    body:notebookRecordFullText(item),
    context:item.chapter||item.pageContext||label,
    type:item.recordType||'notebook-entry',
    updatedAt:item.updatedAt||item.createdAt
  })).filter((item)=>String(item.body||'').trim());
  if(!notes.length) return window.alert('There are no notebook contents to email.');
  try {
    const result=await emailApi('/api/email/send-notes',{clientId:emailClientId(),notes});
    window.alert(`${result.count} notebook ${result.count===1?'entry was':'entries were'} emailed to ${prefs.email}.`);
  } catch(error) {
    window.alert(error.message);
  }
}

function notebookEntryMarkup(item) {
  const response=item.result?.response||'';
  return `<article class="mark-record expanded-notebook-record">
    <header class="notebook-record-header">
      <div><strong>${escapeHtml(item.title||'Untitled')}</strong><small>${escapeHtml(item.chapter||item.pageContext||'Notebook entry')} · ${escapeHtml(new Date(item.createdAt||Date.now()).toLocaleString())}</small></div>
      <span>${item.result?'Ask Mark insight':item.recordType==='personal-note'?'Personal note':'Passage'}</span>
    </header>
    ${item.selection?`<section class="notebook-passage"><h4>Relevant passage</h4><blockquote>${escapeHtml(item.selection)}</blockquote></section>`:''}
    ${item.note?`<section class="notebook-personal-note"><h4>My note</h4><p>${escapeHtml(item.note)}</p></section>`:''}
    ${item.question?`<section><h4>Question</h4><p>${escapeHtml(item.question)}</p></section>`:''}
    ${response?`<section class="notebook-mark-response"><h4>${escapeHtml(item.result?.heading||'Ask Mark’s response')}</h4><p>${escapeHtml(response)}</p></section>`:''}
    ${item.result?.keyPoints?.length?`<section><h4>Key points</h4><ul>${item.result.keyPoints.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></section>`:''}
    ${item.result?.cautions?.length?`<section><h4>Notes and cautions</h4><ul>${item.result.cautions.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></section>`:''}
    <details class="notebook-plain-text"><summary>View as plain text</summary><pre>${escapeHtml(notebookRecordFullText(item))}</pre></details>
    <div class="notebook-record-actions">
      ${item.documentId?`<button type="button" data-mark-jump="${Number(item.startIndex)||0}">Return to passage</button>`:''}
      <button type="button" data-export-notebook-record="${escapeHtml(item.id)}">Save as text</button>
      <button type="button" data-edit-notebook-note="${escapeHtml(item.id)}">Add/Edit my note</button>
      <button type="button" data-mark-delete="${escapeHtml(item.id)}">Delete</button>
    </div>
  </article>`;
}

function bindExpandedNotebookButtons(panel,records,key=MARK_INSIGHTS_KEY) {
  bindMarkRecordButtons(panel,key);
  panel.querySelectorAll('[data-export-notebook-record]').forEach(button=>button.addEventListener('click',()=>{
    const item=records.find(x=>x.id===button.dataset.exportNotebookRecord);
    if(item)exportNotebookRecords([item],`${item.title||'Book'} - Notebook Entry`);
  }));
  panel.querySelectorAll('[data-edit-notebook-note]').forEach(button=>button.addEventListener('click',()=>{
    const current=getMarkRecords(MARK_INSIGHTS_KEY);
    const item=current.find(x=>x.id===button.dataset.editNotebookNote);
    if(!item)return;
    const note=window.prompt('Add or edit your personal note:',item.note||'');
    if(note===null)return;
    saveMarkRecords(MARK_INSIGHTS_KEY,current.map(x=>x.id===item.id?{...x,note:note.trim(),updatedAt:new Date().toISOString()}:x));
    renderMarkNotebook();renderFullscreenMarkNotebook();renderGlobalNotebookEntries();
  }));
}

function renderNotebookCollection(panel,records,{title='Ask Mark Notebook',includeExport=true}={}) {
  if(!panel)return;
  panel.innerHTML=`<div class="mark-list-heading notebook-list-heading">
    <div><strong>${escapeHtml(title)}</strong><small>${records.length} saved ${records.length===1?'entry':'entries'}</small></div>
    <div class="notebook-heading-actions">
      <button type="button" data-email-notebook-all>Email notes</button>
      ${includeExport?'<button type="button" data-export-notebook-all>Save as text</button>':''}
    </div>
  </div>
  ${records.length?records.map(notebookEntryMarkup).join(''):'<p class="mark-empty-note">Capture a passage, a response from Ask Mark, or one of your own thoughts to begin the notebook.</p>'}`;
  panel.querySelector('[data-email-notebook-all]')?.addEventListener('click',()=>emailNotebookRecords(records,title));
  panel.querySelector('[data-export-notebook-all]')?.addEventListener('click',()=>exportNotebookRecords(records,title));
  bindExpandedNotebookButtons(panel,records);
}

function renderMarkNotebook(){
  const panel=app.querySelector('#mark-notebook-panel');
  if(!panel)return;
  renderNotebookCollection(panel,markRecordsForCurrentBook(MARK_INSIGHTS_KEY),{title:`${state.title||'Current Book'} Notebook`});
}
function renderMarkHistory(){
  const panel=app.querySelector('#mark-history-panel'); if(!panel)return; const items=markRecordsForCurrentBook(MARK_HISTORY_KEY);
  panel.innerHTML=`<div class="mark-list-heading"><strong>Conversation History</strong><small>${items.length} requests</small></div>${items.length?items.map(item=>`<article class="mark-record"><span>${escapeHtml(item.action)}${item.question?` · ${escapeHtml(item.question)}`:''}</span><blockquote>${escapeHtml(item.selection.slice(0,280))}${item.selection.length>280?'…':''}</blockquote><p>${escapeHtml(item.result?.response?.slice(0,500)||'')}</p><div><button type="button" data-mark-jump="${item.startIndex}">Return to passage</button></div></article>`).join(''):'<p class="mark-empty-note">Your requests to Ask Mark for this book will appear here.</p>'}`; bindMarkRecordButtons(panel,MARK_HISTORY_KEY);
}
function bindMarkRecordButtons(panel,key){
  panel.querySelectorAll('[data-mark-jump]').forEach(b=>b.addEventListener('click',()=>{const index=Number(b.dataset.markJump)||0;state.index=index;const reader=app.querySelector('#reader');const mode=state.renderedMode||getSelectedMode();const count=Math.max(1,Number(app.querySelector('#word-count')?.value)||1);restoreReadingAnchor(reader,mode,count,index);updateReaderStatus();}));
  panel.querySelectorAll('[data-mark-delete]').forEach(b=>b.addEventListener('click',()=>{saveMarkRecords(key,getMarkRecords(key).filter(x=>x.id!==b.dataset.markDelete));key===MARK_INSIGHTS_KEY?renderMarkNotebook():renderMarkHistory();}));
}
function selectReaderParagraphFromEvent(event){
  const reader=app.querySelector('#reader'); if(!reader)return;
  let node=event.target.closest?.('p, .reader-paragraph, .reading-paragraph, .reader-group');
  if(!node) return;
  const range=document.createRange();
  range.selectNodeContents(node);
  const sel=window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const data=captureMarkSelection();
  if(data){
    if(isReaderRunning()){
      stopReader();
      const start=app.querySelector('#start-reader');
      const pause=app.querySelector('#pause-reader');
      if(start){start.disabled=false;start.textContent=state.index?'Resume':'Start';}
      if(pause) pause.disabled=true;
      persistReaderSession({immediate:true});
      updateReaderStatus('Paused for selected passage.');
    }
    showMarkToolbar(data,range.getBoundingClientRect());
    renderMarkSelectionCard();
    openMarkPanel('selection');
  }
}
function bindMarkCompanion(reader){
  const toolbar=app.querySelector('#mark-selection-toolbar');
  if(!reader||!toolbar)return;

  const freshInteraction=()=>({
    active:false,
    selecting:false,
    moved:false,
    paused:false,
    wasRunning:false,
    startX:0,
    startY:0,
    pointerId:null,
    finalized:false,
    downWordIndex:null,
    downWasText:false
  });

  state.markSelectionInteraction=freshInteraction();
  state.markSelectionLocked=false;
  state.markSuppressNextReaderClick=false;
  state.markResumeOnNextReaderClick=null;
  state.markSelectionWasRunning=false;

  state.markHighlightObserver?.disconnect?.();
  state.markHighlightObserver=new MutationObserver(()=>{
    if(state.markPersistentSelection) requestAnimationFrame(applyPersistentMarkSelectionHighlight);
  });
  state.markHighlightObserver.observe(reader,{childList:true,subtree:true});

  const pauseForSelection=(interaction)=>{
    if(!interaction || interaction.paused) return;
    interaction.paused=true;
    interaction.selecting=true;
    interaction.moved=true;
    state.markSelectionWasRunning=Boolean(interaction.wasRunning);

    // This flag is set before pointerup/click. The previous implementation set
    // it inside a timeout after pointerup, which allowed the reader's normal
    // click handler to restart playback before the selected passage was locked.
    state.markSuppressNextReaderClick=true;

    if(isReaderRunning()) pauseReader();
    persistReaderSession({immediate:true});
    updateReaderStatus('Paused while selecting a passage.');
  };

  const lockCapturedSelection=()=>{
    const interaction=state.markSelectionInteraction||freshInteraction();
    if(interaction.finalized) return true;

    const data=captureMarkSelection();
    if(!data) return false;

    interaction.finalized=true;
    interaction.active=false;
    pauseForSelection(interaction);
    state.markSelectionLocked=true;
    persistReaderSession({immediate:true});
    updateReaderStatus('Paused for selected passage. Click elsewhere in the text to continue.');

    const selection=window.getSelection?.();
    const range=selection?.rangeCount?selection.getRangeAt(0):null;
    showMarkToolbar(data,range?.getBoundingClientRect?.()||reader.getBoundingClientRect());
    renderMarkSelectionCard();
    if(!app.querySelector('#fullscreen-mark-drawer')?.hidden)renderFullscreenMarkSelection();
    return true;
  };

  const finalizeSelection=()=>{
    const interaction=state.markSelectionInteraction||freshInteraction();
    if(!interaction.active && !interaction.selecting) return;
    interaction.active=false;

    if(!interaction.selecting && !interaction.moved){
      // A true click remains a normal seek/toggle click. It never pauses first.
      return;
    }

    pauseForSelection(interaction);

    // Selection ranges are usually complete by pointerup. Retry for one frame
    // because Chromium can publish the final range immediately after pointerup,
    // especially when the drag crosses several inline word spans.
    queueMicrotask(()=>{
      if(lockCapturedSelection()) return;
      requestAnimationFrame(()=>{
        if(lockCapturedSelection()) return;

        // The gesture looked like a selection but produced no range. Release
        // the lock and restore the exact prior running state rather than leaving
        // the reader unpredictably paused.
        state.markSuppressNextReaderClick=false;
        interaction.selecting=false;
        interaction.moved=false;
        if(interaction.wasRunning && !isReaderRunning()) startReader();
      });
    });
  };

  const selectionBelongsToReader=()=>{
    const selection=window.getSelection?.();
    if(!selection || selection.rangeCount===0 || selection.isCollapsed) return false;
    const range=selection.getRangeAt(0);
    return reader.contains(range.commonAncestorContainer)
      || reader.contains(range.startContainer)
      || reader.contains(range.endContainer);
  };

  const resumeAfterLockedSelectionClick=(event)=>{
    const pending=state.markResumeOnNextReaderClick;
    const wasRunningBeforeSelection=Boolean(pending?.shouldResume);
    state.markResumeOnNextReaderClick=null;

    event.preventDefault();
    event.stopImmediatePropagation();

    const clickedWord=event.target.closest?.('.reader-word[data-index]');
    const clickedGroup=event.target.closest?.('.reader-group[data-start-index]');
    const mode=getSelectedMode();
    const seekableModes=new Set(['highlight','bold-focus','smooth-glide','pointing-guide','marquee','auto-scroll']);

    // The click that clears an Ask Mark selection must still perform the user's
    // requested reader action. Previously a paused-before-selection state
    // returned here and swallowed this first click.
    if((clickedWord || clickedGroup) && seekableModes.has(mode)){
      const clickedIndex=Number(clickedWord?.dataset.index ?? clickedGroup?.dataset.startIndex);
      if(Number.isFinite(clickedIndex)){
        const group=findReadingGroup(clickedIndex);
        stopReader();
        state.index=group?.start ?? clickedIndex;
        state.viewportAnchorIndex=state.index;
        persistReaderSession({immediate:true});
        updateReaderStatus(`Reading position moved to word ${(state.index+1).toLocaleString()}.`);

        if(wasRunningBeforeSelection){
          startReader();
        }else{
          // Honor the seek immediately but preserve the paused state.
          pauseReader();
          persistReaderSession({immediate:true});
        }
        return;
      }
    }

    // A blank-space click follows the normal reader toggle contract. The
    // selection itself temporarily paused playback, so the clearing click
    // resumes/starts immediately regardless of the pre-selection state.
    if(mode!=='two-column' && !isReaderRunning()){
      startReader();
      persistReaderSession();
    }
  };

  reader.addEventListener('pointerdown',(event)=>{
    if(event.button!==undefined && event.button!==0) return;
    if(event.target.closest('button, a, input, textarea, select, summary, [contenteditable="true"]')) return;

    // The first ordinary click in the reader after using Ask Mark removes the
    // temporary highlight. Playback resumes only if it had been running before
    // the selection began; the click itself is handled in the capture listener.
    if(state.markSelectionLocked){
      const shouldResume=Boolean(state.markSelectionWasRunning);
      clearMarkSelectionForReadingResume();
      state.markSelectionWasRunning=false;
      state.markResumeOnNextReaderClick={shouldResume};
      state.markSelectionInteraction=freshInteraction();
      updateReaderStatus('Selection cleared.');
      return;
    }

    // A prior DOM range can survive a normal click while the reader is repainting.
    // Clear that stale browser range before tracking this new gesture. A genuine
    // drag selection will create a fresh non-collapsed range as the pointer moves.
    const existingSelection=window.getSelection?.();
    if(existingSelection && !existingSelection.isCollapsed && existingSelection.rangeCount){
      const existingRange=existingSelection.getRangeAt(0);
      if(reader.contains(existingRange.commonAncestorContainer)
          || reader.contains(existingRange.startContainer)
          || reader.contains(existingRange.endContainer)){
        existingSelection.removeAllRanges();
      }
    }

    const interaction=freshInteraction();
    interaction.active=true;
    interaction.wasRunning=isReaderRunning();
    interaction.startX=Number(event.clientX)||0;
    interaction.startY=Number(event.clientY)||0;
    interaction.pointerId=event.pointerId ?? null;

    const downWord=event.target.closest?.('.reader-word[data-index]');
    const downGroup=event.target.closest?.('.reader-group[data-start-index]');
    const downIndex=Number(downWord?.dataset.index ?? downGroup?.dataset.startIndex);
    interaction.downWordIndex=Number.isFinite(downIndex) ? downIndex : null;
    interaction.downWasText=Boolean(downWord || downGroup);

    state.markSelectionInteraction=interaction;
  },true);

  // Do not pause on selectstart alone. Browsers may fire selectstart during an
  // ordinary click before any real range exists, which would make a normal
  // click-to-seek look as though the reader had already been paused. Actual
  // non-collapsed selections are handled by pointermove/selectionchange below.

  reader.addEventListener('pointermove',(event)=>{
    const interaction=state.markSelectionInteraction;
    if(!interaction?.active) return;
    if(interaction.pointerId!==null && event.pointerId!==undefined && event.pointerId!==interaction.pointerId) return;

    const dx=(Number(event.clientX)||0)-interaction.startX;
    const dy=(Number(event.clientY)||0)-interaction.startY;
    const distance=Math.hypot(dx,dy);

    // Selection owns the gesture only after meaningful pointer movement.
    // This prevents transient/stale browser ranges during active reader repaint
    // from turning an ordinary word click into a suppressed "selection" click.
    if(distance>=4) interaction.moved=true;
    if(interaction.moved && selectionBelongsToReader()) pauseForSelection(interaction);
  },true);

  // selectionchange covers keyboard selection and touch implementations where
  // pointermove/selectstart delivery can vary.
  if(state.markSelectionChangeHandler){
    document.removeEventListener('selectionchange',state.markSelectionChangeHandler);
  }
  state.markSelectionChangeHandler=()=>{
    const interaction=state.markSelectionInteraction;
    if(!interaction?.active || !interaction.moved || !selectionBelongsToReader()) return;
    pauseForSelection(interaction);
  };
  document.addEventListener('selectionchange',state.markSelectionChangeHandler);

  const performStableReaderPointerAction=(interaction)=>{
    const mode=getSelectedMode();
    if(mode==='two-column') return;

    const seekableModes=new Set(['highlight','bold-focus','smooth-glide','pointing-guide','marquee','auto-scroll']);
    const clickedIndex=Number(interaction?.downWordIndex);

    if(interaction?.downWasText && Number.isFinite(clickedIndex) && seekableModes.has(mode)){
      const wasRunning=isReaderRunning();
      const group=findReadingGroup(clickedIndex);
      stopReader();
      state.index=group?.start ?? clickedIndex;
      state.viewportAnchorIndex=state.index;
      persistReaderSession({immediate:true});
      updateReaderStatus(`Reading position moved to word ${(state.index+1).toLocaleString()}.`);
      startReader();
      if(!wasRunning) window.setTimeout(pauseReader,0);
      return;
    }

    if(isReaderRunning()) pauseReader();
    else startReader();
    persistReaderSession();
  };

  reader.addEventListener('pointerup',(event)=>{
    const interaction=state.markSelectionInteraction;

    // A true click is resolved here, using the stable target captured at
    // pointerdown. This avoids losing the action when the running reader repaints
    // or replaces the clicked word before the browser dispatches `click`.
    if(interaction?.active && !interaction.selecting && !interaction.moved){
      interaction.active=false;
      performStableReaderPointerAction(interaction);

      state.readerSuppressSyntheticClick=true;
      window.setTimeout(()=>{
        state.readerSuppressSyntheticClick=false;
      },0);
      return;
    }

    finalizeSelection();
  },true);
  reader.addEventListener('pointercancel',()=>{
    const interaction=state.markSelectionInteraction;
    if(!interaction) return;
    interaction.active=false;
    if(interaction.paused && !state.markSelectionLocked && interaction.wasRunning && !isReaderRunning()){
      state.markSuppressNextReaderClick=false;
      startReader();
    }
  },true);
  reader.addEventListener('keyup',()=>{
    if(selectionBelongsToReader()){
      const interaction=state.markSelectionInteraction||freshInteraction();
      interaction.active=true;
      interaction.wasRunning=interaction.wasRunning||isReaderRunning();
      state.markSelectionInteraction=interaction;
      pauseForSelection(interaction);
      finalizeSelection();
    }
  });

  // This capture listener runs before the reader's normal click handler.
  reader.addEventListener('click',(event)=>{
    if(state.markResumeOnNextReaderClick!==null){
      resumeAfterLockedSelectionClick(event);
      return;
    }
    if(!state.markSuppressNextReaderClick) return;

    const interaction=state.markSelectionInteraction;
    const hasRealSelection=state.markSelectionLocked
      || Boolean(interaction?.finalized)
      || selectionBelongsToReader();

    state.markSuppressNextReaderClick=false;
    if(!hasRealSelection) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  },true);

  reader.addEventListener('dblclick',event=>{if(event.altKey)selectReaderParagraphFromEvent(event);});
  toolbar.addEventListener('mousedown',e=>e.preventDefault());
  toolbar.querySelectorAll('[data-mark-toolbar-action]').forEach(b=>b.addEventListener('click',()=>{
    openMarkPanel('selection');
    renderMarkSelectionCard();
    if(b.dataset.markToolbarAction==='ask'){
      hideMarkToolbar();
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        applyPersistentMarkSelectionHighlight();
        const input=document.querySelector('[data-askmark-input]');
        input?.focus();
        applyPersistentMarkSelectionHighlight();
      }));
      return;
    }
    runMarkAction(b.dataset.markToolbarAction);
  }));
  toolbar.querySelector('[data-mark-more]')?.addEventListener('click',()=>{openMarkPanel('selection');renderMarkSelectionCard();});
  app.querySelector('#toggle-mark-panel')?.addEventListener('click',()=>{
    const layout=app.querySelector('#reader-layout');
    const hidden=layout?.classList.contains('word-panel-hidden');
    const markActive=app.querySelector('[data-mark-tab="selection"]')?.classList.contains('active');

    if(!hidden && markActive){
      const reader=app.querySelector('#reader');
      const anchorIndex=Math.max(0,Number(state.index)||0);
      const mode=state.renderedMode||getSelectedMode();
      const groupSize=Math.max(1,Number(app.querySelector('#word-count')?.value)||1);
      const wasRunning=isReaderRunning();

      layout.classList.add('word-panel-hidden');
      const markButton=app.querySelector('#toggle-mark-panel');
      const toolsButton=app.querySelector('#toggle-word-panel');
      markButton?.setAttribute('aria-pressed','false');
      toolsButton?.setAttribute('aria-pressed','false');
      markButton?.classList.add('pane-closed');
      toolsButton?.classList.add('pane-closed');

      if(reader){
        window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{
          state.index=Math.max(0,Math.min(state.words.length-1,anchorIndex));
          if(state.bookPages) scheduleBookPageReflow({delay:0,anchorIndex});
          else restoreReadingAnchor(reader,mode,groupSize,anchorIndex);
          if(wasRunning&&!isReaderRunning()) startReader();
          persistReaderSession({immediate:true});
        }));
      }
    } else {
      openMarkPanel('selection');
      renderMarkSelectionCard();
    }
  });
  app.querySelectorAll('[data-mark-tab]').forEach(b=>b.addEventListener('click',()=>activateMarkTab(b.dataset.markTab)));
  document.addEventListener('mousedown',event=>{if(!event.target.closest('#mark-selection-toolbar')&&!event.target.closest('#word-panel')&&!reader.contains(event.target))hideMarkToolbar();});
  renderMarkSelectionCard();
}


function modernGuideInteractionConfig(source = state?.source || {}) {
  if (source?.type !== 'modern-guide') return null;
  return MODERN_GUIDE_INTERACTIONS?.[source.id] || source?.guideInteractions || null;
}

function modernGuideActionToken(word) {
  const match = String(word || '').match(/^\[\[MSG:(SECTION|DISCUSS|QUIZ|ACTION|IDEAS|BUY)\]\]$/);
  return match ? match[1].toLowerCase() : '';
}

function isModernGuideActionToken(word) {
  return Boolean(modernGuideActionToken(word));
}

function modernGuideActionLabel(action) {
  return ({
    section: '',
    discuss: 'Discuss with Mark',
    quiz: 'Quiz me on the whole guide',
    action: 'Add to Action Center',
    ideas: 'Explore related Great Ideas',
    buy: 'Buy the original book'
  })[action] || 'Guide action';
}

function modernGuideContextRange(markerIndex) {
  const safeMarker = Math.max(0, Math.min(state.words.length, Number(markerIndex) || 0));
  let sectionMarker = -1;

  for (let index = safeMarker - 1; index >= 0; index -= 1) {
    if (modernGuideActionToken(state.words[index]) === 'section') {
      sectionMarker = index;
      break;
    }
  }

  const startIndex = sectionMarker >= 0 ? sectionMarker + 1 : 0;
  const cleanWords = [];
  let firstReal = null;
  let lastReal = null;

  for (let index = startIndex; index < safeMarker; index += 1) {
    if (isModernGuideActionToken(state.words[index])) continue;
    if (firstReal == null) firstReal = index;
    lastReal = index;
    cleanWords.push(state.words[index]);
  }

  return {
    startIndex: firstReal == null ? startIndex : firstReal,
    endIndex: lastReal == null ? safeMarker : lastReal + 1,
    text: cleanWords.join(' ').trim()
  };
}

function openModernGuideContextInAskMark(markerIndex) {
  const source = state?.source || {};
  if (source?.type !== 'modern-guide') return;

  const context = modernGuideContextRange(markerIndex);
  if (!context.text) return;

  const reader = app.querySelector('#reader');
  const wasRunning = isReaderRunning();
  if (wasRunning) pauseReader();

  // Preserve the actual guide action position as the Reader's canonical cursor,
  // but keep the Ask Mark selection as the full section range.
  const actionIndex = Math.max(0, Math.min(
    Math.max(0, state.words.length - 1),
    Number.isFinite(Number(markerIndex)) ? Number(markerIndex) : context.startIndex
  ));
  state.index = actionIndex;

  const selection = {
    text: context.text,
    startIndex: context.startIndex,
    endIndex: context.endIndex,
    documentId: state.documentId || '',
    title: state.title || source.originalTitle || 'Modern Guide',
    chapter: tocTitleForWordIndex(context.startIndex) || '',
    createdAt: new Date().toISOString(),
    origin: 'modern-guide-section'
  };

  state.markSelection = selection;
  state.markPersistentSelection = { ...selection };
  state.markSelectionLocked = true;
  state.markSuppressNextReaderClick = true;

  // Open the existing Ask Mark selection path; do not create a parallel guide chat.
  openMarkPanel('selection');
  renderMarkSelectionCard();

  requestAnimationFrame(() => requestAnimationFrame(() => {
    // The panel opening can cause a Reader repaint. Re-assert the canonical
    // selection after that repaint so the section remains highlighted.
    state.markSelection = { ...selection };
    state.markPersistentSelection = { ...selection };
    state.markSelectionLocked = true;
    persistMarkSelectionHighlight(selection);

    // Explicitly tell the premium Ask Mark shell that the guide selection is
    // ready. This avoids depending only on MutationObserver timing.
    document.dispatchEvent(new CustomEvent('marksetgo:guide-section-selected', {
      detail: {
        title: source.originalTitle || state.title || 'this guide',
        text: context.text,
        startIndex: context.startIndex,
        endIndex: context.endIndex,
        documentId: state.documentId || ''
      }
    }));

    window.MarkSetGoGuideSectionWelcome?.({
      title: source.originalTitle || state.title || 'this guide',
      text: context.text
    });

    const input = document.querySelector('[data-askmark-input]');
    input?.focus();
  }));
}

function modernGuideActionDueAt(config = {}) {
  const days = Math.max(0, Number(config.dueDays) || 0);
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(
    Number.isFinite(Number(config.dueHour)) ? Number(config.dueHour) : 19,
    Number.isFinite(Number(config.dueMinute)) ? Number(config.dueMinute) : 0,
    0,
    0
  );

  // datetime-local inputs require local calendar values, not a UTC ISO string.
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addModernGuideActionToCenter(source = state?.source || {}, trigger = null) {
  const config = modernGuideInteractionConfig(source);
  if (!config?.actionTitle) return null;

  const sourceTitle = `${source.originalTitle || state.title || 'Modern Guide'} — Mark, Set, Go! Guide`;
  const currentActions = readActions();
  const existing = currentActions.find((item) =>
    item.status !== 'completed'
    && String(item.title || '') === String(config.actionTitle)
    && String(item.sourceTitle || '') === sourceTitle
  );

  if (existing) {
    // Earlier guide builds created skeletal actions without a date. Upgrade only
    // missing scheduling fields and preserve anything the reader already edited.
    let changed = false;
    if (!existing.dueAt) {
      existing.dueAt = modernGuideActionDueAt(config);
      changed = true;
    }
    if (!existing.type) {
      existing.type = config.actionType || 'task';
      changed = true;
    }
    if (!existing.priority) {
      existing.priority = config.priority || 'normal';
      changed = true;
    }
    if (!existing.repeat) {
      existing.repeat = config.repeat || 'none';
      changed = true;
    }
    if (!existing.reminder) {
      existing.reminder = config.reminder || 'none';
      changed = true;
    }
    if (!existing.note && config.actionNote) {
      existing.note = config.actionNote;
      changed = true;
    }
    if (changed) {
      existing.updatedAt = new Date().toISOString();
      saveActionRecord(existing);
    }

    if (trigger) {
      trigger.textContent = changed ? 'Action updated in Action Center ✓' : 'Already in Action Center ✓';
      trigger.disabled = true;
      trigger.setAttribute('aria-disabled', 'true');
    }
    return existing;
  }

  const now = new Date().toISOString();
  const record = {
    id: `action_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    title: config.actionTitle,
    type: config.actionType || 'task',
    dueAt: modernGuideActionDueAt(config),
    priority: config.priority || 'normal',
    repeat: config.repeat || 'none',
    reminder: config.reminder || 'none',
    sourceTitle,
    note: config.actionNote || '',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    origin: 'modern-guide',
    sourceId: source.id || ''
  };

  const saved = saveActionRecord(record);

  if (trigger) {
    if (saved) {
      trigger.textContent = 'Added to Action Center ✓';
      trigger.disabled = true;
      trigger.setAttribute('aria-disabled', 'true');
    } else {
      trigger.textContent = 'Could not save — try again';
      trigger.disabled = false;
      trigger.removeAttribute('aria-disabled');
    }
  }

  return saved;
}

function openModernGuideGreatIdea(source = state?.source || {}) {
  const config = modernGuideInteractionConfig(source);
  const idea = config?.greatIdea || '';
  rememberReaderForReturn();
  renderSyntopicon();

  requestAnimationFrame(() => {
    const select = app.querySelector('#syntopicon-idea');
    if (select && idea && Array.from(select.options).some((option) => option.value === idea)) {
      select.value = idea;
      select.dispatchEvent(new Event('change', { bubbles:true }));
      select.focus();
      return;
    }
    const custom = app.querySelector('#syntopicon-custom-idea');
    if (custom) {
      custom.value = idea;
      custom.focus();
    }
  });
}

async function startModernGuideWholeComprehensionCheck(source = state?.source || {}) {
  if (source?.type !== 'modern-guide' || !state.documentId || !state.words.length) {
    return window.MarkSetGoStartComprehension?.();
  }

  const passageWords = state.words.filter((word) => !isModernGuideActionToken(word));
  const passage = passageWords.join(' ').replace(/\s+/g, ' ').trim();
  if (passageWords.length < 120) return;

  const wasRunning = isReaderRunning();
  if (wasRunning) pauseReader();

  try {
    const response = await fetch('/api/comprehension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `${source.originalTitle || state.title || 'Modern Guide'} — Whole Guide`,
        passage,
        scope: 'whole_guide'
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.detail || `Request failed with HTTP ${response.status}.`);
    if (!Array.isArray(payload.questions) || payload.questions.length !== 4) throw new Error('The quiz response was incomplete.');

    renderComprehensionQuiz(payload, {
      startIndex: 0,
      endIndex: state.words.length,
      words: passageWords.length,
      passage,
      wholeGuide: true
    });
  } catch (error) {
    window.alert(`Whole-guide comprehension check unavailable: ${error.message}`);
  }
}

function activateModernGuideInlineAction(button, source = state?.source || {}) {
  const action = button?.dataset?.modernGuideInlineAction;
  const index = Number(button?.dataset?.guideWordIndex);
  if (!action || source?.type !== 'modern-guide') return;

  if (Number.isFinite(index)) state.index = Math.max(0, index);

  if (action === 'discuss') {
    openModernGuideContextInAskMark(index);
    return;
  }

  if (action === 'quiz') {
    startModernGuideWholeComprehensionCheck(source);
    return;
  }

  if (action === 'action') {
    addModernGuideActionToCenter(source, button);
    return;
  }

  if (action === 'ideas') {
    openModernGuideGreatIdea(source);
  }
}

function bindModernGuideInlineActions(source = state?.source || {}) {
  if (source?.type !== 'modern-guide') return;
  const reader = app.querySelector('#reader');
  if (!reader || reader.dataset.modernGuideInlineBound === '1') return;
  reader.dataset.modernGuideInlineBound = '1';

  reader.addEventListener('click', (event) => {
    const button = event.target.closest('[data-modern-guide-inline-action]');
    if (!button || !reader.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    activateModernGuideInlineAction(button, source);
  }, true);

  reader.addEventListener('pointerdown', (event) => {
    if (event.target.closest('[data-modern-guide-inline-action]')) {
      event.stopPropagation();
    }
  }, true);
}

function renderReaderWithText(title, text, source = { type: 'text' }) {
  app.dataset.viewKey = 'reader';
  const bookModel = new BookModel({ title, text, source, tokenizer: splitWords });
  const isStructuredBible = Boolean(source?.type === 'bible' || source?.type === 'bible-book');
  let structure = isStructuredBible && Array.isArray(source?.documentStructure)
    ? source.documentStructure
    : detectDocumentStructure(text);

  // EPUBs carry an authoritative navigation document. Prefer that TOC over
  // heuristic heading detection, while still keeping detected structure for
  // reader formatting and illustration placement.
  const authoritativeToc = Array.isArray(source?.documentToc) ? source.documentToc : null;
  const suppliedToc = Array.isArray(authoritativeToc)
    ? authoritativeToc
    : Array.isArray(source?.epubToc)
      ? source.epubToc
        .filter((entry) => entry && Number.isFinite(Number(entry.index)) && String(entry.title || '').trim())
        .map((entry) => ({
          title: String(entry.title).replace(/\s+/g, ' ').trim(),
          index: Math.max(0, Number(entry.index) || 0),
          type: entry.type || 'chapter'
        }))
        .sort((a, b) => a.index - b.index)
        .filter((entry, index, all) => index === 0 || entry.index !== all[index - 1].index || normalizeTocTitle(entry.title) !== normalizeTocTitle(all[index - 1].title))
        .slice(0, 500)
      : [];

  if (suppliedToc.length) {
    const suppliedStructure = suppliedToc.map((entry) => ({
      title: entry.title,
      type: entry.type,
      start: entry.index,
      end: entry.index + Math.max(1, splitWords(entry.title).length),
      preferredToc: true,
      epubNavigation: true
    }));
    const seen = new Set();
    structure = [...structure, ...suppliedStructure]
      .sort((a, b) => a.start - b.start || (a.epubNavigation ? -1 : 1))
      .filter((entry) => {
        const key = `${entry.start}|${normalizeTocTitle(entry.title)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  const toc = suppliedToc.length
    ? suppliedToc
    : detectTableOfContents(text);

  readerEngine.loadBook(bookModel, {
    documentId: documentIdFor(title, String(text)),
    structure,
    toc
  });
  state.paragraphBreaks = new Set(
    Array.isArray(source?.paragraphBreaks) ? source.paragraphBreaks.map(Number).filter(Number.isFinite) : []
  );
  state.verseNumberIndexes = new Set(
    Array.isArray(source?.verseNumberIndexes) ? source.verseNumberIndexes.map(Number).filter(Number.isFinite) : []
  );
  state.bionic = false;
  state.meaningfulChunks = false;
  state.uploadedIllustrations = Array.isArray(source?.illustrations) ? source.illustrations : [];
  state.illustrationMode = state.uploadedIllustrations.length ? 'chapter' : 'off';
  if (!state.words.length) return renderError('No readable text', 'The selected source did not contain readable words.');

  // Every successful import/open must create the local document payload immediately.
  // Previously the text was only persisted after actions such as adding a bookmark,
  // allowing cloud metadata to sync while the actual document remained unavailable.
  const documentPersisted = persistCurrentDocument();
  if (!documentPersisted && (source?.type === 'modern-guide' || source?.type === 'classic-guide')) {
    console.warn(`${source?.type === 'classic-guide' ? 'Classic' : 'Modern'} Guide opened without a local text copy; My Library will use the bundled guide fallback when available.`);
  }

  // Guides are first-class reading items. Register them in My Library as soon
  // as they open instead of waiting for a timed reading session/checkpoint.
  if (source?.type === 'modern-guide' || source?.type === 'classic-guide') {
    registerCurrentDocumentInMyLibrary({ opened:true });
    if (source?.type === 'modern-guide') {
      registerModernGuideLibraryItem({
        documentId: state.documentId,
        title: state.title,
        source: state.source,
        text: state.currentText
      });
    }
  }

  document.dispatchEvent(new CustomEvent('marksetgo:document-available', {
    detail: { documentId: state.documentId, title: state.title }
  }));

  app.innerHTML = `
    <section class="panel reader-page-panel">
      <div class="reader-title-row">
        <div class="reader-title-copy">
          <h1>${escapeHtml(title)}</h1>
          ${source?.type === 'modern-guide' || source?.type === 'classic-guide' ? `<div class="modern-guide-reader-note"><span>${source?.type === 'classic-guide' ? 'Classic Guide · Independent educational companion' : 'Independent educational guide'}</span>${source?.originalAuthor ? `<span>Original book by ${escapeHtml(source.originalAuthor)}</span>` : ''}${source?.buyUrl ? `<a href="${escapeHtml(source.buyUrl)}" target="_blank" rel="noopener noreferrer">Buy original on Amazon ↗</a>` : ''}</div>` : ''}
          <div class="reader-title-links"><a id="grokipedia-book-link" href="${grokipediaSearchUrl(source?.originalTitle || title)}" target="_blank" rel="noopener noreferrer">Read about this book on Grokipedia</a></div>
        </div>
        <div class="reader-music-actions" aria-label="Music for this reading">
          <label class="preferred-music-control media-match-control"><span>Media match</span><select id="media-match-select">${mediaMatchOptionsMarkup()}</select></label>
          <button id="play-media-match" class="secondary reader-music-button" type="button">♫ Play music score</button>
          <button id="play-reading-mood" class="secondary reader-music-button" type="button">♫ Reading mood</button>
        </div>
      </div>
      <section class="reader-toolbar" aria-label="Reading settings">
        <details class="settings-panel">
          <summary><span>Reading</span><span class="settings-summary">Mode, speed, words</span></summary>
          <div class="toolbar-fields settings-content">
            <div class="control mode-control">
              <label for="mode-select">Mode</label>
              <select id="mode-select">
                <option value="highlight" selected>Highlight</option>
                <option value="bold-focus">Bold Focus</option>
                <option value="smooth-glide">Smooth Glide</option>
                <option value="pointing-guide">Pointing Guide</option>
                <option value="marquee">Marquee</option>
                <option value="flash">Flash</option>
                <option value="digital-sign">Digital Sign</option>
                <option value="auto-scroll">Auto Scroll</option>
                <option value="pacman">Pac-Man Chomp</option>
              </select>
            </div>
            <div class="control pointer-style-control">
              <label for="pointer-style">Pointer style</label>
              <select id="pointer-style">
                <option value="hand">Hand</option>
                <option value="underline">Underline</option>
                <option value="caret">Caret</option>
                <option value="bar">Reading bar</option>
                <option value="mark">Mark pointing</option>
              </select>
            </div>
            <div class="control pointer-style-control">
              <label for="pointer-color">Pointer color</label>
              <input id="pointer-color" type="color" value="#20a866" aria-label="Pointer color">
            </div>
            <div class="control"><label for="speed">Speed</label><div class="input-suffix"><input id="speed" type="number" min="30" max="900" value="${Math.min(900, state.wpm)}"><span>WPM</span></div></div>
            <div class="control"><label for="word-count">Words shown</label><input id="word-count" type="number" min="1" max="10" value="1"></div>
            <label class="compact-toggle meaningful-toggle" title="Group words into punctuation- and phrase-aware chunks up to the selected maximum."><input id="meaningful-chunks" type="checkbox"><span>Meaningful chunks</span></label>
          </div>
        </details>
        <details class="settings-panel">
          <summary><span>Display</span><span class="settings-summary">Font, size, theme, bionic</span></summary>
          <div class="toolbar-fields display-fields settings-content">
            <div class="control"><label for="font-family">Font</label><select id="font-family">
              <option value="system" selected>System Sans</option>
              <option value="serif">Book Serif</option>
              <option value="georgia">Georgia</option>
              <option value="verdana">Verdana</option>
              <option value="trebuchet">Trebuchet</option>
              <option value="monospace">Monospace</option>
              <option value="dyslexic">Dyslexia-friendly</option>
            </select></div>
            <div class="control"><label for="font-size">Text size</label><select id="font-size">${fontOptions(14)}</select></div>
            <div class="control"><label for="theme-select">Theme</label><select id="theme-select"><option value="dark" selected>Dark</option><option value="light">Light</option></select></div>
            <label class="compact-toggle"><input id="bionic-reading" type="checkbox"><span>Bionic text</span></label>
            <label class="compact-toggle" title="Show the current word or phrase at a fixed center point while using Flash or another guided mode."><input id="focus-anchor" type="checkbox"><span>Center focus anchor overlay</span></label>
            <div class="control"><label for="focus-anchor-font-size">Focus anchor size</label><select id="focus-anchor-font-size">${fontOptions(24)}</select></div>
            <div class="control"><label for="focus-anchor-color">Anchor color</label><select id="focus-anchor-color">
              <option value="#20a866" selected>Green</option><option value="#2f7de1">Blue</option><option value="#d28a00">Amber</option><option value="#d94b4b">Red</option><option value="#8a63d2">Purple</option>
            </select></div>
            <label class="compact-toggle"><input id="focus-anchor-bold" type="checkbox"><span>Bold anchor letter</span></label>
            <label class="compact-toggle" title="Show the text as two facing book pages."><input id="book-pages" type="checkbox"><span>Book pages</span></label>
            <div class="control illustration-control"><label for="illustration-mode">Illustrations</label><select id="illustration-mode">
              <option value="off" selected>Off</option>
              <option value="chapter">Chapter openings</option>
              <option value="automatic">Automatic</option>
            </select></div>
            <button id="show-hidden-illustrations" class="secondary illustration-restore-button" type="button" disabled>Show hidden illustrations</button>
          </div>
        </details>
      </section>

      <div class="reader-pane-controls" aria-label="Reading area layout controls">
        <div class="reader-pane-buttons">
          <button id="toggle-navigation-pane" class="secondary pane-toggle reader-side-toggle" type="button" aria-pressed="false" aria-controls="navigation-pane"><span aria-hidden="true">☰</span> Marks &amp; Contents</button>
          <button id="toggle-word-panel" class="secondary pane-toggle reader-side-toggle" type="button" aria-pressed="false" aria-controls="word-panel" hidden><span aria-hidden="true">⚙</span> Reader Tools</button>
          <button id="toggle-mark-panel" class="secondary pane-toggle reader-side-toggle mark-pane-button" type="button" aria-pressed="false" aria-controls="word-panel"><span aria-hidden="true">✦</span> Ask Mark</button>
        </div>
        <button id="toggle-reader-fullscreen" class="viewer-fullscreen-button" type="button" aria-label="Enter text viewer fullscreen" title="Full screen text viewer">
          <span class="fullscreen-icon" aria-hidden="true">⛶</span>
          <span class="fullscreen-label">Full screen</span>
        </button>
      </div>
      <div class="reader-layout word-panel-hidden" id="reader-layout">
        <aside id="navigation-pane" class="navigation-pane" aria-label="Contents and bookmarks"></aside>
        <div id="left-pane-splitter" class="pane-splitter" role="separator" aria-orientation="vertical" aria-label="Resize contents pane" tabindex="0"></div>
        <div class="reader-center-column">
          <div id="reader-frame" class="reader-frame">
          <div id="fullscreen-control-strip" class="fullscreen-control-strip" aria-label="Fullscreen reader controls">
            <button id="fullscreen-options-toggle" class="fullscreen-options-toggle" type="button" aria-expanded="false" aria-controls="fullscreen-options-menu">Options ▾</button>
            <button id="fullscreen-mark-toggle" class="fullscreen-mark-toggle" type="button" aria-expanded="false" aria-controls="fullscreen-mark-drawer"><span aria-hidden="true">✦</span> Ask Mark</button>
            <button id="fullscreen-controls-close" class="fullscreen-controls-close" type="button" aria-label="Exit full screen and return to Reader" title="Return to regular Reader">×</button>
            <section id="fullscreen-options-menu" class="fullscreen-options-menu" hidden>
              <div class="fullscreen-options-header">
                <strong>Reader controls</strong>
                <span>Same Reader controls, full-screen layout</span>
              </div>

              <details class="fullscreen-option-group" open>
                <summary>Reading</summary>
                <div class="fullscreen-options-grid fullscreen-options-grid-reading">
                  <label>Mode<select id="fs-mode-select">
                    <option value="highlight">Highlight</option><option value="bold-focus">Bold Focus</option><option value="smooth-glide">Smooth Glide</option><option value="pointing-guide">Pointing Guide</option><option value="marquee">Marquee</option><option value="flash">Flash</option>
                    <option value="digital-sign">Digital Sign</option><option value="auto-scroll">Auto Scroll</option><option value="pacman">Pac-Man Chomp</option>
                  </select></label>
                  <label>Pointer<select id="fs-pointer-style">
                    <option value="hand">Hand</option>
                    <option value="underline">Underline</option>
                    <option value="caret">Caret</option>
                    <option value="bar">Reading bar</option>
                    <option value="mark">Mark pointing</option>
                  </select></label>
                  <label class="pointer-style-control">Pointer color
                    <input id="fs-pointer-color" type="color" value="#20a866" aria-label="Pointer color">
                  </label>
                  <label>Speed<div class="input-suffix"><input id="fs-speed" type="number" min="30" max="900"><span>WPM</span></div></label>
                  <label>Words shown<input id="fs-word-count" type="number" min="1" max="10"></label>
                </div>
                <div class="fullscreen-option-actions fullscreen-reading-actions">
                  <button id="fs-start" class="primary" type="button">Start</button>
                  <button id="fs-pause" class="secondary" type="button">Pause</button>
                  <button id="fs-reset" class="secondary" type="button">Reset</button>
                  <button id="fs-check-comprehension" class="secondary" type="button">Check comprehension</button>
                </div>
              </details>

              <details class="fullscreen-option-group" open>
                <summary>Focus</summary>
                <div class="fullscreen-options-grid">
                  <label class="fullscreen-checkbox"><input id="fs-focus-anchor" type="checkbox"> Focus anchor</label>
                  <label>Anchor size<select id="fs-focus-anchor-font-size">${fontOptions(24)}</select></label>
                  <label>Anchor color<select id="fs-focus-anchor-color"><option value="#20a866">Green</option><option value="#2f7de1">Blue</option><option value="#d28a00">Amber</option><option value="#d94b4b">Red</option><option value="#8a63d2">Purple</option></select></label>
                  <label class="fullscreen-checkbox"><input id="fs-focus-anchor-bold" type="checkbox"> Bold anchor letter</label>
                  <label class="fullscreen-checkbox"><input id="fs-meaningful-chunks" type="checkbox"> Meaningful chunks</label>
                  <label class="fullscreen-checkbox"><input id="fs-bionic-reading" type="checkbox"> Bionic text</label>
                </div>
              </details>

              <details class="fullscreen-option-group">
                <summary>Display</summary>
                <div class="fullscreen-options-grid">
                  <label>Font<select id="fs-font-family">
                    <option value="system">System Sans</option><option value="serif">Book Serif</option><option value="georgia">Georgia</option>
                    <option value="verdana">Verdana</option><option value="trebuchet">Trebuchet</option><option value="monospace">Monospace</option><option value="dyslexic">Dyslexia-friendly</option>
                  </select></label>
                  <label>Text size<select id="fs-font-size">${fontOptions(14)}</select></label>
                  <label>Theme<select id="fs-theme-select"><option value="dark">Dark</option><option value="light">Light</option></select></label>
                  <label class="fullscreen-checkbox"><input id="fs-book-pages" type="checkbox"> Book pages</label>
                  <label>Illustrations<select id="fs-illustration-mode"><option value="off">Off</option><option value="chapter">Chapter openings</option><option value="automatic">Automatic</option></select></label>
                  <button id="fs-show-hidden-illustrations" class="secondary fullscreen-inline-button" type="button" disabled>Show hidden illustrations</button>
                </div>
              </details>

              <details class="fullscreen-option-group">
                <summary>Media</summary>
                <div class="fullscreen-options-grid fullscreen-options-grid-media">
                  <label>Media match<select id="fs-media-match-select">${mediaMatchOptionsMarkup()}</select></label>
                  <button id="fs-media-match" class="secondary fullscreen-inline-button" type="button">Play media match</button>
                  <button id="fs-reading-mood" class="secondary fullscreen-inline-button" type="button">♫ Reading mood</button>
                </div>
              </details>

              <details class="fullscreen-option-group">
                <summary>Translation</summary>
                <div class="fullscreen-options-grid fullscreen-options-grid-translation">
                  <label>Language<select id="fs-translation-language">
                    <option value="">Choose language…</option>
                    ${Object.entries(languages).map(([code, name]) => `<option value="${code}">${name}</option>`).join('')}
                  </select></label>
                  <div class="fullscreen-translation-actions">
                    <button id="fs-translate" class="secondary" type="button">Translate</button>
                    <button id="fs-restore" class="secondary" type="button">Restore English</button>
                  </div>
                </div>
              </details>

              <p class="fullscreen-options-hint">Click text or press <kbd>Space</kbd> to pause/resume. Press <kbd>O</kbd> to restore hidden controls.</p>
            </section>
          </div>
          <div id="focus-anchor-overlay" class="focus-anchor-overlay" hidden aria-live="off"></div>
          <div id="reader-bookmark-layer" class="reader-bookmark-layer" aria-live="polite"></div>

            <aside id="fullscreen-mark-drawer" class="fullscreen-mark-drawer" hidden aria-label="Ask Mark reading companion">
              <header class="fullscreen-mark-header">
                <div><span>Reading companion</span><strong>Ask Mark</strong></div>
                <button id="fullscreen-mark-close" type="button" aria-label="Close Mark">×</button>
              </header>
              <nav class="fullscreen-mark-tabs" aria-label="Ask Mark fullscreen tabs">
                <button type="button" data-fs-mark-tab="selection" class="active">Ask Mark</button>
                <button type="button" data-fs-mark-tab="notebook">Notebook</button>
                <button type="button" data-fs-mark-tab="format">Format</button>
              </nav>
              <div id="fullscreen-mark-selection" data-fs-mark-panel="selection"></div>
              <div id="fullscreen-mark-notebook" data-fs-mark-panel="notebook" hidden></div>
              <div id="fullscreen-mark-format" data-fs-mark-panel="format" hidden></div>
            </aside>
          <article id="reader" class="reader interactive-reader" style="font-size:14px" aria-label="Reading text" title="Click a word to move the reading position; click empty space to pause or resume"></article>
          </div>
          <div class="reader-viewer-footer" aria-label="Reader pace and page navigation">
            <div id="book-page-controls-home" class="book-page-controls-home">
              <div id="book-page-controls" class="book-page-controls" hidden>
                <button id="book-page-prev" type="button" aria-label="Previous page spread">‹</button>
                <label class="book-page-jump" for="book-page-input">
                  <span>Page</span>
                  <input id="book-page-input" type="number" min="1" step="1" inputmode="numeric" value="1" aria-label="Go to page number">
                  <span id="book-page-total">of 1</span>
                </label>
                <span id="book-page-status" class="book-page-spread-label">Pages 1–2</span>
                <button id="book-page-next" type="button" aria-label="Next page spread">›</button>
              </div>
            </div>
            <span id="viewer-wpm-badge" class="viewer-wpm-badge" aria-label="Selected reading speed">${Math.round(Number(state.wpm) || 0).toLocaleString()} WPM</span>
          </div>
        </div>
        <div id="right-pane-splitter" class="pane-splitter" role="separator" aria-orientation="vertical" aria-label="Resize right pane" tabindex="0"></div>
        <aside id="word-panel" class="word-panel" aria-live="polite">
          <section class="translation-tools" aria-label="Translation controls">
            <h2>Translate</h2>
            <div class="control">
              <label for="translation-language">Language</label>
              <select id="translation-language">
                <option value="">Choose language…</option>
                ${Object.entries(languages).map(([code, name]) => `<option value="${code}">${name}</option>`).join('')}
              </select>
            </div>
            <div class="translation-actions">
              <button id="translate-text" class="secondary">Translate</button>
              <button id="restore-english" class="secondary" disabled>Restore English</button>
            </div>
            <span id="translation-status" class="status"></span>
          </section>
          <section id="word-result" class="word-result">
            <h2>Word translation</h2>
            <p>After translating the passage, click a word to see its English meaning here.</p>
          </section>
        </aside>
      </div>

      <div id="mark-selection-toolbar" class="mark-selection-toolbar" hidden role="toolbar" aria-label="Ask Mark passage actions">
        <button type="button" data-mark-toolbar-action="explain">💡 Explain</button><button type="button" data-mark-toolbar-action="summarize">≡ Summarize</button><button type="button" data-mark-toolbar-action="simplify">Aa Simplify</button><button type="button" data-mark-toolbar-action="context">⌛ Context</button><button type="button" data-mark-toolbar-action="related">∞ Compare</button><button type="button" data-mark-toolbar-action="save">★ Save</button><button type="button" data-mark-toolbar-action="ask">✦ Ask Mark</button>
      </div>
      <div id="word-context-menu" class="word-context-menu" hidden role="menu" aria-label="Word actions">
        <button type="button" data-dictionary-action="lookup" role="menuitem">Look up word</button>
        <button type="button" data-dictionary-action="save" role="menuitem">Save definition</button>
        <button type="button" data-dictionary-action="note" role="menuitem">Add note</button>
        <button type="button" data-dictionary-action="bookmark" role="menuitem">Add bookmark</button>
      </div>
      <dialog id="comprehension-dialog" class="comprehension-dialog" aria-label="Comprehension check"></dialog>

      <div class="controls playback-controls">
        <button id="start-reader" class="primary">Start</button>
        <button id="pause-reader" class="secondary" disabled>Pause</button>
        <button id="reset-reader" class="secondary">Reset</button>
        <span id="reader-status" class="status">${state.words.length.toLocaleString()} words loaded. Click a word to continue from there; click empty space or press Space to pause or resume.</span>
      </div>
    </section>`;

  const reader = app.querySelector('#reader');
  const readerFrame = app.querySelector('#reader-frame');
  const fullscreenButton = app.querySelector('#toggle-reader-fullscreen');
  arrangeReaderSidePanels();
  bindAppearance(reader);
  bindReaderMusicControls(title, text, source);
  bindReaderFullscreen(readerFrame, fullscreenButton);
  bindFullscreenOptions(readerFrame);
  bindReaderPaneControls();
  bindMarkCompanion(reader);
  bindReaderResize(readerFrame, reader);
  observeBookPageReader();
  renderNavigationPane();
  prepareReaderView('highlight');
  updateModeControls('highlight');
  bindVirtualSpacerGuard(reader);
  app.querySelector('#book-page-prev')?.addEventListener('click', () => turnBookPages(-1));
  app.querySelector('#book-page-next')?.addEventListener('click', () => turnBookPages(1));

  const jumpToTypedBookPage = () => {
    const input = app.querySelector('#book-page-input');
    const reader = app.querySelector('#reader');
    if (!input || !reader || !state.bookPages) return;

    const totalPages = Math.max(1, getEstimatedBookPageCount(reader));
    const requestedPage = Math.max(1, Math.min(totalPages, Math.trunc(Number(input.value) || 1)));
    input.value = String(requestedPage);

    // Facing-page layout: pages 1–2 are spread 0, 3–4 spread 1, etc.
    const targetSpread = Math.floor((requestedPage - 1) / 2);
    goToBookSpread(targetSpread, {
      behavior: 'auto',
      ensureRendered: true,
      syncReaderPosition: false
    });

    // Once the new spread is physically in place, move the logical reading
    // position to the first readable word on that spread so playback, resume,
    // TOC changes, and subsequent reflow all remain synchronized.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        state.bookSpreadIndex = targetSpread;
        reader.scrollLeft = targetSpread * getBookSpreadWidth(reader);
        syncReaderToVisibleBookSpread(reader);
        updateBookPageStatus(targetSpread);
        persistReaderSession();
      });
    });
  };

  app.querySelector('#book-page-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      jumpToTypedBookPage();
      event.currentTarget.blur();
    }
  });
  app.querySelector('#book-page-input')?.addEventListener('change', jumpToTypedBookPage);
  app.querySelector('#reader')?.addEventListener('scroll', () => {
    if (state.bookPages) window.requestAnimationFrame(updateBookPageStatus);
  });
  // Book Pages treats one physical wheel gesture as exactly one two-page
  // spread.  While a gesture is being consumed we intentionally discard the
  // trailing wheel events (especially important for trackpads/inertial mice),
  // so one flick can never skip several spreads.
  let bookPageWheelLocked = false;
  let bookPageWheelDelta = 0;
  let bookPageWheelResetTimer = null;
  app.querySelector('#reader')?.addEventListener('wheel', (event) => {
    if (!state.bookPages || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    event.preventDefault();

    if (bookPageWheelLocked) {
      bookPageWheelDelta = 0;
      return;
    }

    bookPageWheelDelta += event.deltaY;
    window.clearTimeout(bookPageWheelResetTimer);
    bookPageWheelResetTimer = window.setTimeout(() => { bookPageWheelDelta = 0; }, 140);
    if (Math.abs(bookPageWheelDelta) < 24) return;

    // Match the user's physical wheel convention on this system:
    // wheel/scroll UP -> next spread; wheel/scroll DOWN -> previous spread.
    // The browser reports this device's wheel polarity opposite the earlier
    // assumption, so positive deltaY advances and negative deltaY goes back.
    const direction = bookPageWheelDelta > 0 ? 1 : -1;
    bookPageWheelDelta = 0;
    bookPageWheelLocked = true;
    turnBookPages(direction);
    window.setTimeout(() => { bookPageWheelLocked = false; }, 380);
  }, { passive: false });

  const modeSelect = app.querySelector('#mode-select');
  modeSelect.addEventListener('change', () => {
    switchReadingMode(modeSelect.value);
  });

  // Spacebar acts as a simple play/pause toggle while the reader is open.
  // Remove the previous handler first because loading another book rebuilds this view.
  if (state.spacebarHandler) document.removeEventListener('keydown', state.spacebarHandler);
  state.spacebarHandler = (event) => {
    if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;

    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, button, a, summary, [contenteditable="true"], [role="textbox"]')) return;
    if (!app.querySelector('#reader') || getSelectedMode() === 'two-column') return;

    event.preventDefault();
    if (isReaderRunning()) pauseReader();
    else startReader();
    persistReaderSession();
  };
  document.addEventListener('keydown', state.spacebarHandler);

  readerFrame.addEventListener('click', (event) => {
    if (state.readerSuppressSyntheticClick) {
      state.readerSuppressSyntheticClick = false;
      event.preventDefault();
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('button, input, textarea, select, a, summary, [contenteditable="true"], [role="textbox"], #fullscreen-control-strip, #fullscreen-mark-drawer')) return;

    // A real Focus Anchor drag must not also toggle playback when the pointer is
    // released. A simple click on the anchor, however, is still a blank-reader
    // click and follows the same pause/resume contract as the rest of the canvas.
    if (target.closest('#focus-anchor-overlay') && state.focusAnchorSuppressClick) {
      state.focusAnchorSuppressClick = false;
      return;
    }

    // Ask Mark owns the click immediately following a real text selection.
    // Let the reader's selection handling own that interaction before this bubble-phase toggle.
    if (state.markSuppressNextReaderClick || state.markSelectionLocked || state.markResumeOnNextReaderClick !== null) return;
    const liveSelection = window.getSelection?.();
    if (liveSelection && !liveSelection.isCollapsed && liveSelection.rangeCount) {
      const range = liveSelection.getRangeAt(0);
      if (reader.contains(range.commonAncestorContainer)
          || reader.contains(range.startContainer)
          || reader.contains(range.endContainer)) return;
    }

    const translatedWord = target.closest('.translated-word');
    if (translatedWord && state.language !== 'en') {
      handleTranslatedWordClick(event);
      return;
    }

    const clickedWord = target.closest('.reader-word[data-index]');
    const clickedGroup = target.closest('.reader-group[data-start-index]');
    const mode = getSelectedMode();
    const seekableModes = new Set(['highlight', 'bold-focus', 'smooth-glide', 'pointing-guide', 'marquee', 'auto-scroll']);

    // In full-text modes, clicking visible text changes the reading position
    // instead of toggling pause. Support both individual word spans and grouped
    // text containers so every visible text click resolves to a reading index.
    if ((clickedWord || clickedGroup) && seekableModes.has(mode)) {
      event.preventDefault();
      const clickedIndex = Number(clickedWord?.dataset.index ?? clickedGroup?.dataset.startIndex);
      if (Number.isFinite(clickedIndex)) {
        const wasRunning = isReaderRunning();
        const group = findReadingGroup(clickedIndex);
        stopReader();
        state.index = group?.start ?? clickedIndex;
        state.viewportAnchorIndex = state.index;
        persistReaderSession({ immediate: true });
        updateReaderStatus(`Reading position moved to word ${(state.index + 1).toLocaleString()}.`);
        startReader();
        if (!wasRunning) window.setTimeout(pauseReader, 0);
      }
      return;
    }

    if (mode === 'two-column') return;
    if (isReaderRunning()) pauseReader();
    else startReader();
    persistReaderSession();
  });
  bindDictionaryMenu(reader);
  window.requestAnimationFrame(updateReaderBookmarkMarkers);
  app.querySelector('#start-reader').addEventListener('click', () => {
    startReader();
    persistReaderSession();
    window.ReadingGoals?.onSessionStart?.({documentId:state.documentId,title:state.title});
  });
  app.querySelector('#pause-reader').addEventListener('click', () => { pauseReader(); persistReaderSession(); });
  app.querySelector('#reset-reader').addEventListener('click', () => { resetReader(); persistReaderSession(); });
  app.querySelector('#check-comprehension')?.addEventListener('click', startComprehensionCheck);
  app.querySelector('#fs-check-comprehension')?.addEventListener('click', startComprehensionCheck);
  app.querySelector('#bionic-reading').addEventListener('change', (event) => {
    const snapshot = captureReaderLocation();
    stopReader();
    state.bionic = event.target.checked;
    state.index = snapshot.anchorIndex;
    const mode = getSelectedMode();
    const count = Number(app.querySelector('#word-count')?.value) || 1;
    prepareReaderView(mode, count);
    updateModeControls(mode);
    restoreCapturedReaderLocation(snapshot, { rerendered: true });
  });
  app.querySelector('#pointer-style')?.addEventListener('change', (event) => {
    const snapshot = captureReaderLocation();
    state.pointerStyle = event.target.value || 'hand';
    if (getSelectedMode() === 'pointing-guide') {
      stopReader();
      state.index = snapshot.anchorIndex;
      prepareReaderView('pointing-guide', Number(app.querySelector('#word-count')?.value) || 1);
      updateModeControls('pointing-guide');
      restoreCapturedReaderLocation(snapshot, { rerendered: true });
    }
    persistReaderSession({ immediate: true });
  });

  app.querySelector('#pointer-color')?.addEventListener('input', (event) => {
    state.pointerColor = event.target.value || '#20a866';
    const reader = app.querySelector('#reader');
    reader?.style.setProperty('--pointer-color', state.pointerColor);
    persistReaderSession({ immediate: true });
  });

  app.querySelector('#focus-anchor-font-size')?.addEventListener('change', (event) => {
    const snapshot = captureReaderLocation();
    state.focusAnchorFontSize = Number(event.target.value) || 24;
    updateFocusAnchorOverlay();
    requestAnimationFrame(() => restoreCapturedReaderLocation(snapshot, { rerendered: false }));
    persistReaderSession({ immediate: true });
  });

  app.querySelector('#focus-anchor-color')?.addEventListener('change', (event) => {
    const snapshot = captureReaderLocation();
    state.focusAnchorColor = event.target.value || '#20a866';
    refreshFocusAnchorStyle();
    restoreCapturedReaderLocation(snapshot, { rerendered: false });
    persistReaderSession({ immediate: true });
  });
  app.querySelector('#focus-anchor-bold')?.addEventListener('change', (event) => {
    const snapshot = captureReaderLocation();
    state.focusAnchorBold = Boolean(event.target.checked);
    refreshFocusAnchorStyle();
    restoreCapturedReaderLocation(snapshot, { rerendered: false });
    persistReaderSession({ immediate: true });
  });

  app.querySelector('#focus-anchor').addEventListener('change', (event) => {
    const snapshot = captureReaderLocation();
    const reader = app.querySelector('#reader');
    const savedScrollTop = reader?.scrollTop || 0;
    const savedScrollLeft = reader?.scrollLeft || 0;

    /*
      Focus Anchor is an overlay; enabling it must not rebuild the underlying
      reader. The earlier implementation called prepareReaderView(), which
      recreated the virtualized text and could temporarily reset state.index
      to zero before the asynchronous restore completed.
    */
    state.focusAnchor = Boolean(event.target.checked);
    state.index = snapshot.anchorIndex;
    updateFocusAnchorOverlay();
    refreshFocusAnchorStyle();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const activeReader = app.querySelector('#reader');
        if (!activeReader) return;

        state.index = snapshot.anchorIndex;

        if (state.bookPages) {
          const spread = bookSpreadForWordIndex(activeReader, snapshot.anchorIndex);
          if (spread != null) {
            goToBookSpread(spread, {
              behavior: 'auto',
              ensureRendered: true,
              syncReaderPosition: false
            });
          }
        } else {
          // Preserve the existing viewport first, then ensure the canonical word
          // remains available if the document is virtualized.
          activeReader.scrollTop = savedScrollTop;
          activeReader.scrollLeft = savedScrollLeft;

          const mode = state.renderedMode || getSelectedMode();
          const count = Math.max(1, Number(app.querySelector('#word-count')?.value) || 1);

          if (
            state.virtualized
            && snapshot.anchorIndex >= 0
            && (
              snapshot.anchorIndex < state.renderedWordStart
              || snapshot.anchorIndex >= state.renderedWordEnd
            )
          ) {
            virtualRenderer.renderWindowAround(
              activeReader,
              mode,
              count,
              snapshot.anchorIndex
            );
            restoreReadingAnchor(activeReader, mode, count, snapshot.anchorIndex);
          }
        }

        state.index = snapshot.anchorIndex;
        updateReaderStatus();
        persistReaderSession({ immediate: true });

        // The overlay can be enabled while playback is active. Since the text
        // renderer was not rebuilt, playback can continue from the same word.
        if (snapshot.wasRunning && !isReaderRunning()) {
          startReader();
        }
      });
    });
  });
  app.querySelector('#meaningful-chunks').addEventListener('change', (event) => {
    const snapshot = captureReaderLocation();
    stopReader();
    state.meaningfulChunks = event.target.checked;
    state.index = snapshot.anchorIndex;
    const mode = getSelectedMode();
    const count = Number(app.querySelector('#word-count')?.value) || 1;
    prepareReaderView(mode, count);
    updateModeControls(mode);
    restoreCapturedReaderLocation(snapshot, { rerendered: true });
  });
  app.querySelector('#illustration-mode').addEventListener('change', (event) => {
    const snapshot = captureReaderLocation();
    stopReader();
    state.illustrationMode = event.target.value;
    state.illustrationAnchors.clear();
    state.index = snapshot.anchorIndex;
    const mode = getSelectedMode();
    const count = Number(app.querySelector('#word-count')?.value) || 1;
    prepareReaderView(mode, count);
    updateModeControls(mode);
    restoreCapturedReaderLocation(snapshot, { rerendered: true });
  });
  app.querySelector('#show-hidden-illustrations')?.addEventListener('click', restoreHiddenIllustrations);
  app.querySelector('#fs-show-hidden-illustrations')?.addEventListener('click', restoreHiddenIllustrations);
  updateHiddenIllustrationControls();
  app.querySelector('#translate-text').addEventListener('click', translateCurrentText);
  app.querySelector('#restore-english').addEventListener('click', restoreEnglish);
  const speedBadgeInput = app.querySelector('#speed');
  speedBadgeInput?.addEventListener('input', updateViewerWpmBadge);
  speedBadgeInput?.addEventListener('change', updateViewerWpmBadge);
  updateViewerWpmBadge();

  app.querySelectorAll('#mode-select, #speed, #word-count, #pointer-style, #pointer-color, #meaningful-chunks, #focus-anchor-font-size, #focus-anchor-color, #focus-anchor-bold, #font-family, #font-size, #theme-select, #bionic-reading, #book-pages, #illustration-mode').forEach((control) => {
    control.addEventListener('change', () => persistReaderSession());
    control.addEventListener('input', () => persistReaderSession());
  });
  bindModernGuideInlineActions(source);

  // Bible chapters/books are typically small enough to save immediately, and
  // doing so guarantees Resume Last Reading points at the passage just opened.
  // This document is now the explicit current reader for the top Reader button.
  activeReaderSnapshot = buildReaderSessionSnapshot() || {
    title: state.title,
    currentText: state.currentText,
    originalText: state.originalText,
    source: state.source,
    language: state.language,
    index: state.index,
    playbackIndex: state.index,
    viewportAnchorIndex: state.viewportAnchorIndex ?? state.index,
    wasRunning: false,
    controls: captureReaderControls()
  };

  if (source?.type === 'bible' || source?.type === 'bible-book') {
    persistReaderSession({ immediate: true });
  } else {
    persistReaderSession();
  }
}



function fullscreenMarkResultContainer() {
  const drawer = app.querySelector('#fullscreen-mark-drawer');
  return drawer && !drawer.hidden ? app.querySelector('#fullscreen-mark-response') : null;
}

function renderFullscreenMarkSelection() {
  const panel = app.querySelector('#fullscreen-mark-selection');
  if (!panel) return;
  const selected = state.markSelection;
  if (!selected) {
    panel.innerHTML = '<div class="mark-empty fullscreen-mark-empty"><strong>Highlight a passage to begin.</strong><p>Reading pauses automatically when you select text.</p></div>';
    return;
  }
  panel.innerHTML = `<div class="fullscreen-mark-selection-card"><span>${splitWords(selected.text).length} selected words${selected.chapter?` · ${escapeHtml(selected.chapter)}`:''}</span><blockquote>${escapeHtml(selected.text.slice(0,1000))}${selected.text.length>1000?'…':''}</blockquote></div>
  <div class="fullscreen-mark-actions">${[['explain','💡','Explain'],['summarize','≡','Summarize'],['analyze','🧠','Analyze'],['simplify','A','Simplify'],['context','🏛','Context'],['related','🔗','Related'],['translate','🌍','Translate'],['save','★','Save']].map(([id,icon,label])=>`<button type="button" data-fs-mark-action="${id}"><span>${icon}</span>${label}</button>`).join('')}</div>
  <form id="fullscreen-mark-question-form" class="fullscreen-mark-question-form"><label for="fullscreen-mark-question">Ask Mark</label><div><input id="fullscreen-mark-question" type="text" maxlength="1200" placeholder="Ask about this passage…"><button class="primary" type="submit">Ask</button></div></form>
  <div id="fullscreen-mark-response" class="mark-response fullscreen-mark-response" hidden></div>`;
  panel.querySelectorAll('[data-fs-mark-action]').forEach(b=>b.addEventListener('click',()=>runMarkAction(b.dataset.fsMarkAction)));
  panel.querySelector('#fullscreen-mark-question-form')?.addEventListener('submit',e=>{e.preventDefault();const q=panel.querySelector('#fullscreen-mark-question')?.value.trim();if(q)runMarkAction('ask',q);});
}
function renderFullscreenMarkNotebook() {
  const panel=app.querySelector('#fullscreen-mark-notebook');
  if(!panel)return;
  renderNotebookCollection(panel,markRecordsForCurrentBook(MARK_INSIGHTS_KEY),{title:`${state.title||'Current Book'} Notebook`});
}
function renderFullscreenMarkFormat() {
  const panel = app.querySelector('#fullscreen-mark-format');
  if (!panel) return;

  const hasSelection = Boolean(state.markSelection || state.markPersistentSelection);
  panel.innerHTML = `
    <div class="fullscreen-format-panel">
      <div class="mark-list-heading"><strong>Format text</strong><small>Same formatter available in regular Ask Mark</small></div>
      <div class="fullscreen-format-levels">
        <button type="button" data-fs-format-level="light"><strong>Light</strong><small>Characters, spacing, punctuation</small></button>
        <button type="button" data-fs-format-level="standard"><strong>Standard</strong><small>OCR cleanup, paragraphs, page artifacts</small></button>
        <button type="button" class="active" data-fs-format-level="deep"><strong>AI Deep Clean</strong><small>Context-aware cleanup and structure</small></button>
      </div>
      <fieldset class="fullscreen-format-scope">
        <legend>Apply to</legend>
        <label><input type="radio" name="fs-format-scope" value="document" ${hasSelection ? '' : 'checked'}> Entire document</label>
        <label><input type="radio" name="fs-format-scope" value="selection" ${hasSelection ? 'checked' : ''}> Highlighted passage</label>
      </fieldset>
      <div class="fullscreen-format-actions">
        <button class="primary" type="button" data-fs-format-apply>Format Text</button>
        <button class="secondary" type="button" data-fs-format-original>Restore Original</button>
      </div>
      <p class="status" data-fs-format-status></p>
    </div>`;

  panel.querySelectorAll('[data-fs-format-level]').forEach((button) => {
    button.addEventListener('click', () => {
      panel.querySelectorAll('[data-fs-format-level]').forEach((item) => item.classList.toggle('active', item === button));
    });
  });

  panel.querySelector('[data-fs-format-apply]')?.addEventListener('click', async () => {
    const status = panel.querySelector('[data-fs-format-status]');
    try {
      const api = window.MarkSetGoReadAnything;
      if (!api?.applyCleanup) throw new Error('The formatter is not available.');
      const level = panel.querySelector('[data-fs-format-level].active')?.dataset.fsFormatLevel || 'deep';
      const scope = panel.querySelector('input[name="fs-format-scope"]:checked')?.value || 'document';
      const selectionRange = scope === 'selection' ? window.MarkSetGoCurrentReaderDocument?.getSelectionRange?.() : null;
      const selected = String(selectionRange?.text || state.markSelection?.text || state.markPersistentSelection?.text || '');

      if (scope === 'selection' && !selected) throw new Error('Highlight a passage first, or choose Entire document.');
      if (scope === 'document' && !api.hasActiveDocument?.()) throw new Error('The current Reader text could not be accessed.');

      if (status) status.textContent = level === 'deep' ? 'AI Deep Clean is reviewing the text…' : 'Formatting text…';
      await api.applyCleanup(level, scope, selected, selectionRange);
      if (status) status.textContent = 'Formatting complete.';
    } catch (error) {
      if (status) status.textContent = error?.message || 'Formatting could not be completed.';
    }
  });

  panel.querySelector('[data-fs-format-original]')?.addEventListener('click', async () => {
    const status = panel.querySelector('[data-fs-format-status]');
    try {
      const api = window.MarkSetGoReadAnything;
      if (!api?.restoreOriginal) throw new Error('The original version is unavailable.');
      await api.restoreOriginal();
      if (status) status.textContent = 'Original text restored.';
    } catch (error) {
      if (status) status.textContent = error?.message || 'The original could not be restored.';
    }
  });
}

function activateFullscreenMarkTab(tab='selection'){
  app.querySelectorAll('[data-fs-mark-tab]').forEach(b=>b.classList.toggle('active',b.dataset.fsMarkTab===tab));
  app.querySelectorAll('[data-fs-mark-panel]').forEach(p=>p.hidden=p.dataset.fsMarkPanel!==tab);
  if(tab==='selection')renderFullscreenMarkSelection();
  if(tab==='notebook')renderFullscreenMarkNotebook();
  if(tab==='format')renderFullscreenMarkFormat();
}

function syncBookPageControlsPlacement(readerFrame=app.querySelector('#reader-frame')) {
  const controls=app.querySelector('#book-page-controls');
  const home=app.querySelector('#book-page-controls-home');
  const reader=app.querySelector('#reader');
  if(!controls||!home||!readerFrame||!reader)return;

  const fullscreenActive = document.fullscreenElement === readerFrame
    || readerFrame.classList.contains('fullscreen-fallback');

  if(fullscreenActive){
    if(controls.parentElement!==readerFrame) readerFrame.insertBefore(controls,reader);
    controls.classList.add('book-page-controls-fullscreen');
  }else{
    if(controls.parentElement!==home) home.append(controls);
    controls.classList.remove('book-page-controls-fullscreen');
  }
}
function bindFullscreenOptions(readerFrame) {
  // The reader view can be rebuilt many times during one browser session.
  // Tear down document-level fullscreen bindings from the previous instance so
  // detached readers cannot keep observers/listeners alive or repeat work.
  if (state.fullscreenOptionsKeyHandler) {
    document.removeEventListener('keydown', state.fullscreenOptionsKeyHandler);
    state.fullscreenOptionsKeyHandler = null;
  }
  if (state.fullscreenOptionsChangeHandler) {
    document.removeEventListener('fullscreenchange', state.fullscreenOptionsChangeHandler);
    state.fullscreenOptionsChangeHandler = null;
  }
  if (state.fullscreenOptionsObserver) {
    state.fullscreenOptionsObserver.disconnect();
    state.fullscreenOptionsObserver = null;
  }

  const strip = app.querySelector('#fullscreen-control-strip');
  const toggle = app.querySelector('#fullscreen-options-toggle');
  const markToggle = app.querySelector('#fullscreen-mark-toggle');
  const markDrawer = app.querySelector('#fullscreen-mark-drawer');
  const markClose = app.querySelector('#fullscreen-mark-close');
  const close = app.querySelector('#fullscreen-controls-close');
  const menu = app.querySelector('#fullscreen-options-menu');
  if (!readerFrame || !strip || !toggle || !markToggle || !markDrawer || !markClose || !close || !menu) return;

  const pairs = [
    ['#fs-mode-select', '#mode-select'],
    ['#fs-speed', '#speed'],
    ['#fs-word-count', '#word-count'],
    ['#fs-pointer-style', '#pointer-style'],
    ['#fs-pointer-color', '#pointer-color'],
    ['#fs-font-family', '#font-family'],
    ['#fs-font-size', '#font-size'],
    ['#fs-theme-select', '#theme-select'],
    ['#fs-bionic-reading', '#bionic-reading'],
    ['#fs-focus-anchor', '#focus-anchor'],
    ['#fs-focus-anchor-font-size', '#focus-anchor-font-size'],
    ['#fs-focus-anchor-color', '#focus-anchor-color'],
    ['#fs-focus-anchor-bold', '#focus-anchor-bold'],
    ['#fs-book-pages', '#book-pages'],
    ['#fs-illustration-mode', '#illustration-mode'],
    ['#fs-meaningful-chunks', '#meaningful-chunks'],
    ['#fs-translation-language', '#translation-language']
  ];

  const isFullscreen = () => document.fullscreenElement === readerFrame
    || readerFrame.classList.contains('fullscreen-fallback');

  const syncFromMain = () => {
    pairs.forEach(([mirrorSelector, mainSelector]) => {
      const mirror = app.querySelector(mirrorSelector);
      const main = app.querySelector(mainSelector);
      if (!mirror || !main) return;
      if (mirror.type === 'checkbox') mirror.checked = main.checked;
      else mirror.value = main.value;
      mirror.disabled = main.disabled;
    });
    const restore = app.querySelector('#fs-restore');
    const mainRestore = app.querySelector('#restore-english');
    if (restore && mainRestore) restore.disabled = mainRestore.disabled;
    const pause = app.querySelector('#fs-pause');
    if (pause) pause.disabled = !isReaderRunning();
    const start = app.querySelector('#fs-start');
    const mainStart = app.querySelector('#start-reader');
    if (start && mainStart) {
      start.disabled = mainStart.disabled;
      start.textContent = mainStart.textContent;
    }
  };

  const closeMarkDrawer=()=>{markDrawer.hidden=true;markToggle.setAttribute('aria-expanded','false');markToggle.classList.remove('active');readerFrame.classList.remove('fullscreen-mark-open');};
  const openMarkDrawer=()=>{closeMenu();strip.classList.remove('controls-hidden');readerFrame.classList.remove('fullscreen-controls-hidden');markDrawer.hidden=false;markToggle.setAttribute('aria-expanded','true');markToggle.classList.add('active');readerFrame.classList.add('fullscreen-mark-open');activateFullscreenMarkTab('selection');};
  const openMenu = () => {
    closeMarkDrawer();
    strip.classList.remove('controls-hidden');
    readerFrame.classList.remove('fullscreen-controls-hidden');
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.textContent = 'Options ▴';
    syncFromMain();
  };
  const closeMenu = () => {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = 'Options ▾';
  };

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (menu.hidden) openMenu();
    else closeMenu();
  });
  markToggle.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(markDrawer.hidden)openMarkDrawer();else closeMarkDrawer();});
  markClose.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();closeMarkDrawer();});
  app.querySelectorAll('[data-fs-mark-tab]').forEach(b=>b.addEventListener('click',()=>activateFullscreenMarkTab(b.dataset.fsMarkTab)));

  close.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    // X means "return to the regular Reader", never "hide the controls".
    // Delegate to the existing fullscreen button so its protected position/
    // playback snapshot and restore path remains the single source of truth.
    closeMenu();
    closeMarkDrawer();
    app.querySelector('#toggle-reader-fullscreen')?.click();
  });

  pairs.forEach(([mirrorSelector, mainSelector]) => {
    const mirror = app.querySelector(mirrorSelector);
    const main = app.querySelector(mainSelector);
    if (!mirror || !main) return;
    mirror.addEventListener('change', () => {
      if (main.type === 'checkbox') main.checked = mirror.checked;
      else main.value = mirror.value;
      main.dispatchEvent(new Event('change', { bubbles: true }));
      window.setTimeout(syncFromMain, 0);
    });
    main.addEventListener('change', syncFromMain);
  });

  const proxyClick = (mirrorSelector, mainSelector) => {
    app.querySelector(mirrorSelector)?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      app.querySelector(mainSelector)?.click();
      window.setTimeout(syncFromMain, 0);
    });
  };
  const fsMediaMatchSelect = app.querySelector('#fs-media-match-select');
  const mediaMatchSelect = app.querySelector('#media-match-select');
  if (fsMediaMatchSelect && mediaMatchSelect) {
    const syncFsMedia = () => { fsMediaMatchSelect.value = mediaMatchSelect.value; };
    syncFsMedia();
    fsMediaMatchSelect.addEventListener('change', () => {
      mediaMatchSelect.value = fsMediaMatchSelect.value;
      mediaMatchSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const mainButton = app.querySelector('#play-media-match');
      const fsButton = app.querySelector('#fs-media-match');
      if (mainButton && fsButton) fsButton.textContent = mainButton.textContent;
    });
    mediaMatchSelect.addEventListener('change', () => {
      syncFsMedia();
      const mainButton = app.querySelector('#play-media-match');
      const fsButton = app.querySelector('#fs-media-match');
      if (mainButton && fsButton) fsButton.textContent = mainButton.textContent;
    });
    const mainButton = app.querySelector('#play-media-match');
    const fsButton = app.querySelector('#fs-media-match');
    if (mainButton && fsButton) fsButton.textContent = mainButton.textContent;
  }

  proxyClick('#fs-start', '#start-reader');
  proxyClick('#fs-pause', '#pause-reader');
  proxyClick('#fs-reset', '#reset-reader');
  proxyClick('#fs-translate', '#translate-text');
  proxyClick('#fs-restore', '#restore-english');
  proxyClick('#fs-media-match', '#play-media-match');
  proxyClick('#fs-reading-mood', '#play-reading-mood');

  readerFrame.addEventListener('pointermove', (event) => {
    if (!isFullscreen() || !strip.classList.contains('controls-hidden')) return;
    const rect = readerFrame.getBoundingClientRect();
    const nearTopRight = event.clientX >= rect.right - 85 && event.clientY <= rect.top + 75;
    if (nearTopRight) {
      strip.classList.remove('controls-hidden');
      readerFrame.classList.remove('fullscreen-controls-hidden');
      requestAnimationFrame(refreshFocusAnchorFullscreenLayout);
    }
  });

  state.fullscreenOptionsKeyHandler = (event) => {
    if (!isFullscreen()) return;
    const key=event.key.toLowerCase(); if(key!=='o'&&key!=='m')return;
    event.preventDefault();strip.classList.remove('controls-hidden');readerFrame.classList.remove('fullscreen-controls-hidden');
    if(key==='o'){if(menu.hidden)openMenu();else closeMenu();}else{if(markDrawer.hidden)openMarkDrawer();else closeMarkDrawer();}
  };
  document.addEventListener('keydown', state.fullscreenOptionsKeyHandler);

  state.fullscreenOptionsChangeHandler = () => {
    if (document.fullscreenElement === readerFrame) {
      strip.classList.remove('controls-hidden');
      readerFrame.classList.remove('fullscreen-controls-hidden');
      closeMenu();
      closeMarkDrawer();
      syncFromMain();
      requestAnimationFrame(refreshFocusAnchorFullscreenLayout);
    } else if (!readerFrame.classList.contains('fullscreen-fallback')) {
      closeMenu();
      closeMarkDrawer();
      strip.classList.remove('controls-hidden');
      readerFrame.classList.remove('fullscreen-controls-hidden');
    }
  };
  document.addEventListener('fullscreenchange', state.fullscreenOptionsChangeHandler);

  state.fullscreenOptionsObserver = new MutationObserver(() => {
    if (!readerFrame.isConnected) {
      state.fullscreenOptionsObserver?.disconnect();
      state.fullscreenOptionsObserver = null;
      return;
    }
    if (readerFrame.classList.contains('fullscreen-fallback')) {
      strip.classList.remove('controls-hidden');
      readerFrame.classList.remove('fullscreen-controls-hidden');
      closeMenu();
      closeMarkDrawer();
      syncFromMain();
    }
  });
  state.fullscreenOptionsObserver.observe(readerFrame, { attributes: true, attributeFilter: ['class'] });

  closeMenu();
  closeMarkDrawer();
  syncBookPageControlsPlacement(readerFrame);
  syncFromMain();
}




function arrangeReaderSidePanels() {
  const wordPanel=app.querySelector('#word-panel'), toolbar=app.querySelector('.reader-toolbar'), media=app.querySelector('.reader-music-actions'), translation=app.querySelector('.translation-tools'), wordResult=app.querySelector('#word-result');
  if(!wordPanel||!toolbar)return;
  wordPanel.classList.add('reader-control-panel','mark-companion-panel');wordPanel.setAttribute('aria-label','Mark and reader tools');
  const shell=document.createElement('div');shell.className='reader-control-shell mark-shell';shell.innerHTML=`
    <div class="reader-control-header"><div><span>Reading companion</span><strong>Ask Mark</strong></div><button id="close-reader-controls" class="reader-panel-close" type="button" aria-label="Close right pane">×</button></div>
    <nav class="mark-tabs" aria-label="Reader tools and Mark tabs"><button type="button" data-mark-tab="tools" class="active">Reader Tools</button><button type="button" data-mark-tab="selection">Mark</button><button type="button" data-mark-tab="notebook">Notebook</button><button type="button" data-mark-tab="history">History</button></nav>
    <div id="mark-tools-panel" data-mark-panel="tools" class="mark-panel-view">
      <div id="reader-control-core" class="reader-control-section"></div>
      <details class="settings-panel reader-tool-settings-panel"><summary><span>Media</span><span class="settings-summary">Music &amp; focus</span></summary><div id="reader-control-media" class="settings-content reader-control-group-body"></div></details>
      <details class="settings-panel reader-tool-settings-panel"><summary><span>Translation &amp; Word Tools</span><span class="settings-summary">Translate &amp; define</span></summary><div id="reader-control-language" class="settings-content reader-control-group-body"></div></details>
    </div>
    <div id="mark-selection-panel" data-mark-panel="selection" class="mark-panel-view" hidden></div>
    <div id="mark-notebook-panel" data-mark-panel="notebook" class="mark-panel-view" hidden></div>
    <div id="mark-history-panel" data-mark-panel="history" class="mark-panel-view" hidden></div>`;
  wordPanel.replaceChildren(shell);shell.querySelector('#reader-control-core')?.appendChild(toolbar);if(media)shell.querySelector('#reader-control-media')?.appendChild(media);if(translation)shell.querySelector('#reader-control-language')?.appendChild(translation);if(wordResult)shell.querySelector('#reader-control-language')?.appendChild(wordResult);
  shell.querySelector('#close-reader-controls')?.addEventListener('click',()=>app.querySelector('#toggle-word-panel')?.click());
}
function bindReaderPaneControls() {
  const layout = app.querySelector('#reader-layout');
  const navigationButton = app.querySelector('#toggle-navigation-pane');
  const wordButton = app.querySelector('#toggle-word-panel');
  if (!layout || !navigationButton || !wordButton) return;

  const setPane = (pane, visible) => {
    const hiddenClass = pane === 'navigation' ? 'navigation-hidden' : 'word-panel-hidden';
    const button = pane === 'navigation' ? navigationButton : wordButton;
    layout.classList.toggle(hiddenClass, !visible);
    button.setAttribute('aria-pressed', String(visible));
    button.classList.toggle('pane-closed', !visible);
    const label = pane === 'navigation' ? 'marks and contents' : 'reader controls';
    button.title = `${visible ? 'Close' : 'Open'} ${label}`;
  };

  // Keep the reading canvas clean. The labeled side-panel buttons remain visible
  // so readers can discover Contents/Bookmarks and Reader Controls when needed.
  setPane('navigation', false);
  setPane('word', false);
  navigationButton.addEventListener('click', () => {
    const anchorIndex = state.bookPages ? Math.max(0, Number(state.index) || 0) : null;
    setPane('navigation', layout.classList.contains('navigation-hidden'));
    if (state.bookPages) scheduleBookPageReflow({ delay: 40, anchorIndex });
  });
  wordButton.addEventListener('click', () => {
    const anchorIndex = state.bookPages ? Math.max(0, Number(state.index) || 0) : null;
    const hidden = layout.classList.contains('word-panel-hidden');
    const toolsActive = app.querySelector('[data-mark-tab="tools"]')?.classList.contains('active');

    if (hidden) {
      setPane('word', true);
      activateMarkTab('tools');
    } else if (!toolsActive) {
      activateMarkTab('tools');
    } else {
      setPane('word', false);
    }

    const markButton = app.querySelector('#toggle-mark-panel');
    if (markButton) {
      markButton.setAttribute('aria-pressed', 'false');
      markButton.classList.toggle('pane-closed', layout.classList.contains('word-panel-hidden'));
    }
    if (state.bookPages) scheduleBookPageReflow({ delay: 40, anchorIndex });
  });
}

function bindReaderResize(readerFrame, reader) {
  const layout = app.querySelector('#reader-layout');
  const leftSplitter = app.querySelector('#left-pane-splitter');
  const rightSplitter = app.querySelector('#right-pane-splitter');
  if (!layout || !readerFrame || !reader) return;

  const savedLeft = Number(localStorage.getItem('msg-navigation-width'));
  const savedRight = Number(localStorage.getItem('msg-word-panel-width'));
  if (Number.isFinite(savedLeft)) layout.style.setProperty('--navigation-width', `${Math.max(260, Math.min(420, savedLeft))}px`);
  if (Number.isFinite(savedRight)) {
    const layoutWidth = Math.max(0, layout.getBoundingClientRect().width || 0);
    const rightMax = Math.max(480, Math.min(760, layoutWidth - 320));
    layout.style.setProperty('--word-panel-width', `${Math.max(320, Math.min(rightMax, savedRight))}px`);
  }

  const bindSplitter = (splitter, side) => {
    if (!splitter) return;
    let startX = 0;
    let startWidth = 0;
    let resizeAnchorIndex = null;
    const pane = side === 'left' ? app.querySelector('#navigation-pane') : app.querySelector('#word-panel');
    const property = side === 'left' ? '--navigation-width' : '--word-panel-width';
    const storageKey = side === 'left' ? 'msg-navigation-width' : 'msg-word-panel-width';

    const move = (event) => {
      const delta = event.clientX - startX;
      const next = side === 'left' ? startWidth + delta : startWidth - delta;
      const layoutWidth = Math.max(0, layout.getBoundingClientRect().width || 0);
      const rightMax = Math.max(480, Math.min(760, layoutWidth - 320));
      const width = Math.max(
        side === 'left' ? 260 : 320,
        Math.min(side === 'left' ? 420 : rightMax, next)
      );
      layout.style.setProperty(property, `${width}px`);
      localStorage.setItem(storageKey, String(Math.round(width)));
    };
    const stop = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', stop);
      document.body.classList.remove('resizing-reader-panes');
      if (state.bookPages && Number.isFinite(Number(resizeAnchorIndex))) {
        scheduleBookPageReflow({ delay: 30, anchorIndex: resizeAnchorIndex });
      }
      resizeAnchorIndex = null;
    };
    splitter.addEventListener('pointerdown', (event) => {
      if (!pane || layout.classList.contains(side === 'left' ? 'navigation-hidden' : 'word-panel-hidden')) return;
      startX = event.clientX;
      startWidth = pane.getBoundingClientRect().width;
      resizeAnchorIndex = state.bookPages ? Math.max(0, Number(state.index) || 0) : null;
      splitter.setPointerCapture?.(event.pointerId);
      document.body.classList.add('resizing-reader-panes');
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', stop, { once: true });
      event.preventDefault();
    });
    splitter.addEventListener('dblclick', () => {
      layout.style.removeProperty(property);
      localStorage.removeItem(storageKey);
    });
  };

  bindSplitter(leftSplitter, 'left');
  bindSplitter(rightSplitter, 'right');
}
let pendingBookPageAnchorIndex = null;
let bookPageReflowTimer = null;

function restoreBookPageWordAnchor(anchorIndex) {
  const reader = app.querySelector('#reader');
  if (!reader || !state.bookPages || !state.words.length) return;

  const safeIndex = Math.max(0, Math.min(state.words.length - 1, Number(anchorIndex) || 0));
  const mode = state.renderedMode || getSelectedMode();
  const groupSize = Number(app.querySelector('#word-count')?.value) || 1;

  // The word index is canonical. Page/spread numbers are only a consequence of
  // the current viewport dimensions and must be recalculated after every reflow.
  state.index = safeIndex;
  ensureWordsRendered(reader, mode, groupSize, Math.min(state.words.length, safeIndex + 250));
  applyBookPageMetrics(reader);

  const spread = bookSpreadForWordIndex(reader, safeIndex);
  if (spread != null) {
    goToBookSpread(spread, {
      behavior: 'auto',
      ensureRendered: true,
      syncReaderPosition: false
    });
    // Do not let page navigation rewrite the preserved logical position.
    state.index = safeIndex;
    state.bookSpreadIndex = spread;
    updateBookPageStatus(spread);
  } else {
    updateBookPageStatus();
  }
}

function scheduleBookPageReflow({ delay = 0, anchorIndex = null } = {}) {
  if (!state.bookPages) return;

  // Capture once before a layout mutation when possible. ResizeObserver may fire
  // multiple times while panes animate/change width, so retain the same anchor
  // until the final geometry has settled.
  const requestedAnchor = Number(anchorIndex);
  if (Number.isFinite(requestedAnchor)) {
    pendingBookPageAnchorIndex = requestedAnchor;
  } else if (!Number.isFinite(Number(pendingBookPageAnchorIndex))) {
    pendingBookPageAnchorIndex = Math.max(0, Number(state.index) || 0);
  }

  window.clearTimeout(bookPageReflowTimer);
  bookPageReflowTimer = window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!state.bookPages) {
          pendingBookPageAnchorIndex = null;
          return;
        }
        const preservedWord = Math.max(
          0,
          Number.isFinite(Number(pendingBookPageAnchorIndex))
            ? Number(pendingBookPageAnchorIndex)
            : Number(state.index) || 0
        );
        restoreBookPageWordAnchor(preservedWord);
        pendingBookPageAnchorIndex = null;
        persistReaderSession();
      });
    });
  }, delay);
}

function bindReaderFullscreen(readerFrame, button) {
  if (!readerFrame || !button) return;

  // Loading another book rebuilds the Reader. Remove document-level listeners
  // from the previous Reader instance so detached frames cannot alter the
  // current global reading position during later fullscreen transitions.
  if (state.fullscreenChangeHandler) {
    document.removeEventListener('fullscreenchange', state.fullscreenChangeHandler);
  }
  if (state.fullscreenKeyHandler) {
    document.removeEventListener('keydown', state.fullscreenKeyHandler);
  }

  const label = button.querySelector('.fullscreen-label');
  const icon = button.querySelector('.fullscreen-icon');
  let transitionSnapshot = null;
  let transitionOwnedByButton = false;
  let restoreSequence = 0;

  const isViewerFullscreen = () => document.fullscreenElement === readerFrame
    || readerFrame.classList.contains('fullscreen-fallback');

  const updateButton = () => {
    const active = isViewerFullscreen();
    button.setAttribute('aria-label', active ? 'Exit text viewer fullscreen' : 'Enter text viewer fullscreen');
    button.title = active ? 'Minimize text viewer' : 'Full screen text viewer';
    if (label) label.textContent = active ? 'Minimize' : 'Full screen';
    if (icon) icon.textContent = active ? '🗗' : '⛶';
  };

  const positionPointerAtWord = (wordIndex) => {
    const reader = app.querySelector('#reader');
    const mode = state.renderedMode || getSelectedMode();
    if (!reader || mode !== 'pointing-guide') return;

    const count = Math.max(1, Number(app.querySelector('#word-count')?.value) || 1);
    ensureWordsRendered(
      reader,
      mode,
      count,
      Math.min(state.words.length, Number(wordIndex) + 1000)
    );

    const step = getPointingLineStep(reader, Number(wordIndex), count);
    if (!step) return;

    scrollPointingStep(reader, step);
    requestAnimationFrame(() => {
      const refreshed = getPointingLineStep(reader, Number(wordIndex), Math.max(1, step.nextIndex - Number(wordIndex)));
      if (refreshed) moveReadingGuide(reader, refreshed, 0);
    });
  };

  const restoreAfterFullscreenLayout = (snapshot) => {
    if (!snapshot) return;
    const sequence = ++restoreSequence;
    const anchorIndex = Math.max(
      0,
      Math.min(Math.max(0, state.words.length - 1), Number(snapshot.anchorIndex) || 0)
    );

    state.index = anchorIndex;

    // Fullscreen changes only the frame dimensions; the reader DOM stays intact.
    // Restore on the next paint instead of blocking the browser with a fixed
    // settling delay, a full session serialization, or an eager virtual rebuild.
    requestAnimationFrame(() => {
      if (sequence !== restoreSequence) return;
      const reader = app.querySelector('#reader');
      if (!reader) return;

      const mode = state.renderedMode || getSelectedMode();
      const groupSize = Math.max(1, Number(app.querySelector('#word-count')?.value) || 1);
      state.index = anchorIndex;

      restoreReadingAnchor(reader, mode, groupSize, anchorIndex);

      if (state.bookPages) {
        const spread = bookSpreadForWordIndex(reader, anchorIndex);
        if (spread != null) {
          goToBookSpread(spread, {
            behavior: 'auto',
            ensureRendered: false,
            syncReaderPosition: false
          });
        }
      }

      state.index = anchorIndex;
      positionPointerAtWord(anchorIndex);
      updateReaderStatus();

      const start = app.querySelector('#start-reader');
      const pause = app.querySelector('#pause-reader');
      if (start) {
        start.disabled = false;
        start.textContent = anchorIndex ? 'Resume' : 'Start';
      }
      if (pause) pause.disabled = true;

      // Use the normal debounced save. Immediate persistence serializes the
      // complete book and can freeze the main thread during fullscreen entry.
      persistReaderSession();

      if (snapshot.wasRunning && mode !== 'two-column') {
        requestAnimationFrame(() => {
          if (sequence !== restoreSequence) return;
          state.index = anchorIndex;
          startReader();
        });
      }

      // Only rebuild a missing virtual window during idle time. In normal
      // fullscreen transitions the anchor remains rendered, so this does no work.
      if (!state.bookPages
          && !['flash', 'digital-sign', 'two-column'].includes(mode)
          && state.virtualized
          && (anchorIndex < state.renderedWordStart || anchorIndex >= state.renderedWordEnd)) {
        const recover = () => {
          if (sequence !== restoreSequence || !reader.isConnected) return;
          virtualRenderer.renderWindowAround(reader, mode, groupSize, anchorIndex);
          restoreReadingAnchor(reader, mode, groupSize, anchorIndex);
          positionPointerAtWord(anchorIndex);
        };
        if ('requestIdleCallback' in window) window.requestIdleCallback(recover, { timeout: 180 });
        else window.setTimeout(recover, 0);
      }
    });
  };

  const enterFullscreen = async () => {
    if (readerFrame.requestFullscreen) {
      try {
        await readerFrame.requestFullscreen();
        return;
      } catch (error) {
        console.warn('Browser fullscreen was unavailable; using expanded viewer mode.', error);
      }
    }
    readerFrame.classList.add('fullscreen-fallback');
    document.body.classList.add('viewer-fullscreen-open');
    updateButton();
    requestAnimationFrame(refreshFocusAnchorFullscreenLayout);
  };

  const exitFullscreen = async () => {
    if (document.fullscreenElement === readerFrame && document.exitFullscreen) {
      await document.exitFullscreen();
      return;
    }
    readerFrame.classList.remove('fullscreen-fallback');
    document.body.classList.remove('viewer-fullscreen-open');
    updateButton();
    requestAnimationFrame(refreshFocusAnchorFullscreenLayout);
  };

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    transitionOwnedByButton = true;
    transitionSnapshot = captureReaderLocation();
    const anchorIndex = transitionSnapshot.anchorIndex;

    stopReader();
    state.index = anchorIndex;

    if (isViewerFullscreen()) await exitFullscreen();
    else await enterFullscreen();

    if (state.bookPages) {
      scheduleBookPageReflow({ delay: 70, anchorIndex });
    }

    restoreAfterFullscreenLayout(transitionSnapshot);
    transitionSnapshot = null;
    transitionOwnedByButton = false;
  });

  state.fullscreenChangeHandler = () => {
    // Ignore events belonging to an explicit button transition; the button
    // owns its already-captured snapshot and performs exactly one restore.
    if (transitionOwnedByButton) {
      updateButton();
      return;
    }

    // This path covers browser-controlled exits such as Escape. state.index is
    // the canonical timed-reader position and does not depend on DOM geometry.
    const snapshot = {
      anchorIndex: Math.max(0, Number(state.index) || 0),
      wasRunning: isReaderRunning()
    };

    stopReader();
    state.index = snapshot.anchorIndex;

    if (document.fullscreenElement !== readerFrame) {
      readerFrame.classList.remove('fullscreen-fallback');
      document.body.classList.remove('viewer-fullscreen-open');
    }

    updateButton();

    if (state.bookPages) {
      scheduleBookPageReflow({ delay: 60, anchorIndex: snapshot.anchorIndex });
    }

    restoreAfterFullscreenLayout(snapshot);
  };

  state.fullscreenKeyHandler = (event) => {
    if (event.key === 'Escape' && readerFrame.classList.contains('fullscreen-fallback')) {
      const snapshot = captureReaderLocation();
      stopReader();
      state.index = snapshot.anchorIndex;
      exitFullscreen().then(() => restoreAfterFullscreenLayout(snapshot));
    }
  };

  document.addEventListener('fullscreenchange', state.fullscreenChangeHandler);
  document.addEventListener('keydown', state.fullscreenKeyHandler);

  updateButton();
}
function getBookPageMetrics(reader) {
  const styles = window.getComputedStyle(reader);
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
  const columnGap = Number.parseFloat(styles.columnGap) || 0;
  const viewportWidth = Math.max(1, reader.clientWidth - paddingLeft - paddingRight);
  const pageWidth = Math.max(1, (viewportWidth - columnGap) / 2);
  const pagePitch = pageWidth + columnGap;
  const spreadWidth = pagePitch * 2;
  return { paddingLeft, paddingRight, columnGap, viewportWidth, pageWidth, pagePitch, spreadWidth };
}

function applyBookPageMetrics(reader) {
  if (!reader || !state.bookPages) return getBookPageMetrics(reader);
  const metrics = getBookPageMetrics(reader);
  reader.style.setProperty('--book-page-width', `${metrics.pageWidth}px`);
  reader.style.setProperty('--book-spread-width', `${metrics.spreadWidth}px`);
  return metrics;
}

function getBookSpreadWidth(reader) {
  return applyBookPageMetrics(reader).spreadWidth;
}

function getBookSpreadCount(reader) {
  const metrics = applyBookPageMetrics(reader);
  // scrollWidth includes the reader padding. Subtract it before counting the
  // exact two-page spread strides created by the fixed column width.
  const laidOutWidth = Math.max(metrics.viewportWidth, reader.scrollWidth - metrics.paddingLeft - metrics.paddingRight);
  return Math.max(1, Math.ceil((laidOutWidth - metrics.viewportWidth) / metrics.spreadWidth) + 1);
}

function getEstimatedBookPageCount(reader) {
  const renderedWords = Math.max(1, state.renderedWordEnd || 0);
  const renderedPages = Math.max(2, getBookSpreadCount(reader) * 2);
  const wordsPerPage = Math.max(1, renderedWords / renderedPages);
  return Math.max(renderedPages, Math.ceil(state.words.length / wordsPerPage));
}

function getCurrentBookSpread(reader) {
  // Book Pages uses one logical spread index everywhere (buttons, wheel,
  // highlighter, TOC and fullscreen).  Do not infer it from scrollLeft during
  // animations/reflow because that creates off-by-one and multi-spread jumps.
  if (Number.isInteger(state.bookSpreadIndex) && state.bookSpreadIndex >= 0) {
    return state.bookSpreadIndex;
  }
  const spreadWidth = getBookSpreadWidth(reader);
  state.bookSpreadIndex = Math.max(0, Math.round(reader.scrollLeft / spreadWidth));
  return state.bookSpreadIndex;
}

function firstReadingIndexInVisibleBookSpread(reader) {
  if (!reader) return Math.max(0, state.index || 0);
  const readerRect = reader.getBoundingClientRect();
  let firstIndex = Number.POSITIVE_INFINITY;

  for (const group of reader.querySelectorAll('.reader-group[data-start-index]')) {
    const rect = group.getBoundingClientRect();
    if (rect.right <= readerRect.left + 1 || rect.left >= readerRect.right - 1) continue;
    const index = Number(group.dataset.visibleStartIndex ?? group.dataset.startIndex);
    if (Number.isFinite(index)) firstIndex = Math.min(firstIndex, index);
  }

  if (!Number.isFinite(firstIndex)) {
    for (const word of reader.querySelectorAll('.reader-word[data-index]')) {
      const rect = word.getBoundingClientRect();
      if (rect.right <= readerRect.left + 1 || rect.left >= readerRect.right - 1) continue;
      const index = Number(word.dataset.index);
      if (Number.isFinite(index)) firstIndex = Math.min(firstIndex, index);
    }
  }

  return Number.isFinite(firstIndex) ? firstIndex : Math.max(0, state.index || 0);
}

function syncReaderToVisibleBookSpread(reader) {
  const nextIndex = firstReadingIndexInVisibleBookSpread(reader);
  state.index = Math.max(0, Math.min(state.words.length - 1, nextIndex));
  for (const active of state.activeElements || []) {
    active.classList.remove('active-group', 'active-bold-group');
  }
  state.activeElements = [];
  updateReaderStatus();
}

function goToBookSpread(targetSpread, { behavior = 'smooth', ensureRendered = true, syncReaderPosition = false } = {}) {
  const reader = app.querySelector('#reader');
  if (!reader || !state.bookPages) return;

  applyBookPageMetrics(reader);
  let target = Math.max(0, Math.trunc(Number(targetSpread) || 0));

  if (ensureRendered && target >= getBookSpreadCount(reader) - 1 && state.renderedWordEnd < state.words.length) {
    ensureWordsRendered(
      reader,
      state.renderedMode || getSelectedMode(),
      state.renderedGroupSize || 1,
      Math.min(state.words.length, state.renderedWordEnd + 800)
    );
    applyBookPageMetrics(reader);
  }

  const maxSpread = Math.max(0, getBookSpreadCount(reader) - 1);
  target = Math.min(target, maxSpread);
  state.bookSpreadIndex = target;

  // Book Pages has one canonical horizontal position. The highlighter never
  // nudges the viewport within a spread; it only requests an exact spread.
  reader.scrollTop = 0;
  const exactLeft = target * getBookSpreadWidth(reader);
  reader.scrollTo({ left: exactLeft, top: 0, behavior: 'auto' });

  // A manual page turn must move the logical reading position as well as the
  // viewport. Otherwise the running highlighter immediately snaps the reader
  // back to the old (later) spread, making Previous and wheel-down appear to
  // move forward.
  if (syncReaderPosition) syncReaderToVisibleBookSpread(reader);
  updateBookPageStatus(target);
}

function updateBookPageStatus(forcedSpread = null) {
  const reader = app.querySelector('#reader');
  const status = app.querySelector('#book-page-status');
  if (!reader || !status || !state.bookPages) return;

  const spreadCount = getBookSpreadCount(reader);
  const spreadIndex = Math.min(
    spreadCount - 1,
    Math.max(0, forcedSpread == null ? getCurrentBookSpread(reader) : forcedSpread)
  );
  state.bookSpreadIndex = spreadIndex;

  const firstPage = spreadIndex * 2 + 1;
  const totalPages = getEstimatedBookPageCount(reader);
  const lastPage = Math.min(totalPages, firstPage + 1);
  status.textContent = firstPage === lastPage
    ? `Page ${firstPage}`
    : `Pages ${firstPage}–${lastPage}`;

  const pageInput = app.querySelector('#book-page-input');
  const pageTotal = app.querySelector('#book-page-total');
  if (pageInput) {
    pageInput.max = String(totalPages);
    if (document.activeElement !== pageInput) pageInput.value = String(firstPage);
  }
  if (pageTotal) pageTotal.textContent = `of ${totalPages}`;

  const previous = app.querySelector('#book-page-prev');
  const next = app.querySelector('#book-page-next');
  if (previous) previous.disabled = spreadIndex <= 0;
  if (next) next.disabled = firstPage >= totalPages;
  updateReaderBookmarkMarkers();
}

function updateBookPageControls() {
  syncBookPageControlsPlacement();
  const controls = app.querySelector('#book-page-controls');
  const reader = app.querySelector('#reader');
  if (!controls || !reader) return;
  const enabled = state.bookPages && modeSupportsBookPages(getSelectedMode());
  controls.hidden = !enabled;
  reader.classList.toggle('book-pages-layout', enabled);
  if (enabled) {
    state.bookSpreadIndex = Math.max(0, Number(state.bookSpreadIndex) || 0);
    window.requestAnimationFrame(() => {
      applyBookPageMetrics(reader);
      goToBookSpread(state.bookSpreadIndex, { behavior: 'auto', ensureRendered: false });
    });
  } else {
    state.bookSpreadIndex = 0;
    reader.scrollLeft = 0;
    reader.scrollTop = 0;
    reader.style.removeProperty('--book-page-width');
    reader.style.removeProperty('--book-spread-width');
  }
}

function turnBookPages(direction) {
  const reader = app.querySelector('#reader');
  if (!reader || !state.bookPages) return;

  const step = Math.sign(direction || 1);
  const currentSpread = getCurrentBookSpread(reader);
  const targetSpread = Math.max(0, currentSpread + step);

  // A running reading tick can fire during a manual page turn and immediately
  // send the viewport back to the active word. Temporarily stop that tick,
  // move the spread, then derive the new logical word position only after the
  // browser has committed the new column geometry.
  const wasRunning = Boolean(state.interval);
  if (wasRunning) {
    state.runToken += 1;
    window.clearTimeout(state.interval);
    state.interval = null;
    state.nextTickAt = 0;
  }

  goToBookSpread(targetSpread, {
    behavior: 'auto',
    ensureRendered: true,
    syncReaderPosition: false
  });

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      // Reassert the exact spread after any reflow caused by rendering.
      state.bookSpreadIndex = targetSpread;
      reader.scrollTop = 0;
      reader.scrollLeft = targetSpread * getBookSpreadWidth(reader);
      syncReaderToVisibleBookSpread(reader);
      updateBookPageStatus(targetSpread);
      if (wasRunning) startReader();
    });
  });
}


function updatePointerStyleVisibility(mode = getSelectedMode()) {
  const visible = mode === 'pointing-guide';
  app.querySelectorAll('.pointer-style-control').forEach((control) => {
    control.hidden = !visible;
  });
  app.querySelectorAll('#pointer-style, #fs-pointer-style').forEach((select) => {
    const wrapper = select.closest('label, .control');
    if (wrapper) wrapper.hidden = !visible;
  });
}
function updateModeControls(mode) {
  updatePointerStyleVisibility(mode);
  const countInput = app.querySelector('#word-count');
  const speedInput = app.querySelector('#speed');
  const start = app.querySelector('#start-reader');
  const pause = app.querySelector('#pause-reader');
  const staticMode = mode === 'two-column';
  const countUnused = mode === 'digital-sign' || mode === 'two-column' || mode === 'auto-scroll' || mode === 'pacman';
  const meaningfulInput = app.querySelector('#meaningful-chunks');
  const meaningfulSupported = modeSupportsMeaningfulChunks(mode);
  const bookPagesInput = app.querySelector('#book-pages');
  const bookPagesSupported = modeSupportsBookPages(mode);
  const focusAnchorInput = app.querySelector('#focus-anchor');
  const focusAnchorSupported = modeSupportsFocusAnchorOverlay(mode);
  if (bookPagesInput) {
    bookPagesInput.disabled = !bookPagesSupported;
    if (!bookPagesSupported && bookPagesInput.checked) {
      bookPagesInput.checked = false;
      state.bookPages = false;
    }
    bookPagesInput.title = bookPagesSupported
      ? 'Show the full text as two facing book pages.'
      : 'Book pages is available for full-text guided modes.';
  }
  updateBookPageControls();

  if (focusAnchorInput) {
    focusAnchorInput.disabled = !focusAnchorSupported;
    focusAnchorInput.title = focusAnchorSupported
      ? (mode === 'flash'
        ? 'Hold the optimal recognition letter at the center of the reader.'
        : 'Show the current guided word or phrase in a centered overlay while this mode continues below.')
      : 'The focus anchor overlay is available in Flash and timed guided modes.';
  }

  if (meaningfulInput) {
    meaningfulInput.disabled = !meaningfulSupported;
    meaningfulInput.title = meaningfulSupported
      ? 'Uses punctuation and common phrase boundaries. Words shown becomes the maximum chunk size.'
      : (mode === 'pacman'
        ? 'Pac-Man consumes one word at a time, character by character.'
        : 'Meaningful chunks is not used in this continuous or self-paced mode.');
  }

  if (countInput) {
    countInput.disabled = countUnused;
    countInput.title = countUnused
      ? 'Words shown is not used in this continuous reading mode.'
      : '';
  }
  if (speedInput) {
    speedInput.disabled = staticMode;
    speedInput.title = staticMode ? 'Two Columns is intended for self-paced reading.' : '';
  }
  if (start) {
    start.disabled = staticMode;
    start.textContent = staticMode ? 'Self-paced' : 'Start';
  }
  if (pause) pause.disabled = true;
}

function appendStaticWords(container, words, startIndex = 0) {
  // Plain English text can be rendered as one text node, which keeps very large
  // books responsive. Retain its global start index so pointer-based word
  // actions can still resolve an exact word without materializing every span.
  container.dataset.staticStartIndex = String(Math.max(0, Number(startIndex) || 0));
  if (!state.bionic && state.language === 'en') {
    container.textContent = words.join(' ');
    return;
  }

  const fragment = document.createDocumentFragment();
  words.forEach((word, offset) => {
    const span = createWordSpan(word, startIndex + offset);
    fragment.appendChild(span);
    if (offset < words.length - 1) fragment.appendChild(document.createTextNode(' '));
  });
  container.appendChild(fragment);
}

function renderTwoColumnDocument(reader) {
  reader.replaceChildren();
  const grid = document.createElement('div');
  grid.className = 'two-column-grid';
  const left = document.createElement('div');
  const right = document.createElement('div');
  left.className = 'reading-column';
  right.className = 'reading-column';
  const midpoint = Math.ceil(state.words.length / 2);
  appendStaticWords(left, state.words.slice(0, midpoint), 0);
  appendStaticWords(right, state.words.slice(midpoint), midpoint);
  grid.append(left, right);
  reader.appendChild(grid);
  state.wordElements = state.bionic || state.language !== 'en'
    ? Array.from(reader.querySelectorAll('.reader-word'))
    : [];
  state.groupElements = [];
  state.activeElements = [];
  state.renderedWordEnd = state.words.length;
}



function currentCompanionIdentity() {
  const live = window.MSGCompanion?.config;
  if (live?.id) return live;
  let selected = 'mark';
  try { selected = localStorage.getItem('msg_companion_persona_v2') || localStorage.getItem('msg_companion_persona_v1') || 'mark'; } catch {}
  return selected === 'beth'
    ? { id:'beth', name:'Beth', ask:'Ask Beth', avatar:'/assets/companions/beth/beth-avatar.png' }
    : { id:'mark', name:'Mark', ask:'Ask Mark', avatar:'/assets/ask-mark/ask-mark-avatar.png' };
}

function dictionaryResultMarkup(word, definition, partOfSpeech = '', example = '', saved = false) {
  return `
    <div class="mark-response-heading"><span>${escapeHtml(currentCompanionIdentity().ask)}</span><strong>Word lookup</strong></div>
    <h2>${escapeHtml(word)}</h2>
    ${partOfSpeech ? `<p class="dictionary-part">${escapeHtml(partOfSpeech)}</p>` : ''}
    <p class="word-meaning">${escapeHtml(definition)}</p>
    ${example ? `<p class="dictionary-example">“${escapeHtml(example)}”</p>` : ''}
    ${saved ? '<p class="dictionary-saved-note">Saved under Saved definitions.</p>' : ''}`;
}

function showDictionaryResult(word, definition, partOfSpeech = '', example = '', saved = false, target = 'tools') {
  if (target === 'mark') {
    openMarkPanel('selection');
    renderMarkSelectionCard();
    const panel = app.querySelector('#mark-response');
    if (!panel) return;
    panel.hidden = false;
    panel.innerHTML = dictionaryResultMarkup(word, definition, partOfSpeech, example, saved);
    notifyAskMarkLegacyUpdated('response');
    return;
  }
  const panel = app.querySelector('#word-result');
  if (!panel) return;
  panel.innerHTML = dictionaryResultMarkup(word, definition, partOfSpeech, example, saved);
}

async function lookupDictionaryWord(word) {
  const normalized = normalizeLookupWord(word);
  if (!normalized) throw new Error('Select a word containing letters.');
  if (state.dictionaryCache.has(normalized)) return state.dictionaryCache.get(normalized);
  const payload = await loadApiPayload(`/api/dictionary/${encodeURIComponent(normalized)}`);
  state.dictionaryCache.set(normalized, payload);
  return payload;
}

function openWordPanelForDictionary() {
  const layout = app.querySelector('#reader-layout');
  const button = app.querySelector('#toggle-word-panel');
  if (!layout) return;
  layout.classList.remove('word-panel-hidden');
  if (button) {
    button.setAttribute('aria-pressed', 'true');
    button.classList.remove('pane-closed');
    button.title = 'Close right pane';
  }
}

async function performDictionaryLookup(saveAfter = false, target = 'tools', contextOverride = null) {
  const context = contextOverride || state.contextWord;
  if (!context) return;
  if (target === 'mark') {
    console.info('[RC-DIAG 3] Ask Mark lookup dispatched', { word: context.word, index: context.index, appConnected: app.isConnected, markResponsePresentBeforeOpen: !!app.querySelector('#mark-response') });
  }

  if (target === 'mark') {
    openMarkPanel('selection');
    renderMarkSelectionCard();
    const markPanel = app.querySelector('#mark-response');
    if (markPanel) {
      markPanel.hidden = false;
      markPanel.innerHTML = `<div class="mark-response-heading"><span>${escapeHtml(currentCompanionIdentity().ask)}</span><strong>Word lookup</strong></div><h2>${escapeHtml(context.word)}</h2><p class="status">Looking up definition…</p>`;
      notifyAskMarkLegacyUpdated('response');
    }
  } else {
    openWordPanelForDictionary();
    const toolsPanel = app.querySelector('#word-result');
    if (toolsPanel) toolsPanel.innerHTML = `<h2>${escapeHtml(context.word)}</h2><p class="status">Looking up definition…</p>`;
  }

  try {
    const result = await lookupDictionaryWord(context.word);
    showDictionaryResult(result.word, result.definition, result.partOfSpeech, result.example, false, target);
    if (target === 'mark') {
      const responseNode = app.querySelector('#mark-response');
      console.info('[RC-DIAG 3R] dictionary result written', { word: result.word, responsePresent: !!responseNode, responseConnected: !!responseNode?.isConnected, responseHidden: responseNode?.hidden, responseLength: responseNode?.textContent?.trim()?.length || 0 });
    }
    if (saveAfter) saveCurrentDefinition(result, context, target);
  } catch (error) {
    const panel = target === 'mark' ? app.querySelector('#mark-response') : app.querySelector('#word-result');
    if (panel) {
      panel.hidden = false;
      panel.innerHTML = `<div class="mark-response-heading"><span>${escapeHtml(currentCompanionIdentity().ask)}</span><strong>Word lookup</strong></div><h2>${escapeHtml(context.word)}</h2><p class="status error">${escapeHtml(error.message)}</p>`;
      notifyAskMarkLegacyUpdated('response');
    }
  }
}

function saveCurrentDefinition(result, contextOverride = null, target = 'tools') {
  const context = contextOverride || state.contextWord;
  if (!context || !state.documentId) return;
  const items = getSavedDefinitions();
  const existing = items.find((item) => item.documentId === state.documentId && Number(item.wordIndex) === context.index);
  const item = {
    id: existing?.id || `definition-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    documentId: state.documentId,
    title: state.title,
    word: result.word || normalizeLookupWord(context.word),
    definition: result.definition,
    partOfSpeech: result.partOfSpeech || '',
    example: result.example || '',
    wordIndex: context.index,
    createdAt: existing?.createdAt || new Date().toISOString(),
    reviewCount: existing?.reviewCount || 0,
    mastery: existing?.mastery || 'learning',
    intervalDays: existing?.intervalDays || 0,
    nextReviewAt: existing?.nextReviewAt || new Date().toISOString(),
    lastReviewedAt: existing?.lastReviewedAt || null,
    lastRating: existing?.lastRating || null
  };
  const updated = [item, ...items.filter((entry) => entry.id !== item.id)];
  saveDefinitions(updated);
  context.element?.classList?.add('saved-definition-word');
  app.querySelector(`.reader-word[data-index="${item.wordIndex}"]`)?.classList.add('saved-definition-word');
  renderNavigationPane();
  showDictionaryResult(item.word, item.definition, item.partOfSpeech, item.example, true, target);
}


const READER_BOOKMARKS_KEY = 'markSetGoReaderPageBookmarksV1';

function getReaderBookmarks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(READER_BOOKMARKS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveReaderBookmarks(items) {
  try {
    localStorage.setItem(READER_BOOKMARKS_KEY, JSON.stringify(items));
  } catch (_) {}
}

function bookmarkPageForWord(wordElement) {
  const reader = app.querySelector('#reader');
  if (!reader || !wordElement) return { pageNumber: 1, pageKey: 'page-1', side: 'single' };

  if (state.bookPages) {
    const spreadIndex = getCurrentBookSpread(reader);
    const readerRect = reader.getBoundingClientRect();
    const wordRect = wordElement.getBoundingClientRect();
    const midpoint = readerRect.left + (readerRect.width / 2);
    const side = wordRect.left >= midpoint ? 'right' : 'left';
    const pageNumber = spreadIndex * 2 + (side === 'right' ? 2 : 1);
    return { pageNumber, pageKey: `book-page-${pageNumber}`, side };
  }

  const viewportHeight = Math.max(1, reader.clientHeight);
  // Resolve the word's absolute position inside the scrollable reader exactly once.
  // offsetTop may be relative to a nested reading group, while adding scrollTop to
  // an already content-relative offset can double-count the current scroll position.
  const readerRect = reader.getBoundingClientRect();
  const wordRect = wordElement.getBoundingClientRect();
  const absoluteTop = Math.max(0, (wordRect.top - readerRect.top) + reader.scrollTop);
  const pageNumber = Math.max(1, Math.floor(absoluteTop / viewportHeight) + 1);
  return { pageNumber, pageKey: `scroll-page-${pageNumber}`, side: 'single' };
}

function bookmarkForContextWord(contextOverride = null) {
  const context = contextOverride || state.contextWord;
  if (!context || !state.documentId) return null;

  // Right-click bookmarks belong to an exact logical word, not to a computed
  // scroll page. Virtualized large texts can change spacer/page geometry while
  // the word index remains permanently stable.
  const wordIndex = Math.max(0, Number(context.index) || 0);
  return getReaderBookmarks().find((item) =>
    item.documentId === state.documentId
    && Number(item.wordIndex) === wordIndex
  ) || null;
}

function toggleBookmarkForContextWord(contextOverride = null) {
  const context = contextOverride || state.contextWord;
  if (!context || !state.documentId) return false;

  const wordIndex = Math.max(0, Number(context.index) || 0);
  const page = context.page || bookmarkPageForWord(context.element);
  const items = getReaderBookmarks();
  const existing = items.find((item) =>
    item.documentId === state.documentId
    && Number(item.wordIndex) === wordIndex
  );

  if (existing) {
    saveReaderBookmarks(items.filter((item) => item.id !== existing.id));
    updateReaderStatus?.(`Bookmark removed at word ${(wordIndex + 1).toLocaleString()}.`);
  } else {
    items.push({
      id: `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      documentId: state.documentId,
      title: state.title,
      wordIndex,
      // Page metadata is retained only as a display hint. The bookmark's real
      // identity and restore location are the stable word index.
      pageNumber: page.pageNumber,
      pageKey: page.pageKey,
      side: page.side,
      createdAt: new Date().toISOString()
    });
    saveReaderBookmarks(items);
    updateReaderStatus?.(`Bookmark added at word ${(wordIndex + 1).toLocaleString()}.`);
  }

  updateReaderBookmarkMarkers();
  renderNavigationPane();
  return true;
}

function removeReaderBookmark(id) {
  saveReaderBookmarks(getReaderBookmarks().filter((item) => item.id !== id));
  updateReaderBookmarkMarkers();
  renderNavigationPane();
  updateReaderStatus?.('Bookmark removed.');
}

function visibleReaderBookmarkPages() {
  const reader = app.querySelector('#reader');
  if (!reader) return [];
  if (state.bookPages) {
    const spread = getCurrentBookSpread(reader);
    return [spread * 2 + 1, spread * 2 + 2];
  }
  const pageNumber = Math.max(1, Math.floor(reader.scrollTop / Math.max(1, reader.clientHeight)) + 1);
  return [pageNumber];
}

function visibleBookmarkWordIndexes(reader) {
  if (!reader) return new Set();
  const readerRect = reader.getBoundingClientRect();
  const visible = new Set();

  reader.querySelectorAll('.reader-word[data-index]').forEach((word) => {
    const rect = word.getBoundingClientRect();
    if (rect.bottom < readerRect.top || rect.top > readerRect.bottom) return;
    if (rect.right < readerRect.left || rect.left > readerRect.right) return;
    const index = Number(word.dataset.index);
    if (Number.isFinite(index)) visible.add(index);
  });

  return visible;
}

function updateReaderBookmarkMarkers() {
  const layer = app.querySelector('#reader-bookmark-layer');
  const reader = app.querySelector('#reader');
  if (!layer || !reader || !state.documentId) return;

  const all = getReaderBookmarks().filter((item) => item.documentId === state.documentId);
  let bookmarks = [];

  if (state.bookPages) {
    // Facing pages have stable physical page geometry, so retain the page-side
    // ribbon behavior there.
    const visiblePages = visibleReaderBookmarkPages();
    bookmarks = all.filter((item) => visiblePages.includes(Number(item.pageNumber)));
  } else {
    // Scrolling/virtualized readers must use live word visibility. Calculated
    // page numbers are not stable when virtual spacers move after TOC jumps.
    const visibleWordIndexes = visibleBookmarkWordIndexes(reader);
    bookmarks = all.filter((item) => visibleWordIndexes.has(Number(item.wordIndex)));
  }

  // A single top-edge marker is sufficient for a scrolling viewport; multiple
  // exact bookmarks still remain individually listed in Marks & Contents.
  if (!state.bookPages && bookmarks.length > 1) bookmarks = bookmarks.slice(0, 1);

  layer.innerHTML = bookmarks.map((item) => {
    const wordNumber = Math.max(1, Number(item.wordIndex) + 1);
    const sideClass = state.bookPages
      ? (Number(item.pageNumber) % 2 === 0 ? 'bookmark-right-page' : 'bookmark-left-page')
      : 'bookmark-single-page';
    return `<button type="button" class="reader-page-bookmark ${sideClass}" data-remove-reader-bookmark="${escapeHtml(item.id)}" title="Remove bookmark at word ${wordNumber.toLocaleString()}" aria-label="Remove bookmark at word ${wordNumber.toLocaleString()}"><span aria-hidden="true"></span></button>`;
  }).join('');

  layer.querySelectorAll('[data-remove-reader-bookmark]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeReaderBookmark(button.dataset.removeReaderBookmark);
    });
  });
}

function closeDictionaryMenu() {
  const menu = app.querySelector('#word-context-menu');
  if (menu) menu.hidden = true;
}

function bindDictionaryMenu(reader) {
  const menu = app.querySelector('#word-context-menu');
  if (!menu) return;

  const caretRangeAtPoint = (x, y) => {
    if (typeof document.caretRangeFromPoint === 'function') {
      return document.caretRangeFromPoint(x, y);
    }
    if (typeof document.caretPositionFromPoint === 'function') {
      const position = document.caretPositionFromPoint(x, y);
      if (!position) return null;
      const range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    }
    return null;
  };

  const wordMatchAtOffset = (text, rawOffset) => {
    const offset = Math.max(0, Math.min(String(text || '').length, Number(rawOffset) || 0));
    const matches = Array.from(String(text || '').matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu));
    return matches.find((match) => offset >= match.index && offset <= match.index + match[0].length)
      || matches.find((match) => Math.abs(offset - match.index) <= 1)
      || [...matches].reverse().find((match) => Math.abs(offset - (match.index + match[0].length)) <= 1)
      || null;
  };

  const wordCountBeforePoint = (container, node, offset) => {
    const before = document.createRange();
    before.selectNodeContents(container);
    try { before.setEnd(node, offset); }
    catch (_) { return 0; }
    return splitWords(before.toString()).length;
  };

  const wrapTextWord = (range, index) => {
    if (!range || range.startContainer !== range.endContainer || range.startContainer.nodeType !== Node.TEXT_NODE) return null;
    const span = document.createElement('span');
    span.className = 'reader-word reader-context-word';
    span.dataset.index = String(index);
    try {
      range.surroundContents(span);
      return span;
    } catch (_) {
      return null;
    }
  };

  const contextWordFromEvent = (event) => {
    const directTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
    let element = directTarget?.closest?.('.reader-word[data-index]') || null;
    if (!element && typeof document.elementsFromPoint === 'function') {
      element = document.elementsFromPoint(event.clientX, event.clientY)
        .map((candidate) => candidate?.closest?.('.reader-word[data-index]'))
        .find(Boolean) || null;
    }
    if (element) {
      const index = Number(element.dataset.index);
      if (!Number.isFinite(index)) return null;
      return { word: state.words[index] || element.textContent, index, element };
    }

    // Full-page and two-column modes can contain plain text nodes rather than
    // one span per word. Resolve the caret under the pointer, identify the word
    // boundaries, and map the local text offset back to the global word index.
    const caret = caretRangeAtPoint(event.clientX, event.clientY);
    if (!caret || !reader.contains(caret.startContainer)) return null;
    let textNode = caret.startContainer;
    let offset = caret.startOffset;
    if (textNode.nodeType !== Node.TEXT_NODE) {
      const child = textNode.childNodes?.[Math.min(offset, Math.max(0, textNode.childNodes.length - 1))];
      if (child?.nodeType === Node.TEXT_NODE) {
        textNode = child;
        offset = Math.min(offset, child.data.length);
      } else {
        return null;
      }
    }

    const match = wordMatchAtOffset(textNode.data, offset);
    if (!match) return null;
    const range = document.createRange();
    range.setStart(textNode, match.index);
    range.setEnd(textNode, match.index + match[0].length);

    const parent = textNode.parentElement;
    const group = parent?.closest?.('.reader-group[data-start-index]');
    const staticContainer = parent?.closest?.('[data-static-start-index]');
    let index;
    if (group) {
      const base = Number(group.dataset.visibleStartIndex ?? group.dataset.startIndex) || 0;
      index = base + wordCountBeforePoint(group, textNode, match.index);
    } else if (staticContainer) {
      const base = Number(staticContainer.dataset.staticStartIndex) || 0;
      index = base + wordCountBeforePoint(staticContainer, textNode, match.index);
    } else {
      index = nearestWordIndexForSelection(match[0]);
    }
    index = Math.max(0, Math.min(state.words.length - 1, Number(index) || 0));
    element = wrapTextWord(range, index) || parent;
    return { word: state.words[index] || match[0], index, element, range };
  };

  reader.addEventListener('contextmenu', (event) => {
    const context = contextWordFromEvent(event);
    if (!context) return;
    console.info('[RC-DIAG 1] menu opened', { word: context.word, index: context.index, readerConnected: reader.isConnected, appConnected: app.isConnected });
    event.preventDefault();
    event.stopImmediatePropagation();

    app.querySelectorAll('#reader .reader-context-word').forEach((node) => node.classList.remove('reader-context-word'));
    context.element?.classList?.add('reader-context-word');
    // Capture the page while the right-clicked word is still a live DOM node.
    // Ask Mark highlighting can redraw/wrap reader text, so later actions should
    // not have to recompute the bookmark page from a stale element reference.
    context.page = bookmarkPageForWord(context.element);
    state.contextWord = context;

    // Treat the right-clicked word as the active Ask Mark selection so it stays
    // visibly highlighted while the context menu and lookup result are open.
    const wordSelection = {
      text: String(context.word || '').trim(),
      startIndex: context.index,
      endIndex: context.index + 1,
      chapter: tocTitleForWordIndex(context.index)
    };
    if (wordSelection.text) {
      if (isReaderRunning()) {
        state.markSelectionWasRunning = true;
        pauseReader();
      }
      state.markSelection = wordSelection;
      state.markSelectionLocked = true;
      persistMarkSelectionHighlight(wordSelection);
      context.element?.classList?.add('ask-mark-selected');
      renderMarkSelectionCard();
      updateReaderStatus('Paused on selected word. Click elsewhere in the text to continue.');
    }

    const existingNote = notesForCurrentDocument().find((item) => Number(item.wordIndex) === context.index);
    const noteButton = menu.querySelector('[data-dictionary-action="note"]');
    if (noteButton) noteButton.textContent = existingNote ? 'Edit note' : 'Add note';
    const bookmarkButton = menu.querySelector('[data-dictionary-action="bookmark"]');
    if (bookmarkButton) bookmarkButton.textContent = bookmarkForContextWord() ? 'Remove bookmark' : 'Add bookmark';

    // Unhide before measuring so the menu is clamped to the viewport correctly.
    menu.hidden = false;
    menu.style.visibility = 'hidden';
    const maxLeft = window.innerWidth - menu.offsetWidth - 12;
    const maxTop = window.innerHeight - menu.offsetHeight - 12;
    menu.style.left = `${Math.max(8, Math.min(event.clientX, maxLeft))}px`;
    menu.style.top = `${Math.max(8, Math.min(event.clientY, maxTop))}px`;
    menu.style.visibility = '';
    menu.querySelector('button')?.focus({ preventScroll: true });
  });
  const capturedContext = () => {
    const context = state.contextWord;
    if (!context) return null;
    return { ...context, page: context.page ? { ...context.page } : null };
  };
  const runDictionaryAction = (button, event) => {
    // Resolve the live menu at action time. Reader navigation can replace the
    // menu node after bindDictionaryMenu() ran, leaving listeners attached to
    // a detached menu even though the newly rendered menu is visible.
    const liveMenu = app.querySelector('#word-context-menu');
    if (!button || !liveMenu || !liveMenu.contains(button)) return false;
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();

    const context = capturedContext();
    const action = button.dataset.dictionaryAction;
    if (!context || !action) return false;

    // Capture everything before hiding/repainting. Lookup/notes can immediately
    // update Ask Mark or the reader DOM.
    const stableContext = {
      ...context,
      element: context.element || null,
      page: context.page ? { ...context.page } : null
    };

    closeDictionaryMenu();

    if (action === 'lookup') {
      const liveReader = app.querySelector('#reader');
      console.info('[RC-DIAG 2] lookup clicked', { word: stableContext.word, index: stableContext.index, menuConnected: liveMenu.isConnected, readerConnected: !!liveReader?.isConnected });
      performDictionaryLookup(false, 'mark', stableContext);
      return true;
    }
    if (action === 'save') {
      performDictionaryLookup(true, 'mark', stableContext);
      return true;
    }
    if (action === 'note') {
      const existing = notesForCurrentDocument()
        .find((item) => Number(item.wordIndex) === Number(stableContext.index));
      showNoteEditor(stableContext, existing || null);
      return true;
    }
    if (action === 'bookmark') {
      const changed = toggleBookmarkForContextWord(stableContext);
      if (changed) {
        // Repaint after navigation pane reconstruction and again on the next
        // frame, so the ribbon survives DOM/layout work triggered by the save.
        requestAnimationFrame(() => {
          updateReaderBookmarkMarkers();
          requestAnimationFrame(updateReaderBookmarkMarkers);
        });
      }
      return changed;
    }
    return false;
  };

  let lastPointerActionAt = 0;

  // Keep one delegated action bridge on a stable ancestor. The custom menu is
  // part of the Reader render and may be replaced when navigating away and
  // back. bindDictionaryMenu() refreshes the runner closure for the current
  // Reader; the document listener survives those DOM replacements.
  window.__msgDictionaryActionRunner = runDictionaryAction;
  if (!window.__msgDictionaryDelegationInstalled) {
    window.__msgDictionaryDelegationInstalled = true;
    document.addEventListener('pointerup', (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      const button = event.target instanceof Element
        ? event.target.closest('[data-dictionary-action]')
        : null;
      const liveMenu = app.querySelector('#word-context-menu');
      if (!button || !liveMenu || !liveMenu.contains(button)) return;
      if (window.__msgDictionaryActionRunner?.(button, event)) {
        window.__msgDictionaryLastPointerActionAt = performance.now();
      }
    }, true);
    document.addEventListener('click', (event) => {
      const button = event.target instanceof Element
        ? event.target.closest('[data-dictionary-action]')
        : null;
      const liveMenu = app.querySelector('#word-context-menu');
      if (!button || !liveMenu || !liveMenu.contains(button)) return;
      if (performance.now() - Number(window.__msgDictionaryLastPointerActionAt || 0) < 500) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      window.__msgDictionaryActionRunner?.(button, event);
    }, true);
  }

  // Dictionary actions are handled only by the single delegated document bridge
  // above. Do not also bind pointerup/click handlers to this rendered menu: a
  // single physical activation would then execute both paths and duplicate
  // Ask Mark/Beth responses. Keyboard clicks are handled by the delegated
  // document click listener as well.

  menu.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-dictionary-action]')) {
      event.preventDefault();
    }
    // Keep reader-surface and selection handlers from owning the menu press.
    event.stopImmediatePropagation();
  }, true);
  // Install the outside-click closer only once and resolve the live menu at
  // event time. Reader navigation replaces #word-context-menu; a listener that
  // closes over an older detached menu will otherwise treat clicks on the new
  // menu as outside clicks and hide it before pointerup/click can run.
  if (!window.__msgDictionaryOutsideCloseInstalled) {
    window.__msgDictionaryOutsideCloseInstalled = true;
    document.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const liveMenu = app.querySelector('#word-context-menu');
      if (!liveMenu || liveMenu.hidden || liveMenu.contains(event.target)) return;
      closeDictionaryMenu();
    }, true);
  }
  window.addEventListener('blur', closeDictionaryMenu);
  reader.addEventListener('scroll', closeDictionaryMenu, { passive: true });
  reader.addEventListener('scroll', () => updateReaderBookmarkMarkers(), { passive: true });
  reader.addEventListener('scroll', () => ReaderContinuity.scheduleCheckpoint(), { passive: true });
  reader.addEventListener('pointerup', () => ReaderContinuity.scheduleCheckpoint());
  reader.addEventListener('keyup', () => ReaderContinuity.scheduleCheckpoint());
}



function updateHiddenIllustrationControls() {
  const count = state.illustrationHidden.size;
  const label = count === 1 ? 'Show hidden illustration' : `Show hidden illustrations (${count})`;
  ['#show-hidden-illustrations', '#fs-show-hidden-illustrations'].forEach((selector) => {
    const button = app.querySelector(selector);
    if (!button) return;
    button.disabled = count === 0;
    button.textContent = count ? label : 'Show hidden illustrations';
  });
}

function restoreHiddenIllustrations() {
  if (!state.illustrationHidden.size) return;
  stopReader();
  state.illustrationHidden.clear();
  state.illustrationAnchors.clear();
  const mode = getSelectedMode();
  const count = Number(app.querySelector('#word-count')?.value) || 1;
  prepareReaderView(mode, count);
  updateModeControls(mode);
  updateHiddenIllustrationControls();
  updateReaderStatus('Hidden illustrations are visible again.');
  persistReaderSession();
}

function normalizedIllustrationHeading(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .replace(/\b(chapter|book|part|section)\b/g, '$1')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function uploadedIllustrationFor(structure) {
  if (!structure || !state.uploadedIllustrations.length) return null;
  const target = normalizedIllustrationHeading(structure.title);
  if (!target) return null;
  return state.uploadedIllustrations.find((item) => {
    const candidate = normalizedIllustrationHeading(item.heading);
    return candidate === target || candidate.endsWith(` ${target}`) || target.endsWith(` ${candidate}`);
  }) || null;
}

function renderUploadedIllustration(figure, item) {
  if (!figure || !item?.image) { figure?.remove(); return; }
  figure.classList.remove('illustration-loading');
  figure.classList.add('illustration-ready', 'uploaded-reader-illustration');
  figure.innerHTML = `
    <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.alt || item.caption || item.heading || 'Book illustration')}" decoding="async">
    <figcaption>
      <span class="illustration-caption">${escapeHtml(item.caption || item.heading || 'Chapter illustration')}</span>
      <span class="illustration-credit">Uploaded with this illustrated book</span>
      <span class="illustration-actions"><button type="button" data-illustration-action="hide">Hide</button></span>
    </figcaption>`;
  figure.querySelector('img')?.addEventListener('error', () => figure.remove(), { once: true });
  figure.querySelector('[data-illustration-action="hide"]')?.addEventListener('click', () => {
    const key = figure.dataset.illustrationKey;
    if (key) state.illustrationHidden.add(key);
    figure.remove();
    updateHiddenIllustrationControls();
    persistReaderSession();
  });
}

function modeSupportsIllustrations(mode) {
  return ['highlight', 'bold-focus', 'smooth-glide', 'pointing-guide', 'marquee', 'auto-scroll'].includes(mode);
}

function illustrationCandidateQuery(structure, wordIndex) {
  const title = state.title.replace(/\s+/g, ' ').trim();
  let heading = structure?.title?.replace(/\s+/g, ' ').trim() || '';
  const genericHeading = /^(chapter|book|part|section)\s+[\divxlcdmonewtyhrfusa-]+$/i.test(heading);
  if (genericHeading) heading = '';

  const contextStart = Math.min(state.words.length, Math.max(0, Number(wordIndex) || 0));
  const context = state.words.slice(contextStart, contextStart + 60).join(' ')
    .replace(/[“”"'()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const stopwords = new Set([
    'the','and','that','with','from','this','there','their','have','were','which','would','could','should','into','about','after','before','through','because','while','where','when','upon','your','them','then','than','been','being','also','very','what','such','some','more','most','over','under','only','much','many','each','other','another','between','within','without','against','during','toward','towards','shall','will','might','must','cannot','cant','ours','ourselves','herself','himself','itself','they','those','these','said','says','made','make','like','just','unto','thou','thee','thy','unto','into','ever','still','well','here','there','again','chapter','book','part','section'
  ]);
  const cleaned = context.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ');
  const counts = new Map();
  for (const token of cleaned.split(/\s+/)) {
    if (!token || token.length < 4 || stopwords.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  const titleWords = new Set(String(title).toLocaleLowerCase().split(/\s+/).filter(Boolean));
  const headingWords = new Set(String(heading).toLocaleLowerCase().split(/\s+/).filter(Boolean));
  const properNouns = [...new Set(context.match(/\b[A-Z][a-z]{3,}\b/g) || [])]
    .map((word) => word.toLocaleLowerCase())
    .filter((word) => !stopwords.has(word) && !titleWords.has(word));
  const keywords = [...new Set([
    ...properNouns.slice(0, 5),
    ...[...counts.entries()]
      .filter(([word]) => !titleWords.has(word) || headingWords.has(word))
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
      .map(([word]) => word)
  ])].slice(0, 10);

  return {
    title,
    heading,
    context,
    keywords,
    structureType: structure?.type || '',
    anchorWordIndex: contextStart
  };
}

function nearestIllustrationAnchor(reader, wordIndex) {
  return reader.querySelector(`.reader-group[data-start-index="${wordIndex}"]`)
    || Array.from(reader.querySelectorAll('.reader-group')).find((group) => Number(group.dataset.startIndex) >= wordIndex)
    || reader.querySelector('.reader-group:last-of-type');
}

function renderIllustrationResult(figure, query, results, selectedIndex) {
  if (!figure?.isConnected || !results.length) {
    figure?.remove();
    return;
  }
  const index = ((selectedIndex % results.length) + results.length) % results.length;
  const item = results[index];
  figure.dataset.resultIndex = String(index);
  figure.classList.remove('illustration-loading');
  figure.innerHTML = `
    <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.description || item.title || query)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">
    <figcaption>
      <span class="illustration-caption">${escapeHtml(item.description || item.title || query)}</span>
      <span class="illustration-credit">${escapeHtml(item.artist || 'Wikimedia Commons contributor')} · ${escapeHtml(item.license || 'See source for license')}</span>
      <span class="illustration-actions">
        <button type="button" data-illustration-action="replace">Replace</button>
        <button type="button" data-illustration-action="hide">Hide</button>
        <a href="${escapeHtml(item.originalUrl)}" target="_blank" rel="noopener noreferrer">Source</a>
      </span>
    </figcaption>`;
  const image = figure.querySelector('img');
  let settled = false;
  const fail = () => {
    if (settled || !figure.isConnected) return;
    settled = true;
    if (index + 1 < results.length) renderIllustrationResult(figure, query, results, index + 1);
    else figure.remove();
  };
  image?.addEventListener('load', () => { settled = true; figure.classList.add('illustration-ready'); }, { once: true });
  image?.addEventListener('error', fail, { once: true });
  window.setTimeout(() => { if (!settled) fail(); }, 12000);
  figure.querySelector('[data-illustration-action="replace"]')?.addEventListener('click', () => {
    renderIllustrationResult(figure, query, results, index + 1);
  });
  figure.querySelector('[data-illustration-action="hide"]')?.addEventListener('click', () => {
    const key = figure.dataset.illustrationKey;
    if (key) state.illustrationHidden.add(key);
    figure.remove();
    updateHiddenIllustrationControls();
    persistReaderSession();
  });
}

async function loadIllustration(figure, queryPayload) {
  const cacheKey = JSON.stringify({
    title: queryPayload?.title || '',
    heading: queryPayload?.heading || '',
    keywords: queryPayload?.keywords || [],
    structureType: queryPayload?.structureType || ''
  });
  try {
    let results = state.illustrationCache.get(cacheKey) || [];
    if (!results.length) {
      const response = await fetch('/api/illustrations/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queryPayload)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Illustration search failed.');
      results = Array.isArray(payload.results) ? payload.results : [];
      state.illustrationCache.set(cacheKey, results);
    }
    if (!results.length) {
      figure?.remove();
      return;
    }
    renderIllustrationResult(figure, queryPayload?.heading || queryPayload?.title || 'Illustration', results, 0);
  } catch (_error) {
    figure?.remove();
  }
}

function createDynamicIllustration(reader, wordIndex, structure = null) {
  if (state.illustrationMode === 'off' || state.illustrationAnchors.size >= 30) return;
  const key = `${state.documentId}:${wordIndex}`;
  if (state.illustrationAnchors.has(key) || state.illustrationHidden.has(key)) return;
  const anchor = nearestIllustrationAnchor(reader, wordIndex);
  if (!anchor) return;
  state.illustrationAnchors.add(key);
  const uploaded = uploadedIllustrationFor(structure);
  const figure = document.createElement('figure');
  figure.className = 'reader-illustration illustration-loading';
  figure.dataset.illustrationKey = key;
  anchor.insertAdjacentElement('afterend', figure);
  if (uploaded) {
    renderUploadedIllustration(figure, uploaded);
    return;
  }
  const query = illustrationCandidateQuery(structure, wordIndex);
  if (!query || (!query.title && !query.heading && !(query.keywords || []).length)) { figure.remove(); return; }
  figure.dataset.query = JSON.stringify(query);
  figure.innerHTML = `<div class="illustration-placeholder" aria-label="Loading illustration"></div><figcaption>Finding a relevant open-license illustration…</figcaption>`;
  loadIllustration(figure, query);
}

function scheduleIllustrationsForRange(reader, startWord, endWord, mode) {
  if (!reader || state.illustrationMode === 'off' || !modeSupportsIllustrations(mode)) return;
  const structuralTypes = state.illustrationMode === 'chapter'
    ? new Set(['part', 'chapter', 'prologue', 'introduction', 'preface', 'epilogue', 'appendix'])
    : new Set(['part', 'chapter', 'prologue', 'introduction', 'preface', 'epilogue', 'appendix', 'section']);
  const structures = state.structure.filter((entry) => entry.start >= startWord && entry.start < endWord && structuralTypes.has(entry.type));
  structures.forEach((entry) => createDynamicIllustration(reader, entry.start, entry));

  if (state.illustrationMode !== 'automatic') return;
  const interval = 2200;
  let marker = Math.max(interval, Math.ceil(startWord / interval) * interval);
  while (marker < endWord && state.illustrationAnchors.size < 30) {
    const nearbyStructure = state.structure.find((entry) => Math.abs(entry.start - marker) < 250);
    if (!nearbyStructure) createDynamicIllustration(reader, marker, null);
    marker += interval;
  }
}

function createWordSpan(word, index, extraClass = '') {
  return virtualRenderer.createWordSpan(word, index, extraClass);
}

function appendWordDocumentChunk(reader, mode, groupSize, targetWordEnd) {
  return virtualRenderer.appendWordDocumentChunk(reader, mode, groupSize, targetWordEnd);
}

function ensureWordsRendered(reader, mode, groupSize, requiredWordEnd) {
  return virtualRenderer.ensureWordsRendered(reader, mode, groupSize, requiredWordEnd);
}

function renderWordDocument(reader, mode, groupSize = 1) {
  return virtualRenderer.renderWordDocument(reader, mode, groupSize);
}

function visibleReadingAnchor(reader, fallbackIndex = state.index) {
  return virtualRenderer.visibleReadingAnchor(reader, fallbackIndex);
}

function restoreReadingAnchor(reader, mode, groupSize, wordIndex) {
  return virtualRenderer.restoreReadingAnchor(reader, mode, groupSize, wordIndex);
}

function captureReaderViewport(anchorIndex = state.index) {
  const reader = app.querySelector('#reader');
  if (!reader) return null;
  const target = reader.querySelector(`.reader-word[data-index="${Number(anchorIndex)}"]`)
    || Array.from(reader.querySelectorAll('.reader-group[data-start-index]')).find((group) =>
      Number(group.dataset.startIndex) <= Number(anchorIndex)
      && Number(group.dataset.endIndex) > Number(anchorIndex));
  const readerRect = reader.getBoundingClientRect();
  const targetRect = target?.getBoundingClientRect();
  return {
    scrollTop: Number(reader.scrollTop) || 0,
    scrollLeft: Number(reader.scrollLeft) || 0,
    anchorOffsetTop: targetRect ? targetRect.top - readerRect.top : 24,
    anchorOffsetLeft: targetRect ? targetRect.left - readerRect.left : 0
  };
}

function captureReaderLocation() {
  const reader = app.querySelector('#reader');
  const mode = state.renderedMode || getSelectedMode();
  const wasRunning = isReaderRunning();
  const maxIndex = Math.max(0, state.words.length - 1);

  // state.index belongs exclusively to the timed-reader playback cursor.
  // Viewport inspection must never rewrite it. This prevents a paused
  // Pointing Guide from resuming at the top visible word.
  let cursorIndex = Math.max(0, Math.min(maxIndex, Number(state.index) || 0));
  let anchorIndex = cursorIndex;
  const engineOnlyModes = new Set(['flash', 'digital-sign', 'pacman']);

  if (mode === 'two-column') {
    anchorIndex = reader ? visibleReadingAnchor(reader, currentReadingPosition()) : currentReadingPosition();
  } else if (reader && !wasRunning && !engineOnlyModes.has(mode)) {
    anchorIndex = visibleReadingAnchor(reader, state.viewportAnchorIndex ?? cursorIndex);
  }

  anchorIndex = Math.max(0, Math.min(maxIndex, Number(anchorIndex) || 0));
  state.viewportAnchorIndex = anchorIndex;

  return { anchorIndex, cursorIndex, wasRunning };
}

function bookSpreadForWordIndex(reader, wordIndex) {
  if (!reader || !state.bookPages) return null;
  const mode = state.renderedMode || getSelectedMode();
  const groupSize = Number(app.querySelector('#word-count')?.value) || 1;
  ensureWordsRendered(reader, mode, groupSize, Math.min(state.words.length, Number(wordIndex) + 250));
  applyBookPageMetrics(reader);
  const target = reader.querySelector(`.reader-word[data-index="${Number(wordIndex)}"]`)
    || Array.from(reader.querySelectorAll('.reader-group[data-start-index]'))
      .find((group) => Number(group.dataset.startIndex) <= Number(wordIndex)
        && Number(group.dataset.endIndex) > Number(wordIndex));
  if (!target) return null;
  const readerRect = reader.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const metrics = applyBookPageMetrics(reader);
  const absoluteLeft = targetRect.left - readerRect.left + reader.scrollLeft - metrics.paddingLeft;
  const pageIndex = Math.max(0, Math.floor((absoluteLeft + Math.min(targetRect.width / 2, metrics.pageWidth / 4)) / metrics.pagePitch));
  return Math.floor(pageIndex / 2);
}

function restoreCapturedReaderLocation(snapshot, { rerendered = false } = {}) {
  if (!snapshot) return;
  const maxIndex = Math.max(0, state.words.length - 1);
  const anchorIndex = Math.max(0, Math.min(maxIndex, Number(snapshot.anchorIndex) || 0));
  const cursorIndex = Math.max(0, Math.min(maxIndex, Number(snapshot.cursorIndex ?? snapshot.playbackIndex ?? snapshot.anchorIndex) || 0));
  state.viewportAnchorIndex = anchorIndex;
  state.index = cursorIndex;
  const restoreToken = (state.readerRestoreToken || 0) + 1;
  state.readerRestoreToken = restoreToken;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (restoreToken !== state.readerRestoreToken) return;
      const reader = app.querySelector('#reader');
      if (!reader) return;
      const mode = state.renderedMode || getSelectedMode();
      const groupSize = Number(app.querySelector('#word-count')?.value) || 1;

      // If a long document is virtualized and the saved word is outside the
      // current render window, render a window around that word first. This
      // preserves position without materializing tens of thousands of words.
      if (!state.bookPages
          && !['flash', 'digital-sign', 'two-column'].includes(mode)
          && state.virtualized
          && (anchorIndex < state.renderedWordStart || anchorIndex >= state.renderedWordEnd)) {
        virtualRenderer.renderWindowAround(reader, mode, groupSize, anchorIndex);
      }
      restoreReadingAnchor(reader, mode, groupSize, anchorIndex);
      if (state.bookPages) {
        const spread = bookSpreadForWordIndex(reader, anchorIndex);
        if (spread != null) goToBookSpread(spread, { behavior: 'auto', ensureRendered: true, syncReaderPosition: false });
      }
      state.viewportAnchorIndex = anchorIndex;
      state.index = cursorIndex;
      updateReaderStatus();
      const start = app.querySelector('#start-reader');
      if (start && mode !== 'two-column') start.textContent = cursorIndex ? 'Resume' : 'Start';
      if (snapshot.wasRunning && mode !== 'two-column') startReader();
      persistReaderSession();
    });
  });
}

function switchReadingMode(nextMode) {
  if (nextMode === 'two-column') nextMode = 'highlight';
  state.pendingReadingMode = nextMode;

  // A fullscreen select can emit several closely spaced input/change events.
  // Coalesce them into one render on the next frame instead of rebuilding the
  // word DOM repeatedly while the browser is still painting the menu.
  if (state.modeChangeFrame) cancelAnimationFrame(state.modeChangeFrame);
  state.modeChangeFrame = requestAnimationFrame(() => {
    state.modeChangeFrame = null;
    const mode = state.pendingReadingMode || nextMode;
    state.pendingReadingMode = null;
    const reader = app.querySelector('#reader');
    if (!reader || state.renderedMode === mode) {
      updateModeControls(mode);
      return;
    }

    const snapshot = captureReaderLocation();
    const groupSize = Number(app.querySelector('#word-count')?.value) || 1;
    stopReader();
    state.index = snapshot.anchorIndex;
    prepareReaderView(mode, groupSize);
    updateModeControls(mode);
    restoreCapturedReaderLocation(snapshot, { rerendered: true });
  });
}

function prepareReaderView(mode, groupSize = Number(app.querySelector('#word-count')?.value) || 1) {
  const reader = app.querySelector('#reader');
  if (!reader) return;
  reader.classList.remove('flash', 'highlight-mode', 'bold-focus-mode', 'smooth-glide-mode', 'pointing-guide-mode', 'marquee-mode', 'digital-sign-mode', 'two-column-mode', 'auto-scroll-mode', 'pacman-mode', 'reading-guide-enabled', 'book-pages-layout', 'illustrated-reading');
  state.renderedMode = mode;
  updateFocusAnchorOverlay();
  state.bookPages = Boolean(app.querySelector('#book-pages')?.checked) && modeSupportsBookPages(mode);
  reader.classList.toggle('book-pages-layout', state.bookPages);
  reader.classList.toggle('illustrated-reading', state.illustrationMode !== 'off' && modeSupportsIllustrations(mode));
  updateBookPageControls();

  if (mode === 'flash') {
    reader.classList.add('flash');
    state.renderedGroupSize = Math.min(10, Math.max(1, Number(groupSize) || 1));
    refreshReadingGroups(mode, state.renderedGroupSize);
    reader.textContent = 'Press Start to begin.';
    return;
  }

  if (mode === 'digital-sign') {
    reader.classList.add('digital-sign-mode');
    reader.innerHTML = '<div class="digital-sign-stage">Press Start to begin.</div>';
    state.wordElements = [];
    state.groupElements = [];
    state.activeElements = [];
    state.renderedGroupSize = Math.min(10, Math.max(1, Number(groupSize) || 1));
    return;
  }

  if (mode === 'two-column') {
    reader.classList.add('two-column-mode');
    renderTwoColumnDocument(reader);
    return;
  }

  if (mode === 'auto-scroll') {
    reader.classList.add('auto-scroll-mode');
    renderWordDocument(reader, mode, 1);
    return;
  }

  if (mode === 'pacman') {
    reader.classList.add('pacman-mode');
    renderWordDocument(reader, mode, 1);
    const pacman = document.createElement('span');
    pacman.className = 'pacman-chomper';
    pacman.setAttribute('aria-hidden', 'true');
    reader.prepend(pacman);
    initializePacmanMode(reader);
    return;
  }

  if (mode === 'highlight') reader.classList.add('highlight-mode');
  else if (mode === 'bold-focus') reader.classList.add('bold-focus-mode');
  else if (mode === 'smooth-glide') reader.classList.add('smooth-glide-mode');
  else if (mode === 'pointing-guide') reader.classList.add('pointing-guide-mode', 'reading-guide-enabled');
  else reader.classList.add('marquee-mode');
  renderWordDocument(reader, mode, groupSize);
  if (mode === 'smooth-glide') {
    const marker = document.createElement('span');
    marker.className = 'smooth-focus-marker';
    marker.setAttribute('aria-hidden', 'true');
    reader.prepend(marker);
  }
  if (mode === 'pointing-guide') {
    const style = app.querySelector('#pointer-style')?.value || state.pointerStyle || 'hand';
    state.pointerStyle = style;
    state.pointerColor = app.querySelector('#pointer-color')?.value || state.pointerColor || '#20a866';
    reader.dataset.pointerStyle = style;
    reader.style.setProperty('--pointer-color', state.pointerColor);
    const guide = document.createElement('span');
    guide.className = `reading-guide-marker pointer-${style}`;
    guide.dataset.pointerStyle = style;
    guide.setAttribute('aria-hidden', 'true');
    guide.textContent = style === 'hand'
      ? '☝'
      : style === 'caret'
        ? '▲'
        : style === 'mark'
          ? 'Mark 👉'
          : '';
    reader.prepend(guide);
  }
}

function scrollActiveGroup(reader, groupIndex) {
  const active = state.groupElements[groupIndex];
  if (!active) return;

  // Measure the phrase relative to the visible reader pane. offsetTop can be
  // relative to an ancestor outside the pane, which caused an immediate jump.
  const readerRect = reader.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  const topInsidePane = activeRect.top - readerRect.top;
  const bottomInsidePane = activeRect.bottom - readerRect.top;
  // Let the highlight travel almost to the bottom of the pane. Once it reaches
  // that edge, advance the text just enough to place the same active phrase
  // near the top, creating a page-like reading rhythm.
  if (state.bookPages) {
    const metrics = applyBookPageMetrics(reader);
    const absoluteLeft = activeRect.left - readerRect.left + reader.scrollLeft - metrics.paddingLeft;
    const pageIndex = Math.max(0, Math.floor((absoluteLeft + Math.min(activeRect.width / 2, metrics.pageWidth / 4)) / metrics.pagePitch));
    const targetSpread = Math.floor(pageIndex / 2);
    const currentSpread = getCurrentBookSpread(reader);
    if (targetSpread !== currentSpread) {
      // The reading helper may advance only to the spread that actually owns
      // the active group; never animate through intermediate horizontal states.
      goToBookSpread(targetSpread, { behavior: 'auto', ensureRendered: true });
    }
    return;
  }

  const lowerThreshold = reader.clientHeight - 18;
  if (bottomInsidePane > lowerThreshold) {
    const desiredTop = 18;
    reader.scrollTop = Math.max(0, reader.scrollTop + topInsidePane - desiredTop);
  }
}

function moveSmoothFocusMarker(reader, group, tickMs) {
  const marker = reader.querySelector('.smooth-focus-marker');
  if (!marker || !group) return;

  const readerRect = reader.getBoundingClientRect();
  const groupRect = group.getBoundingClientRect();
  const left = groupRect.left - readerRect.left + reader.scrollLeft;
  const top = groupRect.top - readerRect.top + reader.scrollTop;

  // The first position appears immediately. Later positions glide for most of
  // the reading interval, leaving a brief settling moment before the next move.
  if (marker.dataset.ready === 'true') {
    marker.style.transitionDuration = `${Math.max(90, tickMs * 0.82)}ms`;
  } else {
    marker.style.transitionDuration = '0ms';
    marker.dataset.ready = 'true';
  }

  marker.style.width = `${Math.max(2, groupRect.width)}px`;
  marker.style.height = `${Math.max(2, groupRect.height)}px`;
  marker.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  marker.classList.add('visible');
}


function getPointingLineStep(reader, startIndex, requestedCount) {
  const first = reader.querySelector(`.reader-word[data-index="${startIndex}"]`);
  if (!first) return null;

  const firstRect = first.getBoundingClientRect();
  const lineTolerance = Math.max(3, firstRect.height * 0.35);
  const elements = [first];

  // Respect the selected word count, but never let one pointer step cross a
  // visual line. If the next word wraps, it becomes the first word of the next
  // step, so the hand returns to the beginning of that new line.
  for (let offset = 1; offset < requestedCount; offset += 1) {
    const index = startIndex + offset;
    const element = reader.querySelector(`.reader-word[data-index="${index}"]`);
    if (!element) break;
    const rect = element.getBoundingClientRect();
    if (Math.abs(rect.top - firstRect.top) > lineTolerance) break;
    elements.push(element);
  }

  return {
    elements,
    first: elements[0],
    last: elements[elements.length - 1],
    nextIndex: startIndex + elements.length
  };
}

function scrollPointingStep(reader, step) {
  if (!step?.first || !step?.last) return;
  const readerRect = reader.getBoundingClientRect();
  const firstRect = step.first.getBoundingClientRect();
  const lastRect = step.last.getBoundingClientRect();
  const topInsidePane = firstRect.top - readerRect.top;
  const bottomInsidePane = lastRect.bottom - readerRect.top;
  const lowerThreshold = reader.clientHeight - 22;

  if (bottomInsidePane > lowerThreshold) {
    reader.scrollTop = Math.max(0, reader.scrollTop + topInsidePane - 18);
  }
}

function moveReadingGuide(reader, step, tickMs) {
  const guide = reader.querySelector('.reading-guide-marker');
  if (!guide || !step?.first || !step?.last) return;

  const readerRect = reader.getBoundingClientRect();
  const firstRect = step.first.getBoundingClientRect();
  const lastRect = step.last.getBoundingClientRect();
  const style = guide.dataset.pointerStyle || state.pointerStyle || 'hand';
  const guideWidth = guide.offsetWidth || 22;
  const phraseLeft = firstRect.left;
  const phraseRight = lastRect.right;
  const phraseWidth = Math.max(12, phraseRight - phraseLeft);
  const phraseCenter = phraseLeft + (phraseWidth / 2);

  let left = phraseCenter - readerRect.left + reader.scrollLeft - (guideWidth / 2);
  let top = Math.max(firstRect.bottom, lastRect.bottom) - readerRect.top + reader.scrollTop + 2;

  guide.style.setProperty('--pointer-phrase-width', `${phraseWidth}px`);

  if (style === 'underline' || style === 'bar') {
    left = phraseLeft - readerRect.left + reader.scrollLeft;
    top = style === 'bar'
      ? firstRect.top - readerRect.top + reader.scrollTop - 2
      : Math.max(firstRect.bottom, lastRect.bottom) - readerRect.top + reader.scrollTop + 1;
  } else if (style === 'caret') {
    top = Math.max(firstRect.bottom, lastRect.bottom) - readerRect.top + reader.scrollTop + 1;
  } else if (style === 'mark') {
    left = phraseLeft - readerRect.left + reader.scrollLeft - Math.max(58, guideWidth) - 7;
    top = firstRect.top - readerRect.top + reader.scrollTop + Math.max(0, (firstRect.height - (guide.offsetHeight || 22)) / 2);
  }

  if (guide.dataset.ready === 'true') {
    guide.style.transitionDuration = `${Math.max(100, tickMs * 0.86)}ms`;
  } else {
    guide.style.transitionDuration = '0ms';
    guide.dataset.ready = 'true';
  }

  guide.style.transform = `translate3d(${Math.max(0, left)}px, ${Math.max(0, top)}px, 0)`;
  guide.classList.add('visible');
}

let lastReaderStatusPaintAt = 0;
let lastReaderStatusText = '';
let lastViewerWpmText = '';

function updateViewerWpmBadge() {
  const badge = app.querySelector('#viewer-wpm-badge');
  if (!badge) return;
  const inputSpeed = Number(app.querySelector('#speed')?.value);
  const speed = Math.max(0, Math.round(Number.isFinite(inputSpeed) && inputSpeed > 0 ? inputSpeed : Number(state.wpm) || 0));
  const nextText = `${speed.toLocaleString()} WPM`;
  if (nextText === lastViewerWpmText && badge.textContent === nextText) return;
  lastViewerWpmText = nextText;
  badge.textContent = nextText;
  badge.setAttribute('aria-label', `Selected reading speed: ${speed.toLocaleString()} words per minute`);
}

function updateReaderStatus(message, { force = false } = {}) {
  const now = performance.now();
  // Animated modes may call this once per animation frame. Painting status text
  // four times per second is visually indistinguishable but avoids continuous
  // layout/paint work across a large fullscreen surface.
  if (!force && !message && now - lastReaderStatusPaintAt < 250) return;

  const status = app.querySelector('#reader-status');
  updateViewerWpmBadge();
  if (!status) return;

  const nextText = message || `${state.index.toLocaleString()} of ${state.words.length.toLocaleString()} words`;
  if (force || nextText !== lastReaderStatusText || status.textContent !== nextText) {
    status.textContent = nextText;
    lastReaderStatusText = nextText;
  }
  const nextTitle = `Selected speed: ${Math.round(Number(state.wpm) || 0)} WPM. Viewer size does not change the word clock.`;
  if (status.title !== nextTitle) status.title = nextTitle;
  lastReaderStatusPaintAt = now;
}



/* Feature block moved to /modules/reading/digital-sign-mode.js */

function startAutoScrollReader({ reader, speed, start, pause }) {
  const token = ++state.runToken;
  const startIndex = Math.max(0, state.index);
  const clock = createWpmClock(startIndex, speed);
  state.autoScrollLastAt = clock.startedAt;
  let lastTarget = startIndex;

  const step = (now) => {
    if (token !== state.runToken) return;

    const targetIndex = targetWordFromClock(clock, now);

    if (targetIndex > lastTarget) {
      ensureWordsRendered(
        reader,
        'auto-scroll',
        1,
        Math.min(state.words.length, targetIndex + 1000)
      );

      // The logical reading position comes from elapsed time, never pixels.
      state.index = targetIndex;
      scrollWordToReadingLine(reader, targetIndex);
      lastTarget = targetIndex;
      updateReaderStatus();
    }

    if (targetIndex >= state.words.length) {
      stopReader();
      if (start) { start.disabled = false; start.textContent = 'Start'; }
      if (pause) pause.disabled = true;
      updateReaderStatus('Finished.');
      return;
    }

    state.interval = window.setTimeout(() => step(performance.now()), 16);
  };

  step(performance.now());
}


/* Feature block moved to /modules/reading/pacman-mode.js */

function startReader() {
  if(state.markPersistentSelection || state.markSelectionLocked) clearMarkSelectionForReadingResume();
  const selectedMode = getSelectedMode();
  if (selectedMode === 'two-column') return;
  const currentTickerStage = app.querySelector('.digital-sign-stage');
  const canResumeTicker = selectedMode === 'digital-sign'
    && state.tickerPaused
    && currentTickerStage
    && currentTickerStage.isConnected
    && currentTickerStage.children.length > 0;

  if (!canResumeTicker) stopReader();
  const speedInput = app.querySelector('#speed');
  const countInput = app.querySelector('#word-count');
  const reader = app.querySelector('#reader');
  const start = app.querySelector('#start-reader');
  const pause = app.querySelector('#pause-reader');
  const mode = getSelectedMode();

  const speed = Math.min(900, Math.max(30, Number(speedInput.value) || 300));
  const count = (mode === 'digital-sign' || mode === 'auto-scroll' || mode === 'pacman')
    ? 1
    : Math.min(10, Math.max(1, Number(countInput.value) || 1));
  speedInput.value = speed;
  countInput.value = count;
  state.wpm = speed;
  speedInput.disabled = true;
  countInput.disabled = true;
  start.disabled = true;
  pause.disabled = false;
  beginReadingSession();

  const expectedMeaningful = state.meaningfulChunks && modeSupportsMeaningfulChunks(mode);
  if (state.renderedMode !== mode
      || state.renderedGroupSize !== count
      || state.renderedMeaningfulChunks !== expectedMeaningful) {
    prepareReaderView(mode, count);
  }

  if (mode === 'digital-sign') {
    startDigitalSignReader({ reader, speed, start, pause });
    return;
  }

  if (mode === 'auto-scroll') {
    startAutoScrollReader({ reader, speed, start, pause });
    return;
  }

  if (mode === 'pacman') {
    startPacmanReader({ reader, speed, start, pause });
    return;
  }

  // This is the time for one complete group. For example, 2 words at 300 WPM
  // should advance every 400 ms.
  const tickMs = Math.max(40, (60000 * count) / speed);
  const token = ++state.runToken;
  state.nextTickAt = performance.now();

  const paintStep = () => {
    if (token !== state.runToken) return;
    if (state.index >= state.words.length) {
      pauseReader();
      updateReaderStatus('Finished.');
      return;
    }

    const startIndex = state.index;
    const semanticGroup = findReadingGroup(startIndex);
    let nextIndex = semanticGroup
      ? semanticGroup.end
      : Math.min(startIndex + count, state.words.length);
    let pointingStep = null;

    if (mode === 'flash') {
      const flashWords = state.words.slice(startIndex, nextIndex);
      reader.style.fontSize = `${Math.max(10, Number(app.querySelector('#font-size')?.value) || 14)}px`;
      if (state.focusAnchor) renderFocusAnchorPhrase(reader, flashWords);
      else renderPhrase(reader, flashWords);
    } else {
      updateFocusAnchorOverlay(state.words.slice(startIndex, nextIndex));
      ensureWordsRendered(reader, mode, count, nextIndex + 1000);

      if (mode === 'pointing-guide') {
        // Pointing Guide computes its step from element geometry. In Book Pages,
        // move to the spread containing the current word BEFORE measuring that
        // geometry; otherwise the hand can advance into an off-screen spread.
        if (state.bookPages) {
          const requiredSpread = bookSpreadForWordIndex(reader, startIndex);
          if (requiredSpread != null && requiredSpread !== getCurrentBookSpread(reader)) {
            goToBookSpread(requiredSpread, {
              behavior: 'auto',
              ensureRendered: true,
              syncReaderPosition: false
            });
            state.index = startIndex;
          }
        }

        const semanticLimit = Math.max(1, nextIndex - startIndex);
        pointingStep = getPointingLineStep(reader, startIndex, Math.min(count, semanticLimit));
        if (pointingStep) nextIndex = pointingStep.nextIndex;
      }

      const groupIndex = state.groupIndexByStart.get(startIndex);
      const group = groupIndex === undefined ? null : state.groupElements[groupIndex];

      for (const activeGroup of state.activeElements) {
        activeGroup.classList.remove('active-group', 'active-bold-group');
      }
      state.activeElements = [];

      if (group) {
        if (mode === 'highlight') {
          group.classList.add('active-group');
          state.activeElements.push(group);
        }
        if (mode === 'bold-focus') {
          group.classList.add('active-bold-group');
          state.activeElements.push(group);
        }
        if (mode === 'marquee') group.classList.remove('pending-group');
      }
      if (mode === 'pointing-guide' && pointingStep) {
        scrollPointingStep(reader, pointingStep);
        const stepStart = startIndex;
        const stepEnd = nextIndex;
        window.requestAnimationFrame(() => {
          // Re-read the element positions after any automatic scroll so the
          // hand lands beneath the visible words rather than their old screen
          // coordinates.
          const refreshed = getPointingLineStep(reader, stepStart, stepEnd - stepStart);
          moveReadingGuide(reader, refreshed, Math.max(40, (60000 * (stepEnd - stepStart)) / speed));
        });
      } else {
        scrollActiveGroup(reader, groupIndex);
      }
      if (mode === 'smooth-glide' && group) {
        const glideMs = expectedMeaningful
          ? Math.max(40, (60000 * Math.max(1, nextIndex - startIndex)) / speed)
          : tickMs;
        window.requestAnimationFrame(() => moveSmoothFocusMarker(reader, group, glideMs));
      }
    }

    state.index = nextIndex;

    if (mode === 'pointing-guide' && state.bookPages && nextIndex < state.words.length) {
      const nextSpread = bookSpreadForWordIndex(reader, nextIndex);
      if (nextSpread != null && nextSpread !== getCurrentBookSpread(reader)) {
        goToBookSpread(nextSpread, {
          behavior: 'auto',
          ensureRendered: true,
          syncReaderPosition: false
        });
        state.index = nextIndex;
      }
    }

    updateReaderStatus();

    // Advance from the planned deadline, not from the end of this DOM update.
    // That prevents layout and scrolling time from accumulating into periodic
    // pauses. If one frame is late, the following delay becomes shorter rather
    // than permanently shifting the reading rhythm.
    const scheduledTickMs = (mode === 'pointing-guide' || expectedMeaningful)
      ? Math.max(40, (60000 * Math.max(1, nextIndex - startIndex)) / speed)
      : tickMs;
    state.nextTickAt += scheduledTickMs;
    const delay = Math.max(0, state.nextTickAt - performance.now());
    state.interval = window.setTimeout(paintStep, delay);
  };

  paintStep();
}

function stopReader() {
  if (state.renderedMode === 'pacman') {
    const reader = app.querySelector('#reader');
    const current = reader?.querySelector('.reader-word.pacman-current-word');
    if (current) restorePacmanWord(current);
  }
  finalizeReadingSession();
  state.runToken += 1;
  if (state.interval) window.clearTimeout(state.interval);
  state.interval = null;
  state.nextTickAt = 0;
  if (state.tickerStatusTimer) {
    window.clearInterval(state.tickerStatusTimer);
    state.tickerStatusTimer = null;
  }
  if (state.tickerAnimation) {
    state.tickerAnimation.cancel();
    state.tickerAnimation = null;
  }
  if (state.tickerFrame) {
    cancelAnimationFrame(state.tickerFrame);
    state.tickerFrame = null;
  }
  state.tickerPaused = false;
  state.tickerLastAt = 0;
}

function pauseReader() {
  if (state.renderedMode === 'digital-sign' && state.tickerFrame) {
    cancelAnimationFrame(state.tickerFrame);
    state.tickerFrame = null;
    state.runToken += 1;
    state.tickerPaused = true;
  } else if (!(state.renderedMode === 'digital-sign' && state.tickerPaused)) {
    stopReader();
  }
  const speed = app.querySelector('#speed');
  const count = app.querySelector('#word-count');
  const start = app.querySelector('#start-reader');
  const pause = app.querySelector('#pause-reader');
  if (speed) speed.disabled = false;
  if (count) count.disabled = ['digital-sign', 'two-column', 'auto-scroll', 'pacman'].includes(state.renderedMode);
  if (speed) speed.disabled = state.renderedMode === 'two-column';
  if (start) {
    start.disabled = false;
    start.textContent = state.index ? 'Resume' : 'Start';
  }
  if (pause) pause.disabled = true;
}

function resetReader() {
  // Reset is a full restart, not a pause. Cancel the animation and its status
  // timer before replacing the Digital Sign stage so Start cannot accidentally
  // resume an animation whose element is no longer in the document.
  stopReader();
  state.index = 0;
  state.tickerStartIndex = 0;
  state.tickerWordCount = 0;
  state.tickerOffset = 0;
  state.tickerNextWordIndex = 0;
  state.tickerLoadedWords = 0;
  const mode = getSelectedMode();
  prepareReaderView(mode, Number(app.querySelector('#word-count')?.value) || 1);
  updateModeControls(mode);
  updateReaderStatus(`${state.words.length.toLocaleString()} words loaded.`);
  const start = app.querySelector('#start-reader');
  if (start) start.textContent = 'Start';
}

function splitTranslationChunks(text, maxChars = 3500) {
  const source = String(text || '');
  if (!source) return [];

  const chunks = [];
  let current = '';
  const paragraphs = source.split(/(\n\s*\n)/);

  const flush = () => {
    if (current) chunks.push(current);
    current = '';
  };

  for (const part of paragraphs) {
    if (!part) continue;
    if (part.length <= maxChars) {
      if (current.length + part.length <= maxChars) current += part;
      else {
        flush();
        current = part;
      }
      continue;
    }

    flush();
    // Very long paragraphs are split on sentence/word boundaries so the
    // browser translator is never handed an unnecessarily huge request.
    let remaining = part;
    while (remaining.length > maxChars) {
      let cut = remaining.lastIndexOf('. ', maxChars);
      if (cut < Math.floor(maxChars * 0.55)) cut = remaining.lastIndexOf(' ', maxChars);
      if (cut < Math.floor(maxChars * 0.35)) cut = maxChars;
      else cut += 1;
      chunks.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut);
    }
    current = remaining;
  }
  flush();
  return chunks;
}

async function translateWithBrowser(text, sourceLanguage, targetLanguage, onProgress) {
  const BrowserTranslator = globalThis.Translator;
  if (!BrowserTranslator || typeof BrowserTranslator.create !== 'function') throw new Error('Browser translation is not available in this Chrome installation.');

  const availability = typeof BrowserTranslator.availability === 'function'
    ? await BrowserTranslator.availability({ sourceLanguage, targetLanguage })
    : 'available';
  if (availability === 'unavailable' || availability === 'no') {
    throw new Error(`Browser translation does not support ${sourceLanguage} → ${targetLanguage} on this device.`);
  }

  const translator = await BrowserTranslator.create({
    sourceLanguage,
    targetLanguage,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => {
        if (onProgress) onProgress({ type: 'download', value: event.loaded || 0 });
      });
    }
  });

  try {
    const chunks = splitTranslationChunks(text);
    const translated = [];
    for (let i = 0; i < chunks.length; i += 1) {
      if (onProgress) onProgress({ type: 'translate', current: i + 1, total: chunks.length });
      translated.push(await translator.translate(chunks[i]));
    }
    return translated.join('');
  } finally {
    if (typeof translator.destroy === 'function') translator.destroy();
  }
}

async function translateTextPreferBrowser(text, sourceLanguage, targetLanguage, onProgress) {
  try {
    const translated = await translateWithBrowser(text, sourceLanguage, targetLanguage, onProgress);
    return { text: translated, provider: 'browser' };
  } catch (browserError) {
    // Preserve the existing server/API path as a fallback for browsers that do
    // not expose Chrome's Translator API or for unsupported language pairs.
    const payload = await loadApiPayload('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, to: targetLanguage, from: sourceLanguage })
    });
    return { text: payload.text, provider: 'server', browserError };
  }
}

async function translateCurrentText() {
  const language = app.querySelector('#translation-language')?.value;
  const status = app.querySelector('#translation-status');
  const button = app.querySelector('#translate-text');
  if (!language) {
    status.textContent = 'Choose a language first.';
    status.className = 'status error';
    return;
  }

  pauseReader();
  button.disabled = true;
  status.className = 'status';
  status.textContent = `Preparing ${languages[language]} translation…`;

  try {
    const result = await translateTextPreferBrowser(state.originalText, 'en', language, (progress) => {
      if (progress.type === 'download') {
        status.textContent = `Downloading browser language pack… ${Math.round(progress.value * 100)}%`;
      } else if (progress.type === 'translate') {
        status.textContent = `Translating in browser… ${progress.current} of ${progress.total}`;
      }
    });
    state.currentText = result.text;
    state.language = language;
    state.words = splitWords(result.text);
    state.index = 0;
    state.translationCache.clear();
    const mode = getSelectedMode();
    prepareReaderView(mode);
    updateReaderStatus(`${state.words.length.toLocaleString()} translated words loaded.`);
    app.querySelector('#restore-english').disabled = false;
    app.querySelector('#word-result').innerHTML = `<h2>Word translation</h2><p>Click any translated word to see its English meaning.</p>`;
    status.textContent = result.provider === 'browser'
      ? `Translated to ${languages[language]} in your browser.`
      : `Translated to ${languages[language]} using the server fallback.`;
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function restoreEnglish() {
  pauseReader();
  state.currentText = state.originalText;
  state.language = 'en';
  state.words = splitWords(state.originalText);
  state.index = 0;
  state.translationCache.clear();
  const mode = getSelectedMode();
  prepareReaderView(mode);
  updateReaderStatus(`${state.words.length.toLocaleString()} words loaded.`);
  app.querySelector('#restore-english').disabled = true;
  app.querySelector('#translation-status').textContent = 'Restored original English text.';
  app.querySelector('#word-result').innerHTML = `<h2>Word translation</h2><p>Translate the passage, then click a word to see its English meaning here.</p>`;
}

async function handleTranslatedWordClick(event) {
  const wordElement = event.target.closest('.translated-word');
  if (!wordElement || state.language === 'en') return;
  const word = cleanLookupWord(wordElement.textContent);
  if (!word) return;

  const panel = app.querySelector('#word-result');
  const cacheKey = `${state.language}:${word.toLocaleLowerCase()}`;
  panel.innerHTML = `<h2>${escapeHtml(word)}</h2><p class="status">Looking up English translation…</p>`;

  try {
    let translation = state.translationCache.get(cacheKey);
    if (!translation) {
      try {
        translation = await translateWithBrowser(word, state.language, 'en');
      } catch {
        const payload = await loadApiPayload('/api/translate-word', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: word, from: state.language })
        });
        translation = payload.text;
      }
      state.translationCache.set(cacheKey, translation);
    }
    panel.innerHTML = `
      <h2>${escapeHtml(word)}</h2>
      <p class="word-meaning">${escapeHtml(translation)}</p>
      <p class="word-note">Individual words can have different meanings depending on sentence context.</p>`;
  } catch (error) {
    panel.innerHTML = `<h2>${escapeHtml(word)}</h2><p class="status error">${escapeHtml(error.message)}</p>`;
  }
}

function renderUrlImporter() {
  stopReader();
  app.innerHTML = `
    <section class="panel">
      <h1>Read a Web Page</h1>
      <p>Enter a public HTTP or HTTPS page. The server will extract its readable text.</p>
      <form id="url-form" class="controls">
        <div class="control"><label for="page-url">Page URL</label><input id="page-url" type="url" required placeholder="https://example.com/article"></div>
        <button class="primary" type="submit">Get URL</button>
      </form>
      <p id="url-status" class="status"></p>
    </section>`;
  app.querySelector('#url-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = app.querySelector('#url-status');
    const url = app.querySelector('#page-url').value.trim();
    status.className = 'status';
    status.textContent = 'Importing page…';
    try {
      const text = await loadApiText('/api/fetch-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      renderReaderWithText(new URL(url).hostname, text, { type: 'url', url });
    } catch (error) {
      status.className = 'status error';
      status.textContent = error.message;
    }
  });
}


function gutenbergAuthorText(book) {
  return Array.isArray(book.authors) && book.authors.length ? book.authors.join(', ') : 'Unknown author';
}

function gutenbergLanguageName(code) {
  const names = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', fi: 'Finnish', sv: 'Swedish', la: 'Latin', zh: 'Chinese' };
  return names[code] || String(code || '').toUpperCase();
}

async function renderGutenbergLibrary(options = {}) {
  stopReader();
  const search = String(options.search || '');
  const language = String(options.language || 'en');
  const page = Math.max(1, Number(options.page) || 1);
  app.innerHTML = `
    <section class="panel gutenberg-library">
      <div class="library-heading">
        <div><h1>Project Gutenberg Library</h1><p>Search public-domain books and load a plain-text edition directly into the reader.</p></div>
        <a class="secondary button-link" href="https://www.gutenberg.org/" target="_blank" rel="noopener noreferrer">Visit Gutenberg</a>
      </div>
      <form id="gutenberg-search-form" class="library-search">
        <label class="library-search-box">Search title or author<input id="gutenberg-search" type="search" value="${escapeHtml(search)}" placeholder="Sherlock Holmes, Jane Austen…"></label>
        <label>Language<select id="gutenberg-language">
          <option value="en" ${language === 'en' ? 'selected' : ''}>English</option>
          <option value="es" ${language === 'es' ? 'selected' : ''}>Spanish</option>
          <option value="fr" ${language === 'fr' ? 'selected' : ''}>French</option>
          <option value="de" ${language === 'de' ? 'selected' : ''}>German</option>
          <option value="it" ${language === 'it' ? 'selected' : ''}>Italian</option>
          <option value="pt" ${language === 'pt' ? 'selected' : ''}>Portuguese</option>
          <option value="" ${language === '' ? 'selected' : ''}>All languages</option>
        </select></label>
        <button class="primary" type="submit">Search</button>
      </form>
      <p id="gutenberg-status" class="status">Loading books…</p>
      <div id="gutenberg-results" class="gutenberg-results" aria-live="polite"></div>
      <nav id="gutenberg-pagination" class="library-pagination" aria-label="Book results pages"></nav>
      <p class="library-note">Catalog metadata is supplied by Gutendex. Book text is downloaded only when you choose “Load into Reader.” Public-domain status can vary outside the United States.</p>
    </section>`;

  const form = app.querySelector('#gutenberg-search-form');
  const status = app.querySelector('#gutenberg-status');
  const results = app.querySelector('#gutenberg-results');
  const pagination = app.querySelector('#gutenberg-pagination');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    renderGutenbergLibrary({
      search: app.querySelector('#gutenberg-search').value.trim(),
      language: app.querySelector('#gutenberg-language').value,
      page: 1
    });
  });

  try {
    const params = new URLSearchParams({ page: String(page), language });
    if (search) params.set('search', search);
    const payload = await loadApiPayload(`/api/gutenberg/books?${params}`);
    status.textContent = `${Number(payload.count || 0).toLocaleString()} matching books${search ? ` for “${search}”` : ''}. Page ${page}.`;
    if (!payload.books?.length) {
      results.innerHTML = '<div class="empty-library"><h2>No books found</h2><p>Try a broader title, author, or language.</p></div>';
    } else {
      results.innerHTML = payload.books.map((book) => `
        <article class="gutenberg-card">
          <div class="gutenberg-cover-wrap">
            ${book.cover ? `<img class="gutenberg-cover" src="${escapeHtml(book.cover)}" alt="Cover of ${escapeHtml(book.title)}" loading="lazy" referrerpolicy="no-referrer">` : '<div class="gutenberg-cover-placeholder" aria-hidden="true">📖</div>'}
          </div>
          <div class="gutenberg-card-body">
            <h2>${escapeHtml(book.title)}</h2>
            <p class="gutenberg-author">${escapeHtml(gutenbergAuthorText(book))}</p>
            <p class="gutenberg-meta">${book.languages.map(gutenbergLanguageName).join(', ') || 'Language not listed'} · ${Number(book.downloadCount || 0).toLocaleString()} downloads</p>
            ${book.subjects?.length ? `<p class="gutenberg-subjects">${escapeHtml(book.subjects.slice(0, 2).join(' · '))}</p>` : ''}
            ${bookMusicMarkup(book.title, gutenbergAuthorText(book))}
            <div class="gutenberg-actions">
              <button class="primary" type="button" data-load-gutenberg="${book.id}">Load into Reader</button>
              <a class="secondary button-link" href="${escapeHtml(book.gutenbergUrl)}" target="_blank" rel="noopener noreferrer">Book page</a>
            </div>
            <p class="status book-load-status" data-book-status="${book.id}"></p>
          </div>
        </article>`).join('');
    }

    pagination.innerHTML = `
      <button class="secondary" type="button" data-library-page="${page - 1}" ${payload.hasPrevious ? '' : 'disabled'}>← Previous</button>
      <span>Page ${page}</span>
      <button class="secondary" type="button" data-library-page="${page + 1}" ${payload.hasNext ? '' : 'disabled'}>Next →</button>`;

    pagination.querySelectorAll('[data-library-page]').forEach((button) => {
      button.addEventListener('click', () => renderGutenbergLibrary({ search, language, page: Number(button.dataset.libraryPage) }));
    });

    results.querySelectorAll('[data-load-gutenberg]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.dataset.loadGutenberg);
        const bookStatus = results.querySelector(`[data-book-status="${id}"]`);
        button.disabled = true;
        button.textContent = 'Loading…';
        bookStatus.textContent = 'Downloading the plain-text edition…';
        try {
          const book = await loadApiPayload(`/api/gutenberg/books/${id}/text`);
          const author = book.authors?.length ? ` — ${book.authors.join(', ')}` : '';
          renderReaderWithText(`${book.title}${author}`, book.text, { type: 'gutenberg', id: book.id });
        } catch (error) {
          button.disabled = false;
          button.textContent = 'Load into Reader';
          bookStatus.className = 'status error book-load-status';
          bookStatus.textContent = error.message;
        }
      });
    });
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
    results.innerHTML = '<div class="empty-library"><h2>Catalog unavailable</h2><p>The catalog may be waking up or temporarily busy.</p><button class="secondary" type="button" id="retry-gutenberg">Try again</button></div>';
    app.querySelector('#retry-gutenberg')?.addEventListener('click', () => renderGutenbergLibrary({ search, language, page }));
  }
}


function groupBy(items, key) {
  return items.reduce((groups, item) => {
    const value = item[key] || 'Other';
    (groups[value] ||= []).push(item);
    return groups;
  }, {});
}

function normalizeLibraryMatchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(the|a|an|volume|vol|book|works|complete|selected|selections)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreGreatBookCandidate(item, candidate) {
  const wantedTitle = normalizeLibraryMatchText(item.title);
  const wantedAuthor = normalizeLibraryMatchText(item.author);
  const candidateTitle = normalizeLibraryMatchText(candidate.title);
  const candidateAuthor = normalizeLibraryMatchText(candidate.author);
  if (!candidateTitle) return -1000;

  let score = 0;
  if (candidateTitle === wantedTitle) score += 100;
  else {
    const wantedWords = new Set(wantedTitle.split(' ').filter(Boolean));
    const candidateWords = new Set(candidateTitle.split(' ').filter(Boolean));
    const overlap = [...wantedWords].filter((word) => candidateWords.has(word)).length;
    const denominator = Math.max(1, Math.min(wantedWords.size, candidateWords.size));
    score += (overlap / denominator) * 65;
    if (candidateTitle.includes(wantedTitle) || wantedTitle.includes(candidateTitle)) score += 20;
  }

  if (wantedAuthor && candidateAuthor) {
    const authorWords = wantedAuthor.split(' ').filter((word) => word.length > 2);
    const authorHits = authorWords.filter((word) => candidateAuthor.includes(word)).length;
    score += Math.min(25, authorHits * 8);
  }

  // Prefer sources that are directly readable. Within readable sources,
  // favor curated/proofread editions before OCR when relevance is comparable.
  const providerBonus = {
    standardebooks: 14,
    wikisource: 11,
    gutenberg: 9,
    internetarchive: 6,
    openlibrary: 0
  };
  score += providerBonus[candidate.provider] || 0;
  if (!candidate.readable) score -= 200;
  return score;
}


function validateGreatBookPrimaryText(item, candidate, loaded) {
  const text = String(loaded?.text || '').trim();
  const words = splitWords(text);
  const loadedTitle = loaded?.title || candidate?.title || '';
  const loadedAuthor = loaded?.author || candidate?.author || '';

  if (!text || words.length < 1500) {
    return { ok:false, reason:`Only ${words.length.toLocaleString()} readable words were returned; this looks like an excerpt or summary rather than the complete work.` };
  }

  const matchScore = scoreGreatBookCandidate(item, {
    ...candidate,
    title: loadedTitle || candidate?.title,
    author: loadedAuthor || candidate?.author,
    readable: true
  });

  if (matchScore < 45) {
    return { ok:false, reason:'The returned text does not match the requested title/author closely enough.' };
  }

  const opening = text.slice(0, 9000).toLowerCase();
  const summarySignals = [
    /\bplot summary\b/,
    /\bchapter summary\b/,
    /\bbook summary\b/,
    /\bsummary and analysis\b/,
    /\bstudy guide\b/,
    /\bcliffsnotes\b/,
    /\bsparknotes\b/,
    /\bshmoop\b/,
    /\bsynopsis\b/,
    /\babout the book\b/,
    /\bthis article is about\b/,
    /\boverview of\b/
  ];
  const signal = summarySignals.find((pattern) => pattern.test(opening));
  if (signal) {
    return { ok:false, reason:'The returned page appears to be summary/commentary material rather than the primary text.' };
  }

  // A true full-text edition normally has considerably more text than a catalog
  // extract. Keep the threshold lower for known short Great Books selections.
  const shortWorkPattern = /waste land|rose for emily|prussian officer|beast in the jungle|metamorphosis|saint joan|waiting for godot|fear and trembling|what is metaphysics/i;
  const minimumWords = shortWorkPattern.test(item.title) ? 1200 : 3000;
  if (words.length < minimumWords) {
    return { ok:false, reason:`The returned text is only ${words.length.toLocaleString()} words, which is too short to trust as the complete requested work.` };
  }

  return { ok:true, words:words.length, matchScore };
}

async function loadGreatBookEdition(item, status, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Searching libraries…';
  status.className = 'status book-load-status';
  status.textContent = 'Searching Standard Ebooks, Internet Archive, Open Library, Wikisource, and Project Gutenberg…';

  try {
    // Search the unified catalog, using title + author for better precision.
    const searchTerms = [
      `${item.title} ${item.author}`.trim(),
      item.query || item.title,
      item.title
    ].filter((value, index, all) => value && all.indexOf(value) === index);

    const candidatesByKey = new Map();
    const searchErrors = [];

    for (const query of searchTerms) {
      try {
        const payload = await loadApiPayload(`/api/library/search?q=${encodeURIComponent(query)}&provider=all`);
        (payload.books || []).forEach((book) => {
          const key = `${book.provider}:${book.id}`;
          if (!candidatesByKey.has(key)) candidatesByKey.set(key, book);
        });
        if ([...candidatesByKey.values()].some((book) => book.readable && scoreGreatBookCandidate(item, book) >= 70)) break;
      } catch (error) {
        searchErrors.push(error.message);
      }
    }

    const candidates = [...candidatesByKey.values()]
      .filter((book) => book.readable)
      .map((book) => ({ ...book, matchScore: scoreGreatBookCandidate(item, book) }))
      .filter((book) => book.matchScore >= 40)
      .sort((a, b) => b.matchScore - a.matchScore);

    if (!candidates.length) {
      const discovery = [...candidatesByKey.values()]
        .filter((book) => !book.readable)
        .sort((a,b) => scoreGreatBookCandidate(item,b) - scoreGreatBookCandidate(item,a))[0];
      if (discovery?.externalUrl) {
        status.innerHTML = `No directly readable edition was found. <a href="${escapeHtml(discovery.externalUrl)}" target="_blank" rel="noopener noreferrer">Open the closest catalog result</a>.`;
      } else {
        throw new Error(searchErrors[0] || 'No readable edition was found in the connected public book libraries.');
      }
      button.disabled = false;
      button.textContent = original;
      return;
    }

    const failed = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const provider = LIBRARY_PROVIDERS[candidate.provider]?.label || candidate.provider;
      button.textContent = `Trying ${provider}…`;
      status.textContent = `Found ${candidates.length} possible full-text edition${candidates.length === 1 ? '' : 's'}. Verifying ${provider}: ${candidate.title}…`;

      try {
        const loaded = await loadApiPayload(`/api/library/read?provider=${encodeURIComponent(candidate.provider)}&id=${encodeURIComponent(candidate.id)}`);
        const text = String(loaded.text || '').trim();
        const validation = validateGreatBookPrimaryText(item, candidate, loaded);
        if (!validation.ok) throw new Error(validation.reason);

        const title = loaded.title || candidate.title || item.title;
        const author = loaded.author || candidate.author || item.author || '';
        renderReaderWithText(`${title}${author ? ` — ${author}` : ''}`, text, {
          type: candidate.provider,
          id: candidate.id,
          sourceUrl: loaded.sourceUrl || candidate.externalUrl || '',
          collection: 'great-books',
          greatBooksTitle: item.title,
          greatBooksAuthor: item.author,
          verifiedPrimaryText: true
        });
        return;
      } catch (error) {
        failed.push(`${provider}: ${error.message}`);
      }
    }

    throw new Error(`Matching editions were found, but none could be opened. ${failed.slice(0,3).join(' · ')}`);
  } catch (error) {
    button.disabled = false;
    button.textContent = original;
    status.className = 'status error book-load-status';
    status.textContent = error.message;
  }
}


const STUDY_LANGUAGE_KEY = 'markSetGoStudyLanguageV1';
const LAST_BIBLE_PASSAGE_KEY = 'markSetGoLastBiblePassageV1';
const SYNTOPICON_SAVED_KEY = 'markSetGoSyntopiconSavedV1';

const studyLanguages = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  uk: 'Ukrainian',
  el: 'Greek',
  he: 'Hebrew',
  la: 'Latin',
  ar: 'Arabic',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean'
};

const greatIdeasCatalog = [
  'Angel', 'Animal', 'Aristocracy', 'Art', 'Astronomy', 'Beauty', 'Being', 'Cause',
  'Chance', 'Change', 'Citizen', 'Constitution', 'Courage', 'Custom and Convention',
  'Definition', 'Democracy', 'Desire', 'Dialectic', 'Duty', 'Education', 'Emotion',
  'Equality', 'Eternity', 'Evolution', 'Experience', 'Family', 'Fate', 'Form',
  'Freedom', 'Friendship', 'God', 'Good and Evil', 'Government', 'Habit',
  'Happiness', 'History', 'Honor', 'Hypothesis', 'Idea', 'Immortality', 'Induction',
  'Infinity', 'Judgment', 'Justice', 'Knowledge', 'Labor', 'Language', 'Law',
  'Liberty', 'Life and Death', 'Logic', 'Love', 'Man', 'Mathematics', 'Matter',
  'Mechanics', 'Medicine', 'Memory and Imagination', 'Metaphysics', 'Mind',
  'Monarchy', 'Nature', 'Necessity and Contingency', 'Oligarchy', 'One and Many',
  'Opinion', 'Opposition', 'Philosophy', 'Physics', 'Pleasure and Pain', 'Poetry',
  'Principle', 'Progress', 'Prophecy', 'Prudence', 'Punishment', 'Quality',
  'Quantity', 'Reasoning', 'Relation', 'Religion', 'Revolution', 'Rhetoric',
  'Same and Other', 'Science', 'Sense', 'Sign and Symbol', 'Sin', 'Slavery',
  'Soul', 'Space', 'State', 'Temperance', 'Theology', 'Time', 'Truth',
  'Tyranny', 'Universal and Particular', 'Virtue and Vice', 'War and Peace',
  'Wealth', 'Will', 'Wisdom', 'World'
];

function studyLanguageOptions(selected = 'en') {
  return Object.entries(studyLanguages).map(([code,name]) =>
    `<option value="${code}" ${code === selected ? 'selected' : ''}>${escapeHtml(name)}</option>`
  ).join('');
}

function getStudyLanguage() {
  return localStorage.getItem(STUDY_LANGUAGE_KEY) || 'en';
}

function setStudyLanguage(code) {
  localStorage.setItem(STUDY_LANGUAGE_KEY, code || 'en');
}

function getLastBiblePassage() {
  try { return JSON.parse(localStorage.getItem(LAST_BIBLE_PASSAGE_KEY) || 'null'); } catch { return null; }
}

function saveLastBiblePassage(value) {
  try { localStorage.setItem(LAST_BIBLE_PASSAGE_KEY, JSON.stringify(value)); } catch {}
}

function savedSyntopiconAnalyses() {
  try {
    const value = JSON.parse(localStorage.getItem(SYNTOPICON_SAVED_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function saveSyntopiconAnalysis(value) {
  const saved = savedSyntopiconAnalyses();
  saved.unshift(value);
  localStorage.setItem(SYNTOPICON_SAVED_KEY, JSON.stringify(saved.slice(0, 50)));
}

async function translateStudyBlock(text, targetLanguage, statusElement) {
  if (!text || !targetLanguage || targetLanguage === 'en') return text;
  if (statusElement) statusElement.textContent = `Translating to ${studyLanguages[targetLanguage] || targetLanguage}…`;
  const result = await translateTextPreferBrowser(text, 'en', targetLanguage, (progress) => {
    if (!statusElement) return;
    if (progress.type === 'download') statusElement.textContent = `Downloading language pack… ${Math.round(progress.value * 100)}%`;
    if (progress.type === 'translate') statusElement.textContent = `Translating… ${progress.current} of ${progress.total}`;
  });
  if (statusElement) statusElement.textContent = result.provider === 'browser' ? 'Translated in browser.' : 'Translated using server fallback.';
  return result.text;
}

function renderSyntopiconResult(analysis, meta) {
  stopReader();
  app.innerHTML = `
    <section class="panel syntopicon-result-page">
      <div class="library-heading">
        <div><span class="source-category">Syntopicon</span><h1>${escapeHtml(analysis.idea || meta.idea)}</h1><p>${escapeHtml(analysis.centralQuestion || '')}</p></div>
        <div class="source-actions"><button id="save-syntopicon-result" class="secondary" type="button">Save Study</button><button class="secondary" type="button" data-read="syntopicon">New Comparison</button></div>
      </div>
      <div class="syntopicon-result-grid">
        <article class="study-guide-card"><h2>Shared Terms</h2>${(analysis.terms || []).map((item)=>`<div class="study-connection"><strong>${escapeHtml(item.term)}</strong><p>${escapeHtml(item.meaning)}</p></div>`).join('')}</article>
        <article class="study-guide-card"><h2>Agreements</h2><ul>${(analysis.agreements || []).map((item)=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
        <article class="study-guide-card"><h2>Disagreements</h2><ul>${(analysis.disagreements || []).map((item)=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
        <article class="study-guide-card"><h2>Important Distinctions</h2><ul>${(analysis.distinctions || []).map((item)=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
        <section class="study-guide-wide"><h2>Positions by Source</h2><div class="great-idea-grid">
          ${(analysis.sourcePositions || []).map((item)=>`<article class="great-idea-card"><h3>${escapeHtml(item.source)}</h3><p>${escapeHtml(item.position)}</p><p class="syntopicon-evidence"><strong>Basis:</strong> ${escapeHtml(item.evidenceBasis)}</p><ul>${(item.questions || []).map((q)=>`<li>${escapeHtml(q)}</li>`).join('')}</ul></article>`).join('')}
        </div></section>
        <article class="study-guide-card"><h2>Questions to Pursue</h2><ol>${(analysis.studyQuestions || []).map((q)=>`<li>${escapeHtml(q)}</li>`).join('')}</ol></article>
        <article class="study-guide-card"><h2>Suggested Reading Path</h2><ol>${(analysis.readingPath || []).map((item)=>`<li><strong>${escapeHtml(item.source)}</strong><p>${escapeHtml(item.reason)}</p></li>`).join('')}</ol></article>
      </div>
    </section>`;
  app.querySelector('#save-syntopicon-result')?.addEventListener('click', (event) => {
    saveSyntopiconAnalysis({ ...meta, analysis, savedAt: new Date().toISOString() });
    event.currentTarget.textContent = 'Saved';
    event.currentTarget.disabled = true;
  });
}

function renderSyntopicon() {
  recordLearningActivity('great-ideas', { title:state?.title || '' });
  stopReader();
  const lastBible = getLastBiblePassage();
  const language = getStudyLanguage();
  const saved = savedSyntopiconAnalyses();

  app.innerHTML = `
    <section class="panel syntopicon-page">
      <div class="library-heading">
        <div><span class="source-category">Discover · Syntopical Reading</span><h1>Syntopicon</h1><p>Study one Great Idea across multiple books and Bible passages. The goal is comparison: shared terms, competing answers, agreements, disagreements, and the questions that remain.</p></div>
        <button class="secondary" type="button" data-action="reader">Return to Reader</button>
      </div>

      <div class="syntopicon-builder">
        <section class="syntopicon-step">
          <span>1</span><div><h2>Choose the Great Idea</h2><p>Select a classic idea or enter your own question/topic.</p></div>
          <label>Great Idea<select id="syntopicon-idea"><option value="">Choose an idea…</option>${greatIdeasCatalog.map((idea)=>`<option value="${escapeHtml(idea)}">${escapeHtml(idea)}</option>`).join('')}</select></label>
          <label>Or custom idea<input id="syntopicon-custom-idea" type="text" placeholder="e.g. What makes political authority legitimate?"></label>
        </section>

        <section class="syntopicon-step">
          <span>2</span><div><h2>Select Sources</h2><p>Choose at least two sources. Great Book entries without supplied excerpts are treated as work-level orientation, not quoted textual evidence.</p></div>
          ${lastBible ? `<label class="syntopicon-source bible-source"><input type="checkbox" data-syntopicon-bible checked><div><strong>${escapeHtml(lastBible.title)}</strong><small>${escapeHtml(lastBible.translation || 'Bible')} · exact chapter text available</small></div></label>` : `<div class="help-note">Load a Bible chapter in Bible Study if you want it available here as an exact-text source.</div>`}
          <label class="curated-filter">Filter Great Books<input id="syntopicon-book-filter" type="search" placeholder="Plato, Augustine, Locke, Tolstoy…"></label>
          <div id="syntopicon-books" class="syntopicon-books">
            ${greatBooksCatalog.map((book,index)=>`<label class="syntopicon-source" data-syntopicon-book-card data-search-text="${escapeHtml(`${book.title} ${book.author} ${book.era}`.toLowerCase())}"><input type="checkbox" data-syntopicon-book="${index}"><div><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.author)} · Vol. ${book.volume}</small></div></label>`).join('')}
          </div>
        </section>

        <section class="syntopicon-step">
          <span>3</span><div><h2>Analysis Language</h2><p>The comparative study can be generated directly in another language.</p></div>
          <label>Language<select id="syntopicon-language">${studyLanguageOptions(language)}</select></label>
        </section>

        <div class="syntopicon-actions">
          <button id="run-syntopicon" class="primary" type="button">Compare Selected Sources</button>
          <span id="syntopicon-status" class="status"></span>
        </div>
      </div>

      ${saved.length ? `<section class="dashboard-section"><h2>Saved Syntopical Studies</h2><div class="activity-list">${saved.slice(0,8).map((item,index)=>`<article><div><strong>${escapeHtml(item.idea || item.analysis?.idea || 'Study')}</strong><span>${new Date(item.savedAt).toLocaleString()}</span></div><p>${escapeHtml(item.analysis?.centralQuestion || '')}</p><button class="secondary" type="button" data-open-syntopicon="${index}">Open</button></article>`).join('')}</div></section>` : ''}
    </section>`;

  app.querySelector('#syntopicon-book-filter')?.addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    app.querySelectorAll('[data-syntopicon-book-card]').forEach((card) => {
      card.hidden = Boolean(query) && !card.dataset.searchText.includes(query);
    });
  });

  app.querySelector('#syntopicon-language')?.addEventListener('change', (event) => setStudyLanguage(event.target.value));

  app.querySelector('#run-syntopicon')?.addEventListener('click', async (event) => {
    const idea = app.querySelector('#syntopicon-custom-idea').value.trim() || app.querySelector('#syntopicon-idea').value;
    const status = app.querySelector('#syntopicon-status');
    if (!idea) { status.className='status error'; status.textContent='Choose or enter a Great Idea.'; return; }

    const sources = [];
    if (lastBible && app.querySelector('[data-syntopicon-bible]')?.checked) {
      sources.push({ id:'last-bible', title:lastBible.title, author:lastBible.translation || 'Bible', type:'bible', excerpt:lastBible.text || '' });
    }
    app.querySelectorAll('[data-syntopicon-book]:checked').forEach((input) => {
      const book = greatBooksCatalog[Number(input.dataset.syntopiconBook)];
      if (book) sources.push({ id:`great-${input.dataset.syntopiconBook}`, title:book.title, author:book.author, type:'great-book', excerpt:'' });
    });
    if (sources.length < 2) { status.className='status error'; status.textContent='Select at least two sources.'; return; }

    const languageCode = app.querySelector('#syntopicon-language').value || 'en';
    setStudyLanguage(languageCode);
    const button = event.currentTarget;
    button.disabled=true; button.textContent='Comparing…';
    status.className='status'; status.textContent='Building a syntopical map of the selected sources…';
    try {
      const analysis = await loadApiPayload('/api/syntopicon', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ idea, language:studyLanguages[languageCode] || 'English', sources })
      });
      renderSyntopiconResult(analysis, { idea, language:languageCode, sources:sources.map(({excerpt,...rest})=>rest) });
    } catch(error) {
      status.className='status error'; status.textContent=error.message;
      button.disabled=false; button.textContent='Compare Selected Sources';
    }
  });

  app.querySelectorAll('[data-open-syntopicon]').forEach((button)=>button.addEventListener('click',()=>{
    const item=saved[Number(button.dataset.openSyntopicon)];
    if(item?.analysis) renderSyntopiconResult(item.analysis,item);
  }));
}


function greatBookGrokipediaUrl(book) {
  return grokipediaSearchUrl(book.title, book.author);
}

function bibleTextFragment(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (typeof value.text === 'string') return value.text;
  if (typeof value.heading === 'string') return value.heading;
  if (value.lineBreak) return '\n';
  return '';
}

function bibleItemText(item) {
  return (item?.content || [])
    .map(bibleTextFragment)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenBibleContent(content) {
  // Study view: retain explicit headings and paragraph breaks from the source.
  // Verses remain readable inline rather than being misidentified as headings.
  const blocks = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(paragraph.join(' '));
    paragraph = [];
  };

  for (const item of Array.isArray(content) ? content : []) {
    if (item?.type === 'heading' || item?.type === 'hebrew_subtitle') {
      flushParagraph();
      const heading = bibleItemText(item);
      if (heading) blocks.push(heading);
      continue;
    }

    if (item?.type === 'verse') {
      const verseText = bibleItemText(item);
      if (verseText) paragraph.push(`${item.number}. ${verseText}`);
      continue;
    }

    if (item?.type === 'line_break') {
      flushParagraph();
    }
  }

  flushParagraph();
  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

function buildBibleReaderDocument(payload, {
  bookName = '',
  chapterNumber = null,
  includeChapterHeading = true
} = {}) {
  const content = payload?.chapter?.content || payload?.content || [];
  const resolvedChapter = Number(payload?.chapter?.number || chapterNumber || 1);
  const structures = [];
  const toc = [];
  const paragraphBreaks = [];
  const verseNumberIndexes = [];
  const pieces = [];
  let wordIndex = 0;
  let paragraphWords = [];

  const appendRaw = (text) => {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return { start: wordIndex, end: wordIndex };
    const count = splitWords(clean).length;
    const start = wordIndex;
    pieces.push(clean);
    wordIndex += count;
    return { start, end: wordIndex };
  };

  const flushParagraph = () => {
    if (!paragraphWords.length) return;
    paragraphBreaks.push(wordIndex);
    appendRaw(paragraphWords.join(' '));
    paragraphWords = [];
  };

  if (includeChapterHeading) {
    const chapterTitle = `Chapter ${resolvedChapter}`;
    const range = appendRaw(chapterTitle);
    structures.push({
      title: chapterTitle,
      type: 'chapter',
      start: range.start,
      end: range.end,
      preferredToc: true,
      authoritative: true
    });
    toc.push({
      title: chapterTitle,
      index: range.start,
      type: 'chapter'
    });
  }

  for (const item of Array.isArray(content) ? content : []) {
    if (item?.type === 'heading' || item?.type === 'hebrew_subtitle') {
      flushParagraph();
      const heading = bibleItemText(item);
      if (!heading) continue;
      paragraphBreaks.push(wordIndex);
      const range = appendRaw(heading);
      structures.push({
        title: heading,
        type: 'section',
        start: range.start,
        end: range.end,
        preferredToc: true,
        authoritative: true
      });
      paragraphBreaks.push(wordIndex);
      continue;
    }

    if (item?.type === 'verse') {
      const verseText = bibleItemText(item);
      if (!verseText) continue;
      // Keep the verse number as its own word so it can be visually subdued.
      // It is not structural and can never become a TOC entry.
      const verseNumberToken = `${item.number}.`;
      verseNumberIndexes.push(wordIndex + splitWords(paragraphWords.join(' ')).length);
      paragraphWords.push(verseNumberToken, verseText);
      continue;
    }

    if (item?.type === 'line_break') {
      flushParagraph();
    }
  }

  flushParagraph();

  // Remove duplicate adjacent break positions.
  const cleanBreaks = [...new Set(paragraphBreaks)]
    .filter((index) => index > 0 && index < wordIndex)
    .sort((x, y) => x - y);

  return {
    text: pieces.join('\n\n').trim(),
    structure: structures,
    toc,
    paragraphBreaks: cleanBreaks,
    verseNumberIndexes,
    bookName,
    chapterNumber: resolvedChapter
  };
}

function flattenCommentaryContent(payload) {
  const intro = String(payload?.chapter?.introduction || payload?.introduction || '').trim();
  const content = payload?.chapter?.content || payload?.content || [];
  const body = flattenBibleContent(content);
  return [intro, body].filter(Boolean).join('\n\n').trim();
}

function collectDatasetReferences(payload) {
  const refs = [];
  const walk = (value, verseNumber = null) => {
    if (Array.isArray(value)) return value.forEach((item) => walk(item, verseNumber));
    if (!value || typeof value !== 'object') return;
    const currentVerse = value.verse ?? value.number ?? verseNumber;
    const candidates = value.references || value.crossReferences || value.refs || value.content;
    if (Array.isArray(candidates)) {
      candidates.forEach((ref) => {
        if (typeof ref === 'string') refs.push({ verse: currentVerse, reference: ref });
        else if (ref && typeof ref === 'object') {
          const book = ref.book || ref.bookId || ref.bookName || '';
          const chapter = ref.chapter || '';
          const verse = ref.verse || ref.startVerse || '';
          const endVerse = ref.endVerse || '';
          const label = ref.reference || ref.label || [book, chapter && `${chapter}:${verse}${endVerse && endVerse !== verse ? `-${endVerse}` : ''}`].filter(Boolean).join(' ');
          if (label) refs.push({ verse: currentVerse, reference: label });
        }
      });
    }
    Object.entries(value).forEach(([key, child]) => {
      if (!['references','crossReferences','refs','content'].includes(key)) walk(child, currentVerse);
    });
  };
  walk(payload);
  return refs.slice(0, 500);
}

async function renderBibleStudy() {
  stopReader();
  app.innerHTML = `
    <section class="panel bible-study-page">
      <div class="library-heading">
        <div><span class="source-category">Discover · Study</span><h1>Bible Study</h1><p>Read chapters or books, compare translations, consult public-domain commentaries, follow cross references, and generate Great Ideas study guides.</p></div>
        <button class="secondary" type="button" data-action="reader">Return to Reader</button>
      </div>

      <div class="bible-language-toolbar">
        <label>Bible language<select id="bible-language-filter"><option value="">All languages</option></select></label>
        <label>Study / display language<select id="bible-study-language">${studyLanguageOptions(getStudyLanguage())}</select></label>
        <button id="bible-translate-display" class="secondary" type="button" disabled>Translate Displayed Chapter</button>
        <button id="bible-restore-display" class="secondary" type="button" disabled>Restore Source Translation</button>
      </div>
      <div class="bible-study-controls">
        <label>Translation<select id="bible-translation"><option>Loading translations…</option></select></label>
        <label>Book<select id="bible-book" disabled><option>Select a translation</option></select></label>
        <label>Chapter<select id="bible-chapter" disabled><option>—</option></select></label>
        <label>Compare with<select id="bible-compare"><option value="">No comparison</option></select></label>
      </div>

      <div class="bible-study-actions">
        <button id="bible-load" class="primary" type="button" disabled>Load Chapter</button>
        <button id="bible-reader" class="secondary" type="button" disabled>Read Chapter</button>
        <button id="bible-read-book" class="secondary" type="button" disabled>Read Entire Book</button>
        <button id="bible-study-guide" class="secondary" type="button" disabled>Study / Great Ideas</button>
        <a id="bible-grokipedia" class="secondary button-link" href="${grokipediaSearchUrl('Bible')}" target="_blank" rel="noopener noreferrer">Grokipedia</a>
      </div>

      <div class="bible-study-tabs" role="tablist" aria-label="Bible study tools">
        <button class="active" type="button" data-bible-tab="text">Text</button>
        <button type="button" data-bible-tab="commentary">Commentary</button>
        <button type="button" data-bible-tab="crossrefs">Cross References</button>
        <button type="button" data-bible-tab="profiles">Profiles</button>
        <button type="button" data-bible-tab="notes">Notes</button>
      </div>

      <p id="bible-status" class="status"></p>

      <section data-bible-view="text" class="bible-study-view active">
        <div id="bible-results" class="bible-results">
          <div class="empty-library"><h2>Choose a translation, book, and chapter</h2><p>Load a chapter to read, compare, study, or send it into the main reader.</p></div>
        </div>
      </section>

      <section data-bible-view="commentary" class="bible-study-view">
        <div class="bible-tool-heading"><div><h2>Commentary</h2><p>Select a public-domain commentary for the current chapter.</p></div>
          <label>Commentary<select id="bible-commentary"><option value="">Loading commentaries…</option></select></label>
        </div>
        <div id="bible-commentary-result" class="bible-study-resource"><p class="navigation-empty">Load a chapter, then choose a commentary.</p></div>
      </section>

      <section data-bible-view="crossrefs" class="bible-study-view">
        <div class="bible-tool-heading"><div><h2>Cross References</h2><p>Explore related passages from available open datasets.</p></div>
          <label>Dataset<select id="bible-dataset"><option value="">Loading datasets…</option></select></label>
        </div>
        <div id="bible-crossref-result" class="bible-study-resource"><p class="navigation-empty">Load a chapter to view related references.</p></div>
      </section>

      <section data-bible-view="profiles" class="bible-study-view">
        <div class="bible-tool-heading"><div><h2>People & Profiles</h2><p>Profiles are available where the selected commentary provides them.</p></div></div>
        <div id="bible-profile-result" class="bible-study-resource"><p class="navigation-empty">Choose a commentary with profile data.</p></div>
      </section>

      <section data-bible-view="notes" class="bible-study-view">
        <div class="bible-tool-heading"><div><h2>Study Notes</h2><p>Keep observations and questions tied to this chapter.</p></div></div>
        <textarea id="bible-study-notes" rows="10" placeholder="Observations, questions, themes, connections…"></textarea>
        <div class="bible-study-actions"><button id="save-bible-notes" class="secondary" type="button">Save Notes</button><span id="bible-notes-status" class="status"></span></div>
      </section>
    </section>`;

  const translationSelect = app.querySelector('#bible-translation');
  const compareSelect = app.querySelector('#bible-compare');
  const bookSelect = app.querySelector('#bible-book');
  const chapterSelect = app.querySelector('#bible-chapter');
  const commentarySelect = app.querySelector('#bible-commentary');
  const datasetSelect = app.querySelector('#bible-dataset');
  const bibleLanguageFilter = app.querySelector('#bible-language-filter');
  const bibleStudyLanguage = app.querySelector('#bible-study-language');
  const status = app.querySelector('#bible-status');

  let chapterPayload = null;
  let chapterText = '';
  let displayedChapterText = '';
  let commentaries = [];
  let datasets = [];
  let bibleTranslations = [];

  const setStatus = (message, error = false) => {
    status.className = `status${error ? ' error' : ''}`;
    status.textContent = message || '';
  };

  const bookLabel = () => bookSelect.selectedOptions[0]?.textContent?.replace(/\s+·.*$/,'') || 'Bible';
  const referenceLabel = () => `${bookLabel()} ${chapterSelect.value || ''}`.trim();
  const notesKey = () => `markSetGoBibleNotesV1:${translationSelect.value}:${bookSelect.value}:${chapterSelect.value}`;

  const selectTab = (tab) => {
    app.querySelectorAll('[data-bible-tab]').forEach((button) => {
      const active = button.dataset.bibleTab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    app.querySelectorAll('[data-bible-view]').forEach((view) => {
      view.classList.toggle('active', view.dataset.bibleView === tab);
    });
  };

  app.querySelectorAll('[data-bible-tab]').forEach((button) => {
    button.addEventListener('click', () => selectTab(button.dataset.bibleTab));
  });

  const popularOrder = ['KJV','BSB','WEB','ASV','YLT','DARBY'];

  try {
    const [translationsPayload, commentariesPayload, datasetsPayload] = await Promise.all([
      loadApiPayload('/api/bible/translations'),
      loadApiPayload('/api/bible/commentaries'),
      loadApiPayload('/api/bible/datasets')
    ]);
    bibleTranslations = translationsPayload.translations || [];
    bibleTranslations.sort((a,b) => {
      const ai = popularOrder.indexOf(a.id), bi = popularOrder.indexOf(b.id);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return `${a.languageName} ${a.name}`.localeCompare(`${b.languageName} ${b.name}`);
    });
    const languageNames = [...new Set(bibleTranslations.map((item)=>item.languageName || item.language).filter(Boolean))].sort();
    bibleLanguageFilter.innerHTML = `<option value="">All languages</option>${languageNames.map((name)=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}`;
    const englishName = languageNames.find((name)=>/^english$/i.test(name));
    if (englishName) bibleLanguageFilter.value = englishName;

    const renderTranslationOptions = () => {
      const filterLanguage = bibleLanguageFilter.value;
      const filtered = bibleTranslations.filter((item)=>!filterLanguage || (item.languageName || item.language) === filterLanguage);
      const options = filtered.map((item)=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.shortName)} — ${escapeHtml(item.name)}</option>`).join('');
      const previous = translationSelect.value;
      translationSelect.innerHTML = options;
      compareSelect.innerHTML = `<option value="">No comparison</option>${options}`;
      const preferred = filtered.find((item)=>item.id === previous) || filtered.find((item)=>item.id === 'KJV') || filtered.find((item)=>item.id === 'BSB') || filtered[0];
      if (preferred) translationSelect.value = preferred.id;
    };
    renderTranslationOptions();
    bibleLanguageFilter.addEventListener('change', async () => {
      renderTranslationOptions();
      if (translationSelect.value) await loadBooks();
    });

    commentaries = commentariesPayload.commentaries || [];
    commentarySelect.innerHTML = `<option value="">Choose commentary…</option>${commentaries.map((item)=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}`;

    datasets = datasetsPayload.datasets || [];
    datasetSelect.innerHTML = `<option value="">Choose dataset…</option>${datasets.map((item)=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}`;
    const crossRef = datasets.find((item) => /cross/i.test(item.name) || /cross-ref/i.test(item.id));
    if (crossRef) datasetSelect.value = crossRef.id;

    await loadBooks();
  } catch (error) {
    setStatus(error.message, true);
    return;
  }

  async function loadBooks() {
    setStatus('Loading books…');
    const payload = await loadApiPayload(`/api/bible/${encodeURIComponent(translationSelect.value)}/books`);
    const books = payload.books || [];
    bookSelect.innerHTML = books.map((book)=>`<option value="${escapeHtml(book.id)}" data-chapters="${Number(book.numberOfChapters)}">${escapeHtml(book.name)}${book.isApocryphal ? ' · Deuterocanonical/Apocryphal' : ''}</option>`).join('');
    bookSelect.disabled = false;
    updateChapters();
    setStatus('');
  }

  function updateChapters() {
    const option = bookSelect.selectedOptions[0];
    const count = Math.max(1, Number(option?.dataset.chapters) || 1);
    chapterSelect.innerHTML = Array.from({length:count},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
    chapterSelect.disabled=false;
    app.querySelector('#bible-load').disabled=false;
    app.querySelector('#bible-read-book').disabled=false;
    updateGrokipedia();
    loadSavedNotes();
  }

  function updateGrokipedia() {
    app.querySelector('#bible-grokipedia').href = grokipediaSearchUrl(`${referenceLabel()} Bible`);
  }

  function loadSavedNotes() {
    app.querySelector('#bible-study-notes').value = localStorage.getItem(notesKey()) || '';
  }

  async function fetchChapter(translation) {
    return loadApiPayload(`/api/bible/${encodeURIComponent(translation)}/${encodeURIComponent(bookSelect.value)}/${encodeURIComponent(chapterSelect.value)}`);
  }

  async function loadCommentary() {
    const id = commentarySelect.value;
    const result = app.querySelector('#bible-commentary-result');
    if (!id || !chapterPayload) {
      result.innerHTML = '<p class="navigation-empty">Load a chapter, then choose a commentary.</p>';
      return;
    }
    result.innerHTML = '<p class="status">Loading commentary…</p>';
    try {
      const payload = await loadApiPayload(`/api/bible/commentary/${encodeURIComponent(id)}/${encodeURIComponent(bookSelect.value)}/${encodeURIComponent(chapterSelect.value)}`);
      const text = flattenCommentaryContent(payload);
      result.innerHTML = text
        ? `<article class="bible-resource-card"><div class="bible-resource-title"><h3>${escapeHtml(commentarySelect.selectedOptions[0]?.textContent || 'Commentary')}</h3></div><pre>${escapeHtml(text)}</pre></article>`
        : '<p class="navigation-empty">No commentary text is available for this chapter.</p>';
      loadProfiles();
    } catch (error) {
      result.innerHTML = `<p class="status error">${escapeHtml(error.message)}</p>`;
    }
  }

  async function loadCrossRefs() {
    const id = datasetSelect.value;
    const result = app.querySelector('#bible-crossref-result');
    if (!id || !chapterPayload) {
      result.innerHTML = '<p class="navigation-empty">Load a chapter and choose a dataset.</p>';
      return;
    }
    result.innerHTML = '<p class="status">Loading cross references…</p>';
    try {
      const payload = await loadApiPayload(`/api/bible/dataset/${encodeURIComponent(id)}/${encodeURIComponent(bookSelect.value)}/${encodeURIComponent(chapterSelect.value)}`);
      const refs = collectDatasetReferences(payload);
      result.innerHTML = refs.length
        ? `<div class="bible-reference-list">${refs.map((item)=>`<article><span>${item.verse ? `Verse ${escapeHtml(item.verse)}` : 'Related'}</span><strong>${escapeHtml(item.reference)}</strong></article>`).join('')}</div>`
        : `<article class="bible-resource-card"><pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre></article>`;
    } catch (error) {
      result.innerHTML = `<p class="status error">${escapeHtml(error.message)}</p>`;
    }
  }

  async function loadProfiles() {
    const id = commentarySelect.value;
    const result = app.querySelector('#bible-profile-result');
    const commentary = commentaries.find((item)=>item.id === id);
    if (!id || !commentary?.totalNumberOfProfiles) {
      result.innerHTML = '<p class="navigation-empty">This commentary does not advertise profile data.</p>';
      return;
    }
    result.innerHTML = '<p class="status">Loading profiles…</p>';
    try {
      const payload = await loadApiPayload(`/api/bible/commentary/${encodeURIComponent(id)}/profiles`);
      const matching = (payload.profiles || []).filter((profile) =>
        profile.reference?.book === bookSelect.value &&
        Number(profile.reference?.chapter) === Number(chapterSelect.value)
      );
      result.innerHTML = matching.length
        ? `<div class="bible-profile-list">${matching.map((profile)=>`<button class="secondary" type="button" data-bible-profile="${escapeHtml(profile.id)}">${escapeHtml(profile.subject || profile.id)}</button>`).join('')}</div>`
        : '<p class="navigation-empty">No profiles are tied directly to this chapter.</p>';
      result.querySelectorAll('[data-bible-profile]').forEach((button)=>button.addEventListener('click',async()=>{
        result.innerHTML='<p class="status">Loading profile…</p>';
        try {
          const profile = await loadApiPayload(`/api/bible/commentary/${encodeURIComponent(id)}/profiles/${encodeURIComponent(button.dataset.bibleProfile)}`);
          result.innerHTML=`<article class="bible-resource-card"><pre>${escapeHtml(JSON.stringify(profile, null, 2))}</pre></article>`;
        } catch(error) {
          result.innerHTML=`<p class="status error">${escapeHtml(error.message)}</p>`;
        }
      }));
    } catch (error) {
      result.innerHTML = `<p class="status error">${escapeHtml(error.message)}</p>`;
    }
  }

  async function loadChapter() {
    const loadButton=app.querySelector('#bible-load');
    loadButton.disabled=true;
    setStatus('Loading chapter…');
    try {
      chapterPayload = await fetchChapter(translationSelect.value);
      chapterText = flattenBibleContent(chapterPayload.chapter?.content);
      displayedChapterText = chapterText;
      const compareId = compareSelect.value;
      let comparePayload=null, compareText='';
      if (compareId) {
        comparePayload = await fetchChapter(compareId);
        compareText = flattenBibleContent(comparePayload.chapter?.content);
      }
      const heading = referenceLabel();
      app.querySelector('#bible-results').innerHTML = `
        <div class="bible-translation-grid ${comparePayload ? 'comparing' : ''}">
          <article class="bible-chapter-card"><div class="bible-chapter-heading"><h2>${escapeHtml(heading)}</h2><span>${escapeHtml(chapterPayload.translation?.shortName || translationSelect.value)}</span></div><pre>${escapeHtml(chapterText)}</pre></article>
          ${comparePayload ? `<article class="bible-chapter-card"><div class="bible-chapter-heading"><h2>${escapeHtml(heading)}</h2><span>${escapeHtml(comparePayload.translation?.shortName || compareId)}</span></div><pre>${escapeHtml(compareText)}</pre></article>` : ''}
        </div>`;
      app.querySelector('#bible-reader').disabled=false;
      app.querySelector('#bible-study-guide').disabled=false;
      app.querySelector('#bible-translate-display').disabled=false;
      app.querySelector('#bible-restore-display').disabled=true;
      saveLastBiblePassage({
        title: heading,
        translation: chapterPayload.translation?.shortName || translationSelect.value,
        translationId: translationSelect.value,
        book: bookSelect.value,
        chapter: Number(chapterSelect.value),
        text: chapterText,
        savedAt: new Date().toISOString()
      });
      setStatus(comparePayload ? 'Translations loaded side by side.' : 'Chapter loaded.');
      loadSavedNotes();
      if (commentarySelect.value) loadCommentary();
      if (datasetSelect.value) loadCrossRefs();
    } catch(error) {
      setStatus(error.message,true);
    } finally {
      loadButton.disabled=false;
    }
  }

  async function readEntireBook() {
    const button = app.querySelector('#bible-read-book');
    const original = button.textContent;
    const selectedBook = bookLabel();
    const selectedTranslation = translationSelect.value;
    const chapterCount = Math.max(1, Number(bookSelect.selectedOptions[0]?.dataset.chapters) || 1);
    button.disabled = true;
    button.textContent = 'Loading book…';
    setStatus(`Loading ${selectedBook}: 0 of ${chapterCount} chapters…`);

    try {
      // The upstream Bible API is chapter-oriented. Build the book from those
      // known-good chapter responses instead of depending on a "complete"
      // response whose shape varies by translation.
      const chapters = new Array(chapterCount);
      const concurrency = Math.min(4, chapterCount);
      let nextChapter = 1;
      let completed = 0;

      const worker = async () => {
        while (nextChapter <= chapterCount) {
          const chapterNumber = nextChapter++;
          const payload = await loadApiPayload(
            `/api/bible/${encodeURIComponent(selectedTranslation)}/${encodeURIComponent(bookSelect.value)}/${chapterNumber}`
          );
          const text = flattenBibleContent(payload.chapter?.content);
          if (!text || !splitWords(text).length) {
            throw new Error(`Chapter ${chapterNumber} did not contain readable text.`);
          }
          chapters[chapterNumber - 1] = {
            number: payload.chapter?.number || chapterNumber,
            text,
            translation: payload.translation
          };
          completed += 1;
          setStatus(`Loading ${selectedBook}: ${completed} of ${chapterCount} chapters…`);
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => worker()));

      const parts = [];
      const toc = [];
      const structure = [];
      const paragraphBreaks = [];
      const verseNumberIndexes = [];
      let wordOffset = 0;

      for (let i = 0; i < chapters.length; i += 1) {
        const sourcePayload = await loadApiPayload(
          `/api/bible/${encodeURIComponent(selectedTranslation)}/${encodeURIComponent(bookSelect.value)}/${i + 1}`
        );
        const doc = buildBibleReaderDocument(sourcePayload, {
          bookName: selectedBook,
          chapterNumber: chapters[i].number || i + 1,
          includeChapterHeading: true
        });

        parts.push(doc.text);
        doc.toc.forEach((entry) => toc.push({ ...entry, index: entry.index + wordOffset }));
        doc.structure.forEach((entry) => structure.push({
          ...entry,
          start: entry.start + wordOffset,
          end: entry.end + wordOffset
        }));
        doc.paragraphBreaks.forEach((index) => paragraphBreaks.push(index + wordOffset));
        doc.verseNumberIndexes.forEach((index) => verseNumberIndexes.push(index + wordOffset));
        wordOffset += splitWords(doc.text).length;
      }

      const fullText = parts.join('\n\n');
      if (!splitWords(fullText).length) {
        throw new Error(`No readable text was returned for ${selectedBook}.`);
      }

      const title = `${selectedBook} — ${chapters[0]?.translation?.shortName || selectedTranslation}`;
      renderReaderWithText(title, fullText, {
        type:'bible-book',
        translation:selectedTranslation,
        book:bookSelect.value,
        author:'Bible',
        documentToc:toc,
        documentStructure:structure,
        paragraphBreaks,
        verseNumberIndexes
      });
    } catch(error) {
      setStatus(`Unable to load entire book: ${error.message}`, true);
      button.disabled=false;
      button.textContent=original;
    }
  }

  translationSelect.addEventListener('change', loadBooks);
  bookSelect.addEventListener('change', () => { updateChapters(); chapterPayload=null; chapterText=''; });
  chapterSelect.addEventListener('change', () => { updateGrokipedia(); loadSavedNotes(); });
  compareSelect.addEventListener('change', () => { if (chapterPayload) loadChapter(); });
  commentarySelect.addEventListener('change', () => { loadCommentary(); });
  datasetSelect.addEventListener('change', () => { loadCrossRefs(); });

  app.querySelector('#bible-load').addEventListener('click', loadChapter);
  app.querySelector('#bible-reader').addEventListener('click', async () => {
    if (!chapterPayload) await loadChapter();
    if (!chapterPayload || !chapterText) return;
    const heading = referenceLabel();
    const bibleDoc = buildBibleReaderDocument(chapterPayload, {
      bookName: bookLabel(),
      chapterNumber: Number(chapterSelect.value),
      includeChapterHeading: true
    });
    renderReaderWithText(`${heading} — ${chapterPayload.translation?.shortName || translationSelect.value}`, bibleDoc.text, {
      type:'bible',
      translation:translationSelect.value,
      book:bookSelect.value,
      chapter:Number(chapterSelect.value),
      author:'Bible',
      documentStructure:bibleDoc.structure,
      documentToc:bibleDoc.toc,
      paragraphBreaks:bibleDoc.paragraphBreaks,
      verseNumberIndexes:bibleDoc.verseNumberIndexes
    });
  });
  app.querySelector('#bible-read-book').addEventListener('click', readEntireBook);
  app.querySelector('#bible-study-guide').addEventListener('click', async (event) => {
    if (!chapterPayload) await loadChapter();
    if (!chapterPayload || !chapterText) return;
    const button=event.currentTarget, original=button.textContent;
    button.disabled=true; button.textContent='Building study guide…';
    try {
      const heading = referenceLabel();
      const guide = await requestStudyGuide({ title: heading, author: chapterPayload.translation?.shortName || translationSelect.value, passage: chapterText, sourceType:'bible', language: bibleStudyLanguage.value || getStudyLanguage() });
      renderStudyGuide(heading, guide, { sourceType:'bible', returnAction:'bible' });
    } catch(error) {
      window.alert(`Bible study guide unavailable: ${error.message}`);
      button.disabled=false; button.textContent=original;
    }
  });

  bibleStudyLanguage.addEventListener('change', () => setStudyLanguage(bibleStudyLanguage.value));

  app.querySelector('#bible-translate-display').addEventListener('click', async (event) => {
    if (!chapterPayload || !chapterText) return;
    const target = bibleStudyLanguage.value || 'en';
    if (target === 'en') {
      setStatus('Study/display language is already English.');
      return;
    }
    const button = event.currentTarget;
    button.disabled = true;
    try {
      displayedChapterText = await translateStudyBlock(chapterText, target, status);
      const heading = referenceLabel();
      const card = app.querySelector('#bible-results .bible-chapter-card');
      if (card) card.querySelector('pre').textContent = displayedChapterText;
      app.querySelector('#bible-restore-display').disabled = false;
      setStatus(`Displayed chapter translated to ${studyLanguages[target] || target}. Source translation remains unchanged.`);
    } catch(error) {
      setStatus(error.message,true);
    } finally {
      button.disabled=false;
    }
  });

  app.querySelector('#bible-restore-display').addEventListener('click', () => {
    displayedChapterText = chapterText;
    const card = app.querySelector('#bible-results .bible-chapter-card');
    if (card) card.querySelector('pre').textContent = chapterText;
    app.querySelector('#bible-restore-display').disabled = true;
    setStatus('Restored source translation.');
  });

  app.querySelector('#save-bible-notes').addEventListener('click', () => {
    localStorage.setItem(notesKey(), app.querySelector('#bible-study-notes').value || '');
    const noteStatus=app.querySelector('#bible-notes-status');
    noteStatus.textContent='Saved.';
    window.setTimeout(()=>{ if(noteStatus) noteStatus.textContent=''; },1200);
  });
}

function renderGreatBooksLibrary() {
  stopReader();
  const grouped = groupBy(greatBooksCatalog, 'volume');
  app.innerHTML = `
    <section class="panel curated-library great-books-study-library">
      <div class="library-heading">
        <div><span class="source-category">Browse · Study</span><h1>Great Books of the Western World</h1><p>The 1990 60-volume framework expanded into individual works, plus the Bible collection referenced by the Syntopicon tradition.</p></div>
        <div class="source-actions"><button class="secondary" type="button" data-read="gutenberg">Search Gutenberg</button><button class="secondary" type="button" data-action="reader">Return to Reader</button></div>
      </div>
      <div class="study-language-bar">
        <div><strong>Study language</strong><span>AI study guides can be generated in another language; imported books can be translated from the Reader.</span></div>
        <select id="great-books-study-language">${studyLanguageOptions(getStudyLanguage())}</select>
      </div>
      <div class="great-books-study-intro">
        <article><strong>${greatBooksCatalog.length}</strong><span>individual works / collections</span></article>
        <article><strong>60</strong><span>volume framework</span></article>
        <article><strong>AI</strong><span>Great Ideas study guides</span></article>
      </div>
      <div class="list-toolbar-row">
        <label class="curated-filter">Filter works, authors, volumes, or ideas<input id="great-books-filter" type="search" placeholder="Plato, justice, Shakespeare, science…"></label>
        ${listPresentationControls('great-books', { collapsible:true, defaultView:'tiles' })}
      </div>
      <div id="great-books-groups" class="curated-groups great-books-volumes presentation-tiles">
        ${Object.entries(grouped).sort((a,b)=>Number(a[0])-Number(b[0])).map(([volume, books]) => `
          <details class="curated-era" ${Number(volume) <= 6 ? 'open' : ''}>
            <summary>Volume ${escapeHtml(volume)} · ${escapeHtml(books[0]?.era || '')} <span>${books.length}</span></summary>
            <div class="curated-grid">
              ${books.map((book) => `<article class="curated-card" data-great-book-card data-search-text="${escapeHtml(`${book.title} ${book.author} ${book.era} volume ${book.volume}`.toLowerCase())}">
                <div><span class="source-category">Volume ${book.volume}</span><h2>${escapeHtml(book.title)}</h2><p>${escapeHtml(book.author)}</p></div>
                <div class="great-book-actions">
                  <button class="primary" type="button" data-load-great-book="${escapeHtml(book.query)}">Find &amp; Import Edition</button>
                  <button class="secondary" type="button" data-study-great-book="${escapeHtml(book.query)}">Study / Great Ideas</button>
                  ${classicGuidePathForGreatBook(book) ? `<button class="secondary" type="button" data-open-classic-guide-reader="${escapeHtml(book.query)}">Classic Guide</button>` : ''}
                  <a class="secondary button-link" href="${greatBookGrokipediaUrl(book)}" target="_blank" rel="noopener noreferrer">Grokipedia</a>
                </div>
                <p class="status book-load-status"></p>
              </article>`).join('')}
            </div>
          </details>`).join('')}
      </div>
      <p class="library-note">The reading list follows the 1990 edition’s contents. Find & Import searches all connected public book sources—Standard Ebooks, Internet Archive, Open Library, Wikisource, and Project Gutenberg—and opens only a verified primary/full-text edition. Summaries, excerpts, study guides, and weak title matches are rejected automatically. It may not find works that remain copyrighted or lack a suitable open digital edition. This app does not reproduce Britannica’s copyrighted Syntopicon commentary; its Great Ideas study guides are newly generated for syntopical reading.</p>
    </section>`;

  bindListPresentationControls({
    key:'great-books',
    root:'#great-books-groups',
    itemSelector:'[data-great-book-card]',
    groupSelector:'.curated-era',
    defaultView:'tiles'
  });
  app.querySelector('#great-books-study-language')?.addEventListener('change', (event) => setStudyLanguage(event.target.value));
  const filter = app.querySelector('#great-books-filter');
  filter.addEventListener('input', () => {
    const query = filter.value.trim().toLowerCase();
    app.querySelectorAll('[data-great-book-card]').forEach((card) => {
      card.hidden = Boolean(query) && !card.dataset.searchText.includes(query);
    });
    app.querySelectorAll('.curated-era').forEach((era) => {
      era.hidden = !Array.from(era.querySelectorAll('[data-great-book-card]')).some((card) => !card.hidden);
    });
  });
  app.querySelectorAll('[data-load-great-book]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = greatBooksCatalog.find((book) => book.query === button.dataset.loadGreatBook);
      loadGreatBookEdition(item, button.closest('.curated-card').querySelector('.book-load-status'), button);
    });
  });
  app.querySelectorAll('[data-study-great-book]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = greatBooksCatalog.find((book) => book.query === button.dataset.studyGreatBook);
      if (item) renderGreatBookStudy(item, button);
    });
  });
  app.querySelectorAll('[data-open-classic-guide-reader]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      const originalLabel = button.textContent;
      button.textContent = 'Opening…';
      try {
        await loadClassicGuideInReader(button.dataset.openClassicGuideReader || '');
      } catch (error) {
        window.alert(error?.message || 'The Classic Guide could not be opened.');
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });
  });
}

function formatFeedDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

async function loadFeedArticleText(item, source, button, status) {
  button.disabled = true;
  button.textContent = 'Importing…';
  status.className = 'status article-status';
  status.textContent = 'Requesting this specific article from the publisher…';
  try {
    const payload = await loadApiPayload('/api/current/article', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: item.link,
        title: item.title,
        summary: item.summary || '',
        source: source.name
      })
    });
    renderReaderWithText(payload.title || item.title, payload.text, {
      type: payload.fullArticle ? 'article' : 'feed-summary',
      url: item.link,
      source: source.name
    });
  } catch (error) {
    // Never substitute another publisher's page. Fall back to this card's own feed text.
    const fallback = `${item.title}\n\n${item.summary || 'No summary was supplied by this feed.'}\n\nSource: ${source.name}\n${item.link}`;
    renderReaderWithText(item.title, fallback, { type: 'feed-summary', url: item.link, source: source.name });
  }
}

async function renderCurrentFeed(sourceId) {
  stopReader();
  app.innerHTML = '<section class="panel"><h1>Loading feed…</h1><p class="status">Retrieving recent items.</p></section>';
  try {
    const payload = await loadApiPayload(`/api/current/feed/${encodeURIComponent(sourceId)}`);
    const { source, items } = payload;
    app.innerHTML = `
      <section class="panel current-feed">
        <div class="library-heading"><div><h1>${escapeHtml(source.name)}</h1><p>${escapeHtml(source.description)}</p></div><div class="feed-heading-actions"><button class="secondary" type="button" data-read="current-reading">All sources</button><a class="secondary button-link" href="${escapeHtml(source.siteUrl)}" target="_blank" rel="noopener noreferrer">Visit source</a></div></div>
        <div class="feed-items">${items?.length ? items.map((item, index) => `
          <article class="feed-item">
            <h2>${escapeHtml(item.title)}</h2>
            ${item.published ? `<p class="feed-date">${escapeHtml(formatFeedDate(item.published))}</p>` : ''}
            ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : '<p class="status">No summary was supplied by this feed.</p>'}
            <div class="feed-actions">
              <button class="primary" type="button" data-read-summary="${index}">Read summary</button>
              <button class="secondary" type="button" data-watch-news="${index}">Watch news</button>
              <button class="secondary" type="button" data-load-article="${index}">Try article text</button>
              <a class="secondary button-link" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">Open original</a>
            </div><p class="status article-status" data-article-status="${index}"></p>
          </article>`).join('') : '<div class="empty-library"><h2>No items found</h2><p>This source did not return any recent entries.</p></div>'}</div>
        <p class="library-note">Headlines and summaries are supplied by each feed. Full article text is imported only when you request it and when the publisher permits automated access.</p>
      </section>`;
    app.querySelectorAll('[data-read-summary]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = items[Number(button.dataset.readSummary)];
        const text = `${item.title}\n\n${item.summary || 'No summary was supplied.'}\n\nSource: ${source.name}\n${item.link}`;
        renderReaderWithText(item.title, text, { type: 'feed-summary', url: item.link, source: source.name });
      });
    });
    app.querySelectorAll('[data-watch-news]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = items[Number(button.dataset.watchNews)];
        if (!item?.title) return;
        const query = encodeURIComponent(`"${item.title}" ${source?.name || ''}`.trim());
        const url = `https://news.google.com/search?q=${query}&hl=en-US&gl=US&ceid=US%3Aen`;
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    });
    app.querySelectorAll('[data-load-article]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.loadArticle);
        loadFeedArticleText(items[index], source, button, app.querySelector(`[data-article-status="${index}"]`));
      });
    });
  } catch (error) {
    renderError('Feed unavailable', error.message);
  }
}

async function renderCurrentReading(category = 'all') {
  stopReader();
  app.innerHTML = '<section class="panel"><h1>News, Sports & Interests</h1><p class="status">Loading sources…</p></section>';
  try {
    const payload = await loadApiPayload('/api/current/sources');
    const sources = payload.sources || [];
    const categories = { all: 'All', news: 'News', sports: 'Sports', interests: 'Interests & Hobbies' };
    app.innerHTML = `
      <section class="panel current-reading-library">
        <div class="library-heading"><div><h1>News, Sports & Interests</h1><p>Browse recent headlines and topic feeds, then read a feed summary or request a readable article.</p></div></div>
        <div class="list-toolbar-row">
          <div class="category-tabs" role="tablist">${Object.entries(categories).map(([key, label]) => `<button type="button" class="${key === category ? 'active' : ''}" data-current-category="${key}">${label}</button>`).join('')}</div>
          ${listPresentationControls('current-sources', { collapsible:false, defaultView:'tiles' })}
        </div>
        <div class="source-grid presentation-tiles">${sources.filter((source) => category === 'all' || source.category === category).map((source) => `
          <article class="source-card">
            <div><span class="source-category">${escapeHtml(categories[source.category] || source.category)}</span><h2>${escapeHtml(source.name)}</h2><p>${escapeHtml(source.description)}</p></div>
            <div class="source-actions"><button class="primary" type="button" data-open-feed="${escapeHtml(source.id)}">Browse headlines</button><a class="secondary button-link" href="${escapeHtml(source.siteUrl)}" target="_blank" rel="noopener noreferrer">Visit site</a></div>
          </article>`).join('')}</div>
        <p class="library-note">Some hobby feeds use Google News topic searches. Publisher terms, paywalls, and automated-access rules still apply to individual articles.</p>
      </section>`;
    bindListPresentationControls({
      key:'current-sources',
      root:'.source-grid',
      itemSelector:'.source-card',
      defaultView:'tiles'
    });
    app.querySelectorAll('[data-current-category]').forEach((button) => button.addEventListener('click', () => renderCurrentReading(button.dataset.currentCategory)));
    app.querySelectorAll('[data-open-feed]').forEach((button) => button.addEventListener('click', () => renderCurrentFeed(button.dataset.openFeed)));
  } catch (error) {
    renderError('Sources unavailable', error.message);
  }
}



async function loadBuiltInIllustratedDemo() {
  stopReader();
  app.innerHTML = `<section class="panel"><h1>Loading Frankenstein Illustrated Demo…</h1><p class="status">Preparing the first five chapters and their illustrations.</p></section>`;
  try {
    const basePath = '/demos/frankenstein';
    const [manifestResponse, textResponse] = await Promise.all([
      fetch(`${basePath}/manifest.json`, { cache: 'no-store' }),
      fetch(`${basePath}/book.txt`, { cache: 'no-store' })
    ]);
    if (!manifestResponse.ok) throw new Error('The demo manifest could not be loaded.');
    if (!textResponse.ok) throw new Error('The demo text could not be loaded.');
    const manifest = await manifestResponse.json();
    const text = await textResponse.text();
    const illustrations = (Array.isArray(manifest.illustrations) ? manifest.illustrations : []).map((item) => ({
      ...item,
      image: new URL(String(item.image || ''), `${window.location.origin}${basePath}/`).href
    }));
    const displayTitle = manifest.author ? `${manifest.title} — ${manifest.author}` : manifest.title;
    renderReaderWithText(displayTitle || 'Frankenstein Illustrated Demo', text, {
      type: 'built-in-illustrated-demo',
      key: 'frankenstein-demo',
      title: manifest.title || 'Frankenstein Illustrated Demo',
      author: manifest.author || 'Mary Wollstonecraft Shelley',
      illustrations,
      demoPath: basePath
    });
    persistReaderSession({ immediate: true });
  } catch (error) {
    renderError('Demo unavailable', error.message || 'The illustrated demo could not be loaded.');
  }
}

function renderIllustratedUpload() {
  stopReader();
  app.innerHTML = `
    <section class="panel illustrated-upload-panel">
      <h1>Upload Illustrated Book</h1>
      <p>Upload a ZIP containing <code>manifest.json</code>, the book text, and chapter images. The imported book and its images are retained with your saved reader session in this browser.</p>
      <div class="illustrated-upload-example">
        <strong>Expected ZIP contents</strong>
        <pre>book.txt
manifest.json
images/chapter-01.png
images/chapter-02.png</pre>
      </div>
      <details>
        <summary>Example manifest.json</summary>
        <pre>{
  "title": "Frankenstein",
  "author": "Mary Shelley",
  "textFile": "book.txt",
  "illustrations": [
    {
      "heading": "Chapter 1",
      "image": "images/chapter-01.png",
      "caption": "Victor's childhood near Geneva."
    }
  ]
}</pre>
      </details>
      <div class="controls">
        <input id="illustrated-book-file" type="file" accept=".zip,application/zip,application/x-zip-compressed">
        <span id="illustrated-upload-status" class="status"></span>
      </div>
    </section>`;

  app.querySelector('#illustrated-book-file')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const status = app.querySelector('#illustrated-upload-status');
    if (status) { status.className = 'status'; status.textContent = 'Importing illustrated book…'; }
    try {
      const response = await fetch('/api/illustrated-book/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: file
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The illustrated book could not be imported.');
      const displayTitle = payload.author ? `${payload.title} — ${payload.author}` : payload.title;
      renderReaderWithText(displayTitle, payload.text, {
        type: 'illustrated-upload',
        name: file.name,
        title: payload.title,
        author: payload.author,
        illustrations: payload.illustrations
      });
      persistReaderSession({ immediate: true });
    } catch (error) {
      if (status) { status.className = 'status error'; status.textContent = error.message; }
    }
  });
}

function normalizeArchivePath(value) {
  const parts = String(value || '').replace(/\\/g, '/').split('/');
  const out = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function resolveArchivePath(baseFile, relativePath) {
  const clean = String(relativePath || '').split('#')[0].split('?')[0];
  if (!clean) return normalizeArchivePath(baseFile);
  if (clean.startsWith('/')) return normalizeArchivePath(clean.slice(1));
  const base = normalizeArchivePath(baseFile).split('/');
  base.pop();
  return normalizeArchivePath([...base, ...clean.split('/')].join('/'));
}

function decodeUtf8(bytes) {
  return new TextDecoder('utf-8').decode(bytes);
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser does not provide the decompression support needed for EPUB files. Try a current version of Chrome or Edge.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipEpub(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const u16 = (offset) => view.getUint16(offset, true);
  const u32 = (offset) => view.getUint32(offset, true);
  let eocd = -1;
  const min = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This does not appear to be a valid EPUB/ZIP file.');

  const entryCount = u16(eocd + 10);
  const centralOffset = u32(eocd + 16);
  const entries = new Map();
  let cursor = centralOffset;

  for (let n = 0; n < entryCount; n += 1) {
    if (u32(cursor) !== 0x02014b50) throw new Error('The EPUB ZIP directory is malformed.');
    const method = u16(cursor + 10);
    const compressedSize = u32(cursor + 20);
    const uncompressedSize = u32(cursor + 24);
    const nameLength = u16(cursor + 28);
    const extraLength = u16(cursor + 30);
    const commentLength = u16(cursor + 32);
    const localOffset = u32(cursor + 42);
    const name = normalizeArchivePath(decodeUtf8(bytes.slice(cursor + 46, cursor + 46 + nameLength)));
    entries.set(name, { name, method, compressedSize, uncompressedSize, localOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  const cache = new Map();
  async function read(path) {
    const normalized = normalizeArchivePath(path);
    if (cache.has(normalized)) return cache.get(normalized);
    const entry = entries.get(normalized);
    if (!entry) throw new Error(`EPUB file is missing ${normalized}.`);
    const local = entry.localOffset;
    if (u32(local) !== 0x04034b50) throw new Error(`EPUB entry ${normalized} has an invalid ZIP header.`);
    const nameLength = u16(local + 26);
    const extraLength = u16(local + 28);
    const start = local + 30 + nameLength + extraLength;
    const compressed = bytes.slice(start, start + entry.compressedSize);
    let result;
    if (entry.method === 0) result = compressed;
    else if (entry.method === 8) result = await inflateRaw(compressed);
    else throw new Error(`EPUB uses unsupported ZIP compression method ${entry.method}.`);
    cache.set(normalized, result);
    return result;
  }

  return { entries, read, readText: async (path) => decodeUtf8(await read(path)) };
}

function xmlLocalElements(root, name) {
  return Array.from(root.getElementsByTagNameNS?.('*', name) || root.getElementsByTagName(name) || []);
}

function firstXmlLocal(root, name) {
  return xmlLocalElements(root, name)[0] || null;
}

function cleanEpubText(value) {
  return String(value || '').replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim();
}

function bytesToDataUrl(bytes, mediaType = 'application/octet-stream') {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mediaType};base64,${btoa(binary)}`;
}

function epubImageElements(doc) {
  const body = doc.body || firstXmlLocal(doc, 'body') || doc.documentElement;
  return Array.from(body.querySelectorAll?.('img[src], image[href], image') || [])
    .filter((element) =>
      element.hasAttribute('src') ||
      element.hasAttribute('href') ||
      element.hasAttribute('xlink:href') ||
      element.getAttributeNS?.('http://www.w3.org/1999/xlink', 'href')
    );
}

function epubContentLines(doc) {
  const body = doc.body || firstXmlLocal(doc, 'body') || doc.documentElement;
  const candidates = Array.from(body.querySelectorAll?.('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption') || []);
  const raw = [];
  const seen = new Set();

  for (const el of candidates) {
    // Do not duplicate text already represented by a nested paragraph.
    if (el.matches?.('li,blockquote') && el.querySelector?.('p')) continue;
    const text = cleanEpubText(el.textContent);
    if (!text) continue;

    const tag = String(el.tagName || '').toLowerCase();
    const kind = /^h[1-6]$/.test(tag) ? 'heading' : 'paragraph';
    const signature = `${kind}|${text}|${raw.length ? raw[raw.length - 1].text : ''}`;
    if (seen.has(signature)) continue;
    seen.add(signature);

    const ids = [];
    let node = el;
    while (node && node !== body.parentElement) {
      if (node.id) ids.push(node.id);
      node = node.parentElement;
    }
    raw.push({ text, ids, kind });
  }

  if (!raw.length) {
    const fallback = cleanEpubText(body.textContent);
    if (fallback) raw.push({ text: fallback, ids: [], kind: 'paragraph' });
  }

  // Some EPUB producers split a single prose sentence across adjacent <p> or
  // wrapper elements. Joining obvious continuations prevents fragments such as
  // "We returned" / "to our college..." from becoming artificial paragraphs.
  const lines = [];
  for (const item of raw) {
    const previous = lines[lines.length - 1];
    const previousEndsSentence = previous ? /[.!?][\"'’”)]?$/.test(previous.text) : true;
    const startsLikeContinuation = /^[a-zà-öø-ÿ0-9,;:—–)\]}'’”]/.test(item.text);
    const previousLooksFragmentary = previous && previous.kind !== 'heading' && previous.text.length < 120 && !previousEndsSentence;

    if (previous && item.kind !== 'heading' && previous.kind !== 'heading' &&
        (startsLikeContinuation || previousLooksFragmentary)) {
      previous.text = cleanEpubText(`${previous.text} ${item.text}`);
      for (const id of item.ids) if (!previous.ids.includes(id)) previous.ids.push(id);
      continue;
    }
    lines.push({ ...item });
  }
  return lines;
}

function parseEpubNavigation(navText, navPath) {
  const doc = new DOMParser().parseFromString(navText, 'text/html');
  const navs = Array.from(doc.querySelectorAll('nav'));
  const tocNav = navs.find((nav) => {
    const epubType = nav.getAttribute('epub:type') || nav.getAttribute('type') || '';
    const role = nav.getAttribute('role') || '';
    return /toc/i.test(epubType) || /doc-toc/i.test(role);
  }) || navs[0];
  if (!tocNav) return [];
  return Array.from(tocNav.querySelectorAll('a[href]')).map((a) => {
    const rawHref = a.getAttribute('href') || '';
    const [filePart, fragment = ''] = rawHref.split('#');
    return {
      title: cleanEpubText(a.textContent),
      path: resolveArchivePath(navPath, filePart || navPath),
      fragment: decodeURIComponent(fragment || '')
    };
  }).filter((entry) => entry.title && entry.path);
}

function parseNcxNavigation(ncxText, ncxPath) {
  const doc = new DOMParser().parseFromString(ncxText, 'application/xml');
  return xmlLocalElements(doc, 'navPoint').map((point) => {
    const label = firstXmlLocal(point, 'navLabel');
    const content = firstXmlLocal(point, 'content');
    const src = content?.getAttribute('src') || '';
    const [filePart, fragment = ''] = src.split('#');
    return {
      title: cleanEpubText(label?.textContent),
      path: resolveArchivePath(ncxPath, filePart),
      fragment: decodeURIComponent(fragment || '')
    };
  }).filter((entry) => entry.title && entry.path);
}

async function parseEpubFile(file) {
  const archive = await unzipEpub(await file.arrayBuffer());
  const containerText = await archive.readText('META-INF/container.xml');
  const containerDoc = new DOMParser().parseFromString(containerText, 'application/xml');
  const rootfile = firstXmlLocal(containerDoc, 'rootfile');
  const opfPath = normalizeArchivePath(rootfile?.getAttribute('full-path') || '');
  if (!opfPath) throw new Error('The EPUB package file could not be located.');

  const opfText = await archive.readText(opfPath);
  const opfDoc = new DOMParser().parseFromString(opfText, 'application/xml');
  const title = cleanEpubText(firstXmlLocal(opfDoc, 'title')?.textContent) || file.name.replace(/\.epub$/i, '');
  const creator = cleanEpubText(firstXmlLocal(opfDoc, 'creator')?.textContent);

  const manifest = new Map();
  for (const item of xmlLocalElements(opfDoc, 'item')) {
    const id = item.getAttribute('id');
    if (!id) continue;
    manifest.set(id, {
      id,
      href: item.getAttribute('href') || '',
      mediaType: item.getAttribute('media-type') || '',
      properties: item.getAttribute('properties') || ''
    });
  }

  const spine = firstXmlLocal(opfDoc, 'spine');
  const spineIds = xmlLocalElements(spine || opfDoc, 'itemref').map((item) => item.getAttribute('idref')).filter(Boolean);
  if (!spineIds.length) throw new Error('The EPUB does not contain a readable spine.');

  let navEntries = [];
  const navItem = Array.from(manifest.values()).find((item) => /(^|\s)nav(\s|$)/i.test(item.properties));
  if (navItem) {
    const navPath = resolveArchivePath(opfPath, navItem.href);
    try { navEntries = parseEpubNavigation(await archive.readText(navPath), navPath); } catch (error) { console.warn('EPUB nav document could not be read.', error); }
  }
  if (!navEntries.length) {
    const tocId = spine?.getAttribute('toc');
    const ncxItem = (tocId && manifest.get(tocId)) || Array.from(manifest.values()).find((item) => /ncx/i.test(item.mediaType));
    if (ncxItem) {
      const ncxPath = resolveArchivePath(opfPath, ncxItem.href);
      try { navEntries = parseNcxNavigation(await archive.readText(ncxPath), ncxPath); } catch (error) { console.warn('EPUB NCX could not be read.', error); }
    }
  }

  const bookLines = [];
  const fileStart = new Map();
  const anchorStart = new Map();
  const headingStart = new Map();
  const illustrations = [];
  const imageDataCache = new Map();
  const manifestByPath = new Map(
    Array.from(manifest.values()).map((item) => [resolveArchivePath(opfPath, item.href), item])
  );
  let wordIndex = 0;
  let preservedEpubTitle = false;
  let preservedEpubAuthor = false;

  for (const idref of spineIds) {
    const item = manifest.get(idref);
    if (!item?.href) continue;
    if (/(^|\s)nav(\s|$)/i.test(item.properties || '')) continue;
    const chapterPath = resolveArchivePath(opfPath, item.href);
    if (!archive.entries.has(chapterPath)) continue;
    const chapterText = await archive.readText(chapterPath);
    const chapterDoc = new DOMParser().parseFromString(chapterText, 'text/html');
    let lines = epubContentLines(chapterDoc);
    // Navigation/TOC files are already excluded by the spine/nav parser. Remove
    // repeated running headers such as the book title that some EPUBs include
    // at the top of every chapter file.
    const epubTitleKey = normalizedSourceLine(title);
    const epubAuthorKey = normalizedSourceLine(creator);
    lines = lines.filter((line) => {
      const key = normalizedSourceLine(line.text);
      if (epubTitleKey && key === epubTitleKey) {
        if (preservedEpubTitle) return false;
        preservedEpubTitle = true;
      }
      if (epubAuthorKey && key === epubAuthorKey) {
        if (preservedEpubAuthor) return false;
        preservedEpubAuthor = true;
      }
      return true;
    });
    fileStart.set(chapterPath, wordIndex);

    // Preserve embedded EPUB artwork by converting archive-relative image
    // references into browser-safe data URLs. The existing illustration system
    // places them at chapter openings without changing tokenization or position.
    const navForFile = navEntries.find((entry) => entry.path === chapterPath);
    const firstHeading = lines.find((line) => line.kind === 'heading')?.text || '';
    const illustrationHeading = navForFile?.title || firstHeading || `Section ${illustrations.length + 1}`;
    for (const imageElement of epubImageElements(chapterDoc)) {
      const rawSrc = imageElement.getAttribute('src') || imageElement.getAttribute('href') || imageElement.getAttribute('xlink:href') || '';
      if (!rawSrc || /^data:/i.test(rawSrc) || /^(https?:)?\/\//i.test(rawSrc)) continue;
      const imagePath = resolveArchivePath(chapterPath, rawSrc.split('#')[0]);
      if (!archive.entries.has(imagePath)) continue;
      try {
        let image = imageDataCache.get(imagePath);
        if (!image) {
          const manifestItem = manifestByPath.get(imagePath);
          const extension = imagePath.split('.').pop()?.toLowerCase();
          const mediaType = manifestItem?.mediaType || ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }[extension] || 'application/octet-stream');
          image = bytesToDataUrl(await archive.read(imagePath), mediaType);
          imageDataCache.set(imagePath, image);
        }
        illustrations.push({
          heading: illustrationHeading,
          image,
          alt: cleanEpubText(imageElement.getAttribute('alt')) || `${illustrationHeading} illustration`,
          caption: cleanEpubText(imageElement.getAttribute('title')) || illustrationHeading,
          sourcePath: imagePath,
          wordIndex
        });
      } catch (error) {
        console.warn(`EPUB image ${imagePath} could not be imported.`, error);
      }
    }
    for (const line of lines) {
      for (const id of line.ids) anchorStart.set(`${chapterPath}#${id}`, wordIndex);
      if (line.kind === 'heading') {
        const headingKey = `${chapterPath}|${normalizeTocTitle(line.text)}`;
        if (!headingStart.has(headingKey)) headingStart.set(headingKey, wordIndex);
      }
      bookLines.push(line.text);
      wordIndex += splitWords(line.text).length;
    }
    if (lines.length) bookLines.push('');
  }

  const text = bookLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text || splitWords(text).length < 5) throw new Error('No readable text could be extracted from this EPUB.');

  const seen = new Set();
  const epubToc = navEntries.map((entry) => {
    // Prefer a real heading whose text matches the EPUB navigation label.
    // This avoids TOC links landing on incidental paragraph anchors inserted
    // by the publisher for page breaks or formatting.
    const headingKey = `${entry.path}|${normalizeTocTitle(entry.title)}`;
    const matchedHeadingIndex = headingStart.get(headingKey);
    const anchorKey = entry.fragment ? `${entry.path}#${entry.fragment}` : '';
    const anchoredIndex = anchorKey ? anchorStart.get(anchorKey) : undefined;
    const index = matchedHeadingIndex ?? anchoredIndex ?? fileStart.get(entry.path);
    if (!Number.isFinite(index)) return null;
    return { title: entry.title, index, type: 'chapter' };
  }).filter(Boolean).filter((entry) => {
    const key = `${entry.index}|${normalizeTocTitle(entry.title)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 500);

  // If the EPUB has no usable nav document, its chapter files still provide
  // reliable boundaries that are cleaner than guessing from a printed TOC.
  if (!epubToc.length) {
    for (const idref of spineIds) {
      const item = manifest.get(idref);
      if (!item?.href) continue;
      const chapterPath = resolveArchivePath(opfPath, item.href);
      const index = fileStart.get(chapterPath);
      if (!Number.isFinite(index)) continue;
      epubToc.push({ title: `Section ${epubToc.length + 1}`, index, type: 'chapter' });
    }
  }

  return {
    title: creator ? `${title} — ${creator}` : title,
    text,
    source: {
      type: 'epub-upload',
      name: file.name,
      epubTitle: title,
      author: creator,
      epubToc,
      illustrations,
      embeddedImageCount: illustrations.length
    }
  };
}



function readBigEndianU16(view, offset) {
  return view.getUint16(offset, false);
}

function readBigEndianU32(view, offset) {
  return view.getUint32(offset, false);
}

function decodeKindleBytes(bytes, encoding = 65001) {
  const labels = encoding === 65001
    ? ['utf-8']
    : encoding === 1252
      ? ['windows-1252']
      : ['utf-8', 'windows-1252'];

  for (const label of labels) {
    try {
      return new TextDecoder(label, { fatal:false }).decode(bytes);
    } catch {}
  }
  return new TextDecoder().decode(bytes);
}

function decompressPalmDocRecord(input) {
  const output=[];
  let i=0;

  while(i<input.length){
    const byte=input[i++];

    if(byte===0){
      output.push(0);
      continue;
    }

    if(byte>=1 && byte<=8){
      const literalEnd=Math.min(input.length,i+byte);
      for(;i<literalEnd;i+=1) output.push(input[i]);
      continue;
    }

    if(byte>=9 && byte<=0x7f){
      output.push(byte);
      continue;
    }

    if(byte>=0x80 && byte<=0xbf){
      if(i>=input.length) break;
      const pair=(byte<<8)|input[i++];
      const distance=(pair>>3)&0x07ff;
      const length=(pair&0x07)+3;
      if(!distance || distance>output.length) continue;
      for(let j=0;j<length;j+=1){
        output.push(output[output.length-distance]);
      }
      continue;
    }

    output.push(0x20,byte^0x80);
  }

  return new Uint8Array(output);
}

function kindlePalmRecordOffsets(view) {
  if(view.byteLength<86) throw new Error('This file is too small to be a MOBI/AZW eBook.');
  const recordCount=readBigEndianU16(view,76);
  if(!recordCount || 78+(recordCount*8)>view.byteLength){
    throw new Error('This MOBI/AZW file has an invalid Palm database record table.');
  }

  const offsets=[];
  for(let i=0;i<recordCount;i+=1){
    offsets.push(readBigEndianU32(view,78+(i*8)));
  }
  offsets.push(view.byteLength);

  for(let i=0;i<offsets.length-1;i+=1){
    if(offsets[i]>=offsets[i+1] || offsets[i]>=view.byteLength){
      throw new Error('This MOBI/AZW file contains an invalid record layout.');
    }
  }
  return offsets;
}

function parseKindleExth(record0, mobiHeaderLength, encoding) {
  const result={};
  const exthStart=16+mobiHeaderLength;
  if(exthStart+12>record0.length) return result;

  const marker=new TextDecoder('ascii').decode(record0.slice(exthStart,exthStart+4));
  if(marker!=='EXTH') return result;

  const view=new DataView(record0.buffer,record0.byteOffset,record0.byteLength);
  const totalLength=readBigEndianU32(view,exthStart+4);
  const recordCount=readBigEndianU32(view,exthStart+8);
  const end=Math.min(record0.length,exthStart+totalLength);
  let cursor=exthStart+12;

  for(let i=0;i<recordCount && cursor+8<=end;i+=1){
    const type=readBigEndianU32(view,cursor);
    const length=readBigEndianU32(view,cursor+4);
    if(length<8 || cursor+length>end) break;
    const data=record0.slice(cursor+8,cursor+length);
    const value=decodeKindleBytes(data,encoding).replace(/\0/g,'').trim();

    if(type===100 && value && !result.author) result.author=value;
    if((type===503 || type===501) && value && !result.title) result.title=value;
    if(type===101 && value && !result.publisher) result.publisher=value;
    if(type===103 && value && !result.description) result.description=value;
    cursor+=length;
  }
  return result;
}

function cleanKindleMarkup(raw) {
  let value=String(raw||'')
    .replace(/\0/g,'')
    .replace(/<mbp:pagebreak\b[^>]*\/?>/gi,'\n\n')
    .replace(/<pagebreak\b[^>]*\/?>/gi,'\n\n')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/p\s*>/gi,'</p>\n\n')
    .replace(/<\/div\s*>/gi,'</div>\n')
    .replace(/<\/h([1-6])\s*>/gi,'</h$1>\n\n');

  try {
    const doc=new DOMParser().parseFromString(value,'text/html');
    doc.querySelectorAll('script,style,noscript,svg,canvas').forEach(node=>node.remove());

    doc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((heading)=>{
      const level=heading.tagName.toUpperCase();
      heading.insertAdjacentText('beforebegin',`\n\n${level} `);
      heading.insertAdjacentText('afterend','\n\n');
    });

    value=doc.body?.innerText || doc.documentElement?.textContent || value;
  } catch {
    value=value.replace(/<[^>]+>/g,' ');
  }

  return value
    .replace(/\r/g,'')
    .replace(/[ \t]+\n/g,'\n')
    .replace(/\n[ \t]+/g,'\n')
    .replace(/[ \t]{2,}/g,' ')
    .replace(/\n{4,}/g,'\n\n\n')
    .trim();
}

async function parseKindleEbookFile(file) {
  if(!file) throw new Error('Choose a MOBI, AZW, or AZW3 file first.');
  if(file.size>120*1024*1024){
    throw new Error('This Kindle-format file is larger than 120 MB. Use a smaller or optimized copy.');
  }

  const buffer=await file.arrayBuffer();
  const view=new DataView(buffer);
  const offsets=kindlePalmRecordOffsets(view);
  if(offsets.length<3) throw new Error('No readable MOBI/AZW records were found.');

  const record0=new Uint8Array(buffer,offsets[0],offsets[1]-offsets[0]);
  if(record0.length<32) throw new Error('The MOBI/AZW header is incomplete.');

  const headerView=new DataView(record0.buffer,record0.byteOffset,record0.byteLength);
  const compression=readBigEndianU16(headerView,0);
  const textLength=readBigEndianU32(headerView,4);
  const textRecordCount=readBigEndianU16(headerView,8);
  const encryptionType=readBigEndianU16(headerView,12);

  if(encryptionType!==0){
    throw new Error(
      'This Kindle eBook is DRM/encryption protected. Mark, Set, Go! can import DRM-free MOBI/AZW/AZW3 files, but it does not remove or bypass Kindle DRM.'
    );
  }

  const mobiMarker=record0.length>=20
    ? new TextDecoder('ascii').decode(record0.slice(16,20))
    : '';
  if(mobiMarker!=='MOBI'){
    throw new Error('This file does not contain a supported MOBI/KF8 book header.');
  }

  const mobiHeaderLength=readBigEndianU32(headerView,20);
  const encoding=record0.length>=32 ? readBigEndianU32(headerView,28) : 65001;

  if(compression!==1 && compression!==2){
    if(compression===17480){
      throw new Error(
        'This DRM-free Kindle file uses HUFF/CDIC compression, which this importer does not yet decode. Convert your own DRM-free copy to EPUB/MOBI with standard compression, then import it again.'
      );
    }
    throw new Error(`This Kindle file uses unsupported compression type ${compression}.`);
  }

  const availableTextRecords=Math.min(
    textRecordCount,
    Math.max(0,offsets.length-2)
  );
  if(!availableTextRecords){
    throw new Error('The Kindle eBook does not contain readable text records.');
  }

  const chunks=[];
  let totalBytes=0;
  for(let index=1;index<=availableTextRecords;index+=1){
    const start=offsets[index];
    const end=offsets[index+1];
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start) continue;

    const rawRecord=new Uint8Array(buffer,start,end-start);
    const decoded=compression===2 ? decompressPalmDocRecord(rawRecord) : rawRecord;
    chunks.push(decoded);
    totalBytes+=decoded.length;
    if(textLength && totalBytes>=textLength) break;
  }

  const joined=new Uint8Array(Math.min(textLength||totalBytes,totalBytes));
  let cursor=0;
  for(const chunk of chunks){
    if(cursor>=joined.length) break;
    const slice=chunk.subarray(0,Math.min(chunk.length,joined.length-cursor));
    joined.set(slice,cursor);
    cursor+=slice.length;
  }

  const metadata=parseKindleExth(record0,mobiHeaderLength,encoding);

  let headerTitle='';
  try {
    const fullNameOffset=record0.length>=108 ? readBigEndianU32(headerView,100) : 0;
    const fullNameLength=record0.length>=108 ? readBigEndianU32(headerView,104) : 0;
    if(fullNameOffset && fullNameLength && fullNameOffset+fullNameLength<=record0.length){
      headerTitle=decodeKindleBytes(record0.slice(fullNameOffset,fullNameOffset+fullNameLength),encoding)
        .replace(/\0/g,'')
        .trim();
    }
  } catch {}

  const rawMarkup=decodeKindleBytes(joined,encoding);
  const cleaned=cleanKindleMarkup(rawMarkup);
  if(!cleaned || splitWords(cleaned).length<5){
    throw new Error('No readable text could be extracted from this DRM-free Kindle eBook.');
  }

  const fallbackTitle=file.name.replace(/\.(mobi|azw3?|prc)$/i,'');
  const title=metadata.title || headerTitle || fallbackTitle || 'Imported Kindle eBook';
  const author=metadata.author || '';
  const normalized=normalizeImportedBookText(cleaned,{
    title,
    author,
    removePrintedToc:false,
    removeRepeatedHeaders:true
  });

  const format=/\.azw3$/i.test(file.name)
    ? 'AZW3'
    : /\.azw$/i.test(file.name)
      ? 'AZW'
      : 'MOBI';

  return {
    title,
    text:normalized.text,
    source:{
      type:'kindle-upload',
      format:format.toLowerCase(),
      name:file.name,
      fileSize:file.size,
      importedAt:new Date().toISOString(),
      author,
      publisher:metadata.publisher || '',
      drmProtected:false,
      compression,
      textRecordCount:availableTextRecords,
      cleanup:normalized.report,
      documentToc:normalized.toc
    },
    stats:{
      format,
      textRecords:availableTextRecords,
      extractedCharacters:normalized.text.length,
      tocEntries:normalized.toc?.length || 0
    }
  };
}


let pdfJsModulePromise = null;

async function loadPdfJs() {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import('https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.149/build/pdf.min.mjs')
      .then((pdfjsLib) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.149/build/pdf.worker.min.mjs';
        return pdfjsLib;
      })
      .catch((error) => {
        pdfJsModulePromise = null;
        throw new Error(`PDF support could not be loaded. Check the internet connection and try again. ${error?.message || ''}`.trim());
      });
  }
  return pdfJsModulePromise;
}

function normalizePdfPageText(items) {
  const lines = [];
  let currentLine = '';
  let previousY = null;
  let previousEndX = null;

  for (const item of items || []) {
    const value = String(item?.str || '').replace(/\s+/g, ' ').trim();
    if (!value) {
      if (item?.hasEOL && currentLine.trim()) {
        lines.push(currentLine.trim());
        currentLine = '';
        previousY = null;
        previousEndX = null;
      }
      continue;
    }

    const transform = item.transform || [];
    const x = Number(transform[4]) || 0;
    const y = Number(transform[5]) || 0;
    const width = Number(item.width) || 0;
    const changedLine = previousY !== null && Math.abs(y - previousY) > 3;
    const largeGap = previousEndX !== null && x - previousEndX > Math.max(8, (Number(item.height) || 10) * .8);

    if (changedLine && currentLine.trim()) {
      lines.push(currentLine.trim());
      currentLine = '';
    }

    if (currentLine && (largeGap || !/[-–—/]$/.test(currentLine))) {
      currentLine += ' ';
    }

    currentLine += value;
    previousY = y;
    previousEndX = x + width;

    if (item.hasEOL && currentLine.trim()) {
      lines.push(currentLine.trim());
      currentLine = '';
      previousY = null;
      previousEndX = null;
    }
  }

  if (currentLine.trim()) lines.push(currentLine.trim());

  return lines
    .join('\n')
    .replace(/(\w)-\n(\w)/g, '$1$2')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pdfOutlineToToc(outline = [], pageRefs = new Map(), depth = 0) {
  const entries = [];
  for (const item of outline || []) {
    const title = String(item?.title || '').trim();
    let pageNumber = null;
    const destination = item?.dest;
    if (Array.isArray(destination) && destination[0]) {
      pageNumber = pageRefs.get(destination[0]?.num) || null;
    }
    if (title) entries.push({ title, pageNumber, depth });
    if (item?.items?.length) entries.push(...pdfOutlineToToc(item.items, pageRefs, depth + 1));
  }
  return entries;
}

async function parsePdfFile(file, onProgress = () => {}) {
  if (!file) throw new Error('Choose a PDF file first.');
  if (file.size > 100 * 1024 * 1024) {
    throw new Error('This PDF is larger than 100 MB. Use a smaller or optimized copy.');
  }

  const pdfjsLib = await loadPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false
  });

  loadingTask.onPassword = (updatePassword, reason) => {
    const password = window.prompt(
      reason === pdfjsLib.PasswordResponses?.INCORRECT_PASSWORD
        ? 'That password was incorrect. Enter the PDF password again:'
        : 'This PDF is password protected. Enter its password:'
    );
    if (password === null) {
      loadingTask.destroy();
      return;
    }
    updatePassword(password);
  };

  loadingTask.onProgress = ({ loaded, total }) => {
    if (total) onProgress(Math.min(15, Math.round((loaded / total) * 15)), 'Loading PDF…');
  };

  const pdf = await loadingTask.promise;
  const metadata = await pdf.getMetadata().catch(() => null);
  const title =
    String(metadata?.info?.Title || '').trim()
    || file.name.replace(/\.pdf$/i, '')
    || 'Imported PDF';
  const pdfAuthor = String(metadata?.info?.Author || '').trim();
  const pageRefs = new Map();
  const pages = [];
  let extractedCharacters = 0;
  let textPages = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    try {
      if (page.ref?.num) pageRefs.set(page.ref.num, pageNumber);
      const content = await page.getTextContent({
        includeMarkedContent: false,
        disableNormalization: false
      });
      const pageText = normalizePdfPageText(content.items);
      if (pageText.length >= 20) textPages += 1;
      extractedCharacters += pageText.length;
      pages.push({
        pageNumber,
        text: pageText,
        width: page.view?.[2] || null,
        height: page.view?.[3] || null
      });
    } finally {
      page.cleanup();
    }

    const percent = 15 + Math.round((pageNumber / pdf.numPages) * 80);
    onProgress(percent, `Extracting page ${pageNumber} of ${pdf.numPages}…`);
  }

  // Remove running headers/footers that recur across PDF pages before the
  // pages are joined into reader text. This catches book titles and page labels
  // without disturbing one-off chapter headings.
  const pdfLineCounts = new Map();
  pages.forEach((page) => page.text.split('\n').forEach((line) => {
    const clean = line.replace(/\s+/g, ' ').trim();
    if (!clean || clean.length > 120) return;
    const key = normalizedSourceLine(clean);
    if (key) pdfLineCounts.set(key, (pdfLineCounts.get(key) || 0) + 1);
  }));
  const repeatThreshold = Math.max(3, Math.ceil(pdf.numPages * .3));
  const repeatedPdfLines = new Set([...pdfLineCounts.entries()].filter(([, count]) => count >= repeatThreshold).map(([key]) => key));
  const pdfTitleKey = normalizedSourceLine(title);
  const pdfAuthorKey = normalizedSourceLine(pdfAuthor);
  let preservedPdfTitle = false;
  let preservedPdfAuthor = false;
  pages.forEach((page) => {
    page.text = page.text.split('\n').filter((line) => {
      const clean = line.replace(/\s+/g, ' ').trim();
      const key = normalizedSourceLine(clean);
      if (/^(?:page\s+)?\d{1,5}$/i.test(clean)) return false;
      if (pdfTitleKey && key === pdfTitleKey && repeatedPdfLines.has(key)) {
        if (preservedPdfTitle) return false;
        preservedPdfTitle = true;
        return true;
      }
      if (pdfAuthorKey && key === pdfAuthorKey && repeatedPdfLines.has(key)) {
        if (preservedPdfAuthor) return false;
        preservedPdfAuthor = true;
        return true;
      }
      if (!repeatedPdfLines.has(key)) return true;
      return isLikelyRealSectionHeading(clean);
    }).join('\n').trim();
  });

  const outline = await pdf.getOutline().catch(() => null);
  const toc = pdfOutlineToToc(outline || [], pageRefs);
  let text = pages
    .map((page) => `\n\n[PDF Page ${page.pageNumber}]\n\n${page.text}`)
    .join('')
    .trim();
  const normalizedPdf = normalizeImportedBookText(text, { title, author:pdfAuthor, removePrintedToc:true, removeRepeatedHeaders:false });
  text = normalizedPdf.text;
  const pdfDocumentToc = toc.map((item) => {
    const marker = item.pageNumber ? `[PDF Page ${item.pageNumber}]` : '';
    const position = marker ? text.indexOf(marker) : -1;
    if (position < 0) return null;
    return { title:item.title, index:splitWords(text.slice(0, position)).length, type:'chapter', pageNumber:item.pageNumber };
  }).filter(Boolean);

  const textCoverage = pdf.numPages ? textPages / pdf.numPages : 0;
  const likelyScanned = extractedCharacters < Math.max(200, pdf.numPages * 35)
    || textCoverage < .2;

  await loadingTask.destroy().catch(() => {});
  onProgress(100, 'PDF ready.');

  if (likelyScanned) {
    throw new Error(
      'This PDF appears to be scanned or image-only. Very little selectable text was found. OCR support will be needed for this file.'
    );
  }

  return {
    title,
    text,
    source: {
      type: 'pdf',
      name: file.name,
      fileSize: file.size,
      pageCount: pdf.numPages,
      importedAt: new Date().toISOString(),
      toc,
      pages: pages.map(({ pageNumber, width, height }) => ({ pageNumber, width, height })),
      textCoverage,
      cleanup: normalizedPdf.report,
      documentToc: pdfDocumentToc.length ? pdfDocumentToc : normalizedPdf.toc
    },
    stats: {
      pageCount: pdf.numPages,
      textPages,
      extractedCharacters,
      tocEntries: toc.length
    }
  };
}

function renderUpload() {
  stopReader();
  app.innerHTML = `
    <section class="panel import-book-page">
      <header class="import-book-header">
        <div>
          <span class="source-category">Import</span>
          <h1>Import a Book or Document</h1>
          <p>Open EPUB, DRM-free MOBI/AZW/AZW3, PDF, or UTF-8 text files. Processing happens locally in your browser; the original file is not uploaded to the Mark, Set, Go! server.</p>
        </div>
      </header>

      <div class="import-compact-row">
        <div class="import-format-chips" aria-label="Supported formats">
          <span><strong>EPUB</strong><small>Book + TOC</small></span>
          <span><strong>MOBI / AZW3</strong><small>DRM-free eBooks</small></span>
          <span><strong>PDF</strong><small>Selectable text</small></span>
          <span><strong>TXT</strong><small>Plain text</small></span>
        </div>

        <label class="import-drop-zone compact" for="text-file">
          <span class="import-upload-icon">⇧</span>
          <span><strong>Choose a file</strong><small>EPUB, MOBI, AZW/AZW3, PDF, or TXT</small></span>
          <input id="text-file" type="file"
            accept=".epub,application/epub+zip,.mobi,.azw,.azw3,.prc,application/x-mobipocket-ebook,.pdf,application/pdf,.txt,text/plain">
        </label>
      </div>

      <div id="pdf-import-progress" class="pdf-import-progress" hidden>
        <div class="pdf-progress-heading">
          <strong id="pdf-progress-label">Preparing PDF…</strong>
          <span id="pdf-progress-percent">0%</span>
        </div>
        <div class="pdf-progress-track"><span id="pdf-progress-bar"></span></div>
      </div>

      <div id="upload-status" class="status import-status" role="status" aria-live="polite"></div>

      <details class="pdf-import-note compact-note">
        <summary>PDF import details</summary>
        <p>Modern PDFs with selectable text work best. Page labels such as <em>PDF Page 12</em> are inserted into the extracted text so notes, AI questions, and reading progress retain a connection to the source pages. Image-only scans are not silently imported as blank documents.</p>
      </details>
      <details class="pdf-import-note compact-note">
        <summary>Kindle-format import details</summary>
        <p>MOBI, AZW, and AZW3 import is intended for files you are legally able to use. DRM-free PalmDOC/KF8 text is extracted locally in your browser. DRM/encrypted Kindle books are detected and rejected; Mark, Set, Go! does not remove or bypass Kindle DRM. KFX is not supported.</p>
      </details>
    </section>`;

  app.querySelector('#text-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const status = app.querySelector('#upload-status');
    const progress = app.querySelector('#pdf-import-progress');
    const progressLabel = app.querySelector('#pdf-progress-label');
    const progressPercent = app.querySelector('#pdf-progress-percent');
    const progressBar = app.querySelector('#pdf-progress-bar');
    const input = event.currentTarget;

    const setProgress = (percent, label) => {
      progress.hidden = false;
      const value = Math.max(0, Math.min(100, Number(percent) || 0));
      progressBar.style.width = `${value}%`;
      progressPercent.textContent = `${Math.round(value)}%`;
      progressLabel.textContent = label || 'Processing PDF…';
    };

    input.disabled = true;
    status.className = 'status import-status';
    status.textContent = '';

    try {
      const isEpub = /\.epub$/i.test(file.name) || file.type === 'application/epub+zip';
      const isKindle = /\.(mobi|azw3?|prc)$/i.test(file.name) || file.type === 'application/x-mobipocket-ebook';
      const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';

      if (isEpub) {
        progress.hidden = true;
        status.textContent = 'Opening EPUB…';
        const book = await parseEpubFile(file);
        renderReaderWithText(book.title, book.text, book.source);
        return;
      }

      if (isKindle) {
        progress.hidden = true;
        status.textContent = 'Opening DRM-free Kindle eBook…';
        const book = await parseKindleEbookFile(file);
        status.className = 'status success import-status';
        status.textContent = `${book.stats.format} text extracted. Opening ${book.title}…`;
        window.setTimeout(() => renderReaderWithText(book.title, book.text, book.source), 180);
        return;
      }

      if (isPdf) {
        setProgress(1, 'Loading PDF support…');
        const book = await parsePdfFile(file, setProgress);
        status.className = 'status success import-status';
        status.textContent = `${book.stats.pageCount} pages extracted. Opening ${book.title}…`;
        window.setTimeout(() => renderReaderWithText(book.title, book.text, book.source), 250);
        return;
      }

      progress.hidden = true;
      status.textContent = 'Opening text file…';
      const rawText = await file.text();
      if (!rawText.trim()) throw new Error('This text file is empty.');
      const importedTitle = file.name.replace(/\.txt$/i, '');
      const normalized = normalizeImportedBookText(rawText, { title: importedTitle });
      renderReaderWithText(importedTitle, normalized.text, {
        type: 'upload',
        name: file.name,
        fileSize: file.size,
        importedAt: new Date().toISOString(),
        documentToc: normalized.toc,
        cleanup: normalized.report
      });
    } catch (error) {
      console.error('Book import failed.', error);
      progress.hidden = true;
      status.className = 'status error import-status';
      status.textContent = error?.message || 'The file could not be read.';
      input.disabled = false;
      input.value = '';
    }
  });
}



const DRM_FREE_CATEGORIES = [
  ['all','All categories'],
  ['fiction','Fiction'],['literature','Literature'],['classics','Classics'],
  ['mystery','Mystery'],['thriller','Thriller'],['science-fiction','Science Fiction'],
  ['fantasy','Fantasy'],['romance','Romance'],['history','History'],
  ['biography','Biography'],['philosophy','Philosophy'],['religion','Religion'],
  ['science','Science'],['mathematics','Mathematics'],['technology','Technology'],
  ['programming','Programming'],['business','Business'],['economics','Economics'],
  ['politics','Politics & Society'],['psychology','Psychology'],['education','Education'],
  ['children','Children & YA'],['poetry','Poetry'],['drama','Drama'],['reference','Reference']
];

function drmFreeFormatButtons(book={}) {
  const formats=Array.isArray(book.formats)?book.formats:[];
  return formats.filter(format=>['epub','pdf'].includes(format)).map(format=>`
    <button class="secondary" type="button"
      data-drm-download-provider="${escapeHtml(book.provider||'')}"
      data-drm-download-id="${escapeHtml(book.id||'')}"
      data-drm-download-format="${escapeHtml(format)}"
      data-drm-download-title="${escapeHtml(book.title||'book')}">↓ ${escapeHtml(format.toUpperCase())}</button>`).join('');
}

function drmFreeBookCard(book={}) {
  const subjects=[...(book.categories||[]),...(book.subjects||[])].filter(Boolean).slice(0,4);
  const formatText=(book.formats||[]).map(format=>format==='text'?'TXT':String(format).toUpperCase()).join(' · ');
  return `
    <article class="drm-free-result-card">
      <div class="drm-free-cover">
        ${book.cover?`<img src="${escapeHtml(book.cover)}" alt="Cover of ${escapeHtml(book.title||'')}" loading="lazy" referrerpolicy="no-referrer">`:`<div class="drm-free-cover-placeholder">OPEN<br>BOOK</div>`}
        <span class="drm-free-rights-badge">Free · DRM-free</span>
      </div>
      <div class="drm-free-result-copy">
        <div class="drm-free-source-line"><span>${escapeHtml(book.sourceLabel||book.provider||'Open source')}</span>${book.downloadCount?`<small>${Number(book.downloadCount).toLocaleString()} downloads</small>`:''}</div>
        <h3>${escapeHtml(book.title||'Untitled')}</h3>
        <p class="drm-free-author">${escapeHtml(book.author||'Unknown author')}</p>
        ${book.description?`<p>${escapeHtml(book.description)}</p>`:''}
        ${subjects.length?`<div class="drm-free-tags">${subjects.map(value=>`<span>${escapeHtml(value)}</span>`).join('')}</div>`:''}
        <small class="drm-free-formats">${escapeHtml(formatText||'Readable online')}${book.year?` · ${escapeHtml(String(book.year))}`:''}${book.publisher?` · ${escapeHtml(book.publisher)}`:''}</small>
        ${book.license?`<small class="drm-free-license">${escapeHtml(book.license)}</small>`:''}
        <div class="drm-free-actions">
          ${book.readable?`<button class="primary" type="button" data-drm-read-provider="${escapeHtml(book.provider||'')}" data-drm-read-id="${escapeHtml(book.id||'')}">▸ Read now</button>`:''}
          ${['gutenberg','standardebooks'].includes(book.provider)?drmFreeFormatButtons(book):''}
          ${book.downloadUrl?`<a class="secondary button-link" href="${escapeHtml(book.downloadUrl)}" target="_blank" rel="noopener noreferrer">Download ${escapeHtml(String(book.downloadFormat||'book').toUpperCase())} ↗</a>`:''}
          ${book.externalUrl?`<a class="secondary button-link" href="${escapeHtml(book.externalUrl)}" target="_blank" rel="noopener noreferrer">Book page ↗</a>`:''}
        </div>
      </div>
    </article>`;
}

function drmFreeStoreCard(store={}) {
  return `
    <article class="drm-free-store-card">
      <span class="source-category">DRM-free store / publisher</span>
      <h3>${escapeHtml(store.name||'Store')}</h3>
      <p>${escapeHtml(store.note||'')}</p>
      <div class="drm-free-tags">
        ${(store.categories||[]).slice(0,6).map(value=>`<span>${escapeHtml(value.replaceAll('-',' '))}</span>`).join('')}
      </div>
      <small>${escapeHtml((store.formats||[]).map(x=>x.toUpperCase()).join(' · '))}</small>
      <a class="primary button-link" href="${escapeHtml(store.url||'#')}" target="_blank" rel="noopener noreferrer">Search this store ↗</a>
    </article>`;
}

async function downloadDrmFreeEdition({provider,id,format,title}) {
  const response=await fetch(`/api/library/download?provider=${encodeURIComponent(provider)}&id=${encodeURIComponent(id)}&format=${encodeURIComponent(format)}`);
  if(!response.ok){
    let error={};
    try{error=await response.json();}catch{}
    throw new Error(error.error||`The ${format.toUpperCase()} edition could not be downloaded.`);
  }
  const blob=await response.blob();
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=`${String(title||'book').replace(/[<>:"/\\|?*]+/g,' ').trim()||'book'}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}

function renderDrmFreeBookFinder(initial={}) {
  stopReader();
  const initialQuery=String(initial.query||'');
  const initialCategory=String(initial.category||'all');
  app.innerHTML=`
    <section class="platform-page drm-free-finder">
      <header class="platform-hero drm-free-hero">
        <div>
          <button class="text-link" type="button" data-action="browse">← Back to Browse</button>
          <span class="source-category">Download & discover</span>
          <h1>DRM-Free Book Finder</h1>
          <p>Search free/open books you can read or download, then discover DRM-free stores and publishers for modern titles. Search by title, author, subject, category, language, source, and format.</p>
        </div>
        <div class="drm-free-hero-note">
          <strong>Portable books, not locked files</strong>
          <span>Free results come from supported open catalogs. Commercial results link to stores that sell DRM-free editions.</span>
        </div>
      </header>

      <form id="drm-free-search" class="drm-free-search-panel">
        <label class="drm-free-query"><span>Search</span><input id="drm-free-query" type="search" value="${escapeHtml(initialQuery)}" placeholder="Title, author, subject, idea, or keyword…" autocomplete="off"></label>
        <label><span>Category</span><select id="drm-free-category">${DRM_FREE_CATEGORIES.map(([value,label])=>`<option value="${escapeHtml(value)}" ${initialCategory===value?'selected':''}>${escapeHtml(label)}</option>`).join('')}</select></label>
        <label><span>Availability</span><select id="drm-free-availability"><option value="all">Free + paid DRM-free</option><option value="free">Free downloads only</option><option value="paid">DRM-free stores only</option></select></label>
        <label><span>Format</span><select id="drm-free-format"><option value="all">Any format</option><option value="epub">EPUB</option><option value="pdf">PDF</option><option value="text">TXT / text</option><option value="mobi">MOBI</option></select></label>
        <label><span>Source</span><select id="drm-free-source"><option value="all">All supported sources</option><option value="gutenberg">Project Gutenberg</option><option value="standardebooks">Standard Ebooks</option><option value="openlibrary">Open Library — public editions</option><option value="doab">DOAB — scholarly open access</option><option value="oapen">OAPEN — scholarly open access</option><option value="commercial">DRM-free stores/publishers</option></select></label>
        <label><span>Rights</span><select id="drm-free-license"><option value="all">Public domain + open access</option><option value="public-domain">Public domain</option><option value="open-access">Open access</option></select></label>
        <label><span>Language</span><select id="drm-free-language"><option value="en">English</option><option value="fr">French</option><option value="de">German</option><option value="es">Spanish</option><option value="it">Italian</option><option value="pt">Portuguese</option><option value="la">Latin</option><option value="el">Greek</option><option value="all">Any language</option></select></label>
        <label><span>From year</span><input id="drm-free-year-from" type="number" min="0" max="2100" placeholder="e.g. 1900"></label>
        <label><span>To year</span><input id="drm-free-year-to" type="number" min="0" max="2100" placeholder="e.g. 2026"></label>
        <label><span>Sort</span><select id="drm-free-sort"><option value="popular">Popular / relevance</option><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="title">Title</option><option value="author">Author</option><option value="downloads">Downloads</option></select></label>
        <button class="primary" type="submit">Search DRM-free books</button>
      </form>

      <div class="drm-free-category-shortcuts" aria-label="Popular DRM-free categories">
        ${DRM_FREE_CATEGORIES.slice(1,13).map(([value,label])=>`<button type="button" data-drm-category="${escapeHtml(value)}">${escapeHtml(label)}</button>`).join('')}
      </div>

      <div id="drm-free-status" class="status">Choose a category or search for a title, author, or subject.</div>
      <div id="drm-free-results"></div>
    </section>`;

  const form=app.querySelector('#drm-free-search');
  const status=app.querySelector('#drm-free-status');
  const results=app.querySelector('#drm-free-results');

  const runSearch=async()=>{
    const params=new URLSearchParams({
      q:app.querySelector('#drm-free-query')?.value.trim()||'',
      category:app.querySelector('#drm-free-category')?.value||'all',
      availability:app.querySelector('#drm-free-availability')?.value||'all',
      format:app.querySelector('#drm-free-format')?.value||'all',
      source:app.querySelector('#drm-free-source')?.value||'all',
      license:app.querySelector('#drm-free-license')?.value||'all',
      language:app.querySelector('#drm-free-language')?.value||'en',
      yearFrom:app.querySelector('#drm-free-year-from')?.value||'',
      yearTo:app.querySelector('#drm-free-year-to')?.value||'',
      sort:app.querySelector('#drm-free-sort')?.value||'popular'
    });
    status.className='status';
    status.textContent='Searching supported DRM-free catalogs…';
    results.innerHTML='<div class="drm-free-loading">Searching Project Gutenberg, Standard Ebooks, Open Library, DOAB, OAPEN, and the DRM-free source directory…</div>';
    try{
      const response=await fetch(`/api/drm-free/search?${params.toString()}`,{cache:'no-store'});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||'DRM-free search failed.');
      const books=Array.isArray(data.books)?data.books:[];
      const stores=Array.isArray(data.stores)?data.stores:[];
      status.className='status success';
      status.textContent=`Found ${books.length} free/open book${books.length===1?'':'s'}${stores.length?` and ${stores.length} DRM-free source${stores.length===1?'':'s'}`:''}.`;
      results.innerHTML=`
        ${books.length?`<section class="drm-free-results-section"><div class="section-heading"><div><span class="source-category">Free & open</span><h2>Books you can read or download</h2><p>Results from supported public-domain/open ebook catalogs.</p></div></div><div class="drm-free-results-grid">${books.map(drmFreeBookCard).join('')}</div></section>`:''}
        ${stores.length?`<section class="drm-free-results-section"><div class="section-heading"><div><span class="source-category">Buy DRM-free</span><h2>Stores & publishers</h2><p>Search these sources for modern DRM-free books. Verify the individual title and available format before buying.</p></div></div><div class="drm-free-store-grid">${stores.map(drmFreeStoreCard).join('')}</div></section>`:''}
        ${!books.length&&!stores.length?'<div class="library-empty-state"><span>⌕</span><h3>No matches yet</h3><p>Try a broader subject, another category, or All supported sources.</p></div>':''}
        <p class="drm-free-coverage-note">${escapeHtml(data.note||'')}</p>`;
      results.querySelectorAll('[data-drm-read-provider]').forEach(button=>button.addEventListener('click',async()=>{
        button.disabled=true;
        const old=button.textContent;
        button.textContent='Opening…';
        try{
          const response=await fetch(`/api/library/read?provider=${encodeURIComponent(button.dataset.drmReadProvider||'')}&id=${encodeURIComponent(button.dataset.drmReadId||'')}&format=best`);
          const data=await response.json();
          if(!response.ok) throw new Error(data.error||'The book could not be opened.');
          renderReaderWithText(data.title||'DRM-Free Book',data.text||'',{
            type:'drm-free-library',
            provider:button.dataset.drmReadProvider||'',
            id:button.dataset.drmReadId||'',
            title:data.title||'DRM-Free Book',
            author:data.author||'',
            sourceUrl:data.sourceUrl||''
          });
        }catch(error){
          window.alert(error?.message||'The book could not be opened.');
          button.disabled=false;
          button.textContent=old;
        }
      }));
      results.querySelectorAll('[data-drm-download-provider]').forEach(button=>button.addEventListener('click',async()=>{
        button.disabled=true;
        const old=button.textContent;
        button.textContent='Downloading…';
        try{
          await downloadDrmFreeEdition({
            provider:button.dataset.drmDownloadProvider||'',
            id:button.dataset.drmDownloadId||'',
            format:button.dataset.drmDownloadFormat||'epub',
            title:button.dataset.drmDownloadTitle||'book'
          });
        }catch(error){
          window.alert(error?.message||'The edition could not be downloaded.');
        }finally{
          button.disabled=false;
          button.textContent=old;
        }
      }));
    }catch(error){
      status.className='status error';
      status.textContent=error?.message||'DRM-free search failed.';
      results.innerHTML='';
    }
  };

  form?.addEventListener('submit',event=>{event.preventDefault();runSearch();});
  app.querySelectorAll('[data-drm-category]').forEach(button=>button.addEventListener('click',()=>{
    app.querySelector('#drm-free-category').value=button.dataset.drmCategory||'all';
    runSearch();
  }));

  if(initialQuery||initialCategory!=='all') runSearch();
}


function renderBrowseHub() {
  stopReader();

  const progress = Object.values(readStoredObject(READING_PROGRESS_KEY));
  const layoutMode = localStorage.getItem(BROWSE_LAYOUT_KEY) === 'list' ? 'list' : 'tiles';
  const firstName = currentReaderFirstName();
  const recentTitles = progress
    .sort((x, y) => new Date(y.lastReadAt || 0) - new Date(x.lastReadAt || 0))
    .slice(0, 4);

  const search = (query, scope = app.querySelector('#browse-global-scope')?.value || 'all', format = app.querySelector('#browse-global-format')?.value || 'best') => {
    const trimmed = String(query || '').trim();
    localStorage.setItem('markSetGoPendingLibrarySearch', trimmed);
    localStorage.setItem('markSetGoPendingBrowseScope', scope);
    renderUnifiedLibrary({ query:trimmed, scope, provider:'all' });
    requestAnimationFrame(() => {
      const formatSelect = app.querySelector('#unified-library-format');
      if (formatSelect && format) formatSelect.value = format;
    });
  };

  const browseTile = (item, kind = 'free') => {
    const paletteStyle = `--cover-a:${item.palette?.[0] || '#7cb6ff'}; --cover-b:${item.palette?.[1] || '#2d6ab7'}; --cover-c:${item.palette?.[2] || '#16355a'};`;
    const actionAttrs = kind === 'guide'
      ? (item.active ? `data-open-guide="${escapeHtml(item.id)}"` : '')
      : `data-open-browse-book="${escapeHtml(item.id)}"`;
    const interactiveClass = (kind === 'guide' ? item.active : true) ? 'is-interactive' : 'is-disabled';
    const actionText = kind === 'guide'
      ? (item.active ? item.actionLabel : 'Coming soon')
      : (item.actionLabel || 'Open');
    return `
      <article class="browse-book-card ${interactiveClass}">
        <div class="browse-face-cover" style="${paletteStyle}">
          <span class="browse-cover-badge">${escapeHtml(item.badge || item.category || '')}</span>
          <div class="browse-cover-copy">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.author || '')}</span>
          </div>
          <small>${escapeHtml(item.category || '')}</small>
        </div>
        <div class="browse-book-body">
          <span class="source-category">${escapeHtml(item.category || '')}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.blurb || '')}</p>
          <small>${escapeHtml(item.detail || '')}</small>
          <div class="browse-book-actions">
            ${kind === 'guide' && !item.active
              ? `<button class="secondary" type="button" disabled>Coming soon</button>`
              : `<button class="primary" type="button" ${actionAttrs}>${escapeHtml(actionText)}</button>`}
            ${kind === 'guide' && item.buyUrl ? `<a class="secondary button-link" href="${escapeHtml(item.buyUrl)}" target="_blank" rel="noopener noreferrer">Buy original</a>` : ''}
          </div>
        </div>
      </article>`;
  };

  const browseList = (item, kind = 'free') => {
    const paletteStyle = `--cover-a:${item.palette?.[0] || '#7cb6ff'}; --cover-b:${item.palette?.[1] || '#2d6ab7'}; --cover-c:${item.palette?.[2] || '#16355a'};`;
    const actionAttrs = kind === 'guide'
      ? (item.active ? `data-open-guide="${escapeHtml(item.id)}"` : '')
      : `data-open-browse-book="${escapeHtml(item.id)}"`;
    const actionText = kind === 'guide'
      ? (item.active ? item.actionLabel : 'Coming soon')
      : (item.actionLabel || 'Open');
    return `
      <article class="browse-list-row ${kind === 'guide' && !item.active ? 'is-disabled' : ''}">
        <div class="browse-list-cover" style="${paletteStyle}">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.author || '')}</span>
        </div>
        <div class="browse-list-copy">
          <div class="browse-list-title-line">
            <span class="source-category">${escapeHtml(item.category || '')}</span>
            <h3>${escapeHtml(item.title)}</h3>
          </div>
          <p>${escapeHtml(item.blurb || '')}</p>
          <small>${escapeHtml(item.detail || '')}</small>
        </div>
        <div class="browse-list-actions">
          ${kind === 'guide' && !item.active
            ? `<button class="secondary" type="button" disabled>Coming soon</button>`
            : `<button class="primary" type="button" ${actionAttrs}>${escapeHtml(actionText)}</button>`}
          ${kind === 'guide' && item.buyUrl ? `<a class="secondary button-link" href="${escapeHtml(item.buyUrl)}" target="_blank" rel="noopener noreferrer">Buy original</a>` : ''}
        </div>
      </article>`;
  };

  const renderShelf = (items, kind = 'free') => `
    <div class="browse-shelf browse-shelf-${layoutMode}">
      ${items.map((item) => layoutMode === 'tiles' ? browseTile(item, kind) : browseList(item, kind)).join('')}
    </div>`;

  const recentHtml = recentTitles.length ? `
    <section class="browse-section browse-recent-section">
      <div class="section-heading">
        <div>
          <span class="source-category">Continue</span>
          <h2>Pick back up where you left off</h2>
        </div>
        <button class="secondary" type="button" data-view="my-library">Open My Library</button>
      </div>
      <div class="browse-recent-grid">
        ${recentTitles.map((item) => `
          <article class="browse-recent-card">
            <span class="source-category">Recent</span>
            <h3>${escapeHtml(item.title || 'Untitled')}</h3>
            <p>${escapeHtml(item.author || item.creator || 'Saved in your reader')}</p>
            <small>${item.lastReadAt ? `Last read ${escapeHtml(libraryRecencyLabel(item.lastReadAt))}` : 'Saved in your library'}</small>
            <button class="primary" type="button" data-progress-open="${escapeHtml(item.documentId || '')}">Resume reading</button>
          </article>`).join('')}
      </div>
    </section>` : '';

  app.innerHTML = `
    <section class="platform-page browse-hub browse-hub-modern">
      <header class="platform-hero browse-hero-card">
        <div class="browse-hero-copy">
          <span class="source-category">Browse</span>
          <h1>${firstName ? `Welcome back, ${escapeHtml(firstName)}.` : 'Find your next great read.'}</h1>
          <p>Explore modern reading guides, timeless classics, and trusted online libraries—all in one place.</p>
          <nav class="browse-hero-tags browse-hero-links" aria-label="Jump to Browse section">
            <a href="#browse-modern-guides">Modern Guides</a>
            <a href="#browse-free-books">Free Books</a>
            <a href="#browse-drm-free">DRM-Free Finder</a>
            <a href="#browse-collections">Collections</a>
          </nav>
        </div>
        <div class="browse-hero-actions">
          <button class="primary" type="button" data-browse-search="all">Search all libraries</button>
          <button class="secondary" type="button" data-action="reader">Return to Reader</button>
        </div>
      </header>

      <form id="browse-global-search" class="browse-search browse-search-modern">
        <span aria-hidden="true">⌕</span>
        <input id="browse-global-query" type="search" placeholder="Search title, author, subject, or idea…" autocomplete="off">
        <select id="browse-global-scope" aria-label="What to search">
          <option value="all">Everything</option>
          <option value="modern">Modern Guides</option>
          <option value="free">Free Books & Classics</option>
          <option value="online">Online Libraries</option>
          <option value="collections">Curated Collections</option>
        </select>
        <select id="browse-global-format" aria-label="Preferred reading format">
          <option value="best">Best available format</option>
          <option value="text">Plain text</option>
          <option value="epub">EPUB</option>
          <option value="pdf">PDF</option>
        </select>
        <button class="primary" type="submit">Search</button>
      </form>

      <section class="browse-control-bar">
        <div class="browse-layout-toggle" role="group" aria-label="Browse layout">
          <span class="browse-toggle-label">View</span>
          <button class="${layoutMode === 'tiles' ? 'is-active' : ''}" type="button" data-browse-layout="tiles">Face covers</button>
          <button class="${layoutMode === 'list' ? 'is-active' : ''}" type="button" data-browse-layout="list">List</button>
        </div>
        <p class="browse-helper-copy">Choose cover view for browsing or switch to a compact list when you want to scan titles quickly.</p>
      </section>

      <section id="browse-popular-libraries" class="browse-section browse-library-hub-section">
        <div class="section-heading">
          <div>
            <span class="source-category">Sources</span>
            <h2>Popular libraries</h2>
            <p>Search trusted sources for full texts, editions, previews, and books you can borrow or read online.</p>
          </div>
        </div>
        <div class="browse-library-hub">
          ${BROWSE_LIBRARY_SOURCES.map((item) => `
            <button class="browse-library-card" type="button" data-browse-provider="${escapeHtml(item.provider)}">
              <span class="browse-library-icon">${escapeHtml(item.icon)}</span>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.note)}</small>
            </button>`).join('')}
        </div>
      </section>

      <section id="browse-drm-free" class="browse-section drm-free-browse-promo">
        <div class="drm-free-promo-copy">
          <span class="source-category">Open & portable ebooks</span>
          <h2>DRM-Free Book Finder</h2>
          <p>Search free public-domain books by category, author, subject, language, format, and popularity—then browse a curated directory of stores and publishers that sell modern DRM-free ebooks.</p>
          <div class="drm-free-promo-actions">
            <button class="primary" type="button" data-action="drm-free-books">Search DRM-free books</button>
            <button class="secondary" type="button" data-drm-quick-category="philosophy">Browse Philosophy</button>
            <button class="secondary" type="button" data-drm-quick-category="history">Browse History</button>
            <button class="secondary" type="button" data-drm-quick-category="science-fiction">Browse Science Fiction</button>
          </div>
        </div>
        <div class="drm-free-promo-stats">
          <strong>Free + paid</strong><span>One place to start your search</span>
          <strong>EPUB / PDF / TXT</strong><span>Filter by usable formats</span>
          <strong>Read or download</strong><span>Open supported free books directly</span>
        </div>
      </section>

      <section id="browse-modern-guides" class="browse-section browse-modern-guides-section">
        <div class="section-heading">
          <div>
            <span class="source-category">Modern Guides</span>
            <h2>Modern Guides</h2>
            <p>Explore original, in-depth guides to popular contemporary books, with built-in ways to discuss, review, and apply what you read.</p>
          </div>
        </div>
        ${renderShelf(MODERN_GUIDE_SHELF, 'guide')}
      </section>

      <section id="browse-free-books" class="browse-section browse-free-books-section">
        <div class="section-heading">
          <div>
            <span class="source-category">Free to read</span>
            <h2>Free Books & Classics</h2>
            <p>Discover enduring works you can read now, from novels and philosophy to history and political thought.</p>
          </div>
        </div>
        ${renderShelf(BROWSE_FREE_BOOKS, 'free')}
      </section>

      <section id="browse-collections" class="browse-section browse-collections-section">
        <div class="section-heading">
          <div>
            <span class="source-category">Collections</span>
            <h2>Browse by shelf</h2>
            <p>Browse curated reading paths by tradition, subject, and major ideas.</p>
          </div>
        </div>
        <div class="browse-collection-list">
          ${BROWSE_COLLECTIONS.map(([label, query]) => `
            <button class="browse-collection-chip" type="button" data-collection-query="${escapeHtml(query)}">${escapeHtml(label)}</button>`).join('')}
        </div>
      </section>

      ${recentHtml}
    </section>`;

  app.querySelector('#browse-global-search')?.addEventListener('submit', (event) => {
    event.preventDefault();
    search(
      app.querySelector('#browse-global-query')?.value || '',
      app.querySelector('#browse-global-scope')?.value || 'all'
    );
  });

  app.querySelectorAll('[data-drm-quick-category]').forEach((button) => button.addEventListener('click', () => {
    renderDrmFreeBookFinder({ category:button.dataset.drmQuickCategory || 'all' });
  }));

  app.querySelectorAll('[data-browse-layout]').forEach((button) => button.addEventListener('click', () => {
    localStorage.setItem(BROWSE_LAYOUT_KEY, button.dataset.browseLayout === 'list' ? 'list' : 'tiles');
    renderBrowseHub();
  }));

  app.querySelectorAll('[data-collection-query]').forEach((button) => button.addEventListener('click', () => search(button.dataset.collectionQuery || '', 'all')));
  app.querySelectorAll('[data-browse-search]').forEach((button) => button.addEventListener('click', () => {
    const input = app.querySelector('#browse-global-query');
    input?.scrollIntoView({ behavior:'smooth', block:'center' });
    input?.focus();
  }));
  app.querySelectorAll('[data-browse-provider]').forEach((button) => button.addEventListener('click', () => {
    renderUnifiedLibrary({ provider: button.dataset.browseProvider || 'all' });
  }));

  app.querySelectorAll('[data-open-guide]').forEach((button) => button.addEventListener('click', async () => {
    const guideId = button.dataset.openGuide || '';
    const guide = MODERN_GUIDE_SHELF.find((item) => item.id === guideId && item.active);
    if (!guide) return;
    try {
      const response = await fetch(`/texts/modern-guides/${encodeURIComponent(guideId)}-guide.txt`, { cache:'no-store' });
      if (!response.ok) throw new Error(`Could not load the ${guide.title} guide.`);
      const text = await response.text();
      renderReaderWithText(`${guide.title} — Mark, Set, Go! Guide`, text, {
        type: 'modern-guide',
        id: guide.id,
        title: `${guide.title} — Mark, Set, Go! Guide`,
        originalTitle: guide.title,
        originalAuthor: guide.author,
        buyUrl: guide.buyUrl,
        subtitle: `An independent reading guide to ${guide.title}`
      });
    } catch (error) {
      window.alert(error?.message || 'The guide could not be opened.');
    }
  }));

  app.querySelectorAll('[data-open-browse-book]').forEach((button) => button.addEventListener('click', async () => {
    const item = BROWSE_FREE_BOOKS.find((entry) => entry.id === button.dataset.openBrowseBook);
    if (!item?.action) return;
    if (item.action.type === 'search') {
      search(item.action.query || '');
      return;
    }
    if (item.action.type === 'source') {
      try {
        const loaded = await loadLocalText(item.action.key);
        renderReaderWithText(loaded.title, loaded.text, { type:'local-library', id:item.action.key, title:loaded.title });
      } catch (error) {
        window.alert(error?.message || 'That text could not be opened.');
      }
    }
  }));

  app.querySelectorAll('[data-progress-open]').forEach((button) => button.addEventListener('click', () => {
    const documentId = button.dataset.progressOpen;
    let data = null;
    try { data = JSON.parse(localStorage.getItem(`${DOCUMENT_STORAGE_PREFIX}${documentId}`) || 'null'); } catch {}
    if (!data?.text) return renderReadingList();
    renderReaderWithText(data.title, data.text, data.source || { type:'saved' });
    const record = readStoredObject(READING_PROGRESS_KEY)[documentId];
    requestAnimationFrame(() => jumpToWordIndex(record?.lastWord || 0));
  }));
}


function libraryRecencyClass(lastReadAt) {
  if (!lastReadAt) return 'recency-undated';

  const readDate = new Date(lastReadAt);
  if (Number.isNaN(readDate.getTime())) return 'recency-undated';

  const now = new Date();
  const today = startOfDay(now);
  const readDay = startOfDay(readDate);
  const ageDays = Math.floor((today - readDay) / 86400000);

  if (ageDays <= 0) return 'recency-today';
  if (ageDays <= 7) return 'recency-week';
  if (ageDays <= 30) return 'recency-month';
  if (ageDays <= 90) return 'recency-quarter';
  return 'recency-older';
}

function libraryRecencyLabel(lastReadAt) {
  const recency = libraryRecencyClass(lastReadAt);
  return ({
    'recency-today': 'Read today',
    'recency-week': 'Read this week',
    'recency-month': 'Read this month',
    'recency-quarter': 'Read in the last 3 months',
    'recency-older': 'Read more than 3 months ago',
    'recency-undated': 'No reading date'
  })[recency];
}

function currentReaderFirstName() {
  const session = window.MarkSetGoAuth?.session || {};
  const profile = session.user || session.account || window.MarkSetGoAuth?.user || window.MarkSetGoAuth?.account || {};
  const displayName =
    window.MarkSetGoAuth?.getFirstName?.() ||
    profile.firstName ||
    profile.first_name ||
    profile.givenName ||
    profile.given_name ||
    profile.displayName ||
    profile.display_name ||
    profile.fullName ||
    profile.full_name ||
    profile.name ||
    '';
  return String(displayName).trim().split(/\s+/)[0] || '';
}

function updateLibraryWelcomeName() {
  const nameNode = document.querySelector('#library-welcome-name');
  if (!nameNode) return;
  const firstName = currentReaderFirstName();
  nameNode.textContent = firstName ? `, ${firstName}` : '';
}

function scheduleLibraryPersonalization() {
  // Update immediately, then retry briefly because Clerk and the library view
  // can finish rendering in either order. The previous self-call caused a
  // stack overflow and prevented personalization from ever being applied.
  updateLibraryWelcomeName();
  [50, 250, 750, 1500].forEach((delay) => window.setTimeout(updateLibraryWelcomeName, delay));
}

document.addEventListener('marksetgo:auth-changed', scheduleLibraryPersonalization);
document.addEventListener('marksetgo:auth-ready', scheduleLibraryPersonalization);
window.addEventListener('marksetgo:auth-ready', scheduleLibraryPersonalization);


async function loadBundledModernGuideDocument(source = {}) {
  const id = String(source?.id || '').trim();
  if (!id) return null;
  const shelfItem = MODERN_GUIDE_SHELF.find((item) => item.id === id && item.active);
  if (!shelfItem) return null;

  const response = await fetch(`/texts/modern-guides/${encodeURIComponent(id)}-guide.txt`, { cache:'no-store' });
  if (!response.ok) return null;
  const text = await response.text();
  if (!text.trim()) return null;

  return {
    title: `${shelfItem.title} — Mark, Set, Go! Guide`,
    text,
    source: {
      type:'modern-guide',
      id:shelfItem.id,
      originalTitle:shelfItem.title,
      originalAuthor:shelfItem.author,
      buyUrl:shelfItem.buyUrl,
      subtitle:`An independent reading guide to ${shelfItem.title}`
    }
  };
}

function renderMyLibraryHub() {
  finalizeReadingSession();
  stopReader();

  const readingList = getReadingList();
  const progress = Object.values(readStoredObject(READING_PROGRESS_KEY))
    .sort((a, b) => new Date(b.lastReadAt || 0) - new Date(a.lastReadAt || 0));
  const activity = readStoredArray(READING_ACTIVITY_KEY);
  const comprehension = getComprehensionResults();
  const bookmarks = getBookmarks();
  const notes = getNotes();
  const definitions = getSavedDefinitions();
  const annualGoal = getAnnualReadingGoal();
  const completed = completedBooksThisYear(progress, readingList);
  const streak = readingStreak(activity);
  const totalSeconds = activity.reduce((sum, item) => sum + (Number(item.seconds) || 0), 0);
  const todayKey = dateKey(new Date());
  const todaySeconds = activity
    .filter((item) => dateKey(item.endedAt) === todayKey)
    .reduce((sum, item) => sum + (Number(item.seconds) || 0), 0);
  const averageComprehension = comprehension.length
    ? Math.round(comprehension.reduce((sum, item) => sum + (Number(item.scorePercent) || 0), 0) / comprehension.length)
    : null;
  const goalPercent = Math.min(100, Math.round((completed / Math.max(1, annualGoal)) * 100));
  const primaryBook = progress[0] || null;
  const primaryPercent = primaryBook?.totalWords
    ? Math.min(100, Math.round((Number(primaryBook.furthestWord) || 0) / primaryBook.totalWords * 100))
    : 0;
  // My Library must become interactive before any expensive reading-profile
  // analysis. Parsing several full stored books and sampling up to 110,000
  // characters from each one blocked the main thread and delayed click handlers.
  // Show an already-cached profile when available; otherwise omit the badge here.
  // A profile will still be calculated normally when the user opens its dedicated
  // Reading Profile flow, where the analysis is expected and intentional.
  const mobileSimpleLibrary = window.matchMedia?.('(max-width: 760px)')?.matches;
  // Mobile intentionally excludes reading profiles. Desktop displays only an
  // already-cached browser profile and never analyzes book text while opening
  // My Library.
  const libraryDifficultyCache = mobileSimpleLibrary ? null : difficultyCache();
  const storedDifficultyForProgress = (item) => {
    if (!item || mobileSimpleLibrary || !libraryDifficultyCache) return null;
    const key = difficultyKey({ documentId:item.documentId, title:item.title });
    return libraryDifficultyCache[key]?.profile || null;
  };
  const primaryDifficulty = storedDifficultyForProgress(primaryBook);

  const deleteStoredDocument = async (documentId, title = 'this book') => {
    if (!documentId) return;
    const confirmed = window.confirm(`Delete “${title}” from My Library? This removes its saved text, progress, bookmarks, notes, cached reading profile, and signed-in cloud copy.`);
    if (!confirmed) return;

    const progressRecords = readStoredObject(READING_PROGRESS_KEY);
    const removed = progressRecords[documentId] || { documentId, title };

    try {
      const cloudBook = window.MarkSetGoCloudLibrary?.list?.().find((book) => String(book.clientRecordId || '') === String(documentId));
      if (cloudBook?.id && window.MarkSetGoCloud?.library?.remove) {
        await window.MarkSetGoCloud.library.remove(cloudBook.id);
      }
    } catch (error) {
      const continueLocal = window.confirm(`The cloud copy could not be deleted (${error?.message || 'unknown error'}). Delete the local copy anyway?`);
      if (!continueLocal) return;
    }

    delete progressRecords[documentId];
    localStorage.setItem(READING_PROGRESS_KEY, JSON.stringify(progressRecords));
    localStorage.removeItem(`${DOCUMENT_STORAGE_PREFIX}${documentId}`);
    writeModernGuideLibrary(readModernGuideLibrary().filter((item) => String(item.documentId || '') !== String(documentId)));

    const readingList = getReadingList().filter((item) => String(item.documentId || '') !== String(documentId));
    saveReadingList(readingList);
    saveBookmarks(getBookmarks().filter((item) => String(item.documentId || '') !== String(documentId)));
    saveNotes(getNotes().filter((item) => String(item.documentId || '') !== String(documentId)));

    const profileKey = difficultyKey({ documentId, title });
    const profiles = difficultyCache();
    if (profiles[profileKey]) {
      delete profiles[profileKey];
      localStorage.setItem(BOOK_DIFFICULTY_CACHE_KEY, JSON.stringify(profiles));
    }
    localStorage.removeItem(readingProfileCacheKey({ documentId, title }));
    ['none', 'light', 'full'].forEach((mode) => localStorage.removeItem(bookGuideCacheKey({ documentId, title }, mode)));

    await clearRemovedBookReferences({ ...removed, documentId, title });
    await window.MarkSetGoCloudLibrary?.refresh?.().catch?.(() => {});
    renderMyLibraryHub();
  };

  const openStoredDocument = async (documentId, wordIndex = null) => {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(`${DOCUMENT_STORAGE_PREFIX}${documentId}`) || 'null'); } catch {}

    const record = readStoredObject(READING_PROGRESS_KEY)[documentId];

    if (!data?.text && (record?.source?.type === 'modern-guide' || record?.source?.type === 'classic-guide')) {
      // Bundled guides can always be reconstructed from their shipped source.
      // Older builds sometimes created only the progress record.
      data = record.source?.type === 'classic-guide'
        ? await loadBundledClassicGuideDocument(record.source)
        : await loadBundledModernGuideDocument(record.source);

      if (data?.text) {
        // Restore the exact document id expected by this library record after
        // renderReaderWithText builds the Reader from the reconstructed text.
        const resumeIndex = Number.isFinite(Number(wordIndex)) ? Number(wordIndex) : Number(record?.lastWord) || 0;
        renderReaderWithText(data.title, data.text, data.source);
        requestAnimationFrame(() => requestAnimationFrame(() => jumpToWordIndex(resumeIndex)));
        return;
      }

      // A user-created guide cannot be reconstructed from the public guide
      // shelf. If its active Reader snapshot still has the text, use that.
      if (
        record.source?.customGuide
        && activeReaderSnapshot?.documentId === documentId
        && activeReaderSnapshot?.currentText
      ) {
        applyReaderSessionSnapshot(activeReaderSnapshot, { resumePlayback:false });
        return;
      }
    }

    if (!data?.text) {
      window.alert(
        record?.source?.type === 'modern-guide' || record?.source?.type === 'classic-guide'
          ? 'This guide record was saved by an older build, but its text is no longer available in this browser. Reopen the guide from Browse once to restore it.'
          : 'This text is not currently stored in this browser.'
      );
      return;
    }

    // My Library's Resume Reading must behave exactly like Return to Reader
    // when the selected item is already the active reading session. Reloading
    // the stored document rebuilds the reader and can reset its viewport before
    // a saved position is reapplied. Return to Reader is reliable because it
    // restores the existing in-memory snapshot directly, so use that same path.
    const activeDocumentMatches = Boolean(
      activeReaderSnapshot?.title
      && activeReaderSnapshot?.currentText
      && (
        activeReaderSnapshot.documentId === documentId
        || (
          String(activeReaderSnapshot.title || '').trim() === String(data.title || '').trim()
          && String(activeReaderSnapshot.currentText || '') === String(data.text || '')
        )
      )
    );
    if (activeDocumentMatches) {
      renderCurrentReader();
      app.dataset.viewKey = 'reader';
      return;
    }

    let resumeIndex = Number.isFinite(Number(wordIndex)) ? Number(wordIndex) : Number(record?.lastWord) || 0;
    let matchingSnapshot = null;

    // Prefer the live checkpoint when this is the same document. This protects
    // Resume Reading even if the library progress write has not completed yet.
    if (activeReaderSnapshot?.documentId === documentId) {
      matchingSnapshot = activeReaderSnapshot;
    } else {
      try {
        const saved = await readReaderSession();
        if (saved?.documentId === documentId) matchingSnapshot = saved;
      } catch {}
    }

    if (matchingSnapshot) {
      resumeIndex = Math.max(0, Number(matchingSnapshot.index) || resumeIndex);
      if (applyReaderSessionSnapshot(matchingSnapshot, { resumePlayback: false })) return;
    }

    renderReaderWithText(data.title, data.text, data.source || { type:'saved' });
    requestAnimationFrame(() => requestAnimationFrame(() => jumpToWordIndex(resumeIndex)));
  };

  const continueCards = progress.slice(0, 6).map((item, index) => {
    const difficulty = storedDifficultyForProgress(item);
    const percent = item.totalWords
      ? Math.min(100, Math.round((Number(item.furthestWord) || 0) / item.totalWords * 100))
      : 0;
    const lastRead = item.lastReadAt
      ? new Date(item.lastReadAt).toLocaleDateString(undefined, { month:'short', day:'numeric' })
      : 'Recently';
    return `<article class="library-continue-card ${index === 0 ? 'featured' : ''}">
      <button type="button" class="continue-cover ${libraryRecencyClass(item.lastReadAt)}" data-library-document="${escapeHtml(item.documentId)}" aria-label="Resume ${escapeHtml(item.title || 'book')} · ${escapeHtml(libraryRecencyLabel(item.lastReadAt))}">
        <span class="${libraryRecencyClass(item.lastReadAt)}" title="${escapeHtml(libraryRecencyLabel(item.lastReadAt))}">${escapeHtml((item.title || 'B').slice(0, 1).toUpperCase())}</span>
      </button>
      <div class="continue-card-copy">
        <span class="source-category">${item.source?.type === 'classic-guide' ? 'Classic Guide' : item.source?.type === 'modern-guide' ? (item.source?.customGuide ? 'My Guide' : 'Modern Guide') : (index === 0 ? 'Continue reading' : 'Recent')}</span>
        <h3>${escapeHtml(item.title || 'Untitled')}</h3>
        <p>${percent}% complete · Last read ${escapeHtml(lastRead)}</p>
        ${difficulty ? difficultyBadge(difficulty, {title:item.title}) : ''}
        <div class="library-progress-track"><span style="width:${percent}%"></span></div>
        <div class="library-book-actions">
          <button class="${index === 0 ? 'primary' : 'secondary'}" type="button" data-library-document="${escapeHtml(item.documentId)}">Resume reading</button>
          <button class="secondary library-delete-book" type="button" data-library-delete="${escapeHtml(item.documentId)}" data-library-title="${escapeHtml(item.title || 'Untitled')}" aria-label="Delete ${escapeHtml(item.title || 'book')}">Delete</button>
        </div>
      </div>
    </article>`;
  }).join('');

  app.innerHTML = `
    <section class="platform-page my-library-hub library-refresh">
      <header class="library-welcome">
        <div>
          <span class="source-category">My Library</span>
          <h1>Welcome back<span id="library-welcome-name"></span>.</h1>
          <p>Continue your reading journey and manage your personal collection.</p>
        </div>

        <div class="library-header-actions">
          <button class="secondary" type="button" data-action="my-reading">My Reading</button>
          <button class="secondary" type="button" data-action="browse">Browse books</button>
          <button class="primary" type="button" data-action="reader">Open Reader</button>
        </div>
      </header>


      <section class="library-focus-grid">
        <article class="library-primary-focus">
          ${primaryBook ? `
            <div class="focus-book-cover ${libraryRecencyClass(primaryBook.lastReadAt)}" aria-label="${escapeHtml(libraryRecencyLabel(primaryBook.lastReadAt))}" title="${escapeHtml(libraryRecencyLabel(primaryBook.lastReadAt))}">${escapeHtml((primaryBook.title || 'B').slice(0,1).toUpperCase())}</div>
            <div class="focus-book-copy">
              <span class="source-category">${primaryBook.source?.type === 'classic-guide' ? 'Classic Guide · Your next step' : primaryBook.source?.type === 'modern-guide' ? `${primaryBook.source?.customGuide ? 'My Guide' : 'Modern Guide'} · Your next step` : 'Your next step'}</span>
              <h2>${escapeHtml(primaryBook.title || 'Continue reading')}</h2>
              <p>${primaryPercent}% complete. Pick up at the exact place you left off.</p>
              ${primaryDifficulty ? difficultyBadge(primaryDifficulty, {title:primaryBook.title}) : ''}
              <div class="library-progress-track large"><span style="width:${primaryPercent}%"></span></div>
              <div class="focus-actions">
                <button class="primary" type="button" data-library-document="${escapeHtml(primaryBook.documentId)}">Resume reading</button>
                <button class="secondary" type="button" data-action="reader">Open Reader</button>
                <button class="secondary library-delete-book" type="button" data-library-delete="${escapeHtml(primaryBook.documentId)}" data-library-title="${escapeHtml(primaryBook.title || 'Untitled')}">Delete</button>
              </div>
            </div>
          ` : `
            <div class="focus-book-cover empty" aria-hidden="true">＋</div>
            <div class="focus-book-copy">
              <span class="source-category">Start a reading journey</span>
              <h2>Your library is ready.</h2>
              <p>Browse public libraries, import a book, or open a supported URL.</p>
              <div class="focus-actions">
                <button class="primary" type="button" data-action="browse">Browse books</button>
                <button class="secondary" type="button" data-read="upload">Import a book</button>
              </div>
            </div>
          `}
        </article>

        <article class="library-year-card">
          <div class="year-card-heading">
            <div><span class="source-category">This year</span><h2>${completed} of ${annualGoal} books</h2></div>
            <strong>${goalPercent}%</strong>
          </div>
          <div class="annual-goal-meter"><span style="width:${goalPercent}%"></span></div>
          <div class="year-stat-row">
            <div><strong>${streak}</strong><span>day streak</span></div>
            <div><strong>${formatDuration(todaySeconds)}</strong><span>today</span></div>
            <div><strong>${averageComprehension === null ? '—' : `${averageComprehension}%`}</strong><span>comprehension</span></div>
          </div>
          <button class="subtle-link library-insights-link" type="button" data-action="progress-awards">View progress and awards →</button>
        </article>
      </section>

      <details class="library-section library-continue-section" open>
        <summary>
          <span><strong>Continue reading</strong><small>Recently active books and documents</small></span>
          <span class="library-section-count">${progress.length}</span>
        </summary>
        <div class="library-section-body">
          <div class="library-continue-grid">
            ${continueCards || '<div class="library-empty-state"><span>📚</span><h3>No recent reading yet</h3><p>Books you open will appear here automatically.</p><button class="primary" type="button" data-action="browse">Find a book</button></div>'}
          </div>
        </div>
      </details>

    </section>`;

  updateLibraryWelcomeName();

  app.querySelectorAll('[data-library-document]').forEach((button) => {
    button.addEventListener('click', () => openStoredDocument(button.dataset.libraryDocument));
  });
  app.querySelectorAll('[data-library-delete]').forEach((button) => {
    button.addEventListener('click', () => deleteStoredDocument(button.dataset.libraryDelete, button.dataset.libraryTitle || 'this book'));
  });
  document.dispatchEvent(new CustomEvent('marksetgo:library-rendered'));
}
function renderLibraryRecords(kind) {
  stopReader();
  const isNotes = kind === 'notes';
  const items = isNotes ? getNotes() : getBookmarks();
  const title = isNotes ? 'Notes' : 'Bookmarks';
  const description = isNotes
    ? 'Personal observations collected across your reading.'
    : 'Saved positions collected across your books and documents.';

  app.innerHTML = `<section class="platform-page library-records">
    <header class="platform-hero"><div><span class="source-category">My Library</span><h1>${title}</h1><p>${description}</p></div><button class="secondary" type="button" data-action="my-library">Back to My Library</button></header>
    <div class="record-toolbar">${listPresentationControls(`library-${kind}`, {collapsible:false, defaultView:'list'})}</div>
    <div id="library-record-list" class="record-list presentation-list">
      ${items.length ? items.map((item) => `<article class="record-card">
        <div><h2>${escapeHtml(item.title || 'Untitled')}</h2><p>${isNotes ? escapeHtml(item.note || item.text || '') : `Saved at word ${Number(item.wordIndex || 0).toLocaleString()}`}</p><small>${new Date(item.createdAt || Date.now()).toLocaleString()}</small></div>
        <button class="secondary" type="button" data-record-document="${escapeHtml(item.documentId || '')}" data-record-index="${Number(item.wordIndex || 0)}">Open source</button>
      </article>`).join('') : `<p class="navigation-empty">No ${title.toLowerCase()} have been saved yet.</p>`}
    </div>
  </section>`;

  bindListPresentationControls({key:`library-${kind}`, root:'#library-record-list', itemSelector:'.record-card', defaultView:'list'});
  app.querySelectorAll('[data-record-document]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.recordDocument;
    let data = null;
    try { data = JSON.parse(localStorage.getItem(`${DOCUMENT_STORAGE_PREFIX}${id}`) || 'null'); } catch {}
    if (!data?.text) return window.alert('The source text is not stored in this browser.');
    renderReaderWithText(data.title, data.text, data.source || {type:'saved'});
    requestAnimationFrame(() => jumpToWordIndex(Number(button.dataset.recordIndex)||0));
  }));
}


function renderGlobalNotebookEntries(){
  const panel=app.querySelector('#global-notebook-entries');
  if(!panel)return;
  const query=(app.querySelector('#global-notebook-search')?.value||'').trim().toLowerCase();
  const records=getMarkRecords(MARK_INSIGHTS_KEY).filter(item=>!query||[
    item.title,item.chapter,item.selection,item.note,item.question,item.result?.heading,item.result?.response
  ].filter(Boolean).join(' ').toLowerCase().includes(query));
  renderNotebookCollection(panel,records,{title:'All Notebook Entries'});
}

function renderGlobalNotebook(){
  stopReader();
  app.dataset.viewKey='mark-notebook';
  app.innerHTML=`<section class="platform-page global-notebook-page">
    <header class="platform-hero">
      <div><span class="source-category">Ask Mark</span><h1>Notebook</h1><p>Keep passages, Mark’s full responses, and your own thoughts together across every book and page in the app.</p></div>
      <div class="global-notebook-actions"><button class="primary" type="button" id="add-global-notebook-note">＋ New note</button><button class="secondary" type="button" data-action="reader">Return to Reader</button></div>
    </header>
    <div class="global-notebook-toolbar">
      <label>Search notebook<input id="global-notebook-search" type="search" placeholder="Book, passage, thought, theme…"></label>
      <p>Notebook entries are stored locally in this browser. Export important work as text for backup or use elsewhere.</p>
    </div>
    <div id="global-notebook-entries"></div>
  </section>`;

  app.querySelector('#global-notebook-search')?.addEventListener('input',renderGlobalNotebookEntries);
  app.querySelector('#add-global-notebook-note')?.addEventListener('click',()=>{
    const title=window.prompt('Note title or subject:',app.querySelector('h1')?.textContent||'Personal Note');
    if(title===null)return;
    const note=window.prompt('Write your note:','');
    if(!note?.trim())return;
    saveMarkInsight({recordType:'personal-note',title:title.trim()||'Personal Note',note:note.trim(),selection:'',documentId:'',pageContext:'Mark Notebook'});
    renderGlobalNotebookEntries();
  });
  renderGlobalNotebookEntries();
}

function renderAiCenter() {
  stopReader();
  const hasBook = Boolean(state.title && state.currentText && state.words?.length);
  const notes = getNotes().length;
  const definitions = getSavedDefinitions().length;
  const comprehension = getComprehensionResults().length;

  app.innerHTML = `<section class="platform-page ai-center">
    <header class="platform-hero">
      <div><span class="source-category">Ask Mark</span><h1>Your reading companion</h1><p>Use focused learning tools for the active text, then connect ideas across your wider library.</p></div>
      <button class="secondary" type="button" data-action="reader">Return to Reader</button>
    </header>

    <section class="ai-active-context ${hasBook ? '' : 'empty'}">
      <div><span class="source-category">Active context</span><h2>${hasBook ? escapeHtml(state.title) : 'No active text'}</h2><p>${hasBook ? `${state.words.length.toLocaleString()} words available for study tools.` : 'Open a book in the Reader before using passage-specific AI tools.'}</p></div>
      ${hasBook ? '<button class="primary" type="button" data-action="reader">Open active text</button>' : '<button class="primary" type="button" data-action="browse">Browse books</button>'}
    </section>

    <div class="ai-tool-grid">
      <button type="button" class="ai-tool-card" data-ai-tool="comprehension" ${hasBook?'':'disabled'}><span>?</span><h2>Quiz Me</h2><p>Generate recall, main-idea, inference, and deeper-understanding questions.</p></button>
      <button type="button" class="ai-tool-card" data-ai-tool="summary" ${hasBook?'':'disabled'}><span>≡</span><h2>Summarize</h2><p>Create a concise explanation of the current reading context.</p></button>
      <button type="button" class="ai-tool-card" data-ai-tool="explain" ${hasBook?'':'disabled'}><span>💡</span><h2>Explain a Passage</h2><p>Return to the Reader and select difficult words or passages for explanation.</p></button>
      <button type="button" class="ai-tool-card" data-ai-tool="flashcards"><span>▣</span><h2>Flashcards</h2><p>Build review material from ${definitions} saved definitions and notes.</p></button>
      <button type="button" class="ai-tool-card" data-action="knowledge-graph"><span>◎</span><h2>Knowledge Graph</h2><p>Connect books, authors, notes, vocabulary, and Great Ideas.</p></button>
      <button type="button" class="ai-tool-card" data-read="syntopicon"><span>⚖</span><h2>Compare Great Ideas</h2><p>Study recurring ideas across authors, traditions, and texts.</p></button>
      <button type="button" class="ai-tool-card" data-action="progress-awards"><span>↗</span><h2>Ask Mark’s Reading Coach</h2><p>Analyze ${comprehension} comprehension checks and recorded progress.</p></button>
      <button type="button" class="ai-tool-card" data-read="bible"><span>✦</span><h2>Bible Study with Ask Mark</h2><p>Translations, commentary, cross references, and structured study.</p></button>
    </div>

    <section id="ai-center-output" class="ai-center-output" hidden></section>
  </section>`;

  app.querySelector('[data-ai-tool="comprehension"]')?.addEventListener('click', () => {
    renderCurrentReader();
    requestAnimationFrame(() => app.querySelector('#check-comprehension')?.click());
  });
  app.querySelector('[data-ai-tool="explain"]')?.addEventListener('click', renderCurrentReader);
  app.querySelector('[data-ai-tool="flashcards"]')?.addEventListener('click', renderVocabularyBuilder);
  app.querySelector('[data-ai-tool="summary"]')?.addEventListener('click', () => {
    const output = app.querySelector('#ai-center-output');
    const sample = state.words.slice(Math.max(0,(state.index||0)-400), Math.min(state.words.length,(state.index||0)+200)).join(' ');
    output.hidden = false;
    output.innerHTML = `<h2>Current-context summary workspace</h2><p>The AI summary action will use a bounded section around the current reading position rather than sending the entire book. Return to the Reader, position the text, and use the Learn controls for passage-based analysis.</p><blockquote>${escapeHtml(sample.slice(0,700))}${sample.length>700?'…':''}</blockquote><button class="primary" type="button" data-action="reader">Return to Reader</button>`;
  });
}

function renderKnowledgeGraph() {
  stopReader();

  const progress = Object.values(readStoredObject(READING_PROGRESS_KEY)).slice(0, 12);
  const notes = getNotes().slice(0, 14);
  const definitions = getSavedDefinitions().slice(0, 14);
  const ideas = ['Justice','Truth','Courage','Freedom','Love','Faith','Knowledge','Beauty'];

  app.innerHTML = `<section class="platform-page knowledge-graph-page">
    <header class="platform-hero">
      <div><span class="source-category">Knowledge Graph</span><h1>Your connected reading life</h1><p>An initial map connecting books, notes, vocabulary, and Great Ideas. As the library grows, these relationships can become increasingly personalized.</p></div>
      <button class="secondary" type="button" data-action="ai-center">Back to Ask Mark</button>
    </header>

    <div class="knowledge-layout">
      <aside class="knowledge-filters">
        <h2>Show connections</h2>
        <label><input type="checkbox" checked data-graph-filter="book"> Books</label>
        <label><input type="checkbox" checked data-graph-filter="idea"> Great Ideas</label>
        <label><input type="checkbox" checked data-graph-filter="note"> Notes</label>
        <label><input type="checkbox" checked data-graph-filter="word"> Vocabulary</label>
        <p>Select a node to see what is connected to it.</p>
      </aside>
      <div class="knowledge-canvas" id="knowledge-canvas" role="img" aria-label="Knowledge graph of books, ideas, notes, and vocabulary">
        <div class="knowledge-center graph-node idea" data-node="center"><strong>My Learning</strong></div>
        ${ideas.map((idea,index)=>`<button type="button" class="graph-node idea orbit-${index%8}" data-node="${escapeHtml(idea)}" data-kind="idea">${escapeHtml(idea)}</button>`).join('')}
        ${progress.slice(0,8).map((item,index)=>`<button type="button" class="graph-node book book-${index}" data-node="${escapeHtml(item.title||'Book')}" data-kind="book">${escapeHtml((item.title||'Book').slice(0,28))}</button>`).join('')}
        ${notes.slice(0,6).map((item,index)=>`<button type="button" class="graph-node note note-${index}" data-node="${escapeHtml(item.note||item.text||'Note')}" data-kind="note">Note ${index+1}</button>`).join('')}
        ${definitions.slice(0,6).map((item,index)=>`<button type="button" class="graph-node word word-${index}" data-node="${escapeHtml(item.word||'Word')}" data-kind="word">${escapeHtml(item.word||'Word')}</button>`).join('')}
      </div>
      <aside class="knowledge-detail" id="knowledge-detail">
        <span class="source-category">Selected node</span>
        <h2>My Learning</h2>
        <p>This central node represents the growing body of knowledge built from your reading.</p>
      </aside>
    </div>
  </section>`;

  app.querySelectorAll('.graph-node[data-kind]').forEach((node) => node.addEventListener('click', () => {
    const detail = app.querySelector('#knowledge-detail');
    detail.innerHTML = `<span class="source-category">${escapeHtml(node.dataset.kind)}</span><h2>${escapeHtml(node.dataset.node)}</h2><p>This node is part of your developing knowledge graph. Future versions can connect it to exact passages, related notes, authors, Bible references, and Great Ideas.</p>`;
  }));
  app.querySelectorAll('[data-graph-filter]').forEach((input) => input.addEventListener('change', () => {
    app.querySelectorAll(`.graph-node.${input.dataset.graphFilter}`).forEach((node) => node.hidden = !input.checked);
  }));
}

/* Feature block moved to /modules/pages/help-page.js */


/* Feature block moved to /modules/pages/business-pages.js */

function renderError(title, message) {
  stopReader();
  app.innerHTML = `<section class="panel"><h1>${escapeHtml(title)}</h1><p class="status error">${escapeHtml(message)}</p><button class="secondary" data-action="home">Return home</button></section>`;
  app.querySelector('[data-action="home"]')?.addEventListener('click', renderHome);
}



/* Action Center v7.4.0 -----------------------------------------------------
   Local-first application layer. Actions remain tied to reading context and
   can later sync to the server without changing the UI data contract.
*/
const ACTION_CENTER_KEY = 'markSetGoActionsV1';
const ACTION_NOTIFICATION_SETTINGS_KEY = 'markSetGoActionNotificationSettingsV1';
const ACTION_NOTIFICATION_LOG_KEY = 'markSetGoActionNotificationLogV1';

function readActionNotificationSettings() {
  const defaults = { inApp: true, browser: false, quietStart: '22:00', quietEnd: '07:00' };
  try { return { ...defaults, ...(JSON.parse(localStorage.getItem(ACTION_NOTIFICATION_SETTINGS_KEY) || '{}')) }; }
  catch { return defaults; }
}

function writeActionNotificationSettings(settings) {
  localStorage.setItem(ACTION_NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
}

function readActionNotificationLog() {
  try { return JSON.parse(localStorage.getItem(ACTION_NOTIFICATION_LOG_KEY) || '{}') || {}; }
  catch { return {}; }
}

function writeActionNotificationLog(log) {
  localStorage.setItem(ACTION_NOTIFICATION_LOG_KEY, JSON.stringify(log));
}

function reminderTimeForAction(action) {
  if (!action?.dueAt || action.reminder === 'none') return null;
  const due = new Date(action.dueAt);
  if (Number.isNaN(due.getTime())) return null;
  const offsets = { at_time: 0, min10: 10, min30: 30, hour1: 60, day1: 1440 };
  return new Date(due.getTime() - ((offsets[action.reminder] ?? 0) * 60000));
}

function isActionQuietTime(date = new Date()) {
  const { quietStart, quietEnd } = readActionNotificationSettings();
  if (!quietStart || !quietEnd || quietStart === quietEnd) return false;
  const minutes = date.getHours() * 60 + date.getMinutes();
  const parse = (value) => { const [h,m] = value.split(':').map(Number); return h * 60 + m; };
  const start = parse(quietStart), end = parse(quietEnd);
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

function actionNotificationMessage(action) {
  const due = actionLocalDate(action.dueAt);
  return `${action.title}${due ? ` · Due ${due}` : ''}`;
}

function showActionToast(action) {
  document.querySelector('.action-notification-toast')?.remove();
  const toast = document.createElement('aside');
  toast.className = 'action-notification-toast';
  toast.innerHTML = `<div><strong>Action reminder</strong><p>${escapeHtml(actionNotificationMessage(action))}</p></div><div class="action-toast-buttons"><button type="button" class="secondary" data-toast-snooze>Snooze 15m</button><button type="button" class="primary" data-toast-open>Open</button><button type="button" class="icon-button" data-toast-close aria-label="Dismiss">×</button></div>`;
  const toastHost = document.fullscreenElement || document.body;
  toastHost.appendChild(toast);
  toast.querySelector('[data-toast-open]')?.addEventListener('click', () => { toast.remove(); renderActionCenter(); });
  toast.querySelector('[data-toast-close]')?.addEventListener('click', () => toast.remove());
  toast.querySelector('[data-toast-snooze]')?.addEventListener('click', () => {
    const actions = readActions(); const item = actions.find((entry) => entry.id === action.id);
    if (item) { item.snoozedUntil = new Date(Date.now() + 15 * 60000).toISOString(); writeActions(actions); }
    toast.remove();
  });
}

async function requestActionBrowserNotifications() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

function checkActionNotifications() {
  const settings = readActionNotificationSettings();
  const now = new Date();
  const quiet = isActionQuietTime(now);
  const log = readActionNotificationLog();
  let changed = false;

  readActions().filter((action) => action.status !== 'completed').forEach((action) => {
    const notifyAt = reminderTimeForAction(action);
    if (!notifyAt || notifyAt > now) return;
    if (action.snoozedUntil && new Date(action.snoozedUntil) > now) return;

    const signature = `${action.updatedAt || action.createdAt || ''}|${action.dueAt}|${action.reminder}`;
    if (log[action.id] === signature) return;

    let delivered = false;

    // In-app reminders are part of the app workflow and should appear whenever
    // the app is open, including during configured browser-notification quiet hours.
    if (settings.inApp) {
      showActionToast(action);
      delivered = true;
    }

    // Quiet hours apply only to intrusive browser/system notifications.
    if (!quiet && settings.browser && 'Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification('Mark, Set, Go! action reminder', {
        body: actionNotificationMessage(action),
        tag: `msg-action-${action.id}`
      });
      notification.onclick = () => { window.focus(); renderActionCenter(); notification.close(); };
      delivered = true;
    }

    // Do not mark a reminder delivered if every enabled channel was suppressed.
    if (delivered) {
      log[action.id] = signature;
      changed = true;
    }
  });

  if (changed) writeActionNotificationLog(log);
}




/* Email preferences v7.5.1 ------------------------------------------------ */
const EMAIL_PREFS_KEY='markSetGoEmailPreferencesV1';
const EMAIL_CLIENT_KEY='markSetGoEmailClientIdV1';
function emailClientId(){let id=localStorage.getItem(EMAIL_CLIENT_KEY);if(!id){id=`msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;localStorage.setItem(EMAIL_CLIENT_KEY,id);}return id;}
function readEmailPreferences(){try{return {email:'',newsletter:false,reminders:false,notes:false,notesFrequency:'weekly',...(JSON.parse(localStorage.getItem(EMAIL_PREFS_KEY)||'{}'))};}catch{return {email:'',newsletter:false,reminders:false,notes:false,notesFrequency:'weekly'};}}
function writeEmailPreferences(value){localStorage.setItem(EMAIL_PREFS_KEY,JSON.stringify(value));}
async function emailApi(path,body){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||`Request failed (${response.status}).`);return payload;}
async function syncEmailActions(){const prefs=readEmailPreferences();if(!prefs.email||!prefs.reminders)return;try{await emailApi('/api/email/sync-actions',{clientId:emailClientId(),actions:readActions()});}catch(error){console.warn('Could not sync email actions:',error.message);}}
async function syncEmailNotes(){const prefs=readEmailPreferences();if(!prefs.email||!prefs.notes)return 0;const notes=collectEmailNotes();try{const result=await emailApi('/api/email/sync-notes',{clientId:emailClientId(),notes});return result.count||0;}catch(error){console.warn('Could not sync email notes:',error.message);return 0;}}
function readActions() {
  let primary = [];
  try {
    const value = JSON.parse(localStorage.getItem(ACTION_CENTER_KEY) || '[]');
    primary = Array.isArray(value) ? value : [];
  } catch (error) {
    console.warn('Could not read saved actions:', error);
  }

  const guideActions = readModernGuideActions();
  const merged = [...primary];
  guideActions.forEach((guideAction) => {
    const index = merged.findIndex((item) => String(item.id || '') === String(guideAction.id || ''));
    if (index >= 0) merged[index] = { ...guideAction, ...merged[index] };
    else merged.push({ ...guideAction });
  });
  return merged;
}

function writeActionsBase(actions) {
  const normalized = Array.isArray(actions) ? actions : [];
  localStorage.setItem(ACTION_CENTER_KEY, JSON.stringify(normalized));
  writeModernGuideActions(normalized.filter((item) => item?.origin === 'modern-guide'));
  return normalized;
}

function writeActions(actions) {
  const saved = writeActionsBase(actions);
  window.clearTimeout(window.__msgEmailSyncTimer);
  window.__msgEmailSyncTimer = window.setTimeout(syncEmailActions, 500);
  return saved;
}

function saveActionRecord(record) {
  if (!record?.id || !record?.title) return null;

  const actions = readActions();
  const existingIndex = actions.findIndex((item) => String(item.id || '') === String(record.id));
  const normalized = {
    ...record,
    status: record.status || 'active',
    updatedAt: record.updatedAt || new Date().toISOString(),
    createdAt: record.createdAt || new Date().toISOString()
  };

  if (existingIndex >= 0) actions[existingIndex] = normalized;
  else actions.push(normalized);

  writeActions(actions);

  // Verify persistence immediately. This keeps programmatic guide actions on
  // exactly the same storage contract as actions created in Action Center.
  const verified = readActions().find((item) => String(item.id || '') === String(normalized.id));
  if (!verified) {
    console.error('Action Center persistence verification failed for', normalized.id);
    return null;
  }

  if (verified.origin === 'modern-guide') rememberModernGuideAction(verified);

  document.dispatchEvent(new CustomEvent('marksetgo:action-saved', {
    detail: { action: verified }
  }));
  return verified;
}

function actionLocalDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function currentActionSource() {
  return state?.title || state?.bookTitle || state?.documentTitle || 'Current reading';
}

function renderActionCenter() {
  stopReader();
  const actions = readActions();
  const active = actions.filter((item) => item.status !== 'completed');
  const completed = actions.filter((item) => item.status === 'completed');
  const due = active.filter((item) => item.dueAt && new Date(item.dueAt) <= new Date());
  const rate = actions.length ? Math.round((completed.length / actions.length) * 100) : 0;
  const sourceCount = new Set(actions.map((item) => item.sourceTitle).filter(Boolean)).size;

  app.innerHTML = `<section class="panel action-center-page">
    <header class="action-center-hero">
      <div><span class="source-category">Understanding into action</span><h1>Action Center</h1><p>Turn ideas from your reading into specific commitments, reviews, habits, and reflections.</p>${actions.some((item) => item.origin === 'modern-guide') ? `<small class="action-center-guide-note">${actions.filter((item) => item.origin === 'modern-guide' && item.status !== 'completed').length} active action${actions.filter((item) => item.origin === 'modern-guide' && item.status !== 'completed').length === 1 ? '' : 's'} added from Modern Guides.</small>` : ''}</div>
      <button class="secondary" type="button" data-action="reader">Return to Reader</button>
    </header>

    <div class="action-kpi-grid">
      <article><span>Active</span><strong>${active.length}</strong><small>open commitments</small></article>
      <article><span>Due now</span><strong>${due.length}</strong><small>need attention</small></article>
      <article><span>Completed</span><strong>${completed.length}</strong><small>ideas applied</small></article>
      <article><span>Application rate</span><strong>${rate}%</strong><small>completed / created</small></article>
      <article><span>Books applied</span><strong>${sourceCount}</strong><small>sources with actions</small></article>
    </div>

    <section class="action-notification-settings app-section-card app-section-notifications">
      <div class="section-heading"><div><h2>Notifications</h2><p>In-app reminders work while Mark, Set, Go! is open. Browser alerts also require permission.</p></div><button class="secondary" type="button" id="test-action-notification">Test reminder</button></div>
      <div class="action-notification-grid">
        <label class="toggle-setting"><input id="action-inapp-notifications" type="checkbox"> <span>In-app reminders</span></label>
        <label class="toggle-setting"><input id="action-browser-notifications" type="checkbox"> <span>Browser notifications</span></label>
        <label>Quiet hours start<input id="action-quiet-start" type="time"></label>
        <label>Quiet hours end<input id="action-quiet-end" type="time"></label>
      </div>
      <p class="status" id="action-notification-status"></p>
    </section>

    <section class="action-email-settings app-section-card app-section-email">
      <div class="section-heading"><div><h2>Email & subscriptions</h2><p>Choose exactly what Mark, Set, Go! may send. Email reminders can arrive while the app is closed when the server email provider is configured.</p></div><button class="secondary" type="button" id="test-action-email">Send test email</button></div>
      <div class="action-email-grid">
        <label>Email address<input id="action-email-address" type="email" autocomplete="email" placeholder="you@example.com"></label>
        <label class="toggle-setting"><input id="action-email-reminders" type="checkbox"> <span>Email my action reminders</span></label>
        <label class="toggle-setting"><input id="action-email-newsletter" type="checkbox"> <span>Receive the Mark, Set, Go! newsletter</span></label>
        <label class="toggle-setting"><input id="action-email-notes" type="checkbox"> <span>Email my saved notes and reading digest</span></label>
        <label>Notes frequency<select id="action-email-notes-frequency"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
      </div>
      <div class="action-email-buttons"><button class="primary" type="button" id="save-action-email">Save email preferences</button><button class="secondary" type="button" id="send-action-notes">Email all notes</button><button class="secondary" type="button" id="send-action-notebook">Email Mark’s Notebook</button><button class="secondary" type="button" id="send-newsletter-preview">Send newsletter preview</button></div>
      <p class="status" id="action-email-status"></p>
      <p class="fine-print">Newsletter, reminders, and notes are separate subscriptions. “Email all notes” includes reader notes and Mark’s Notebook. “Email Mark’s Notebook” sends notebook entries only. The newsletter preview verifies delivery; recurring newsletter editions still require published content.</p>
    </section>

    <div class="action-center-layout">
      <form id="action-form" class="action-composer app-section-card app-section-create">
        <div class="section-heading"><div><h2>Create an action</h2><p>Make the next step concrete and small enough to complete.</p></div></div>
        <input id="action-edit-id" type="hidden">
        <label>What will you do?<input id="action-title" required maxlength="160" placeholder="Example: Walk for 20 minutes after lunch"></label>
        <div class="action-form-grid">
          <label>Type<select id="action-type"><option value="task">Task</option><option value="habit">Habit</option><option value="review">Review</option><option value="reflection">Reflection</option><option value="experiment">Experiment</option><option value="discussion">Discussion</option></select></label>
          <label>Due date and time<input id="action-due" type="datetime-local"></label>
          <label>Priority<select id="action-priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label>
          <label>Repeat<select id="action-repeat"><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
          <label>Reminder<select id="action-reminder"><option value="none">No reminder</option><option value="at_time">At due time</option><option value="min10">10 minutes before</option><option value="min30">30 minutes before</option><option value="hour1">1 hour before</option><option value="day1">1 day before</option></select></label>
        </div>
        <label>Book or source<input id="action-source" maxlength="180" value="${escapeHtml(currentActionSource())}"></label>
        <label>Supporting passage or note<textarea id="action-note" rows="4" maxlength="1200" placeholder="Paste the idea, quotation, or reason for this action"></textarea></label>
        <div class="action-form-actions"><button class="primary" type="submit" id="save-action">Save action</button><button class="secondary" type="button" id="cancel-action-edit" hidden>Cancel edit</button></div>
        <p class="status" id="action-status"></p>
      </form>

      <section class="action-list-panel app-section-card app-section-actions">
        <div class="section-heading"><div><h2>My actions</h2><p>Complete, reschedule, edit, or remove commitments.</p></div>
          <label class="compact-label">Show<select id="action-filter"><option value="active">Active</option><option value="all">All</option><option value="completed">Completed</option></select></label>
        </div>
        <div id="action-list"></div>
      </section>
    </div>
  </section>`;

  const renderList = () => {
    const filter = app.querySelector('#action-filter')?.value || 'active';
    const all = readActions().sort((a,b) => {
      if (a.status !== b.status) return a.status === 'completed' ? 1 : -1;
      return new Date(a.dueAt || '2999-12-31') - new Date(b.dueAt || '2999-12-31');
    });
    const visible = all.filter((item) => filter === 'all' || (filter === 'completed' ? item.status === 'completed' : item.status !== 'completed'));
    const container = app.querySelector('#action-list');
    container.innerHTML = visible.length ? visible.map((item) => {
      const overdue = item.status !== 'completed' && item.dueAt && new Date(item.dueAt) <= new Date();
      return `<article class="action-card ${item.status === 'completed' ? 'completed' : ''} ${overdue ? 'overdue' : ''}">
        <button class="action-check" type="button" data-action-toggle="${escapeHtml(item.id)}" aria-label="${item.status === 'completed' ? 'Reopen' : 'Complete'} action">${item.status === 'completed' ? '✓' : ''}</button>
        <div class="action-card-copy"><div class="action-card-meta"><span>${escapeHtml(item.type || 'task')}</span><span>${escapeHtml(item.priority || 'normal')}</span>${item.repeat && item.repeat !== 'none' ? `<span>${escapeHtml(item.repeat)}</span>` : ''}${item.reminder && item.reminder !== 'none' ? `<span>🔔 ${escapeHtml(item.reminder.replace('_',' '))}</span>` : ''}</div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.note || 'No supporting note')}</p>
          <small>${item.sourceTitle ? `From ${escapeHtml(item.sourceTitle)}` : 'No source'}${item.dueAt ? ` · ${overdue ? 'Due ' : ''}${escapeHtml(actionLocalDate(item.dueAt))}` : ''}</small>
        </div>
        <div class="action-card-buttons"><button class="secondary" type="button" data-action-edit="${escapeHtml(item.id)}">Edit</button><button class="secondary danger-text" type="button" data-action-delete="${escapeHtml(item.id)}">Delete</button></div>
      </article>`;
    }).join('') : '<div class="empty-library"><h3>No actions here yet</h3><p>Create one small action from something you are reading.</p></div>';
  };

  const resetForm = () => {
    app.querySelector('#action-form').reset();
    app.querySelector('#action-edit-id').value = '';
    app.querySelector('#action-source').value = currentActionSource();
    app.querySelector('#save-action').textContent = 'Save action';
    app.querySelector('#cancel-action-edit').hidden = true;
  };

  app.querySelector('#action-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const title = app.querySelector('#action-title').value.trim();
    if (!title) return;
    const actions = readActions();
    const editId = app.querySelector('#action-edit-id').value;
    const existing = actions.find((item) => item.id === editId);
    const record = {
      id: existing?.id || `action_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      title,
      type: app.querySelector('#action-type').value,
      dueAt: app.querySelector('#action-due').value || '',
      priority: app.querySelector('#action-priority').value,
      repeat: app.querySelector('#action-repeat').value,
      reminder: app.querySelector('#action-reminder').value,
      sourceTitle: app.querySelector('#action-source').value.trim(),
      note: app.querySelector('#action-note').value.trim(),
      status: existing?.status || 'active',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: existing?.completedAt || null
    };
    const saved = saveActionRecord(record);
    if (!saved) {
      const status = app.querySelector('#action-status');
      if (status) {
        status.textContent = 'This action could not be saved. Please try again.';
        status.classList.add('error');
      }
      return;
    }
    resetForm();
    renderActionCenter();
  });

  const notificationSettings = readActionNotificationSettings();
  app.querySelector('#action-inapp-notifications').checked = notificationSettings.inApp;
  app.querySelector('#action-browser-notifications').checked = notificationSettings.browser && 'Notification' in window && Notification.permission === 'granted';
  app.querySelector('#action-quiet-start').value = notificationSettings.quietStart || '22:00';
  app.querySelector('#action-quiet-end').value = notificationSettings.quietEnd || '07:00';
  const saveNotificationSettings = async (event) => {
    const status = app.querySelector('#action-notification-status');
    let browser = app.querySelector('#action-browser-notifications').checked;
    if (event?.target?.id === 'action-browser-notifications' && browser) {
      const permission = await requestActionBrowserNotifications();
      browser = permission === 'granted';
      app.querySelector('#action-browser-notifications').checked = browser;
      status.textContent = browser ? 'Browser notifications enabled.' : permission === 'unsupported' ? 'This browser does not support notifications.' : 'Browser notification permission was not granted.';
    }
    writeActionNotificationSettings({
      inApp: app.querySelector('#action-inapp-notifications').checked,
      browser,
      quietStart: app.querySelector('#action-quiet-start').value,
      quietEnd: app.querySelector('#action-quiet-end').value
    });
  };
  ['#action-inapp-notifications','#action-browser-notifications','#action-quiet-start','#action-quiet-end'].forEach((selector) => app.querySelector(selector)?.addEventListener('change', saveNotificationSettings));
  app.querySelector('#test-action-notification')?.addEventListener('click', () => showActionToast({ id: 'test', title: 'This is how an action reminder will appear.', dueAt: new Date().toISOString() }));

  const emailPrefs=readEmailPreferences();
  app.querySelector('#action-email-address').value=emailPrefs.email||'';
  app.querySelector('#action-email-reminders').checked=Boolean(emailPrefs.reminders);
  app.querySelector('#action-email-newsletter').checked=Boolean(emailPrefs.newsletter);
  app.querySelector('#action-email-notes').checked=Boolean(emailPrefs.notes);
  app.querySelector('#action-email-notes-frequency').value=emailPrefs.notesFrequency||'weekly';
  const emailStatus=app.querySelector('#action-email-status');
  const currentEmailForm=()=>({email:app.querySelector('#action-email-address').value.trim(),reminders:app.querySelector('#action-email-reminders').checked,newsletter:app.querySelector('#action-email-newsletter').checked,notes:app.querySelector('#action-email-notes').checked,notesFrequency:app.querySelector('#action-email-notes-frequency').value});
  app.querySelector('#save-action-email')?.addEventListener('click',async()=>{const prefs=currentEmailForm();emailStatus.textContent='Saving email preferences…';try{const result=await emailApi('/api/email/preferences',{clientId:emailClientId(),...prefs,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});writeEmailPreferences(prefs);await syncEmailActions();const noteCount=await syncEmailNotes();emailStatus.textContent=result.configured?`Email preferences saved to your account.${prefs.notes?` ${noteCount} saved note${noteCount===1?' is':'s are'} currently available for email delivery.`:''}`:'Email preferences saved to your account, but outgoing email is not configured on the server yet.';}catch(error){emailStatus.textContent=error.message;emailStatus.classList.add('error');}});
  app.querySelector('#test-action-email')?.addEventListener('click',async()=>{emailStatus.textContent='Sending test email…';try{await emailApi('/api/email/test',{clientId:emailClientId()});emailStatus.textContent='Test email sent. Check your inbox and spam folder.';}catch(error){emailStatus.textContent=error.message;emailStatus.classList.add('error');}});
  app.querySelector('#send-action-notes')?.addEventListener('click',async()=>{const notes=collectEmailNotes();emailStatus.textContent=`Preparing ${notes.length} note${notes.length===1?'':'s'}…`;try{const result=await emailApi('/api/email/send-notes',{clientId:emailClientId(),notes});emailStatus.textContent=`${result.count} note${result.count===1?' was':'s were'} emailed.`;}catch(error){emailStatus.textContent=error.message;emailStatus.classList.add('error');}});
  app.querySelector('#send-action-notebook')?.addEventListener('click',async()=>{const notes=collectNotebookEmailNotes();emailStatus.textContent=`Preparing ${notes.length} notebook entr${notes.length===1?'y':'ies'}…`;try{const result=await emailApi('/api/email/send-notes',{clientId:emailClientId(),notes});emailStatus.textContent=`${result.count} notebook entr${result.count===1?'y was':'ies were'} emailed.`;}catch(error){emailStatus.textContent=error.message;emailStatus.classList.add('error');}});
  app.querySelector('#send-newsletter-preview')?.addEventListener('click',async()=>{emailStatus.textContent='Sending newsletter preview…';try{await emailApi('/api/email/newsletter-preview',{clientId:emailClientId()});emailStatus.textContent='Newsletter preview sent. Check your inbox.';}catch(error){emailStatus.textContent=error.message;emailStatus.classList.add('error');}});


  app.querySelector('#cancel-action-edit').addEventListener('click', resetForm);
  app.querySelector('#action-filter').addEventListener('change', renderList);
  app.querySelector('#action-list').addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-action-toggle]');
    const edit = event.target.closest('[data-action-edit]');
    const remove = event.target.closest('[data-action-delete]');
    const actions = readActions();
    if (toggle) {
      const item = actions.find((entry) => entry.id === toggle.dataset.actionToggle);
      if (item) { item.status = item.status === 'completed' ? 'active' : 'completed'; item.completedAt = item.status === 'completed' ? new Date().toISOString() : null; writeActions(actions); renderActionCenter(); }
    }
    if (remove) {
      const item = actions.find((entry) => entry.id === remove.dataset.actionDelete);
      if (item && window.confirm(`Delete “${item.title}”?`)) {
        forgetModernGuideAction(item.id);
        writeActions(actions.filter((entry) => entry.id !== item.id));
        renderActionCenter();
      }
    }
    if (edit) {
      const item = actions.find((entry) => entry.id === edit.dataset.actionEdit);
      if (!item) return;
      app.querySelector('#action-edit-id').value = item.id;
      app.querySelector('#action-title').value = item.title || '';
      app.querySelector('#action-type').value = item.type || 'task';
      app.querySelector('#action-due').value = item.dueAt || '';
      app.querySelector('#action-priority').value = item.priority || 'normal';
      app.querySelector('#action-repeat').value = item.repeat || 'none';
      app.querySelector('#action-reminder').value = item.reminder || 'none';
      app.querySelector('#action-source').value = item.sourceTitle || '';
      app.querySelector('#action-note').value = item.note || '';
      app.querySelector('#save-action').textContent = 'Update action';
      app.querySelector('#cancel-action-edit').hidden = false;
      app.querySelector('#action-title').focus();
      app.querySelector('#action-form').scrollIntoView({behavior:'smooth', block:'start'});
    }
  });
  renderList();
}

function closeTopNavigationMenus(except = null) {
  document.querySelectorAll('.site-header nav > details[open]').forEach((menu) => {
    if (menu !== except) menu.removeAttribute('open');
  });
}

document.addEventListener('click', (event) => {
  const selectedNavigationItem = event.target.closest(
    '.site-header .menu-popover button[data-action], .site-header .menu-popover button[data-read], .site-header .menu-popover button[data-test], .site-header .menu-popover button[data-music-quick]'
  );

  if (selectedNavigationItem) {
    window.setTimeout(() => closeTopNavigationMenus(), 0);
    return;
  }

  // Browse now lives as an expandable subsection inside My Library. Let its
  // native <details> toggle without treating that nested summary as a request
  // to close the parent navigation menu.
  const nestedLibrarySubmenu = event.target.closest('.library-browse-submenu, .library-collections-submenu');
  if (nestedLibrarySubmenu) {
    return;
  }

  const activeMenu = event.target.closest('.site-header nav > details');
  if (activeMenu) {
    if (event.target.closest('summary')) closeTopNavigationMenus(activeMenu);
    return;
  }

  closeTopNavigationMenus();
});

/*
  Help is a direct top-level destination. Handle it before the shared navigation
  pipeline so clicks on either the icon or label cannot be swallowed by menu,
  continuity, or reader-state logic.
*/
document.addEventListener('click', (event) => {
  const helpButton = event.target.closest?.('[data-action="help"]');
  if (!helpButton) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  try {
    captureCurrentViewPosition();
    ReaderContinuity.saveBeforeNavigation();
  } catch (error) {
    console.warn('Help navigation could not save the current view:', error);
  }

  closeMenus();
  renderHelp();
  app.dataset.viewKey = 'help';

  window.requestAnimationFrame(() => {
    app.scrollIntoView({ block: 'start' });
    app.querySelector('#help-search-input')?.focus({ preventScroll: true });
  });
}, true);


const MY_LINKS_STORAGE_KEY = 'markSetGoMyLinksV1';

function normalizeUserLinkUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Enter a website address.');
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(candidate);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http and https links are supported.');
  return parsed.href;
}

function readMyLinks() {
  try {
    const saved = JSON.parse(localStorage.getItem(MY_LINKS_STORAGE_KEY) || 'null');
    if (Array.isArray(saved)) return saved;
  } catch (_) {}
  const starter = [{ id: 'athenaeum-books', title: 'Athenaeum Books', url: 'https://athenaeumbooks.com/', createdAt: new Date().toISOString() }];
  localStorage.setItem(MY_LINKS_STORAGE_KEY, JSON.stringify(starter));
  return starter;
}

function writeMyLinks(links) {
  localStorage.setItem(MY_LINKS_STORAGE_KEY, JSON.stringify(links));
}

function renderMyLinks(selectedId = '') {
  stopReader();
  const links = readMyLinks();
  const selected = links.find((item) => item.id === selectedId) || links[0] || null;
  app.dataset.viewKey = 'my-links';
  app.innerHTML = `
    <section class="panel platform-page my-links-page">
      <header class="platform-hero compact-hero">
        <div><span class="source-category">Browse</span><h1>My Links</h1><p>Save useful reading and research websites and open them without leaving Mark, Set, Go!</p></div>
        <button class="secondary" type="button" data-action="reader">Return to Reader</button>
      </header>

      <div class="my-links-layout">
        <aside class="my-links-sidebar app-section-card section-accent-blue">
          <div class="section-heading"><span class="section-icon" aria-hidden="true">↗</span><div><h2>Saved websites</h2><p>Add, edit, and organize your links.</p></div></div>
          <form id="my-links-form" class="my-links-form">
            <input id="my-link-id" type="hidden">
            <label>Name<input id="my-link-title" type="text" maxlength="80" placeholder="Athenaeum Books" required></label>
            <label>Website address<input id="my-link-url" type="url" placeholder="https://athenaeumbooks.com" required></label>
            <div class="my-links-form-actions">
              <button class="primary" type="submit">Save link</button>
              <button class="secondary" id="my-link-cancel" type="button" hidden>Cancel edit</button>
            </div>
          </form>
          <div id="my-links-list" class="my-links-list">
            ${links.length ? links.map((item) => `
              <article class="my-link-row ${selected?.id === item.id ? 'is-active' : ''}" data-link-id="${escapeHtml(item.id)}">
                <button class="my-link-open" type="button" data-open-link="${escapeHtml(item.id)}">
                  <strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(new URL(item.url).hostname)}</small>
                </button>
                <div class="my-link-row-actions">
                  <button class="icon-button" type="button" data-edit-link="${escapeHtml(item.id)}" title="Edit ${escapeHtml(item.title)}">✎</button>
                  <button class="icon-button danger" type="button" data-delete-link="${escapeHtml(item.id)}" title="Remove ${escapeHtml(item.title)}">×</button>
                </div>
              </article>`).join('') : '<p class="empty-state">No saved websites yet.</p>'}
          </div>
        </aside>

        <section class="my-links-viewer app-section-card section-accent-green">
          <div class="section-heading">
            <span class="section-icon" aria-hidden="true">⌕</span>
            <div><h2 id="my-links-viewer-title">${selected ? escapeHtml(selected.title) : 'Website viewer'}</h2><p id="my-links-viewer-url">${selected ? escapeHtml(selected.url) : 'Choose or add a website.'}</p></div>
            ${selected ? `<a class="secondary button-link" href="${escapeHtml(selected.url)}" target="_blank" rel="noopener noreferrer">Open in new tab</a>` : ''}
          </div>
          <div class="iframe-notice"><strong>Some websites block embedded viewing.</strong> When a page is blank or shows a refusal message, use “Open in new tab.”</div>
          <div class="my-links-frame-wrap">
            ${selected ? `<iframe id="my-links-frame" title="${escapeHtml(selected.title)}" src="${escapeHtml(selected.url)}" loading="eager" referrerpolicy="strict-origin-when-cross-origin" allow="clipboard-read; clipboard-write; fullscreen" allowfullscreen></iframe>` : '<div class="my-links-empty-viewer">Add a website to begin.</div>'}
          </div>
        </section>
      </div>
    </section>`;

  const form = app.querySelector('#my-links-form');
  const idInput = app.querySelector('#my-link-id');
  const titleInput = app.querySelector('#my-link-title');
  const urlInput = app.querySelector('#my-link-url');
  const cancelButton = app.querySelector('#my-link-cancel');

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const title = titleInput.value.trim();
      if (!title) throw new Error('Enter a name for this link.');
      const url = normalizeUserLinkUrl(urlInput.value);
      const current = readMyLinks();
      const editingId = idInput.value;
      let id = editingId;
      if (editingId) {
        const item = current.find((entry) => entry.id === editingId);
        if (item) { item.title = title; item.url = url; item.updatedAt = new Date().toISOString(); }
      } else {
        id = `link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        current.push({ id, title, url, createdAt: new Date().toISOString() });
      }
      writeMyLinks(current);
      renderMyLinks(id);
    } catch (error) { window.alert(error.message); }
  });

  cancelButton?.addEventListener('click', () => renderMyLinks(selected?.id || ''));
  app.querySelectorAll('[data-open-link]').forEach((button) => button.addEventListener('click', () => renderMyLinks(button.dataset.openLink)));
  app.querySelectorAll('[data-edit-link]').forEach((button) => button.addEventListener('click', () => {
    const item = readMyLinks().find((entry) => entry.id === button.dataset.editLink);
    if (!item) return;
    idInput.value = item.id; titleInput.value = item.title; urlInput.value = item.url;
    cancelButton.hidden = false; titleInput.focus();
  }));
  app.querySelectorAll('[data-delete-link]').forEach((button) => button.addEventListener('click', () => {
    const item = readMyLinks().find((entry) => entry.id === button.dataset.deleteLink);
    if (!item || !window.confirm(`Remove “${item.title}”?`)) return;
    const remaining = readMyLinks().filter((entry) => entry.id !== item.id);
    writeMyLinks(remaining);
    renderMyLinks(remaining[0]?.id || '');
  }));
}

document.addEventListener('click', (event) => {
  const test = event.target.closest('[data-test]');
  const read = event.target.closest('[data-read]');
  const action = event.target.closest('[data-action]');
  const quickMusic = event.target.closest('[data-music-quick]');
  if (!test && !read && !action && !quickMusic) return;

  captureCurrentViewPosition();

  const targetView = navigationViewKey({
    action: action?.dataset.action,
    read: read?.dataset.read,
    test: test?.dataset.test
  });

  if (test) {
    ReaderContinuity.saveBeforeNavigation();
    closeMenus();
    renderWpmTest(test.dataset.test);
    restoreViewPosition(targetView);
    return;
  }

  if (read) {
    ReaderContinuity.saveBeforeNavigation();
    closeMenus();
    renderReader(read.dataset.read);
    restoreViewPosition(targetView);
    return;
  }

  if (quickMusic) {
    closeMenus();
    const choice = musicChoices.find((item) => item.id === quickMusic.dataset.musicQuick);
    if (choice) {
      if (choice.id === 'lofi-study' && choice.searchQuery) playYouTubeSearch(choice.searchQuery, choice.title);
      else playMusic(choice);
    }
    return;
  }

  const actionName = action.dataset.action;
  if (actionName !== 'reader') ReaderContinuity.saveBeforeNavigation();
  closeMenus();

  if (actionName === 'reader') {
    renderCurrentReader();
    app.dataset.viewKey = 'reader';
    return;
  }
  if (actionName === 'home') renderHome();
  if (actionName === 'browse') renderBrowseHub();
  if (actionName === 'drm-free-books') renderDrmFreeBookFinder();
  if (actionName === 'my-links') renderMyLinks();
  if (actionName === 'my-library') renderMyLibraryHub();
  if (actionName === 'profile-preferences') renderProfilePreferences();
  if (actionName === 'ai-center') renderAiCenter();
  if (actionName === 'mark-notebook') renderGlobalNotebook();
  if (actionName === 'knowledge-graph') renderKnowledgeGraph();
  if (actionName === 'library-bookmarks') renderLibraryRecords('bookmarks');
  if (actionName === 'library-notes') renderLibraryRecords('notes');
  if (actionName === 'about') renderAbout();
  if (actionName === 'contact') renderContact();
  if (actionName === 'privacy') renderPrivacy();
  if (actionName === 'terms') renderTerms();
  if (actionName === 'music') renderMusicLibrary();
  if (actionName === 'my-reading' || actionName === 'reading-list') renderReadingList();
  if (actionName === 'progress-dashboard' || actionName === 'progress-awards') renderProgressDashboard();
  if (actionName === 'action-center') renderActionCenter();
  if (actionName === 'vocabulary-builder') renderVocabularyBuilder();
  if (actionName === 'reading-skills') renderReadingSkillsHub();
  if (actionName === 'comprehension-library') renderComprehensionLibrary();
  if (actionName === 'mnemonics') renderMnemonicsPage();
  if (actionName === 'language-learning') renderLanguageLearningPage();
  if (actionName === 'learning-courses') renderLearningCoursesPage();

  restoreViewPosition(targetView);
});


document.addEventListener('change', (event) => {
  const control = event.target.closest?.(ReaderContinuity.protectedControlSelector);
  if (!control || !app.querySelector('#reader')) return;

  const snapshot = ReaderContinuity.capture();
  if (!snapshot) return;

  const transition = ++ReaderContinuity.transitionId;
  const anchorIndex = snapshot.index;
  const wasRunning = snapshot.wasRunning;

  window.setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => {
    if (transition !== ReaderContinuity.transitionId || !app.querySelector('#reader')) return;

    const reader = app.querySelector('#reader');
    const mode = state.renderedMode || getSelectedMode();
    const groupSize = Math.max(1, Number(app.querySelector('#word-count')?.value) || 1);

    state.index = anchorIndex;

    if (
      !state.bookPages
      && !['flash', 'digital-sign', 'two-column'].includes(mode)
      && state.virtualized
      && (anchorIndex < state.renderedWordStart || anchorIndex >= state.renderedWordEnd)
    ) {
      virtualRenderer.renderWindowAround(reader, mode, groupSize, anchorIndex);
    }

    restoreReadingAnchor(reader, mode, groupSize, anchorIndex);

    if (state.bookPages) {
      const spread = bookSpreadForWordIndex(reader, anchorIndex);
      if (spread != null) {
        goToBookSpread(spread, {
          behavior: 'auto',
          ensureRendered: true,
          syncReaderPosition: false
        });
      }
    }

    state.index = anchorIndex;
    updateReaderStatus();

    const corrected = buildReaderSessionSnapshot() || snapshot;
    corrected.index = anchorIndex;
    corrected.wasRunning = wasRunning;
    corrected.controls = { ...(corrected.controls || {}), ...captureReaderControls() };
    ReaderContinuity.commit(corrected, { immediate: true });

    if (wasRunning && !isReaderRunning() && mode !== 'two-column') {
      state.index = anchorIndex;
      startReader();
    }
  })), 0);
}, true);

window.addEventListener('pagehide', () => {
  captureCurrentViewPosition();
  ReaderContinuity.saveBeforeNavigation();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    captureCurrentViewPosition();
    ReaderContinuity.saveBeforeNavigation();
  }
});

musicNextButton?.addEventListener('click', () => {
  if (musicSearchState) playMusicSearchCandidate(musicSearchState.index + 1);
});
document.querySelector('#music-close')?.addEventListener('click', stopMusic);
document.querySelector('#music-minimize')?.addEventListener('click', () => {
  const minimized = musicDock.classList.toggle('minimized');
  musicPlayerWrap.hidden = minimized;
  document.querySelector('#music-minimize').textContent = minimized ? '□' : '—';
  document.querySelector('#music-minimize').setAttribute('aria-label', minimized ? 'Restore music player' : 'Minimize music player');
});
try {
  const savedMusic = JSON.parse(localStorage.getItem('markSetGoMusic') || 'null');
  if (savedMusic?.src) {
    const retiredIds = ['5qap5aO4i9A', 'EcEMX-63PKY'];
    if (retiredIds.some((id) => savedMusic.src.includes(id))) {
      localStorage.removeItem('markSetGoMusic');
    } else {
      if (savedMusic.search?.videoIds?.length) {
        musicSearchState = savedMusic.search;
        playMusicSearchCandidate(Number(savedMusic.search.index || 0));
      } else {
        playMusic(savedMusic);
      }
    }
  }
} catch {}

function persistReaderProgressMetadata() {
  if (!state.words.length || !app.querySelector('#reader')) return;
  try {
    localStorage.setItem(READER_SESSION_META_KEY, JSON.stringify({
      documentId: state.documentId || '',
      title: state.title || 'Untitled',
      index: Math.max(0, Number(state.index) || 0),
      totalWords: Math.max(0, Number(state.words.length) || 0),
      savedAt: new Date().toISOString()
    }));
  } catch {}
}

window.setInterval(() => {
  // Do not serialize the full book on a timer. Large EPUB/PDF texts caused a
  // visible main-thread pause every ten seconds, especially in fullscreen.
  // Full snapshots are still written on controls, navigation, pause, pagehide,
  // and visibility changes; this heartbeat stores only the small resume marker.
  persistReaderProgressMetadata();
}, 15000);
let bookPageResizeTimer = null;
window.addEventListener('resize', () => {
  if (!state.bookPages) return;
  const anchorIndex = Math.max(0, Number(state.index) || 0);
  window.clearTimeout(bookPageResizeTimer);
  bookPageResizeTimer = window.setTimeout(
    () => scheduleBookPageReflow({ anchorIndex }),
    90
  );
});

// Fullscreen and pane changes can alter the reader width without producing a
// useful window resize event. Observe the actual reader box and rebuild the
// two-page geometry while preserving the same logical spread.
let observedBookReader = null;
let observedBookReaderWidth = 0;
let observedBookReaderHeight = 0;
const bookPageResizeObserver = typeof ResizeObserver === 'function'
  ? new ResizeObserver((entries) => {
      if (!state.bookPages) return;
      const entry = entries?.[entries.length - 1];
      const width = Math.round(entry?.contentRect?.width || 0);
      const height = Math.round(entry?.contentRect?.height || 0);
      if (Math.abs(width - observedBookReaderWidth) < 2
          && Math.abs(height - observedBookReaderHeight) < 2) return;
      observedBookReaderWidth = width;
      observedBookReaderHeight = height;

      const anchorIndex = Number.isFinite(Number(pendingBookPageAnchorIndex))
        ? Number(pendingBookPageAnchorIndex)
        : Math.max(0, Number(state.index) || 0);
      window.clearTimeout(bookPageResizeTimer);
      bookPageResizeTimer = window.setTimeout(
        () => scheduleBookPageReflow({ anchorIndex }),
        140
      );
    })
  : null;
function observeBookPageReader() {
  const reader = app.querySelector('#reader');
  if (!bookPageResizeObserver || !reader || reader === observedBookReader) return;
  if (observedBookReader) bookPageResizeObserver.unobserve(observedBookReader);
  observedBookReader = reader;
  bookPageResizeObserver.observe(reader);
}

window.addEventListener('pagehide', () => {
  if (app.querySelector('#reader')) persistReaderSession({ immediate: true });
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && app.querySelector('#reader')) {
    persistReaderSession({ immediate: true });
  }
});

// Check local reminders while the app is open or running in a background tab.
window.setInterval(checkActionNotifications, 30000);
window.setTimeout(checkActionNotifications, 1500);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkActionNotifications(); });

// v5.16: startup stays lightweight. The last book is restored only after an explicit Resume action.
renderHome();

// Keep top navigation popovers over the page rather than in document flow.
(function initializeOverlayNavigation() {
  const header = document.querySelector('.site-header');
  const topMenus = Array.from(document.querySelectorAll('.site-header nav > details'));
  if (!header || !topMenus.length) return;

  const updateMenuTop = () => {
    document.documentElement.style.setProperty('--mobile-menu-top', `${Math.ceil(header.getBoundingClientRect().bottom + 4)}px`);
  };
  updateMenuTop();
  window.addEventListener('resize', updateMenuTop, { passive: true });

  topMenus.forEach((menu) => {
    menu.addEventListener('toggle', () => {
      if (!menu.open) return;
      updateMenuTop();
      topMenus.forEach((other) => {
        if (other !== menu) other.removeAttribute('open');
      });
    });
  });

  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.site-header nav')) {
      topMenus.forEach((menu) => menu.removeAttribute('open'));
    }
  });
})();

window.addEventListener('pagehide', () => ReaderContinuity.scheduleCheckpoint({ immediate: true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') ReaderContinuity.scheduleCheckpoint({ immediate: true });
});

