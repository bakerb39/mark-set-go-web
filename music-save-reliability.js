'use strict';

(() => {
  const LEGACY_KEY = 'markSetGoPreferredMusic';
  const BOOK_KEY = 'markSetGoBookMusicV1';
  const DB_NAME = 'mark-set-go-music';
  const DB_VERSION = 1;
  const STORE_NAME = 'preferred-music';

  let dbPromise = null;
  let cache = [];
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function preferredId(item) {
    const source =
      item.choiceId ||
      item.src ||
      item.originalUrl ||
      item.title ||
      String(Date.now());

    let hash = 0;
    for (const char of String(source)) {
      hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    }
    return `preferred-${Math.abs(hash)}`;
  }

  function normalize(item) {
    if (!item?.title) return null;
    return {
      ...item,
      id: item.id || preferredId(item),
      title: String(item.title).trim(),
      source: String(item.source || '').trim(),
      provider: String(item.provider || '').trim(),
      src: String(item.src || '').trim(),
      originalUrl: String(item.originalUrl || '').trim(),
      choiceId: String(item.choiceId || '').trim(),
      savedAt: item.savedAt || new Date().toISOString()
    };
  }

  function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Music storage could not be opened.'));
    });

    return dbPromise;
  }

  async function getAllFromDb() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(
        Array.isArray(request.result)
          ? request.result.map(normalize).filter(Boolean)
          : []
      );
      request.onerror = () => reject(request.error || new Error('Saved music could not be read.'));
    });
  }

  async function putItem(item) {
    const next = normalize(item);
    if (!next) throw new Error('A playlist title is required.');

    const db = await openDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(next);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('The playlist could not be saved.'));
      transaction.onabort = () => reject(transaction.error || new Error('The playlist save was interrupted.'));
    });

    return next;
  }

  async function deleteItem(id) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('The playlist could not be deleted.'));
    });
  }

  function legacyItems() {
    try {
      const raw = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
      return Array.isArray(raw) ? raw.map(normalize).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  async function migrateLegacy() {
    const legacy = legacyItems();
    if (!legacy.length) return;

    const existing = await getAllFromDb();
    const seen = new Set(existing.map((item) => item.id));

    for (const item of legacy) {
      if (!seen.has(item.id)) await putItem(item);
    }

    // This is the important quota relief: once migration succeeds, My Music no
    // longer consumes the small localStorage bucket.
    try { localStorage.removeItem(LEGACY_KEY); } catch {}
  }

  async function refreshCache() {
    cache = await getAllFromDb();
    cache.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    return cache.slice();
  }

  function findDuplicate(item) {
    const next = normalize(item);
    return cache.find((saved) =>
      saved.id === next.id ||
      (next.choiceId && saved.choiceId === next.choiceId) ||
      (next.src && saved.src === next.src) ||
      (next.originalUrl && saved.originalUrl === next.originalUrl)
    );
  }

  async function add(item) {
    await ready;
    const next = normalize(item);
    if (!next) throw new Error('A playlist title is required.');

    const duplicate = findDuplicate(next);
    if (duplicate) return { item: duplicate, duplicate: true };

    const saved = await putItem(next);
    await refreshCache();

    document.dispatchEvent(new CustomEvent('marksetgo:preferred-music-changed', {
      detail: { item: saved, duplicate: false, count: cache.length }
    }));

    renderSavedList();
    return { item: saved, duplicate: false };
  }

  async function remove(id) {
    await ready;
    await deleteItem(id);
    await refreshCache();

    // Clean stale per-book links if possible. If localStorage itself is full,
    // removal still succeeds because the authoritative My Music record is IDB.
    try {
      const map = JSON.parse(localStorage.getItem(BOOK_KEY) || '{}');
      if (map && typeof map === 'object') {
        Object.keys(map).forEach((key) => {
          map[key] = (Array.isArray(map[key]) ? map[key] : []).filter((itemId) => itemId !== id);
        });
        localStorage.setItem(BOOK_KEY, JSON.stringify(map));
      }
    } catch {}

    document.dispatchEvent(new CustomEvent('marksetgo:preferred-music-changed', {
      detail: { removedId: id, count: cache.length }
    }));

    renderSavedList();
  }

  function parseSpotify(raw) {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'open.spotify.com') {
      throw new Error('Use an open.spotify.com playlist, album, track, artist, show, or episode link.');
    }

    const parts = url.pathname.split('/').filter(Boolean);
    const offset = parts[0]?.startsWith('intl-') ? 1 : 0;
    const type = parts[offset];
    const id = parts[offset + 1];
    const allowed = new Set(['playlist', 'album', 'track', 'artist', 'show', 'episode']);

    if (!allowed.has(type) || !id || !/^[A-Za-z0-9]+$/.test(id)) {
      throw new Error('That Spotify link is not supported.');
    }

    const labels = {
      playlist: 'Spotify playlist',
      album: 'Spotify album',
      track: 'Spotify track',
      artist: 'Spotify artist',
      show: 'Spotify show',
      episode: 'Spotify episode'
    };

    return {
      title: labels[type],
      provider: 'spotify',
      source: 'Spotify',
      originalUrl: `https://open.spotify.com/${type}/${id}`,
      src: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`
    };
  }

  function parseYouTube(raw) {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');

    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) {
      throw new Error('Use a Spotify or YouTube link.');
    }

    const list = url.searchParams.get('list');
    if (list) {
      return {
        title: 'YouTube playlist',
        provider: 'youtube',
        source: 'YouTube',
        originalUrl: raw,
        src: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}&playsinline=1&rel=0`
      };
    }

    let videoId = host === 'youtu.be'
      ? url.pathname.split('/').filter(Boolean)[0]
      : url.searchParams.get('v');

    if (!videoId && url.pathname.startsWith('/shorts/')) videoId = url.pathname.split('/')[2];
    if (!videoId && url.pathname.startsWith('/embed/')) videoId = url.pathname.split('/')[2];

    if (!videoId || !/^[\w-]{6,20}$/.test(videoId)) {
      throw new Error('That link does not contain a recognizable YouTube video or playlist.');
    }

    return {
      title: 'YouTube video',
      provider: 'youtube',
      source: 'YouTube',
      originalUrl: raw,
      src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?playsinline=1&rel=0`
    };
  }

  function parseFormMusic() {
    const raw = String(document.querySelector('#music-service-url')?.value || '').trim();
    if (!raw) throw new Error('Paste a Spotify or YouTube link first.');

    let url;
    try { url = new URL(raw); }
    catch { throw new Error('Enter a valid Spotify or YouTube URL.'); }

    const parsed = url.hostname.toLowerCase().includes('spotify.com')
      ? parseSpotify(raw)
      : parseYouTube(raw);

    const customName = String(document.querySelector('#music-service-name')?.value || '').trim();
    if (customName) parsed.title = customName;
    return parsed;
  }

  function playItem(item) {
    if (!item) return;

    const dock = document.querySelector('#music-dock');
    const iframe = document.querySelector('#music-player');
    if (!dock || !iframe) return;

    let src = item.src;

    // Built-in focus choices store only choiceId. The Reader quick-music script
    // knows those exact choices and can handle them through its normal path.
    if (!src && item.choiceId) {
      document.dispatchEvent(new CustomEvent('marksetgo:play-saved-focus-music', {
        detail: { choiceId: item.choiceId }
      }));
      return;
    }

    if (!src) return;

    const title = document.querySelector('#music-now-title');
    const source = document.querySelector('#music-now-source');
    const wrap = document.querySelector('#music-player-wrap');
    const minimize = document.querySelector('#music-minimize');

    if (title) title.textContent = item.title || 'Music';
    if (source) source.textContent = item.source || (item.provider === 'spotify' ? 'Spotify' : 'YouTube');
    iframe.src = src;
    dock.hidden = false;
    dock.classList.remove('minimized');
    if (wrap) wrap.hidden = false;
    if (minimize) minimize.hidden = false;
  }

  function currentBookIds() {
    try {
      const title = String(
        window.MarkSetGoCurrentReaderDocument?.get?.()?.title ||
        document.querySelector('.reader-title-copy h1')?.textContent ||
        ''
      ).trim();

      if (!title) return [];

      const key = title.toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120);

      const map = JSON.parse(localStorage.getItem(BOOK_KEY) || '{}');
      return Array.isArray(map?.[key]) ? map[key] : [];
    } catch {
      return [];
    }
  }

  function renderSavedList() {
    const list = document.querySelector('#preferred-music-list');
    if (!list) return;

    const bookIds = currentBookIds();

    list.innerHTML = cache.length
      ? cache.map((item) => `
          <article class="preferred-music-item music-saved-item" data-idb-music-item="${esc(item.id)}">
            <div class="music-saved-info">
              <span class="music-provider-badge">${esc(item.provider === 'spotify' ? 'Spotify' : 'YouTube')}</span>
              <strong>${esc(item.title)}</strong>
              ${bookIds.includes(item.id) ? '<small>Saved for this book</small>' : ''}
            </div>
            <div class="preferred-music-actions">
              <button class="primary" type="button" data-idb-play-preferred="${esc(item.id)}">Play</button>
              <button class="text-button danger-text" type="button" data-idb-remove-preferred="${esc(item.id)}">Delete</button>
            </div>
          </article>
        `).join('')
      : '<div class="music-empty-state"><strong>No saved music yet</strong><span>Paste a Spotify or YouTube link above, then choose “Save to My Music.”</span></div>';
  }

  async function saveFormToMyMusic() {
    const status = document.querySelector('#music-service-status');
    const button = document.querySelector('#save-music-preferred');

    try {
      const parsed = parseFormMusic();
      const result = await add(parsed);

      if (status) {
        status.className = 'status';
        status.textContent = result.duplicate
          ? `“${parsed.title}” is already in My Music.`
          : `Saved “${parsed.title}” to My Music.`;
      }

      if (button) {
        button.textContent = result.duplicate ? 'Already saved ✓' : 'Saved ✓';
        window.setTimeout(() => {
          if (button.isConnected) button.textContent = 'Save to My Music';
        }, 1200);
      }
    } catch (error) {
      if (status) {
        status.className = 'status error';
        status.textContent = error?.message || 'The playlist could not be saved.';
      }
    }
  }

  function installDelegatedUi() {
    // Capture phase prevents the old localStorage handlers in app.js from
    // running for the same buttons.
    document.addEventListener('click', (event) => {
      const saveFormButton = event.target.closest?.('#save-music-preferred');
      if (saveFormButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void saveFormToMyMusic();
        return;
      }

      const builtInSave = event.target.closest?.('[data-save-music]');
      if (builtInSave) {
        event.preventDefault();
        event.stopImmediatePropagation();

        const choiceId = builtInSave.dataset.saveMusic;
        const article = builtInSave.closest('article');
        const title = String(article?.querySelector('strong')?.textContent || 'Focus music').trim();

        void add({
          title,
          source: 'Focus music',
          provider: 'youtube',
          choiceId
        }).then(({ duplicate }) => {
          builtInSave.textContent = duplicate ? 'Saved' : 'Saved ✓';
          builtInSave.disabled = true;
        }).catch(() => {});
        return;
      }

      const play = event.target.closest?.('[data-idb-play-preferred], [data-play-preferred]');
      if (play) {
        const id = play.dataset.idbPlayPreferred || play.dataset.playPreferred;
        const item = cache.find((saved) => saved.id === id);
        if (item) {
          event.preventDefault();
          event.stopImmediatePropagation();
          playItem(item);
        }
        return;
      }

      const removeButton = event.target.closest?.('[data-idb-remove-preferred], [data-remove-preferred]');
      if (removeButton) {
        const id = removeButton.dataset.idbRemovePreferred || removeButton.dataset.removePreferred;
        const item = cache.find((saved) => saved.id === id);
        if (item) {
          event.preventDefault();
          event.stopImmediatePropagation();
          void remove(id);
        }
      }
    }, true);

    document.addEventListener('click', (event) => {
      if (!event.target.closest?.('[data-action="music"]')) return;
      [0, 80, 220].forEach((delay) => window.setTimeout(renderSavedList, delay));
    }, true);
    window.addEventListener('pageshow', () => window.setTimeout(renderSavedList, 0));
  }

  window.MSGMusicStore = Object.freeze({
    ready,
    getCached: () => cache.slice(),
    getAll: async () => {
      await ready;
      return cache.slice();
    },
    add,
    remove,
    refresh: async () => {
      await refreshCache();
      renderSavedList();
      return cache.slice();
    }
  });

  async function init() {
    try {
      await openDb();
      await migrateLegacy();
      await refreshCache();

      // Ensure the failed legacy key is gone even if it contained malformed data.
      try { localStorage.removeItem(LEGACY_KEY); } catch {}

      installDelegatedUi();
      renderSavedList();

      document.dispatchEvent(new CustomEvent('marksetgo:music-store-ready', {
        detail: { count: cache.length }
      }));
    } catch (error) {
      console.error('IndexedDB music store could not initialize:', error);
    } finally {
      readyResolve();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
