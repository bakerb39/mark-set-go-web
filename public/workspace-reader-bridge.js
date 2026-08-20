/* Mark, Set, Go! Workspace Reader Delegation v0.7.1
   A workspace pane is a secondary UI surface. Reader-owned operations execute
   in the outer application, where the one real Reader/session is mounted.

   My Library uses data-library-document + a renderer-local openStoredDocument()
   binding, not data-read. Delegate by invoking the OUTER My Library renderer
   and clicking its own matching bound control. This preserves the application's
   exact document/resume behavior without duplicating that logic here.

   No MutationObserver. No duplicated Library open logic. No app.js changes.
*/
(() => {
  'use strict';

  if (window.parent === window) return;

  function parentWindow() {
    try {
      if (window.parent.location.origin !== window.location.origin) return null;
      return window.parent;
    } catch {
      return null;
    }
  }

  function parentDocument() {
    return parentWindow()?.document || null;
  }

  function dispatchToOuterRouter({ action = '', read = '', test = '' } = {}) {
    const doc = parentDocument();
    if (!doc) return false;

    const trigger = doc.createElement('button');
    trigger.type = 'button';
    trigger.hidden = true;

    if (read) trigger.dataset.read = read;
    else if (test) trigger.dataset.test = test;
    else if (action) trigger.dataset.action = action;
    else return false;

    doc.body.appendChild(trigger);
    trigger.click();
    trigger.remove();
    return true;
  }

  function openOuterLibraryDocument(documentId) {
    const outer = parentWindow();
    const doc = outer?.document;
    const id = String(documentId || '');
    if (!outer || !doc || !id) return false;
    if (typeof outer.renderMyLibraryHub !== 'function') return false;

    /* Use the real outer Library renderer. It installs the real
       [data-library-document] -> openStoredDocument() handler. */
    outer.renderMyLibraryHub();

    const candidates = [...doc.querySelectorAll('#app [data-library-document]')];
    const target = candidates.find((button) =>
      String(button.dataset.libraryDocument || '') === id
    );
    if (!target) return false;

    target.click();
    return true;
  }

  function closestReaderRoute(target) {
    if (!(target instanceof Element)) return null;

    const libraryDocument = target.closest('[data-library-document]');
    if (libraryDocument?.dataset.libraryDocument) {
      return {
        libraryDocument: String(libraryDocument.dataset.libraryDocument)
      };
    }

    const route = target.closest('[data-read],[data-test],[data-action="reader"]');
    if (!route) return null;

    if (route.dataset.read) return { read: String(route.dataset.read) };
    if (route.dataset.test) return { test: String(route.dataset.test) };
    if (route.dataset.action === 'reader') return { action: 'reader' };
    return null;
  }

  document.addEventListener('click', (event) => {
    const route = closestReaderRoute(event.target);
    if (!route) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (route.libraryDocument) {
      openOuterLibraryDocument(route.libraryDocument);
      return;
    }

    if (route.action === 'reader') {
      try {
        parentWindow()?.MSGWorkspaceExperiment?.close?.();
        return;
      } catch {}
    }

    dispatchToOuterRouter(route);
  }, true);

  window.MSGWorkspaceReaderBridge = Object.freeze({
    route: dispatchToOuterRouter,
    openLibraryDocument: openOuterLibraryDocument,
    read: (value) => dispatchToOuterRouter({ read: String(value || '') }),
    test: (value) => dispatchToOuterRouter({ test: String(value || '') }),
    reader: () => {
      try {
        parentWindow()?.MSGWorkspaceExperiment?.close?.();
        return true;
      } catch {
        return dispatchToOuterRouter({ action: 'reader' });
      }
    }
  });
})();
