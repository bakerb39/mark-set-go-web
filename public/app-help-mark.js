(() => {
  'use strict';

  const app = document.getElementById('app');
  if (!app) return;
  const knowledge = window.MarkSetGoPageHelpKnowledge || { global: {}, pages: {} };
  const pages = knowledge.pages || {};
  const MARK_AVATAR = '/assets/ask-mark-avatar.png';

  const ALIASES = {
    'customize my experience':'profile-preferences', 'my library':'my-library', 'my reading':'my-reading',
    'drm-free books':'drm-free', 'drm free books':'drm-free', 'read anything':'read-anything',
    'my notebook':'mark-notebook', "mark's notebook":'mark-notebook', 'reading notes':'library-notes',
    'random notes':'random-notes', 'vocabulary builder':'vocabulary-builder', 'definitions':'vocabulary-builder',
    'progress & awards':'progress-awards', 'progress and awards':'progress-awards', 'reading goals':'reading-goals',
    'action center':'action-center', 'reading skills':'reading-skills', 'comprehension':'comprehension-library',
    'mnemonics':'mnemonics', 'language learning':'language-learning', 'courses & learning modules':'learning-courses',
    'courses and learning modules':'learning-courses', 'great ideas':'syntopicon', 'syntopicon':'syntopicon',
    'bible study':'bible-study', 'great books':'great-books', 'music & focus':'music', 'music and focus':'music',
    'my links':'my-links', 'help':'help', 'about':'about', 'contact & support':'contact', 'privacy':'privacy', 'terms':'terms'
  };

  function normalized(value='') { return String(value).replace(/\s+/g, ' ').trim().toLowerCase(); }

  function inferKey() {
    const explicit = normalized(app.dataset.viewKey);
    if (explicit && pages[explicit]) return explicit;

    const section = app.firstElementChild;
    const classes = normalized(section?.className || '');
    const heading = normalized(app.querySelector('h1')?.textContent || '');
    if (ALIASES[heading]) return ALIASES[heading];

    const classTests = [
      ['profile-preferences-page','profile-preferences'], ['reading-skills-page','reading-skills'],
      ['learning-tool-page', heading.includes('mnemonic') ? 'mnemonics' : heading.includes('language') ? 'language-learning' : heading.includes('course') ? 'learning-courses' : 'reading-skills'],
      ['global-notebook-page','mark-notebook'], ['drm-free','drm-free'], ['browse','browse'], ['library','my-library']
    ];
    for (const [needle,key] of classTests) if (classes.includes(needle) && pages[key]) return key;

    const whole = normalized(`${heading} ${section?.querySelector('.source-category')?.textContent || ''}`);
    for (const [label,key] of Object.entries(ALIASES)) if (whole.includes(label) && pages[key]) return key;
    return explicit || 'default';
  }

  function pageContext() {
    const key = inferKey();
    const pageHelp = pages[key] || pages.default || {};
    const heading = app.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return { key, title: heading || pageHelp.title || 'Current page', pageHelp, globalHelp: knowledge.global || {} };
  }

  function isReaderPage() {
    return normalized(app.dataset.viewKey) === 'reader' || !!app.querySelector('#reader-frame, #reader');
  }

  function escapeHtml(value='') {
    return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  const host = document.createElement('div');
  host.className = 'app-help-mark-host';
  host.innerHTML = `
    <button type="button" class="app-help-mark-button" data-app-help-open aria-haspopup="dialog" aria-expanded="false">
      <img src="${MARK_AVATAR}" alt="" aria-hidden="true"><span>Ask Mark</span>
    </button>
    <aside class="app-help-mark-panel" data-app-help-panel hidden role="dialog" aria-modal="false" aria-label="Ask Mark app help">
      <header>
        <div class="app-help-mark-identity"><img src="${MARK_AVATAR}" alt="Mark"><div><small>App help</small><strong>Ask Mark</strong></div></div>
        <button type="button" data-app-help-close aria-label="Close">×</button>
      </header>
      <div class="app-help-mark-page" data-app-help-page></div>
      <div class="app-help-mark-conversation" data-app-help-conversation aria-live="polite"></div>
      <form data-app-help-form>
        <label for="app-help-mark-question">Ask how to use this page</label>
        <div><textarea id="app-help-mark-question" data-app-help-input rows="2" maxlength="800" placeholder="What can I do on this page?"></textarea><button type="submit">Ask</button></div>
      </form>
    </aside>`;
  document.body.appendChild(host);

  const openButton = host.querySelector('[data-app-help-open]');
  const panel = host.querySelector('[data-app-help-panel]');
  const pageNode = host.querySelector('[data-app-help-page]');
  const conversation = host.querySelector('[data-app-help-conversation]');
  const form = host.querySelector('[data-app-help-form]');
  const input = host.querySelector('[data-app-help-input]');
  let activePageKey = '';

  function syncVisibility() {
    const reader = isReaderPage();
    host.hidden = reader;
    if (reader) closePanel();
  }

  function syncPageLabel() {
    const ctx = pageContext();
    pageNode.textContent = `Help for: ${ctx.title}`;
    if (activePageKey && activePageKey !== ctx.key) conversation.innerHTML = '';
    activePageKey = ctx.key;
  }

  function openPanel() {
    syncPageLabel();
    panel.hidden = false;
    openButton.setAttribute('aria-expanded', 'true');
    if (!conversation.children.length) {
      const ctx = pageContext();
      conversation.innerHTML = `<div class="app-help-mark-message mark"><div class="app-help-mark-message-author"><img src="${MARK_AVATAR}" alt=""><strong>Mark</strong></div><p>I can help you use <b>${escapeHtml(ctx.title)}</b>. Ask me what something does, how to complete a task here, or where to go next.</p></div>`;
    }
    input.focus();
  }

  function closePanel() {
    panel.hidden = true;
    openButton.setAttribute('aria-expanded', 'false');
  }

  function appendMessage(who, text) {
    const div = document.createElement('div');
    div.className = `app-help-mark-message ${who === 'You' ? 'user' : 'mark'}`;
    const author = who === 'Mark'
      ? `<div class="app-help-mark-message-author"><img src="${MARK_AVATAR}" alt=""><strong>Mark</strong></div>`
      : `<strong>${escapeHtml(who)}</strong>`;
    div.innerHTML = `${author}<p>${escapeHtml(text)}</p>`;
    conversation.appendChild(div);
    conversation.scrollTop = conversation.scrollHeight;
    return div;
  }

  async function ask(question) {
    const ctx = pageContext();
    appendMessage('You', question);
    const pending = appendMessage('Mark', 'Checking the help for this page…');
    try {
      const response = await fetch('/api/app-help', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ pageKey: ctx.key, pageTitle: ctx.title, pageHelp: ctx.pageHelp, globalHelp: ctx.globalHelp, question })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'I could not answer that help question.');
      pending.querySelector('p').textContent = payload.answer || 'I could not find guidance for that question.';
    } catch (error) {
      pending.querySelector('p').textContent = error.message || 'I could not answer that help question.';
    }
    conversation.scrollTop = conversation.scrollHeight;
  }

  openButton.addEventListener('click', openPanel);
  host.querySelector('[data-app-help-close]').addEventListener('click', closePanel);
  form.addEventListener('submit', (event) => {
    event.preventDefault(); const question = input.value.trim(); if (!question) return; input.value = ''; ask(question);
  });

  document.addEventListener('click', () => requestAnimationFrame(() => { syncVisibility(); if (!panel.hidden) syncPageLabel(); }), { capture: true, passive: true });
  window.addEventListener('popstate', () => requestAnimationFrame(syncVisibility));
  window.addEventListener('hashchange', () => requestAnimationFrame(syncVisibility));
  syncVisibility();
})();
