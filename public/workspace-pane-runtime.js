/* Mark, Set, Go! lightweight workspace pane runtime v0.9.0 */
(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const mode = params.get('msgWorkspaceMode') || 'action';
  const value = params.get('msgWorkspaceValue') || 'home';
  const PREF_KEY = 'msg-workspace-optin-v1';
  const app = document.getElementById('app');

  // No second page-routing table lives here. The lightweight pane replays the
  // app's own data-action / data-read / data-test navigation event, so module-
  // owned pages and future menu destinations work without workspace exceptions.

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
    fallbackRoute();
    if (mode === 'action' && value === 'profile-preferences') installWorkspaceToggle();
    if (mode === 'action' && value === 'music') installMusicReadingSuggestions();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.documentElement.classList.add('msg-workspace-pane-ready');
      sendParent('msg-workspace-pane-ready', { mode, value });
    }));
  }

  function openParentLibraryDocument(documentId) {
    const id = String(documentId || '').trim();
    if (!id) return false;

    let parentDocument = null;
    try {
      if (parent.location.origin !== location.origin) return false;
      parentDocument = parent.document;
    } catch {
      return false;
    }
    if (!parentDocument?.body) return false;

    // Route the OUTER app to its own My Library renderer. This synthetic control
    // lives outside the site header/footer, so Workspace top-nav interception
    // does not redirect it back into this pane.
    const route = parentDocument.createElement('button');
    route.type = 'button';
    route.hidden = true;
    route.dataset.action = 'my-library';
    parentDocument.body.appendChild(route);
    route.click();
    route.remove();

    // The real outer Library renderer binds data-library-document to its private
    // openStoredDocument(). Wait for that exact button, then click it there.
    let attempt = 0;
    const clickBoundOuterDocument = () => {
      const candidates = [...parentDocument.querySelectorAll('#app [data-library-document]')];
      const target = candidates.find(
        (button) => String(button.dataset.libraryDocument || '') === id
      );

      if (target) {
        target.click();
        return;
      }

      attempt += 1;
      if (attempt < 30) parent.setTimeout(clickBoundOuterDocument, 25);
    };

    clickBoundOuterDocument();
    return true;
  }

  // Never let a secondary page manufacture another Reader. Reader-bound actions
  // belong to the already-mounted Reader in the outer application.
  document.addEventListener('click', (event) => {
    const targetElement = event.target instanceof Element
      ? event.target
      : event.target?.parentElement;

    // My Library Resume/Open controls are renderer-local data-library-document
    // buttons, not data-read actions. Intercept them here during CAPTURE before
    // the iframe's own target listener can call its private openStoredDocument().
    const libraryDocument = targetElement?.closest?.('[data-library-document]');
    if (libraryDocument?.dataset.libraryDocument) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openParentLibraryDocument(libraryDocument.dataset.libraryDocument);
      return;
    }

    const clickedLink = targetElement?.closest?.('a[href]');
    const suggestedMusic = targetElement?.closest?.('.book-music-link')
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

    const readerAction = targetElement?.closest?.('[data-action="reader"]');
    if (!readerAction) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sendParent('msg-workspace-return-reader');
  }, true);

  window.addEventListener('msg:companion-changed', (event) => {
    const next = String(event.detail?.id || event.detail?.companion || '').toLowerCase();
    if (!next) return;
    try {
      if (parent?.MSGCompanion?.id !== next) parent?.MSGCompanion?.set?.(next);
    } catch {}
  });

  document.addEventListener('keydown', (event) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== ',' && event.key !== '.') return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]')) return;
    sendParent('msg-workspace-topic-feed-key', { key: event.key });
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderRequested, { once: true });
  } else {
    renderRequested();
  }
})();
