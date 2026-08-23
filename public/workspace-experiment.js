/*
 * Mark, Set, Go! Workspace Experiment v0.15.7 — close-only themed pane chrome
 * Opt-in multi-page workspace: keep the outer Reader mounted while app pages
 * open in a compact, resizable side pane. Generic app pages run in a same-origin
 * sandboxed app frame so their renderers cannot destroy the outer Reader.
 * No MutationObserver is used by this experiment.
 */
(() => {
  'use strict';

  const PARAMS = new URLSearchParams(window.location.search);
  const IS_WORKSPACE_PANE = PARAMS.get('msgWorkspacePane') === '1';
  const MAX_READERS = 10;
  const requestedReaderNumber = Number.parseInt(PARAMS.get('msgReaderNumber') || '', 10);
  const READER_NUMBER = Number.isFinite(requestedReaderNumber)
    ? Math.min(MAX_READERS, Math.max(1, requestedReaderNumber))
    : (PARAMS.get('msgSecondaryReader') === '1' ? 2 : 1);
  const IS_AUXILIARY_READER_DOCUMENT = PARAMS.get('msgSecondaryReader') === '1' || READER_NUMBER > 1;
  const WORKSPACE_PREF_KEY = 'msg-workspace-optin-v1';

  // Every auxiliary Reader is a full copy of the main Reader in its own iframe.
  // Keep the old secondary-reader flag for compatibility with protected Reader
  // code, while assigning a stable numbered identity for multi-Reader features.
  if (IS_AUXILIARY_READER_DOCUMENT) {
    const readerNumber = Math.max(2, READER_NUMBER);
    window.__MSG_SECONDARY_READER__ = true;
    window.__MSG_READER_NUMBER__ = readerNumber;
    window.__MSG_READER_ID__ = `reader-${readerNumber}`;
    document.documentElement.dataset.msgReaderId = window.__MSG_READER_ID__;

    const announceReaderState = () => {
      let title = '';
      let documentId = '';
      try {
        const current = window.MarkSetGoCurrentReaderDocument?.get?.() || {};
        title = String(current.title || '').trim();
        documentId = String(current.documentId || '').trim();
      } catch {}
      try {
        window.parent?.postMessage?.({
          type:'msg-reader-session-state',
          readerNumber,
          readerId:`reader-${readerNumber}`,
          title,
          documentId
        }, window.location.origin);
      } catch {}
    };

    document.addEventListener('marksetgo:document-available', () => window.setTimeout(announceReaderState, 0));
    window.addEventListener('pageshow', () => window.setTimeout(announceReaderState, 0));
    window.setTimeout(announceReaderState, 800);

    // Auxiliary Readers never install another workspace/router inside themselves.
    return;
  }

  function readWorkspacePreference() {
    try { return localStorage.getItem(WORKSPACE_PREF_KEY) === '1'; }
    catch { return false; }
  }

  function writeWorkspacePreference(enabled) {
    try { localStorage.setItem(WORKSPACE_PREF_KEY, enabled ? '1' : '0'); } catch {}
  }

  function installProfileWorkspaceToggle(rootDocument = document) {
    const page = rootDocument.querySelector('.profile-preferences-page');
    if (!page) return false;

    let card = page.querySelector('.msg-workspace-profile-card');
    if (!card) {
      card = rootDocument.createElement('section');
      card.className = 'profile-feature-card msg-workspace-profile-card';
      card.innerHTML = `
        <div class="section-heading">
          <div>
            <span class="source-category">Workspace</span>
            <h2>Workspace</h2>
            <p>Choose how other sections open while you are reading.</p>
          </div>
        </div>
        <label class="msg-workspace-profile-toggle" for="msg-workspace-profile-toggle">
          <span class="msg-workspace-profile-copy">
            <strong>Open pages in workspace</strong>
            <small>Keep the Reader open and open other sections beside it.</small>
          </span>
          <span class="msg-workspace-switch-wrap">
            <input id="msg-workspace-profile-toggle" type="checkbox" role="switch" aria-label="Open pages in workspace">
            <span class="msg-workspace-switch" aria-hidden="true"></span>
          </span>
        </label>`;

      const cards = [...page.querySelectorAll(':scope > .profile-feature-card')];
      const markCard = cards.find((node) => /Personalized coaching/i.test(node.textContent || ''));
      if (markCard) page.insertBefore(card, markCard);
      else page.appendChild(card);
    }

    const toggle = card.querySelector('#msg-workspace-profile-toggle');
    if (!toggle) return false;
    toggle.checked = readWorkspacePreference();

    if (toggle.dataset.workspaceBound !== '1') {
      toggle.dataset.workspaceBound = '1';
      toggle.addEventListener('change', () => {
        const enabled = Boolean(toggle.checked);
        writeWorkspacePreference(enabled);
        if (window.parent && window.parent !== window) {
          try {
            window.parent.postMessage({ type:'msg-workspace-preference', enabled }, window.location.origin);
          } catch {}
        } else if (!enabled) {
          try { window.MSGWorkspaceExperiment?.close?.(); } catch {}
        }
      });
    }
    return true;
  }

  function initializeWorkspacePaneDocument() {
    document.documentElement.classList.add('msg-workspace-pane-document');
    window.MSGWorkspacePane = true;
    window.__MSG_WORKSPACE_PANE__ = true;
    const mode = PARAMS.get('msgWorkspaceMode') || 'action';
    const value = PARAMS.get('msgWorkspaceValue') || 'home';

    function renderRequestedPageDirectly() {
      if (mode !== 'action') return false;

      // Use the app's actual renderer directly when one exists. This avoids
      // replaying the full top-navigation pipeline inside a workspace pane,
      // which can invoke Reader continuity/navigation behavior that belongs to
      // the outer app rather than this secondary view.
      try {
        switch (value) {
          case 'home': if (typeof renderHome === 'function') { renderHome(); return true; } break;
          case 'browse': if (typeof renderBrowseHub === 'function') { renderBrowseHub(); return true; } break;
          case 'my-library': if (typeof renderMyLibraryHub === 'function') { renderMyLibraryHub(); return true; } break;
          case 'profile-preferences': if (typeof renderProfilePreferences === 'function') { renderProfilePreferences(); return true; } break;
          case 'my-links': if (typeof renderMyLinks === 'function') { renderMyLinks(); return true; } break;
          case 'mark-notebook': if (typeof renderGlobalNotebook === 'function') { renderGlobalNotebook(); return true; } break;
          case 'music': if (typeof renderMusicLibrary === 'function') { renderMusicLibrary(); return true; } break;
          case 'about': if (typeof renderAbout === 'function') { renderAbout(); return true; } break;
          case 'contact': if (typeof renderContact === 'function') { renderContact(); return true; } break;
          case 'privacy': if (typeof renderPrivacy === 'function') { renderPrivacy(); return true; } break;
          case 'terms': if (typeof renderTerms === 'function') { renderTerms(); return true; } break;
          case 'help': if (typeof renderHelp === 'function') { renderHelp(); return true; } break;
          case 'my-reading':
          case 'reading-list': if (typeof renderReadingList === 'function') { renderReadingList(); return true; } break;
          case 'progress-dashboard':
          case 'progress-awards': if (typeof renderProgressDashboard === 'function') { renderProgressDashboard(); return true; } break;
          case 'action-center': if (typeof renderActionCenter === 'function') { renderActionCenter(); return true; } break;
          case 'vocabulary-builder': if (typeof renderVocabularyBuilder === 'function') { renderVocabularyBuilder(); return true; } break;
          case 'reading-skills': if (typeof renderReadingSkillsHub === 'function') { renderReadingSkillsHub(); return true; } break;
          case 'comprehension-library': if (typeof renderComprehensionLibrary === 'function') { renderComprehensionLibrary(); return true; } break;
          case 'mnemonics': if (typeof renderMnemonicsPage === 'function') { renderMnemonicsPage(); return true; } break;
          case 'language-learning': if (typeof renderLanguageLearningPage === 'function') { renderLanguageLearningPage(); return true; } break;
          case 'learning-courses': if (typeof renderLearningCoursesPage === 'function') { renderLearningCoursesPage(); return true; } break;
          case 'library-bookmarks': if (typeof renderLibraryRecords === 'function') { renderLibraryRecords('bookmarks'); return true; } break;
          case 'library-notes': if (typeof renderLibraryRecords === 'function') { renderLibraryRecords('notes'); return true; } break;
          case 'drm-free-books': if (typeof renderDrmFreeBookFinder === 'function') { renderDrmFreeBookFinder(); return true; } break;
          case 'ai-center': if (typeof renderAiCenter === 'function') { renderAiCenter(); return true; } break;
          case 'knowledge-graph': if (typeof renderKnowledgeGraph === 'function') { renderKnowledgeGraph(); return true; } break;
        }
      } catch (error) {
        console.warn('Workspace direct renderer failed; using normal page routing.', error);
      }
      return false;
    }

    // A workspace page is a secondary view, not a fresh app launch. Topic Feeds
    // normally checks the server for its once-daily auto-open during startup; if
    // that runs inside every iframe it replaces Library/Profile/etc. with a new
    // Reader moments after the requested page appears. Suppress only that one
    // startup endpoint inside workspace panes. Manual Topic Feed actions and all
    // other fetches continue through the normal path.
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const rawUrl = typeof input === 'string' ? input : (input?.url || '');
      try {
        const requested = new URL(rawUrl, window.location.href);
        if (requested.pathname === '/api/topic-feeds/daily-open') {
          return Promise.resolve(new Response(JSON.stringify({ workspacePane: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }));
        }
      } catch {}
      return nativeFetch(input, init);
    };

    // Keyboard focus lives inside this iframe while a workspace page is active.
    // Forward only the Topic Feed story shortcuts to the outer Reader; ordinary
    // typing keeps comma/period untouched.
    document.addEventListener('keydown', (event) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== ',' && event.key !== '.') return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return;
      try {
        window.parent?.postMessage?.({
          type: 'msg-workspace-topic-feed-key',
          key: event.key
        }, window.location.origin);
      } catch {}
    }, true);

    // A page inside the workspace should never create a second Reader when its
    // own Back/Return-to-Reader control is used. Hand that request to the outer
    // workspace instead, which simply closes the secondary pane.
    document.addEventListener('click', (event) => {
      const returnReader = event.target.closest?.('[data-action="reader"]');
      if (!returnReader) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        window.parent?.postMessage?.({ type:'msg-workspace-return-reader' }, window.location.origin);
      } catch {}
    }, true);

    const openRequestedPage = () => {
      // Let every deferred app/module script finish installing before opening the
      // requested secondary page. Prefer its renderer directly; only pages owned
      // by independent modules fall back to the app's existing click route.
      window.setTimeout(() => {
        const renderedDirectly = renderRequestedPageDirectly();
        if (!renderedDirectly) {
          const trigger = document.createElement('button');
          trigger.type = 'button';
          trigger.hidden = true;
          if (mode === 'read') trigger.dataset.read = value;
          else if (mode === 'test') trigger.dataset.test = value;
          else trigger.dataset.action = value;
          document.body.appendChild(trigger);
          trigger.click();
          trigger.remove();
        }

        if (mode === 'action' && value === 'profile-preferences') {
          window.setTimeout(() => installProfileWorkspaceToggle(document), 0);
        }

        // Reveal only after the requested page has had a paint. The app's Home
        // bootstrap never flashes in the right pane.
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
          document.documentElement.classList.add('msg-workspace-pane-ready');
        }));
      }, 0);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', openRequestedPage, { once: true });
    } else {
      openRequestedPage();
    }
  }

  if (IS_WORKSPACE_PANE) {
    initializeWorkspacePaneDocument();
    return;
  }

  const APP = document.querySelector('#app');
  if (!APP) return;

  const PANELS = new Map();
  const PANEL_ORDER = [];
  let activePanelKey = '';
  const MIN_SECONDARY_WIDTH = 360;
  const PRIMARY_READER_WIDTH_KEY = 'msg-primary-reader-width-v1';
  const MIN_PRIMARY_READER_WIDTH = 560;
  let secondaryWidth = MIN_SECONDARY_WIDTH;
  let primaryReaderResize = null;
  function dockReaderTopControlsForWorkspace() {
    const shell = workspaceShell();
    if (!shell || shell.classList.contains('is-closed')) return;
    const primary = shell.querySelector('.msg-workspace-primary');
    const footer = primary?.querySelector('.reader-viewer-footer');
    const wpm = primary?.querySelector('.viewer-wpm-control');

    // WPM has one permanent home: the Reader footer.
    if (footer && wpm && wpm.parentElement !== footer) footer.appendChild(wpm);

    // Text size + Music + Full screen are owned by reader-music-quick.js as one
    // literal sibling group. Ask that controller to sync; do not move controls
    // independently in the workspace layer.
    try { window.MSGMusicController?.syncControls?.(); } catch {}
  }

  function restoreReaderTopControlsAfterWorkspace() {
    // No DOM restoration is needed. The shared Reader control group remains in
    // .reader-pane-controls whether the workspace is open or closed.
  }

  function workspaceYouTubeSearch(query, title = 'Suggested music') {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return false;
    const controller = window.MSGMusicController;
    if (controller && typeof controller.search === 'function') {
      return controller.search(cleanQuery, String(title || 'Suggested music'));
    }
    console.warn('Music controller is not ready yet.');
    return false;
  }

  const escapeWorkspaceHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  function hasReader() {
    return Boolean(APP.querySelector('#reader'));
  }

  function workspaceShell() {
    return APP.querySelector(':scope > .msg-workspace-shell');
  }

  function readPrimaryReaderWidth() {
    try {
      const value = Number(localStorage.getItem(PRIMARY_READER_WIDTH_KEY));
      return Number.isFinite(value) && value >= MIN_PRIMARY_READER_WIDTH ? value : 0;
    } catch {
      return 0;
    }
  }

  function maxPrimaryReaderWidth() {
    return Math.max(MIN_PRIMARY_READER_WIDTH, Math.floor((window.innerWidth || document.documentElement.clientWidth || 0) - 24));
  }

  function clampPrimaryReaderWidth(value) {
    const numeric = Number(value) || MIN_PRIMARY_READER_WIDTH;
    return Math.max(MIN_PRIMARY_READER_WIDTH, Math.min(Math.round(numeric), maxPrimaryReaderWidth()));
  }

  function applyPrimaryReaderStandaloneWidth() {
    const shell = workspaceShell();
    const standalone = hasReader() && (!shell || shell.classList.contains('is-closed'));
    document.body.classList.toggle('msg-primary-reader-standalone', standalone);
    if (!standalone) {
      document.body.classList.remove('msg-primary-reader-resized');
      APP.style.removeProperty('--msg-primary-reader-width');
      return;
    }

    const saved = readPrimaryReaderWidth();
    if (saved) {
      const width = clampPrimaryReaderWidth(saved);
      APP.style.setProperty('--msg-primary-reader-width', `${width}px`);
      document.body.classList.add('msg-primary-reader-resized');
    } else {
      APP.style.removeProperty('--msg-primary-reader-width');
      document.body.classList.remove('msg-primary-reader-resized');
    }
  }

  function resetPrimaryReaderWidth() {
    try { localStorage.removeItem(PRIMARY_READER_WIDTH_KEY); } catch {}
    APP.style.removeProperty('--msg-primary-reader-width');
    document.body.classList.remove('msg-primary-reader-resized');
  }

  function hidePrimaryReaderBehindWorkspace() {
    const shell = workspaceShell();
    if (!shell || shell.classList.contains('is-closed') || !activePanelKey) return false;
    releaseAuxiliaryReaderForcedSplit(shell);
    shell.classList.add('msg-primary-reader-hidden');
    document.body.classList.add('msg-primary-reader-view-hidden');
    return true;
  }

  function closePrimaryReaderView() {
    // Closing Reader 1 is a view action, not a destructive session delete. Keep
    // the continuity checkpoint so Reader 1 can be reopened from the Readers menu.
    try { window.ReaderContinuity?.saveBeforeNavigation?.(); } catch {}
    try {
      const snapshot = window.ReaderContinuity?.capture?.();
      if (snapshot) window.ReaderContinuity?.commit?.(snapshot);
    } catch {}

    // If another workspace page/Reader is already open, let it take the whole
    // workspace instead of destroying its mounted iframe by rendering Home.
    if (hidePrimaryReaderBehindWorkspace()) return true;

    const home = document.querySelector('.brand[data-action="home"], [data-action="home"]');
    if (home) {
      home.click();
      return true;
    }
    return false;
  }


  function ensurePrimaryReaderStandaloneControls() {
    const panel = APP.querySelector('.reader-page-panel, .empty-reader-page');
    if (!panel) {
      document.querySelectorAll('.msg-primary-reader-resize-grip').forEach((node) => node.remove());
      document.body.classList.remove('msg-primary-reader-standalone', 'msg-primary-reader-resized');
      APP.style.removeProperty('--msg-primary-reader-width');
      return false;
    }

    let tools = panel.querySelector(':scope > .msg-reader-window-controls.msg-reader-window-controls-primary');
    if (!tools) {
      tools = document.createElement('div');
      tools.className = 'msg-reader-window-controls msg-reader-window-controls-primary';
      tools.setAttribute('aria-label', 'Reader 1 window controls');

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'msg-reader-window-button msg-primary-reader-close';
      close.setAttribute('aria-label', 'Close Reader 1');
      close.title = 'Close Reader 1';
      close.textContent = '×';
      close.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closePrimaryReaderView();
      });

      tools.append(close);
      panel.appendChild(tools);
    }

    let grip = APP.querySelector(':scope > .msg-primary-reader-resize-grip');
    if (!grip) {
      grip = document.createElement('div');
      grip.className = 'msg-primary-reader-resize-grip';
      grip.setAttribute('role', 'separator');
      grip.setAttribute('aria-orientation', 'vertical');
      grip.setAttribute('aria-label', 'Resize Reader 1');
      grip.title = 'Drag to resize Reader 1 · double-click to reset width';
      grip.tabIndex = 0;
      APP.appendChild(grip);

      grip.addEventListener('pointerdown', (event) => {
        const shell = workspaceShell();
        if ((shell && !shell.classList.contains('is-closed')) || window.matchMedia('(max-width: 700px)').matches) return;
        const startWidth = APP.getBoundingClientRect().width;
        primaryReaderResize = { pointerId:event.pointerId, startX:event.clientX, startWidth };
        try { grip.setPointerCapture(event.pointerId); } catch {}
        document.body.classList.add('msg-primary-reader-resizing');
        event.preventDefault();
      });

      grip.addEventListener('pointermove', (event) => {
        if (!primaryReaderResize || primaryReaderResize.pointerId !== event.pointerId) return;
        // #app is centered, so moving one visual edge by N pixels requires a
        // 2N total-width change to keep that edge under the pointer.
        const delta = (event.clientX - primaryReaderResize.startX) * 2;
        const width = clampPrimaryReaderWidth(primaryReaderResize.startWidth + delta);
        APP.style.setProperty('--msg-primary-reader-width', `${width}px`);
        document.body.classList.add('msg-primary-reader-resized');
        event.preventDefault();
      });

      const finishResize = (event) => {
        if (!primaryReaderResize || primaryReaderResize.pointerId !== event.pointerId) return;
        const width = clampPrimaryReaderWidth(APP.getBoundingClientRect().width);
        try { localStorage.setItem(PRIMARY_READER_WIDTH_KEY, String(width)); } catch {}
        try { grip.releasePointerCapture(event.pointerId); } catch {}
        primaryReaderResize = null;
        document.body.classList.remove('msg-primary-reader-resizing');
      };
      grip.addEventListener('pointerup', finishResize);
      grip.addEventListener('pointercancel', finishResize);
      grip.addEventListener('dblclick', (event) => {
        event.preventDefault();
        resetPrimaryReaderWidth();
      });
      grip.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        const current = APP.getBoundingClientRect().width;
        const width = clampPrimaryReaderWidth(current + (event.key === 'ArrowRight' ? 40 : -40));
        APP.style.setProperty('--msg-primary-reader-width', `${width}px`);
        document.body.classList.add('msg-primary-reader-resized');
        try { localStorage.setItem(PRIMARY_READER_WIDTH_KEY, String(width)); } catch {}
        event.preventDefault();
      });
    }

    applyPrimaryReaderStandaloneWidth();
    return true;
  }

  function preferredSecondaryReaderWidth(shell = workspaceShell()) {
    const available = Math.max(0, shell?.getBoundingClientRect?.().width || APP.getBoundingClientRect().width || 0);
    if (!available) return MIN_SECONDARY_WIDTH;
    // Numbered Readers open at half of the usable reading width. Other workspace
    // pages retain their existing compact sizing and the divider remains usable.
    return Math.max(MIN_SECONDARY_WIDTH, Math.floor((available - 8) / 2));
  }


  function forceAuxiliaryReaderHalfSplit(shell = workspaceShell()) {
    if (!shell || window.matchMedia('(max-width: 900px)').matches) return;
    const half = preferredSecondaryReaderWidth(shell);
    secondaryWidth = Math.max(half, Number(secondaryWidth) || 0);
    // Use inline !important for the initial Reader split. Several later
    // workspace/theme rules also own grid-template-columns, so setting only the
    // CSS variable was not enough in the real app. The divider releases this
    // one-time hard split as soon as the user starts dragging it.
    shell.style.setProperty('--msg-secondary-width', `${secondaryWidth}px`, 'important');
    shell.style.setProperty(
      'grid-template-columns',
      `minmax(0,1fr) 8px ${secondaryWidth}px`,
      'important'
    );
  }

  function releaseAuxiliaryReaderForcedSplit(shell = workspaceShell()) {
    if (!shell) return;
    shell.style.removeProperty('grid-template-columns');
    shell.style.removeProperty('--msg-secondary-width');
    shell.style.setProperty('--msg-secondary-width', `${secondaryWidth}px`);
  }

  function workspaceEnabled() {
    return readWorkspacePreference();
  }

  function isTopicFeedReaderActive() {
    try {
      const current = window.MarkSetGoCurrentReaderDocument?.get?.();
      if (current?.source) return current.source.type === 'topic-feed';
    } catch {}
    return Boolean(window.MSGTopicFeedReaderContext);
  }

  function advanceTopicFeedStory(direction) {
    if (!isTopicFeedReaderActive()) return false;

    const pane = APP.querySelector('#navigation-pane');
    if (!pane) return false;

    const context = window.MSGTopicFeedReaderContext || {};
    const topicId = String(context.topicId || '');
    const articleId = String(context.articleId || '');

    let buttons = [...pane.querySelectorAll('[data-reader-topic-article]')];
    if (topicId) {
      const sameTopic = buttons.filter((button) => String(button.dataset.readerTopicParent || '') === topicId);
      if (sameTopic.length) buttons = sameTopic;
    }
    if (!buttons.length) return false;

    let index = buttons.findIndex((button) => String(button.dataset.readerTopicArticle || '') === articleId);
    if (index < 0) index = direction > 0 ? -1 : 0;
    const nextIndex = (index + direction + buttons.length) % buttons.length;
    const target = buttons[nextIndex];
    if (!target) return false;

    // If the next story is in the collapsed overflow, use the Topic Feed's own
    // Show all control so the selected story remains visible in My Topics.
    if (target.hidden) {
      const sourceBlock = target.closest('.topic-reader-source');
      const more = sourceBlock?.querySelector?.('[data-reader-topic-more]');
      if (more?.getAttribute('aria-expanded') === 'false') more.click();
    }

    target.click();
    return true;
  }

  function handleTopicFeedStoryShortcut(eventOrKey) {
    const key = typeof eventOrKey === 'string' ? eventOrKey : eventOrKey?.key;
    if (key !== ',' && key !== '.') return false;
    return advanceTopicFeedStory(key === '.' ? 1 : -1);
  }

  // Suggested-music links can appear in either the outer app or a lightweight
  // workspace page. In the outer app, route them straight into the one shared
  // music player instead of opening a separate YouTube tab.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const clickedLink = target?.closest?.('a[href]');
    const link = target?.closest?.('.book-music-link')
      || (clickedLink?.closest?.('.book-music-recommendations') ? clickedLink : null);
    if (!link?.href) return;
    try {
      const url = new URL(link.href, window.location.href);
      const query = url.searchParams.get('search_query') || url.searchParams.get('q') || '';
      const label = String(link.textContent || 'Suggested music').replace(/^\s*♫\s*/, '').trim();
      const isSuggestion = Boolean(query) && (
        link.classList.contains('book-music-link')
        || Boolean(link.closest('.book-music-recommendations'))
        || /reading mood|adaptation score|film or tv score|music score/i.test(label)
      );
      if (!isSuggestion) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      workspaceYouTubeSearch(query, label || 'Suggested music');
    } catch {}
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== ',' && event.key !== '.') return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return;
    if (!handleTopicFeedStoryShortcut(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type === 'msg-workspace-topic-feed-key') {
      handleTopicFeedStoryShortcut(String(event.data.key || ''));
      return;
    }
    if (event.data?.type === 'msg-workspace-return-reader') {
      closeWorkspacePanel();
      return;
    }
    if (event.data?.type === 'msg-workspace-music-search') {
      const query = String(event.data.query || '').trim();
      const title = String(event.data.title || 'Suggested music').trim();
      if (query) workspaceYouTubeSearch(query, title);
      return;
    }
    if (event.data?.type === 'msg-workspace-music-play') {
      const choice = event.data.choice;
      if (choice && typeof window.playMusic === 'function') {
        window.playMusic(choice);
      }
      return;
    }
    if (event.data?.type === 'msg-reader-session-state') {
      const readerNumber = normalizeReaderNumber(event.data.readerNumber);
      const record = readerNumber >= 2 ? PANELS.get(readerPanelKey(readerNumber)) : null;
      if (record) {
        record.documentTitle = String(event.data.title || '').trim();
        record.documentId = String(event.data.documentId || '').trim();
        const frame = record.node?.querySelector?.('.msg-secondary-reader-frame');
        if (frame) {
          frame.dataset.msgReaderNumber = String(readerNumber);
          frame.title = record.documentTitle
            ? `Reader ${readerNumber} — ${record.documentTitle}`
            : `Reader ${readerNumber}`;
        }
        renderWorkspaceTabs();
        renderReadersMenu();
      }
      return;
    }
    if (event.data?.type === 'msg-workspace-preference') {
      const enabled = Boolean(event.data.enabled);
      writeWorkspacePreference(enabled);
      installProfileWorkspaceToggle(document);
      applyWorkspacePreferencePresentation(enabled);
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== WORKSPACE_PREF_KEY) return;
    installProfileWorkspaceToggle(document);
    applyWorkspacePreferencePresentation(event.newValue === '1');
  });

  const syncAuxiliaryReaderThemes = () => {
    for (const record of PANELS.values()) {
      const frame = record?.node?.querySelector?.('.msg-aux-reader-frame');
      try { frame?.contentWindow?.__MSG_SYNC_AUXILIARY_READER_THEME__?.(); } catch {}
    }
  };
  document.addEventListener('marksetgo:experience-profile-changed', () => {
    window.requestAnimationFrame(syncAuxiliaryReaderThemes);
  });

  function humanize(value) {
    return String(value || '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .trim() || 'Page';
  }

  function navigationLabel(element, fallback = '') {
    const strong = element?.querySelector?.('strong')?.textContent?.trim();
    if (strong) return strong;
    const spans = [...(element?.querySelectorAll?.('span') || [])]
      .map((span) => span.textContent.trim())
      .filter(Boolean)
      .filter((text) => text.length > 1);
    if (spans.length) return spans[spans.length - 1];
    const direct = element?.textContent?.replace(/\s+/g, ' ')?.trim();
    if (direct && direct.length < 45) return direct;
    return humanize(fallback);
  }

  function ensureWorkspaceShell() {
    let shell = workspaceShell();
    if (shell) return shell;

    shell = document.createElement('section');
    shell.className = 'msg-workspace-shell is-closed';
    shell.style.setProperty('--msg-secondary-width', `${secondaryWidth}px`);

    const primary = document.createElement('div');
    primary.className = 'msg-workspace-primary';

    const divider = document.createElement('div');
    divider.className = 'msg-workspace-divider';
    divider.setAttribute('role', 'separator');
    divider.setAttribute('aria-orientation', 'vertical');
    divider.setAttribute('aria-label', 'Resize workspace panels');
    divider.tabIndex = 0;

    const secondary = document.createElement('aside');
    secondary.className = 'msg-workspace-secondary';
    secondary.setAttribute('aria-label', 'Workspace side panel');
    secondary.innerHTML = `
      <header class="msg-workspace-panel-head">
        <nav class="msg-workspace-panel-tabs" aria-label="Open workspace pages"></nav>
        <div class="msg-workspace-window-controls" aria-label="Workspace page controls">
          <button class="msg-workspace-close" type="button" data-msg-workspace-close aria-label="Close this page" title="Close">×</button>
        </div>
      </header>
      <div class="msg-workspace-panel-body"></div>`;

    // The standalone Reader resize grip belongs to #app, not to the Reader DOM.
    // Remove it before wrapping the existing Reader so it cannot be stranded in
    // the primary column when workspace mode opens. It is recreated on return.
    APP.querySelector(':scope > .msg-primary-reader-resize-grip')?.remove();
    const existing = [...APP.childNodes];
    existing.forEach((node) => primary.appendChild(node));
    shell.append(primary, divider, secondary);
    APP.appendChild(shell);

    installDivider(divider, shell);
    renderWorkspaceTabs(shell);
    return shell;
  }

  function installDivider(divider, shell) {
    let pointerId = null;

    const move = (event) => {
      if (pointerId == null || event.pointerId !== pointerId) return;
      const rect = shell.getBoundingClientRect();
      const minSecondary = MIN_SECONDARY_WIDTH;
      const minPrimary = 520;
      const proposed = Math.round(rect.right - event.clientX);
      secondaryWidth = Math.max(minSecondary, Math.min(proposed, Math.max(minSecondary, rect.width - minPrimary - 8)));
      shell.style.setProperty('--msg-secondary-width', `${secondaryWidth}px`);
      dockReaderTopControlsForWorkspace();
    };

    const finish = (event) => {
      if (pointerId == null || event.pointerId !== pointerId) return;
      try { divider.releasePointerCapture(pointerId); } catch {}
      pointerId = null;
      document.body.classList.remove('msg-workspace-resizing');
    };

    divider.addEventListener('pointerdown', (event) => {
      if (window.matchMedia('(max-width: 900px)').matches) return;
      // Once the user grabs the divider, hand sizing back to the normal
      // resizable CSS-variable path.
      releaseAuxiliaryReaderForcedSplit(shell);
      pointerId = event.pointerId;
      divider.setPointerCapture(pointerId);
      document.body.classList.add('msg-workspace-resizing');
      event.preventDefault();
    });
    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', finish);
    divider.addEventListener('pointercancel', finish);
  }

  function panelBody(shell = workspaceShell()) {
    return shell?.querySelector('.msg-workspace-panel-body') || null;
  }

  function activePanelRecord() {
    return PANELS.get(activePanelKey) || null;
  }

  function setWorkspacePanelActive(record, active) {
    const node = record?.node;
    if (!node) return;
    node.classList.toggle('msg-workspace-panel-active', Boolean(active));
    node.classList.toggle('msg-workspace-panel-inactive', !active);
    node.setAttribute('aria-hidden', active ? 'false' : 'true');
    try { node.inert = !active; } catch {}
  }

  function syncMountedWorkspacePanels(body, activeKey = activePanelKey) {
    if (!body) return;
    PANELS.forEach((record, key) => {
      // Keep every workspace panel mounted. In particular, removing an auxiliary Reader's
      // iframe destroys its in-memory Reader/document/page position. Inactive
      // panels are parked visually by CSS instead of being detached.
      if (!record.node.isConnected) body.appendChild(record.node);
      setWorkspacePanelActive(record, key === activeKey);
    });
  }

  function renderWorkspaceTabs(shell = workspaceShell()) {
    const tabs = shell?.querySelector('.msg-workspace-panel-tabs');
    if (!tabs) return;
    tabs.innerHTML = PANEL_ORDER
      .filter((key) => PANELS.has(key))
      .map((key) => {
        const record = PANELS.get(key);
        const active = key === activePanelKey;
        return `<span class="msg-workspace-tab ${active ? 'active' : ''}">
          <button type="button" class="msg-workspace-tab-main" data-msg-workspace-tab="${escapeWorkspaceHtml(key)}" aria-pressed="${active ? 'true' : 'false'}" title="${escapeWorkspaceHtml(record.documentTitle ? `${record.label} — ${record.documentTitle}` : record.label)}">${escapeWorkspaceHtml(record.label)}</button>
          <button type="button" class="msg-workspace-tab-x" data-msg-workspace-tab-close="${escapeWorkspaceHtml(key)}" aria-label="Close ${escapeWorkspaceHtml(record.label)}">×</button>
        </span>`;
      }).join('');
  }

  function syncWorkspacePanelMode(shell, body, key = activePanelKey) {
    if (!shell || !body) return;
    const symposiumActive = key === 'tool:symposium';
    shell.classList.toggle('msg-workspace-symposium-active', symposiumActive);
    body.classList.toggle('msg-workspace-symposium-scroll-owner', symposiumActive);
  }

  function revealSymposiumStart(rootHost) {
    const body = rootHost?.closest?.('.msg-workspace-panel-body') || panelBody();
    const startButton = rootHost?.querySelector?.('#symposium-start');
    if (!body || !startButton) return;

    // Wait for the workspace width, saved-session list, and Symposium content to
    // finish their layout before measuring. Adjust only the workspace scroll
    // owner; never scroll the Reader/window just to expose this control.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (!body.isConnected || !startButton.isConnected) return;
      const bodyRect = body.getBoundingClientRect();
      const buttonRect = startButton.getBoundingClientRect();
      const topPad = 18;
      const bottomPad = 24;
      if (buttonRect.bottom > bodyRect.bottom - bottomPad) {
        body.scrollTop += buttonRect.bottom - (bodyRect.bottom - bottomPad);
      } else if (buttonRect.top < bodyRect.top + topPad) {
        body.scrollTop -= (bodyRect.top + topPad) - buttonRect.top;
      }

      // The Symposium setup uses one vertical scroll owner. The participant
      // roster deliberately does not create a nested wheel/scroll region.
    }));
  }

  function normalizeReaderNumber(value) {
    if (String(value || '').toLowerCase() === 'secondary') return 2;
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= MAX_READERS ? parsed : 0;
  }

  function readerPanelKey(readerNumber) {
    return `reader:${readerNumber}`;
  }

  function readerNumberFromPanelKey(key) {
    const match = /^reader:(\d+)$/.exec(String(key || ''));
    return match ? normalizeReaderNumber(match[1]) : 0;
  }

  function nextAvailableReaderNumber() {
    for (let number = 2; number <= MAX_READERS; number += 1) {
      if (!PANELS.has(readerPanelKey(number))) return number;
    }
    return 0;
  }

  function listReaderSessions() {
    let primaryTitle = '';
    try { primaryTitle = String(window.MarkSetGoCurrentReaderDocument?.get?.()?.title || '').trim(); } catch {}
    const readers = [{
      number:1, readerId:'reader-1', label:'Reader 1', documentTitle:primaryTitle,
      active:!activePanelKey
    }];
    PANELS.forEach((record, key) => {
      const number = readerNumberFromPanelKey(key);
      if (!number) return;
      readers.push({
        number, readerId:`reader-${number}`, label:`Reader ${number}`,
        documentTitle:String(record.documentTitle || ''), active:key === activePanelKey
      });
    });
    return readers.sort((a, b) => a.number - b.number);
  }

  function syncAddReaderControl() {
    const buttons = [...document.querySelectorAll('[data-msg-reader-add]')];
    if (!buttons.length) return;
    const readerReady = hasReader();
    const next = nextAvailableReaderNumber();
    buttons.forEach((button) => {
      button.disabled = !readerReady || !next;
      if (!readerReady) {
        button.title = 'Open a text in Reader 1 before adding another Reader';
        button.setAttribute('aria-label', 'Add Reader — open Reader 1 first');
        return;
      }
      button.title = next
        ? `Add Reader ${next} (maximum ${MAX_READERS} Readers)`
        : `Maximum of ${MAX_READERS} Readers reached`;
      button.setAttribute('aria-label', next ? `Add Reader ${next}` : `Maximum of ${MAX_READERS} Readers reached`);
    });
  }

  function renderReadersMenu() {
    const list = document.querySelector('[data-msg-readers-list]');
    if (!list) return;
    const readers = listReaderSessions();
    list.innerHTML = readers.map((reader) => {
      const title = reader.documentTitle ? ` · ${reader.documentTitle}` : '';
      return `<button type="button" role="menuitem" class="${reader.active ? 'is-active' : ''}" aria-current="${reader.active ? 'true' : 'false'}" data-msg-reader-select="${reader.number}" title="${escapeWorkspaceHtml(`${reader.label}${title}`)}"><strong>${escapeWorkspaceHtml(reader.label)}</strong><small>${escapeWorkspaceHtml(reader.documentTitle || (reader.number === 1 ? 'Current Reader' : 'No text loaded yet'))}</small></button>`;
    }).join('');
  }

  function setReaderFocusPresentation(shell, readerNumber = 0) {
    if (!shell) return;
    const number = normalizeReaderNumber(readerNumber);
    const focused = number >= 2;
    shell.classList.toggle('msg-reader-focus-mode', focused);
    document.body.classList.toggle('msg-reader-focus-active', focused);

    if (focused) {
      shell.dataset.msgReaderFocus = String(number);
      shell.querySelector('.msg-workspace-secondary')?.setAttribute('aria-label', `Reader ${number}`);
    } else {
      delete shell.dataset.msgReaderFocus;
      shell.querySelector('.msg-workspace-secondary')?.setAttribute('aria-label', 'Workspace side panel');
    }
  }

  function applyWorkspacePreferencePresentation(enabled) {
    const shell = workspaceShell();
    const activeReader = readerNumberFromPanelKey(activePanelKey);

    if (!enabled) {
      // Turning frame/workspace mode off while an auxiliary Reader is selected
      // should keep that Reader in view, now as the one full-width Reader.
      if (activeReader >= 2 && PANELS.has(readerPanelKey(activeReader))) {
        focusReaderSession(activeReader);
      } else {
        closeWorkspacePanel();
      }
      return;
    }

    // Turning workspace mode back on while an auxiliary Reader owns the full
    // Reader area returns that same live session to the right pane.
    if (shell?.classList.contains('msg-reader-focus-mode') && activeReader >= 2) {
      activatePanel(readerPanelKey(activeReader));
    }
  }

  function schedulePrimaryReaderStandaloneControls() {
    const sync = () => {
      // Window controls belong to Reader 1 in every layout. The resize grip
      // remains standalone-only via CSS, but the − / × chrome must not vanish
      // merely because a second pane is open or has just closed.
      ensurePrimaryReaderStandaloneControls();
    };
    window.requestAnimationFrame(sync);
    window.setTimeout(sync, 45);
    window.setTimeout(sync, 180);
  }

  function closeWorkspacePanel() {
    const shell = workspaceShell();
    if (!shell) {
      ensurePrimaryReaderStandaloneControls();
      return;
    }
    const body = panelBody(shell);
    // Reader 2+ may have installed an inline !important three-column split.
    // Clear it BEFORE applying is-closed or Reader 1 remains trapped in the old
    // left-column width after the secondary Reader is closed.
    releaseAuxiliaryReaderForcedSplit(shell);
    setReaderFocusPresentation(shell, 0);
    activePanelKey = '';
    syncMountedWorkspacePanels(body, '');
    syncWorkspacePanelMode(shell, body, '');
    restoreReaderTopControlsAfterWorkspace();
    shell.classList.remove('msg-primary-reader-hidden');
    document.body.classList.remove('msg-primary-reader-view-hidden');
    shell.classList.add('is-closed');
    renderWorkspaceTabs(shell);
    window.speechSynthesis?.cancel?.();
    schedulePrimaryReaderStandaloneControls();
  }

  function activatePanel(key) {
    const record = PANELS.get(key);
    if (!record || !hasReader()) return false;

    const shell = ensureWorkspaceShell();
    const body = panelBody(shell);
    if (!body) return false;

    setReaderFocusPresentation(shell, 0);
    activePanelKey = key;
    syncWorkspacePanelMode(shell, body, key);
    const wasClosed = shell.classList.contains('is-closed');
    const auxiliaryReaderNumber = readerNumberFromPanelKey(key);
    if (wasClosed) {
      secondaryWidth = auxiliaryReaderNumber >= 2
        ? preferredSecondaryReaderWidth(shell)
        : MIN_SECONDARY_WIDTH;
    }
    shell.classList.remove('is-closed');
    shell.classList.remove('msg-primary-reader-hidden');
    document.body.classList.remove('msg-primary-reader-view-hidden');
    document.body.classList.remove('msg-primary-reader-standalone', 'msg-primary-reader-resized');
    APP.style.removeProperty('--msg-primary-reader-width');
    if (auxiliaryReaderNumber >= 2) {
      // Selecting Reader 2+ always opens with at least half of the usable
      // reading area. This is applied after the shell is visible so the
      // measurement is based on the real expanded workspace width.
      forceAuxiliaryReaderHalfSplit(shell);
    } else {
      releaseAuxiliaryReaderForcedSplit(shell);
    }
    window.requestAnimationFrame(() => {
      // Opening the workspace also widens #app. Re-measure on the next frame so
      // Reader 2+ gets half of the FINAL expanded reading area, not half of the
      // narrower pre-workspace shell.
      if (auxiliaryReaderNumber >= 2 && activePanelKey === key) {
        forceAuxiliaryReaderHalfSplit(shell);
      }
      dockReaderTopControlsForWorkspace();
    });
    syncMountedWorkspacePanels(body, key);
    syncWorkspacePanelMode(shell, body, key);
    renderWorkspaceTabs(shell);
    return true;
  }

  function registerPanel(key, label, node) {
    if (!PANELS.has(key)) PANEL_ORDER.push(key);
    PANELS.set(key, { key, label, node });
    syncAddReaderControl();
    renderReadersMenu();
    ensurePrimaryReaderStandaloneControls();
    return activatePanel(key);
  }

  function closeWorkspaceTab(key) {
    const index = PANEL_ORDER.indexOf(key);
    const wasActive = key === activePanelKey;
    const record = PANELS.get(key);
    if (record?.node?.isConnected) record.node.remove();
    PANELS.delete(key);
    if (index >= 0) PANEL_ORDER.splice(index, 1);
    syncAddReaderControl();
    renderReadersMenu();
    ensurePrimaryReaderStandaloneControls();

    if (!wasActive) {
      renderWorkspaceTabs();
      schedulePrimaryReaderStandaloneControls();
      return;
    }

    activePanelKey = '';
    const replacement = PANEL_ORDER[Math.min(index, PANEL_ORDER.length - 1)] || PANEL_ORDER[PANEL_ORDER.length - 1] || '';
    if (replacement) activatePanel(replacement);
    else closeWorkspacePanel();
    schedulePrimaryReaderStandaloneControls();
  }

  function panelUrl(mode, value) {
    const readerNumber = mode === 'reader' ? normalizeReaderNumber(value) : 0;
    const auxiliaryReader = readerNumber >= 2;
    // Every auxiliary Reader uses index.html so it receives the complete Reader,
    // Ask Mark, themes, comparison basket and companion stack. Ordinary workspace
    // pages keep the lightweight workspace-pane shell.
    const url = new URL(auxiliaryReader ? '/index.html' : '/workspace-pane.html', window.location.origin);
    url.searchParams.set('msgWorkspaceMode', mode);
    url.searchParams.set('msgWorkspaceValue', auxiliaryReader ? `reader-${readerNumber}` : value);
    if (auxiliaryReader) {
      url.searchParams.set('msgSecondaryReader', '1'); // backwards compatibility
      url.searchParams.set('msgReaderNumber', String(readerNumber));
      url.searchParams.set('msgReaderId', `reader-${readerNumber}`);
    }
    url.searchParams.set('msgWorkspaceBuild', auxiliaryReader ? `0.15.0-reader-${readerNumber}` : '0.13.0');
    return url.toString();
  }

  function createAppPagePanel(mode, value, label) {
    const node = document.createElement('div');
    const readerNumber = mode === 'reader' ? normalizeReaderNumber(value) : 0;
    const auxiliaryReader = readerNumber >= 2;
    node.className = `msg-workspace-panel msg-workspace-app-page${auxiliaryReader ? ' msg-workspace-secondary-reader-page msg-workspace-aux-reader-page' : ''}`;
    if (auxiliaryReader) {
      node.dataset.msgReaderNumber = String(readerNumber);
      node.dataset.msgReaderId = `reader-${readerNumber}`;
    }
    node.innerHTML = `<iframe class="msg-workspace-page-frame${auxiliaryReader ? ' msg-secondary-reader-frame msg-aux-reader-frame' : ''}" ${auxiliaryReader ? `data-msg-reader-number="${readerNumber}" data-msg-reader-id="reader-${readerNumber}"` : ''} title="${escapeWorkspaceHtml(label)}" src="${escapeWorkspaceHtml(panelUrl(mode, value))}" loading="eager"></iframe>`;
    if (auxiliaryReader) {
      const frame = node.querySelector('.msg-aux-reader-frame');
      frame?.addEventListener('load', () => {
        try { frame.contentWindow?.__MSG_SYNC_AUXILIARY_READER_THEME__?.(); } catch {}
      });
    }
    return node;
  }

  function ensureReaderSession(readerNumber) {
    const number = normalizeReaderNumber(readerNumber);
    if (number < 2 || number > MAX_READERS || !hasReader()) return null;

    const key = readerPanelKey(number);
    let record = PANELS.get(key);
    if (record) return record;

    const label = `Reader ${number}`;
    const node = createAppPagePanel('reader', number, label);
    if (!PANEL_ORDER.includes(key)) PANEL_ORDER.push(key);
    record = { key, label, node, documentTitle:'', documentId:'' };
    PANELS.set(key, record);
    syncAddReaderControl();
    renderReadersMenu();
    return record;
  }

  function focusReaderSession(readerNumber) {
    const number = normalizeReaderNumber(readerNumber);
    if (number === 1) {
      closeWorkspacePanel();
      return true;
    }

    const record = ensureReaderSession(number);
    if (!record) return false;

    const shell = ensureWorkspaceShell();
    const body = panelBody(shell);
    if (!body) return false;

    activePanelKey = record.key;
    shell.classList.remove('is-closed');
    shell.classList.remove('msg-primary-reader-hidden');
    document.body.classList.remove('msg-primary-reader-view-hidden');
    setReaderFocusPresentation(shell, number);
    syncMountedWorkspacePanels(body, record.key);
    syncWorkspacePanelMode(shell, body, record.key);
    renderWorkspaceTabs(shell);
    renderReadersMenu();
    syncAddReaderControl();

    // The iframe stays mounted, but its viewport has changed from side-pane
    // dimensions to the full Reader width. Give its existing Reader runtime a
    // normal resize signal so Book Pages and overlays can recalculate without
    // reloading the document.
    window.requestAnimationFrame(() => {
      const frame = record.node?.querySelector?.('.msg-aux-reader-frame');
      try { frame?.contentWindow?.dispatchEvent?.(new Event('resize')); } catch {}
    });
    return true;
  }

  function openAppPage(mode, value, label = '') {
    if (!hasReader()) return false;
    const readerNumber = mode === 'reader' ? normalizeReaderNumber(value) : 0;
    if (readerNumber >= 2) return openReaderSession(readerNumber);

    const key = `page:${mode}:${value}`;
    if (PANELS.has(key)) return activatePanel(key);
    return registerPanel(key, label || humanize(value), createAppPagePanel(mode, value, label || humanize(value)));
  }

  function openReaderSession(readerNumber) {
    const number = normalizeReaderNumber(readerNumber);
    if (number === 1) {
      closeWorkspacePanel();
      renderReadersMenu();
      return true;
    }
    if (number < 2 || number > MAX_READERS || !hasReader()) return false;

    const record = ensureReaderSession(number);
    if (!record) return false;

    // Frame mode: preserve the existing side-by-side workspace behavior.
    if (workspaceEnabled()) {
      return activatePanel(record.key);
    }

    // Non-frame mode: make the selected live Reader the one full-width Reader
    // while Reader 1 and every other session remain mounted and untouched.
    return focusReaderSession(number);
  }

  function addReaderSession() {
    if (!hasReader()) {
      window.alert('Open a text in Reader 1 first, then add another Reader.');
      return false;
    }
    const next = nextAvailableReaderNumber();
    if (!next) {
      window.alert(`You can keep up to ${MAX_READERS} Readers open at once.`);
      return false;
    }
    return openReaderSession(next);
  }

  function consumeWorkspaceSymposiumHandoff(suppliedHandoff = null) {
    // toSymposium() stores the handoff for non-workspace routes too. When the
    // workspace receives that same object directly, consume the stored copy so
    // it cannot be replayed later as a stale topic.
    const pending = window.MSGContentShare?.takeSymposiumHandoff?.() || null;
    return suppliedHandoff || pending;
  }

  function applySymposiumWorkspaceHandoff(rootHost, suppliedHandoff = null) {
    const handoff = consumeWorkspaceSymposiumHandoff(suppliedHandoff);
    const root = rootHost?.querySelector?.('.symposium-page');
    if (!handoff || !root) return false;

    const topicText = String(handoff.symposiumTopic || handoff.title || '').trim();
    const contextText = String(handoff.symposiumContext || handoff.context || handoff.text || '').trim();
    const sourceLabel = String(handoff.sourceLabel || 'Reader').trim() || 'Reader';
    const sharedLabel = `Shared from ${sourceLabel}`;

    const topic = root.querySelector('#symposium-topic');
    const context = root.querySelector('#symposium-context');
    const contextLabel = root.querySelector('#symposium-context-label');
    if (topicText && topic) topic.value = topicText;
    if (context) context.value = contextText;
    if (contextLabel) {
      contextLabel.textContent = contextText
        ? `${sharedLabel} · ${splitWords(contextText).length.toLocaleString()} words available`
        : `${sharedLabel} · topic only`;
    }

    // Keep the newest shared passage available to the context-choice control.
    root.__msgSymposiumShared = { text: contextText, label: sharedLabel };

    // A Symposium opened manually may not yet have a Shared Content button.
    // Add it only when needed; the delegated click handler below owns behavior.
    const contextChoices = root.querySelector('.symposium-context-choice');
    if (contextText && contextChoices && !contextChoices.querySelector('[data-symposium-context="shared"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.symposiumContext = 'shared';
      button.textContent = 'Use shared content';
      contextChoices.prepend(button);
    }

    const status = root.querySelector('#symposium-stage-status');
    if (status) status.textContent = 'New highlighted passage loaded · begin a new Symposium when ready';

    const startButton = root.querySelector('#symposium-start');
    if (startButton && !root.querySelector('#symposium-transcript .symposium-empty')) {
      startButton.textContent = 'Begin New Symposium';
    }

    // A new handoff should leave the action the reader needs next visible.
    // Do not use scrollIntoView() here: it can choose the window/Reader as the
    // scroll target while the workspace is being reactivated. Reveal the Begin
    // button inside the workspace's explicit scroll owner instead.
    revealSymposiumStart(rootHost);
    return true;
  }

  function showWorkspacePanel(kind, options = {}) {
    if (!hasReader()) return false;
    const key = `tool:${kind}`;
    if (PANELS.has(key)) {
      const record = PANELS.get(key);
      const activated = activatePanel(key);
      if (kind === 'symposium') {
        const applied = applySymposiumWorkspaceHandoff(record?.node, options.handoff || null);
        if (!applied) revealSymposiumStart(record?.node);
      }
      return activated;
    }

    const node = document.createElement('div');
    node.className = `msg-workspace-panel msg-workspace-${kind}`;
    if (kind === 'symposium') renderSymposiumWorkspace(node, options.handoff || null);
    else if (kind === 'browser') renderBrowserWorkspace(node);
    else return false;

    const label = kind === 'browser' ? 'Web' : 'Symposium';
    const opened = registerPanel(key, label, node);
    if (opened && kind === 'symposium') revealSymposiumStart(node);
    return opened;
  }

  function normalizeDirectUrl(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^https?:\/\//i.test(text)) return text;
    if (/^[\w.-]+\.[a-z]{2,}(?:[\/:?#]|$)/i.test(text)) return `https://${text}`;
    return '';
  }

  function browserDestination(value) {
    const direct = normalizeDirectUrl(value);
    if (direct) return { url: direct, importable: direct, type: 'url' };
    const query = String(value || '').trim();
    return {
      url: `https://www.google.com/search?igu=1&q=${encodeURIComponent(query)}`,
      importable: '',
      type: 'search'
    };
  }

  function renderBrowserWorkspace(root) {
    root.innerHTML = `
      <section class="msg-browser">
        <div class="msg-browser-toolbar">
          <form class="msg-browser-address-form">
            <input class="msg-browser-address" type="text" autocomplete="off" spellcheck="false" placeholder="Search the web or enter a URL" aria-label="Search the web or enter a URL">
            <button type="submit">Go</button>
          </form>
          <div class="msg-browser-actions">
            <button type="button" data-msg-browser-import disabled>Bring into Reader</button>
            <button type="button" data-msg-browser-external disabled>Open in new tab</button>
          </div>
        </div>
        <div class="msg-browser-status" role="status" aria-live="polite">Enter a web address or search. Some sites block embedded display; importing still works when you enter the article URL above.</div>
        <div class="msg-browser-frame-wrap">
          <div class="msg-browser-start">
            <span aria-hidden="true">🌐</span>
            <h2>Browse while you read</h2>
            <p>Search for a source, open a page, and send a public article into the Reader without leaving the workspace.</p>
          </div>
          <iframe class="msg-browser-frame" title="Web browser preview" referrerpolicy="strict-origin-when-cross-origin" hidden></iframe>
        </div>
      </section>`;

    const form = root.querySelector('.msg-browser-address-form');
    const input = root.querySelector('.msg-browser-address');
    const frame = root.querySelector('.msg-browser-frame');
    const start = root.querySelector('.msg-browser-start');
    const status = root.querySelector('.msg-browser-status');
    const importButton = root.querySelector('[data-msg-browser-import]');
    const externalButton = root.querySelector('[data-msg-browser-external]');
    let importableUrl = '';
    let displayedUrl = '';

    const navigate = (raw) => {
      const value = String(raw || '').trim();
      if (!value) return;
      const target = browserDestination(value);
      displayedUrl = target.url;
      importableUrl = target.importable;
      input.value = target.type === 'url' ? target.url : value;
      importButton.disabled = !importableUrl;
      externalButton.disabled = !displayedUrl;
      start.hidden = true;
      frame.hidden = false;
      frame.src = target.url;
      status.className = 'msg-browser-status';
      status.textContent = target.type === 'search'
        ? 'Search loaded in the preview. To import an article, enter its URL in the address bar after you choose it.'
        : 'Preview requested. If the site blocks embedding, use “Open in new tab” or bring the URL directly into Reader.';
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      navigate(input.value);
    });

    externalButton.addEventListener('click', () => {
      if (displayedUrl) window.open(displayedUrl, '_blank', 'noopener,noreferrer');
    });

    importButton.addEventListener('click', async () => {
      const direct = normalizeDirectUrl(input.value) || importableUrl;
      if (!direct) {
        status.className = 'msg-browser-status error';
        status.textContent = 'Enter the exact article URL before bringing it into Reader.';
        return;
      }
      importButton.disabled = true;
      status.className = 'msg-browser-status';
      status.textContent = 'Extracting readable article text…';
      try {
        const response = await fetch('/api/fetch-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: direct })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'The webpage could not be imported.');
        if (!String(payload.text || '').trim()) throw new Error('No readable article text was found.');
        if (typeof window.MarkSetGoReadAnything?.openDocument !== 'function') throw new Error('Read Anything is not ready.');

        // Detach the entire workspace shell before the existing Reader renderer
        // replaces #app. The secondary panels survive and are reattached after
        // the new Reader document is mounted.
        const records = PANEL_ORDER.map((key) => PANELS.get(key)).filter(Boolean);
        records.forEach((record) => record.node.remove());
        const previousActive = activePanelKey;
        activePanelKey = '';

        const parsed = new URL(direct);
        window.MarkSetGoReadAnything.openDocument({
          title: payload.title || parsed.hostname,
          author: payload.author || '',
          text: payload.text,
          source: { type: 'website', url: direct, site: parsed.hostname, importedAt: new Date().toISOString() }
        });

        window.requestAnimationFrame(() => {
          if (!hasReader()) return;
          ensureWorkspaceShell();
          const restoreKey = PANELS.has(previousActive) ? previousActive : 'tool:browser';
          if (PANELS.has(restoreKey)) activatePanel(restoreKey);
          status.className = 'msg-browser-status success';
          status.textContent = `Opened “${payload.title || parsed.hostname}” in Reader.`;
          importButton.disabled = false;
        });
      } catch (error) {
        status.className = 'msg-browser-status error';
        status.textContent = error?.message || 'The webpage could not be imported.';
        importButton.disabled = false;
      }
    });
  }

  function ensureWorkspaceControls() {
    const nav = document.querySelector('.site-header nav');
    if (!nav) return false;
    const symposium = document.querySelector('[data-action="symposium"]');
    const primaryReader = document.querySelector('.top-reader-return[data-action="reader"]');

    // Retire the old one-off “Reader 2” button. The Readers control owns a compact
    // + button that allocates Reader 2 through Reader 10 as needed.
    document.querySelector('[data-msg-workspace-open="reader"]')?.remove();

    let addReaderButton = document.querySelector('.msg-reader-add-button[data-msg-reader-add]');
    if (!addReaderButton) {
      addReaderButton = document.createElement('button');
      addReaderButton.type = 'button';
      addReaderButton.dataset.msgReaderAdd = '1';
      addReaderButton.className = 'top-level-nav-button msg-reader-add-button';
      addReaderButton.textContent = '+';
      nav.appendChild(addReaderButton);
    }
    let readersMenu = document.querySelector('.msg-readers-menu');
    if (!readersMenu) {
      readersMenu = document.createElement('details');
      readersMenu.className = 'top-nav-menu msg-readers-menu';
      readersMenu.innerHTML = `
        <summary><span class="nav-icon" aria-hidden="true">▤</span> Readers</summary>
        <div class="menu-popover msg-readers-popover" role="menu">
          <div class="msg-readers-list" data-msg-readers-list></div>
          <button type="button" class="msg-readers-add-menu" data-msg-reader-add role="menuitem"><strong>＋ New Reader</strong><small>Open another independent reading session</small></button>
        </div>`;
      nav.appendChild(readersMenu);
    }
    // Keep Reader 1 as a normal direct button, then group Reader management:
    // Reader | Readers | +. The + no longer looks attached to Reader 1.
    if (primaryReader && primaryReader.nextSibling !== readersMenu) {
      primaryReader.insertAdjacentElement('afterend', readersMenu);
    }
    if (readersMenu.nextSibling !== addReaderButton) {
      readersMenu.insertAdjacentElement('afterend', addReaderButton);
    }
    renderReadersMenu();
    syncAddReaderControl();

    let button = document.querySelector('[data-msg-workspace-open="browser"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.msgWorkspaceOpen = 'browser';
      button.className = 'symposium-nav-link msg-browser-nav-link';
      button.innerHTML = '<span aria-hidden="true">🌐</span><span>Web</span>';
      button.title = 'Open Web beside Reader';
      nav.appendChild(button);
    }

    if (symposium && symposium.nextSibling !== button) nav.insertBefore(button, symposium.nextSibling);
    return Boolean(addReaderButton.isConnected && readersMenu.isConnected && button.isConnected);
  }

  function navigationDescriptor(element) {
    if (!element) return null;
    if (element.dataset.action) return { mode: 'action', value: element.dataset.action };
    if (element.dataset.read) return { mode: 'read', value: element.dataset.read };
    if (element.dataset.test) return { mode: 'test', value: element.dataset.test };
    return null;
  }

  function isTopLevelNavigation(element) {
    return Boolean(element?.closest?.('.site-header, .site-footer'));
  }

  document.addEventListener('click', (event) => {

    const close = event.target.closest?.('[data-msg-workspace-close]');
    if (close) {
      event.preventDefault();
      event.stopImmediatePropagation();
      // The header × closes the current page/Reader while Reader continuity
      // remains protected by the existing close/session behavior.
      if (activePanelKey && PANELS.has(activePanelKey)) closeWorkspaceTab(activePanelKey);
      else closeWorkspacePanel();
      return;
    }

    const tabClose = event.target.closest?.('[data-msg-workspace-tab-close]');
    if (tabClose) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeWorkspaceTab(tabClose.dataset.msgWorkspaceTabClose);
      return;
    }

    const tab = event.target.closest?.('[data-msg-workspace-tab]');
    if (tab) {
      event.preventDefault();
      event.stopImmediatePropagation();
      activatePanel(tab.dataset.msgWorkspaceTab);
      return;
    }

    const readerSelect = event.target.closest?.('[data-msg-reader-select]');
    if (readerSelect) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const readerNumber = normalizeReaderNumber(readerSelect.dataset.msgReaderSelect);
      const menu = readerSelect.closest?.('.msg-readers-menu');
      if (menu) menu.open = false;
      if (readerNumber === 1) {
        const shell = workspaceShell();
        shell?.classList.remove('msg-primary-reader-hidden');
        document.body.classList.remove('msg-primary-reader-view-hidden');
        closeWorkspacePanel();
      } else if (readerNumber >= 2) openReaderSession(readerNumber);
      return;
    }

    const addReader = event.target.closest?.('[data-msg-reader-add]');
    if (addReader) {
      event.preventDefault();
      event.stopImmediatePropagation();
      try { closeMenus?.(); } catch {}
      const menu = addReader.closest?.('.msg-readers-menu');
      if (menu) menu.open = false;
      addReaderSession();
      return;
    }

    const browser = event.target.closest?.('[data-msg-workspace-open="browser"]');
    if (browser) {
      event.preventDefault();
      event.stopImmediatePropagation();
      try { closeMenus?.(); } catch {}
      if (!hasReader()) {
        window.alert('Open something in the Reader first to use Web in the workspace.');
        return;
      }
      writeWorkspacePreference(true);
      installProfileWorkspaceToggle(document);
      showWorkspacePanel('browser');
      return;
    }

    const navTarget = event.target.closest?.('[data-action], [data-read], [data-test]');
    if (!navTarget || !isTopLevelNavigation(navTarget)) return;

    if (navTarget.dataset.action === 'profile-preferences' && (!workspaceEnabled() || !hasReader())) {
      window.setTimeout(() => installProfileWorkspaceToggle(document), 0);
    }

    const descriptor = navigationDescriptor(navTarget);
    if (!descriptor) return;

    // Home / the Mark, Set, Go! brand is the intentional exception to the
    // workspace: it is the app's full-width welcome/start page. Close any
    // secondary pane, then allow the normal app.js Home route to run.
    if (descriptor.mode === 'action' && descriptor.value === 'home') {
      closeWorkspacePanel();
      return;
    }

    // Reader means "return focus to Reader" when a workspace is already open.
    if (descriptor.mode === 'action' && descriptor.value === 'reader' && workspaceShell() && !workspaceShell().classList.contains('is-closed')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeWorkspacePanel();
      return;
    }

    if (!workspaceEnabled() || !hasReader()) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    try { closeMenus?.(); } catch {}

    if (descriptor.mode === 'action' && descriptor.value === 'symposium') {
      showWorkspacePanel('symposium');
      return;
    }

    openAppPage(descriptor.mode, descriptor.value, navigationLabel(navTarget, descriptor.value));
  }, true);

  // Symposium is injected shortly after startup. Polling keeps this experiment
  // isolated and avoids a MutationObserver. Also retry at a few later points in
  // case another startup script finishes arranging the header after our first pass.
  ensureWorkspaceControls();
  ensurePrimaryReaderStandaloneControls();
  let navAttempts = 0;
  const navTimer = window.setInterval(() => {
    navAttempts += 1;
    if (ensureWorkspaceControls() || navAttempts > 40) window.clearInterval(navTimer);
  }, 250);
  [1200, 3000, 6000].forEach((delay) => window.setTimeout(ensureWorkspaceControls, delay));
  window.addEventListener('pageshow', () => {
    ensureWorkspaceControls();
    ensurePrimaryReaderStandaloneControls();
  });
  window.addEventListener('resize', () => {
    if (!document.body.classList.contains('msg-primary-reader-resized')) return;
    const width = clampPrimaryReaderWidth(APP.getBoundingClientRect().width);
    APP.style.setProperty('--msg-primary-reader-width', `${width}px`);
  });

  document.addEventListener('marksetgo:document-available', () => {
    window.setTimeout(() => {
      dockReaderTopControlsForWorkspace();
      syncAddReaderControl();
      renderReadersMenu();
      ensurePrimaryReaderStandaloneControls();
    }, 0);
  });

  window.MSGWorkspaceExperiment = Object.freeze({
    open: showWorkspacePanel,
    openPage: openAppPage,
    close: closeWorkspacePanel,
    browser: () => showWorkspacePanel('browser'),
    symposium: (handoff = null) => showWorkspacePanel('symposium', { handoff }),
    musicSearch: (query, title) => workspaceYouTubeSearch(query, title),
    addReader: addReaderSession,
    openReader: openReaderSession,
    readers: () => listReaderSessions().map((reader) => ({ ...reader })),
    maxReaders: MAX_READERS,
    activeReader: () => readerNumberFromPanelKey(activePanelKey) || 1,
    closePrimaryReader: closePrimaryReaderView,
    resetPrimaryReaderWidth,
    enabled: workspaceEnabled,
    setEnabled: (enabled) => {
      const value = Boolean(enabled);
      writeWorkspacePreference(value);
      installProfileWorkspaceToggle(document);
      applyWorkspacePreferencePresentation(value);
    }
  });

function renderSymposiumWorkspace(rootHost, suppliedHandoff = null) {
  ensureSymposiumStyles();
  const readingContext = currentSymposiumReadingContext();
  const sharedHandoff = consumeWorkspaceSymposiumHandoff(suppliedHandoff);
  const sharedContextText = String(sharedHandoff?.symposiumContext || '').trim();
  const sharedContextLabel = sharedHandoff ? `Shared from ${sharedHandoff.sourceLabel || 'app content'}` : '';
  const defaultTopic = sharedHandoff?.symposiumTopic || (state?.title ? `Explore the central ideas in ${state.title}` : '');
  const initialContextText = sharedContextText || readingContext.text;
  const initialContextLabel = sharedContextText ? sharedContextLabel : readingContext.label;
  const defaultChecked = new Set(['socrates','aristotle','einstein','lovelace']);

  rootHost.innerHTML = `
    <section class="symposium-page">
      <header class="symposium-hero">
        <div>
          <span class="symposium-kicker">◉ The Symposium · Prototype</span>
          <h1>Put great minds around the same table.</h1>
          <p>Explore what you are reading through friendly debate, interview, explanation, or a court-style examination of a claim. AI participants represent the methods and ideas of major thinkers while the moderator keeps the exchange charitable, evidence-based, and on topic.</p>
        </div>
        <aside class="symposium-badge"><strong>Reader participates</strong><small>Listen, read, question, challenge, supply evidence, or enter your own argument at any point.</small></aside>
      </header>

      <section class="symposium-saved-panel" aria-label="Saved Symposiums">
        <div class="symposium-saved-head"><div><strong>Saved Symposiums</strong><small>Cloud-backed sessions you can reopen and continue later.</small></div><button type="button" id="symposium-refresh-sessions">Refresh</button></div>
        <div class="symposium-saved-list" id="symposium-saved-list"><div class="symposium-saved-empty">Loading saved Symposiums…</div></div>
      </section>

      <div class="symposium-layout">
        <aside class="symposium-panel">
          <div class="symposium-panel-head"><h2>Set the table</h2><p>Choose a format, topic, context, and participants.</p></div>
          <div class="symposium-setup">
            <div>
              <label>Format</label>
              <div class="symposium-mode-grid">
                <label class="symposium-mode"><input type="radio" name="symposium-mode" value="debate" checked><span>Roundtable<small>Cordial debate</small></span></label>
                <label class="symposium-mode"><input type="radio" name="symposium-mode" value="interview"><span>Interview<small>Question a thinker</small></span></label>
                <label class="symposium-mode"><input type="radio" name="symposium-mode" value="court"><span>Court<small>Put a claim on trial</small></span></label>
                <label class="symposium-mode"><input type="radio" name="symposium-mode" value="explain"><span>Explain<small>Teach from many lenses</small></span></label>
              </div>
            </div>

            <label>Session name
              <input id="symposium-session-title" type="text" maxlength="240" placeholder="Optional — generated from the topic">
            </label>

            <label>Topic or question
              <textarea id="symposium-topic" placeholder="Example: Is technological progress making us wiser?">${symposiumEscape(defaultTopic)}</textarea>
            </label>

            <div>
              <label>Reading context</label>
              <div class="symposium-context-choice">
                ${sharedContextText ? '<button type="button" data-symposium-context="shared">Use shared content</button>' : ''}
                <button type="button" data-symposium-context="reading" ${readingContext.text ? '' : 'disabled'}>Use current reading</button>
                <button type="button" data-symposium-context="none">Topic only</button>
              </div>
              <input id="symposium-context" type="hidden" value="${symposiumEscape(initialContextText)}">
              <p class="symposium-hint" id="symposium-context-label">${symposiumEscape(initialContextLabel)}${initialContextText ? ` · ${splitWords(initialContextText).length.toLocaleString()} words available` : ''}</p>
            </div>

            <label>Output
              <select id="symposium-output"><option value="write">Write</option><option value="both">Speak + write</option><option value="speak">Speak (transcript remains visible)</option></select>
            </label>

            <!-- Keep the primary action above the long participant roster.
                 The workspace renderer is separate from app.js, so this must
                 stay in sync with the standalone Symposium renderer. -->
            <button class="symposium-start" type="button" id="symposium-start">Begin Symposium</button>

            <div class="symposium-add-participant-block">
              <label>Add a participant</label>
              <div class="symposium-custom-row"><input id="symposium-custom-person" placeholder="e.g., Hannah Arendt"><button type="button" id="symposium-add-person">Add</button></div>
              <p class="symposium-hint">Custom participants join this session as an AI representation of their published ideas.</p>
            </div>

            <div>
              <label>Participants <span style="font-weight:500;color:#718095">(choose 1–6)</span></label>
              <div class="symposium-roster" id="symposium-roster">
                ${SYMPOSIUM_PARTICIPANTS.map((person)=>`<label class="symposium-person"><input type="checkbox" data-symposium-person value="${person.id}" ${defaultChecked.has(person.id)?'checked':''}><span class="symposium-avatar">${symposiumEscape(person.monogram)}</span><span><strong>${symposiumEscape(person.name)}</strong><small>${symposiumEscape(person.field)} · ${symposiumEscape(person.era)}</small></span></label>`).join('')}
              </div>
            </div>

          </div>
        </aside>

        <main class="symposium-panel symposium-stage">
          <div class="symposium-stage-toolbar">
            <span class="symposium-stage-status" id="symposium-stage-status">Ready to convene</span>
            <div class="symposium-stage-actions"><button type="button" id="symposium-next" disabled>Next speaker</button><button type="button" id="symposium-save" disabled>Save now</button><button type="button" id="symposium-chat" disabled>💬 Send to Chat</button><button type="button" id="symposium-stop-speech">Stop speech</button><button type="button" id="symposium-clear">New session</button></div>
          </div>
          <div class="symposium-transcript" id="symposium-transcript" aria-live="polite">
            <div class="symposium-empty"><span class="symposium-empty-icon">🏛️</span><h2>The room is ready.</h2><p>Choose participants and a question. Athena, the moderator, will frame the issue and invite the first response.</p></div>
          </div>
          <div class="symposium-participate">
            <label for="symposium-reader-input">Join the discussion</label>
            <div class="symposium-user-grid"><select id="symposium-reader-kind"><option value="argument">My argument</option><option value="evidence">Add evidence</option><option value="question">Question</option><option value="challenge">Challenge</option></select><textarea id="symposium-reader-input" placeholder="Add your opinion, reasoning, evidence, or question…"></textarea><button type="button" id="symposium-reader-submit" disabled>Enter</button></div>
            <p class="symposium-hint">The moderator will invite the panel to address your contribution directly.</p>
          </div>
        </main>
      </div>
    </section>`;

  const root = rootHost.querySelector('.symposium-page');
  const transcriptEl = root.querySelector('#symposium-transcript');
  const statusEl = root.querySelector('#symposium-stage-status');
  const nextButton = root.querySelector('#symposium-next');
  const saveButton = root.querySelector('#symposium-save');
  const chatButton = root.querySelector('#symposium-chat');
  const readerButton = root.querySelector('#symposium-reader-submit');
  const startButton = root.querySelector('#symposium-start');
  const rosterEl = root.querySelector('#symposium-roster');
  const session = { active:false, mode:'debate', topic:'', title:'', context:'', output:'write', people:[], transcript:[], nextIndex:0, pendingReaderContribution:'', startedAt:'', cloudId:'', clientSessionId:'', cloudWriteQueue:Promise.resolve(), cloudError:'', sourceContext:{} };
  const symposiumCloud = createSymposiumCloudController({ root, session, transcriptEl, statusEl, nextButton, saveButton, chatButton, readerButton, startButton, rosterEl });
  symposiumCloud.refreshSaved();
  root.__msgSymposiumShared = { text: sharedContextText, label: sharedContextLabel };

  const scrollTranscript = () => { transcriptEl.scrollTop = transcriptEl.scrollHeight; };
  const shouldSpeak = () => session.output === 'both' || session.output === 'speak';
  const appendTurn = (turn, speak=false) => {
    if (transcriptEl.querySelector('.symposium-empty')) transcriptEl.innerHTML = '';
    session.transcript.push(turn);
    transcriptEl.insertAdjacentHTML('beforeend', symposiumTurnHtml(turn));
    symposiumCloud.persistTurn(turn).catch(()=>{});
    scrollTranscript();
    if (speak && shouldSpeak()) symposiumSpeak(turn.text, turn.name);
  };
  const setBusy = (busy, label='') => {
    startButton.disabled = busy;
    nextButton.disabled = busy || !session.active;
    readerButton.disabled = busy || !session.active;
    if (label) statusEl.innerHTML = busy ? `${symposiumEscape(label)} <span class="symposium-loading"><i></i><i></i><i></i></span>` : symposiumEscape(label);
  };

  root.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-symposium-context]');
    if (!button || !root.contains(button)) return;
    const liveShared = root.__msgSymposiumShared || { text: sharedContextText, label: sharedContextLabel };
    if (button.dataset.symposiumContext === 'shared' && liveShared.text) {
      root.querySelector('#symposium-context').value = liveShared.text;
      root.querySelector('#symposium-context-label').textContent = `${liveShared.label} · ${splitWords(liveShared.text).length.toLocaleString()} words available`;
    } else if (button.dataset.symposiumContext === 'reading') {
      root.querySelector('#symposium-context').value = readingContext.text;
      root.querySelector('#symposium-context-label').textContent = `${readingContext.label} · ${splitWords(readingContext.text).length.toLocaleString()} words available`;
    } else if (button.dataset.symposiumContext === 'none') {
      root.querySelector('#symposium-context').value = '';
      root.querySelector('#symposium-context-label').textContent = 'Topic only · no reading passage supplied';
    }
  });

  rosterEl.addEventListener('change', (event)=>{
    if (!event.target.matches('[data-symposium-person]')) return;
    const checked = symposiumSelectedPeople(root);
    if (checked.length > 6) { event.target.checked = false; window.alert('Choose up to six participants for a readable discussion.'); }
  });

  root.querySelector('#symposium-add-person').addEventListener('click',()=>{
    const input = root.querySelector('#symposium-custom-person');
    const name = input.value.trim();
    if (!name) return;
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const monogram = name.split(/\s+/).slice(0,2).map((part)=>part[0]?.toUpperCase() || '').join('');
    const person = { id, name, field:'Guest thinker', era:'Custom', monogram:monogram || '?', lens:`the published work, arguments, methods, and intellectual context of ${name}` };
    SYMPOSIUM_PARTICIPANTS.push(person);
    rosterEl.insertAdjacentHTML('afterbegin', `<label class="symposium-person"><input type="checkbox" data-symposium-person value="${symposiumEscape(id)}" checked><span class="symposium-avatar">${symposiumEscape(person.monogram)}</span><span><strong>${symposiumEscape(name)}</strong><small>Guest thinker · Custom</small></span></label>`);
    input.value = '';
  });

  async function moderatorOpening() {
    const names = session.people.map((person)=>person.name).join(', ');
    const modeName = {debate:'roundtable debate', interview:'interview', court:'court-style examination', explain:'collaborative explanation'}[session.mode];
    return `Welcome. Our subject is “${session.topic}.” We will conduct this as a ${modeName}. Joining us are ${names}. I ask each participant to interpret opposing views charitably, separate evidence from assumption, avoid invented quotations, and respond to the strongest version of an argument. Reader, you may enter your own argument, evidence, question, or challenge at any time.`;
  }

  async function runSpeaker(person, userContribution='') {
    setBusy(true, `${person.name} is considering the question`);
    try {
      const text = await symposiumAskAi({ person, mode:session.mode, topic:session.topic, context:session.context, transcript:session.transcript, userContribution });
      appendTurn({ name:person.name, monogram:person.monogram, field:person.field, text, kind:'participant', sourceLabel:`AI representation · ${person.field}` }, true);
      statusEl.textContent = `${person.name} has finished · ${session.transcript.length} turns`;
    } catch (error) {
      appendTurn({ name:person.name, monogram:person.monogram, field:person.field, text:`I could not join this turn because the AI request failed: ${error.message}`, kind:'participant' }, false);
      statusEl.textContent = 'A speaker request failed';
    } finally { setBusy(false); }
  }

  startButton.addEventListener('click', async ()=>{
    const topic = root.querySelector('#symposium-topic').value.trim();
    const people = symposiumSelectedPeople(root);
    if (!topic) { root.querySelector('#symposium-topic').focus(); return window.alert('Enter a topic or question for the Symposium.'); }
    if (!people.length) return window.alert('Choose at least one participant.');
    session.active = true;
    startButton.disabled = true;
    session.mode = root.querySelector('[name="symposium-mode"]:checked')?.value || 'debate';
    session.topic = topic;
    session.title = root.querySelector('#symposium-session-title')?.value.trim() || symposiumDefaultSessionTitle(topic);
    session.context = root.querySelector('#symposium-context').value || '';
    session.output = root.querySelector('#symposium-output').value || 'write';
    session.people = people;
    session.startedAt = new Date().toISOString();
    try {
      await symposiumCloud.beginNew();
    } catch (error) {
      const proceed = window.confirm(`This Symposium cannot be saved to the cloud right now: ${error.message}

Start a temporary session anyway?`);
      if (!proceed) { session.active = false; startButton.disabled = false; return; }
      statusEl.textContent = 'Temporary session · cloud save unavailable';
    }
    session.transcript = [];
    session.nextIndex = 0;
    session.pendingReaderContribution = '';
    transcriptEl.innerHTML = '';
    appendTurn({ name:'Athena', monogram:'A', field:'Moderator', text:await moderatorOpening(), kind:'moderator', sourceLabel:'Moderator · decorum & evidence' }, true);
    nextButton.disabled = false; saveButton.disabled = false; if (chatButton) chatButton.disabled = false; readerButton.disabled = false;
    await runSpeaker(session.people[0]);
    session.nextIndex = session.people.length > 1 ? 1 : 0;
    symposiumCloud.queueState().catch(()=>{});
  });

  nextButton.addEventListener('click', async ()=>{
    if (!session.active || !session.people.length) return;
    const person = session.people[session.nextIndex % session.people.length];
    session.nextIndex = (session.nextIndex + 1) % session.people.length;
    const pending = session.pendingReaderContribution;
    session.pendingReaderContribution = '';
    await runSpeaker(person, pending);
    symposiumCloud.queueState().catch(()=>{});
  });

  readerButton.addEventListener('click', async ()=>{
    const input = root.querySelector('#symposium-reader-input');
    const text = input.value.trim();
    if (!text || !session.active) return;
    const kind = root.querySelector('#symposium-reader-kind').value;
    const labels = { argument:'Reader argument', evidence:'Reader evidence', question:'Reader question', challenge:'Reader challenge' };
    appendTurn({ name:'You', monogram:'You', field:labels[kind] || 'Reader', text, kind:'user' }, false);
    input.value = '';
    const readerContribution = `${labels[kind]}: ${text}`;
    session.pendingReaderContribution = readerContribution;
    appendTurn({ name:'Athena', monogram:'A', field:'Moderator', text:`Thank you. The next participant will respond to your ${kind} before continuing the broader discussion: first restating the substance of your point, then saying where they agree, disagree, or qualify it, and why.`, kind:'moderator' }, shouldSpeak());
    const person = session.people[session.nextIndex % session.people.length];
    session.nextIndex = (session.nextIndex + 1) % session.people.length;
    session.pendingReaderContribution = '';
    await runSpeaker(person, readerContribution);
    symposiumCloud.queueState().catch(()=>{});
  });

  root.querySelector('#symposium-reader-input').addEventListener('keydown',(event)=>{
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') readerButton.click();
  });

  transcriptEl.addEventListener('click',(event)=>{
    const shareButton = event.target.closest('[data-symposium-share-turn]');
    if (shareButton) {
      const body = shareButton.closest('.symposium-turn-body');
      const name = body?.querySelector('.symposium-turn-head strong')?.textContent?.trim() || 'Symposium';
      const field = body?.querySelector('.symposium-turn-head span')?.textContent?.trim() || '';
      const text = body?.querySelector('p')?.textContent?.trim() || '';
      window.MSGContentShare?.toChat?.({ type:'symposium-turn', title:`${name} · ${session.topic || 'Symposium'}`, text, sourceLabel:'Symposium', chapter:field, metadata:{ topic:session.topic || '' } });
      return;
    }
    const button = event.target.closest('[data-symposium-speak-last]');
    if (!button) return;
    const body = button.closest('.symposium-turn-body');
    symposiumSpeak(body?.querySelector('p')?.textContent || '', body?.querySelector('strong')?.textContent || 'Speaker');
  });

  chatButton?.addEventListener('click',()=>{
    if (!session.transcript.length) return;
    const text = session.transcript.map((turn)=>`${turn.name}${turn.field ? ` (${turn.field})` : ''}: ${turn.text}`).join('\n\n');
    window.MSGContentShare?.toChat?.({
      type:'symposium-transcript',
      title:`Symposium · ${session.topic || 'Discussion'}`,
      text,
      sourceLabel:'Symposium',
      metadata:{ mode:session.mode, participants:session.people.map((person)=>person.name).join(', ') }
    });
  });

  root.querySelector('#symposium-stop-speech').addEventListener('click',()=>window.speechSynthesis?.cancel?.());
  root.querySelector('#symposium-clear').addEventListener('click',()=>{ window.speechSynthesis?.cancel?.(); renderSymposiumWorkspace(rootHost); });
  saveButton.addEventListener('click', async ()=>{
    if (!session.transcript.length) return;
    const original = saveButton.textContent;
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';
    try {
      await symposiumCloud.saveNow();
      saveButton.textContent = 'Saved ✓';
    } catch (error) {
      saveButton.textContent = 'Save failed';
      statusEl.textContent = `Cloud save problem · ${error.message}`;
    } finally {
      window.setTimeout(() => { if (saveButton.isConnected) { saveButton.textContent = original; saveButton.disabled = !session.active; } }, 1300);
    }
  });
}

})();
