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

  function composerMarkup() {
    return `<section class="ask-mark-composer-card">
      <label class="sr-only" for="ask-mark-premium-input">Ask Mark anything</label>
      <textarea id="ask-mark-premium-input" rows="4" maxlength="3000" placeholder="Ask Mark anything about what you're reading…"></textarea>
      <div class="ask-mark-composer-footer">
        <div class="ask-mark-composer-tools">
          <button type="button" class="ask-mark-round-button" data-ask-plus aria-label="Open study tools">＋</button>
        </div>
        <button type="button" class="ask-mark-send" id="ask-mark-premium-send"><span>Ask Mark</span><b aria-hidden="true">➜</b></button>
      </div>
      <div id="ask-mark-premium-status" class="ask-mark-premium-status" hidden></div>
    </section>`;
  }

  function premiumHomeMarkup() {
    return `<div class="ask-mark-premium-home">${composerMarkup()}</div>`;
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

  function bindPremiumHome(shell) {
    const send = $('#ask-mark-premium-send', shell);
    const input = $('#ask-mark-premium-input', shell);
    const autoGrow = () => {
      if (!input) return;
      input.style.height = 'auto';
      input.style.height = `${Math.min(Math.max(input.scrollHeight, 108), 260)}px`;
    };
    if (send && !send.dataset.bound) {
      send.dataset.bound = '1';
      send.addEventListener('click', () => submitPrompt(shell, input?.value));
    }
    if (input && !input.dataset.bound) {
      input.dataset.bound = '1';
      input.addEventListener('input', autoGrow);
      input.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          submitPrompt(shell, input.value);
        }
      });
      requestAnimationFrame(autoGrow);
    }
    $('[data-ask-plus]', shell)?.addEventListener('click', () => activate(shell, 'tools'));
    $$('#mark-study-panel [data-study-prompt]', shell).forEach((button) => {
      if (button.dataset.bound) return;
      button.dataset.bound = '1';
      button.addEventListener('click', () => {
        activate(shell, 'home');
        requestAnimationFrame(() => {
          const homeInput = $('#ask-mark-premium-input', shell);
          if (homeInput) {
            homeInput.value = decodeURIComponent(button.dataset.studyPrompt || '');
            homeInput.dispatchEvent(new Event('input'));
            homeInput.focus();
          }
        });
      });
    });
  }

  function activate(shell, tab) {
    $$('[data-mark-tab]', shell).forEach((button) => button.classList.toggle('active', button.dataset.markTab === tab));
    $$('[data-mark-panel]', shell).forEach((panel) => { panel.hidden = panel.dataset.markPanel !== tab; });
    if (tab === 'notebook') shell.querySelector('[data-mark-tab="notebook"]')?.click();
  }

  function configureShell() {
    const shell = $('.reader-control-shell.mark-shell');
    if (!shell || shell === configuredShell) return false;
    configuredShell = shell;
    shell.classList.add('ask-mark-premium-shell');

    const nav = $('.mark-tabs', shell);
    if (!nav) return false;
    nav.classList.add('ask-mark-hidden-tabs');

    const home = document.createElement('div');
    home.id = 'mark-premium-home-panel';
    home.dataset.markPanel = 'home';
    home.className = 'mark-panel-view ask-mark-premium-panel';
    home.innerHTML = premiumHomeMarkup();
    nav.insertAdjacentElement('afterend', home);

    const header = $('.reader-control-header', shell);
    if (header) {
      header.innerHTML = `<button type="button" class="ask-mark-header-home" aria-label="Return to Ask Mark home">
        <img src="${AVATAR}" alt="">
        <span><small>Your reading companion</small><strong>Ask Mark</strong><em>${greeting()}. What would you like to understand?</em></span>
      </button>
      <div class="ask-mark-header-actions">
        <button type="button" class="ask-mark-header-icon" data-open-notebook aria-label="Open notebook" title="Notebook">✎</button>
        <button type="button" class="ask-mark-header-icon" data-open-tools aria-label="Open reader tools" title="Reader tools">⚙</button>
        <button id="close-reader-controls" class="reader-panel-close" type="button" aria-label="Close Ask Mark">×</button>
      </div>`;
      header.querySelector('.ask-mark-header-home')?.addEventListener('click', () => activate(shell, 'home'));
      header.querySelector('[data-open-notebook]')?.addEventListener('click', () => activate(shell, 'notebook'));
      header.querySelector('[data-open-tools]')?.addEventListener('click', () => activate(shell, 'tools'));
      header.querySelector('#close-reader-controls')?.addEventListener('click', () => document.getElementById('toggle-mark-panel')?.click());
    }

    const notebookPanel = $('#mark-notebook-panel', shell);
    if (notebookPanel) notebookPanel.classList.add('ask-mark-premium-panel', 'ask-mark-notebook-panel');
    const selectionPanel = $('#mark-selection-panel', shell);
    if (selectionPanel) selectionPanel.classList.add('ask-mark-premium-panel', 'ask-mark-selection-results-panel');
    const toolsPanel = $('#mark-tools-panel', shell);
    if (toolsPanel) toolsPanel.classList.add('ask-mark-premium-panel');

    bindPremiumHome(shell);
    activate(shell, 'home');
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
  }

  function install() {
    const toolbarReady = configureTopToolbar();
    const shellReady = configureShell();
    refreshContext();
    return toolbarReady && shellReady;
  }

  document.addEventListener('marksetgo:document-available', () => {
    configuredShell = null;
    installFrames = 0;
    requestAnimationFrame(retryInstall);
  });
  document.addEventListener('marksetgo:transform-state', refreshContext);

  function retryInstall() {
    install();
    installFrames += 1;
    if (installFrames < 120 && (!configuredShell || !$('.ask-mark-toolbar'))) requestAnimationFrame(retryInstall);
  }

  requestAnimationFrame(retryInstall);
  [300, 800, 1600, 3000].forEach((delay) => setTimeout(install, delay));
})();
