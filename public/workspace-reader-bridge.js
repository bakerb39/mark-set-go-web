/* Mark, Set, Go! Workspace Reader Delegation v0.7.0
   A workspace pane is a secondary UI surface. Reader-owned navigation must run
   in the outer application, where the one real Reader/session is mounted.

   No MutationObserver. No duplicated page renderers. No app.js changes.
*/
(() => {
  'use strict';

  if (window.parent === window) return;

  function parentDocument() {
    try {
      if (window.parent.location.origin !== window.location.origin) return null;
      return window.parent.document;
    } catch {
      return null;
    }
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

  function closestReaderRoute(target) {
    if (!(target instanceof Element)) return null;
    const route = target.closest('[data-read],[data-test],[data-action="reader"]');
    if (!route) return null;

    if (route.dataset.read) {
      return { read: String(route.dataset.read) };
    }
    if (route.dataset.test) {
      return { test: String(route.dataset.test) };
    }
    if (route.dataset.action === 'reader') {
      return { action: 'reader' };
    }
    return null;
  }

  document.addEventListener('click', (event) => {
    const route = closestReaderRoute(event.target);
    if (!route) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (route.action === 'reader') {
      try {
        window.parent.MSGWorkspaceExperiment?.close?.();
        return;
      } catch {}
    }

    dispatchToOuterRouter(route);
  }, true);

  /* Expose a tiny bridge for page-specific features that need to deliberately
     hand a Reader route to the parent without knowing about workspace internals. */
  window.MSGWorkspaceReaderBridge = Object.freeze({
    route: dispatchToOuterRouter,
    read: (value) => dispatchToOuterRouter({ read: String(value || '') }),
    test: (value) => dispatchToOuterRouter({ test: String(value || '') }),
    reader: () => {
      try {
        window.parent.MSGWorkspaceExperiment?.close?.();
        return true;
      } catch {
        return dispatchToOuterRouter({ action: 'reader' });
      }
    }
  });
})();
