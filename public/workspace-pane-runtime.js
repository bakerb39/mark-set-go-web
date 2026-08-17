/* Mark, Set, Go! lightweight workspace pane runtime v0.4.9 */
(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const mode = params.get('msgWorkspaceMode') || 'action';
  const value = params.get('msgWorkspaceValue') || 'home';
  const PREF_KEY = 'msg-workspace-optin-v1';
  const app = document.getElementById('app');

  const actionRenderers = {
    home: () => window.renderHome?.(),
    browse: () => window.renderBrowseHub?.(),
    'drm-free-books': () => window.renderDrmFreeBookFinder?.(),
    'my-links': () => window.renderMyLinks?.(),
    'my-library': () => window.renderMyLibraryHub?.(),
    'profile-preferences': () => window.renderProfilePreferences?.(),
    'ai-center': () => window.renderAiCenter?.(),
    'mark-notebook': () => window.renderGlobalNotebook?.(),
    'knowledge-graph': () => window.renderKnowledgeGraph?.(),
    'library-bookmarks': () => window.renderLibraryRecords?.('bookmarks'),
    'library-notes': () => window.renderLibraryRecords?.('notes'),
    about: () => window.renderAbout?.(),
    contact: () => window.renderContact?.(),
    privacy: () => window.renderPrivacy?.(),
    terms: () => window.renderTerms?.(),
    help: () => window.renderHelp?.(),
    music: () => window.renderMusicLibrary?.(),
    'my-reading': () => window.renderReadingList?.(),
    'reading-list': () => window.renderReadingList?.(),
    'progress-dashboard': () => window.renderProgressDashboard?.(),
    'progress-awards': () => window.renderProgressDashboard?.(),
    'action-center': () => window.renderActionCenter?.(),
    'vocabulary-builder': () => window.renderVocabularyBuilder?.(),
    'reading-skills': () => window.renderReadingSkillsHub?.(),
    'comprehension-library': () => window.renderComprehensionLibrary?.(),
    mnemonics: () => window.renderMnemonicsPage?.(),
    'language-learning': () => window.renderLanguageLearningPage?.(),
    'learning-courses': () => window.renderLearningCoursesPage?.()
  };

  function sendParent(type, extra = {}) {
    try { parent.postMessage({ type, ...extra }, location.origin); } catch {}
  }

  function requestParentMusicSearch(query, title = 'Suggested music') {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return false;
    try {
      const direct = parent?.MSGMusicController?.search || parent?.MSGWorkspaceExperiment?.musicSearch;
      if (typeof direct === 'function') {
        direct(cleanQuery, String(title || 'Suggested music'));
        return true;
      }
    } catch {}
    sendParent('msg-workspace-music-search', { query: cleanQuery, title: String(title || 'Suggested music') });
    return true;
  }

  function parentReaderDocument() {
    try {
      const doc = parent?.MarkSetGoCurrentReaderDocument?.get?.();
      if (!doc?.title) return null;
      return {
        title: String(doc.title || '').trim(),
        text: String(doc.text || ''),
        source: doc.source && typeof doc.source === 'object' ? { ...doc.source } : {}
      };
    } catch {
      return null;
    }
  }

  function parentReadingMusicQueries(doc) {
    if (!doc?.title) return null;
    try {
      const recommendation = parent?.recommendedPlayerChoice?.(doc.title, doc.text);
      if (recommendation?.scoreQuery || recommendation?.moodQuery) {
        return {
          suggested: String(recommendation.scoreQuery || `${doc.title} instrumental reading music`).trim(),
          mood: String(recommendation.moodQuery || `${doc.title} atmospheric instrumental reading music`).trim()
        };
      }
    } catch {}
    return {
      suggested: `${doc.title} instrumental reading music`,
      mood: `${doc.title} atmospheric instrumental reading music`
    };
  }

  function installMusicReadingSuggestions() {
    if (mode !== 'action' || value !== 'music') return;
    const page = document.querySelector('.music-library');
    if (!page) return;
    const doc = parentReaderDocument();
    if (!doc) return;

    // The workspace Music page is intentionally lightweight, so its local
    // ReaderEngine has no active book. Reflect the one real Reader in the
    // parent window instead of showing the misleading "No book open" state.
    const current = page.querySelector('.music-current-book');
    if (current) {
      const label = current.querySelector(':scope > span');
      const title = current.querySelector(':scope > strong');
      const detail = current.querySelector(':scope > small');
      if (label) label.textContent = 'Current reading';
      if (title) title.textContent = `“${doc.title}”`;
      if (detail) detail.textContent = 'Suggestions below are based on the Reader open beside this pane.';
    }

    page.querySelector('.msg-workspace-reading-music-suggestions')?.remove();
    const queries = parentReadingMusicQueries(doc);
    if (!queries) return;

    const section = document.createElement('section');
    section.className = 'music-current-book msg-workspace-reading-music-suggestions';
    section.setAttribute('aria-label', 'Suggested music for current reading');

    const eyebrow = document.createElement('span');
    eyebrow.textContent = 'Suggested for this reading';
    const title = document.createElement('strong');
    title.textContent = 'Music matched to what you are reading';
    const actions = document.createElement('div');
    actions.className = 'msg-workspace-reading-music-actions';

    const suggested = document.createElement('button');
    suggested.type = 'button';
    suggested.className = 'secondary';
    suggested.textContent = '♫ Suggested music';
    suggested.addEventListener('click', () => {
      requestParentMusicSearch(queries.suggested, `${doc.title} — suggested music`);
    });

    const mood = document.createElement('button');
    mood.type = 'button';
    mood.className = 'secondary';
    mood.textContent = '♫ Reading mood';
    mood.addEventListener('click', () => {
      requestParentMusicSearch(queries.mood, `${doc.title} — reading mood`);
    });

    actions.append(suggested, mood);
    section.append(eyebrow, title, actions);
    const primary = page.querySelector('.music-primary-section');
    if (primary) primary.before(section);
    else page.appendChild(section);
  }

  function installWorkspaceToggle() {
    const page = document.querySelector('.profile-preferences-page');
    if (!page || page.querySelector('.msg-workspace-profile-card')) return;

    const card = document.createElement('section');
    card.className = 'profile-feature-card msg-workspace-profile-card';
    card.innerHTML = `
      <div class="section-heading"><div><span class="source-category">Workspace</span><h2>Workspace</h2><p>Choose how other sections open while you are reading.</p></div></div>
      <label class="msg-workspace-profile-toggle" for="msg-workspace-profile-toggle">
        <span class="msg-workspace-profile-copy"><strong>Open pages in workspace</strong><small>Keep the Reader open and open other sections beside it.</small></span>
        <span class="msg-workspace-switch-wrap"><input id="msg-workspace-profile-toggle" type="checkbox" role="switch" aria-label="Open pages in workspace"><span class="msg-workspace-switch" aria-hidden="true"></span></span>
      </label>`;
    page.appendChild(card);
    const toggle = card.querySelector('input');
    try { toggle.checked = localStorage.getItem(PREF_KEY) === '1'; } catch {}
    toggle.addEventListener('change', () => {
      try { localStorage.setItem(PREF_KEY, toggle.checked ? '1' : '0'); } catch {}
      sendParent('msg-workspace-preference', { enabled: Boolean(toggle.checked) });
    });
  }

  function fallbackRoute() {
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

  function renderRequested() {
    let handled = false;
    if (mode === 'action' && actionRenderers[value]) {
      try {
        const result = actionRenderers[value]();
        handled = result !== undefined || Boolean(app?.children?.length);
      } catch (error) {
        console.warn('Workspace direct renderer failed:', value, error);
      }
    }
    if (!handled) fallbackRoute();
    if (mode === 'action' && value === 'profile-preferences') installWorkspaceToggle();
    if (mode === 'action' && value === 'music') installMusicReadingSuggestions();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.documentElement.classList.add('msg-workspace-pane-ready');
      sendParent('msg-workspace-pane-ready', { mode, value });
    }));
  }

  // Never let a secondary page manufacture another Reader. Reader-bound actions
  // belong to the already-mounted Reader in the outer application.
  document.addEventListener('click', (event) => {
    const clickedLink = event.target.closest?.('a[href]');
    const suggestedMusic = event.target.closest?.('.book-music-link')
      || (clickedLink?.closest?.('.book-music-recommendations') ? clickedLink : null);
    if (suggestedMusic?.href) {
      try {
        const target = new URL(suggestedMusic.href, location.href);
        const query = target.searchParams.get('search_query') || target.searchParams.get('q') || '';
        const label = String(suggestedMusic.textContent || 'Suggested music').replace(/^\s*♫\s*/, '').trim();
        const isSuggestion = Boolean(query) && (
          suggestedMusic.classList.contains('book-music-link')
          || Boolean(suggestedMusic.closest('.book-music-recommendations'))
          || /reading mood|adaptation score|film or tv score|music score/i.test(label)
        );
        if (isSuggestion) {
          event.preventDefault();
          event.stopImmediatePropagation();
          requestParentMusicSearch(query, label || 'Suggested music');
          return;
        }
      } catch {}
    }

    const readerAction = event.target.closest?.('[data-action="reader"]');
    if (!readerAction) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sendParent('msg-workspace-return-reader');
  }, true);

  // Forward Topic Feed comma/period navigation to the outer Reader while focus
  // happens to be inside this pane.
  document.addEventListener('keydown', (event) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== ',' && event.key !== '.') return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]')) return;
    sendParent('msg-workspace-topic-feed-key', { key: event.key });
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderRequested, { once: true });
  else renderRequested();
})();
