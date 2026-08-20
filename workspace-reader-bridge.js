/* Mark, Set, Go! Workspace Reader Delegation v0.8.0
   Secondary panes never open a second Reader.
   Reader-owned operations are delegated to the parent application.
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

  function closestDelegatedRoute(target) {
    if (!(target instanceof Element)) return null;

    const libraryDocument = target.closest('[data-library-document]');
    if (libraryDocument?.dataset.libraryDocument) {
      return {
        type: 'msg-workspace-open-library-document',
        documentId: String(libraryDocument.dataset.libraryDocument)
      };
    }

    const route = target.closest('[data-read],[data-test],[data-action="reader"]');
    if (!route) return null;

    if (route.dataset.read) {
      return { type:'msg-workspace-reader-route', mode:'read', value:String(route.dataset.read) };
    }
    if (route.dataset.test) {
      return { type:'msg-workspace-reader-route', mode:'test', value:String(route.dataset.test) };
    }
    if (route.dataset.action === 'reader') {
      return { type:'msg-workspace-return-reader' };
    }
    return null;
  }

  document.addEventListener('click', (event) => {
    const route = closestDelegatedRoute(event.target);
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
