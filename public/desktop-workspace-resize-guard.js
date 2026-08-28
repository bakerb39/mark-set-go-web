(() => {
  'use strict';

  const MODE_KEY = 'msg-workspace-layout-mode-v1';

  function desktopWorkspaceActive() {
    return document.body.classList.contains('msg-desktop-workspace-active')
      || !!document.querySelector('.msg-workspace-shell.msg-desktop-workspace');
  }

  /*
   * Existing recursion guard:
   * Desktop's Reader 1 resize notification dispatches a synthetic top-level
   * resize event. Do not let that synthetic event recursively re-enter the
   * Desktop workspace resize handler.
   */
  window.addEventListener('resize', (event) => {
    if (desktopWorkspaceActive() && event.isTrusted === false) {
      event.stopImmediatePropagation();
    }
  }, true);

  /*
   * Reader selection must never activate Desktop mode by itself.
   *
   * desktop-workspace.js schedules syncDesktop() after Reader/menu clicks.
   * syncDesktop() will auto-activate Desktop whenever the persisted MODE_KEY
   * still says "desktop". A stale value can therefore turn a normal Reader
   * selection into Desktop Workspace.
   *
   * If Desktop is not ACTUALLY active at the moment the user selects/returns
   * to a Reader, normalize the persisted mode to Standard before the scheduled
   * desktop sync executes. Intentional Desktop sessions are left untouched.
   */
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (desktopWorkspaceActive()) return;

    const readerNavigation = event.target.closest(
      '[data-msg-reader-select], [data-action="reader"], .top-reader-return'
    );
    if (!readerNavigation) return;

    try {
      if (localStorage.getItem(MODE_KEY) === 'desktop') {
        localStorage.setItem(MODE_KEY, 'standard');
      }
    } catch {}
  }, true);
})();
