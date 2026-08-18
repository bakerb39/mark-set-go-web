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
  persistCurrentDocument();
  document.dispatchEvent(new CustomEvent('marksetgo:document-available', {
    detail: { documentId: state.documentId, title: state.title }
  }));

  app.innerHTML = `
    <section class="panel reader-page-panel">
      <div class="reader-title-row">
        <div class="reader-title-copy">
          <h1>${escapeHtml(title)}</h1>
          <div class="reader-title-links"><a id="grokipedia-book-link" href="${grokipediaSearchUrl(title)}" target="_blank" rel="noopener noreferrer">Read about this book on Grokipedia</a></div>
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
            <button id="fullscreen-controls-close" class="fullscreen-controls-close" type="button" aria-label="Hide fullscreen controls" title="Hide controls">×</button>
            <section id="fullscreen-options-menu" class="fullscreen-options-menu" hidden>
              <div class="fullscreen-options-header">
                <strong>Reader controls</strong>
                <span>Compact fullscreen settings</span>
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
                <button type="button" data-fs-mark-tab="selection" class="active">Selection</button>
                <button type="button" data-fs-mark-tab="notebook">Notebook</button>
                <button type="button" data-fs-mark-tab="history">History</button>
              </nav>
              <div id="fullscreen-mark-selection" data-fs-mark-panel="selection"></div>
              <div id="fullscreen-mark-notebook" data-fs-mark-panel="notebook" hidden></div>
              <div id="fullscreen-mark-history" data-fs-mark-panel="history" hidden></div>
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

  reader.addEventListener('click', (event) => {
    const translatedWord = event.target.closest('.translated-word');
    if (translatedWord && state.language !== 'en') {
      handleTranslatedWordClick(event);
      return;
    }

    const clickedWord = event.target.closest('.reader-word[data-index]');
    const mode = getSelectedMode();
    const seekableModes = new Set(['highlight', 'bold-focus', 'smooth-glide', 'pointing-guide', 'marquee', 'auto-scroll']);

    // In full-text modes, clicking a specific word changes the reading position
    // instead of merely toggling pause. Snap to the beginning of that word's
    // current reading group so Highlight/Bold/Meaningful Chunks remain aligned.
    if (clickedWord && seekableModes.has(mode)) {
      event.preventDefault();
      event.stopPropagation();
      const clickedIndex = Number(clickedWord.dataset.index);
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

    // Non-word reader-surface clicks bubble to #reader-frame, which owns the
    // protected blank-space pause/resume contract for the entire reading canvas.
  });

  readerFrame?.addEventListener('click', (event) => {
    if (event.defaultPrevented) return;

    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    // Viewer chrome must never toggle playback. The reading article itself is
    // intentionally NOT excluded so its blank areas use the same contract as
    // the surrounding canvas margins.
    if (target.closest('button, a, input, textarea, select, summary, [contenteditable="true"], [role="textbox"], #fullscreen-control-strip, #fullscreen-mark-drawer, #reader-bookmark-layer, #focus-anchor-overlay')) return;

    const clickedWord = target.closest('.reader-word[data-index]');
    const mode = getSelectedMode();
    const seekableModes = new Set(['highlight', 'bold-focus', 'smooth-glide', 'pointing-guide', 'marquee', 'auto-scroll']);
    if (clickedWord && seekableModes.has(mode)) return;

    // A live text selection belongs to Ask Mark/selection behavior and must not
    // also toggle playback.
    if (selectionBelongsToReader()) return;

    if (isReaderRunning()) pauseReader();
    else startReader();
    persistReaderSession();
  });
  bindDictionaryMenu(reader);
  window.requestAnimationFrame(updateReaderBookmarkMarkers);
  app.querySelector('#start-reader').addEventListener('click', () => { startReader(); persistReaderSession(); });
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
function renderFullscreenMarkHistory() {
  const panel=app.querySelector('#fullscreen-mark-history'); if(!panel)return;
  const items=markRecordsForCurrentBook(MARK_HISTORY_KEY);
  panel.innerHTML=`<div class="mark-list-heading"><strong>Conversation History</strong><small>${items.length} requests</small></div>${items.length?items.map(item=>`<article class="mark-record"><span>${escapeHtml(item.action)}${item.question?` · ${escapeHtml(item.question)}`:''}</span><blockquote>${escapeHtml(item.selection.slice(0,250))}${item.selection.length>250?'…':''}</blockquote><p>${escapeHtml(item.result?.response?.slice(0,420)||'')}</p><div><button type="button" data-mark-jump="${item.startIndex}">Return to passage</button></div></article>`).join(''):'<p class="mark-empty-note">Your Ask Mark requests will appear here.</p>'}`;
  bindMarkRecordButtons(panel,MARK_HISTORY_KEY);
}
function activateFullscreenMarkTab(tab='selection'){
  app.querySelectorAll('[data-fs-mark-tab]').forEach(b=>b.classList.toggle('active',b.dataset.fsMarkTab===tab));
  app.querySelectorAll('[data-fs-mark-panel]').forEach(p=>p.hidden=p.dataset.fsMarkPanel!==tab);
  if(tab==='selection')renderFullscreenMarkSelection();
  if(tab==='notebook')renderFullscreenMarkNotebook();
  if(tab==='history')renderFullscreenMarkHistory();
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
    closeMenu();
    closeMarkDrawer();
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
  state.fullscreenOptionsObserver = null;
  const fullscreenToggleButton = app.querySelector('#toggle-reader-fullscreen');
  fullscreenToggleButton?.addEventListener('click', () => {
    window.setTimeout(() => {
      if (!readerFrame.isConnected || !isFullscreen()) return;
      strip.classList.remove('controls-hidden');
      readerFrame.classList.remove('fullscreen-controls-hidden');
      closeMenu();
      closeMarkDrawer();
      syncFromMain();
      requestAnimationFrame(refreshFocusAnchorFullscreenLayout);
    }, 0);
  });

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
      <details class="reader-control-group"><summary>Media</summary><div id="reader-control-media" class="reader-control-group-body"></div></details>
      <details class="reader-control-group"><summary>Translation &amp; Word Tools</summary><div id="reader-control-language" class="reader-control-group-body"></div></details>
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
  if (Number.isFinite(savedLeft)) layout.style.setProperty('--navigation-width', `${Math.max(150, Math.min(420, savedLeft))}px`);
  if (Number.isFinite(savedRight)) layout.style.setProperty('--word-panel-width', `${Math.max(180, Math.min(480, savedRight))}px`);

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
      const width = Math.max(side === 'left' ? 150 : 180, Math.min(side === 'left' ? 420 : 480, next));
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


function dictionaryResultMarkup(word, definition, partOfSpeech = '', example = '', saved = false) {
  return `
    <div class="mark-response-heading"><span>Ask Mark</span><strong>Word lookup</strong></div>
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

async function performDictionaryLookup(saveAfter = false, target = 'tools') {
  const context = state.contextWord;
  if (!context) return;

  if (target === 'mark') {
    openMarkPanel('selection');
    renderMarkSelectionCard();
    const markPanel = app.querySelector('#mark-response');
    if (markPanel) {
      markPanel.hidden = false;
      markPanel.innerHTML = `<div class="mark-response-heading"><span>Ask Mark</span><strong>Word lookup</strong></div><h2>${escapeHtml(context.word)}</h2><p class="status">Looking up definition…</p>`;
    }
  } else {
    openWordPanelForDictionary();
    const toolsPanel = app.querySelector('#word-result');
    if (toolsPanel) toolsPanel.innerHTML = `<h2>${escapeHtml(context.word)}</h2><p class="status">Looking up definition…</p>`;
  }

  try {
    const result = await lookupDictionaryWord(context.word);
    showDictionaryResult(result.word, result.definition, result.partOfSpeech, result.example, false, target);
    if (saveAfter) saveCurrentDefinition(result);
  } catch (error) {
    const panel = target === 'mark' ? app.querySelector('#mark-response') : app.querySelector('#word-result');
    if (panel) {
      panel.hidden = false;
      panel.innerHTML = `<div class="mark-response-heading"><span>Ask Mark</span><strong>Word lookup</strong></div><h2>${escapeHtml(context.word)}</h2><p class="status error">${escapeHtml(error.message)}</p>`;
    }
  }
}

function saveCurrentDefinition(result) {
  const context = state.contextWord;
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
  context.element.classList.add('saved-definition-word');
  renderNavigationPane();
  showDictionaryResult(item.word, item.definition, item.partOfSpeech, item.example, true);
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
  const absoluteTop = wordElement.offsetTop + reader.scrollTop;
  const pageNumber = Math.max(1, Math.floor(absoluteTop / viewportHeight) + 1);
  return { pageNumber, pageKey: `scroll-page-${pageNumber}`, side: 'single' };
}

function bookmarkForContextWord() {
  const context = state.contextWord;
  if (!context || !state.documentId) return null;
  const page = bookmarkPageForWord(context.element);
  return getReaderBookmarks().find((item) => item.documentId === state.documentId && item.pageKey === page.pageKey) || null;
}

function toggleBookmarkForContextWord() {
  const context = state.contextWord;
  if (!context || !state.documentId) return;
  const page = bookmarkPageForWord(context.element);
  const items = getReaderBookmarks();
  const existing = items.find((item) => item.documentId === state.documentId && item.pageKey === page.pageKey);

  if (existing) {
    saveReaderBookmarks(items.filter((item) => item.id !== existing.id));
    updateReaderStatus?.(`Bookmark removed from page ${page.pageNumber}.`);
  } else {
    items.push({
      id: `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      documentId: state.documentId,
      title: state.title,
      wordIndex: Number(context.index) || 0,
      pageNumber: page.pageNumber,
      pageKey: page.pageKey,
      side: page.side,
      createdAt: new Date().toISOString()
    });
    saveReaderBookmarks(items);
    updateReaderStatus?.(`Bookmark added to page ${page.pageNumber}.`);
  }
  updateReaderBookmarkMarkers();
  renderNavigationPane();
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

function updateReaderBookmarkMarkers() {
  const layer = app.querySelector('#reader-bookmark-layer');
  const reader = app.querySelector('#reader');
  if (!layer || !reader || !state.documentId) return;

  const visiblePages = visibleReaderBookmarkPages();
  const bookmarks = getReaderBookmarks().filter((item) => item.documentId === state.documentId && visiblePages.includes(Number(item.pageNumber)));
  layer.innerHTML = bookmarks.map((item) => {
    const sideClass = state.bookPages ? (Number(item.pageNumber) % 2 === 0 ? 'bookmark-right-page' : 'bookmark-left-page') : 'bookmark-single-page';
    return `<button type="button" class="reader-page-bookmark ${sideClass}" data-remove-reader-bookmark="${escapeHtml(item.id)}" title="Remove bookmark from page ${Number(item.pageNumber)}" aria-label="Remove bookmark from page ${Number(item.pageNumber)}"><span aria-hidden="true"></span></button>`;
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
    event.preventDefault();
    event.stopImmediatePropagation();

    app.querySelectorAll('#reader .reader-context-word').forEach((node) => node.classList.remove('reader-context-word'));
    context.element?.classList?.add('reader-context-word');
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
  menu.querySelector('[data-dictionary-action="lookup"]')?.addEventListener('click', () => {
    closeDictionaryMenu();
    performDictionaryLookup(false, 'mark');
  });
  menu.querySelector('[data-dictionary-action="save"]')?.addEventListener('click', () => {
    closeDictionaryMenu();
    performDictionaryLookup(true, 'mark');
  });
  menu.querySelector('[data-dictionary-action="note"]')?.addEventListener('click', () => {
    closeDictionaryMenu();
    const existing = notesForCurrentDocument().find((item) => Number(item.wordIndex) === Number(state.contextWord?.index));
    showNoteEditor(state.contextWord, existing || null);
  });
  menu.querySelector('[data-dictionary-action="bookmark"]')?.addEventListener('click', () => {
    closeDictionaryMenu();
    toggleBookmarkForContextWord();
  });
  document.addEventListener('pointerdown', (event) => {
    // Close only for a primary-button press outside the custom menu. A generic
    // document click listener can run after a right-click on some browsers and
    // hide the menu immediately after it opens.
    if (event.button !== 0 || menu.contains(event.target)) return;
    closeDictionaryMenu();
  }, true);
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

