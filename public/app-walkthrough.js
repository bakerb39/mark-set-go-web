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
  let menuMirror = null;
  let menuMirrorSource = null;

  const wait = (ms = 70) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  function isVisibleElement(element) {
    if (!element?.isConnected) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width >= 2 && rect.height >= 2;
  }

  function visibleMatch(selector, scope = document) {
    if (!selector) return null;
    return $$(selector, scope).find(isVisibleElement) || null;
  }

  function clearMenuMirror() {
    if (menuMirror?.isConnected) menuMirror.remove();
    menuMirror = null;
    menuMirrorSource = null;
    $$('.site-header .menu-popover [data-walkthrough-menu-key]').forEach((node) => {
      node.removeAttribute('data-walkthrough-menu-key');
    });
  }

  function buildMenuMirror(menu) {
    clearMenuMirror();
    if (!root || !menu) return null;
    const summary = menu.querySelector(':scope > summary');
    const popover = menu.querySelector(':scope > .menu-popover');
    if (!summary || !popover) return null;

    Array.from(popover.querySelectorAll('summary,button,a,[role="menuitem"]')).forEach((node, index) => {
      node.setAttribute('data-walkthrough-menu-key', `walkthrough-menu-${index}`);
    });

    const clone = popover.cloneNode(true);
    clone.classList.add('msg-walkthrough-menu-mirror');
    clone.removeAttribute('role');
    clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    clone.querySelectorAll('summary,button,a,input,select,textarea').forEach((node) => {
      node.tabIndex = -1;
      node.setAttribute('aria-hidden', 'true');
    });
    root.appendChild(clone);
    menuMirror = clone;
    menuMirrorSource = menu;
    positionMenuMirror();
    return clone;
  }

  function positionMenuMirror() {
    if (!menuMirror?.isConnected || !menuMirrorSource?.isConnected) return;
    const summary = menuMirrorSource.querySelector(':scope > summary');
    if (!summary) return;
    const rect = summary.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.max(270, Math.min(360, menuMirror.scrollWidth || 320));
    let left = Math.max(10, rect.left);
    if (left + width > vw - 10) left = Math.max(10, vw - width - 10);
    const top = Math.max(8, Math.min(vh - 90, rect.bottom + 6));
    Object.assign(menuMirror.style, {
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(width)}px`,
      maxHeight: `${Math.max(160, Math.round(vh - top - 12))}px`
    });
  }

  function mirrorForOriginal(original) {
    if (!original || !menuMirror?.isConnected) return null;
    const key = original.getAttribute('data-walkthrough-menu-key');
    if (!key) return null;
    const mirrored = menuMirror.querySelector(`[data-walkthrough-menu-key="${key}"]`);
    return isVisibleElement(mirrored) ? mirrored : null;
  }

  function clearPinnedMenu() {
    $$('.site-header .menu-popover.msg-walkthrough-pinned-menu').forEach((popover) => {
      popover.classList.remove('msg-walkthrough-pinned-menu');
      popover.style.removeProperty('--walkthrough-menu-left');
      popover.style.removeProperty('--walkthrough-menu-top');
      popover.style.removeProperty('--walkthrough-menu-width');
      popover.style.removeProperty('--walkthrough-menu-max-height');
    });
  }

  function pinMenuPopover(menu) {
    if (!menu) return;
    const summary = menu.querySelector(':scope > summary');
    const popover = menu.querySelector(':scope > .menu-popover');
    if (!summary || !popover) return;

    clearMenuMirror();

    const summaryRect = summary.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const preferredWidth = Math.max(
      260,
      Math.min(360, Math.max(popover.scrollWidth || 0, summaryRect.width))
    );

    let left = summaryRect.left;
    if (left + preferredWidth > viewportWidth - 10) {
      left = Math.max(10, viewportWidth - preferredWidth - 10);
    }
    const top = Math.min(viewportHeight - 80, summaryRect.bottom + 6);
    const maxHeight = Math.max(180, viewportHeight - top - 12);

    popover.style.setProperty('--walkthrough-menu-left', `${Math.round(left)}px`);
    popover.style.setProperty('--walkthrough-menu-top', `${Math.round(top)}px`);
    popover.style.setProperty('--walkthrough-menu-width', `${Math.round(preferredWidth)}px`);
    popover.style.setProperty('--walkthrough-menu-max-height', `${Math.round(maxHeight)}px`);
    popover.classList.add('msg-walkthrough-pinned-menu');
  }

  function closeHeaderMenus(except = null) {
    $$('.site-header nav > details').forEach((menu) => {
      if (menu !== except) {
        menu.open = false;
        menu.classList.remove('msg-walkthrough-open-menu');
      }
    });
    if (!except || menuMirrorSource !== except) clearMenuMirror();
  }

  function headerMenuContaining(selector) {
    return $(selector)?.closest('.site-header nav > details') || null;
  }

  async function openHeaderMenu(selector) {
    const requested = visibleMatch(selector) || $(selector);
    const menu = requested?.matches?.('.site-header nav > details')
      ? requested
      : requested?.closest?.('.site-header nav > details');
    if (!menu) return;
    closeHeaderMenus(menu);
    $$('.site-header nav > details').forEach((item) => item.classList.remove('msg-walkthrough-open-menu'));
    menu.classList.add('msg-walkthrough-open-menu');
    menu.open = true;
    await wait(80);
    buildMenuMirror(menu);
    await wait(40);
  }

  async function openNestedMenu(topSelector, nestedSelector) {
    await openHeaderMenu(topSelector);
    const menu = visibleMatch(topSelector) || $(topSelector);
    const container = menu?.matches?.('.site-header nav > details') ? menu : menu?.closest?.('.site-header nav > details');
    const nested = container?.querySelector?.(nestedSelector);
    if (nested?.matches?.('details')) {
      nested.open = true;
      await wait(60);
      buildMenuMirror(container);
      await wait(40);
    }
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
      const back = visibleMatch('[data-askmark-view-panel]:not([hidden]) [data-askmark-back]');
      if (back) back.click();
    } else {
      const viewButton = visibleMatch(`[data-askmark-view="${view}"]`);
      if (viewButton) viewButton.click();
    }
    await wait(120);
  }

  async function closeAskMark() {
    const close = visibleMatch('[data-askmark-close]');
    if (close) close.click();
    await wait();
  }

  const steps = [
    {
      title: 'Welcome to the walkthrough',
      text: 'Mark will guide you through the full experience: your Library, learning tools, Reader controls, Ask Mark, and the main places you will use most often.',
      selector: '.brand',
      prepare: async () => { closeHeaderMenus(); }
    },
    {
      title: 'Reader',
      text: 'Return to your active reading session from anywhere in the app. Your place, settings, and companion tools stay tied to the current text.',
      selector: '.top-reader-return',
      prepare: async () => { closeHeaderMenus(); }
    },
    {
      title: 'My Library',
      text: 'My Library is your main home base. It groups together what you are reading, what you want to browse, your collections, and your progress.',
      selector: '.library-menu-root > summary',
      prepare: async () => { await openHeaderMenu('.library-menu-root'); }
    },
    {
      title: 'Library Home',
      text: 'Open your main library dashboard to continue reading, reopen saved books, and manage what is available to you.',
      selector: '.library-menu-root [data-action="my-library"]',
      prepare: async () => { await openHeaderMenu('.library-menu-root'); }
    },
    {
      title: 'My Reading',
      text: 'See the books and documents you are actively working through, along with saved progress and reading status.',
      selector: '.library-menu-root [data-action="my-reading"]',
      prepare: async () => { await openHeaderMenu('.library-menu-root'); }
    },
    {
      title: 'Browse inside My Library',
      text: 'Browse is now nested inside My Library so discovery lives beside your reading life instead of feeling like a separate area.',
      selector: '.library-menu-root .library-browse-submenu > summary',
      prepare: async () => { await openNestedMenu('.library-menu-root', '.library-browse-submenu'); }
    },
    {
      title: 'Browse Home',
      text: 'Search across guides, free books, popular libraries, and built-in discovery sources from one place.',
      selector: '.library-menu-root .library-browse-submenu [data-action="browse"]',
      prepare: async () => { await openNestedMenu('.library-menu-root', '.library-browse-submenu'); }
    },
    {
      title: 'Great Books',
      text: 'Open the Great Books collection for classic works, list-based browsing, and syntopical study.',
      selector: '.library-menu-root .library-browse-submenu [data-read="great-books"]',
      prepare: async () => { await openNestedMenu('.library-menu-root', '.library-browse-submenu'); }
    },
    {
      title: 'Bible Study',
      text: 'Open the Bible study area for translations, commentary, profiles, and structured study with Mark.',
      selector: '.library-menu-root .library-browse-submenu [data-read="bible"]',
      prepare: async () => { await openNestedMenu('.library-menu-root', '.library-browse-submenu'); }
    },
    {
      title: 'Read Anything',
      text: 'Import a webpage, PDF, EPUB, text file, or pasted text. The formatter can clean OCR noise and preserve structure before you read.',
      selector: '.library-menu-root .library-browse-submenu [data-read="upload"]',
      prepare: async () => { await openNestedMenu('.library-menu-root', '.library-browse-submenu'); }
    },
    {
      title: 'Collections',
      text: 'Collections groups together the things you save while reading: bookmarks, book notes, random notes, definitions, and your own links.',
      selector: '.library-menu-root .library-collections-submenu > summary',
      prepare: async () => { await openNestedMenu('.library-menu-root', '.library-collections-submenu'); }
    },
    {
      title: 'Bookmarks',
      text: 'Return to saved places in your books without hunting through the text again.',
      selector: '.library-menu-root .library-collections-submenu [data-action="library-bookmarks"]',
      prepare: async () => { await openNestedMenu('.library-menu-root', '.library-collections-submenu'); }
    },
    {
      title: 'Book Notes',
      text: 'Open notes connected to specific books and passages from your reading sessions.',
      selector: '.library-menu-root .library-collections-submenu [data-action="library-notes"]',
      prepare: async () => { await openNestedMenu('.library-menu-root', '.library-collections-submenu'); }
    },
    {
      title: 'Random Notes',
      text: 'Keep ideas and notes that are not tied to one book but still belong in your larger reading life.',
      selector: '.library-menu-root .library-collections-submenu [data-action="random-notes"]',
      prepare: async () => { await openNestedMenu('.library-menu-root', '.library-collections-submenu'); }
    },
    {
      title: 'Definitions',
      text: 'Review words, definitions, and saved vocabulary from your reading.',
      selector: '.library-menu-root .library-collections-submenu [data-action="vocabulary-builder"]',
      prepare: async () => { await openNestedMenu('.library-menu-root', '.library-collections-submenu'); }
    },
    {
      title: 'My Links',
      text: 'Save reading and research websites so they stay connected to your library workflow.',
      selector: '.library-menu-root .library-collections-submenu [data-action="my-links"]',
      prepare: async () => { await openNestedMenu('.library-menu-root', '.library-collections-submenu'); }
    },
    {
      title: 'Progress & Awards',
      text: 'Track your key reading and learning metrics here: speed, comprehension, completion, consistency, goals, and achievements.',
      selector: '.library-menu-root [data-action="progress-awards"]',
      prepare: async () => { await openHeaderMenu('.library-menu-root'); }
    },
    {
      title: 'Action Center',
      text: 'Turn ideas from your reading into concrete next steps, commitments, reminders, and scheduled action items.',
      selector: '.library-menu-root [data-action="action-center"]',
      prepare: async () => { await openHeaderMenu('.library-menu-root'); }
    },
    {
      title: 'Learn',
      text: 'Learn gathers practice and study tools that help you build skill, memory, understanding, and long-term mastery.',
      selector: '.learn-menu-root > summary',
      prepare: async () => { await openHeaderMenu('.learn-menu-root'); }
    },
    {
      title: 'Reading Skills',
      text: 'Use Reading Skills as the hub for the learning side of the app: practice speed, comprehension, memory, and deeper study.',
      selector: '.learn-menu-root [data-action="reading-skills"]',
      prepare: async () => { await openHeaderMenu('.learn-menu-root'); }
    },
    {
      title: 'Learning Tools',
      text: 'This section expands to show the individual tools you can open directly.',
      selector: '.learn-menu-root .learn-skills-submenu > summary',
      prepare: async () => { await openNestedMenu('.learn-menu-root', '.learn-skills-submenu'); }
    },
    {
      title: 'WPM Test',
      text: 'Measure your natural reading speed so the Reader and your goals have a meaningful baseline.',
      selector: '.learn-menu-root .learn-skills-submenu [data-test="wpm"]',
      prepare: async () => { await openNestedMenu('.learn-menu-root', '.learn-skills-submenu'); }
    },
    {
      title: 'Comprehension Quizzes',
      text: 'Quiz yourself on current and past books to check understanding and reinforce recall.',
      selector: '.learn-menu-root .learn-skills-submenu [data-action="comprehension-library"]',
      prepare: async () => { await openNestedMenu('.learn-menu-root', '.learn-skills-submenu'); }
    },
    {
      title: 'Great Ideas / Syntopicon',
      text: 'Compare major ideas across books and authors so your reading becomes more connected and synthetic.',
      selector: '.learn-menu-root .learn-skills-submenu [data-read="syntopicon"]',
      prepare: async () => { await openNestedMenu('.learn-menu-root', '.learn-skills-submenu'); }
    },
    {
      title: 'Mnemonics',
      text: 'Generate memory aids to help you retain important ideas from the books you are reading.',
      selector: '.learn-menu-root .learn-skills-submenu [data-action="mnemonics"]',
      prepare: async () => { await openNestedMenu('.learn-menu-root', '.learn-skills-submenu'); }
    },
    {
      title: 'Language Learning',
      text: 'Practice language skills through your reading, with tools shaped by your current book or passage.',
      selector: '.learn-menu-root .learn-skills-submenu [data-action="language-learning"]',
      prepare: async () => { await openNestedMenu('.learn-menu-root', '.learn-skills-submenu'); }
    },
    {
      title: 'Courses & Learning Modules',
      text: 'Find outside courses and learning resources tied to the books and topics you care about.',
      selector: '.learn-menu-root .learn-skills-submenu [data-action="learning-courses"]',
      prepare: async () => { await openNestedMenu('.learn-menu-root', '.learn-skills-submenu'); }
    },
    {
      title: 'My Notebook',
      text: 'Your notebook collects saved passages, Ask Mark output, and your own notes across books.',
      selector: '.site-header [data-action="mark-notebook"]',
      prepare: async () => { closeHeaderMenus(); }
    },
    {
      title: 'Music & Focus',
      text: 'Open your music, ambient, and focus tools to support longer reading sessions.',
      selector: '.site-header [data-action="music"]',
      prepare: async () => { closeHeaderMenus(); }
    },
    {
      title: 'Profile',
      text: 'Choose the kind of experience you want and decide which parts of the app should be visible or emphasized for you.',
      selector: '.site-header [data-action="profile-preferences"]',
      prepare: async () => { closeHeaderMenus(); }
    },
    {
      title: 'About Us',
      text: 'Find company information, support, privacy, and terms here.',
      selector: '.company-menu > summary',
      prepare: async () => { await openHeaderMenu('.company-menu'); }
    },
    {
      title: 'About',
      text: 'Read about the purpose behind Mark, Set, Go! and what the platform is trying to help readers do.',
      selector: '.company-menu [data-action="about"]',
      prepare: async () => { await openHeaderMenu('.company-menu'); }
    },
    {
      title: 'Contact & Support',
      text: 'Use this when you need direct help, support, or a way to get in touch.',
      selector: '.company-menu [data-action="contact"]',
      prepare: async () => { await openHeaderMenu('.company-menu'); }
    },
    {
      title: 'Privacy',
      text: 'Review how account and reading information are handled.',
      selector: '.company-menu [data-action="privacy"]',
      prepare: async () => { await openHeaderMenu('.company-menu'); }
    },
    {
      title: 'Terms',
      text: 'Review usage information and application terms.',
      selector: '.company-menu [data-action="terms"]',
      prepare: async () => { await openHeaderMenu('.company-menu'); }
    },
    {
      title: 'Help',
      text: 'Open written guidance or restart this live walkthrough whenever you want another guided tour.',
      selector: '#top-help-button',
      prepare: async () => { closeHeaderMenus(); }
    },
    {
      title: 'Reading settings',
      text: 'Now we are inside the Reader. Reading settings control reading mode, guided behavior, speed, and how many words are shown at a time.',
      selector: '.reader-toolbar > details.settings-panel:first-child > summary',
      prepare: openReadingSettings
    },
    {
      title: 'Reading mode',
      text: 'Switch among Highlight, Bold Focus, Smooth Glide, Pointing Guide, Marquee, Flash, Digital Sign, Auto Scroll, and Pac-Man.',
      selector: '#mode-select',
      prepare: openReadingSettings
    },
    {
      title: 'Reading speed',
      text: 'Set the Reader pace in words per minute. The selected WPM is also shown beneath the Reader.',
      selector: '#speed',
      prepare: openReadingSettings
    },
    {
      title: 'Display settings',
      text: 'Display controls change presentation without moving your underlying reading position.',
      selector: '.reader-toolbar > details.settings-panel:nth-child(2) > summary',
      prepare: openDisplaySettings
    },
    {
      title: 'Reader theme',
      text: 'Change the Reader appearance while keeping your overall app theme consistent.',
      selector: '#theme-select',
      prepare: openDisplaySettings
    },
    {
      title: 'Book pages',
      text: 'Turn visual pagination on or off while preserving the canonical reading position underneath.',
      selector: '#book-pages',
      prepare: openDisplaySettings
    },
    {
      title: 'Marks & Contents',
      text: 'Open the left pane for the table of contents and saved marks so you can navigate the current document more easily.',
      selector: '#toggle-navigation-pane',
      prepare: openContents
    },
    {
      title: 'Ask Mark',
      text: 'Open Mark as your reading companion. He stays tied to the current text while the Reader remains in place.',
      selector: '#toggle-mark-panel',
      prepare: async () => { await openAskMark('chat'); }
    },
    {
      title: 'Ask Mark conversation',
      text: 'Highlight a passage or ask a question. Mark can explain, summarize, compare, quiz you, or help you reflect on what you are reading.',
      selector: '[data-askmark-view-panel="chat"]',
      prepare: async () => { await openAskMark('chat'); }
    },
    {
      title: 'Format',
      text: 'Format cleans difficult text while preserving the original. It is especially useful for OCR cleanup and document structure repair.',
      selector: '[data-askmark-view="format"]',
      prepare: async () => { await openAskMark('format'); }
    },
    {
      title: 'Reader tools in Ask Mark',
      text: 'Use the tool views inside Ask Mark when you want settings, media, translation, or study support without leaving the companion pane.',
      selector: '[data-askmark-view="tools"]',
      prepare: async () => { await openAskMark('tools'); }
    },
    {
      title: 'Full screen',
      text: 'Full screen keeps the core Reader tools available in a compact overlay while giving the text more room.',
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
      <div class="msg-walkthrough-connector" aria-hidden="true"></div>
      <aside class="msg-walkthrough-host" aria-hidden="true">
        <div class="msg-walkthrough-mark">
          <div class="msg-walkthrough-mark-arm"></div>
          <div class="msg-walkthrough-mark-head"><img src="/assets/ask-mark/ask-mark-avatar.png" alt=""></div>
          <div class="msg-walkthrough-mark-body"></div>
          <div class="msg-walkthrough-mark-book"></div>
          <div class="msg-walkthrough-mark-label">Mark</div>
        </div>
      </aside>
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
    const connector = root && $('.msg-walkthrough-connector', root);
    if (connector) connector.style.display = 'none';
  }

  function schedulePosition() {
    window.cancelAnimationFrame(resizeRaf);
    resizeRaf = window.requestAnimationFrame(() => {
      positionMenuMirror();
      positionOverlay();
    });
  }

  function positionOverlay() {
    if (!root || root.hidden || !activeTarget?.isConnected || !isVisibleElement(activeTarget)) return;

    const rect = activeTarget.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const pad = 7;
    const left = Math.max(6, Math.min(viewportWidth - 6, rect.left - pad));
    const top = Math.max(6, Math.min(viewportHeight - 6, rect.top - pad));
    const right = Math.max(left + 2, Math.min(viewportWidth - 6, rect.right + pad));
    const bottom = Math.max(top + 2, Math.min(viewportHeight - 6, rect.bottom + pad));
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
    Object.assign(masks.bottom.style, { left: '0px', top: `${bottom}px`, width: '100vw', height: `${Math.max(0, viewportHeight - bottom)}px` });
    Object.assign(masks.left.style, { left: '0px', top: `${top}px`, width: `${left}px`, height: `${height}px` });
    Object.assign(masks.right.style, { left: `${right}px`, top: `${top}px`, width: `${Math.max(0, viewportWidth - right)}px`, height: `${height}px` });

    const card = $('.msg-walkthrough-card', root);
    const cardWidth = Math.min(390, viewportWidth - 24);
    card.style.width = `${cardWidth}px`;
    card.style.left = '12px';
    card.style.top = '12px';

    const cardRect = card.getBoundingClientRect();
    const cardHeight = Math.min(cardRect.height, viewportHeight - 24);
    const gap = 16;
    const targetCenterX = (left + right) / 2;
    const targetCenterY = (top + bottom) / 2;

    const candidates = [
      { side:'right', fits:right + gap + cardWidth <= viewportWidth - 12, left:right + gap, top:targetCenterY - cardHeight/2 },
      { side:'left', fits:left - gap - cardWidth >= 12, left:left - gap - cardWidth, top:targetCenterY - cardHeight/2 },
      { side:'bottom', fits:bottom + gap + cardHeight <= viewportHeight - 12, left:targetCenterX - cardWidth/2, top:bottom + gap },
      { side:'top', fits:top - gap - cardHeight >= 12, left:targetCenterX - cardWidth/2, top:top - gap - cardHeight }
    ];

    const targetInMenu = !!activeTarget.closest('.site-header .menu-popover, .msg-walkthrough-menu-mirror');
    const preferred = targetInMenu ? ['right','left','bottom','top'] : ['bottom','top','right','left'];
    const candidate = preferred.map(side => candidates.find(item => item.side === side)).find(item => item?.fits)
      || candidates.find(item => item.fits)
      || { side:'floating', left:targetCenterX-cardWidth/2, top:targetCenterY-cardHeight/2 };

    const cardLeft = Math.max(12, Math.min(viewportWidth-cardWidth-12, candidate.left));
    const cardTop = Math.max(12, Math.min(viewportHeight-cardHeight-12, candidate.top));
    Object.assign(card.style, { left:`${cardLeft}px`, top:`${cardTop}px` });
    card.dataset.walkthroughSide = candidate.side;

    const connector = $('.msg-walkthrough-connector', root);
    if (connector) {
      const placedCard = card.getBoundingClientRect();
      let x1=targetCenterX, y1=targetCenterY;
      let x2=Math.max(placedCard.left,Math.min(targetCenterX,placedCard.right));
      let y2=Math.max(placedCard.top,Math.min(targetCenterY,placedCard.bottom));

      if (candidate.side === 'right') {
        x1=right; x2=placedCard.left;
        y1=y2=Math.max(placedCard.top+18,Math.min(targetCenterY,placedCard.bottom-18));
      } else if (candidate.side === 'left') {
        x1=left; x2=placedCard.right;
        y1=y2=Math.max(placedCard.top+18,Math.min(targetCenterY,placedCard.bottom-18));
      } else if (candidate.side === 'bottom') {
        y1=bottom; y2=placedCard.top;
        x1=x2=Math.max(placedCard.left+18,Math.min(targetCenterX,placedCard.right-18));
      } else if (candidate.side === 'top') {
        y1=top; y2=placedCard.bottom;
        x1=x2=Math.max(placedCard.left+18,Math.min(targetCenterX,placedCard.right-18));
      }

      const dx=x2-x1, dy=y2-y1;
      const length=Math.max(0,Math.hypot(dx,dy));
      const angle=Math.atan2(dy,dx)*180/Math.PI;
      Object.assign(connector.style,{
        display:length>=5?'block':'none',
        left:`${x1}px`, top:`${y1}px`, width:`${length}px`,
        transform:`rotate(${angle}deg)`
      });
    }

    const host = $('.msg-walkthrough-host', root);
    const arm = $('.msg-walkthrough-mark-arm', root);
    if (host && arm) {
      const hostRect = host.getBoundingClientRect();
      const shoulderX = hostRect.left + Math.min(hostRect.width - 24, 116);
      const shoulderY = hostRect.top + 92;
      const armDx = targetCenterX - shoulderX;
      const armDy = targetCenterY - shoulderY;
      const armAngle = Math.atan2(armDy, armDx) * 180 / Math.PI;
      const armLength = Math.max(80, Math.min(210, Math.hypot(armDx, armDy) * 0.16));
      arm.style.width = `${Math.round(armLength)}px`;
      arm.style.transform = `rotate(${armAngle}deg)`;
    }
  }

  async function resolveTarget(step) {
    let original = typeof step.selector === 'function' ? step.selector() : $(step.selector);
    if (!original && step.fallbackSelector) original = $(step.fallbackSelector);
    if (!original) {
      await wait(140);
      original = typeof step.selector === 'function' ? step.selector() : $(step.selector);
      if (!original && step.fallbackSelector) original = $(step.fallbackSelector);
    }
    if (!original) return null;

    if (original.closest?.('.site-header .menu-popover') && menuMirrorSource?.contains(original)) {
      const mirrored = mirrorForOriginal(original);
      if (mirrored) {
        const menuRect = menuMirror.getBoundingClientRect();
        const targetRect = mirrored.getBoundingClientRect();
        if (targetRect.top < menuRect.top + 4) menuMirror.scrollTop -= (menuRect.top + 4 - targetRect.top);
        else if (targetRect.bottom > menuRect.bottom - 4) menuMirror.scrollTop += (targetRect.bottom - (menuRect.bottom - 4));
        await wait(30);
        return mirrorForOriginal(original) || mirrored;
      }
    }

    if (!isVisibleElement(original)) return null;
    const rect = original.getBoundingClientRect();
    if (rect.top < 72 || rect.bottom > window.innerHeight - 20 || rect.left < 4 || rect.right > window.innerWidth - 4) {
      original.scrollIntoView({ block:'center', inline:'nearest', behavior:'auto' });
      await wait(90);
    }
    return isVisibleElement(original) ? original : null;
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
    clearMenuMirror();
    closeHeaderMenus();
    $$('.site-header nav > details').forEach((menu) => menu.classList.remove('msg-walkthrough-open-menu'));
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
