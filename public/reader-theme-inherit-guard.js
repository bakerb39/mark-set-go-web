(() => {
  'use strict';

  // New Readers should inherit the visible Reader's theme. If there is no
  // visible Reader/theme yet, the product default is Light.
  let pendingTheme = 'light';

  function currentReaderTheme() {
    const select = document.querySelector('#theme-select');
    if (select?.value === 'dark' || select?.value === 'light') return select.value;
    const reader = document.querySelector('#reader');
    if (reader) return reader.classList.contains('light') ? 'light' : 'dark';
    return 'light';
  }

  function applyPendingTheme() {
    const select = document.querySelector('#theme-select');
    const reader = document.querySelector('#reader');
    if (!select || !reader) return false;

    const theme = pendingTheme === 'dark' ? 'dark' : 'light';
    if (select.value !== theme) select.value = theme;

    // Use the Reader's existing appearance handler so fullscreen/state stay in sync.
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function scheduleApply() {
    [0, 40, 120, 260, 500].forEach((delay) => {
      window.setTimeout(() => applyPendingTheme(), delay);
    });
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('[data-reader-slot-new]')) return;
    pendingTheme = currentReaderTheme();
    scheduleApply();
  }, true);

  // Reader content can be rendered after the blank slot is created.
  document.addEventListener('marksetgo:reader-session-changed', scheduleApply);
  document.addEventListener('marksetgo:document-available', scheduleApply);
})();
