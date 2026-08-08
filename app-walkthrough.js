(function () {
  'use strict';

  const ROOT_ID = 'msg-app-walkthrough';
  const WALKTHROUGH_BUILD = '9.3.5';
  const ACTIVE_CLASS = 'msg-walkthrough-active';
  const HIGHLIGHT_CLASS = 'msg-walkthrough-target';
  let root = null;
  let currentIndex = 0;
  let activeTarget = null;
  let resizeRaf = 0;
  let finishing = false;
  let menuMirror = null;
  let menuMirrorSource = null;
  let topHighlight = null;
  let topHighlightObserver = null;

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

  function ensureTopHighlight() {
    if (!topHighlight?.isConnected) {
      topHighlight = document.createElement('div');
      topHighlight.id = 'msg-walkthrough-top-highlight';
      topHighlight.setAttribute('aria-hidden', 'true');
      document.body.appendChild(topHighlight);
    }
    // Reassert the critical styles inline so later-loaded stylesheets cannot
    // accidentally bury or reposition the walkthrough frame.
    Object.assign(topHighlight.style, {
      position: 'fixed',
      display: 'none',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      zIndex: '2147483647'
    });
    return topHighlight;
  }

  function keepTopHighlightOnTop() {
    const highlight = ensureTopHighlight();
    if (highlight.parentNode === document.body && document.body.lastElementChild !== highlight) {
      document.body.appendChild(highlight);
    }
    highlight.style.setProperty('z-index', '2147483647', 'important');
    highlight.style.setProperty('position', 'fixed', 'important');
    highlight.style.setProperty('pointer-events', 'none', 'important');
  }

  function startTopHighlightGuard() {
    keepTopHighlightOnTop();
    if (topHighlightObserver) return;
    topHighlightObserver = new MutationObserver(() => {
      if (!root || root.hidden) return;
      keepTopHighlightOnTop();
      schedulePosition();
    });
    topHighlightObserver.observe(document.body, { childList: true, subtree: true });
  }

  function stopTopHighlightGuard() {
    if (topHighlightObserver) topHighlightObserver.disconnect();
    topHighlightObserver = null;
    if (topHighlight) topHighlight.style.display = 'none';
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

  const fullSteps = [
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
      title: 'Scrub or jump through the text',
      text: 'You can move your reading position directly instead of replaying everything in between. Clicking a word moves the canonical Reader position there; in Book Pages you can also jump by page.',
      selector: '#reader',
      prepare: async () => {
        await closeAskMark();
        await prepareReader();
        await window.MarkSetGoWalkthroughReader?.demoScrub?.();
      }
    },
    {
      title: 'Highlight a passage',
      text: 'Drag across any passage to select it. Reading pauses, the passage remains highlighted, and the contextual action toolbar appears without losing your underlying reading position.',
      selector: '#reader',
      prepare: async () => {
        await closeAskMark();
        await prepareReader();
        await window.MarkSetGoWalkthroughReader?.demoSelection?.();
      }
    },
    {
      title: 'Selection actions',
      text: 'The selection toolbar gives you fast actions: Explain, Summarize, Simplify, Context, Compare, Save, or send the passage into Ask Mark for a deeper conversation.',
      selector: '#mark-selection-toolbar',
      prepare: async () => {
        await prepareReader();
        await window.MarkSetGoWalkthroughReader?.demoSelection?.();
      }
    },
    {
      title: 'Right-click word tools',
      text: 'Right-click a word for Look up word, Save definition, Add note, or Add bookmark. These are designed for quick reading actions without leaving the page.',
      selector: '#word-context-menu',
      prepare: async () => {
        await prepareReader();
        await window.MarkSetGoWalkthroughReader?.openWordActions?.();
      }
    },
    {
      title: 'Ask Mark input',
      text: 'Ask a custom question about the current passage here. Mark keeps the selected reading context while you continue the conversation.',
      selector: '[data-askmark-input]',
      prepare: async () => { await openAskMark('chat'); }
    },
    {
      title: 'More actions',
      text: 'The + button opens Mark’s additional study tools for the current reading.',
      selector: '[data-askmark-more]',
      prepare: async () => {
        await openAskMark('chat');
        const button=visibleMatch('[data-askmark-more]');
        const menu=visibleMatch('[data-askmark-more-menu]');
        if(button && menu?.hidden) button.click();
        await wait(80);
      }
    },
    {
      title: 'Study guide',
      text: 'Build a focused study guide from the current reading when you want a structured review instead of a normal chat answer.',
      selector: '[data-askmark-more-menu] [data-askmark-prompt*="study guide"]',
      prepare: async () => {
        await openAskMark('chat');
        const menu=visibleMatch('[data-askmark-more-menu]');
        if(menu) menu.hidden=false;
      }
    },
    {
      title: 'Flash cards',
      text: 'Create visual flash cards from the current reading. Cards flip between a retrieval prompt and the answer so you can actively review.',
      selector: '[data-askmark-more-menu] [data-askmark-tool="flashcards"]',
      prepare: async () => {
        await openAskMark('chat');
        const menu=visibleMatch('[data-askmark-more-menu]');
        if(menu) menu.hidden=false;
      }
    },
    {
      title: 'Historical context',
      text: 'Ask Mark for historical background when context matters to understanding the passage.',
      selector: '[data-askmark-more-menu] [data-premium-mark-action="context"]',
      prepare: async () => {
        await openAskMark('chat');
        const menu=visibleMatch('[data-askmark-more-menu]');
        if(menu) menu.hidden=false;
      }
    },
    {
      title: 'Key ideas',
      text: 'Pull out the most important claims, concepts, or relationships in the current reading.',
      selector: '[data-askmark-more-menu] [data-askmark-prompt*="key ideas"]',
      prepare: async () => {
        await openAskMark('chat');
        const menu=visibleMatch('[data-askmark-more-menu]');
        if(menu) menu.hidden=false;
      }
    },
    {
      title: 'Memory tools',
      text: 'Build structured memory anchors with what to remember, the anchor itself, why it works, and a self-test question.',
      selector: '[data-askmark-more-menu] [data-askmark-tool="memory"]',
      prepare: async () => {
        await openAskMark('chat');
        const menu=visibleMatch('[data-askmark-more-menu]');
        if(menu) menu.hidden=false;
      }
    },
    {
      title: 'Comprehension check',
      text: 'Generate a comprehension quiz for the current reading and track how well you understood it.',
      selector: '[data-askmark-more-menu] [data-askmark-comprehension]',
      prepare: async () => {
        await openAskMark('chat');
        const menu=visibleMatch('[data-askmark-more-menu]');
        if(menu) menu.hidden=false;
      }
    },
    {
      title: 'Reading controls in Ask Mark',
      text: 'The Reading Tools view keeps Reader controls, Media, and Translation & Word Tools available inside the Ask Mark pane so you do not have to leave the reading session.',
      selector: '[data-askmark-view-panel="tools"]',
      prepare: async () => { await openAskMark('tools'); }
    },
    {
      title: 'Full screen',
      text: 'Full screen gives the text more room while preserving Reader controls and Ask Mark access. Use the X to return to the normal Reader instead of leaving your reading session.',
      selector: '#toggle-reader-fullscreen',
      prepare: async () => { await closeAskMark(); await prepareReader(); }
    }
  ];

  const simpleStepTitles = new Set([
    'Welcome to the walkthrough','Reader','My Library','My Reading','Browse inside My Library','Read Anything',
    'Learn','Reading Skills','My Notebook','Music & Focus','Profile','Help',
    'Reading settings','Reading speed','Display settings','Marks & Contents','Ask Mark',
    'Scrub or jump through the text','Highlight a passage','Selection actions','Ask Mark input',
    'More actions','Full screen'
  ]);

  let steps = fullSteps;
  let walkthroughMode = 'full';

  function ensureRoot() {
    if (root?.isConnected) return root;
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.dataset.walkthroughBuild = WALKTHROUGH_BUILD;
    root.innerHTML = `
      <div class="msg-walkthrough-mask msg-walkthrough-mask-top"></div>
      <div class="msg-walkthrough-mask msg-walkthrough-mask-left"></div>
      <div class="msg-walkthrough-mask msg-walkthrough-mask-right"></div>
      <div class="msg-walkthrough-mask msg-walkthrough-mask-bottom"></div>
      <div class="msg-walkthrough-outline" aria-hidden="true"></div>
      <div class="msg-walkthrough-connector" aria-hidden="true"></div>
      <section class="msg-walkthrough-mode-picker" data-walkthrough-mode-picker hidden role="dialog" aria-modal="true" aria-labelledby="walkthrough-mode-title">
        <span class="help-eyebrow">Choose your tour</span>
        <h2 id="walkthrough-mode-title">How much would you like to see?</h2>
        <p>You can take a quick orientation or the complete guided tour. You can restart either one from Help at any time.</p>
        <div class="msg-walkthrough-mode-options">
          <button type="button" data-walkthrough-mode="simple"><strong>Simple Overview</strong><small>Core navigation, Reader basics, highlighting, Ask Mark, and the most important controls.</small></button>
          <button type="button" data-walkthrough-mode="full"><strong>Full Experience</strong><small>Every major menu, Reader workflow, selection tools, Ask Mark study tools, learning features, and advanced controls.</small></button>
        </div>
        <button type="button" class="secondary" data-walkthrough-cancel>Cancel</button>
      </section>
      <aside class="msg-walkthrough-host" aria-hidden="true">
        <figure class="msg-walkthrough-mark-figure">
          <img class="msg-walkthrough-mark-illustration" src="/assets/walkthrough/mark-walkthrough-guide.png" alt="">
          <figcaption>ASK MARK</figcaption>
        </figure>
      </aside>
      <section class="msg-walkthrough-card" role="dialog" aria-modal="true" aria-labelledby="msg-walkthrough-title">
        <div class="msg-walkthrough-meta"><span data-walkthrough-section>Guided tour</span><button type="button" data-walkthrough-exit aria-label="Exit walkthrough">×</button></div>
        <h2 id="msg-walkthrough-title" data-walkthrough-title></h2>
        <p data-walkthrough-text></p>
      </section>
      <div class="msg-walkthrough-dock" role="navigation" aria-label="Walkthrough controls">
        <button class="secondary" type="button" data-walkthrough-prev>← Back</button>
        <div class="msg-walkthrough-progress-wrap">
          <div class="msg-walkthrough-progress-track" aria-hidden="true"><span data-walkthrough-progress></span></div>
          <strong data-walkthrough-count></strong>
        </div>
        <button class="primary" type="button" data-walkthrough-next>Next →</button>
      </div>`;
    document.body.appendChild(root);

    root.addEventListener('click', (event) => {
      const modeButton=event.target.closest('[data-walkthrough-mode]');
      const cancelButton=event.target.closest('[data-walkthrough-cancel]');
      if(modeButton){
        event.preventDefault();
        event.stopPropagation();
        beginMode(modeButton.dataset.walkthroughMode);
        return;
      }
      if(cancelButton){
        event.preventDefault();
        event.stopPropagation();
        finish();
        return;
      }
      const control = event.target.closest('[data-walkthrough-next],[data-walkthrough-prev],[data-walkthrough-exit]');
      if (!control || !root.contains(control)) return;
      event.preventDefault();
      event.stopPropagation();

      if (control.hasAttribute('data-walkthrough-next')) {
        if (currentIndex >= steps.length - 1) finish();
        else goTo(currentIndex + 1);
      } else if (control.hasAttribute('data-walkthrough-prev')) {
        goTo(currentIndex - 1);
      } else {
        finish();
      }
    });
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
    if (topHighlight) topHighlight.style.display = 'none';
    const connector = root && $('.msg-walkthrough-connector', root);
    if (connector) connector.style.display = 'none';
    const outline = root && $('.msg-walkthrough-outline', root);
    if (outline) outline.style.display = 'none';
  }

  function schedulePosition() {
    window.cancelAnimationFrame(resizeRaf);
    resizeRaf = window.requestAnimationFrame(() => {
      positionMenuMirror();
      positionOverlay();
    });
  }

  function positionPresenterForTarget(targetRect) {
    const host = $('.msg-walkthrough-host', root);
    if (!host || window.innerWidth < 960) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const targetX = (targetRect.left + targetRect.right) / 2;
    const targetY = (targetRect.top + targetRect.bottom) / 2;

    // Mark's pointing arm is baked into the presenter artwork and points
    // diagonally up/right. Move Mark horizontally so that natural pointing
    // direction aims toward the highlighted control instead of drawing a line.
    const hostWidth = Math.min(300, Math.max(248, viewportWidth * .205));
    const hostHeight = Math.min(330, Math.max(275, viewportHeight * .36));
    const anchorX = hostWidth * .74;   // approximate fingertip direction origin
    const anchorY = hostHeight * .16;

    let left = targetX - anchorX;
    left = Math.max(8, Math.min(viewportWidth - hostWidth - 8, left));

    // Keep Mark in the lower half for ordinary controls, but let him rise
    // slightly for low targets so his raised arm still clearly points at them.
    let bottom = 82;
    if (targetY > viewportHeight * .58) bottom = 22;

    host.style.width = `${Math.round(hostWidth)}px`;
    host.style.height = `${Math.round(hostHeight)}px`;
    host.style.left = `${Math.round(left)}px`;
    host.style.right = 'auto';
    host.style.bottom = `${bottom}px`;
  }

  function positionOverlay() {
    if (!root || root.hidden || !activeTarget?.isConnected || !isVisibleElement(activeTarget)) return;

    const rect = activeTarget.getBoundingClientRect();
    positionPresenterForTarget(rect);
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
    const targetIsMenuItem = !!activeTarget.closest?.('.msg-walkthrough-menu-mirror');
    const targetIsHeaderNavigation = targetIsMenuItem || !!activeTarget.closest?.('.site-header');

    // The visible gold frame lives in its own body-level portal at the maximum
    // browser z-index. This avoids being trapped inside the walkthrough root's
    // stacking context or underneath dropdowns/modals that render later.
    const highlight = ensureTopHighlight();
    keepTopHighlightOnTop();
    Object.assign(highlight.style, {
      display: 'block',
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`
    });

    // Keep the old in-root outline disabled; its parent stacking context is the
    // reason it could appear behind menus even with a very large child z-index.
    if (outline) outline.style.display = 'none';

    const masks = {
      top: $('.msg-walkthrough-mask-top', root),
      left: $('.msg-walkthrough-mask-left', root),
      right: $('.msg-walkthrough-mask-right', root),
      bottom: $('.msg-walkthrough-mask-bottom', root)
    };
    if (targetIsHeaderNavigation) {
      // All header navigation targets use an in-place gold outline. Keep the
      // dimmer uniform so there is no hidden spotlight rectangle behind menus.
      Object.assign(masks.top.style, { left: '0px', top: '0px', width: '100vw', height: '100vh' });
      Object.assign(masks.left.style, { left: '0px', top: '0px', width: '0px', height: '0px' });
      Object.assign(masks.right.style, { left: '0px', top: '0px', width: '0px', height: '0px' });
      Object.assign(masks.bottom.style, { left: '0px', top: '0px', width: '0px', height: '0px' });
    } else {
      Object.assign(masks.top.style, { left: '0px', top: '0px', width: '100vw', height: `${top}px` });
      Object.assign(masks.bottom.style, { left: '0px', top: `${bottom}px`, width: '100vw', height: `${Math.max(0, viewportHeight - bottom)}px` });
      Object.assign(masks.left.style, { left: '0px', top: `${top}px`, width: `${left}px`, height: `${height}px` });
      Object.assign(masks.right.style, { left: `${right}px`, top: `${top}px`, width: `${Math.max(0, viewportWidth - right)}px`, height: `${height}px` });
    }

    const card = $('.msg-walkthrough-card', root);
    const host = $('.msg-walkthrough-host', root);
    const dock = $('.msg-walkthrough-dock', root);
    if (!card || !host || !dock) return;

    const compact = viewportWidth < 960;
    const hostWidth = compact ? 0 : Math.min(280, Math.max(240, viewportWidth * .205));
    const sideMargin = compact ? 14 : 22;
    const cardLeft = compact ? sideMargin : sideMargin + hostWidth - 8;
    const cardWidth = Math.max(280, Math.min(760, viewportWidth - cardLeft - sideMargin));

    card.style.width = `${Math.round(cardWidth)}px`;
    card.style.left = `${Math.round(cardLeft)}px`;
    card.style.bottom = compact ? '92px' : '96px';
    card.style.top = 'auto';

    const dockWidth = Math.max(300, Math.min(1180, viewportWidth - sideMargin * 2));
    dock.style.width = `${Math.round(dockWidth)}px`;
    dock.style.left = `${Math.round((viewportWidth - dockWidth) / 2)}px`;
    dock.style.bottom = '14px';

    const connector = $('.msg-walkthrough-connector', root);
    if (connector) connector.style.display = 'none';
  }

  function visibleWalkthroughTarget(original) {
    if(!original) return null;
    const inMenu=original.closest?.('.site-header .menu-popover');
    if(inMenu && menuMirrorSource?.contains(original)){
      const mirrored=mirrorForOriginal(original);
      if(mirrored) return mirrored;
    }
    return isVisibleElement(original)?original:null;
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
    const libraryTitles=new Set(['My Library','Library Home','My Reading','Browse inside My Library','Browse Home','Great Books','Bible Study','Read Anything','Collections','Bookmarks','Book Notes','Random Notes','Definitions','My Links','Progress & Awards','Action Center']);
    const learnTitles=new Set(['Learn','Reading Skills','Learning Tools','WPM Test','Comprehension Quizzes','Great Ideas / Syntopicon','Mnemonics','Language Learning','Courses & Learning Modules']);
    const readerTitles=new Set(['Reading settings','Reading mode','Reading speed','Display settings','Reader theme','Book pages','Marks & Contents','Ask Mark','Ask Mark conversation','Format','Reader tools in Ask Mark','Scrub or jump through the text','Highlight a passage','Selection actions','Right-click word tools','Ask Mark input','More actions','Study guide','Flash cards','Historical context','Key ideas','Memory tools','Comprehension check','Reading controls in Ask Mark','Full screen']);
    $('[data-walkthrough-section]', root).textContent = libraryTitles.has(step.title)?'My Library':learnTitles.has(step.title)?'Learn':readerTitles.has(step.title)?'Reader & Ask Mark':(walkthroughMode==='simple'?'Simple overview':'Full experience');
    $('[data-walkthrough-count]', root).textContent = `${currentIndex + 1} / ${steps.length}`;
    const progress = $('[data-walkthrough-progress]', root);
    if (progress) progress.style.width = `${Math.max(2, ((currentIndex + 1) / steps.length) * 100)}%`;
    $('[data-walkthrough-prev]', root).disabled = currentIndex === 0;
    $('[data-walkthrough-next]', root).textContent = currentIndex === steps.length - 1 ? 'Finish' : 'Next →';
    schedulePosition();
  }

  function showModePicker() {
    ensureRoot();
    clearTarget();
    clearMenuMirror();
    closeHeaderMenus();
    root.hidden=false;
    $('.msg-walkthrough-mode-picker',root).hidden=false;
    $('.msg-walkthrough-host',root).hidden=true;
    $('.msg-walkthrough-card',root).hidden=true;
    $('.msg-walkthrough-dock',root).hidden=true;
    $$('.msg-walkthrough-mask',root).forEach(mask=>mask.style.cssText='left:0;top:0;width:100vw;height:100vh;');
    document.documentElement.classList.add(ACTIVE_CLASS);
    document.body.classList.add(ACTIVE_CLASS);
  }

  async function beginMode(mode='full') {
    walkthroughMode=mode==='simple'?'simple':'full';
    steps=walkthroughMode==='simple'
      ? fullSteps.filter(step=>simpleStepTitles.has(step.title))
      : fullSteps;
    currentIndex=0;
    const picker=$('.msg-walkthrough-mode-picker',root);
    if(picker) picker.hidden=true;
    $('.msg-walkthrough-host',root).hidden=false;
    $('.msg-walkthrough-card',root).hidden=false;
    $('.msg-walkthrough-dock',root).hidden=false;
    await goTo(0);
  }

  async function start(mode='choose') {
    finishing=false;
    ensureRoot();
    if(mode==='simple'||mode==='full'){
      root.hidden=false;
      document.documentElement.classList.add(ACTIVE_CLASS);
      document.body.classList.add(ACTIVE_CLASS);
      startTopHighlightGuard();
      await beginMode(mode);
      return;
    }
    showModePicker();
    startTopHighlightGuard();
  }

  async function finish() {
    if (finishing) return;
    finishing = true;
    clearTarget();
    clearMenuMirror();
    closeHeaderMenus();
    $$('.site-header nav > details').forEach((menu) => menu.classList.remove('msg-walkthrough-open-menu'));
    if (root) root.hidden = true;
    stopTopHighlightGuard();
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

  window.MarkSetGoWalkthrough = Object.freeze({ start, finish, startSimple:()=>start('simple'), startFull:()=>start('full') });
})();
