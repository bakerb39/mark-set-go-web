(() => {
  'use strict';

  /* Home/front-page close is dismissal, not "return to Reader".
     This capture-phase guard owns ONLY the Home X and prevents newer generic
     page-close routing from turning that click into Reader navigation. */
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const close = target?.closest?.('[data-home-panel-close], .msg-home-page-close');
    if (!close) return;

    const app = document.getElementById('app');
    if (!app) return;

    const isHome =
      String(app.dataset.viewKey || '') === 'home' ||
      Boolean(app.querySelector('.home-simple'));

    if (!isHome) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    // Do not call the generic standalone-page close and do not open Reader.
    // Home has already stopped the active reader presentation when it rendered.
    // Dismiss only the Home surface and leave the selected theme/background.
    app.replaceChildren();
    app.dataset.viewKey = 'closed';

    document.dispatchEvent(new CustomEvent('marksetgo:home-dismissed'));
  }, true);
})();
