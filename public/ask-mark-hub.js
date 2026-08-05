(() => {
  'use strict';
  const app = document.getElementById('app');
  if (!app) return;

  const AVATAR = '/assets/ask-mark-avatar.png';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const api = () => window.MarkSetGoReadAnything;
  let configuredShell = null;
  let installFrames = 0;

  const quickActions = [
    ['explain', '✦', 'Explain', 'Explain the main ideas in clear language, using the current text as context.'],
    ['summarize', '≡', 'Summarize', 'Give me a concise summary of the current text with the most important ideas.'],
    ['quiz', '✓', 'Quiz me', 'Create a short comprehension quiz from the current text. Ask one question at a time.'],
    ['vocabulary', 'Aa', 'Vocabulary', 'Identify important vocabulary in the current text and define each term in context.'],
    ['compare', '⇄', 'Compare', 'Compare the central ideas in this text with another relevant thinker, book, or argument.'],
    ['notebook', '▱', 'Notebook', 'Open my Ask Mark notebook for this book.']
  ];

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function greeting() {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  }

  function currentBookTitle() {
    const selectors = ['#reader-title', '.reader-title', '[data-current-book-title]', '.book-title', '.source-title h1', '.reader-heading h1'];
    for (const selector of selectors) {
      const text = $(selector)?.textContent?.trim();
      if (text && text.length < 140) return text;
    }
    return 'Your current reading';
  }

  function currentProgress() {
    const selectors = ['#reader-progress-text', '.reader-progress-label', '[data-reading-progress]', '#reader-status'];
    for (const selector of selectors) {
      const text = $(selector)?.textContent?.trim();
      if (text && /\d/.test(text)) return text;
    }
    return 'Ready when you are';
  }

  function selectionText() {
    const selected = window.getSelection?.()?.toString()?.trim();
    return selected && selected.length > 2 ? selected : '';
  }

  function statusNode(shell) {
    return $('#ask-mark-premium-status', shell);
  }

  function setStatus(shell, message = '', isError = false) {
    const node = statusNode(shell);
    if (!node) return;
    node.hidden = !message;
    node.textContent = message;
    node.classList.toggle('error', isError);
  }

  function heroMarkup() {
    return `<section class="ask-mark-hero" aria-label="Ask Mark welcome">
      <div class="ask-mark-avatar-wrap" aria-hidden="true">
        <span class="ask-mark-avatar-glow"></span>
        <img class="ask-mark-avatar" src="${AVATAR}" alt="" />
        <span class="ask-mark-presence-dot"></span>
      </div>
      <div class="ask-mark-hero-copy">
        <span class="ask-mark-kicker">Your reading companion</span>
        <h2>Ask Mark</h2>
        <p>${greeting()}. What would you like to understand?</p>
      </div>
    </section>`;
  }

  function contextMarkup() {
    return `<section class="ask-mark-context-card">
      <div class="ask-mark-context-icon" aria-hidden="true">▤</div>
      <div class="ask-mark-context-copy">
        <span>Now reading</span>
        <strong data-ask-mark-book>${escapeHtml(currentBookTitle())}</strong>
        <small data-ask-mark-progress>${escapeHtml(currentProgress())}</small>
      </div>
      <span class="ask-mark-context-spark" aria-hidden="true">✦</span>
    </section>`;
  }

  function quickActionsMarkup() {
    return `<section class="ask-mark-quick-section">
      <div class="ask-mark-section-heading"><span>Quick help</span><small>One tap to get started</small></div>
      <div class="ask-mark-quick-grid">
        ${quickActions.map(([key, icon, label, prompt]) => `<button type="button" class="ask-mark-quick-card" data-ask-quick="${key}" data-ask-prompt="${encodeURIComponent(prompt)}"><span aria-hidden="true">${icon}</span><strong>${label}</strong></button>`).join('')}
      </div>
    </section>`;
  }

  function composerMarkup() {
    return `<section class="ask-mark-composer-card">
      <div class="ask-mark-selection-preview" data-ask-selection hidden>
        <span>Selected passage</span><button type="button" data-clear-selection aria-label="Clear selected passage">×</button>
        <blockquote data-ask-selection-text></blockquote>
      </div>
      <label class="sr-only" for="ask-mark-premium-input">Ask Mark anything</label>
      <textarea id="ask-mark-premium-input" rows="3" maxlength="3000" placeholder="Ask Mark anything about what you're reading…"></textarea>
      <div class="ask-mark-composer-footer">
        <div class="ask-mark-composer-tools">
          <button type="button" class="ask-mark-round-button" data-ask-plus aria-label="More Ask Mark actions">＋</button>
          <button type="button" class="ask-mark-round-button" data-ask-selection-button title="Use selected passage" aria-label="Use selected passage">“ ”</button>
        </div>
        <button type="button" class="ask-mark-send" id="ask-mark-premium-send"><span>Ask Mark</span><b aria-hidden="true">➜</b></button>
      </div>
      <div id="ask-mark-premium-status" class="ask-mark-premium-status" hidden></div>
    </section>`;
  }

  function premiumHomeMarkup() {
    return `<div class="ask-mark-premium-home">${heroMarkup()}${composerMarkup()}</div>`;
  }

  function studyMarkup() {
    const cards = [
      ['Study guide', 'Create a concise study guide with headings, key ideas, and review questions.', '▤'],
      ['Flash cards', 'Create concise question-and-answer flash cards from the most important material.', '▱'],
      ['Historical context', 'Explain the historical context needed to understand this text.', '⌛'],
      ['Key ideas', 'Identify the central ideas, arguments, assumptions, and conclusions.', '✦'],
      ['Feynman explanation', 'Explain this using the Feynman method in clear, concrete language.', '◎'],
      ['Memory tools', 'Create practical mnemonics and a simple memory-palace walkthrough.', '◇']
    ];
    return `<section class="ask-mark-study-premium"><div class="ask-mark-section-heading"><span>Study with Mark</span><small>Turn reading into learning</small></div><div class="ask-mark-study-grid">${cards.map(([label, prompt, icon]) => `<button type="button" data-study-prompt="${encodeURIComponent(prompt)}"><span>${icon}</span><div><strong>${label}</strong><small>Use current reading</small></div></button>`).join('')}</div></section>`;
  }

  async function submitPrompt(shell, prompt) {
    const text = String(prompt || '').trim();
    if (!text) return setStatus(shell, 'Enter a question for Mark.', true);
    const service = api();
    if (!service?.hasActiveDocument?.()) return setStatus(shell, 'Open a book, article, or document first.', true);

    const selected = selectionText();
    const instruction = selected ? `${text}\n\nSelected passage:\n${selected}` : text;
    setStatus(shell, 'Mark is reading and thinking…');
    shell.classList.add('ask-mark-is-thinking');
    try {
      await service.requestCustomTransform(instruction);
      setStatus(shell, 'Done — Mark created a new reading view.');
      setTimeout(() => setStatus(shell, ''), 2200);
      document.dispatchEvent(new CustomEvent('marksetgo:ask-mark-request', { detail: { prompt: text, selectedText: selected } }));
    } catch (error) {
      setStatus(shell, error?.message || 'Mark could not complete that request.', true);
    } finally {
      shell.classList.remove('ask-mark-is-thinking');
    }
  }

  function updateSelectionPreview(shell) {
    const selected = selectionText();
    const wrap = $('[data-ask-selection]', shell);
    const text = $('[data-ask-selection-text]', shell);
    if (!wrap || !text) return;
    wrap.hidden = !selected;
    text.textContent = selected ? `${selected.slice(0, 260)}${selected.length > 260 ? '…' : ''}` : '';
  }

  function bindPremiumHome(shell) {
    $$('.ask-mark-quick-card', shell).forEach((button) => {
      if (button.dataset.bound) return;
      button.dataset.bound = '1';
      button.addEventListener('click', () => {
        if (button.dataset.askQuick === 'notebook') return shell.querySelector('[data-mark-tab="notebook"]')?.click();
        const input = $('#ask-mark-premium-input', shell);
        if (input) {
          input.value = decodeURIComponent(button.dataset.askPrompt || '');
          input.focus();
        }
      });
    });

    const send = $('#ask-mark-premium-send', shell);
    const input = $('#ask-mark-premium-input', shell);
    if (send && !send.dataset.bound) {
      send.dataset.bound = '1';
      send.addEventListener('click', () => submitPrompt(shell, input?.value));
    }
    if (input && !input.dataset.bound) {
      input.dataset.bound = '1';
      input.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          submitPrompt(shell, input.value);
        }
      });
    }

    $('[data-ask-selection-button]', shell)?.addEventListener('click', () => updateSelectionPreview(shell), { once: false });
    $('[data-clear-selection]', shell)?.addEventListener('click', () => {
      window.getSelection?.()?.removeAllRanges?.();
      updateSelectionPreview(shell);
    });
    $('[data-ask-plus]', shell)?.addEventListener('click', () => shell.querySelector('[data-mark-tab="study"]')?.click());

    $$('#mark-study-panel [data-study-prompt]', shell).forEach((button) => {
      if (button.dataset.bound) return;
      button.dataset.bound = '1';
      button.addEventListener('click', () => {
        shell.querySelector('[data-mark-tab="home"]')?.click();
        requestAnimationFrame(() => {
          const homeInput = $('#ask-mark-premium-input', shell);
          if (homeInput) {
            homeInput.value = decodeURIComponent(button.dataset.studyPrompt || '');
            homeInput.focus();
          }
        });
      });
    });
  }

  function activate(shell, tab) {
    $$('[data-mark-tab]', shell).forEach((button) => button.classList.toggle('active', button.dataset.markTab === tab));
    $$('[data-mark-panel]', shell).forEach((panel) => { panel.hidden = panel.dataset.markPanel !== tab; });
    if (tab === 'notebook') shell.querySelector('[data-mark-tab="notebook"]')?.dispatchEvent(new CustomEvent('marksetgo:notebook-active'));
  }

  function configureShell() {
    const shell = $('.reader-control-shell.mark-shell');
    if (!shell || shell === configuredShell) return false;
    configuredShell = shell;
    shell.classList.add('ask-mark-premium-shell');

    const header = $('.reader-control-header', shell);
    if (header) {
      header.innerHTML = `<div class="ask-mark-mini-brand"><img src="${AVATAR}" alt=""><div><span>Reading companion</span><strong>Ask Mark</strong></div></div><button id="close-reader-controls" class="reader-panel-close" type="button" aria-label="Close Ask Mark">×</button>`;
      header.querySelector('#close-reader-controls')?.addEventListener('click', () => document.getElementById('toggle-mark-panel')?.click());
    }

    const nav = $('.mark-tabs', shell);
    if (!nav) return false;
    const originalTabs = Array.from(nav.querySelectorAll('[data-mark-tab]'));
    const notebookOriginal = originalTabs.find((button) => button.dataset.markTab === 'notebook');
    nav.innerHTML = `
      <button type="button" data-mark-tab="home" class="active"><span>✦</span> Chat</button>
      <button type="button" data-mark-tab="study"><span>◎</span> Study</button>
      <button type="button" data-mark-tab="notebook"><span>▱</span> Notebook</button>`;

    const allPanels = Array.from(shell.querySelectorAll('[data-mark-panel]'));
    const notebookPanel = allPanels.find((panel) => panel.dataset.markPanel === 'notebook') || $('#mark-notebook-panel', shell);
    allPanels.forEach((panel) => { if (panel !== notebookPanel) panel.remove(); });

    const home = document.createElement('div');
    home.id = 'mark-premium-home-panel';
    home.dataset.markPanel = 'home';
    home.className = 'mark-panel-view ask-mark-premium-panel';
    home.innerHTML = premiumHomeMarkup();

    const study = document.createElement('div');
    study.id = 'mark-study-panel';
    study.dataset.markPanel = 'study';
    study.className = 'mark-panel-view ask-mark-premium-panel';
    study.hidden = true;
    study.innerHTML = studyMarkup();

    nav.insertAdjacentElement('afterend', home);
    home.insertAdjacentElement('afterend', study);
    if (notebookPanel) {
      notebookPanel.dataset.markPanel = 'notebook';
      notebookPanel.hidden = true;
      notebookPanel.classList.add('ask-mark-premium-panel', 'ask-mark-notebook-panel');
    }

    // Keep the app's existing notebook activation behavior by forwarding the new tab click.
    nav.querySelector('[data-mark-tab="notebook"]')?.addEventListener('click', () => notebookOriginal?.click());
    $$('[data-mark-tab]', nav).forEach((button) => button.addEventListener('click', () => activate(shell, button.dataset.markTab)));

    bindPremiumHome(shell);
    activate(shell, 'home');
    updateSelectionPreview(shell);
    return true;
  }

  function configureTopToolbar() {
    const controls = $('.reader-pane-controls');
    if (!controls) return false;
    controls.classList.add('ask-mark-toolbar');
    const contents = $('#toggle-navigation-pane', controls);
    const readerTools = $('#toggle-word-panel', controls);
    const ask = $('#toggle-mark-panel', controls);
    if (contents) contents.innerHTML = '<span aria-hidden="true">☰</span> Contents';
    if (readerTools) readerTools.hidden = true;
    if (ask) {
      ask.hidden = false;
      ask.innerHTML = `<img class="ask-mark-toolbar-avatar" src="${AVATAR}" alt=""><span>Ask Mark</span>`;
      ask.classList.add('ask-mark-primary-toggle');
    }
    $('#read-anything-format-control')?.remove();
    return Boolean(contents && ask);
  }

  function refreshContext() {
    if (!configuredShell) return;
    const title = $('[data-ask-mark-book]', configuredShell);
    const progress = $('[data-ask-mark-progress]', configuredShell);
    if (title) title.textContent = currentBookTitle();
    if (progress) progress.textContent = currentProgress();
    updateSelectionPreview(configuredShell);
  }

  function install() {
    const toolbarReady = configureTopToolbar();
    const shellReady = configureShell();
    refreshContext();
    return toolbarReady && shellReady;
  }

  document.addEventListener('selectionchange', () => {
    if (configuredShell && !configuredShell.hidden) updateSelectionPreview(configuredShell);
  });
  document.addEventListener('marksetgo:document-available', () => {
    configuredShell = null;
    installFrames = 0;
    requestAnimationFrame(retryInstall);
  });
  document.addEventListener('marksetgo:transform-state', refreshContext);
  document.addEventListener('marksetgo:notebook-updated', () => {
    if (!configuredShell) return;
    const notebookTab = configuredShell.querySelector('[data-mark-tab="notebook"]');
    if (notebookTab?.classList.contains('active')) notebookTab.click();
  });

  function retryInstall() {
    install();
    installFrames += 1;
    if (installFrames < 120 && (!configuredShell || !$('.ask-mark-toolbar'))) requestAnimationFrame(retryInstall);
  }

  requestAnimationFrame(retryInstall);
  [300, 800, 1600, 3000].forEach((delay) => setTimeout(install, delay));
})();
