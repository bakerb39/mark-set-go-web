(() => {
  'use strict';
  const app = document.getElementById('app');
  if (!app) return;

  const studyPrompts = [
    ['Study Guide', 'Create a concise study guide with headings, key ideas, and review questions.'],
    ['Outline', 'Create a hierarchical outline of the document with the main claim and supporting points.'],
    ['Cornell Notes', 'Convert this document into Cornell Notes with cues, notes, and a short summary.'],
    ['Flash Cards', 'Create concise question-and-answer flash cards from the most important material.'],
    ['Quiz', 'Create a short comprehension quiz with answers based only on the document.'],
    ['Vocabulary', 'Identify important vocabulary, define each term in context, and give a short example.'],
    ['Timeline', 'Create a chronological timeline of the important events, dates, and developments.'],
    ['Historical Context', 'Explain the historical context needed to understand this document.'],
    ['Key People', 'Identify the key people, their roles, and why they matter.'],
    ['Key Ideas', 'Identify the central ideas, arguments, assumptions, and conclusions.'],
    ['Feynman Explanation', 'Explain the document using the Feynman method in clear, concrete language.'],
    ['Mnemonics', 'Create practical mnemonics for remembering the central ideas.'],
    ['Memory Palace', 'Create a simple memory-palace walkthrough for the central ideas.']
  ];

  let configuredShell = null;
  let activeHubTab = 'read';
  let installFrames = 0;

  const api = () => window.MarkSetGoReadAnything;
  const $ = (selector, root = document) => root.querySelector(selector);

  function status(message = '', error = false) {
    const node = $('#ask-mark-read-status');
    if (!node) return;
    node.textContent = message;
    node.hidden = !message;
    node.classList.toggle('error', error);
  }

  async function run(label, task) {
    status(`${label}…`);
    try {
      await task();
      status('');
      refreshCurrentView();
    } catch (error) {
      status(error?.message || `${label} failed.`, true);
    }
  }

  function refreshCurrentView() {
    const current = api()?.getActiveVersion?.();
    const label = current?.label || 'Original';
    document.querySelectorAll('[data-current-document-view]').forEach((node) => { node.textContent = label; });
    document.querySelectorAll('[data-ask-read-action]').forEach((button) => {
      const action = button.dataset.askReadAction;
      const key = current?.key || 'original';
      button.classList.toggle('active',
        (action === 'original' && key === 'original') ||
        (action === 'readable' && key === 'clean') ||
        (action === 'summary' && key.startsWith('summary')) ||
        (action === 'college' && key === 'college') ||
        (action === 'highschool' && key === 'highschool') ||
        (action === 'gradeschool' && ['grade4','grade6','grade8'].includes(key)) ||
        (action === 'translate' && key.startsWith('translation_'))
      );
    });
  }

  function readPanelMarkup() {
    return `<section class="ask-mark-read-workspace">
      <div class="ask-mark-current-view">Currently viewing: <strong data-current-document-view>Original</strong></div>
      <div class="ask-mark-compact-section">
        <span class="ask-mark-section-label">Document</span>
        <div class="ask-mark-choice-row">
          <button type="button" data-ask-read-action="original">Original</button>
          <button type="button" data-ask-read-action="readable">Readable</button>
          <button type="button" data-ask-read-action="summary">Summary</button>
        </div>
      </div>
      <div class="ask-mark-compact-section">
        <span class="ask-mark-section-label">Reading level</span>
        <div class="ask-mark-choice-row">
          <button type="button" data-ask-read-action="college">College</button>
          <button type="button" data-ask-read-action="highschool">High School</button>
          <button type="button" data-ask-read-action="gradeschool">Grade School</button>
        </div>
      </div>
      <div class="ask-mark-compact-section">
        <label class="ask-mark-language-label"><span class="ask-mark-section-label">Translate</span>
          <select id="ask-mark-language">
            <option value="">Choose language</option>
            <option>Spanish</option><option>French</option><option>German</option><option>Italian</option>
            <option>Portuguese</option><option>Chinese</option><option>Japanese</option><option>Korean</option>
            <option>Arabic</option><option>Hindi</option><option>Russian</option><option>Greek</option><option>Latin</option>
          </select>
        </label>
        <button type="button" class="primary ask-mark-translate-button" data-ask-read-action="translate">Translate</button>
      </div>
      <div id="ask-mark-read-status" class="status" hidden></div>
      <details class="ask-mark-reader-controls" open>
        <summary>Reader controls</summary>
        <div id="ask-mark-existing-reader-controls"></div>
      </details>
    </section>`;
  }

  function studyPanelMarkup() {
    return `<section class="ask-mark-study-workspace">
      <p class="reader-control-help">Choose a study task. Ask Mark will place the instruction in Chat so you can edit it before applying.</p>
      <div class="ask-mark-study-grid">${studyPrompts.map(([label, prompt]) => `<button type="button" data-study-prompt="${encodeURIComponent(prompt)}">${label}</button>`).join('')}</div>
    </section>`;
  }

  function documentChatMarkup() {
    return `<section class="ask-mark-document-chat">
      <span class="ask-mark-section-label">Work with the whole document</span>
      <div class="ask-mark-prompt-chips">
        <button type="button" data-doc-prompt="Explain the main ideas in clear language.">Explain clearly</button>
        <button type="button" data-doc-prompt="Break this into one idea per paragraph while preserving meaning.">One idea per paragraph</button>
        <button type="button" data-doc-prompt="Create a concise study guide with review questions.">Study guide</button>
        <button type="button" data-doc-prompt="Create memorable mnemonics for the central ideas.">Mnemonics</button>
      </div>
      <label for="ask-mark-document-instruction">Ask Mark</label>
      <textarea id="ask-mark-document-instruction" rows="3" placeholder="Tell Mark how you want to work with this document…"></textarea>
      <button type="button" class="primary" id="ask-mark-apply-document">Apply to document</button>
      <div id="ask-mark-document-status" class="status" hidden></div>
    </section>`;
  }

  function activate(tab) {
    activeHubTab = tab;
    const shell = configuredShell;
    if (!shell) return;
    shell.querySelectorAll('[data-mark-tab]').forEach((button) => button.classList.toggle('active', button.dataset.markTab === tab));
    shell.querySelectorAll('[data-mark-panel]').forEach((panel) => { panel.hidden = panel.dataset.markPanel !== tab; });
    if (tab === 'notebook') {
      // Existing app function renders the notebook when the legacy tab is activated.
      shell.querySelector('[data-mark-tab="notebook"]')?.dispatchEvent(new CustomEvent('marksetgo:notebook-active'));
    }
    if (tab === 'selection') {
      const panel = $('#mark-selection-panel', shell);
      if (panel && !panel.querySelector('.ask-mark-document-chat')) panel.insertAdjacentHTML('afterbegin', documentChatMarkup());
      bindChatControls(shell);
    }
    refreshCurrentView();
  }

  function bindReadControls(shell) {
    shell.querySelectorAll('[data-ask-read-action]').forEach((button) => {
      if (button.dataset.bound) return;
      button.dataset.bound = '1';
      button.addEventListener('click', () => {
        const action = button.dataset.askReadAction;
        const service = api();
        if (!service?.hasActiveDocument?.()) return status('Open an imported article or document to use document views.', true);
        if (action === 'original') return run('Restoring original', () => service.restoreOriginal());
        if (action === 'readable') return run('Creating readable view', () => service.makeReadable());
        if (action === 'summary') return run('Creating summary', () => service.requestSummary('quick'));
        if (action === 'college') return run('Creating college version', () => service.requestReadingLevel('college'));
        if (action === 'highschool') return run('Creating high-school version', () => service.requestReadingLevel('highschool'));
        if (action === 'gradeschool') return run('Creating grade-school version', () => service.requestReadingLevel('grade6'));
        if (action === 'translate') {
          const language = $('#ask-mark-language', shell)?.value || '';
          return run(`Translating to ${language || 'selected language'}`, () => service.requestTranslation(language));
        }
      });
    });
  }

  function bindStudyControls(shell) {
    shell.querySelectorAll('[data-study-prompt]').forEach((button) => {
      if (button.dataset.bound) return;
      button.dataset.bound = '1';
      button.addEventListener('click', () => {
        shell.querySelector('[data-mark-tab="selection"]')?.click();
        const textarea = $('#ask-mark-document-instruction', shell);
        if (textarea) {
          textarea.value = decodeURIComponent(button.dataset.studyPrompt || '');
          textarea.focus();
        }
      });
    });
  }

  function bindChatControls(shell) {
    shell.querySelectorAll('[data-doc-prompt]').forEach((button) => {
      if (button.dataset.bound) return;
      button.dataset.bound = '1';
      button.addEventListener('click', () => {
        const textarea = $('#ask-mark-document-instruction', shell);
        if (textarea) textarea.value = button.dataset.docPrompt || '';
      });
    });
    const apply = $('#ask-mark-apply-document', shell);
    if (apply && !apply.dataset.bound) {
      apply.dataset.bound = '1';
      apply.addEventListener('click', async () => {
        const message = $('#ask-mark-document-instruction', shell)?.value.trim() || '';
        const out = $('#ask-mark-document-status', shell);
        if (!message) { if (out) { out.hidden = false; out.className = 'status error'; out.textContent = 'Enter an instruction.'; } return; }
        if (!api()?.hasActiveDocument?.()) { if (out) { out.hidden = false; out.className = 'status error'; out.textContent = 'Open an imported document first.'; } return; }
        if (out) { out.hidden = false; out.className = 'status'; out.textContent = 'Ask Mark is working…'; }
        try {
          await api().requestCustomTransform(message);
          if (out) out.hidden = true;
          refreshCurrentView();
        } catch (error) {
          if (out) { out.hidden = false; out.className = 'status error'; out.textContent = error?.message || 'The request failed.'; }
        }
      });
    }
  }

  function configureShell() {
    const shell = $('.reader-control-shell.mark-shell');
    if (!shell || shell === configuredShell) return false;
    configuredShell = shell;

    const header = $('.reader-control-header', shell);
    if (header) header.querySelector('div').innerHTML = '<span>Reading companion</span><strong><span aria-hidden="true">📖</span> Ask Mark</strong>';

    const nav = $('.mark-tabs', shell);
    if (!nav) return false;
    nav.setAttribute('aria-label', 'Ask Mark sections');
    const readTab = nav.querySelector('[data-mark-tab="tools"]');
    const chatTab = nav.querySelector('[data-mark-tab="selection"]');
    const notesTab = nav.querySelector('[data-mark-tab="notebook"]');
    const studyTab = nav.querySelector('[data-mark-tab="history"]');
    if (!readTab || !chatTab || !notesTab || !studyTab) return false;
    readTab.textContent = 'Read';
    chatTab.textContent = 'Chat';
    notesTab.textContent = 'Notes';
    studyTab.textContent = 'Study';
    studyTab.dataset.markTab = 'study';
    nav.append(readTab, studyTab, notesTab, chatTab);

    const tools = $('#mark-tools-panel', shell);
    if (tools) {
      const oldContents = Array.from(tools.childNodes);
      tools.innerHTML = readPanelMarkup();
      const destination = $('#ask-mark-existing-reader-controls', tools);
      oldContents.forEach((node) => destination?.appendChild(node));
    }

    let study = $('#mark-study-panel', shell);
    if (!study) {
      study = document.createElement('div');
      study.id = 'mark-study-panel';
      study.dataset.markPanel = 'study';
      study.className = 'mark-panel-view';
      study.hidden = true;
      study.innerHTML = studyPanelMarkup();
      const notebook = $('#mark-notebook-panel', shell);
      shell.insertBefore(study, notebook || null);
    }

    $('#mark-history-panel', shell)?.remove();

    bindReadControls(shell);
    bindStudyControls(shell);
    bindChatControls(shell);
    activate('read');
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
      ask.innerHTML = '<span class="ask-mark-book-icon" aria-hidden="true">📖</span> Ask Mark';
      ask.classList.add('ask-mark-primary-toggle');
    }
    $('#read-anything-format-control')?.remove();
    return Boolean(contents && ask);
  }

  function install() {
    const a = configureTopToolbar();
    const b = configureShell();
    refreshCurrentView();
    return a && b;
  }

  document.addEventListener('marksetgo:document-available', () => {
    installFrames = 0;
    requestAnimationFrame(retryInstall);
  });
  document.addEventListener('marksetgo:transform-state', refreshCurrentView);

  function retryInstall() {
    install();
    installFrames += 1;
    if (installFrames < 120 && (!configuredShell || !$('.ask-mark-toolbar'))) requestAnimationFrame(retryInstall);
  }

  // Bounded initial installation; no permanent document-wide observer.
  requestAnimationFrame(retryInstall);
  [300, 800, 1600, 3000].forEach((delay) => setTimeout(install, delay));
})();
