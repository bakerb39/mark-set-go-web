(() => {
  'use strict';

  let pendingTheme = null;

  function currentReaderTheme() {
    const select = document.querySelector('#theme-select');
    if (select && (select.value === 'light' || select.value === 'dark')) {
      return select.value;
    }

    const frame = document.querySelector('#reader-frame');
    if (frame?.classList.contains('light')) return 'light';
    if (frame?.classList.contains('dark')) return 'dark';

    // The app's normal Reader presentation is light. Use this only when
    // there is no existing Reader instance from which to inherit.
    return 'light';
  }

  function applyPendingTheme() {
    const select = document.querySelector('#theme-select');
    if (!select || !pendingTheme) return false;
    if (select.value === pendingTheme) return true;

    select.value = pendingTheme;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  document.addEventListener('marksetgo:document-available', () => {
    // This event fires before the Reader markup is replaced, so capture
    // the current Reader theme now and apply it to the next Reader render.
    pendingTheme = currentReaderTheme();

    [0, 30, 90, 180].forEach((delay) => {
      window.setTimeout(applyPendingTheme, delay);
    });
  });
})();
