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

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  function preferredMusic() {
    const storeItems = window.MSGMusicStore?.getCached?.();
    if (Array.isArray(storeItems)) return storeItems;

    // Legacy fallback only while the IndexedDB store is still initializing.
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


  function playerApi() {
    return window.MarkSetGoMusicPlayer || null;
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

  function closeChooser({ keepDock = false } = {}) {
    const parts = playerParts();
    if (chooser) chooser.hidden = true;
    parts.dock?.classList.remove('reader-music-chooser-open');
    speedButton?.setAttribute('aria-expanded', 'false');
    if (!keepDock && parts.dock && !hasPlayback()) parts.dock.hidden = true;
  }

  function playInDock({ title, source, provider = '', src }) {
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
    if (parts.next) parts.next.hidden = true;

    try {
      localStorage.setItem('markSetGoMusic', JSON.stringify({
        title: title || 'Music', source: source || 'Reading music', provider, src
      }));
    } catch {}

    closeChooser({ keepDock: true });
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

        ${currentReaderTitle() ? `
          <div class="reader-music-compact-field">
            <span>Suggested for this reading</span>
            <div style="display:flex;gap:.4rem;flex-wrap:wrap">
              <button type="button" class="reader-music-compact-manage" data-wpm-music-suggested>
                ♫ Play suggestion
              </button>
              <button type="button" class="reader-music-compact-manage" data-wpm-music-mood>
                ◇ Reading mood
              </button>
              <button type="button" class="reader-music-compact-manage" data-wpm-music-next-result
                ${playerApi()?.getState?.().hasSearchResults ? '' : 'disabled'}
                title="Try another result from the current recommendation">
                ↻ Other result
              </button>
            </div>
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

    chooser.querySelector('[data-wpm-music-quick-select]')?.addEventListener('change', (event) => {
      const id = event.target.value;
      if (!id) return;
      playQuick(QUICK_CHOICES.find((item) => item.id === id));
      event.target.value = '';
    });


    chooser.querySelector('[data-wpm-music-suggested]')?.addEventListener('click', () => {
      playerApi()?.playSuggestedForCurrentReading?.();
      closeChooser({ keepDock: true });
    });

    chooser.querySelector('[data-wpm-music-mood]')?.addEventListener('click', () => {
      playerApi()?.playReadingMoodForCurrentReading?.();
      closeChooser({ keepDock: true });
    });

    chooser.querySelector('[data-wpm-music-next-result]')?.addEventListener('click', () => {
      if (playerApi()?.nextResult?.()) {
        // Keep the chooser open so the reader can continue cycling if desired.
        renderChooser();
      }
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
  }

  function removeLegacyWpmMusicControls() {
    // Previous releases placed the music button under the visible WPM stepper
    // and, even earlier, beneath the hidden #speed field. Remove either shape
    // every time the Reader DOM is rebuilt so only the top-right control exists.

    document.querySelectorAll('#app .reader-viewer-footer [data-reader-wpm-music-toggle]').forEach((button) => {
      if (!button.closest('.reader-topright-media-stack')) button.remove();
    });

    document.querySelectorAll('#app .control [data-reader-wpm-music-toggle]').forEach((button) => {
      if (!button.closest('.reader-topright-media-stack')) button.remove();
    });

    document.querySelectorAll('#app .reader-viewer-music-stack').forEach((stack) => {
      const wpm = stack.querySelector('.viewer-wpm-control');
      if (wpm && stack.parentNode) {
        stack.parentNode.insertBefore(wpm, stack);
      }
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
    const fullscreenButton = paneControls?.querySelector('#toggle-reader-fullscreen');
    if (!paneControls || !fullscreenButton) {
      speedButton = null;
      return;
    }

    let stack = paneControls.querySelector('.reader-topright-media-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'reader-topright-media-stack';
      stack.setAttribute('aria-label', 'Reader media and fullscreen controls');

      // Move the existing fullscreen DOM node into this wrapper. Moving the node
      // preserves app.js's already-bound fullscreen click handler.
      fullscreenButton.parentNode.insertBefore(stack, fullscreenButton);
      stack.appendChild(fullscreenButton);
    } else if (!stack.contains(fullscreenButton)) {
      stack.appendChild(fullscreenButton);
    }

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
      button.innerHTML = '<span aria-hidden="true">♫</span>';

      button.addEventListener('click', () => {
        ensureChooser();
        if (chooser && !chooser.hidden) closeChooser();
        else openChooser();
      });
    }

    // IMPORTANT: enforce the DOM order on EVERY Reader render.
    // Older versions could leave Full screen before Music. Merely changing CSS
    // then preserved that stale child order. Always make Music the first child
    // and Full screen the second child.
    if (stack.firstElementChild !== button) {
      stack.insertBefore(button, stack.firstElementChild);
    }
    if (button.nextElementSibling !== fullscreenButton) {
      stack.insertBefore(fullscreenButton, button.nextElementSibling);
    }

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

    // Clean up every prior Reader-music placement before creating the current
    // top-right control.
    removeLegacyWpmMusicControls();

    ensureChooser();
    sync();

    const app = document.querySelector('#app');
    if (app) {
      new MutationObserver(() => window.setTimeout(sync, 0))
        .observe(app, { childList:true, subtree:true });
    }

    document.addEventListener('marksetgo:document-available', () => window.setTimeout(sync, 0));


    document.addEventListener('marksetgo:music-player-updated', () => {
      if (chooser && !chooser.hidden) renderChooser();
    });

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

    document.querySelector('#music-close')?.addEventListener('click', () => {
      if (chooser) chooser.hidden = true;
      speedButton?.setAttribute('aria-expanded', 'false');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();
