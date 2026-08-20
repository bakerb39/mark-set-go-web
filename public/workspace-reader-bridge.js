/* Mark, Set, Go! Workspace Reader Delegation v0.8.1
   EARLY CAPTURE VERSION

   This script is loaded before app.js in workspace-pane.html and listens on
   window during capture, so Reader-owned clicks are intercepted before any
   iframe app handlers can receive them.

   No MutationObserver.
*/
(() => {
  'use strict';

  if (window.parent === window) return;

  function send(type, extra = {}) {
    try {
      window.parent.postMessage({ type, ...extra }, window.location.origin);
      return true;
    } catch {
      return false;
    }
  }

  function delegatedRoute(target) {
    const element = target instanceof Element ? target : target?.parentElement;
    if (!element) return null;

    const libraryDocument = element.closest('[data-library-document]');
    if (libraryDocument?.dataset.libraryDocument) {
      return {
        type: 'msg-workspace-open-library-document',
        documentId: String(libraryDocument.dataset.libraryDocument)
      };
    }

    const route = element.closest('[data-read],[data-test],[data-action="reader"]');
    if (!route) return null;

    if (route.dataset.read) {
      return {
        type: 'msg-workspace-reader-route',
        mode: 'read',
        value: String(route.dataset.read)
      };
    }

    if (route.dataset.test) {
      return {
        type: 'msg-workspace-reader-route',
        mode: 'test',
        value: String(route.dataset.test)
      };
    }

    if (route.dataset.action === 'reader') {
      return { type: 'msg-workspace-return-reader' };
    }

    return null;
  }

  window.addEventListener('click', (event) => {
    const route = delegatedRoute(event.target);
    if (!route) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const { type, ...extra } = route;
    send(type, extra);
  }, true);

  window.MSGWorkspaceReaderBridge = Object.freeze({
    openLibraryDocument(documentId) {
      return send('msg-workspace-open-library-document', {
        documentId: String(documentId || '')
      });
    },
    reader() {
      return send('msg-workspace-return-reader');
    }
  });
})();
