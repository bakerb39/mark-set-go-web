(() => {
  'use strict';

  /*
   * Ask Mark Desktop stability rollback.
   *
   * Phase 2 detached the live .mark-companion-panel from Reader 1 and moved it
   * into a separately managed Desktop wrapper. That introduced a second
   * lifecycle owner around the same live panel and produced intermittent
   * reparent/blink/freeze/close behavior.
   *
   * This file intentionally does NOT install a Desktop companion bridge.
   * Ask Mark remains owned by Reader 1 and therefore moves only when Reader 1
   * itself is moved by desktop-workspace.js.
   */

  const root = document.documentElement;

  function cleanStaleBridgeState() {
    root.classList.remove('msg-askmark-desktop-owner');

    document.querySelectorAll('.askmark-desktop-open-button').forEach((node) => {
      try { node.remove(); } catch {}
    });

    const wrappers = Array.from(
      document.querySelectorAll('.msg-askmark-desktop-window')
    );

    wrappers.forEach((wrapper) => {
      const panel = wrapper.querySelector('.mark-companion-panel');

      if (panel) {
        const layout = document.getElementById('reader-layout');

        if (layout && panel.parentNode !== layout) {
          // Reader's normal structure is Reader content, splitter, companion.
          // Appending restores the companion after the existing splitter.
          layout.appendChild(panel);
          delete panel.dataset.msgAskmarkDesktopDetached;
        }
      }

      try { wrapper.remove(); } catch {}
    });

    document.querySelectorAll('#reader-layout.msg-askmark-desktop-detached')
      .forEach((layout) => layout.classList.remove('msg-askmark-desktop-detached'));

    return true;
  }

  cleanStaleBridgeState();

  window.MarkSetGoAskMarkDesktop = Object.freeze({
    disabled:true,
    reason:'stability-rollback',
    cleanup:cleanStaleBridgeState,
    status:() => ({
      disabled:true,
      detached:false,
      owner:false,
      reason:'stability-rollback'
    })
  });
})();