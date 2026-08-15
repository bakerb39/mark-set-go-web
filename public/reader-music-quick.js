'use strict';

(() => {
  const PREFERRED_KEY = 'markSetGoPreferredMusic';
  const BOOK_MUSIC_KEY = 'markSetGoBookMusicV1';
  const PANEL_OPEN_KEY = 'markSetGoReaderMusicQuickOpen';

  // Mirrors the existing app.js music catalog so this add-on can use the same
  // existing playMusic() player without modifying app.js or Reader core.
  const QUICK_CHOICES = [
    {
      id: 'lofi-study',
      category: 'Reading moods',
      title: 'Lofi Study Radio',
      description: 'Steady instrumental beats for reading and concentration.',
      type: 'video',
      youtubeId: 'jfKfPfyJRdk',
      searchQuery: 'Lofi Girl lofi hip hop radio beats to relax study to'
    },
    {
      id: 'sleepy-lofi',
      category: 'Reading moods',
      title: 'Sleepy Lofi',
      description: 'Slower, softer lofi for calm evening reading.',
      type: 'video',
      youtubeId: 'rUxyKA_-grg',
      searchQuery: 'Lofi Girl beats to sleep chill to'
    },
    {
      id: 'classical-reading',
      category: 'Reading moods',
      title: 'Classical Reading',
      description: 'A long classical playlist for books and study.',
      type: 'playlist',
      youtubeId: 'PLe4JMT6isxp-rx1IRUeEo0puoloL2N9NQ'
    },
    {
      id: 'ambient-reading',
      category: 'Reading moods',
      title: 'Ambient Reading',
      description: 'Relaxing ambient instrumentals for concentration.',
      type: 'playlist',
      youtubeId: 'OLAK5uy_nCi20x1Eo0ZW2q_cfufw06g2Bvn8a4u-c'
    },
    {
      id: 'deep-focus',
      category: 'Focus',
      title: 'Deep Focus',
      description: 'Low-distraction ambient music for sustained focus.',
      type: 'playlist',
      youtubeId: 'PLUrnxvhuvpSU0b2YvM4Gf1V3bHnLAcvBj'
    },
    {
      id: 'rain-focus',
      category: 'Focus',
      title: 'Rain & Focus',
      description: 'Rain and nature sounds for quiet reading.',
      type: 'playlist',
      youtubeId: 'OLAK5uy_lN5SVZjZwWb3XM5BIKUreV5wRCD0VLsqQ'
    },
    {
      id: 'anime-lofi',
      category: 'Lofi',
      title: 'Anime Lofi',
      description: 'Relaxed anime-inspired lofi beats.',
      type: 'playlist',
      youtubeId: 'PLApjonMF-0Y8uSA_-6ZbX1DIr-muc2nDg'
    },
    {
      id: 'classical-piano',
      category: 'Classical',
      title: 'Classical Piano',
      description: 'Familiar piano and orchestral selections.',
      type: 'playlist',
      youtubeId: 'PLgW6PU42e5RLa6NENfz5kusVilq58Cojm'
    }
  ];

  let launcher = null;
  let panel = null;
  let appObserver = null;
  let dockObserver = null;
  let resizeTimer = 0;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function readerIsVisible() {
    return Boolean(document.querySelector('#app #reader'));
  }

  function currentReaderTitle() {
    try {
      const doc = window.MarkSetGoCurrentReaderDocument?.get?.();
      if (doc?.title) return String(doc.title).trim();
    } catch {}

    return String(
      document.querySelector('.reader-title-copy h1')?.textContent || ''
    ).trim();
  }

  function musicKeyForTitle(title) {
    return String(title || '')
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
  }

  function preferredMusic() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFERRED_KEY) || '[]');
      return Array.isArray(saved)
        ? saved.filter((item) => item && item.id && item.title)
        : [];
    } catch {
      return [];
    }
  }

  function bookMusicMap() {
    try {
      const saved = JSON.parse(localStorage.getItem(BOOK_MUSIC_KEY) || '{}');
      return saved && typeof saved === 'object' && !Array.isArray(saved)
        ? saved
        : {};
    } catch {
      return {};
    }
  }

  function musicForCurrentReading() {
    const preferred = preferredMusic();
    const key = musicKeyForTitle(currentReaderTitle());
    if (!key) return [];

    const ids = Array.isArray(bookMusicMap()[key]) ? bookMusicMap()[key] : [];
    return ids.map((id) => preferred.find((item) => item.id === id)).filter(Boolean);
  }

  function nowPlaying() {
    const dock = document.querySelector('#music-dock');
    const iframe = document.querySelector('#music-player');
    const src = String(iframe?.getAttribute('src') || '').trim();
    if (!dock || dock.hidden || !src) return null;

    return {
      title: String(document.querySelector('#music-now-title')?.textContent || 'Music').trim(),
      source: String(document.querySelector('#music-now-source')?.textContent || '').trim(),
      minimized: dock.classList.contains('minimized')
    };
  }

  function setPanelOpen(open, { persist = true } = {}) {
    if (!panel || !launcher) return;
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
    launcher.classList.toggle('is-open', open);
    if (persist) {
      try { localStorage.setItem(PANEL_OPEN_KEY, open ? '1' : '0'); } catch {}
    }
    if (open) renderPanel();
    updateDockOffset();
  }

  function savedPanelPreference() {
    try { return localStorage.getItem(PANEL_OPEN_KEY) === '1'; }
    catch { return false; }
  }

  function createUi() {
    if (launcher && panel) return;

    launcher = document.createElement('button');
    launcher.id = 'reader-music-quick-toggle';
    launcher.className = 'reader-music-quick-toggle';
    launcher.type = 'button';
    launcher.hidden = true;
    launcher.setAttribute('aria-label', 'Open reading music');
    launcher.setAttribute('aria-controls', 'reader-music-quick-panel');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.innerHTML = '<span aria-hidden="true">♫</span>';

    panel = document.createElement('aside');
    panel.id = 'reader-music-quick-panel';
    panel.className = 'reader-music-quick-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Reading music');

    launcher.addEventListener('click', () => {
      setPanelOpen(panel.hidden);
    });

    document.body.append(panel, launcher);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && panel && !panel.hidden) {
        setPanelOpen(false);
        launcher?.focus();
      }
    });
  }

  function itemButton(item, action, meta = '') {
    return `
      <button class="reader-music-quick-item" type="button"
        data-reader-music-action="${escapeHtml(action)}"
        data-reader-music-id="${escapeHtml(item.id)}">
        <span class="reader-music-quick-item-icon" aria-hidden="true">▶</span>
        <span class="reader-music-quick-item-copy">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(meta || item.source || item.category || '')}</small>
        </span>
      </button>`;
  }

  function renderPanel() {
    if (!panel) return;

    const attached = musicForCurrentReading();
    const preferred = preferredMusic();
    const playing = nowPlaying();

    panel.innerHTML = `
      <div class="reader-music-quick-header">
        <div>
          <span class="reader-music-quick-kicker">Reader</span>
          <strong>Reading Music</strong>
        </div>
        <button class="reader-music-quick-close" type="button"
          data-reader-music-close aria-label="Close Reading Music">×</button>
      </div>

      ${playing ? `
        <section class="reader-music-now" aria-label="Now playing">
          <span>Now playing</span>
          <strong>${escapeHtml(playing.title)}</strong>
          <small>${escapeHtml(playing.source)}</small>
          <button type="button" class="reader-music-player-control"
            data-reader-music-player>
            ${playing.minimized ? 'Show player' : 'Minimize player'}
          </button>
        </section>` : ''}

      <div class="reader-music-quick-scroll">
        <section class="reader-music-quick-section">
          <div class="reader-music-quick-section-title">
            <strong>For this reading</strong>
            <span>${attached.length}</span>
          </div>
          ${attached.length
            ? `<div class="reader-music-quick-list">${
                attached.map((item) => itemButton(item, 'preferred', item.source || 'Saved for this reading')).join('')
              }</div>`
            : `<p class="reader-music-quick-empty">No music has been attached to this reading yet.</p>`}
        </section>

        <section class="reader-music-quick-section">
          <div class="reader-music-quick-section-title">
            <strong>Saved music</strong>
            <span>${preferred.length}</span>
          </div>
          ${preferred.length
            ? `<div class="reader-music-quick-list">${
                preferred.slice(0, 8).map((item) => itemButton(item, 'preferred', item.source || 'Preferred music')).join('')
              }</div>`
            : `<p class="reader-music-quick-empty">Your saved music will appear here.</p>`}
        </section>

        <section class="reader-music-quick-section">
          <div class="reader-music-quick-section-title">
            <strong>Quick focus</strong>
          </div>
          <div class="reader-music-quick-chips">
            ${QUICK_CHOICES.map((item) => `
              <button type="button"
                data-reader-music-action="quick"
                data-reader-music-id="${escapeHtml(item.id)}">
                ${escapeHtml(item.title)}
              </button>`).join('')}
          </div>
        </section>
      </div>

      <div class="reader-music-quick-footer">
        <button type="button" class="reader-music-library-link"
          data-reader-music-library>Manage Music &amp; Focus</button>
      </div>`;

    panel.querySelector('[data-reader-music-close]')?.addEventListener('click', () => {
      setPanelOpen(false);
      launcher?.focus();
    });

    panel.querySelectorAll('[data-reader-music-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.readerMusicId;
        const action = button.dataset.readerMusicAction;

        if (action === 'quick') {
          const choice = QUICK_CHOICES.find((item) => item.id === id);
          if (choice && typeof window.playMusic === 'function') {
            window.playMusic(choice);
          }
        } else if (action === 'preferred') {
          if (typeof window.playPreferredMusic === 'function') {
            window.playPreferredMusic(id);
          } else {
            const item = preferredMusic().find((candidate) => candidate.id === id);
            if (item?.choiceId) {
              const choice = QUICK_CHOICES.find((candidate) => candidate.id === item.choiceId);
              if (choice && typeof window.playMusic === 'function') window.playMusic(choice);
            } else if (item?.src && typeof window.playMusic === 'function') {
              window.playMusic({
                title: item.title,
                source: item.source || 'Preferred music',
                provider: item.provider,
                src: item.src
              });
            }
          }
        }

        // Playback uses the existing dock. Keep the quick selector available,
        // but close its list so it never covers the player.
        setPanelOpen(false);
        window.setTimeout(updateDockOffset, 0);
        window.setTimeout(updateDockOffset, 80);
      });
    });

    panel.querySelector('[data-reader-music-player]')?.addEventListener('click', () => {
      const dock = document.querySelector('#music-dock');
      const minimize = document.querySelector('#music-minimize');
      if (!dock || dock.hidden || !minimize) return;
      minimize.click();
      window.setTimeout(() => {
        renderPanel();
        updateDockOffset();
      }, 0);
    });

    panel.querySelector('[data-reader-music-library]')?.addEventListener('click', () => {
      setPanelOpen(false);
      if (typeof window.renderMusicLibrary === 'function') {
        window.renderMusicLibrary();
        return;
      }
      document.querySelector('[data-action="music"]')?.click();
    });
  }

  function updateDockOffset() {
    if (!launcher || !panel) return;

    const dock = document.querySelector('#music-dock');
    let offset = 16;

    if (dock && !dock.hidden) {
      const rect = dock.getBoundingClientRect();
      if (rect.height > 0) offset += rect.height + 12;
    }

    launcher.style.setProperty('--reader-music-bottom', `${offset}px`);
    panel.style.setProperty('--reader-music-bottom', `${offset + 58}px`);
  }

  function syncReaderState() {
    createUi();

    const visible = readerIsVisible();
    launcher.hidden = !visible;

    if (!visible) {
      panel.hidden = true;
      launcher.setAttribute('aria-expanded', 'false');
      launcher.classList.remove('is-open');
      return;
    }

    updateDockOffset();

    if (savedPanelPreference() && panel.hidden) {
      setPanelOpen(true, { persist: false });
    } else if (!panel.hidden) {
      renderPanel();
    }
  }

  function observeDock() {
    const dock = document.querySelector('#music-dock');
    if (!dock || dock.dataset.readerMusicQuickObserved === '1') return;

    dock.dataset.readerMusicQuickObserved = '1';
    dockObserver = new MutationObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        updateDockOffset();
        if (panel && !panel.hidden) renderPanel();
      }, 0);
    });
    dockObserver.observe(dock, {
      attributes: true,
      attributeFilter: ['class', 'hidden']
    });
  }

  function init() {
    createUi();

    const app = document.querySelector('#app');
    if (app) {
      appObserver = new MutationObserver(syncReaderState);
      appObserver.observe(app, { childList: true, subtree: true });
    }

    observeDock();
    syncReaderState();

    document.addEventListener('marksetgo:document-available', () => {
      window.setTimeout(syncReaderState, 0);
    });

    window.addEventListener('resize', updateDockOffset);
    window.addEventListener('storage', (event) => {
      if ([PREFERRED_KEY, BOOK_MUSIC_KEY, 'markSetGoMusic'].includes(event.key)) {
        if (panel && !panel.hidden) renderPanel();
        updateDockOffset();
      }
    });

    document.querySelector('#music-close')?.addEventListener('click', () => {
      window.setTimeout(() => {
        updateDockOffset();
        if (panel && !panel.hidden) renderPanel();
      }, 0);
    });

    document.querySelector('#music-minimize')?.addEventListener('click', () => {
      window.setTimeout(updateDockOffset, 0);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
