/* Mark, Set, Go! Workspace Reader API proxy v0.10.1
   Secondary pages may use the normal Read Anything API, but openDocument()
   must always execute in the outer application so it opens the one real Reader.
*/
(() => {
  'use strict';

  if (window.parent === window) return;

  const existing = window.MarkSetGoReadAnything && typeof window.MarkSetGoReadAnything === 'object'
    ? window.MarkSetGoReadAnything
    : {};

  window.MarkSetGoReadAnything = {
    ...existing,
    openDocument(documentRecord) {
      try {
        if (window.parent.location.origin !== window.location.origin) return false;
        const outerApi = window.parent.MarkSetGoReadAnything;
        if (typeof outerApi?.openDocument !== 'function') return false;
        return outerApi.openDocument(documentRecord);
      } catch {
        return false;
      }
    }
  };
})();
