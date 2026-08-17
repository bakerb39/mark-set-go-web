(() => {
  'use strict';

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

  // Music behavior belongs exclusively to reader-music-quick.js. Keeping this
  // file visual-only prevents the music button from being toggled twice by two
  // independent click handlers.
})();
