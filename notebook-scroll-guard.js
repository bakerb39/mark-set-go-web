(() => {
  'use strict';

  function unlockNotebookPageScroll() {
    const page = document.querySelector('#app .global-notebook-page');
    if (!page) return;

    // A Reader fullscreen/fallback session can leave the document body locked
    // after navigation. The standalone Notebook is a normal document page, so
    // those Reader-only locks must not survive here.
    document.body.classList.remove('viewer-fullscreen-open', 'resizing-reader-panes');
    document.documentElement.style.removeProperty('overflow');
    document.documentElement.style.removeProperty('overflow-y');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('overflow-y');

    // Override the older failed nested-scroller experiment only while the
    // standalone Notebook page exists. Let the browser/document own scrolling.
    page.style.setProperty('height', 'auto', 'important');
    page.style.setProperty('max-height', 'none', 'important');
    page.style.setProperty('overflow-x', 'visible', 'important');
    page.style.setProperty('overflow-y', 'visible', 'important');
    page.style.setProperty('overscroll-behavior-y', 'auto', 'important');
    page.style.setProperty('scrollbar-gutter', 'auto', 'important');
  }

  function scheduleNotebookUnlock() {
    queueMicrotask(unlockNotebookPageScroll);
    requestAnimationFrame(unlockNotebookPageScroll);
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('[data-action="mark-notebook"]')) return;
    scheduleNotebookUnlock();
  }, false);

  // Saving/editing a Notebook item can re-render its contents. Reassert only
  // this page's scrolling contract; no DOM polling or MutationObserver is used.
  document.addEventListener('marksetgo:notebook-saved', scheduleNotebookUnlock, false);
})();
