(() => {
  'use strict';

  // Notebook-only mouse-wheel bridge.
  // The Notebook is already scrollable by keyboard/scrollbar; this restores
  // native-feeling mouse-wheel movement without touching Reader interactions.
  document.addEventListener('wheel', (event) => {
    const notebook = event.target?.closest?.('.global-notebook-page');
    if (!notebook) return;

    // Let controls with their own meaningful horizontal gesture behave normally.
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

    const maxScrollTop = Math.max(0, notebook.scrollHeight - notebook.clientHeight);
    if (maxScrollTop <= 0) return;

    const before = notebook.scrollTop;
    const next = Math.max(0, Math.min(maxScrollTop, before + event.deltaY));
    if (next === before) return;

    event.preventDefault();
    event.stopPropagation();
    notebook.scrollTop = next;
  }, { capture: true, passive: false });
})();
