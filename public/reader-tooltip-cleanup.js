/* Mark, Set, Go! — remove the legacy Reader hover-help tooltip.
   No MutationObserver: clear it after startup and immediately on any later
   Reader pointer/focus entry in case the Reader is rendered again. */
(() => {
  const clearReaderTitle = (reader) => {
    if (reader && reader.id === 'reader' && reader.hasAttribute('title')) {
      reader.removeAttribute('title');
    }
  };

  const clearCurrentReader = () => clearReaderTitle(document.getElementById('reader'));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', clearCurrentReader, { once: true });
  } else {
    clearCurrentReader();
  }

  document.addEventListener('pointerover', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    clearReaderTitle(target?.closest?.('#reader'));
  }, true);

  document.addEventListener('focusin', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    clearReaderTitle(target?.closest?.('#reader'));
  }, true);
})();
