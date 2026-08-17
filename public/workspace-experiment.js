/*
 * Mark, Set, Go! Workspace Experiment v0.4.1
 * Opt-in multi-page workspace: keep the outer Reader mounted while app pages
 * open in a compact, resizable side pane. Generic app pages run in a same-origin
 * sandboxed app frame so their renderers cannot destroy the outer Reader.
 * No MutationObserver is used by this experiment.
 */
(() => {
  'use strict';

  const PARAMS = new URLSearchParams(window.location.search);
  const IS_WORKSPACE_PANE = PARAMS.get('msgWorkspacePane') === '1';
  const WORKSPACE_PREF_KEY = 'msg-workspace-optin-v1';

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
  let secondaryWidth = Math.max(420, Math.min(760, Math.round(window.innerWidth * 0.42)));

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
      if (query && typeof playYouTubeSearch === 'function') {
        playYouTubeSearch(query, title);
      }
      return;
    }
    if (event.data?.type === 'msg-workspace-music-play') {
      const choice = event.data.choice;
      if (choice && typeof playMusic === 'function') {
        playMusic(choice);
      }
      return;
    }
    if (event.data?.type === 'msg-workspace-preference') {
      writeWorkspacePreference(Boolean(event.data.enabled));
      installProfileWorkspaceToggle(document);
      if (!event.data.enabled) closeWorkspacePanel();
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== WORKSPACE_PREF_KEY) return;
    installProfileWorkspaceToggle(document);
    if (event.newValue !== '1') closeWorkspacePanel();
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
        <button class="msg-workspace-close" type="button" data-msg-workspace-close aria-label="Close workspace">×</button>
      </header>
      <div class="msg-workspace-panel-body"></div>`;

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
      const minSecondary = 360;
      const minPrimary = 520;
      const proposed = Math.round(rect.right - event.clientX);
      secondaryWidth = Math.max(minSecondary, Math.min(proposed, Math.max(minSecondary, rect.width - minPrimary - 8)));
      shell.style.setProperty('--msg-secondary-width', `${secondaryWidth}px`);
    };

    const finish = (event) => {
      if (pointerId == null || event.pointerId !== pointerId) return;
      try { divider.releasePointerCapture(pointerId); } catch {}
      pointerId = null;
      document.body.classList.remove('msg-workspace-resizing');
    };

    divider.addEventListener('pointerdown', (event) => {
      if (window.matchMedia('(max-width: 900px)').matches) return;
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

  function detachActivePanel() {
    const record = activePanelRecord();
    if (record?.node?.isConnected) record.node.remove();
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
          <button type="button" class="msg-workspace-tab-main" data-msg-workspace-tab="${escapeWorkspaceHtml(key)}" aria-pressed="${active ? 'true' : 'false'}">${escapeWorkspaceHtml(record.label)}</button>
          <button type="button" class="msg-workspace-tab-x" data-msg-workspace-tab-close="${escapeWorkspaceHtml(key)}" aria-label="Close ${escapeWorkspaceHtml(record.label)}">×</button>
        </span>`;
      }).join('');
  }

  function closeWorkspacePanel() {
    const shell = workspaceShell();
    if (!shell) return;
    detachActivePanel();
    activePanelKey = '';
    shell.classList.add('is-closed');
    renderWorkspaceTabs(shell);
    window.speechSynthesis?.cancel?.();
  }

  function activatePanel(key) {
    const record = PANELS.get(key);
    if (!record || !hasReader()) return false;

    const shell = ensureWorkspaceShell();
    const body = panelBody(shell);
    if (!body) return false;

    if (activePanelKey !== key) detachActivePanel();
    activePanelKey = key;
    shell.classList.remove('is-closed');
    shell.style.setProperty('--msg-secondary-width', `${secondaryWidth}px`);
    if (!record.node.isConnected) body.appendChild(record.node);
    renderWorkspaceTabs(shell);
    return true;
  }

  function registerPanel(key, label, node) {
    if (!PANELS.has(key)) PANEL_ORDER.push(key);
    PANELS.set(key, { key, label, node });
    return activatePanel(key);
  }

  function closeWorkspaceTab(key) {
    const index = PANEL_ORDER.indexOf(key);
    const wasActive = key === activePanelKey;
    const record = PANELS.get(key);
    if (record?.node?.isConnected) record.node.remove();
    PANELS.delete(key);
    if (index >= 0) PANEL_ORDER.splice(index, 1);

    if (!wasActive) {
      renderWorkspaceTabs();
      return;
    }

    activePanelKey = '';
    const replacement = PANEL_ORDER[Math.min(index, PANEL_ORDER.length - 1)] || PANEL_ORDER[PANEL_ORDER.length - 1] || '';
    if (replacement) activatePanel(replacement);
    else closeWorkspacePanel();
  }

  function panelUrl(mode, value) {
    const url = new URL('/workspace-pane.html', window.location.origin);
    url.searchParams.set('msgWorkspaceMode', mode);
    url.searchParams.set('msgWorkspaceValue', value);
    return url.toString();
  }

  function createAppPagePanel(mode, value, label) {
    const node = document.createElement('div');
    node.className = 'msg-workspace-panel msg-workspace-app-page';
    node.innerHTML = `<iframe class="msg-workspace-page-frame" title="${escapeWorkspaceHtml(label)}" src="${escapeWorkspaceHtml(panelUrl(mode, value))}" loading="eager"></iframe>`;
    return node;
  }

  function openAppPage(mode, value, label = '') {
    if (!hasReader()) return false;
    const key = `page:${mode}:${value}`;
    if (PANELS.has(key)) return activatePanel(key);
    return registerPanel(key, label || humanize(value), createAppPagePanel(mode, value, label || humanize(value)));
  }

  function showWorkspacePanel(kind) {
    if (!hasReader()) return false;
    const key = `tool:${kind}`;
    if (PANELS.has(key)) return activatePanel(key);

    const node = document.createElement('div');
    node.className = `msg-workspace-panel msg-workspace-${kind}`;
    if (kind === 'symposium') renderSymposiumWorkspace(node);
    else if (kind === 'browser') renderBrowserWorkspace(node);
    else return false;

    const label = kind === 'browser' ? 'Web' : 'Symposium';
    return registerPanel(key, label, node);
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
    return Boolean(symposium && button.isConnected);
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
      closeWorkspacePanel();
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
  let navAttempts = 0;
  const navTimer = window.setInterval(() => {
    navAttempts += 1;
    if (ensureWorkspaceControls() || navAttempts > 40) window.clearInterval(navTimer);
  }, 250);
  [1200, 3000, 6000].forEach((delay) => window.setTimeout(ensureWorkspaceControls, delay));
  window.addEventListener('pageshow', ensureWorkspaceControls);

  window.MSGWorkspaceExperiment = Object.freeze({
    open: showWorkspacePanel,
    openPage: openAppPage,
    close: closeWorkspacePanel,
    browser: () => showWorkspacePanel('browser'),
    symposium: () => showWorkspacePanel('symposium'),
    enabled: workspaceEnabled,
    setEnabled: (enabled) => { writeWorkspacePreference(Boolean(enabled)); installProfileWorkspaceToggle(document); if (!enabled) closeWorkspacePanel(); }
  });

function renderSymposiumWorkspace(rootHost) {
  ensureSymposiumStyles();
  const readingContext = currentSymposiumReadingContext();
  const defaultTopic = state?.title ? `Explore the central ideas in ${state.title}` : '';
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

            <label>Topic or question
              <textarea id="symposium-topic" placeholder="Example: Is technological progress making us wiser?">${symposiumEscape(defaultTopic)}</textarea>
            </label>

            <div>
              <label>Reading context</label>
              <div class="symposium-context-choice">
                <button type="button" data-symposium-context="reading" ${readingContext.text ? '' : 'disabled'}>Use current reading</button>
                <button type="button" data-symposium-context="none">Topic only</button>
              </div>
              <input id="symposium-context" type="hidden" value="${symposiumEscape(readingContext.text)}">
              <p class="symposium-hint" id="symposium-context-label">${symposiumEscape(readingContext.label)}${readingContext.text ? ` · ${splitWords(readingContext.text).length.toLocaleString()} words available` : ''}</p>
            </div>

            <label>Output
              <select id="symposium-output"><option value="write">Write</option><option value="both">Speak + write</option><option value="speak">Speak (transcript remains visible)</option></select>
            </label>

            <div>
              <label>Participants <span style="font-weight:500;color:#718095">(choose 1–6)</span></label>
              <div class="symposium-roster" id="symposium-roster">
                ${SYMPOSIUM_PARTICIPANTS.map((person)=>`<label class="symposium-person"><input type="checkbox" data-symposium-person value="${person.id}" ${defaultChecked.has(person.id)?'checked':''}><span class="symposium-avatar">${symposiumEscape(person.monogram)}</span><span><strong>${symposiumEscape(person.name)}</strong><small>${symposiumEscape(person.field)} · ${symposiumEscape(person.era)}</small></span></label>`).join('')}
              </div>
            </div>

            <div>
              <label>Add a participant</label>
              <div class="symposium-custom-row"><input id="symposium-custom-person" placeholder="e.g., Hannah Arendt"><button type="button" id="symposium-add-person">Add</button></div>
              <p class="symposium-hint">Custom participants join this session as an AI representation of their published ideas.</p>
            </div>

            <button class="symposium-start" type="button" id="symposium-start">Begin Symposium</button>
          </div>
        </aside>

        <main class="symposium-panel symposium-stage">
          <div class="symposium-stage-toolbar">
            <span class="symposium-stage-status" id="symposium-stage-status">Ready to convene</span>
            <div class="symposium-stage-actions"><button type="button" id="symposium-next" disabled>Next speaker</button><button type="button" id="symposium-save" disabled>Save transcript</button><button type="button" id="symposium-stop-speech">Stop speech</button><button type="button" id="symposium-clear">New session</button></div>
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
  const readerButton = root.querySelector('#symposium-reader-submit');
  const startButton = root.querySelector('#symposium-start');
  const rosterEl = root.querySelector('#symposium-roster');
  const session = { active:false, mode:'debate', topic:'', context:'', output:'write', people:[], transcript:[], nextIndex:0, pendingReaderContribution:'' };

  const scrollTranscript = () => { transcriptEl.scrollTop = transcriptEl.scrollHeight; };
  const shouldSpeak = () => session.output === 'both' || session.output === 'speak';
  const appendTurn = (turn, speak=false) => {
    if (transcriptEl.querySelector('.symposium-empty')) transcriptEl.innerHTML = '';
    session.transcript.push(turn);
    transcriptEl.insertAdjacentHTML('beforeend', symposiumTurnHtml(turn));
    scrollTranscript();
    if (speak && shouldSpeak()) symposiumSpeak(turn.text, turn.name);
  };
  const setBusy = (busy, label='') => {
    startButton.disabled = busy;
    nextButton.disabled = busy || !session.active;
    readerButton.disabled = busy || !session.active;
    if (label) statusEl.innerHTML = busy ? `${symposiumEscape(label)} <span class="symposium-loading"><i></i><i></i><i></i></span>` : symposiumEscape(label);
  };

  root.querySelectorAll('[data-symposium-context]').forEach((button)=>button.addEventListener('click',()=>{
    if (button.dataset.symposiumContext === 'reading') {
      root.querySelector('#symposium-context').value = readingContext.text;
      root.querySelector('#symposium-context-label').textContent = `${readingContext.label} · ${splitWords(readingContext.text).length.toLocaleString()} words available`;
    } else {
      root.querySelector('#symposium-context').value = '';
      root.querySelector('#symposium-context-label').textContent = 'Topic only · no reading passage supplied';
    }
  }));

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
    session.mode = root.querySelector('[name="symposium-mode"]:checked')?.value || 'debate';
    session.topic = topic;
    session.context = root.querySelector('#symposium-context').value || '';
    session.output = root.querySelector('#symposium-output').value || 'write';
    session.people = people;
    session.transcript = [];
    session.nextIndex = 0;
    session.pendingReaderContribution = '';
    transcriptEl.innerHTML = '';
    appendTurn({ name:'Athena', monogram:'A', field:'Moderator', text:await moderatorOpening(), kind:'moderator', sourceLabel:'Moderator · decorum & evidence' }, true);
    nextButton.disabled = false; saveButton.disabled = false; readerButton.disabled = false;
    await runSpeaker(session.people[0]);
    session.nextIndex = session.people.length > 1 ? 1 : 0;
  });

  nextButton.addEventListener('click', async ()=>{
    if (!session.active || !session.people.length) return;
    const person = session.people[session.nextIndex % session.people.length];
    session.nextIndex = (session.nextIndex + 1) % session.people.length;
    const pending = session.pendingReaderContribution;
    session.pendingReaderContribution = '';
    await runSpeaker(person, pending);
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
  });

  root.querySelector('#symposium-reader-input').addEventListener('keydown',(event)=>{
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') readerButton.click();
  });

  transcriptEl.addEventListener('click',(event)=>{
    const button = event.target.closest('[data-symposium-speak-last]');
    if (!button) return;
    const body = button.closest('.symposium-turn-body');
    symposiumSpeak(body?.querySelector('p')?.textContent || '', body?.querySelector('strong')?.textContent || 'Speaker');
  });

  root.querySelector('#symposium-stop-speech').addEventListener('click',()=>window.speechSynthesis?.cancel?.());
  root.querySelector('#symposium-clear').addEventListener('click',()=>{ window.speechSynthesis?.cancel?.(); renderSymposiumWorkspace(rootHost); });
  saveButton.addEventListener('click',()=>{
    if (!session.transcript.length) return;
    saveSymposiumSession({ mode:session.mode, topic:session.topic, participants:session.people.map((p)=>p.name), transcript:session.transcript });
    const original = saveButton.textContent; saveButton.textContent = 'Saved ✓'; window.setTimeout(()=>saveButton.textContent=original,1300);
  });
}

})();
