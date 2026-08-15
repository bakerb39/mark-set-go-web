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

    chooser.innerHTML = `
      <div class="reader-wpm-music-head">
        <div><span>Reader</span><strong>Reading Music</strong></div>
        <button type="button" data-wpm-music-close aria-label="Close music choices">×</button>
      </div>

      ${hasPlayback() ? `
        <div class="reader-wpm-music-now">
          <span>Now playing</span>
          <strong>${esc(document.querySelector('#music-now-title')?.textContent || 'Music')}</strong>
          <small>${esc(document.querySelector('#music-now-source')?.textContent || '')}</small>
        </div>` : ''}

      <div class="reader-wpm-music-scroll">
        ${attached.length ? `
          <section>
            <div class="reader-wpm-music-section-title"><strong>For this reading</strong><span>${attached.length}</span></div>
            <div class="reader-wpm-music-list">
              ${attached.map((item) => `
                <button type="button" data-wpm-music-preferred="${esc(item.id)}">
                  <span aria-hidden="true">▶</span>
                  <span><strong>${esc(item.title)}</strong><small>${esc(item.source || 'Saved for this reading')}</small></span>
                </button>`).join('')}
            </div>
          </section>` : ''}

        ${preferred.length ? `
          <section>
            <div class="reader-wpm-music-section-title"><strong>Saved music</strong><span>${preferred.length}</span></div>
            <div class="reader-wpm-music-list">
              ${preferred.slice(0, 10).map((item) => `
                <button type="button" data-wpm-music-preferred="${esc(item.id)}">
                  <span aria-hidden="true">▶</span>
                  <span><strong>${esc(item.title)}</strong><small>${esc(item.source || 'Preferred music')}</small></span>
                </button>`).join('')}
            </div>
          </section>` : ''}

        <section>
          <div class="reader-wpm-music-section-title"><strong>Quick focus</strong></div>
          <div class="reader-wpm-music-chips">
            ${QUICK_CHOICES.map((item) => `
              <button type="button" data-wpm-music-quick="${esc(item.id)}">${esc(item.title)}</button>
            `).join('')}
          </div>
        </section>
      </div>

      <div class="reader-wpm-music-foot">
        <button type="button" data-wpm-music-manage>Manage Music &amp; Focus</button>
      </div>`;

    chooser.querySelector('[data-wpm-music-close]')?.addEventListener('click', () => closeChooser());

    chooser.querySelectorAll('[data-wpm-music-quick]').forEach((button) => {
      button.addEventListener('click', () => {
        playQuick(QUICK_CHOICES.find((item) => item.id === button.dataset.wpmMusicQuick));
      });
    });

    chooser.querySelectorAll('[data-wpm-music-preferred]').forEach((button) => {
      button.addEventListener('click', () => {
        playPreferred(preferredMusic().find((item) => item.id === button.dataset.wpmMusicPreferred));
      });
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
      if (parts.title) parts.title.textContent = 'Reading Music';
      if (parts.source) parts.source.textContent = 'Choose a playlist';
    }

    speedButton?.setAttribute('aria-expanded', 'true');
    renderChooser();
  }

  function insertButtonBelowWpm() {
    const speed = document.querySelector('#app #speed');
    const control = speed?.closest('.control');
    if (!control) {
      speedButton = null;
      return;
    }

    let button = control.querySelector('[data-reader-wpm-music-toggle]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'reader-wpm-music-toggle';
      button.dataset.readerWpmMusicToggle = '1';
      button.setAttribute('aria-label', 'Open reading music');
      button.setAttribute('aria-controls', 'reader-music-wpm-chooser');
      button.setAttribute('aria-expanded', 'false');
      button.title = 'Reading music';
      button.innerHTML = '<span aria-hidden="true">♫</span>';

      const suffix = control.querySelector('.input-suffix');
      if (suffix) suffix.insertAdjacentElement('afterend', button);
      else control.appendChild(button);

      button.addEventListener('click', () => {
        ensureChooser();
        if (chooser && !chooser.hidden) closeChooser();
        else openChooser();
      });
    }
    speedButton = button;
  }

  function sync() {
    if (!document.querySelector('#app #reader')) {
      speedButton = null;
      closeChooser();
      return;
    }
    ensureChooser();
    insertButtonBelowWpm();
  }

  function init() {
    document.querySelectorAll(
      'body > .reader-music-quick-toggle, body > .reader-music-quick-panel'
    ).forEach((node) => node.remove());

    ensureChooser();
    sync();

    const app = document.querySelector('#app');
    if (app) {
      new MutationObserver(() => window.setTimeout(sync, 0))
        .observe(app, { childList:true, subtree:true });
    }

    document.addEventListener('marksetgo:document-available', () => window.setTimeout(sync, 0));

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
