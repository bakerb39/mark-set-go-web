'use strict';

/*
 * Mark, Set, Go! workspace pane runtime v2.5.2
 *
 * A workspace-pane document is deliberately hidden by workspace-experiment.css
 * until this runtime adds .msg-workspace-pane-ready. If this file is missing or
 * a requested renderer throws, the page can appear briefly and then vanish.
 * This runtime makes the secondary pane the sole owner of that visibility gate,
 * renders the requested lightweight page, and always releases the gate.
 *
 * No MutationObserver.
 */
(() => {
  const html = document.documentElement;
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('msgWorkspaceMode') || 'action';
  const value = params.get('msgWorkspaceValue') || 'home';

  window.MSGWorkspacePane = true;
  window.__MSG_WORKSPACE_PANE__ = true;
  html.classList.add('msg-workspace-pane-document');

  const reveal = () => {
    html.classList.add('msg-workspace-pane-ready');
  };

  // Never leave the secondary pane permanently hidden, even if a feature
  // renderer fails. The normal route below reveals much earlier than this.
  const failSafeReveal = window.setTimeout(reveal, 1200);

  function renderActionDirectly(action) {
    try {
      switch (action) {
        case 'home':
          if (typeof renderHome === 'function') { renderHome(); return true; }
          break;
        case 'browse':
          if (typeof renderBrowseHub === 'function') { renderBrowseHub(); return true; }
          break;
        case 'my-library':
          if (typeof renderMyLibraryHub === 'function') { renderMyLibraryHub(); return true; }
          break;
        case 'profile-preferences':
          if (typeof renderProfilePreferences === 'function') { renderProfilePreferences(); return true; }
          break;
        case 'my-links':
          if (typeof renderMyLinks === 'function') { renderMyLinks(); return true; }
          break;
        case 'mark-notebook':
          if (typeof renderGlobalNotebook === 'function') { renderGlobalNotebook(); return true; }
          break;
        case 'music':
          if (typeof renderMusicLibrary === 'function') { renderMusicLibrary(); return true; }
          break;
        case 'about':
          if (typeof renderAbout === 'function') { renderAbout(); return true; }
          break;
        case 'contact':
          if (typeof renderContact === 'function') { renderContact(); return true; }
          break;
        case 'privacy':
          if (typeof renderPrivacy === 'function') { renderPrivacy(); return true; }
          break;
        case 'terms':
          if (typeof renderTerms === 'function') { renderTerms(); return true; }
          break;
        case 'help':
          if (typeof renderHelp === 'function') { renderHelp(); return true; }
          break;
        case 'my-reading':
        case 'reading-list':
          if (typeof renderReadingList === 'function') { renderReadingList(); return true; }
          break;
        case 'progress-dashboard':
        case 'progress-awards':
          if (typeof renderProgressDashboard === 'function') { renderProgressDashboard(); return true; }
          break;
        case 'action-center':
          if (typeof renderActionCenter === 'function') { renderActionCenter(); return true; }
          break;
        case 'vocabulary-builder':
          if (typeof renderVocabularyBuilder === 'function') { renderVocabularyBuilder(); return true; }
          break;
        case 'reading-skills':
          if (typeof renderReadingSkillsHub === 'function') { renderReadingSkillsHub(); return true; }
          break;
        case 'comprehension-library':
          if (typeof renderComprehensionLibrary === 'function') { renderComprehensionLibrary(); return true; }
          break;
        case 'mnemonics':
          if (typeof renderMnemonicsPage === 'function') { renderMnemonicsPage(); return true; }
          break;
        case 'language-learning':
          if (typeof renderLanguageLearningPage === 'function') { renderLanguageLearningPage(); return true; }
          break;
        case 'learning-courses':
          if (typeof renderLearningCoursesPage === 'function') { renderLearningCoursesPage(); return true; }
          break;
        case 'library-bookmarks':
          if (typeof renderLibraryRecords === 'function') { renderLibraryRecords('bookmarks'); return true; }
          break;
        case 'library-notes':
          if (typeof renderLibraryRecords === 'function') { renderLibraryRecords('notes'); return true; }
          break;
        case 'drm-free-books':
          if (typeof renderDrmFreeBookFinder === 'function') { renderDrmFreeBookFinder(); return true; }
          break;
        case 'ai-center':
          if (typeof renderAiCenter === 'function') { renderAiCenter(); return true; }
          break;
        case 'knowledge-graph':
          if (typeof renderKnowledgeGraph === 'function') { renderKnowledgeGraph(); return true; }
          break;
      }
    } catch (error) {
      console.warn('Workspace direct renderer failed; using the normal route.', error);
    }
    return false;
  }

  function routeRequestedPage() {
    let rendered = false;

    if (mode === 'action') rendered = renderActionDirectly(value);

    if (!rendered) {
      try {
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.hidden = true;
        if (mode === 'read') trigger.dataset.read = value;
        else if (mode === 'test') trigger.dataset.test = value;
        else trigger.dataset.action = value;
        document.body.appendChild(trigger);
        trigger.click();
        trigger.remove();
        rendered = true;
      } catch (error) {
        console.error('Workspace route failed.', error);
      }
    }

    // The secondary pane is allowed to stay visible even if a feature-specific
    // route reports an error. This prevents the old visible -> hidden flicker.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      window.clearTimeout(failSafeReveal);
      reveal();

      // If nothing rendered at all, leave a useful visible diagnostic instead
      // of an apparently blank/disappeared pane.
      const app = document.querySelector('#app');
      if (app && !app.children.length && !String(app.textContent || '').trim()) {
        const panel = document.createElement('section');
        panel.className = 'panel';
        panel.innerHTML = '<h2>Workspace page could not be opened</h2><p>The secondary pane stayed open, but this page renderer was unavailable.</p>';
        app.appendChild(panel);
      }
    }));
  }

  // Return-to-Reader inside a workspace means close/focus the secondary pane,
  // never build a competing Reader inside this iframe.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const returnReader = target?.closest?.('[data-action="reader"]');
    if (!returnReader) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      window.parent?.postMessage?.({ type:'msg-workspace-return-reader' }, window.location.origin);
    } catch {}
  }, true);

  // Keep Topic Feed comma/period story navigation working while focus is inside
  // the workspace iframe without intercepting ordinary text entry.
  document.addEventListener('keydown', (event) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== ',' && event.key !== '.') return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return;
    try {
      window.parent?.postMessage?.({ type:'msg-workspace-topic-feed-key', key:event.key }, window.location.origin);
    } catch {}
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(routeRequestedPage, 0), { once:true });
  } else {
    window.setTimeout(routeRequestedPage, 0);
  }
})();
