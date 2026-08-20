/* Mark, Set, Go! Workspace Parent Delegation v0.8.0
   Runs only in the outer application.
   Converts Reader-owned workspace requests into the main app's existing actions.

   No MutationObserver.
   No copied document-loading logic.
*/
(() => {
  'use strict';

  if (window.parent !== window) return;

  const WORKSPACE_PREF_KEY = 'msg-workspace-optin-v1';

  function dispatchAction(action) {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.hidden = true;
    trigger.dataset.action = action;
    document.body.appendChild(trigger);
    trigger.click();
    trigger.remove();
  }

  function clickLibraryDocument(documentId, attempt = 0) {
    const id = String(documentId || '');
    if (!id) return false;

    const buttons = [...document.querySelectorAll('#app [data-library-document]')];
    const target = buttons.find(
      (button) => String(button.dataset.libraryDocument || '') === id
    );

    if (target) {
      target.click();
      return true;
    }

    if (attempt >= 12) return false;

    window.setTimeout(() => {
      clickLibraryDocument(id, attempt + 1);
    }, 25);

    return true;
  }

  function openLibraryDocumentInMainReader(documentId) {
    const id = String(documentId || '');
    if (!id) return;

    let previousPreference = null;
    try {
      previousPreference = localStorage.getItem(WORKSPACE_PREF_KEY);
      localStorage.setItem(WORKSPACE_PREF_KEY, '0');
    } catch {}

    /*
      Use the application's existing My Library navigation. With Workspace
      interception temporarily disabled, the outer app renders its real Library,
      installs its real data-library-document -> openStoredDocument binding,
      and the matching bound button is clicked below.
    */
    dispatchAction('my-library');

    clickLibraryDocument(id);

    /* Restore the user's Workspace preference after the synchronous route has
       been allowed through. The selected book itself opens via the app's own
       Library handler. */
    window.setTimeout(() => {
      try {
        if (previousPreference === null) {
          localStorage.removeItem(WORKSPACE_PREF_KEY);
        } else {
          localStorage.setItem(WORKSPACE_PREF_KEY, previousPreference);
        }
      } catch {}
    }, 500);
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.source === window) return;

    if (event.data?.type === 'msg-workspace-open-library-document') {
      openLibraryDocumentInMainReader(event.data.documentId);
    }
  });
})();
