(() => {
  'use strict';

  function desktopWorkspaceActive() {
    return document.body.classList.contains('msg-desktop-workspace-active')
      || !!document.querySelector('.msg-workspace-shell.msg-desktop-workspace');
  }

  window.addEventListener('resize', (event) => {
    // Prevent only synthetic top-level resize events while Desktop Workspace
    // is active. Real browser resizes (isTrusted === true) continue normally.
    // This breaks the desktop-workspace notifyWindowResize recursion without
    // affecting iframe resize dispatches.
    if (desktopWorkspaceActive() && event.isTrusted === false) {
      event.stopImmediatePropagation();
    }
  }, true);
})();
