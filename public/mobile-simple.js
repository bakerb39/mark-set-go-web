(() => {
  const mq = window.matchMedia('(max-width: 700px)');
  if (!mq.matches) return;

  const app = document.getElementById('app');
  if (!app) return;

  let lastScreen = '';
  let scheduled = false;
  let startedOnce = false;
  const ANCHOR_POSITION_KEY = 'markSetGoMobileAnchorPositionV1';
  const configuredReaders = new WeakSet();

  function dispatchChange(el) {
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setValue(selector, value) {
    const el = app.querySelector(selector);
    if (!el || String(el.value) === String(value)) return;
    el.value = String(value);
    dispatchChange(el);
  }

  function setChecked(selector, checked) {
    const el = app.querySelector(selector);
    if (!el || Boolean(el.checked) === Boolean(checked)) return;
    el.checked = Boolean(checked);
    dispatchChange(el);
  }

  function ensureShell() {
    if (!document.getElementById('msg-mobile-header')) {
      const header = document.createElement('header');
      header.id = 'msg-mobile-header';
      header.innerHTML = '<span class="msg-mobile-mark">Mark, Set, Go!</span><strong id="msg-mobile-title">My Library</strong>';
      document.body.appendChild(header);
    }

    if (!document.getElementById('msg-mobile-nav')) {
      const nav = document.createElement('nav');
      nav.id = 'msg-mobile-nav';
      nav.setAttribute('aria-label', 'Mobile navigation');
      nav.innerHTML = `
        <button type="button" data-mobile-route="library"><span aria-hidden="true">▥</span><span>Library</span></button>
        <button type="button" data-mobile-route="browse"><span aria-hidden="true">⌕</span><span>Browse</span></button>
        <button type="button" data-mobile-route="import"><span aria-hidden="true">⇧</span><span>Import</span></button>
        <button type="button" data-mobile-route="reader"><span aria-hidden="true">▤</span><span>Reader</span></button>`;
      nav.addEventListener('click', (event) => {
        const button = event.target.closest('[data-mobile-route]');
        if (!button) return;
        const route = button.dataset.mobileRoute;
        if (route === 'import') {
          window.MarkSetGoReadAnything?.render?.();
          scheduleUpdate();
          return;
        }
        const source = route === 'library'
          ? document.querySelector('[data-action="my-library"]')
          : route === 'browse'
            ? document.querySelector('[data-action="browse"]')
            : document.querySelector('[data-action="reader"]');
        source?.click();
      });
      document.body.appendChild(nav);
    }
  }

  function ensureReaderControls() {
    const panel = app.querySelector('.reader-page-panel');
    if (!panel || panel.querySelector('#msg-mobile-reader-controls')) return;
    const controls = document.createElement('div');
    controls.id = 'msg-mobile-reader-controls';
    controls.setAttribute('aria-label', 'Simplified reader controls');
    controls.innerHTML = `
      <div class="msg-control-row msg-speed-row">
        <button type="button" data-mobile-reader="slower" aria-label="Decrease speed">−</button>
        <div class="msg-speed"><span id="msg-mobile-wpm">300</span>&nbsp;WPM</div>
        <button type="button" data-mobile-reader="faster" aria-label="Increase speed">+</button>
        <button type="button" class="msg-play" data-mobile-reader="play" aria-label="Start or pause reading">▶</button>
      </div>
      <div class="msg-control-row msg-option-row">
        <button type="button" class="msg-anchor-position" data-mobile-reader="anchor-position">Anchor: Top</button>
        <button type="button" class="msg-theme" data-mobile-reader="theme">Light</button>
      </div>`;
    controls.addEventListener('click', (event) => {
      const button = event.target.closest('[data-mobile-reader]');
      if (!button) return;
      const action = button.dataset.mobileReader;
      const speed = app.querySelector('#speed');
      if (action === 'slower' && speed) {
        speed.value = String(Math.max(30, Number(speed.value || 300) - 25));
        dispatchChange(speed);
      }
      if (action === 'faster' && speed) {
        speed.value = String(Math.min(2000, Number(speed.value || 300) + 25));
        dispatchChange(speed);
      }
      if (action === 'anchor-position') {
        const next = currentAnchorPosition() === 'top' ? 'center' : 'top';
        localStorage.setItem(ANCHOR_POSITION_KEY, next);
        applyAnchorPosition();
      }
      if (action === 'play') {
        const pause = app.querySelector('#pause-reader');
        const start = app.querySelector('#start-reader');
        if (pause && !pause.disabled) pause.click();
        else start?.click();
      }
      if (action === 'theme') {
        const theme = app.querySelector('#theme-select');
        if (theme) {
          theme.value = theme.value === 'light' ? 'dark' : 'light';
          dispatchChange(theme);
        }
      }
      refreshReaderControlLabels();
    });
    panel.appendChild(controls);
  }

  function currentAnchorPosition() {
    return localStorage.getItem(ANCHOR_POSITION_KEY) === 'center' ? 'center' : 'top';
  }

  function applyAnchorPosition() {
    const frame = app.querySelector('#reader-frame');
    if (!frame) return;
    const position = currentAnchorPosition();
    frame.classList.toggle('msg-anchor-top', position === 'top');
    frame.classList.toggle('msg-anchor-center', position === 'center');
    const button = document.querySelector('[data-mobile-reader="anchor-position"]');
    if (button) button.textContent = position === 'top' ? 'Anchor: Top' : 'Anchor: Center';
  }

  function configureReader() {
    const reader = app.querySelector('#reader.interactive-reader');
    if (!reader) return;
    ensureReaderControls();

    if (!configuredReaders.has(reader)) {
      configuredReaders.add(reader);
      setValue('#mode-select', 'highlight');
      setValue('#word-count', 1);
      setChecked('#meaningful-chunks', false);
      setValue('#font-size', 14);
      setChecked('#focus-anchor', true);
      setValue('#focus-anchor-font-size', 36);
      setValue('#focus-anchor-color', '#d94b4b');
      setChecked('#focus-anchor-bold', false);
      setChecked('#book-pages', false);
      setValue('#fs-mode-select', 'highlight');
      setValue('#fs-word-count', 1);
      setValue('#fs-font-size', 14);
      setChecked('#fs-focus-anchor', true);
      setValue('#fs-focus-anchor-font-size', 36);
      setValue('#fs-focus-anchor-color', '#d94b4b');
      setChecked('#fs-book-pages', false);
    }
    applyAnchorPosition();
    refreshReaderControlLabels();
  }

  function refreshReaderControlLabels() {
    const speed = app.querySelector('#speed');
    const wpm = document.getElementById('msg-mobile-wpm');
    if (wpm && speed) wpm.textContent = String(Math.round(Number(speed.value) || 300));

    const play = document.querySelector('[data-mobile-reader="play"]');
    const pause = app.querySelector('#pause-reader');
    if (play) play.textContent = pause && !pause.disabled ? 'Ⅱ' : '▶';

    const theme = app.querySelector('#theme-select');
    const themeButton = document.querySelector('[data-mobile-reader="theme"]');
    if (themeButton && theme) themeButton.textContent = theme.value === 'light' ? 'Dark' : 'Light';
    applyAnchorPosition();
  }

  function detectScreen() {
    if (app.querySelector('#reader.interactive-reader')) return 'reader';
    if (app.querySelector('.read-anything-page')) return 'import';
    const text = (app.querySelector('h1,h2')?.textContent || '').toLowerCase();
    if (/library|my reading|continue reading/.test(text) || app.querySelector('.library-home-page,.my-library-page')) return 'library';
    if (/browse|discover|search libraries/.test(text) || app.querySelector('.browse-page')) return 'browse';
    return lastScreen || 'library';
  }

  function updateScreen() {
    scheduled = false;
    ensureShell();
    const screen = detectScreen();
    lastScreen = screen;
    app.classList.toggle('msg-mobile-reader-screen', screen === 'reader');
    app.classList.toggle('msg-mobile-list-screen', screen !== 'reader');

    const title = document.getElementById('msg-mobile-title');
    if (title) {
      title.textContent = screen === 'reader'
        ? (app.querySelector('.reader-title-copy h1')?.textContent || 'Reader')
        : screen === 'browse' ? 'Browse' : screen === 'import' ? 'Read Anything' : 'My Library';
    }

    document.querySelectorAll('#msg-mobile-nav [data-mobile-route]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mobileRoute === screen);
    });

    if (screen === 'reader') configureReader();

    if (!startedOnce && screen !== 'reader') {
      startedOnce = true;
      setTimeout(() => document.querySelector('[data-action="my-library"]')?.click(), 0);
    }
  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(updateScreen);
  }

  ensureShell();
  const observer = new MutationObserver(scheduleUpdate);
  observer.observe(app, { childList: true, subtree: true });
  app.addEventListener('input', refreshReaderControlLabels);
  app.addEventListener('change', refreshReaderControlLabels);
  app.addEventListener('click', () => setTimeout(refreshReaderControlLabels, 0));
  scheduleUpdate();
})();
