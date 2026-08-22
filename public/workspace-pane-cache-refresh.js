/* Mark, Set, Go! Workspace pane cache refresh 0.11.8-theme-stack
   Forces workspace-pane.html to use the same theme/app stack as the outer app.
*/
(() => {
  'use strict';

  const BUILD = '0.11.8-theme-stack';

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
