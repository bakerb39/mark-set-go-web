(() => {
  'use strict';

  const DB_NAME = 'markSetGoLocalLibraryV1';
  const STORE_NAME = 'books';
  const MEDIA_KEY_PREFIX = 'reader-media:v1:';
  const PANEL_WIDTH_KEY = 'markSetGoVideoSidePanelWidthV1';
  const MODE_KEY = 'markSetGoMediaDockModeV1';
  const FLOAT_POSITION_KEY = 'markSetGoMediaFloatPositionV1';
  const DEFAULT_WIDTH = 480;
  const MIN_WIDTH = 360;
  const MAX_ITEMS_PER_READING = 100;

  const dock = document.querySelector('#music-dock');
  const player = document.querySelector('#music-player');
  const playerWrap = document.querySelector('#music-player-wrap');
  const titleNode = document.querySelector('#music-now-title');
  const sourceNode = document.querySelector('#music-now-source');
  const actions = dock?.querySelector('.music-dock-actions');
  const minimizeButton = document.querySelector('#music-minimize');

  if (!dock || !player || !actions) return;

  let mode = readMode();
  let sideWidth = readWidth();
  let panelOpen = false;
  let currentPlaying = null;
  let searchResults = [];
  let resultMetadata = new Map();
  let activeSearch = null;
  let activeContext = currentContext();
  let resizer = null;
  let floatPosition = readFloatPosition();
  let floatDragState = null;
  let playbackGuardInstalled = false;

  function readMode() {
    try {
      const value = localStorage.getItem(MODE_KEY);
      return ['float','beside','expanded'].includes(value) ? value : 'float';
    } catch {
      return 'float';
    }
  }

  function saveMode(value) {
    mode = ['float','beside','expanded'].includes(value) ? value : 'float';
    try { localStorage.setItem(MODE_KEY, mode); } catch {}
    applyMode();
  }

  function maxSideWidth() {
    const viewport = Math.floor(window.innerWidth * 0.58);
    const readerLimit = Math.max(MIN_WIDTH, window.innerWidth - 480);
    return Math.max(MIN_WIDTH, Math.min(780, viewport, readerLimit));
  }

  function readWidth() {
    try {
      const value = Number(localStorage.getItem(PANEL_WIDTH_KEY));
      return Number.isFinite(value) && value >= MIN_WIDTH ? value : DEFAULT_WIDTH;
    } catch {
      return DEFAULT_WIDTH;
    }
  }

  function readFloatPosition() {
    try {
      const value = JSON.parse(localStorage.getItem(FLOAT_POSITION_KEY) || 'null');
      const left = Number(value?.left);
      const top = Number(value?.top);
      if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
      return { left, top };
    } catch {
      return null;
    }
  }

  function saveFloatPosition(value) {
    floatPosition = value && Number.isFinite(Number(value.left)) && Number.isFinite(Number(value.top))
      ? { left:Number(value.left), top:Number(value.top) }
      : null;
    try {
      if (floatPosition) localStorage.setItem(FLOAT_POSITION_KEY, JSON.stringify(floatPosition));
      else localStorage.removeItem(FLOAT_POSITION_KEY);
    } catch {}
    return floatPosition;
  }

  function normalizedMediaUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, window.location.href);
      url.hash = '';
      return url.href;
    } catch {
      return raw;
    }
  }

  function installSameSourceRestartGuard() {
    if (playbackGuardInstalled) return true;

    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
    if (!descriptor?.get || !descriptor?.set) return false;

    try {
      Object.defineProperty(player, 'src', {
        configurable:true,
        enumerable:descriptor.enumerable,
        get() {
          return descriptor.get.call(player);
        },
        set(value) {
          const current = normalizedMediaUrl(descriptor.get.call(player));
          const next = normalizedMediaUrl(value);
          if (current && next && current === next) {
            // Setting an iframe to the exact same URL reloads it in browsers.
            // Ignore duplicate assignments so navigation/UI resync code cannot
            // restart an already playing video.
            return;
          }
          descriptor.set.call(player, value);
        }
      });
      playbackGuardInstalled = true;
      dock.dataset.msgPersistentMediaPlayer = '1';
      return true;
    } catch {
      return false;
    }
  }

  function floatViewportBounds() {
    const rect = dock.getBoundingClientRect();
    const fallbackWidth = Math.min(420, Math.max(280, window.innerWidth - 16));
    const width = Math.max(1, rect.width || dock.offsetWidth || fallbackWidth);
    const height = Math.max(1, rect.height || dock.offsetHeight || 220);
    const headerBottom = Math.ceil(
      document.querySelector('.site-header')?.getBoundingClientRect()?.bottom || 0
    );
    const margin = 8;
    const minTop = Math.max(margin, headerBottom + 4);
    return {
      width,
      height,
      minLeft:margin,
      minTop,
      maxLeft:Math.max(margin, window.innerWidth - width - margin),
      maxTop:Math.max(minTop, window.innerHeight - Math.min(height, window.innerHeight - minTop - margin) - margin)
    };
  }

  function clampFloatPosition(left, top) {
    const bounds = floatViewportBounds();
    return {
      left:Math.round(Math.min(bounds.maxLeft, Math.max(bounds.minLeft, Number(left) || 0))),
      top:Math.round(Math.min(bounds.maxTop, Math.max(bounds.minTop, Number(top) || bounds.minTop)))
    };
  }

  function clearFloatDockGeometry() {
    if (dock.dataset.msgMediaFloatGeometry !== '1') return;
    [
      'position',
      'left',
      'right',
      'top',
      'bottom',
      'transform',
      'margin'
    ].forEach((name) => dock.style.removeProperty(name));
    delete dock.dataset.msgMediaFloatGeometry;
  }

  function applyFloatDockGeometry(position = floatPosition) {
    if (mode !== 'float' || !position) return false;

    const next = clampFloatPosition(position.left, position.top);
    floatPosition = next;

    // The old Reader music chooser can also position #music-dock with inline
    // !important rules. Once the user has deliberately moved the floating
    // player, their position owns the floating geometry.
    delete dock.dataset.readerChooserPositioned;
    dock.dataset.msgMediaFloatGeometry = '1';
    dock.style.setProperty('position', 'fixed', 'important');
    dock.style.setProperty('left', `${next.left}px`, 'important');
    dock.style.setProperty('top', `${next.top}px`, 'important');
    dock.style.setProperty('right', 'auto', 'important');
    dock.style.setProperty('bottom', 'auto', 'important');
    dock.style.setProperty('transform', 'none', 'important');
    dock.style.setProperty('margin', '0', 'important');
    return true;
  }

  function reassertFloatDockGeometrySoon() {
    if (mode !== 'float' || !floatPosition) return;
    window.setTimeout(() => {
      if (mode === 'float' && floatPosition) applyFloatDockGeometry();
    }, 0);
  }

  function resetFloatPosition() {
    saveFloatPosition(null);
    clearFloatDockGeometry();
    delete dock.dataset.readerChooserPositioned;
    dock.style.removeProperty('left');
    dock.style.removeProperty('top');
    dock.style.removeProperty('right');
    dock.style.removeProperty('bottom');
    return true;
  }

  function beginFloatDrag(event) {
    if (mode !== 'float') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(
      'button,a,input,select,textarea,[role="button"],[contenteditable="true"]'
    )) return;

    const bar = event.currentTarget;
    const rect = dock.getBoundingClientRect();
    const start = clampFloatPosition(rect.left, rect.top);

    event.preventDefault();
    document.body.classList.add('msg-media-float-dragging');
    dock.classList.add('msg-media-dragging');
    dock.dataset.msgMediaFloatGeometry = '1';
    delete dock.dataset.readerChooserPositioned;

    floatDragState = {
      pointerId:event.pointerId,
      startX:event.clientX,
      startY:event.clientY,
      startLeft:start.left,
      startTop:start.top
    };

    applyFloatDockGeometry(start);
    try { bar.setPointerCapture(event.pointerId); } catch {}

    const move = (moveEvent) => {
      if (!floatDragState || moveEvent.pointerId !== floatDragState.pointerId) return;
      const next = clampFloatPosition(
        floatDragState.startLeft + (moveEvent.clientX - floatDragState.startX),
        floatDragState.startTop + (moveEvent.clientY - floatDragState.startY)
      );
      floatPosition = next;
      applyFloatDockGeometry(next);
    };

    const finish = (finishEvent) => {
      if (!floatDragState) return;
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', finish);
      bar.removeEventListener('pointercancel', finish);
      try { bar.releasePointerCapture(finishEvent.pointerId); } catch {}
      document.body.classList.remove('msg-media-float-dragging');
      dock.classList.remove('msg-media-dragging');
      saveFloatPosition(floatPosition || clampFloatPosition(rect.left, rect.top));
      floatDragState = null;
    };

    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', finish);
    bar.addEventListener('pointercancel', finish);
  }

  function preservePlaybackAcrossNavigation() {
    const currentSrc = normalizedMediaUrl(player.getAttribute('src') || player.src);
    if (!currentSrc || dock.hidden) return;

    const currentNode = player;
    const currentDock = dock;

    window.setTimeout(() => {
      requestAnimationFrame(() => {
        // Normal Mark, Set, Go! navigation replaces #app only. These should
        // remain the same app-level nodes for uninterrupted playback.
        const livePlayer = document.querySelector('#music-player');
        const liveDock = document.querySelector('#music-dock');

        if (livePlayer !== currentNode || liveDock !== currentDock) {
          console.warn('Persistent media player was unexpectedly replaced during navigation.');
          return;
        }

        const afterSrc = normalizedMediaUrl(currentNode.getAttribute('src') || currentNode.src);
        if (!afterSrc && currentSrc) {
          // Recovery for an unexpected clear. Normal navigation should never
          // reach this path, so playback remains uninterrupted in the normal case.
          currentNode.src = currentSrc;
        }

        if (mode === 'float' && floatPosition) applyFloatDockGeometry();
        if (mode === 'beside' || mode === 'expanded') applySideDockGeometry();
      });
    }, 0);
  }

  function setWidth(value, persist = false) {
    const requested = Number(value);
    sideWidth = Math.round(Math.max(
      MIN_WIDTH,
      Math.min(Number.isFinite(requested) ? requested : DEFAULT_WIDTH, maxSideWidth())
    ));
    document.documentElement.style.setProperty('--msg-media-side-width', `${sideWidth}px`);
    if (persist) {
      try { localStorage.setItem(PANEL_WIDTH_KEY, String(sideWidth)); } catch {}
    }
    if (dock && ['beside','expanded'].includes(mode)) {
      const desiredWidth = mode === 'expanded'
        ? Math.max(sideWidth, Math.min(720, maxSideWidth()))
        : sideWidth;
      dock.style.setProperty('width', `${Math.round(desiredWidth)}px`, 'important');
    }
    return sideWidth;
  }

  function currentContext(explicit = null) {
    const value = explicit && typeof explicit === 'object'
      ? explicit
      : window.MarkSetGoMedia?.getContext?.()
        || window.MarkSetGoCurrentReaderDocument?.get?.();

    return {
      documentId:String(value?.documentId || ''),
      title:String(value?.title || ''),
      source:value?.source && typeof value.source === 'object'
        ? { ...value.source }
        : {}
    };
  }

  function contextKey(context = activeContext) {
    const id = String(context?.documentId || '').trim();
    return id ? `${MEDIA_KEY_PREFIX}${id}` : '';
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath:'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB is unavailable.'));
    });
  }

  async function getMediaRecord(context = activeContext) {
    const key = contextKey(context);
    if (!key) return null;
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  async function putMediaRecord(record) {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Media save was aborted.'));
      });
      return true;
    } finally {
      db.close();
    }
  }

  function itemIdentity(item) {
    if (item.videoId) return `youtube:${item.videoId}`;
    if (item.watchUrl) return `${item.provider || 'media'}:${item.watchUrl}`;
    if (item.src) return `${item.provider || 'media'}:${item.src}`;
    return `${item.provider || 'media'}:${item.title || 'item'}`;
  }

  function cleanSavedItem(item) {
    return {
      id:itemIdentity(item),
      provider:String(item.provider || 'youtube').slice(0,40),
      videoId:String(item.videoId || '').slice(0,40),
      title:String(item.title || item.displayTitle || 'Saved media').slice(0,400),
      displayTitle:String(item.displayTitle || item.title || 'Saved media').slice(0,400),
      source:String(item.source || '').slice(0,240),
      query:String(item.query || '').slice(0,600),
      src:String(item.src || '').slice(0,1800),
      watchUrl:String(item.watchUrl || '').slice(0,1800),
      thumbnailUrl:String(item.thumbnailUrl || '').slice(0,1800),
      savedAt:new Date().toISOString()
    };
  }

  async function saveItem(item, context = null) {
    const target = currentContext(context || item?.context || activeContext);
    if (!target.documentId) {
      setStatus('Open a book or article first to save media to that reading.', false);
      return false;
    }

    const key = contextKey(target);
    const existing = await getMediaRecord(target);
    const cleaned = cleanSavedItem(item);
    const previous = Array.isArray(existing?.items) ? existing.items : [];
    const items = [
      cleaned,
      ...previous.filter((entry) => itemIdentity(entry) !== cleaned.id)
    ].slice(0, MAX_ITEMS_PER_READING);

    const record = {
      key,
      type:'reader-media',
      documentId:target.documentId,
      title:target.title || existing?.title || '',
      source:target.source || existing?.source || {},
      items,
      updatedAt:new Date().toISOString()
    };

    await putMediaRecord(record);
    activeContext = target;
    await renderSaved();
    renderResults();
    setStatus('Saved to this reading.', true);
    document.dispatchEvent(new CustomEvent('marksetgo:reader-media-saved', {
      detail:{ documentId:target.documentId, item:cleaned }
    }));
    return true;
  }

  async function removeSavedItem(id) {
    const target = currentContext(activeContext);
    if (!target.documentId) return false;
    const existing = await getMediaRecord(target);
    if (!existing) return false;

    const next = (Array.isArray(existing.items) ? existing.items : [])
      .filter((item) => itemIdentity(item) !== id);

    await putMediaRecord({
      ...existing,
      key:contextKey(target),
      items:next,
      updatedAt:new Date().toISOString()
    });

    await renderSaved();
    renderResults();
    setStatus('Removed from this reading.', true);
    return true;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function installUi() {
    dock.setAttribute('aria-label', 'Media player');

    if (!document.querySelector('#msg-media-panel-toggle')) {
      const button = document.createElement('button');
      button.id = 'msg-media-panel-toggle';
      button.type = 'button';
      button.textContent = 'Media';
      button.setAttribute('aria-expanded','false');
      button.title = 'Search, choose, and save media for this reading';
      actions.insertBefore(button, actions.firstChild);
    }

    if (!document.querySelector('#music-beside-reader')) {
      const button = document.createElement('button');
      button.id = 'music-beside-reader';
      button.type = 'button';
      button.textContent = 'Beside';
      button.title = 'Keep this media beside the Reader while you turn pages';
      actions.insertBefore(button, document.querySelector('#music-next') || actions.firstChild);
    }

    if (!document.querySelector('#msg-media-expand')) {
      const button = document.createElement('button');
      button.id = 'msg-media-expand';
      button.type = 'button';
      button.textContent = 'Expand';
      button.title = 'Use a larger media panel beside the Reader';
      actions.insertBefore(button, document.querySelector('#music-next') || actions.firstChild);
    }

    if (!document.querySelector('#msg-media-save-current')) {
      const button = document.createElement('button');
      button.id = 'msg-media-save-current';
      button.type = 'button';
      button.textContent = 'Save';
      button.title = 'Save the current video or media item to this reading';
      button.disabled = true;
      actions.insertBefore(button, document.querySelector('#music-next') || actions.firstChild);
    }

    if (!document.querySelector('#msg-media-side-resizer')) {
      resizer = document.createElement('div');
      resizer.id = 'msg-media-side-resizer';
      resizer.className = 'msg-media-side-resizer';
      resizer.tabIndex = 0;
      resizer.setAttribute('role','separator');
      resizer.setAttribute('aria-orientation','vertical');
      resizer.setAttribute('aria-label','Resize media side panel');
      dock.insertBefore(resizer, dock.firstChild);
    } else {
      resizer = document.querySelector('#msg-media-side-resizer');
    }

    if (!document.querySelector('#msg-media-panel')) {
      const panel = document.createElement('section');
      panel.id = 'msg-media-panel';
      panel.className = 'msg-media-panel';
      panel.hidden = true;
      panel.innerHTML = `
        <div class="msg-media-search-row">
          <input id="msg-media-search-input" type="search" autocomplete="off" placeholder="Search videos…" aria-label="Search videos">
          <button id="msg-media-search-button" type="button">Search</button>
        </div>

        <div class="msg-media-reading-context">
          <span>For this reading</span>
          <strong id="msg-media-reading-title">Open a reading to personalize media.</strong>
          <div class="msg-media-quick-actions">
            <button type="button" data-media-quick="related">Related video</button>
            <button type="button" data-media-quick="lecture">Lecture / explainer</button>
            <button type="button" data-media-quick="mood">Reading mood</button>
          </div>
        </div>

        <div class="msg-media-section">
          <div class="msg-media-section-heading">
            <strong>Search results</strong>
            <span id="msg-media-results-caption">Search for videos related to the current reading.</span>
          </div>
          <div id="msg-media-results" class="msg-media-results"></div>
        </div>

        <div class="msg-media-section">
          <div class="msg-media-section-heading">
            <strong>My saved media</strong>
            <span>Saved to this book or article</span>
          </div>
          <div id="msg-media-saved" class="msg-media-saved"></div>
        </div>

        <p id="msg-media-status" class="msg-media-status" role="status" aria-live="polite"></p>
      `;
      dock.appendChild(panel);
    }

    bindUi();
    setWidth(sideWidth);
    applyMode();
    refreshContext();
  }

  function bindUi() {
    document.querySelector('#msg-media-panel-toggle')?.addEventListener('click', () => {
      setPanelOpen(!panelOpen);
    });

    document.querySelector('#music-beside-reader')?.addEventListener('click', () => {
      saveMode(mode === 'beside' ? 'float' : 'beside');
    });

    document.querySelector('#msg-media-expand')?.addEventListener('click', () => {
      saveMode(mode === 'expanded' ? 'float' : 'expanded');
    });

    document.querySelector('#msg-media-save-current')?.addEventListener('click', () => {
      if (currentPlaying) void saveItem(currentPlaying, currentPlaying.context);
    });

    document.querySelector('#msg-media-search-button')?.addEventListener('click', runManualSearch);
    document.querySelector('#msg-media-search-input')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runManualSearch();
      }
    });

    document.querySelectorAll('[data-media-quick]').forEach((button) => {
      button.addEventListener('click', () => runQuickSearch(button.dataset.mediaQuick));
    });

    document.querySelector('#msg-media-results')?.addEventListener('click', onResultsClick);
    document.querySelector('#msg-media-saved')?.addEventListener('click', onSavedClick);

    const dragBar = dock.querySelector('.music-dock-bar');
    dragBar?.addEventListener('pointerdown', beginFloatDrag);
    if (dragBar) {
      dragBar.title = mode === 'float'
        ? 'Drag to move the media player'
        : dragBar.title || '';
    }

    // Preserve the same app-level iframe across normal in-app navigation.
    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const navigation = event.target.closest(
        '[data-action],[data-read],[data-test],[data-topic-feed-open-read-anything]'
      );
      if (!navigation) return;
      preservePlaybackAcrossNavigation();
    }, true);

    // In side modes, repurpose minimize as a visual collapse while leaving the
    // iframe mounted so playback is not interrupted. In floating mode the
    // existing app.js minimize behavior remains untouched.
    minimizeButton?.addEventListener('click', (event) => {
      if (!['beside','expanded'].includes(mode)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const collapsed = dock.classList.toggle('msg-media-collapsed');
      document.body.classList.toggle('msg-media-collapsed-active', collapsed);
      minimizeButton.textContent = collapsed ? '□' : '—';
      minimizeButton.setAttribute(
        'aria-label',
        collapsed ? 'Expand media side panel' : 'Collapse media side panel'
      );
    }, true);

    resizer?.addEventListener('pointerdown', beginResize);
    resizer?.addEventListener('keydown', (event) => {
      if (!['beside','expanded'].includes(mode)) return;
      let delta = 0;
      if (event.key === 'ArrowLeft') delta = 24;
      if (event.key === 'ArrowRight') delta = -24;
      if (!delta) return;
      event.preventDefault();
      dock.classList.remove('msg-media-collapsed');
      document.body.classList.remove('msg-media-collapsed-active');
      setWidth(sideWidth + delta, true);
    });

    window.addEventListener('resize', () => {
      if (mode !== 'float') {
        setWidth(sideWidth);
        reassertSideDockGeometrySoon();
      } else if (floatPosition) {
        const next = clampFloatPosition(floatPosition.left, floatPosition.top);
        saveFloatPosition(next);
        reassertFloatDockGeometrySoon();
      }
    });

    // The legacy Reader music chooser may reposition #music-dock after clicks.
    // In side mode our side geometry owns the dock. After the user has dragged
    // Float mode, their saved floating position owns it there too.
    document.addEventListener('click', () => {
      reassertSideDockGeometrySoon();
      reassertFloatDockGeometrySoon();
    });
  }

  function runManualSearch() {
    const input = document.querySelector('#msg-media-search-input');
    const query = String(input?.value || '').trim();
    if (!query) return;
    activeContext = currentContext();
    setPanelOpen(true);
    void window.MarkSetGoMedia?.search?.(query, `${query} — video`, activeContext);
  }

  function runQuickSearch(kind) {
    activeContext = currentContext();
    const title = String(activeContext.title || '').trim();
    if (!title) {
      setStatus('Open a book or article first.', false);
      return;
    }

    const author = String(activeContext.source?.author || '').trim();
    const sourceName = String(activeContext.source?.source || activeContext.source?.provider || '').trim();
    let query = '';
    let label = '';

    if (kind === 'mood') {
      query = `${title}${author ? ` ${author}` : ''} instrumental reading ambience`;
      label = `${title} — reading mood`;
    } else if (kind === 'lecture') {
      query = `${title}${author ? ` ${author}` : ''} lecture explainer`;
      label = `${title} — lecture / explainer`;
    } else {
      const newsLike = /news|topic-feed|article|feed/i.test(String(activeContext.source?.type || ''));
      query = newsLike
        ? `${title}${sourceName ? ` ${sourceName}` : ''} news video`
        : `${title}${author ? ` ${author}` : ''} explained video`;
      label = `${title} — related video`;
    }

    const input = document.querySelector('#msg-media-search-input');
    if (input) input.value = query;
    setPanelOpen(true);
    void window.MarkSetGoMedia?.search?.(query, label, activeContext);
  }

  function onResultsClick(event) {
    const button = event.target.closest('button[data-media-result-action]');
    if (!button) return;
    const index = Number(button.dataset.mediaResultIndex);
    const result = searchResults[index];
    if (!result) return;

    if (button.dataset.mediaResultAction === 'play') {
      window.MarkSetGoMedia?.playCandidate?.(index);
      return;
    }
    if (button.dataset.mediaResultAction === 'save') {
      void saveItem(result, result.context);
      return;
    }
    if (button.dataset.mediaResultAction === 'open' && result.watchUrl) {
      window.open(result.watchUrl, '_blank', 'noopener,noreferrer');
    }
  }

  function onSavedClick(event) {
    const button = event.target.closest('button[data-media-saved-action]');
    if (!button) return;
    const id = String(button.dataset.mediaSavedId || '');
    const record = button.closest('[data-media-saved-item]');
    if (!record) return;

    if (button.dataset.mediaSavedAction === 'remove') {
      void removeSavedItem(id);
      return;
    }

    const encoded = record.dataset.mediaSavedPayload;
    let item = null;
    try { item = JSON.parse(decodeURIComponent(encoded)); } catch {}
    if (!item) return;

    if (button.dataset.mediaSavedAction === 'play') {
      if (item.videoId) {
        window.MarkSetGoMedia?.play?.({
          title:item.title || item.displayTitle || 'Saved video',
          provider:'youtube',
          source:item.source || 'Saved media',
          originalUrl:item.watchUrl,
          src:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.videoId)}?autoplay=1&playsinline=1&rel=0`,
          context:activeContext
        }, activeContext);
      } else if (item.src) {
        window.MarkSetGoMedia?.play?.({ ...item, context:activeContext }, activeContext);
      }
      return;
    }

    if (button.dataset.mediaSavedAction === 'open' && item.watchUrl) {
      window.open(item.watchUrl, '_blank', 'noopener,noreferrer');
    }
  }

  function beginResize(event) {
    if (!['beside','expanded'].includes(mode)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    event.preventDefault();
    dock.classList.remove('msg-media-collapsed');
    document.body.classList.remove('msg-media-collapsed-active');
    document.body.classList.add('msg-media-resizing');

    try { resizer.setPointerCapture(event.pointerId); } catch {}

    const move = (moveEvent) => {
      setWidth(window.innerWidth - moveEvent.clientX);
    };

    const finish = (finishEvent) => {
      resizer.removeEventListener('pointermove', move);
      resizer.removeEventListener('pointerup', finish);
      resizer.removeEventListener('pointercancel', finish);
      document.body.classList.remove('msg-media-resizing');
      try { resizer.releasePointerCapture(finishEvent.pointerId); } catch {}
      setWidth(sideWidth, true);
    };

    resizer.addEventListener('pointermove', move);
    resizer.addEventListener('pointerup', finish);
    resizer.addEventListener('pointercancel', finish);
  }

  function clearSideDockGeometry() {
    [
      'position',
      'left',
      'right',
      'top',
      'bottom',
      'width',
      'max-width',
      'transform',
      'margin',
      'inset',
      'inset-inline-start',
      'inset-inline-end'
    ].forEach((name) => dock.style.removeProperty(name));
    delete dock.dataset.msgMediaSideGeometry;
  }

  function applySideDockGeometry() {
    if (!['beside','expanded'].includes(mode)) return;

    // reader-music-quick.js positions the same dock near the Reader's music
    // control with inline !important top/right/left/bottom values. Side mode
    // owns viewport placement, so replace those values authoritatively.
    delete dock.dataset.readerChooserPositioned;
    dock.dataset.msgMediaSideGeometry = '1';

    const desiredWidth = mode === 'expanded'
      ? Math.max(sideWidth, Math.min(720, maxSideWidth()))
      : sideWidth;

    dock.style.setProperty('position', 'fixed', 'important');
    dock.style.setProperty('left', 'auto', 'important');
    dock.style.setProperty('right', '12px', 'important');
    dock.style.setProperty('top', '68px', 'important');
    dock.style.setProperty('bottom', 'auto', 'important');
    dock.style.setProperty('width', `${Math.round(desiredWidth)}px`, 'important');
    dock.style.setProperty('max-width', 'min(780px, 58vw)', 'important');
    dock.style.setProperty('transform', 'none', 'important');
    dock.style.setProperty('margin', '0', 'important');
  }

  function reassertSideDockGeometrySoon() {
    if (!['beside','expanded'].includes(mode)) return;
    window.setTimeout(() => {
      if (['beside','expanded'].includes(mode)) applySideDockGeometry();
    }, 0);
  }

  function applyMode() {
    dock.classList.toggle('msg-media-beside', mode === 'beside');
    dock.classList.toggle('msg-media-expanded', mode === 'expanded');
    dock.classList.toggle('msg-media-floating', mode === 'float');

    const side = mode === 'beside' || mode === 'expanded';
    document.body.classList.toggle('msg-media-side-active', side);
    document.body.classList.toggle('msg-media-expanded-active', mode === 'expanded');

    if (!side) {
      dock.classList.remove('msg-media-collapsed');
      document.body.classList.remove('msg-media-collapsed-active');
      clearSideDockGeometry();
      if (floatPosition) applyFloatDockGeometry();
      if (minimizeButton) {
        minimizeButton.textContent = '—';
        minimizeButton.setAttribute('aria-label','Minimize media player');
      }
    } else {
      clearFloatDockGeometry();
      dock.classList.remove('minimized');
      if (playerWrap) playerWrap.hidden = false;
      setWidth(mode === 'expanded' ? Math.max(sideWidth, Math.min(720, maxSideWidth())) : sideWidth);
      applySideDockGeometry();
    }

    if (resizer) resizer.hidden = !side;

    const beside = document.querySelector('#music-beside-reader');
    if (beside) {
      beside.textContent = mode === 'beside' ? 'Float' : 'Beside';
      beside.setAttribute('aria-pressed', mode === 'beside' ? 'true' : 'false');
    }

    const expand = document.querySelector('#msg-media-expand');
    if (expand) {
      expand.textContent = mode === 'expanded' ? 'Float' : 'Expand';
      expand.setAttribute('aria-pressed', mode === 'expanded' ? 'true' : 'false');
    }

    const dragBar = dock.querySelector('.music-dock-bar');
    if (dragBar) {
      dragBar.title = mode === 'float' ? 'Drag to move the media player' : '';
    }

    window.dispatchEvent(new Event('resize'));
  }

  function setPanelOpen(value) {
    panelOpen = Boolean(value);
    const panel = document.querySelector('#msg-media-panel');
    if (panel) panel.hidden = !panelOpen;
    const toggle = document.querySelector('#msg-media-panel-toggle');
    toggle?.setAttribute('aria-expanded', panelOpen ? 'true' : 'false');
    dock.classList.toggle('msg-media-panel-open', panelOpen);

    if (panelOpen) {
      dock.hidden = false;
      dock.classList.remove('minimized');
      if (playerWrap) playerWrap.hidden = false;
      refreshContext();
      renderResults();
      void renderSaved();
      if (mode === 'float' && floatPosition) {
        requestAnimationFrame(() => applyFloatDockGeometry());
      }
    }
  }

  function refreshContext(explicit = null) {
    activeContext = currentContext(explicit || currentPlaying?.context || activeContext);
    const node = document.querySelector('#msg-media-reading-title');
    if (node) {
      node.textContent = activeContext.title
        ? activeContext.title
        : 'Open a reading to personalize media.';
    }
  }

  function setStatus(message, success = false) {
    const node = document.querySelector('#msg-media-status');
    if (!node) return;
    node.textContent = String(message || '');
    node.classList.toggle('success', Boolean(success));
  }

  function resultFromId(videoId, index, detail) {
    const metadata = resultMetadata.get(videoId) || {};
    return {
      provider:'youtube',
      videoId,
      title:metadata.title || detail.title || `YouTube result ${index + 1}`,
      displayTitle:metadata.title || `YouTube result ${index + 1}`,
      source:metadata.author_name || `Result ${index + 1} of ${detail.videoIds.length}`,
      query:String(detail.query || ''),
      resultIndex:index,
      resultCount:detail.videoIds.length,
      src:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&rel=0`,
      watchUrl:`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      thumbnailUrl:`https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
      context:currentContext(detail.context)
    };
  }

  async function hydrateMetadata(videoId) {
    if (!videoId || resultMetadata.has(videoId)) return;
    try {
      const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
      const response = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`,
        { mode:'cors', credentials:'omit' }
      );
      if (!response.ok) return;
      const payload = await response.json();
      resultMetadata.set(videoId, {
        title:String(payload?.title || ''),
        author_name:String(payload?.author_name || '')
      });
      searchResults = searchResults.map((item) => item.videoId === videoId
        ? {
            ...item,
            title:String(payload?.title || item.title),
            displayTitle:String(payload?.title || item.displayTitle),
            source:String(payload?.author_name || item.source)
          }
        : item);
      renderResults();
    } catch {
      // Metadata is optional; thumbnails and playable IDs are enough.
    }
  }

  async function savedIds() {
    try {
      const record = await getMediaRecord(activeContext);
      return new Set((record?.items || []).map(itemIdentity));
    } catch {
      return new Set();
    }
  }

  async function renderResults() {
    const container = document.querySelector('#msg-media-results');
    const caption = document.querySelector('#msg-media-results-caption');
    if (!container) return;

    if (caption) {
      caption.textContent = activeSearch?.query
        ? activeSearch.query
        : 'Search for videos related to the current reading.';
    }

    if (!searchResults.length) {
      container.innerHTML = `<div class="msg-media-empty">No video results loaded yet.</div>`;
      return;
    }

    const ids = await savedIds();

    container.innerHTML = searchResults.map((item, index) => {
      const saved = ids.has(itemIdentity(item));
      return `
        <article class="msg-media-result-card">
          <button class="msg-media-thumb-button" type="button" data-media-result-action="play" data-media-result-index="${index}" aria-label="Play ${escapeHtml(item.displayTitle)}">
            <img src="${escapeHtml(item.thumbnailUrl)}" alt="" loading="lazy">
            <span>▶</span>
          </button>
          <div class="msg-media-result-copy">
            <strong>${escapeHtml(item.displayTitle)}</strong>
            <small>${escapeHtml(item.source || 'YouTube')}</small>
            <div class="msg-media-card-actions">
              <button type="button" data-media-result-action="play" data-media-result-index="${index}">Play</button>
              <button type="button" data-media-result-action="save" data-media-result-index="${index}" ${saved ? 'disabled' : ''}>${saved ? 'Saved' : 'Save'}</button>
              <button type="button" data-media-result-action="open" data-media-result-index="${index}">YouTube ↗</button>
            </div>
          </div>
        </article>`;
    }).join('');
  }

  async function renderSaved() {
    const container = document.querySelector('#msg-media-saved');
    if (!container) return;

    const target = currentContext(activeContext);
    if (!target.documentId) {
      container.innerHTML = `<div class="msg-media-empty">Open a book or article to save media to it.</div>`;
      return;
    }

    try {
      const record = await getMediaRecord(target);
      const items = Array.isArray(record?.items) ? record.items : [];

      if (!items.length) {
        container.innerHTML = `<div class="msg-media-empty">No media saved to this reading yet.</div>`;
        return;
      }

      container.innerHTML = items.map((item) => {
        const payload = encodeURIComponent(JSON.stringify(item));
        return `
          <article class="msg-media-saved-card" data-media-saved-item data-media-saved-payload="${payload}">
            ${item.thumbnailUrl ? `<img src="${escapeHtml(item.thumbnailUrl)}" alt="" loading="lazy">` : '<div class="msg-media-saved-icon">▶</div>'}
            <div>
              <strong>${escapeHtml(item.displayTitle || item.title || 'Saved media')}</strong>
              <small>${escapeHtml(item.source || item.provider || 'Media')}</small>
              <div class="msg-media-card-actions">
                <button type="button" data-media-saved-action="play" data-media-saved-id="${escapeHtml(itemIdentity(item))}">Play</button>
                ${item.watchUrl ? `<button type="button" data-media-saved-action="open" data-media-saved-id="${escapeHtml(itemIdentity(item))}">Open ↗</button>` : ''}
                <button type="button" data-media-saved-action="remove" data-media-saved-id="${escapeHtml(itemIdentity(item))}">Remove</button>
              </div>
            </div>
          </article>`;
      }).join('');
    } catch (error) {
      container.innerHTML = `<div class="msg-media-empty">Saved media could not be loaded.</div>`;
    }
  }

  document.addEventListener('marksetgo:media-search-start', (event) => {
    activeContext = currentContext(event.detail?.context);
    activeSearch = {
      query:String(event.detail?.query || ''),
      title:String(event.detail?.title || '')
    };
    searchResults = [];
    resultMetadata.clear();
    setPanelOpen(true);
    setStatus('Searching YouTube…');
    renderResults();
  });

  document.addEventListener('marksetgo:media-search-results', (event) => {
    const detail = event.detail || {};
    activeContext = currentContext(detail.context);
    activeSearch = {
      query:String(detail.query || ''),
      title:String(detail.title || '')
    };
    resultMetadata.clear();
    searchResults = (Array.isArray(detail.videoIds) ? detail.videoIds : [])
      .map((videoId, index) => resultFromId(videoId, index, detail));

    setPanelOpen(true);
    setStatus(`${searchResults.length} playable result${searchResults.length === 1 ? '' : 's'} found.`, true);
    renderResults();
    searchResults.forEach((item) => { void hydrateMetadata(item.videoId); });
  });

  document.addEventListener('marksetgo:media-search-error', (event) => {
    setPanelOpen(true);
    setStatus(event.detail?.error || 'Media search failed.', false);
  });

  document.addEventListener('marksetgo:media-playing', (event) => {
    currentPlaying = event.detail && typeof event.detail === 'object'
      ? { ...event.detail }
      : null;
    activeContext = currentContext(currentPlaying?.context);
    refreshContext(activeContext);
    const save = document.querySelector('#msg-media-save-current');
    if (save) save.disabled = !currentPlaying;
    if (panelOpen) {
      renderResults();
      void renderSaved();
    }
    if (mode === 'float' && floatPosition) {
      requestAnimationFrame(() => applyFloatDockGeometry());
    }
  });

  document.addEventListener('marksetgo:media-stopped', () => {
    currentPlaying = null;
    const save = document.querySelector('#msg-media-save-current');
    if (save) save.disabled = true;
  });

  document.addEventListener('marksetgo:reader-session-changed', () => {
    activeContext = currentContext();
    if (panelOpen) {
      refreshContext();
      void renderSaved();
      renderResults();
    }
  });

  installSameSourceRestartGuard();
  installUi();

  // Restore a dock mode preference only after the player is actually shown.
  // The class itself is harmless while hidden and does not force the player open.
  applyMode();

  window.MarkSetGoMediaPanel = Object.freeze({
    open:()=>setPanelOpen(true),
    close:()=>setPanelOpen(false),
    setMode:(value)=>saveMode(value),
    get mode(){ return mode; },
    get floatPosition(){ return floatPosition ? { ...floatPosition } : null; },
    resetFloatPosition:()=>resetFloatPosition(),
    saveCurrent:()=>currentPlaying ? saveItem(currentPlaying,currentPlaying.context) : false,
    getSaved:async()=>Array.isArray((await getMediaRecord(currentContext()))?.items)
      ? (await getMediaRecord(currentContext())).items
      : []
  });
})();
