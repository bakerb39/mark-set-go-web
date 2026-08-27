(() => {
  'use strict';

  const MODE_KEY = 'markSetGoMediaDockModeV1';

  function simplify() {
    const dock = document.querySelector('#music-dock');
    const beside = document.querySelector('#music-beside-reader');

    if (!dock || !beside) return false;

    /*
      Retire the old Expanded mode without touching media-panel.js.
      Its existing Beside handler already maps:
        expanded -> beside
      so use that owner once, then persist the normal beside state.
    */
    let storedMode = '';
    try { storedMode = localStorage.getItem(MODE_KEY) || ''; } catch {}

    if (
      dock.classList.contains('msg-media-expanded') ||
      storedMode === 'expanded'
    ) {
      beside.click();
    }

    document.querySelector('#msg-media-expand')?.remove();
    document.querySelector('#msg-media-save-current')?.remove();

    // The existing media owner changes the label to Float while beside the
    // Reader. Keep the wording explicit and accessible.
    const isBeside = dock.classList.contains('msg-media-beside');
    beside.textContent = isBeside ? 'Float' : 'Beside';
    beside.title = isBeside
      ? 'Return the media player to a floating window'
      : 'Place the media player beside the Reader on the right';
    beside.setAttribute(
      'aria-label',
      isBeside
        ? 'Return media player to floating window'
        : 'Place media player beside Reader'
    );

    return true;
  }

  function schedule() {
    [0,60,180,500,1100].forEach((delay) => {
      window.setTimeout(simplify, delay);
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.closest?.(
        '#music-beside-reader,#msg-media-panel-toggle,[data-media-play],[data-media-result-action]'
      )
    ) {
      window.setTimeout(simplify, 0);
    }
  }, true);

  document.addEventListener('marksetgo:document-available', schedule);
  document.addEventListener('marksetgo:media-play', schedule);
  window.addEventListener('pageshow', schedule);

  window.MarkSetGoMediaToolbarSimplify = Object.freeze({
    version:'1.0.0',
    apply:simplify
  });

  schedule();
})();