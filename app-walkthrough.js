(function () {
  'use strict';

  const ROOT_ID = 'msg-app-walkthrough';
  const ACTIVE_CLASS = 'msg-walkthrough-active';
  const HIGHLIGHT_CLASS = 'msg-walkthrough-target';
  let root = null;
  let currentIndex = 0;
  let activeTarget = null;
  let resizeRaf = 0;
  let finishing = false;

  const wait = (ms = 70) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  function closeHeaderMenus(except = null) {
    $$('.site-header nav > details[open]').forEach((menu) => {
      if (menu !== except) menu.open = false;
    });
  }

  function headerMenuContaining(selector) {
    return $(selector)?.closest('.site-header nav > details') || null;
  }

  async function openHeaderMenu(selector) {
    const menu = headerMenuContaining(selector) || $(selector);
    if (!menu) return;
    closeHeaderMenus(menu);
    if (menu.matches('details')) menu.open = true;
    await wait();
  }

  async function prepareReader() {
    closeHeaderMenus();
    if (window.MarkSetGoWalkthroughReader?.prepare) {
      await window.MarkSetGoWalkthroughReader.prepare();
    } else {
      document.querySelector('.top-reader-return')?.click();
    }
    await wait(180);
  }

  function readerSettingsPanels() {
    return $$('.reader-toolbar > details.settings-panel');
  }

  async function openReadingSettings() {
    await prepareReader();
    const panels = readerSettingsPanels();
    panels.forEach((panel, index) => { panel.open = index === 0; });
    await wait();
  }

  async function openDisplaySettings() {
    await prepareReader();
    const panels = readerSettingsPanels();
    panels.forEach((panel, index) => { panel.open = index === 1; });
    await wait();
  }

  async function openContents() {
    await prepareReader();
    const button = $('#toggle-navigation-pane');
    if (button && button.getAttribute('aria-pressed') !== 'true') button.click();
    await wait(120);
  }

  async function openAskMark(view = 'chat') {
    await prepareReader();
    const button = $('#toggle-mark-panel');
    if (button && button.getAttribute('aria-pressed') !== 'true') button.click();
    await wait(180);

    if (view === 'chat') {
      const back = $('[data-askmark-view-panel]:not([hidden]) [data-askmark-back]');
      if (back) back.click();
    } else {
      const viewButton = $(`[data-askmark-view="${view}"]`);
      if (viewButton) viewButton.click();
    }
    await wait(120);
  }

  async function closeAskMark() {
    const close = $('[data-askmark-close]');
    if (close) close.click();
    await wait();
  }

  const steps = [
    {
      title: 'Reader',
      text: 'Return to the active Reader from anywhere in the app. Your current book, reading position, and Reader settings are kept separate from the page you are browsing.',
      selector: '.top-reader-return',
      prepare: async () => { closeHeaderMenus(); }
    },
    {
      title: 'My Library',
      text: 'My Library is the home for your books, saved reading, collections, progress, and actions. The walkthrough will show each option in this menu.',
      selector: '.library-menu-root > summary',
      prepare: async () => { await openHeaderMenu('.library-menu-root'); }
    },
    {
      title: 'Library Home',
      text: 'Continue reading and manage the books available to your account and browser from one place.',
      selector: '.library-menu-root [data-action="my-library"]',
      prepare: async () => { await openHeaderMenu('.library-menu-root'); }
    },
    {
      title: 'My Reading',
      text: 'Review reading-list status, saved editions, and books you are actively working through.',
      selector: '.library-menu-root [data-action="my-reading"]',
      prepare: async () => { await openHeaderMenu('.library-menu-root'); }
    },
    {
      title: 'Read Anything',
      text: 'Import a webpage, PDF, EPUB, text file, or pasted text. The formatter can clean difficult OCR and preserve document structure before you read.',
      selector: '.library-menu-root [data-read="upload"]',
      prepare: async () => { await openHeaderMenu('.library-menu-root'); }
    },
    {
      title: 'Bookmarks',
      text: 'Open your saved bookmarks across books and return to marked reading locations.',
      selector: '.library-menu-root [data-action="library-bookmarks"]',
      prepare: async () => { await openHeaderMenu('.library-menu-root'); }
    },
    {
      title: 'Notes',
      text: 'Open notes associated with your reading and saved passages.',
      selector: '.library-menu-root [data-action="library-notes"]',
      prepare: async () => { await openHeaderMenu('.library-menu-root'); }
    },
    {
      title: 'Definitions',
      text: 'Review words and definitions you saved while reading.',
      selector: '.library-menu-root [data-action="vocabulary-builder"]',
      prepare: async () => { await openHeaderMenu('.library-menu-root'); }
    },
    {
      title: 'Progress & Awards',
      text: 'See reading speed, comprehension, completion, consistency, goals, and earned awards in one dashboard.',
      selector: '.library-menu-root [data-action="progress-awards"]',
      prepare: async () => { await openHeaderMenu('.library-menu-root'); }
    },
    {
      title: 'Action Center',
      text: 'Turn reading insights into reminders, follow-ups, scheduled actions, and practical next steps.',
      selector: '.library-menu-root [data-action="action-center"]',
      prepare: async () => { await openHeaderMenu('.library-menu-root'); }
    },
    {
      title: 'Browse',
      text: 'Browse brings together discovery sources and tools for finding what to read next.',
      selector: '.site-header nav > details:nth-of-type(2) > summary',
      prepare: async () => { await openHeaderMenu('.site-header nav > details:nth-of-type(2)'); }
    },
    {
      title: 'Browse Libraries',
      text: 'Search supported libraries and discovery sources from a single browse experience.',
      selector: '.site-header nav > details:nth-of-type(2) [data-action="browse"]',
      prepare: async () => { await openHeaderMenu('.site-header nav > details:nth-of-type(2)'); }
    },
    {
      title: 'Great Books',
      text: 'Explore the Great Books collection and open available full texts for reading and study.',
      selector: '.site-header nav > details:nth-of-type(2) [data-read="great-books"]',
      prepare: async () => { await openHeaderMenu('.site-header nav > details:nth-of-type(2)'); }
    },
    {
      title: 'Bible Study',
      text: 'Open the Bible-study workspace for translations, commentary, cross references, and structured study with Mark.',
      selector: '.site-header nav > details:nth-of-type(2) [data-read="bible"]',
      prepare: async () => { await openHeaderMenu('.site-header nav > details:nth-of-type(2)'); }
    },
    {
      title: 'Read Anything from Browse',
      text: 'The same importer is also available from Browse so you can move directly from discovery to your own source material.',
      selector: '.site-header nav > details:nth-of-type(2) [data-read="upload"]',
      prepare: async () => { await openHeaderMenu('.site-header nav > details:nth-of-type(2)'); }
    },
    {
      title: 'My Links',
      text: 'Save and open your own useful reading and research links from inside the app.',
      selector: '.site-header nav > details:nth-of-type(2) [data-action="my-links"]',
      prepare: async () => { await openHeaderMenu('.site-header nav > details:nth-of-type(2)'); }
    },
    {
      title: 'Learn',
      text: 'Learn contains focused practice and study tools that complement the Reader.',
      selector: '.site-header nav > details:nth-of-type(3) > summary',
      prepare: async () => { await openHeaderMenu('.site-header nav > details:nth-of-type(3)'); }
    },
    {
      title: 'Great Ideas',
      text: 'Use Great Ideas for syntopical exploration and connections across important themes and works.',
      selector: '.site-header nav > details:nth-of-type(3) [data-read="syntopicon"]',
      prepare: async () => { await openHeaderMenu('.site-header nav > details:nth-of-type(3)'); }
    },
    {
      title: 'WPM Test',
      text: 'Measure your natural reading speed so Reader pacing and goals have a meaningful baseline.',
      selector: '.site-header nav > details:nth-of-type(3) [data-test="wpm"]',
      prepare: async () => { await openHeaderMenu('.site-header nav > details:nth-of-type(3)'); }
    },
    {
      title: 'Vocabulary Builder',
      text: 'Practice and review vocabulary collected from your reading.',
      selector: '.site-header nav > details:nth-of-type(3) [data-action="vocabulary-builder"]',
      prepare: async () => { await openHeaderMenu('.site-header nav > details:nth-of-type(3)'); }
    },
    {
      title: 'My Notebook',
      text: 'Your global notebook combines passages, Ask Mark responses, and your own thoughts across books.',
      selector: '.site-header [data-action="mark-notebook"]',
      prepare: async () => { closeHeaderMenus(); }
    },
    {
      title: 'Music & Focus',
      text: 'Choose ambient audio, reading moods, or supported media integrations to accompany a reading session.',
      selector: '.site-header [data-action="music"]',
      prepare: async () => { closeHeaderMenus(); }
    },
    {
      title: 'About Us',
      text: 'Company information, support, privacy, and terms live together here.',
      selector: '.company-menu > summary',
      prepare: async () => { await openHeaderMenu('.company-menu'); }
    },
    {
      title: 'About',
      text: 'Read about Mark, Set, Go! and the purpose behind the reading platform.',
      selector: '.company-menu [data-action="about"]',
      prepare: async () => { await openHeaderMenu('.company-menu'); }
    },
    {
      title: 'Contact & Support',
      text: 'Find contact and support information when you need help beyond the built-in guide.',
      selector: '.company-menu [data-action="contact"]',
      prepare: async () => { await openHeaderMenu('.company-menu'); }
    },
    {
      title: 'Privacy',
      text: 'Review how the application handles privacy and account-related information.',
      selector: '.company-menu [data-action="privacy"]',
      prepare: async () => { await openHeaderMenu('.company-menu'); }
    },
    {
      title: 'Terms',
      text: 'Review the application terms and usage information.',
      selector: '.company-menu [data-action="terms"]',
      prepare: async () => { await openHeaderMenu('.company-menu'); }
    },
    {
      title: 'Help',
      text: 'Help contains the written guide and this live walkthrough. You can restart the tour here whenever you want.',
      selector: '#top-help-button',
      prepare: async () => { closeHeaderMenus(); }
    },
    {
      title: 'Reading settings',
      text: 'Now we are inside the real Reader. Reading settings control the reading mode, pointer, speed, and how many words are shown at a time.',
      selector: '.reader-toolbar > details.settings-panel:first-child > summary',
      prepare: openReadingSettings
    },
    {
      title: 'Reading mode',
      text: 'Switch among Highlight, Bold Focus, Smooth Glide, Pointing Guide, Marquee, Flash, Digital Sign, Auto Scroll, and Pac-Man without changing the underlying book position.',
      selector: '#mode-select',
      prepare: openReadingSettings
    },
    {
      title: 'Pointer style',
      text: 'When a guided pointer is active, choose the visual guide that best helps your eyes track the line.',
      selector: '#pointer-style',
      prepare: openReadingSettings
    },
    {
      title: 'Reading speed',
      text: 'Set the Reader pace in words per minute. The selected WPM is also shown beneath the Reader.',
      selector: '#speed',
      prepare: openReadingSettings
    },
    {
      title: 'Words shown',
      text: 'Control the maximum number of words shown in each reading step, and optionally let Meaningful Chunks group words around natural phrases.',
      selector: '#word-count',
      prepare: openReadingSettings
    },
    {
      title: 'Display settings',
      text: 'Display controls change presentation without changing your reading position.',
      selector: '.reader-toolbar > details.settings-panel:nth-child(2) > summary',
      prepare: openDisplaySettings
    },
    {
      title: 'Font',
      text: 'Choose a font that is comfortable for sustained reading, including serif, sans-serif, monospace, and dyslexia-friendly options.',
      selector: '#font-family',
      prepare: openDisplaySettings
    },
    {
      title: 'Text size',
      text: 'Change Reader text size independently from the rest of the application.',
      selector: '#font-size',
      prepare: openDisplaySettings
    },
    {
      title: 'Reader theme',
      text: 'Switch the Reader itself between dark and light presentation while keeping the surrounding app theme consistent.',
      selector: '#theme-select',
      prepare: openDisplaySettings
    },
    {
      title: 'Bionic text',
      text: 'Bionic text adds typographic emphasis within words as an optional focus aid.',
      selector: '#bionic-reading',
      prepare: openDisplaySettings
    },
    {
      title: 'Center focus anchor',
      text: 'Keep the active word or phrase at a stable central point when using compatible guided-reading modes.',
      selector: '#focus-anchor',
      prepare: openDisplaySettings
    },
    {
      title: 'Book pages',
      text: 'Show text as facing pages while preserving the canonical word position underneath the visual pagination.',
      selector: '#book-pages',
      prepare: openDisplaySettings
    },
    {
      title: 'Marks & Contents',
      text: 'Open the left pane for the table of contents and saved marks. TOC navigation jumps directly to the destination rather than requiring you to scroll through the entire book.',
      selector: '#toggle-navigation-pane',
      prepare: openContents
    },
    {
      title: 'Contents pane',
      text: 'This pane shows the current document structure and navigation points. Its width can be resized without changing the Reader position.',
      selector: '#navigation-pane',
      prepare: openContents
    },
    {
      title: 'Ask Mark',
      text: 'Ask Mark opens as the right-side reading companion. It shares the Reader context while leaving the text itself in place.',
      selector: '#toggle-mark-panel',
      prepare: async () => { await openAskMark('chat'); }
    },
    {
      title: 'Ask Mark conversation',
      text: 'Highlight a passage or type a question. Mark can explain ideas, summarize, compare viewpoints, quiz you, or help you work through the current text.',
      selector: '[data-askmark-view-panel="chat"]',
      prepare: async () => { await openAskMark('chat'); }
    },
    {
      title: 'Ask Mark input',
      text: 'Type a question here. AI is not called merely because you highlighted text; it is called only when you deliberately ask for help or choose an AI action.',
      selector: '[data-askmark-input]',
      prepare: async () => { await openAskMark('chat'); }
    },
    {
      title: 'Mark’s Notebook',
      text: 'Open the Notebook inside Ask Mark to save the passage, Mark’s response, your own notes, and the reading location together.',
      selector: '[data-askmark-view="notebook"]',
      prepare: async () => { await openAskMark('notebook'); }
    },
    {
      title: 'Format',
      text: 'Format cleans difficult text while preserving the original. Standard cleanup works locally; AI Deep Clean adds context-aware OCR repair and structure recognition.',
      selector: '[data-askmark-view="format"]',
      prepare: async () => { await openAskMark('format'); }
    },
    {
      title: 'Formatter cleanup level',
      text: 'Choose Light, Standard, or AI Deep Clean. Deep Clean is structure-aware, so prose, contents, poetry, bibliography, and front matter are not all treated the same way.',
      selector: '.askmark-format-levels',
      prepare: async () => { await openAskMark('format'); }
    },
    {
      title: 'Reader Settings in Ask Mark',
      text: 'The gear opens Reader settings inside the right pane so you can adjust reading preferences without leaving your companion workspace.',
      selector: '[data-askmark-view="tools"]',
      prepare: async () => { await openAskMark('tools'); }
    },
    {
      title: 'Close Ask Mark',
      text: 'Close the companion pane at any time. Your Reader remains at the same location.',
      selector: '[data-askmark-close]',
      prepare: async () => { await openAskMark('chat'); }
    },
    {
      title: 'Full screen',
      text: 'Full screen keeps the main Reader controls available in a compact overlay, including Reading, Display, Media, Translation, and Ask Mark.',
      selector: '#toggle-reader-fullscreen',
      prepare: async () => { await closeAskMark(); await prepareReader(); }
    }
  ];

  function ensureRoot() {
    if (root?.isConnected) return root;
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="msg-walkthrough-mask msg-walkthrough-mask-top"></div>
      <div class="msg-walkthrough-mask msg-walkthrough-mask-left"></div>
      <div class="msg-walkthrough-mask msg-walkthrough-mask-right"></div>
      <div class="msg-walkthrough-mask msg-walkthrough-mask-bottom"></div>
      <div class="msg-walkthrough-outline" aria-hidden="true"></div>
      <section class="msg-walkthrough-card" role="dialog" aria-modal="true" aria-labelledby="msg-walkthrough-title">
        <div class="msg-walkthrough-meta"><span data-walkthrough-count></span><button type="button" data-walkthrough-exit aria-label="Exit walkthrough">×</button></div>
        <h2 id="msg-walkthrough-title" data-walkthrough-title></h2>
        <p data-walkthrough-text></p>
        <div class="msg-walkthrough-actions">
          <button class="secondary" type="button" data-walkthrough-prev>← Back</button>
          <button class="primary" type="button" data-walkthrough-next>Next →</button>
        </div>
      </section>`;
    document.body.appendChild(root);

    $('[data-walkthrough-prev]', root)?.addEventListener('click', () => goTo(currentIndex - 1));
    $('[data-walkthrough-next]', root)?.addEventListener('click', () => {
      if (currentIndex >= steps.length - 1) finish();
      else goTo(currentIndex + 1);
    });
    $('[data-walkthrough-exit]', root)?.addEventListener('click', finish);
    window.addEventListener('resize', schedulePosition, { passive: true });
    window.addEventListener('scroll', schedulePosition, { passive: true, capture: true });
    document.addEventListener('keydown', handleKeydown);
    return root;
  }

  function handleKeydown(event) {
    if (!root || root.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      finish();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (currentIndex >= steps.length - 1) finish();
      else goTo(currentIndex + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(currentIndex - 1);
    }
  }

  function clearTarget() {
    if (activeTarget) activeTarget.classList.remove(HIGHLIGHT_CLASS);
    activeTarget = null;
  }

  function schedulePosition() {
    window.cancelAnimationFrame(resizeRaf);
    resizeRaf = window.requestAnimationFrame(positionOverlay);
  }

  function positionOverlay() {
    if (!root || root.hidden || !activeTarget?.isConnected) return;
    const rect = activeTarget.getBoundingClientRect();
    const pad = 7;
    const left = Math.max(6, rect.left - pad);
    const top = Math.max(6, rect.top - pad);
    const right = Math.min(window.innerWidth - 6, rect.right + pad);
    const bottom = Math.min(window.innerHeight - 6, rect.bottom + pad);
    const width = Math.max(12, right - left);
    const height = Math.max(12, bottom - top);

    const outline = $('.msg-walkthrough-outline', root);
    Object.assign(outline.style, {
      left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`
    });

    const masks = {
      top: $('.msg-walkthrough-mask-top', root),
      left: $('.msg-walkthrough-mask-left', root),
      right: $('.msg-walkthrough-mask-right', root),
      bottom: $('.msg-walkthrough-mask-bottom', root)
    };
    Object.assign(masks.top.style, { left: '0px', top: '0px', width: '100vw', height: `${top}px` });
    Object.assign(masks.bottom.style, { left: '0px', top: `${bottom}px`, width: '100vw', height: `${Math.max(0, window.innerHeight - bottom)}px` });
    Object.assign(masks.left.style, { left: '0px', top: `${top}px`, width: `${left}px`, height: `${height}px` });
    Object.assign(masks.right.style, { left: `${right}px`, top: `${top}px`, width: `${Math.max(0, window.innerWidth - right)}px`, height: `${height}px` });

    const card = $('.msg-walkthrough-card', root);
    const cardWidth = Math.min(390, window.innerWidth - 24);
    card.style.width = `${cardWidth}px`;
    const cardRect = card.getBoundingClientRect();
    let cardLeft = Math.min(Math.max(12, left), window.innerWidth - cardWidth - 12);
    let cardTop = bottom + 14;
    if (cardTop + cardRect.height > window.innerHeight - 12) cardTop = top - cardRect.height - 14;
    if (cardTop < 12) {
      cardTop = Math.min(window.innerHeight - cardRect.height - 12, 12);
      if (right + cardWidth + 16 < window.innerWidth) cardLeft = right + 12;
      else if (left - cardWidth - 16 > 0) cardLeft = left - cardWidth - 12;
    }
    Object.assign(card.style, { left: `${Math.max(12, cardLeft)}px`, top: `${Math.max(12, cardTop)}px` });
  }

  async function resolveTarget(step) {
    let target = typeof step.selector === 'function' ? step.selector() : $(step.selector);
    if (!target && step.fallbackSelector) target = $(step.fallbackSelector);
    if (!target) return null;

    const rect = target.getBoundingClientRect();
    if (rect.top < 72 || rect.bottom > window.innerHeight - 20) {
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      await wait(80);
    }
    return target;
  }

  async function goTo(index) {
    if (finishing) return;
    currentIndex = Math.max(0, Math.min(steps.length - 1, index));
    const step = steps[currentIndex];
    clearTarget();

    if (step.prepare) {
      try { await step.prepare(); } catch (error) { console.warn('Walkthrough step preparation failed:', error); }
    }

    await wait(45);
    const target = await resolveTarget(step);
    if (!target) {
      console.warn('Walkthrough target unavailable:', step.selector);
      if (currentIndex < steps.length - 1) return goTo(currentIndex + 1);
      return finish();
    }

    activeTarget = target;
    activeTarget.classList.add(HIGHLIGHT_CLASS);

    $('[data-walkthrough-title]', root).textContent = step.title;
    $('[data-walkthrough-text]', root).textContent = step.text;
    $('[data-walkthrough-count]', root).textContent = `${currentIndex + 1} of ${steps.length}`;
    $('[data-walkthrough-prev]', root).disabled = currentIndex === 0;
    $('[data-walkthrough-next]', root).textContent = currentIndex === steps.length - 1 ? 'Finish' : 'Next →';
    schedulePosition();
  }

  async function start() {
    finishing = false;
    ensureRoot();
    root.hidden = false;
    document.documentElement.classList.add(ACTIVE_CLASS);
    document.body.classList.add(ACTIVE_CLASS);
    currentIndex = 0;
    await goTo(0);
  }

  async function finish() {
    if (finishing) return;
    finishing = true;
    clearTarget();
    closeHeaderMenus();
    if (root) root.hidden = true;
    document.documentElement.classList.remove(ACTIVE_CLASS);
    document.body.classList.remove(ACTIVE_CLASS);

    try {
      await window.MarkSetGoWalkthroughReader?.restore?.();
    } catch (error) {
      console.warn('Walkthrough Reader restore failed:', error);
    }

    const helpButton = $('#top-help-button');
    if (helpButton) helpButton.click();
    finishing = false;
  }

  window.MarkSetGoWalkthrough = Object.freeze({ start, finish });
})();
