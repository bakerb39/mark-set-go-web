/* Mark, Set, Go! Workspace pane cache refresh v0.11.5
   The Workspace router currently hardcodes msgWorkspaceBuild=0.5.0.
   Refresh only that generated iframe URL so the current workspace-pane.html
   and its current scripts are actually loaded.
*/
(() => {
  'use strict';

  const BUILD = '0.11.5';

  function refreshWorkspacePaneUrls() {
    document.querySelectorAll('iframe.msg-workspace-page-frame').forEach((frame) => {
      const raw = frame.getAttribute('src') || '';
      if (!raw) return;

      let url;
      try { url = new URL(raw, window.location.href); }
      catch { return; }

      if (url.pathname !== '/workspace-pane.html') return;
      if (url.searchParams.get('msgWorkspaceBuild') === BUILD) return;

      url.searchParams.set('msgWorkspaceBuild', BUILD);
      frame.src = url.toString();
    });
  }

  // Register before workspace-experiment.js. Its capture handler creates the
  // pane synchronously; the zero-delay task then refreshes the new iframe once.
  document.addEventListener('click', () => {
    window.setTimeout(refreshWorkspacePaneUrls, 0);
  }, true);

  window.addEventListener('pageshow', () => {
    window.setTimeout(refreshWorkspacePaneUrls, 0);
  });
})();
