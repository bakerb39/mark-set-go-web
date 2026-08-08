(() => {
  'use strict';

  const app = document.getElementById('app');
  if (!app) return;

  const PAGE_HELP = {
    home: ['Start or continue reading', 'Open My Library', 'Use Browse or Read Anything', 'Open Help for walkthroughs'],
    'my-library': ['Continue saved books', 'Manage your reading list', 'Open Collections', 'Browse or import a book', 'Open Progress & Awards or Action Center'],
    'my-reading': ['Manage active reading', 'Change reading status', 'Resume a saved edition', 'Import new reading'],
    browse: ['Find books and reading sources', 'Use DRM-Free Books', 'Open Great Books or Bible Study', 'Use Read Anything'],
    'drm-free': ['Search by title, author, subject, or keyword', 'Filter category, rights, format, source, language, and year', 'Open or download supported editions'],
    'mark-notebook': ['Review saved passages and Mark responses', 'Review personal notes', 'Return to saved reading locations', 'Export notebook content'],
    'library-notes': ['Review notes saved from books', 'Return to the related reading when available'],
    'random-notes': ['Create notes unrelated to a specific book', 'Review saved random notes'],
    'vocabulary-builder': ['Review saved definitions', 'Return to source reading when available'],
    'progress-awards': ['Review reading progress', 'Check comprehension and WPM trends', 'Review goals, streaks, and awards'],
    'reading-goals': ['Create or review reading goals', 'Track deadlines and progress', 'Use encouragement and progress updates'],
    'action-center': ['Review reading actions and reminders', 'Create follow-up tasks from reading insights'],
    music: ['Choose focus music', 'Open supported Spotify or YouTube playback', 'Use saved music while reading'],
    help: ['Search the full Help guide', 'Start the Simple Overview', 'Start the Full Experience walkthrough', 'Read troubleshooting guidance'],
    about: ['Learn what Mark, Set, Go! is and what it is designed to do'],
    contact: ['Find contact and support information'],
    privacy: ['Review privacy and data-handling information'],
    terms: ['Review application terms'],
    default: ['Use the controls visible on this page', 'Use the top navigation to move between Library, Learn, Notebook, Music, Help, and related features']
  };

  function pageContext() {
    const key = String(app.dataset.viewKey || '').trim().toLowerCase();
    const heading = app.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const title = heading || key || 'Current page';
    const lower = `${key} ${heading}`.toLowerCase();
    let topicKey = key;
    if (!PAGE_HELP[topicKey]) {
      if (lower.includes('library')) topicKey = 'my-library';
      else if (lower.includes('notebook')) topicKey = 'mark-notebook';
      else if (lower.includes('goal')) topicKey = 'reading-goals';
      else if (lower.includes('progress') || lower.includes('award')) topicKey = 'progress-awards';
      else if (lower.includes('action center')) topicKey = 'action-center';
      else if (lower.includes('definition') || lower.includes('vocabulary')) topicKey = 'vocabulary-builder';
      else if (lower.includes('music')) topicKey = 'music';
      else if (lower.includes('help')) topicKey = 'help';
      else topicKey = 'default';
    }
    return { key: key || topicKey, title, topics: PAGE_HELP[topicKey] || PAGE_HELP.default };
  }

  function isReaderPage() {
    return String(app.dataset.viewKey || '').toLowerCase() === 'reader' || !!app.querySelector('#reader-frame, #reader');
  }

  function escapeHtml(value='') {
    return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  const host = document.createElement('div');
  host.className = 'app-help-mark-host';
  host.innerHTML = `
    <button type="button" class="app-help-mark-button" data-app-help-open aria-haspopup="dialog" aria-expanded="false">✦ <span>Ask Mark</span></button>
    <aside class="app-help-mark-panel" data-app-help-panel hidden role="dialog" aria-modal="false" aria-label="Ask Mark app help">
      <header><div><small>App help</small><strong>Ask Mark</strong></div><button type="button" data-app-help-close aria-label="Close">×</button></header>
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

  function syncVisibility() {
    const reader = isReaderPage();
    host.hidden = reader;
    if (reader) closePanel();
  }

  function syncPageLabel() {
    const ctx = pageContext();
    pageNode.textContent = `Help for: ${ctx.title}`;
  }

  function openPanel() {
    syncPageLabel();
    panel.hidden = false;
    openButton.setAttribute('aria-expanded', 'true');
    if (!conversation.children.length) {
      const ctx = pageContext();
      conversation.innerHTML = `<div class="app-help-mark-message mark"><strong>Mark</strong><p>I can answer questions about how to use <b>${escapeHtml(ctx.title)}</b>. I’ll keep answers limited to app help for this page.</p></div>`;
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
    div.innerHTML = `<strong>${escapeHtml(who)}</strong><p>${escapeHtml(text)}</p>`;
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
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ pageKey: ctx.key, pageTitle: ctx.title, helpTopics: ctx.topics, question })
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
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    input.value = '';
    ask(question);
  });

  // Navigation in this app is click-driven. One passive capture listener updates
  // button visibility after the existing page renderer has run. No observer,
  // repeated timer, DOM rewrite, reader hook, or selection hook is used.
  document.addEventListener('click', () => requestAnimationFrame(() => {
    syncVisibility();
    if (!panel.hidden) syncPageLabel();
  }), { capture: true, passive: true });
  window.addEventListener('popstate', () => requestAnimationFrame(syncVisibility));
  window.addEventListener('hashchange', () => requestAnimationFrame(syncVisibility));
  syncVisibility();
})();
