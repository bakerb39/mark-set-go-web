(() => {
  'use strict';

  const app = document.getElementById('app');
  if (!app) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const transformApi = () => window.MarkSetGoReadAnything;

  let shell = null;
  let legacyHost = null;
  let selectionObserver = null;
  let installAttempts = 0;

  const QUICK_ACTIONS = [
    ['explain', '✦', 'Explain'],
    ['summarize', '≡', 'Summarize'],
    ['analyze', '◇', 'Analyze'],
    ['simplify', 'Aa', 'Simplify'],
    ['context', '⌂', 'Context'],
    ['related', '∞', 'Compare']
  ];

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }

  function getBookContext() {
    const title =
      $('#reader-title')?.textContent?.trim() ||
      $('.reader-title')?.textContent?.trim() ||
      $('main h1')?.textContent?.trim() ||
      document.title.replace(/\s*[|–-].*$/, '').trim() ||
      'Your current reading';

    const chapter =
      $('.book-page-chapter')?.textContent?.trim() ||
      $('[data-current-chapter]')?.textContent?.trim() ||
      $('.reader-status')?.textContent?.trim() ||
      'Ready when you are';

    const progress =
      $('#reader-progress')?.value ||
      $('[data-reading-progress]')?.textContent?.trim() ||
      '';

    return { title, chapter, progress };
  }

  function getLegacySelectionPanel() {
    return $('#mark-selection-panel', legacyHost || shell || document);
  }

  function getSelectionText() {
    const panel = getLegacySelectionPanel();
    return panel?.querySelector('.mark-selection-card blockquote')?.textContent?.trim() || '';
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning.';
    if (hour < 18) return 'Good afternoon.';
    return 'Good evening.';
  }

  function premiumMarkup() {
    const context = getBookContext();
    return `
      <div class="askmark-premium" data-askmark-premium>
        <header class="askmark-hero">
          <button class="askmark-close" type="button" data-askmark-close aria-label="Close Ask Mark">×</button>
          <div class="askmark-avatar-wrap" aria-hidden="true">
            <span class="askmark-avatar-glow"></span>
            <img class="askmark-avatar" src="/assets/ask-mark/ask-mark-avatar.png" alt="">
            <span class="askmark-presence"></span>
          </div>
          <div class="askmark-brand-copy">
            <span class="askmark-eyebrow">Your reading companion</span>
            <h2>Ask Mark</h2>
          </div>
          <div class="askmark-header-actions">
            <button type="button" data-askmark-view="notebook" aria-label="Open notebook" title="Notebook">✎</button>
            <button type="button" data-askmark-view="tools" aria-label="Open reader settings" title="Reader settings">⚙</button>
          </div>
        </header>

        <main class="askmark-stage">
          <section class="askmark-view is-active" data-askmark-view-panel="chat">
            <article class="askmark-now-reading">
              <div class="askmark-book-mark" aria-hidden="true">▤</div>
              <div>
                <span>Now reading</span>
                <strong data-askmark-title>${escapeHtml(context.title)}</strong>
                <small data-askmark-chapter>${escapeHtml(context.chapter)}</small>
              </div>
              <button type="button" data-askmark-refresh title="Refresh reading context">↻</button>
            </article>

            <div class="askmark-conversation" data-askmark-conversation aria-live="polite">
              <article class="askmark-message mark-message">
                <img src="/assets/ask-mark/ask-mark-avatar.png" alt="Mark">
                <div>
                  <span>Mark</span>
                  <p><strong>${greeting()}</strong> Highlight a passage or ask me about the book. I can explain ideas, summarize, compare viewpoints, quiz you, or save an insight.</p>
                </div>
              </article>
            </div>

            <section class="askmark-selection-card" data-askmark-selection hidden>
              <div><span>Selected passage</span><button type="button" data-clear-selection aria-label="Dismiss selected passage">×</button></div>
              <blockquote data-askmark-selection-text></blockquote>
            </section>

            <div class="askmark-actions" aria-label="Quick actions">
              ${QUICK_ACTIONS.map(([action, icon, label]) => `<button type="button" data-premium-mark-action="${action}"><span>${icon}</span>${label}</button>`).join('')}
            </div>
          </section>

          <section class="askmark-view" data-askmark-view-panel="notebook">
            <div class="askmark-subhead"><button type="button" data-askmark-back>←</button><div><span>Your saved thinking</span><h3>Mark’s Notebook</h3></div></div>
            <div class="askmark-legacy-slot" data-notebook-slot></div>
          </section>

          <section class="askmark-view" data-askmark-view-panel="tools">
            <div class="askmark-subhead"><button type="button" data-askmark-back>←</button><div><span>Reading preferences</span><h3>Reader Settings</h3></div></div>
            <div class="askmark-legacy-slot" data-tools-slot></div>
          </section>
        </main>

        <footer class="askmark-composer">
          <button type="button" class="askmark-plus" data-askmark-more aria-label="More actions">＋</button>
          <label>
            <span class="sr-only">Ask Mark anything</span>
            <textarea data-askmark-input rows="1" placeholder="Ask Mark anything about what you’re reading…"></textarea>
          </label>
          <button type="button" class="askmark-send" data-askmark-send aria-label="Send to Ask Mark">➜</button>
          <div class="askmark-more-menu" data-askmark-more-menu hidden>
            <button type="button" data-premium-mark-action="translate">Translate passage</button>
            <button type="button" data-premium-mark-action="save">Save passage</button>
            <button type="button" data-document-action="summary">Summarize document</button>
            <button type="button" data-document-action="readable">Make document readable</button>
          </div>
        </footer>
      </div>`;
  }

  function addUserMessage(text) {
    const conversation = $('[data-askmark-conversation]', shell);
    if (!conversation || !text) return;
    conversation.insertAdjacentHTML('beforeend', `
      <article class="askmark-message user-message"><div><span>You</span><p>${escapeHtml(text)}</p></div></article>`);
    conversation.scrollTop = conversation.scrollHeight;
  }

  function addThinkingMessage() {
    const conversation = $('[data-askmark-conversation]', shell);
    if (!conversation) return null;
    const id = `askmark-thinking-${Date.now()}`;
    conversation.insertAdjacentHTML('beforeend', `
      <article class="askmark-message mark-message is-thinking" id="${id}">
        <img src="/assets/ask-mark/ask-mark-avatar.png" alt="Mark">
        <div><span>Mark</span><p><i></i><i></i><i></i></p></div>
      </article>`);
    conversation.scrollTop = conversation.scrollHeight;
    return document.getElementById(id);
  }

  function syncLegacyResponse() {
    const response = getLegacySelectionPanel()?.querySelector('#mark-response');
    if (!response || response.hidden || !response.textContent.trim()) return;
    const thinking = $('.askmark-message.is-thinking', shell);
    const body = response.cloneNode(true);
    body.querySelectorAll('button').forEach((button) => button.classList.add('askmark-inline-action'));
    const markup = `<article class="askmark-message mark-message">
      <img src="/assets/ask-mark/ask-mark-avatar.png" alt="Mark">
      <div><span>Mark</span><div class="askmark-rich-response">${body.innerHTML}</div></div>
    </article>`;
    if (thinking) thinking.outerHTML = markup;
    else $('[data-askmark-conversation]', shell)?.insertAdjacentHTML('beforeend', markup);
    response.hidden = true;
    const conversation = $('[data-askmark-conversation]', shell);
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }

  function syncSelection() {
    if (!shell) return;
    const text = getSelectionText();
    const card = $('[data-askmark-selection]', shell);
    const output = $('[data-askmark-selection-text]', shell);
    if (!card || !output) return;
    card.hidden = !text;
    output.textContent = text.length > 420 ? `${text.slice(0, 420)}…` : text;
  }

  function syncContext() {
    if (!shell) return;
    const context = getBookContext();
    const title = $('[data-askmark-title]', shell);
    const chapter = $('[data-askmark-chapter]', shell);
    if (title) title.textContent = context.title;
    if (chapter) chapter.textContent = context.chapter;
  }

  function activatePremiumView(view = 'chat') {
    $$('[data-askmark-view-panel]', shell).forEach((panel) => panel.classList.toggle('is-active', panel.dataset.askmarkViewPanel === view));
    shell.classList.toggle('askmark-secondary-open', view !== 'chat');

    if (view === 'notebook') {
      const legacyNotebook = $('#mark-notebook-panel', legacyHost);
      legacyHost?.querySelector('[data-mark-tab="notebook"]')?.click();
      if (legacyNotebook) $('[data-notebook-slot]', shell)?.appendChild(legacyNotebook);
    }
    if (view === 'tools') {
      const legacyTools = $('#mark-tools-panel', legacyHost);
      legacyHost?.querySelector('[data-mark-tab="tools"]')?.click();
      if (legacyTools) $('[data-tools-slot]', shell)?.appendChild(legacyTools);
    }
  }

  function runSelectionAction(action, question = '') {
    const panel = getLegacySelectionPanel();
    const text = getSelectionText();
    if (!text) {
      addUserMessage(question || `${action[0].toUpperCase()}${action.slice(1)} this passage.`);
      const thinking = addThinkingMessage();
      if (thinking) thinking.querySelector('p').textContent = 'Highlight a passage first, then choose an action or ask a question about it.';
      return;
    }

    addUserMessage(question || `${action[0].toUpperCase()}${action.slice(1)} this passage.`);
    addThinkingMessage();

    if (action === 'ask') {
      const input = panel?.querySelector('#mark-question');
      const form = panel?.querySelector('#mark-question-form');
      if (input && form) {
        input.value = question;
        form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    } else {
      panel?.querySelector(`[data-mark-action="${action}"]`)?.click();
    }
    setTimeout(syncLegacyResponse, 300);
  }

  async function runDocumentAction(action) {
    const api = transformApi();
    if (!api?.hasActiveDocument?.()) {
      addUserMessage(action === 'summary' ? 'Summarize this document.' : 'Make this document easier to read.');
      const thinking = addThinkingMessage();
      if (thinking) thinking.querySelector('p').textContent = 'Open an imported document first to use whole-document actions.';
      return;
    }
    addUserMessage(action === 'summary' ? 'Summarize this document.' : 'Make this document easier to read.');
    const thinking = addThinkingMessage();
    try {
      if (action === 'summary') await api.requestSummary('quick');
      else await api.makeReadable();
      if (thinking) thinking.querySelector('p').textContent = action === 'summary' ? 'I created a concise summary view for the document.' : 'I created a cleaner, more readable version of the document.';
      syncContext();
    } catch (error) {
      if (thinking) thinking.querySelector('p').textContent = error?.message || 'I could not complete that request.';
    }
  }

  function bindPremiumEvents() {
    $('[data-askmark-close]', shell)?.addEventListener('click', () => $('#toggle-mark-panel')?.click());
    $('[data-askmark-refresh]', shell)?.addEventListener('click', syncContext);
    $$('[data-askmark-view]', shell).forEach((button) => button.addEventListener('click', () => activatePremiumView(button.dataset.askmarkView)));
    $$('[data-askmark-back]', shell).forEach((button) => button.addEventListener('click', () => activatePremiumView('chat')));

    $$('[data-premium-mark-action]', shell).forEach((button) => button.addEventListener('click', () => {
      $('[data-askmark-more-menu]', shell).hidden = true;
      runSelectionAction(button.dataset.premiumMarkAction);
    }));
    $$('[data-document-action]', shell).forEach((button) => button.addEventListener('click', () => {
      $('[data-askmark-more-menu]', shell).hidden = true;
      runDocumentAction(button.dataset.documentAction);
    }));

    const input = $('[data-askmark-input]', shell);
    const send = () => {
      const value = input?.value.trim();
      if (!value) return;
      input.value = '';
      input.style.height = '';
      runSelectionAction('ask', value);
    };
    $('[data-askmark-send]', shell)?.addEventListener('click', send);
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send();
      }
    });
    input?.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
    });

    $('[data-askmark-more]', shell)?.addEventListener('click', () => {
      const menu = $('[data-askmark-more-menu]', shell);
      menu.hidden = !menu.hidden;
    });
    $('[data-clear-selection]', shell)?.addEventListener('click', () => {
      $('[data-askmark-selection]', shell).hidden = true;
    });
  }

  function configureTopToolbar() {
    const controls = $('.reader-pane-controls');
    if (!controls) return false;
    controls.classList.add('ask-mark-toolbar');
    const contents = $('#toggle-navigation-pane', controls);
    const readerTools = $('#toggle-word-panel', controls);
    const ask = $('#toggle-mark-panel', controls);
    if (contents) contents.innerHTML = '<span aria-hidden="true">☰</span> Contents';
    if (readerTools) {
      readerTools.hidden = false;
      readerTools.innerHTML = '<span aria-hidden="true">⚙</span> Reader';
    }
    if (ask) {
      ask.hidden = false;
      ask.innerHTML = '<img src="/assets/ask-mark/ask-mark-avatar.png" alt=""> <span>Ask Mark</span>';
      ask.classList.add('ask-mark-primary-toggle');
    }
    $('#read-anything-format-control')?.remove();
    return Boolean(ask);
  }

  function configureShell() {
    const candidate = $('.reader-control-shell.mark-shell');
    if (!candidate) return false;
    if (candidate.dataset.premiumConfigured === '1') {
      shell = candidate;
      syncSelection();
      return true;
    }

    shell = candidate;
    shell.dataset.premiumConfigured = '1';
    legacyHost = document.createElement('div');
    legacyHost.className = 'askmark-legacy-host';
    legacyHost.hidden = true;
    while (shell.firstChild) legacyHost.appendChild(shell.firstChild);
    shell.appendChild(legacyHost);
    shell.insertAdjacentHTML('beforeend', premiumMarkup());
    bindPremiumEvents();

    const legacySelection = getLegacySelectionPanel();
    if (legacySelection) {
      selectionObserver?.disconnect();
      selectionObserver = new MutationObserver(() => {
        syncSelection();
        syncLegacyResponse();
      });
      selectionObserver.observe(legacySelection, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    }

    syncSelection();
    syncContext();
    return true;
  }

  function install() {
    const toolbarReady = configureTopToolbar();
    const shellReady = configureShell();
    return toolbarReady && shellReady;
  }

  function retryInstall() {
    installAttempts += 1;
    if (!install() && installAttempts < 180) requestAnimationFrame(retryInstall);
  }

  document.addEventListener('marksetgo:document-available', () => {
    installAttempts = 0;
    requestAnimationFrame(retryInstall);
  });
  document.addEventListener('selectionchange', () => setTimeout(syncSelection, 60));
  document.addEventListener('marksetgo:transform-state', syncContext);

  requestAnimationFrame(retryInstall);
  [400, 900, 1800, 3200].forEach((delay) => setTimeout(install, delay));
})();
