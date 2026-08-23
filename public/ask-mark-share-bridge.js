'use strict';

/*
 * Mark, Set, Go! — visible Ask companion response share bridge v1.0.0
 *
 * The premium Ask companion thread copies the legacy #mark-response markup into
 * .askmark-rich-response. cloneNode/innerHTML intentionally does not copy the
 * legacy buttons' event listeners, so the visible Chat/Symposium buttons need
 * to forward to their still-live originals in the hidden legacy response.
 *
 * Event delegation keeps this bridge compatible with every newly rendered Ask
 * response without a MutationObserver.
 */
(() => {
  function originalShareButton(kind) {
    const selector = `[data-mark-share-response="${kind}"]`;
    const legacyHost = document.querySelector('.askmark-legacy-host');
    const legacyResponse = legacyHost?.querySelector('#mark-response')
      || document.querySelector('#mark-response');
    return legacyResponse?.querySelector(selector) || null;
  }

  function flash(button, text, delay = 1200) {
    if (!button) return;
    const original = button.textContent;
    button.textContent = text;
    window.setTimeout(() => {
      if (button.isConnected) button.textContent = original;
    }, delay);
  }

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.(
      '.askmark-rich-response [data-mark-share-response]'
    );
    if (!button) return;

    // This is the cloned premium response. Prevent its inert click from
    // bubbling into unrelated Reader handlers, then invoke the original button
    // whose app.js listener still owns the canonical payload and destination.
    event.preventDefault();
    event.stopImmediatePropagation();

    const kind = String(button.dataset.markShareResponse || '').trim();
    if (kind !== 'chat' && kind !== 'symposium') return;

    const original = originalShareButton(kind);
    if (!original || original === button) {
      flash(button, 'Share unavailable');
      console.warn(`Ask companion share bridge could not find the ${kind} source action.`);
      return;
    }

    flash(button, kind === 'chat' ? 'Opening Chat…' : 'Opening Symposium…');
    original.click();
  }, true);
})();
