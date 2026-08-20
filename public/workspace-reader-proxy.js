/* Mark, Set, Go! Workspace Reader API proxy v0.10.3
   Imported documents opened from a Workspace page belong to the top-level
   Reader, never to the secondary iframe.
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
        const owner = window.parent.MarkSetGoReaderOwner;
        if (typeof owner?.openDocument !== 'function') return false;
        return owner.openDocument(documentRecord);
      } catch (error) {
        console.warn('Workspace could not hand the document to the outer Reader.', error);
        return false;
      }
    }
  };
})();
