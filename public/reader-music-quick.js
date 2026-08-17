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
      const started = playerApi()?.playSuggestedForCurrentReading?.();
      if (started) closeChooser({ keepDock: true });
    });

    chooser.querySelector('[data-wpm-music-mood]')?.addEventListener('click', () => {
      const started = playerApi()?.playReadingMoodForCurrentReading?.();
      if (started) closeChooser({ keepDock: true });
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


  function changeReaderFont(delta) {
    const select = document.querySelector('#app #font-size');
    if (!select) return;

    const values = Array.from(select.options || [])
      .map((option) => Number(option.value))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    const current = Number(select.value) || 14;
    let next = current;

    if (values.length) {
      next = delta > 0
        ? (values.find((value) => value > current) ?? values[values.length - 1])
        : ([...values].reverse().find((value) => value < current) ?? values[0]);
    } else {
      next = Math.max(10, Math.min(40, current + delta * 2));
    }

    if (next === current) return;

    select.value = String(next);
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const fullscreenSelect = document.querySelector('#app #fs-font-size');
    if (fullscreenSelect) fullscreenSelect.value = String(next);
  }

  function bindKeyboardActivation(node, action) {
    if (!node || node.dataset.quickBound === '1') return;
    node.dataset.quickBound = '1';

    node.addEventListener('click', action);
    node.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      action();
    });
  }

  function insertTopRightMusicButton() {
    const paneControls = document.querySelector('#app .reader-pane-controls');
    const fullscreenButton = paneControls?.querySelector('#toggle-reader-fullscreen');

    if (!paneControls || !fullscreenButton) {
      speedButton = null;
      return;
    }

    // Remove only legacy wrappers. The current compact toolbar must be reused,
    // not destroyed/recreated on every MutationObserver sync.
    paneControls.querySelectorAll('.reader-topright-media-stack, .reader-quick-tools')
      .forEach((node) => {
        if (node.contains(fullscreenButton)) {
          node.parentNode?.insertBefore(fullscreenButton, node);
        }
        node.remove();
      });

    // Keep one hidden real music trigger for existing chooser behavior.
    let musicButton = paneControls.querySelector('[data-reader-wpm-music-toggle]');
    if (!musicButton) {
      musicButton = document.createElement('button');
      musicButton.type = 'button';
      musicButton.className = 'reader-topright-music-toggle';
      musicButton.dataset.readerWpmMusicToggle = '1';
      musicButton.setAttribute('aria-label', 'Open my reading playlists');
      musicButton.setAttribute('aria-controls', 'reader-music-wpm-chooser');
      musicButton.setAttribute('aria-expanded', 'false');
      musicButton.title = 'My reading playlists';
      musicButton.innerHTML = '<span aria-hidden="true">♫</span>';

      musicButton.addEventListener('click', () => {
        ensureChooser();
        if (chooser && !chooser.hidden) closeChooser();
        else openChooser();
      });

      paneControls.appendChild(musicButton);
    }

    [
      ['position', 'absolute'],
      ['width', '1px'],
      ['height', '1px'],
      ['padding', '0'],
      ['margin', '-1px'],
      ['overflow', 'hidden'],
      ['clip', 'rect(0 0 0 0)'],
      ['clip-path', 'inset(50%)'],
      ['white-space', 'nowrap'],
      ['border', '0']
    ].forEach(([property, value]) => musicButton.style.setProperty(property, value, 'important'));

    // Build the visible toolbar once, then reuse the same DOM node.
    let toolbar = paneControls.querySelector(':scope > .reader-compact-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'reader-compact-toolbar';
      toolbar.setAttribute('aria-label', 'Reader quick controls');
      toolbar.innerHTML = `
        <span class="reader-font-group" aria-label="Reader font size">
          <span class="reader-toolbar-action" data-reader-font-decrease role="button" tabindex="0" aria-label="Decrease reader font size" title="Smaller text">−</span>
          <span class="reader-font-separator" aria-hidden="true"></span>
          <span class="reader-toolbar-action" data-reader-font-increase role="button" tabindex="0" aria-label="Increase reader font size" title="Larger text">+</span>
        </span>
        <span class="reader-toolbar-separator" aria-hidden="true"></span>
        <span class="reader-toolbar-action reader-toolbar-music" data-reader-music-proxy role="button" tabindex="0" aria-label="Open reading music" title="Reading music">♫</span>
      `;
      paneControls.appendChild(toolbar);
    }

    bindKeyboardActivation(toolbar.querySelector('[data-reader-font-decrease]'), () => changeReaderFont(-1));
    bindKeyboardActivation(toolbar.querySelector('[data-reader-font-increase]'), () => changeReaderFont(1));
    bindKeyboardActivation(toolbar.querySelector('[data-reader-music-proxy]'), () => musicButton.click());

    paneControls.style.setProperty('position', 'relative', 'important');
    paneControls.style.setProperty('overflow', 'visible', 'important');

    // OUTER TOOLBAR: exact visual spacing target
    toolbar.style.setProperty('position', 'absolute', 'important');
    toolbar.style.setProperty('display', 'inline-flex', 'important');
    toolbar.style.setProperty('align-items', 'center', 'important');
    toolbar.style.setProperty('height', '34px', 'important');
    toolbar.style.setProperty('padding', '0', 'important');
    toolbar.style.setProperty('margin', '0', 'important');
    toolbar.style.setProperty('background', 'transparent', 'important');
    toolbar.style.setProperty('border', '0', 'important');
    toolbar.style.setProperty('box-shadow', 'none', 'important');
    toolbar.style.setProperty('white-space', 'nowrap', 'important');
    toolbar.style.setProperty('z-index', '40', 'important');

    // FONT GROUP: [ − | + ]
    const fontGroup = toolbar.querySelector('.reader-font-group');
    fontGroup.style.setProperty('display', 'inline-flex', 'important');
    fontGroup.style.setProperty('align-items', 'center', 'important');
    fontGroup.style.setProperty('height', '34px', 'important');
    fontGroup.style.setProperty('padding', '0 10px', 'important');
    fontGroup.style.setProperty('border-radius', '8px', 'important');
    fontGroup.style.setProperty('background', '#0b2e4f', 'important');
    fontGroup.style.setProperty('border', '1px solid rgba(255,255,255,.08)', 'important');
    fontGroup.style.setProperty('box-shadow', '0 2px 7px rgba(10,30,50,.22)', 'important');

    const minus = toolbar.querySelector('[data-reader-font-decrease]');
    const plus = toolbar.querySelector('[data-reader-font-increase]');

    [minus, plus].forEach((item) => {
      item.style.setProperty('display', 'inline-flex', 'important');
      item.style.setProperty('align-items', 'center', 'important');
      item.style.setProperty('justify-content', 'center', 'important');
      item.style.setProperty('width', '20px', 'important');
      item.style.setProperty('height', '34px', 'important');
      item.style.setProperty('padding', '0', 'important');
      item.style.setProperty('margin', '0', 'important');
      item.style.setProperty('border', '0', 'important');
      item.style.setProperty('background', 'transparent', 'important');
      item.style.setProperty('color', '#ffffff', 'important');
      item.style.setProperty('-webkit-text-fill-color', '#ffffff', 'important');
      item.style.setProperty('font-size', '15px', 'important');
      item.style.setProperty('font-weight', '600', 'important');
      item.style.setProperty('line-height', '1', 'important');
      item.style.setProperty('cursor', 'pointer', 'important');
      item.style.setProperty('user-select', 'none', 'important');
      item.style.setProperty('opacity', '1', 'important');
      item.style.setProperty('filter', 'none', 'important');
      item.style.setProperty('text-shadow', 'none', 'important');
    });

    // Inner divider is a real neutral line, not a text glyph.
    const innerSeparator = toolbar.querySelector('.reader-font-separator');
    innerSeparator.style.setProperty('display', 'block', 'important');
    innerSeparator.style.setProperty('width', '1px', 'important');
    innerSeparator.style.setProperty('height', '16px', 'important');
    innerSeparator.style.setProperty('margin', '0 8px', 'important');
    innerSeparator.style.setProperty('background', 'rgba(255,255,255,.62)', 'important');
    innerSeparator.style.setProperty('flex', '0 0 1px', 'important');
    innerSeparator.style.setProperty('pointer-events', 'none', 'important');

    // Outer divider is also a real neutral line.
    const outerSeparator = toolbar.querySelector('.reader-toolbar-separator');
    outerSeparator.style.setProperty('display', 'block', 'important');
    outerSeparator.style.setProperty('width', '1px', 'important');
    outerSeparator.style.setProperty('height', '18px', 'important');
    outerSeparator.style.setProperty('margin', '0 14px', 'important');
    outerSeparator.style.setProperty('background', '#9aa3ad', 'important');
    outerSeparator.style.setProperty('flex', '0 0 1px', 'important');
    outerSeparator.style.setProperty('pointer-events', 'none', 'important');

    const musicProxy = toolbar.querySelector('.reader-toolbar-music');
    musicProxy.style.setProperty('display', 'inline-flex', 'important');
    musicProxy.style.setProperty('align-items', 'center', 'important');
    musicProxy.style.setProperty('justify-content', 'center', 'important');
    musicProxy.style.setProperty('width', '22px', 'important');
    musicProxy.style.setProperty('height', '34px', 'important');
    musicProxy.style.setProperty('padding', '0', 'important');
    musicProxy.style.setProperty('margin', '0', 'important');
    musicProxy.style.setProperty('border', '0', 'important');
    musicProxy.style.setProperty('background', 'transparent', 'important');
    musicProxy.style.setProperty('color', '#0b2e4f', 'important');
    musicProxy.style.setProperty('-webkit-text-fill-color', '#0b2e4f', 'important');
    musicProxy.style.setProperty('font-size', '15px', 'important');
    musicProxy.style.setProperty('font-weight', '600', 'important');
    musicProxy.style.setProperty('line-height', '1', 'important');
    musicProxy.style.setProperty('cursor', 'pointer', 'important');
    musicProxy.style.setProperty('user-select', 'none', 'important');
    musicProxy.style.setProperty('opacity', '1', 'important');
    musicProxy.style.setProperty('filter', 'none', 'important');
    musicProxy.style.setProperty('text-shadow', 'none', 'important');

    // Deliberate visual spacing before Full screen.
    const controlsRect = paneControls.getBoundingClientRect();
    const fullscreenRect = fullscreenButton.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const gapToFullscreen = 22;

    const left = Math.max(
      0,
      fullscreenRect.left - controlsRect.left - toolbarRect.width - gapToFullscreen
    );
    const top =
      fullscreenRect.top - controlsRect.top +
      (fullscreenRect.height - toolbarRect.height) / 2;

    toolbar.style.setProperty('left', `${Math.round(left)}px`, 'important');
    toolbar.style.setProperty('right', 'auto', 'important');
    toolbar.style.setProperty('top', `${Math.round(top)}px`, 'important');
    toolbar.style.setProperty('bottom', 'auto', 'important');

    speedButton = musicButton;
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
      let syncQueued = false;
      const queueSync = () => {
        if (syncQueued) return;
        syncQueued = true;
        window.requestAnimationFrame(() => {
          syncQueued = false;
          sync();
        });
      };

      new MutationObserver((mutations) => {
        const relevant = mutations.some((mutation) => {
          const target = mutation.target?.nodeType === 1 ? mutation.target : mutation.target?.parentElement;
          if (!target) return true;

          if (
            target.closest?.('.reader-compact-toolbar') ||
            target.closest?.('#reader-music-wpm-chooser') ||
            target.closest?.('#music-dock')
          ) {
            return false;
          }

          return true;
        });

        if (relevant) queueSync();
      }).observe(app, { childList:true, subtree:true });
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
