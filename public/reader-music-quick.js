'use strict';

(() => {
  const PREFERRED_KEY = 'markSetGoPreferredMusic';
  const BOOK_MUSIC_KEY = 'markSetGoBookMusicV1';

  const QUICK_CHOICES = [
    { id:'lofi-study', category:'Reading moods', title:'Lofi Study Radio', type:'video', youtubeId:'jfKfPfyJRdk' },
    { id:'sleepy-lofi', category:'Reading moods', title:'Sleepy Lofi', type:'video', youtubeId:'rUxyKA_-grg' },
    { id:'classical-reading', category:'Reading moods', title:'Classical Reading', type:'playlist', youtubeId:'PLe4JMT6isxp-rx1IRUeEo0puoloL2N9NQ' },
    { id:'ambient-reading', category:'Reading moods', title:'Ambient Reading', type:'playlist', youtubeId:'OLAK5uy_nCi20x1Eo0ZW2q_cfufw06g2Bvn8a4u-c' },
    { id:'deep-focus', category:'Focus', title:'Deep Focus', type:'playlist', youtubeId:'PLUrnxvhuvpSU0b2YvM4Gf1V3bHnLAcvBj' },
    { id:'rain-focus', category:'Focus', title:'Rain & Focus', type:'playlist', youtubeId:'OLAK5uy_lN5SVZjZwWb3XM5BIKUreV5wRCD0VLsqQ' },
    { id:'anime-lofi', category:'Lofi', title:'Anime Lofi', type:'playlist', youtubeId:'PLApjonMF-0Y8uSA_-6ZbX1DIr-muc2nDg' },
    { id:'classical-piano', category:'Classical', title:'Classical Piano', type:'playlist', youtubeId:'PLgW6PU42e5RLa6NENfz5kusVilq58Cojm' }
  ];

  let chooser = null;
  let speedButton = null;
  let fontControl = null;
  let controllerSearchState = null;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  function preferredMusic() {
    const storeItems = window.MSGMusicStore?.getCached?.();
    if (Array.isArray(storeItems)) return storeItems;
    try {
      const saved = JSON.parse(localStorage.getItem(PREFERRED_KEY) || '[]');
      return Array.isArray(saved) ? saved.filter((item) => item && item.id && item.title) : [];
    } catch { return []; }
  }

  function currentReaderTitle() {
    try {
      const doc = window.MarkSetGoCurrentReaderDocument?.get?.();
      if (doc?.title) return String(doc.title).trim();
    } catch {}
    return String(document.querySelector('.reader-title-copy h1')?.textContent || '').trim();
  }

  function currentReaderDocument() {
    try {
      const doc = window.MarkSetGoCurrentReaderDocument?.get?.();
      if (doc?.title) {
        return {
          title: String(doc.title || '').trim(),
          text: String(doc.text || ''),
          source: doc.source && typeof doc.source === 'object' ? { ...doc.source } : {}
        };
      }
    } catch {}
    const title = currentReaderTitle();
    return title ? { title, text: '', source: {} } : null;
  }

  function currentReadingMusicSuggestions() {
    const doc = currentReaderDocument();
    if (!doc?.title) return null;

    try {
      const recommend = window.recommendedPlayerChoice;
      if (typeof recommend === 'function') {
        const result = recommend(doc.title, doc.text);
        if (result?.scoreQuery || result?.moodQuery) {
          return {
            title: doc.title,
            suggestedQuery: String(result.scoreQuery || `${doc.title} instrumental reading music`).trim(),
            moodQuery: String(result.moodQuery || `${doc.title} atmospheric instrumental reading music`).trim()
          };
        }
      }
    } catch {}

    const sample = `${doc.title} ${doc.text.slice(0, 10000)}`.toLowerCase();
    let moodQuery = `${doc.title} atmospheric instrumental reading music`;
    if (/mystery|detective|murder|crime|suspense|noir|sherlock|gothic|horror/.test(sample)) moodQuery = 'dark Victorian mystery ambience instrumental reading music';
    else if (/romance|courtship|love|regency|austen|bronte/.test(sample)) moodQuery = 'romantic period drama classical instrumental reading music';
    else if (/adventure|voyage|expedition|pirate|treasure|island|jungle/.test(sample)) moodQuery = 'cinematic adventure ambience instrumental reading music';
    else if (/war|battle|revolution|empire|army|soldier/.test(sample)) moodQuery = 'historical epic orchestral ambience reading music';
    else if (/philosoph|theology|ethics|history|science|politic|essay|treatise/.test(sample)) moodQuery = 'quiet scholarly classical instrumental deep reading music';

    return {
      title: doc.title,
      suggestedQuery: `${doc.title} soundtrack instrumental score`,
      moodQuery
    };
  }

  function musicKey(title) {
    return String(title || '').trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  }

  function attachedMusic() {
    const preferred = preferredMusic();
    const key = musicKey(currentReaderTitle());
    if (!key) return [];
    try {
      const map = JSON.parse(localStorage.getItem(BOOK_MUSIC_KEY) || '{}');
      const ids = Array.isArray(map?.[key]) ? map[key] : [];
      return ids.map((id) => preferred.find((item) => item.id === id)).filter(Boolean);
    } catch { return []; }
  }

  function playerParts() {
    return {
      dock: document.querySelector('#music-dock'),
      title: document.querySelector('#music-now-title'),
      source: document.querySelector('#music-now-source'),
      iframe: document.querySelector('#music-player'),
      wrap: document.querySelector('#music-player-wrap'),
      minimize: document.querySelector('#music-minimize'),
      next: document.querySelector('#music-next')
    };
  }

  function hasPlayback() {
    const { dock, iframe } = playerParts();
    return Boolean(dock && !dock.hidden && String(iframe?.getAttribute('src') || '').trim());
  }

  function youtubeEmbed(choice) {
    return choice.type === 'playlist'
      ? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(choice.youtubeId)}&playsinline=1&rel=0`
      : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(choice.youtubeId)}?playsinline=1&rel=0`;
  }

  function closeChooser({ keepDock = false, keepPosition = false } = {}) {
    const parts = playerParts();
    if (chooser) chooser.hidden = true;
    parts.dock?.classList.remove('reader-music-chooser-open');
    if (!keepPosition) resetChooserDockPosition();
    speedButton?.setAttribute('aria-expanded', 'false');
    if (!keepDock && parts.dock && !hasPlayback()) parts.dock.hidden = true;
  }

  function playInDock({ title, source, provider = '', src }) {
    controllerSearchState = null;
    const parts = playerParts();
    if (!parts.dock || !parts.iframe || !src) return;

    if (parts.title) parts.title.textContent = title || 'Music';
    if (parts.source) parts.source.textContent = source || 'Reading music';
    parts.iframe.src = src;
    parts.dock.hidden = false;
    parts.dock.classList.remove('minimized');
    if (parts.wrap) parts.wrap.hidden = false;
    if (parts.minimize) {
      parts.minimize.hidden = false;
      parts.minimize.textContent = '—';
      parts.minimize.setAttribute('aria-label', 'Minimize music player');
    }
    if (parts.next) {
      parts.next.hidden = true;
      delete parts.next.dataset.msgMusicControllerSearch;
    }

    try {
      localStorage.setItem('markSetGoMusic', JSON.stringify({
        title: title || 'Music', source: source || 'Reading music', provider, src
      }));
    } catch {}

    closeChooser({ keepDock: true, keepPosition: true });
    positionChooserDock();
  }

  function playControllerSearchCandidate(index) {
    const state = controllerSearchState;
    if (!state?.videoIds?.length) return false;
    const parts = playerParts();
    if (!parts.dock || !parts.iframe) return false;
    const safeIndex = ((Number(index) || 0) % state.videoIds.length + state.videoIds.length) % state.videoIds.length;
    state.index = safeIndex;
    const videoId = state.videoIds[safeIndex];
    if (parts.title) parts.title.textContent = state.title || 'Suggested music';
    if (parts.source) parts.source.textContent = `YouTube result ${safeIndex + 1} of ${state.videoIds.length}`;
    parts.iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&rel=0`;
    parts.dock.hidden = false;
    parts.dock.classList.remove('minimized');
    if (parts.wrap) parts.wrap.hidden = false;
    if (parts.minimize) {
      parts.minimize.hidden = false;
      parts.minimize.textContent = '—';
      parts.minimize.setAttribute('aria-label', 'Minimize music player');
    }
    if (parts.next) {
      parts.next.hidden = state.videoIds.length < 2;
      parts.next.dataset.msgMusicControllerSearch = '1';
    }
    try {
      localStorage.setItem('markSetGoMusic', JSON.stringify({
        title: state.title || 'Suggested music',
        source: 'YouTube search',
        provider: 'youtube',
        src: parts.iframe.src
      }));
    } catch {}
    closeChooser({ keepDock: true, keepPosition: true });
    positionChooserDock();
    return true;
  }

  async function requestYouTubeSearch(query, attempts = 3) {
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetch(
          `/api/youtube/search?q=${encodeURIComponent(query)}&_=${Date.now()}`,
          {
            method:'GET',
            credentials:'same-origin',
            cache:'no-store',
            headers:{ 'Accept':'application/json' }
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || `Music search failed (${response.status}).`);
        }

        const videoIds = Array.isArray(payload.videoIds)
          ? payload.videoIds
              .map((id) => String(id || '').trim())
              .filter((id) => /^[\w-]{6,20}$/.test(id))
          : [];

        if (!videoIds.length) throw new Error('No playable YouTube results were found.');
        return videoIds;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await new Promise((resolve) => window.setTimeout(resolve, 450 * attempt));
        }
      }
    }

    throw lastError || new Error('Video search is temporarily unavailable.');
  }

  async function searchYouTubeInMainPlayer(query, title = 'Suggested music') {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return false;

    const parts = playerParts();
    if (!parts.dock || !parts.iframe) return false;

    const previous = {
      title:String(parts.title?.textContent || ''),
      source:String(parts.source?.textContent || ''),
      src:String(parts.iframe.getAttribute('src') || ''),
      dockHidden:Boolean(parts.dock.hidden),
      wrapHidden:Boolean(parts.wrap?.hidden)
    };
    const hadPlayback = Boolean(previous.src);

    if (chooser && !chooser.hidden) {
      closeChooser({ keepDock:true, keepPosition:true });
    }

    if (speedButton) positionChooserDock();
    else resetChooserDockPosition();

    controllerSearchState = null;
    if (parts.title) parts.title.textContent = String(title || 'Suggested music');
    if (parts.source) parts.source.textContent = 'Searching YouTube…';

    // Do NOT clear a playing iframe while a lookup is in flight.
    parts.dock.hidden = false;
    parts.dock.classList.remove('minimized');
    if (parts.wrap) parts.wrap.hidden = false;
    if (parts.minimize) parts.minimize.hidden = false;
    if (parts.next) {
      parts.next.hidden = true;
      delete parts.next.dataset.msgMusicControllerSearch;
    }

    try {
      const videoIds = await requestYouTubeSearch(cleanQuery, 3);
      controllerSearchState = {
        query:cleanQuery,
        title:String(title || 'Suggested music'),
        videoIds,
        index:0
      };
      return playControllerSearchCandidate(0);
    } catch (error) {
      controllerSearchState = null;

      if (hadPlayback) {
        if (parts.title) parts.title.textContent = previous.title || 'Music';
        if (parts.source) parts.source.textContent =
          'Video search is temporarily unavailable — current media kept playing.';
        if (parts.iframe && parts.iframe.getAttribute('src') !== previous.src) {
          parts.iframe.src = previous.src;
        }
        if (parts.wrap) parts.wrap.hidden = previous.wrapHidden;
        parts.dock.hidden = previous.dockHidden;
      } else {
        if (parts.source) parts.source.textContent =
          'Video search is temporarily unavailable. Try again in a moment.';
        if (parts.iframe) parts.iframe.removeAttribute('src');
      }

      console.warn('Reader media search failed after retries.', error);
      return false;
    }
  }

  function readerFontSelect() {
    return document.querySelector('#app #font-size');
  }

  function adjustReaderFont(direction) {
    const select = readerFontSelect();
    if (!select) return;
    const sizes = [...select.options]
      .map((option) => Number(option.value))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (!sizes.length) return;
    const current = Number(select.value) || sizes[0];
    let index = sizes.findIndex((size) => size === current);
    if (index < 0) index = sizes.reduce((best, size, i) => Math.abs(size - current) < Math.abs(sizes[best] - current) ? i : best, 0);
    const next = sizes[Math.max(0, Math.min(sizes.length - 1, index + (direction < 0 ? -1 : 1)))];
    if (!Number.isFinite(next) || next === current) return;
    select.value = String(next);
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function ensureTopRightFontControl(stack) {
    if (!stack) return null;
    let control = stack.querySelector('.reader-topright-font-control');
    if (!control) {
      control = document.createElement('div');
      control.className = 'reader-topright-font-control';
      control.setAttribute('role', 'group');
      control.setAttribute('aria-label', 'Reader text size');
      control.innerHTML = `
        <button type="button" data-reader-font-step="down" aria-label="Decrease reader text size" title="Decrease text size">−</button>
        <span aria-hidden="true">|</span>
        <button type="button" data-reader-font-step="up" aria-label="Increase reader text size" title="Increase text size">+</button>`;
      control.querySelector('[data-reader-font-step="down"]')?.addEventListener('click', () => adjustReaderFont(-1));
      control.querySelector('[data-reader-font-step="up"]')?.addEventListener('click', () => adjustReaderFont(1));
    }
    fontControl = control;
    return control;
  }

  function suggestedMusicLink(event) {
    const link = event.target instanceof Element ? event.target.closest('a.book-music-link, .book-music-recommendations a') : null;
    if (!link) return null;
    try {
      const url = new URL(link.href, location.href);
      const query = url.searchParams.get('search_query') || url.searchParams.get('q') || '';
      if (!query) return null;
      return {
        link,
        query,
        title: String(link.textContent || 'Suggested music').replace(/^\s*♫\s*/, '').trim() || 'Suggested music'
      };
    } catch { return null; }
  }

  function playQuick(choice) {
    if (!choice) return;
    playInDock({
      title: choice.title,
      source: choice.category,
      provider: 'youtube',
      src: youtubeEmbed(choice)
    });
  }

  function playPreferred(item) {
    if (!item) return;
    if (item.choiceId) {
      const choice = QUICK_CHOICES.find((candidate) => candidate.id === item.choiceId);
      if (choice) return playQuick(choice);
    }
    if (item.src) {
      playInDock({
        title: item.title,
        source: item.source || 'Saved music',
        provider: item.provider || '',
        src: item.src
      });
    }
  }

  function resetChooserDockPosition() {
    const dock = playerParts().dock;
    if (!dock || dock.dataset.readerChooserPositioned !== '1') return;
    delete dock.dataset.readerChooserPositioned;
    ['top','right','bottom','left'].forEach((name) => dock.style.removeProperty(name));
  }

  function positionChooserDock() {
    const dock = playerParts().dock;
    if (!dock || !speedButton) return;
    const rect = speedButton.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right);
    const top = Math.max(8, rect.bottom + 8);
    dock.dataset.readerChooserPositioned = '1';
    dock.style.setProperty('left', 'auto', 'important');
    dock.style.setProperty('right', `${Math.round(right)}px`, 'important');
    dock.style.setProperty('top', `${Math.round(top)}px`, 'important');
    dock.style.setProperty('bottom', 'auto', 'important');
  }

  function ensureChooser() {
    const parts = playerParts();
    if (!parts.dock) return null;

    chooser = document.querySelector('#reader-music-wpm-chooser');
    if (!chooser) {
      chooser = document.createElement('div');
      chooser.id = 'reader-music-wpm-chooser';
      chooser.className = 'reader-wpm-music-chooser';
      chooser.hidden = true;

      const bar = parts.dock.querySelector('.music-dock-bar');
      if (bar?.nextSibling) parts.dock.insertBefore(chooser, bar.nextSibling);
      else parts.dock.appendChild(chooser);
    }
    return chooser;
  }

  function renderChooser() {
    if (!chooser) return;

    const attached = attachedMusic();
    const preferred = preferredMusic();
    const playing = hasPlayback();
    const readingSuggestions = currentReadingMusicSuggestions();

    const preferredOptions = preferred.length
      ? `<option value="">Choose a saved playlist…</option>${
          preferred.slice(0, 50).map((item) =>
            `<option value="${esc(item.id)}">${esc(item.title)}</option>`
          ).join('')
        }`
      : `<option value="" selected disabled>No saved playlists yet</option>`;

    const attachedOptions = attached.length
      ? `<option value="">Choose music for this reading…</option>${
          attached.map((item) =>
            `<option value="${esc(item.id)}">${esc(item.title)}</option>`
          ).join('')
        }`
      : '';

    chooser.innerHTML = `
      <div class="reader-music-compact">
        ${playing ? `
          <div class="reader-music-compact-now">
            <span>Now playing</span>
            <strong>${esc(document.querySelector('#music-now-title')?.textContent || 'Music')}</strong>
          </div>` : ''}

        <label class="reader-music-compact-field">
          <span>My saved playlists</span>
          <select data-wpm-music-preferred-select ${preferred.length ? '' : 'disabled'}>
            ${preferredOptions}
          </select>
        </label>

        ${attached.length ? `
          <label class="reader-music-compact-field">
            <span>For this reading</span>
            <select data-wpm-music-attached-select>
              ${attachedOptions}
            </select>
          </label>` : ''}

        ${readingSuggestions ? `
          <div class="reader-music-compact-suggestions">
            <span>Suggested for this reading</span>
            <small>${esc(readingSuggestions.title)}</small>
            <div>
              <button type="button" data-wpm-music-suggested>♫ Suggested music</button>
              <button type="button" data-wpm-music-mood>♫ Reading mood</button>
            </div>
          </div>` : ''}

        <label class="reader-music-compact-field">
          <span>Quick focus</span>
          <select data-wpm-music-quick-select>
            <option value="">Choose focus music…</option>
            ${QUICK_CHOICES.map((item) =>
              `<option value="${esc(item.id)}">${esc(item.title)}</option>`
            ).join('')}
          </select>
        </label>

        <button type="button" class="reader-music-compact-manage" data-wpm-music-manage>
          Manage Music &amp; Focus
        </button>
      </div>`;

    chooser.querySelector('[data-wpm-music-preferred-select]')?.addEventListener('change', (event) => {
      const id = event.target.value;
      if (!id) return;
      playPreferred(preferredMusic().find((item) => item.id === id));
      event.target.value = '';
    });

    chooser.querySelector('[data-wpm-music-attached-select]')?.addEventListener('change', (event) => {
      const id = event.target.value;
      if (!id) return;
      playPreferred(preferredMusic().find((item) => item.id === id));
      event.target.value = '';
    });

    chooser.querySelector('[data-wpm-music-suggested]')?.addEventListener('click', () => {
      if (!readingSuggestions?.suggestedQuery) return;
      closeChooser({ keepDock: true, keepPosition: true });
      void searchYouTubeInMainPlayer(readingSuggestions.suggestedQuery, `${readingSuggestions.title} — suggested music`);
    });

    chooser.querySelector('[data-wpm-music-mood]')?.addEventListener('click', () => {
      if (!readingSuggestions?.moodQuery) return;
      closeChooser({ keepDock: true, keepPosition: true });
      void searchYouTubeInMainPlayer(readingSuggestions.moodQuery, `${readingSuggestions.title} — reading mood`);
    });

    chooser.querySelector('[data-wpm-music-quick-select]')?.addEventListener('change', (event) => {
      const id = event.target.value;
      if (!id) return;
      playQuick(QUICK_CHOICES.find((item) => item.id === id));
      event.target.value = '';
    });

    chooser.querySelector('[data-wpm-music-manage]')?.addEventListener('click', () => {
      closeChooser();
      document.querySelector('[data-action="music"]')?.click();
    });
  }

  function openChooser() {
    const parts = playerParts();
    if (!parts.dock) return;

    ensureChooser();
    chooser.hidden = false;
    parts.dock.hidden = false;
    parts.dock.classList.add('reader-music-chooser-open');

    if (!hasPlayback()) {
      if (parts.wrap) parts.wrap.hidden = true;
      if (parts.minimize) parts.minimize.hidden = true;
      if (parts.title) parts.title.textContent = 'My Playlists';
      if (parts.source) parts.source.textContent = 'Reading music';
    }

    speedButton?.setAttribute('aria-expanded', 'true');
    renderChooser();
    positionChooserDock();
  }

  function removeLegacyWpmMusicControls() {
    document.querySelectorAll('#app .reader-viewer-footer [data-reader-wpm-music-toggle]').forEach((button) => {
      if (!button.closest('.reader-topright-media-stack')) button.remove();
    });

    document.querySelectorAll('#app .control [data-reader-wpm-music-toggle]').forEach((button) => {
      if (!button.closest('.reader-topright-media-stack')) button.remove();
    });

    document.querySelectorAll('#app .reader-viewer-music-stack').forEach((stack) => {
      const wpm = stack.querySelector('.viewer-wpm-control');
      if (wpm && stack.parentNode) stack.parentNode.insertBefore(wpm, stack);
      stack.remove();
    });

    document.querySelectorAll(
      '#app .reader-wpm-music-toggle:not(.reader-topright-music-toggle)'
    ).forEach((button) => {
      if (!button.closest('.reader-topright-media-stack')) button.remove();
    });
  }

  function insertTopRightMusicButton() {
    const paneControls = document.querySelector('#app .reader-pane-controls');
    const paneButtons = paneControls?.querySelector(':scope > .reader-pane-buttons') || paneControls?.querySelector('.reader-pane-buttons');
    const fullscreenButton = paneControls?.querySelector('#toggle-reader-fullscreen');
    if (!paneControls || !paneButtons || !fullscreenButton) {
      speedButton = null;
      fontControl = null;
      return;
    }

    paneControls.querySelectorAll('.reader-font-size-control, .reader-font-control, .reader-text-size-control, [data-reader-font-size-control], [data-reader-text-size-control], [role="group"][aria-label*="font size" i], [role="group"][aria-label*="text size" i]').forEach((node) => {
      if (!node.classList.contains('reader-topright-font-control')) node.remove();
    });

    let stack = paneControls.querySelector('.reader-topright-media-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'reader-topright-media-stack';
      stack.setAttribute('aria-label', 'Reader text, music, and fullscreen controls');
    }

    if (stack.parentElement !== paneButtons) paneButtons.appendChild(stack);

    const textSize = ensureTopRightFontControl(stack);

    let button = stack.querySelector('[data-reader-wpm-music-toggle]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'reader-topright-music-toggle';
      button.dataset.readerWpmMusicToggle = '1';
      button.setAttribute('aria-label', 'Open my reading playlists');
      button.setAttribute('aria-controls', 'reader-music-wpm-chooser');
      button.setAttribute('aria-expanded', 'false');
      button.title = 'My reading playlists';
      button.innerHTML = '<span aria-hidden="true">▶</span>';

      button.addEventListener('click', () => {
        ensureChooser();
        if (chooser && !chooser.hidden) closeChooser();
        else openChooser();
      });
    }

    if (textSize && textSize.parentElement !== stack) stack.appendChild(textSize);
    if (button.parentElement !== stack) stack.appendChild(button);
    if (fullscreenButton.parentElement !== stack) stack.appendChild(fullscreenButton);
    [textSize, button, fullscreenButton].filter(Boolean).forEach((node) => stack.appendChild(node));

    speedButton = button;
  }

  function sync() {
    if (!document.querySelector('#app #reader')) {
      speedButton = null;
      closeChooser();
      return;
    }

    removeLegacyWpmMusicControls();
    ensureChooser();
    insertTopRightMusicButton();
  }

  function init() {
    document.querySelectorAll(
      'body > .reader-music-quick-toggle, body > .reader-music-quick-panel'
    ).forEach((node) => node.remove());

    removeLegacyWpmMusicControls();
    ensureChooser();
    sync();

    [80, 250, 700, 1500].forEach((delay) => window.setTimeout(sync, delay));
    document.addEventListener('marksetgo:document-available', () => window.setTimeout(sync, 0));
    window.addEventListener('pageshow', () => window.setTimeout(sync, 0));
    window.addEventListener('resize', () => {
      const dock = playerParts().dock;
      if ((chooser && !chooser.hidden) || dock?.dataset.readerChooserPositioned === '1') positionChooserDock();
    });

    document.addEventListener('click', (event) => {
      const suggestion = suggestedMusicLink(event);
      if (suggestion) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void searchYouTubeInMainPlayer(suggestion.query, suggestion.title);
        return;
      }

      if (event.target instanceof Element && event.target.closest('[data-action="reader"], [data-action="home"], [data-action="music"]')) {
        window.setTimeout(sync, 80);
        window.setTimeout(sync, 260);
      }
    }, true);

    document.addEventListener('marksetgo:music-store-ready', () => {
      if (chooser && !chooser.hidden) renderChooser();
    });

    document.addEventListener('marksetgo:preferred-music-changed', () => {
      if (chooser && !chooser.hidden) renderChooser();
    });

    document.addEventListener('marksetgo:play-saved-focus-music', (event) => {
      const choice = QUICK_CHOICES.find((item) => item.id === event.detail?.choiceId);
      if (choice) playQuick(choice);
    });

    document.querySelector('#music-next')?.addEventListener('click', (event) => {
      if (!controllerSearchState?.videoIds?.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      playControllerSearchCandidate(controllerSearchState.index + 1);
    }, true);

    document.querySelector('#music-close')?.addEventListener('click', () => {
      controllerSearchState = null;
      if (chooser) chooser.hidden = true;
      speedButton?.setAttribute('aria-expanded', 'false');
      resetChooserDockPosition();
    });
  }

  window.MSGMusicController = Object.freeze({
    search: (query, title) => searchYouTubeInMainPlayer(query, title),
    syncControls: () => sync(),
    playQuick: (id) => playQuick(QUICK_CHOICES.find((choice) => choice.id === id))
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();
