(() => {
  'use strict';

  const MODE_KEY = 'msg-workspace-layout-mode-v1';

  // v3.0: "actually active" means the live body mode, not merely a dormant
  // desktop-workspace node that may still exist in the DOM while Standard mode
  // is being displayed.
  function desktopWorkspaceActive() {
    return document.body.classList.contains('msg-desktop-workspace-active');
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
   * Opening/selecting a Reader must never activate Desktop mode by itself.
   *
   * desktop-workspace.js can schedule a later sync after Reader/menu clicks.
   * If MODE_KEY contains a stale "desktop" value, that later sync can switch a
   * currently Standard Reader into Desktop. Normalize that stale preference
   * before the later sync runs, but only when Desktop is not truly active.
   */
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (desktopWorkspaceActive()) return;

    const readerNavigation = event.target.closest(
      '[data-msg-reader-select], [data-reader-slot-switch], [data-reader-slot-new], ' +
      '[data-action="reader"], .top-reader-return, #reader-session-menu'
    );
    if (!readerNavigation) return;

    try {
      if (localStorage.getItem(MODE_KEY) === 'desktop') {
        localStorage.setItem(MODE_KEY, 'standard');
      }
    } catch {}
  }, true);
})();
