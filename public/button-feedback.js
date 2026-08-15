(() => {
  const selector = 'button:not(:disabled), [role="button"]:not([aria-disabled="true"]), a.button-link, label.read-anything-file-button';
  let active = null;

  const clear = () => {
    active?.classList.remove('msg-button-pressed');
    active = null;
  };

  document.addEventListener('pointerdown', (event) => {
    clear();
    const target = event.target.closest?.(selector);
    if (!target) return;
    active = target;
    target.classList.add('msg-button-pressed');
  }, { passive: true });

  document.addEventListener('pointerup', clear, { passive: true });
  document.addEventListener('pointercancel', clear, { passive: true });
  window.addEventListener('blur', clear);

  // Reader top-right music button. The Reader is rebuilt dynamically, so use
  // delegated click handling instead of binding directly to the current button.
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-reader-wpm-music-toggle]');
    if (!button) return;

    const chooserId = button.getAttribute('aria-controls');
    const chooser = chooserId ? document.getElementById(chooserId) : null;

    if (!chooser) {
      console.warn(`Reader music chooser not found: #${chooserId || 'reader-music-wpm-chooser'}`);
      return;
    }

    const opening = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(opening));
    chooser.hidden = !opening;
    chooser.classList.toggle('open', opening);
  });
})();
