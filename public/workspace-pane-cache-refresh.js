/* Mark, Set, Go! Workspace pane cache refresh v7.21 stability consolidation
   Forces workspace-pane.html to use the same theme/app stack as the outer app.
*/
(() => {
  'use strict';

  const BUILD = '20260822-v7.21-stability-consolidation';

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

  document.addEventListener('click', () => {
    window.setTimeout(refreshWorkspacePaneUrls, 0);
  }, true);

  window.addEventListener('pageshow', () => {
    window.setTimeout(refreshWorkspacePaneUrls, 0);
  });
})();
