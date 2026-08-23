/* Mark, Set, Go! Workspace Topic Feed Reader proxy v0.12.0 */
(() => {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const isSecondaryReader = params.get('msgWorkspaceMode') === 'reader' && params.get('msgWorkspaceValue') === 'secondary';
  if (window.parent === window || isSecondaryReader) return;

  const localApi = window.MarkSetGoReadAnything;
  if (!localApi || typeof localApi.openDocument !== 'function') return;

  const proxy = {
    ...localApi,
    openDocument(documentRecord) {
      try {
        const handoff = window.parent.MSGWorkspaceReaderHandoff;
        if (typeof handoff?.openDocument !== 'function') return false;
        return handoff.openDocument(documentRecord);
      } catch (error) {
        console.warn('Workspace could not hand the article to the outer Reader.', error);
        return false;
      }
    }
  };

  window.MarkSetGoReadAnything = Object.freeze(proxy);
})();
