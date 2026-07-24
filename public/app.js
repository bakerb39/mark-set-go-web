'use strict';

const app = document.querySelector('#app');

const sources = {
  gatsby: { title: 'The Great Gatsby', path: '/texts/gg.txt' },
  hound: { title: 'The Hound of the Baskervilles', path: '/texts/hb.txt' },
  cities: { title: 'A Tale of Two Cities', path: '/texts/tt.txt' },
  pride: { title: 'Pride and Prejudice', path: '/texts/pp.txt' }
};

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

const state = {
  words: [],
  originalText: '',
  currentText: '',
  title: '',
  language: 'en',
  index: 0,
  interval: null,
  runToken: 0,
  nextTickAt: 0,
  wordElements: [],
  activeElements: [],
  groupElements: [],
  renderedGroupSize: 1,
  wpm: 300,
  renderedMode: null,
  translationCache: new Map(),
  renderedWordEnd: 0,
  tickerAnimation: null,
  tickerPaused: false,
  tickerStatusTimer: null,
  tickerStartIndex: 0,
  tickerWordCount: 0,
  tickerFrame: null,
  tickerLastAt: 0,
  tickerOffset: 0,
  tickerNextWordIndex: 0,
  tickerLoadedWords: 0,
  bionic: false,
  autoScrollLastAt: 0,
  autoScrollCarry: 0
};

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

function setWordContent(element, word) {
  element.replaceChildren();
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

function renderHome() {
  stopReader();
  app.innerHTML = `
    <section class="hero">
      <div>
        <div class="hero-mark" aria-hidden="true">📖</div>
        <h1>Mark, Set, Go!</h1>
        <p>Measure your reading speed, then practice with flash, marquee, digital-sign scrolling, guided highlighting, two-column reading, or automatic scrolling at a controlled words-per-minute rate.</p>
        <button class="primary" data-start-home>Start a WPM test</button>
      </div>
    </section>`;
  app.querySelector('[data-start-home]').addEventListener('click', () => renderWpmTest('gatsby'));
}

async function renderWpmTest(key) {
  stopReader();
  app.innerHTML = `<section class="panel"><h1>Loading…</h1><p class="status">Preparing the reading test.</p></section>`;
  try {
    const { title, text } = await loadLocalText(key);
    const words = splitWords(text).slice(0, 250);
    if (words.length < 250) throw new Error('This WPM test requires a text file containing at least 250 words.');

    app.innerHTML = `
      <section class="panel">
        <h1>WPM Test: ${escapeHtml(title)}</h1>
        <div class="controls">
          <div class="control">
            <span class="label">Theme</span>
            <div class="segmented">
              <label><input type="radio" name="theme" value="light">Light</label>
              <label><input type="radio" name="theme" value="dark" checked>Dark</label>
            </div>
          </div>
          <div class="control">
            <label for="font-size">Font size</label>
            <select id="font-size">${fontOptions(12)}</select>
          </div>
        </div>
        <article id="reader" class="reader" style="font-size:12px">${escapeHtml(words.join(' '))}</article>
        <div class="controls">
          <button id="start-test" class="primary">GO!</button>
          <button id="stop-test" class="danger" disabled>Stop</button>
          <span id="test-status" class="status">Press GO!, read the passage, then press Stop.</span>
        </div>
      </section>`;

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
      status.textContent = 'Begin reading…';
    });

    stop.addEventListener('click', () => {
      if (!startedAt) return;
      const elapsedMinutes = (performance.now() - startedAt) / 60000;
      const measured = Math.max(1, Math.round(words.length / elapsedMinutes));
      state.wpm = measured;
      start.disabled = false;
      stop.disabled = true;
      startedAt = 0;
      status.innerHTML = `<span class="wpm-result">Your speed: ${measured.toLocaleString()} WPM</span>`;
    });
  } catch (error) {
    renderError('WPM test unavailable', error.message);
  }
}

function fontOptions(selected) {
  return Array.from({ length: 14 }, (_, i) => 10 + i * 2)
    .map((size) => `<option value="${size}" ${size === selected ? 'selected' : ''}>${size}px</option>`)
    .join('');
}

function bindAppearance(reader) {
  const font = app.querySelector('#font-size');
  font?.addEventListener('change', () => { reader.style.fontSize = `${font.value}px`; });

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
  fontFamily?.addEventListener('change', applyFontFamily);
  applyFontFamily();

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

async function renderReader(kind) {
  stopReader();
  if (kind === 'url') return renderUrlImporter();
  if (kind === 'upload') return renderUpload();

  app.innerHTML = `<section class="panel"><h1>Loading…</h1><p class="status">Preparing your text.</p></section>`;
  try {
    let title;
    let text;
    if (sources[kind]) {
      ({ title, text } = await loadLocalText(kind));
    } else if (kind === 'news') {
      title = "Today's News";
      text = await loadApiText('/api/news');
    } else if (kind === 'weather') {
      title = 'Local Weather';
      text = await loadApiText('/api/weather');
    } else {
      throw new Error('Unknown reading selection.');
    }
    renderReaderWithText(title, text);
  } catch (error) {
    renderError('Reading unavailable', error.message);
  }
}

function renderReaderWithText(title, text) {
  state.originalText = String(text);
  state.currentText = String(text);
  state.title = title;
  state.language = 'en';
  state.bionic = false;
  state.words = splitWords(text);
  state.index = 0;
  state.renderedMode = null;
  state.translationCache.clear();
  if (!state.words.length) return renderError('No readable text', 'The selected source did not contain readable words.');

  app.innerHTML = `
    <section class="panel">
      <h1>${escapeHtml(title)}</h1>
      <section class="reader-toolbar" aria-label="Reading settings">
        <details class="settings-panel" open>
          <summary><span>Reading</span><span class="settings-summary">Mode, speed, words</span></summary>
          <div class="toolbar-fields settings-content">
            <div class="control mode-control">
              <label for="mode-select">Mode</label>
              <select id="mode-select">
                <option value="highlight" selected>Highlight</option>
                <option value="bold-focus">Bold Focus</option>
                <option value="smooth-glide">Smooth Glide</option>
                <option value="marquee">Marquee</option>
                <option value="flash">Flash</option>
                <option value="digital-sign">Digital Sign</option>
                <option value="auto-scroll">Auto Scroll</option>
                <option value="two-column">Two Columns</option>
              </select>
            </div>
            <div class="control"><label for="speed">Speed</label><div class="input-suffix"><input id="speed" type="number" min="30" max="900" value="${Math.min(900, state.wpm)}"><span>WPM</span></div></div>
            <div class="control"><label for="word-count">Words shown</label><input id="word-count" type="number" min="1" max="10" value="1"></div>
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
          </div>
        </details>
      </section>

      <div class="reader-layout">
        <div id="reader-frame" class="reader-frame">
          <button id="toggle-reader-fullscreen" class="viewer-fullscreen-button" type="button" aria-label="Enter text viewer fullscreen" title="Full screen text viewer">
            <span class="fullscreen-icon" aria-hidden="true">⛶</span>
            <span class="fullscreen-label">Full screen</span>
          </button>
          <div id="fullscreen-control-strip" class="fullscreen-control-strip" aria-label="Fullscreen reader controls">
            <button id="fullscreen-options-toggle" class="fullscreen-options-toggle" type="button" aria-expanded="false" aria-controls="fullscreen-options-menu">Options ▾</button>
            <button id="fullscreen-controls-close" class="fullscreen-controls-close" type="button" aria-label="Hide fullscreen controls" title="Hide controls">×</button>
            <section id="fullscreen-options-menu" class="fullscreen-options-menu" hidden>
              <div class="fullscreen-options-grid">
                <label>Mode<select id="fs-mode-select">
                  <option value="highlight">Highlight</option><option value="bold-focus">Bold Focus</option><option value="smooth-glide">Smooth Glide</option><option value="marquee">Marquee</option><option value="flash">Flash</option>
                  <option value="digital-sign">Digital Sign</option><option value="auto-scroll">Auto Scroll</option><option value="two-column">Two Columns</option>
                </select></label>
                <label>Speed<div class="input-suffix"><input id="fs-speed" type="number" min="30" max="900"><span>WPM</span></div></label>
                <label>Words shown<input id="fs-word-count" type="number" min="1" max="10"></label>
                <label>Font<select id="fs-font-family">
                  <option value="system">System Sans</option><option value="serif">Book Serif</option><option value="georgia">Georgia</option>
                  <option value="verdana">Verdana</option><option value="trebuchet">Trebuchet</option><option value="monospace">Monospace</option><option value="dyslexic">Dyslexia-friendly</option>
                </select></label>
                <label>Text size<select id="fs-font-size">${fontOptions(14)}</select></label>
                <label>Theme<select id="fs-theme-select"><option value="dark">Dark</option><option value="light">Light</option></select></label>
                <label class="fullscreen-checkbox"><input id="fs-bionic-reading" type="checkbox"> Bionic text</label>
                <label>Translation<select id="fs-translation-language">
                  <option value="">Choose language…</option>
                  ${Object.entries(languages).map(([code, name]) => `<option value="${code}">${name}</option>`).join('')}
                </select></label>
              </div>
              <div class="fullscreen-option-actions">
                <button id="fs-start" class="primary" type="button">Start</button>
                <button id="fs-pause" class="secondary" type="button">Pause</button>
                <button id="fs-reset" class="secondary" type="button">Reset</button>
                <button id="fs-translate" class="secondary" type="button">Translate</button>
                <button id="fs-restore" class="secondary" type="button">Restore English</button>
              </div>
              <p class="fullscreen-options-hint">Click the text to pause or resume. Press <kbd>O</kbd> to show these controls after hiding them.</p>
            </section>
          </div>
          <article id="reader" class="reader interactive-reader" style="font-size:14px" aria-label="Reading text" title="Click the text to pause or resume"></article>
        </div>
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

      <div class="controls playback-controls">
        <button id="start-reader" class="primary">Start</button>
        <button id="pause-reader" class="secondary" disabled>Pause</button>
        <button id="reset-reader" class="secondary">Reset</button>
        <span id="reader-status" class="status">${state.words.length.toLocaleString()} words loaded. Click the text viewer to pause or resume.</span>
      </div>
    </section>`;

  const reader = app.querySelector('#reader');
  const readerFrame = app.querySelector('#reader-frame');
  const fullscreenButton = app.querySelector('#toggle-reader-fullscreen');
  bindAppearance(reader);
  bindReaderFullscreen(readerFrame, fullscreenButton);
  bindFullscreenOptions(readerFrame);
  prepareReaderView('highlight');
  updateModeControls('highlight');

  const modeSelect = app.querySelector('#mode-select');
  modeSelect.addEventListener('change', () => {
    // A mode change must fully dispose of any paused Web Animation. Merely
    // pausing Digital Sign leaves an animation attached to the old stage,
    // which can make the next Start command resume an invisible element.
    stopReader();
    state.index = 0;
    prepareReaderView(modeSelect.value);
    updateModeControls(modeSelect.value);
    updateReaderStatus();
  });

  reader.addEventListener('click', (event) => {
    const translatedWord = event.target.closest('.translated-word');
    if (translatedWord && state.language !== 'en') {
      handleTranslatedWordClick(event);
      return;
    }

    if (getSelectedMode() === 'two-column') return;
    if (isReaderRunning()) pauseReader();
    else startReader();
  });
  app.querySelector('#start-reader').addEventListener('click', startReader);
  app.querySelector('#pause-reader').addEventListener('click', pauseReader);
  app.querySelector('#reset-reader').addEventListener('click', resetReader);
  app.querySelector('#bionic-reading').addEventListener('change', (event) => {
    stopReader();
    state.bionic = event.target.checked;
    const mode = getSelectedMode();
    const count = Number(app.querySelector('#word-count')?.value) || 1;
    prepareReaderView(mode, count);
    updateModeControls(mode);
    updateReaderStatus();
    const start = app.querySelector('#start-reader');
    if (start) start.textContent = state.index ? 'Resume' : 'Start';
  });
  app.querySelector('#translate-text').addEventListener('click', translateCurrentText);
  app.querySelector('#restore-english').addEventListener('click', restoreEnglish);
}


function bindFullscreenOptions(readerFrame) {
  const strip = app.querySelector('#fullscreen-control-strip');
  const toggle = app.querySelector('#fullscreen-options-toggle');
  const close = app.querySelector('#fullscreen-controls-close');
  const menu = app.querySelector('#fullscreen-options-menu');
  if (!readerFrame || !strip || !toggle || !close || !menu) return;

  const pairs = [
    ['#fs-mode-select', '#mode-select'],
    ['#fs-speed', '#speed'],
    ['#fs-word-count', '#word-count'],
    ['#fs-font-family', '#font-family'],
    ['#fs-font-size', '#font-size'],
    ['#fs-theme-select', '#theme-select'],
    ['#fs-bionic-reading', '#bionic-reading'],
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

  const openMenu = () => {
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

  close.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    strip.classList.add('controls-hidden');
    readerFrame.classList.add('fullscreen-controls-hidden');
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
  proxyClick('#fs-start', '#start-reader');
  proxyClick('#fs-pause', '#pause-reader');
  proxyClick('#fs-reset', '#reset-reader');
  proxyClick('#fs-translate', '#translate-text');
  proxyClick('#fs-restore', '#restore-english');

  readerFrame.addEventListener('pointermove', (event) => {
    if (!isFullscreen() || !strip.classList.contains('controls-hidden')) return;
    const rect = readerFrame.getBoundingClientRect();
    const nearTopRight = event.clientX >= rect.right - 85 && event.clientY <= rect.top + 75;
    if (nearTopRight) {
      strip.classList.remove('controls-hidden');
      readerFrame.classList.remove('fullscreen-controls-hidden');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!isFullscreen() || event.key.toLowerCase() !== 'o') return;
    event.preventDefault();
    strip.classList.remove('controls-hidden');
    readerFrame.classList.remove('fullscreen-controls-hidden');
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === readerFrame) {
      strip.classList.remove('controls-hidden');
      readerFrame.classList.remove('fullscreen-controls-hidden');
      closeMenu();
      syncFromMain();
    } else if (!readerFrame.classList.contains('fullscreen-fallback')) {
      closeMenu();
      strip.classList.remove('controls-hidden');
      readerFrame.classList.remove('fullscreen-controls-hidden');
    }
  });

  const observer = new MutationObserver(() => {
    if (readerFrame.classList.contains('fullscreen-fallback')) {
      strip.classList.remove('controls-hidden');
      readerFrame.classList.remove('fullscreen-controls-hidden');
      closeMenu();
      syncFromMain();
    }
  });
  observer.observe(readerFrame, { attributes: true, attributeFilter: ['class'] });

  closeMenu();
  syncFromMain();
}


function bindReaderFullscreen(readerFrame, button) {
  if (!readerFrame || !button) return;

  const label = button.querySelector('.fullscreen-label');
  const icon = button.querySelector('.fullscreen-icon');

  const isViewerFullscreen = () => document.fullscreenElement === readerFrame
    || readerFrame.classList.contains('fullscreen-fallback');

  const updateButton = () => {
    const active = isViewerFullscreen();
    button.setAttribute('aria-label', active ? 'Exit text viewer fullscreen' : 'Enter text viewer fullscreen');
    button.title = active ? 'Minimize text viewer' : 'Full screen text viewer';
    if (label) label.textContent = active ? 'Minimize' : 'Full screen';
    if (icon) icon.textContent = active ? '🗗' : '⛶';
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
  };

  const exitFullscreen = async () => {
    if (document.fullscreenElement === readerFrame && document.exitFullscreen) {
      await document.exitFullscreen();
      return;
    }
    readerFrame.classList.remove('fullscreen-fallback');
    document.body.classList.remove('viewer-fullscreen-open');
    updateButton();
  };

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (isViewerFullscreen()) await exitFullscreen();
    else await enterFullscreen();
  });

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement !== readerFrame) {
      readerFrame.classList.remove('fullscreen-fallback');
      document.body.classList.remove('viewer-fullscreen-open');
    }
    updateButton();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && readerFrame.classList.contains('fullscreen-fallback')) {
      exitFullscreen();
    }
  });

  updateButton();
}

function updateModeControls(mode) {
  const countInput = app.querySelector('#word-count');
  const speedInput = app.querySelector('#speed');
  const start = app.querySelector('#start-reader');
  const pause = app.querySelector('#pause-reader');
  const staticMode = mode === 'two-column';
  const countUnused = mode === 'digital-sign' || mode === 'two-column' || mode === 'auto-scroll';

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
  // books responsive. Bionic and translated text still use word spans because
  // they need per-word formatting or click handling.
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

function createWordSpan(word, index, extraClass = '') {
  const span = document.createElement('span');
  span.className = `reader-word ${extraClass}`.trim();
  span.dataset.index = String(index);
  setWordContent(span, word);
  span.tabIndex = state.language === 'en' ? -1 : 0;
  if (state.language !== 'en') {
    span.classList.add('translated-word');
    span.title = 'Click for English translation';
  }
  return span;
}

function appendWordDocumentChunk(reader, mode, groupSize, targetWordEnd) {
  const safeGroupSize = Math.min(10, Math.max(1, Number(groupSize) || 1));
  const startWord = state.renderedWordEnd;
  const endWord = Math.min(state.words.length, Math.max(startWord, targetWordEnd));
  if (endWord <= startWord) return;

  const fragment = document.createDocumentFragment();
  const alignedStart = startWord - (startWord % safeGroupSize);

  for (let groupStart = alignedStart; groupStart < endWord; groupStart += safeGroupSize) {
    if (groupStart < startWord) continue;
    const group = document.createElement('span');
    group.className = 'reader-group';
    group.dataset.startIndex = String(groupStart);
    if (mode === 'marquee') group.classList.add('pending-group');

    const groupEnd = Math.min(groupStart + safeGroupSize, state.words.length, endWord);
    for (let index = groupStart; index < groupEnd; index += 1) {
      const span = createWordSpan(state.words[index], index);
      span.appendChild(document.createTextNode(index < state.words.length - 1 ? ' ' : ''));
      group.appendChild(span);
    }
    fragment.appendChild(group);
  }

  reader.appendChild(fragment);
  state.renderedWordEnd = endWord;
  state.wordElements = Array.from(reader.querySelectorAll('.reader-word'));
  state.groupElements = Array.from(reader.querySelectorAll('.reader-group'));
}

function ensureWordsRendered(reader, mode, groupSize, requiredWordEnd) {
  const CHUNK_WORDS = 5000;
  if (requiredWordEnd <= state.renderedWordEnd) return;
  const target = Math.min(
    state.words.length,
    Math.max(requiredWordEnd, state.renderedWordEnd + CHUNK_WORDS)
  );
  appendWordDocumentChunk(reader, mode, groupSize, target);
}

function renderWordDocument(reader, mode, groupSize = 1) {
  const safeGroupSize = Math.min(10, Math.max(1, Number(groupSize) || 1));
  reader.replaceChildren();
  state.wordElements = [];
  state.groupElements = [];
  state.activeElements = [];
  state.renderedGroupSize = safeGroupSize;
  state.renderedWordEnd = 0;

  ensureWordsRendered(reader, mode, safeGroupSize, Math.min(state.words.length, 5000));

  reader.addEventListener('scroll', () => {
    const nearBottom = reader.scrollTop + reader.clientHeight >= reader.scrollHeight - 600;
    if (nearBottom && state.renderedWordEnd < state.words.length) {
      ensureWordsRendered(reader, mode, safeGroupSize, state.renderedWordEnd + 5000);
    }
  }, { passive: true });
}

function prepareReaderView(mode, groupSize = Number(app.querySelector('#word-count')?.value) || 1) {
  const reader = app.querySelector('#reader');
  if (!reader) return;
  reader.classList.remove('flash', 'highlight-mode', 'bold-focus-mode', 'smooth-glide-mode', 'marquee-mode', 'digital-sign-mode', 'two-column-mode', 'auto-scroll-mode');
  reader.scrollTop = 0;
  state.renderedMode = mode;

  if (mode === 'flash') {
    reader.classList.add('flash');
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

  if (mode === 'highlight') reader.classList.add('highlight-mode');
  else if (mode === 'bold-focus') reader.classList.add('bold-focus-mode');
  else if (mode === 'smooth-glide') reader.classList.add('smooth-glide-mode');
  else reader.classList.add('marquee-mode');
  renderWordDocument(reader, mode, groupSize);
  if (mode === 'smooth-glide') {
    const marker = document.createElement('span');
    marker.className = 'smooth-focus-marker';
    marker.setAttribute('aria-hidden', 'true');
    reader.prepend(marker);
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

function updateReaderStatus(message) {
  const status = app.querySelector('#reader-status');
  if (!status) return;
  status.textContent = message || `${state.index.toLocaleString()} of ${state.words.length.toLocaleString()} words`;
}


function createTickerChunk(startIndex, chunkSize = 80) {
  const endIndex = Math.min(state.words.length, startIndex + chunkSize);
  if (endIndex <= startIndex) return null;

  const chunk = document.createElement('span');
  chunk.className = 'digital-sign-chunk';
  chunk.dataset.start = String(startIndex);
  chunk.dataset.end = String(endIndex);
  renderPhrase(chunk, state.words.slice(startIndex, endIndex));
  return { chunk, endIndex, wordCount: endIndex - startIndex };
}

function fillTickerBuffer(stage, reader) {
  // Keep only a few hundred words in the DOM. The previous implementation put
  // the entire remaining book into one animated element, which could lock the
  // browser in fullscreen because every frame repainted an enormous layer.
  const targetWidth = Math.max(reader.clientWidth * 2.5, 1800);
  let guard = 0;
  while (state.tickerNextWordIndex < state.words.length
      && (stage.scrollWidth < targetWidth || stage.children.length < 3)
      && guard < 8) {
    const result = createTickerChunk(state.tickerNextWordIndex);
    if (!result) break;
    stage.append(result.chunk);
    state.tickerNextWordIndex = result.endIndex;
    state.tickerLoadedWords += result.wordCount;
    guard += 1;
  }
}

function startDigitalSignReader({ reader, speed, start, pause }) {
  const stage = reader.querySelector('.digital-sign-stage');
  if (!stage || state.index >= state.words.length) return;

  const token = ++state.runToken;
  const isResume = state.tickerPaused && stage.children.length > 0;

  if (!isResume) {
    stage.replaceChildren();
    state.tickerStartIndex = state.index;
    state.tickerNextWordIndex = state.index;
    state.tickerLoadedWords = 0;
    state.tickerOffset = Math.max(1, reader.clientWidth);
    fillTickerBuffer(stage, reader);
  }

  state.tickerPaused = false;
  state.tickerLastAt = performance.now();

  const frame = (now) => {
    if (token !== state.runToken || state.tickerPaused) {
      state.tickerFrame = null;
      return;
    }

    const elapsedSeconds = Math.min(0.05, Math.max(0, (now - state.tickerLastAt) / 1000));
    state.tickerLastAt = now;

    const loadedWords = Math.max(1, state.tickerLoadedWords);
    const averagePixelsPerWord = Math.max(4, stage.scrollWidth / loadedWords);
    const pixelsPerSecond = Math.max(8, averagePixelsPerWord * speed / 60);
    state.tickerOffset -= pixelsPerSecond * elapsedSeconds;

    // Recycle chunks only after they have completely passed the left edge.
    // Correcting the offset by the removed width keeps the remaining text in
    // exactly the same visual position, so there is no jump or phrase break.
    let first = stage.firstElementChild;
    while (first) {
      const style = getComputedStyle(first);
      const removedWidth = first.getBoundingClientRect().width
        + parseFloat(style.marginRight || '0');
      if (state.tickerOffset + removedWidth > 0) break;

      const passedEnd = Number(first.dataset.end) || state.index;
      state.index = Math.max(state.index, passedEnd);
      state.tickerOffset += removedWidth;
      state.tickerLoadedWords -= Math.max(0, passedEnd - (Number(first.dataset.start) || passedEnd));
      first.remove();
      fillTickerBuffer(stage, reader);
      first = stage.firstElementChild;
      updateReaderStatus();
    }

    stage.style.transform = `translate3d(${state.tickerOffset}px, 0, 0)`;

    if (!stage.firstElementChild && state.tickerNextWordIndex >= state.words.length) {
      state.tickerFrame = null;
      state.index = state.words.length;
      state.tickerPaused = false;
      if (start) { start.disabled = false; start.textContent = 'Start'; }
      if (pause) pause.disabled = true;
      updateReaderStatus('Finished.');
      return;
    }

    fillTickerBuffer(stage, reader);
    state.tickerFrame = requestAnimationFrame(frame);
  };

  stage.style.transform = `translate3d(${state.tickerOffset}px, 0, 0)`;
  state.tickerFrame = requestAnimationFrame(frame);
  start.disabled = true;
  pause.disabled = false;
}

function startAutoScrollReader({ reader, speed, start, pause }) {
  const token = ++state.runToken;
  state.autoScrollLastAt = performance.now();
  state.autoScrollCarry = 0;

  const step = (now) => {
    if (token !== state.runToken) return;
    const elapsedSeconds = Math.min(.1, Math.max(0, (now - state.autoScrollLastAt) / 1000));
    state.autoScrollLastAt = now;

    if (reader.scrollTop + reader.clientHeight >= reader.scrollHeight - 900 && state.renderedWordEnd < state.words.length) {
      ensureWordsRendered(reader, 'auto-scroll', 1, state.renderedWordEnd + 5000);
    }

    const measuredWords = Math.max(1, state.renderedWordEnd);
    const pixelsPerWord = Math.max(.2, reader.scrollHeight / measuredWords);
    const pixelsPerSecond = pixelsPerWord * speed / 60;
    state.autoScrollCarry += pixelsPerSecond * elapsedSeconds;
    const wholePixels = Math.floor(state.autoScrollCarry);
    if (wholePixels > 0) {
      reader.scrollTop += wholePixels;
      state.autoScrollCarry -= wholePixels;
    }

    state.index = Math.min(state.words.length, Math.round(reader.scrollTop / pixelsPerWord));
    updateReaderStatus();

    const atDocumentEnd = state.renderedWordEnd >= state.words.length
      && reader.scrollTop + reader.clientHeight >= reader.scrollHeight - 2;
    if (atDocumentEnd) {
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

function startReader() {
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
  const count = (mode === 'digital-sign' || mode === 'auto-scroll')
    ? 1
    : Math.min(10, Math.max(1, Number(countInput.value) || 1));
  speedInput.value = speed;
  countInput.value = count;
  state.wpm = speed;
  speedInput.disabled = true;
  countInput.disabled = true;
  start.disabled = true;
  pause.disabled = false;

  if (state.renderedMode !== mode || (mode !== 'flash' && state.renderedGroupSize !== count)) {
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
    const nextIndex = Math.min(startIndex + count, state.words.length);

    if (mode === 'flash') {
      renderPhrase(reader, state.words.slice(startIndex, nextIndex));
    } else {
      ensureWordsRendered(reader, mode, count, nextIndex + 1000);
      const groupIndex = Math.floor(startIndex / count);
      const group = state.groupElements[groupIndex];

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
      scrollActiveGroup(reader, groupIndex);
      if (mode === 'smooth-glide' && group) {
        window.requestAnimationFrame(() => moveSmoothFocusMarker(reader, group, tickMs));
      }
    }

    state.index = nextIndex;
    updateReaderStatus();

    // Advance from the planned deadline, not from the end of this DOM update.
    // That prevents layout and scrolling time from accumulating into periodic
    // pauses. If one frame is late, the following delay becomes shorter rather
    // than permanently shifting the reading rhythm.
    state.nextTickAt += tickMs;
    const delay = Math.max(0, state.nextTickAt - performance.now());
    state.interval = window.setTimeout(paintStep, delay);
  };

  paintStep();
}

function stopReader() {
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
  if (count) count.disabled = ['digital-sign', 'two-column', 'auto-scroll'].includes(state.renderedMode);
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
  prepareReaderView(mode);
  updateModeControls(mode);
  updateReaderStatus(`${state.words.length.toLocaleString()} words loaded.`);
  const start = app.querySelector('#start-reader');
  if (start) start.textContent = 'Start';
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
  status.textContent = `Translating to ${languages[language]}…`;

  try {
    const payload = await loadApiPayload('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: state.originalText, to: language })
    });
    state.currentText = payload.text;
    state.language = language;
    state.words = splitWords(payload.text);
    state.index = 0;
    state.translationCache.clear();
    const mode = getSelectedMode();
    prepareReaderView(mode);
    updateReaderStatus(`${state.words.length.toLocaleString()} translated words loaded.`);
    app.querySelector('#restore-english').disabled = false;
    app.querySelector('#word-result').innerHTML = `<h2>Word translation</h2><p>Click any translated word to see its English meaning.</p>`;
    status.textContent = `Translated to ${languages[language]}.`;
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
      const payload = await loadApiPayload('/api/translate-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: word, from: state.language })
      });
      translation = payload.text;
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
      renderReaderWithText(new URL(url).hostname, text);
    } catch (error) {
      status.className = 'status error';
      status.textContent = error.message;
    }
  });
}

function renderUpload() {
  stopReader();
  app.innerHTML = `
    <section class="panel">
      <h1>Upload Text</h1>
      <p>Select a UTF-8 or ordinary text file. The file stays in your browser and is not uploaded to the server unless you choose to translate it.</p>
      <div class="controls"><input id="text-file" type="file" accept=".txt,text/plain"><span id="upload-status" class="status"></span></div>
    </section>`;
  app.querySelector('#text-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const status = app.querySelector('#upload-status');
    try {
      const text = await file.text();
      renderReaderWithText(file.name, text);
    } catch {
      status.className = 'status error';
      status.textContent = 'The file could not be read.';
    }
  });
}

function renderHelp() {
  stopReader();
  app.innerHTML = `
    <section class="panel">
      <h1>How to Use Mark, Set, Go!</h1>
      <div class="help-grid">
        <article class="help-card"><h2>Test</h2><p>Choose a title under WPM Test, press GO!, read all 250 words, then press Stop.</p></article>
        <article class="help-card"><h2>Highlight</h2><p>The complete passage stays visible while the current word group is highlighted and the pane follows it automatically.</p></article>
        <article class="help-card"><h2>Bold Focus</h2><p>The full passage remains visible while the current word group becomes bold and one size larger, without a colored highlight.</p></article>
        <article class="help-card"><h2>Smooth Glide</h2><p>A soft focus band glides continuously from one word group to the next while the complete passage stays visible.</p></article>
        <article class="help-card"><h2>Marquee</h2><p>Words appear progressively, and the pane follows your reading position automatically.</p></article>
        <article class="help-card"><h2>Bionic text</h2><p>Turn on Bionic text to bold the opening portion of each word in any reading mode.</p></article>
        <article class="help-card"><h2>Translate</h2><p>Choose a language and translate the passage. Click any translated word to display an English meaning in the side panel.</p></article>
      </div>
    </section>`;
}

function renderAbout() {
  stopReader();
  app.innerHTML = `
    <section class="panel">
      <h1>About</h1>
      <p>Created by Brian Baker for a Harvard CS50 final project.</p>
      <p>This browser edition was converted from the original Python and guizero desktop application.</p>
    </section>`;
}

function renderError(title, message) {
  stopReader();
  app.innerHTML = `<section class="panel"><h1>${escapeHtml(title)}</h1><p class="status error">${escapeHtml(message)}</p><button class="secondary" data-action="home">Return home</button></section>`;
  app.querySelector('[data-action="home"]')?.addEventListener('click', renderHome);
}

document.addEventListener('click', (event) => {
  const test = event.target.closest('[data-test]');
  const read = event.target.closest('[data-read]');
  const action = event.target.closest('[data-action]');
  if (test) { closeMenus(); renderWpmTest(test.dataset.test); }
  if (read) { closeMenus(); renderReader(read.dataset.read); }
  if (action) {
    closeMenus();
    if (action.dataset.action === 'home') renderHome();
    if (action.dataset.action === 'help') renderHelp();
    if (action.dataset.action === 'about') renderAbout();
  }
});

renderHome();
