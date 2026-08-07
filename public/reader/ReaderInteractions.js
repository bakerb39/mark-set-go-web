(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ReaderInteractions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SEEKABLE_MODES = new Set([
    'highlight',
    'bold-focus',
    'smooth-glide',
    'pointing-guide',
    'marquee',
    'auto-scroll'
  ]);

  function classifyReaderClick({ translatedWord = false, clickedWordIndex = null, mode = '' } = {}) {
    if (translatedWord) return 'translated-word';
    if (clickedWordIndex !== null && clickedWordIndex !== undefined && Number.isFinite(Number(clickedWordIndex)) && SEEKABLE_MODES.has(mode)) return 'seek-word';
    return 'toggle-playback';
  }

  function shouldHandleSpacebar(event, { readerPresent = true, mode = '' } = {}) {
    if (!event || event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return false;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, button, a, summary, [contenteditable="true"], [role="textbox"]')) return false;
    if (!readerPresent || mode === 'two-column') return false;
    return true;
  }

  function install({
    reader,
    state,
    getSelectedMode,
    isReaderRunning,
    startReader,
    pauseReader,
    stopReader,
    persistReaderSession,
    findReadingGroup,
    updateReaderStatus,
    handleTranslatedWordClick,
    app
  }) {
    if (!reader) throw new Error('ReaderInteractions.install requires a reader element.');

    if (state.spacebarHandler) document.removeEventListener('keydown', state.spacebarHandler);
    state.spacebarHandler = (event) => {
      if (!shouldHandleSpacebar(event, {
        readerPresent: Boolean(app?.querySelector?.('#reader')),
        mode: getSelectedMode()
      })) return;

      event.preventDefault();
      if (isReaderRunning()) pauseReader();
      else startReader();
      persistReaderSession();
    };
    document.addEventListener('keydown', state.spacebarHandler);

    const clickHandler = (event) => {
      const translatedWord = event.target.closest('.translated-word');
      const clickedWord = event.target.closest('.reader-word[data-index]');
      const clickedIndex = clickedWord ? Number(clickedWord.dataset.index) : null;
      const mode = getSelectedMode();
      const action = classifyReaderClick({
        translatedWord: Boolean(translatedWord && state.language !== 'en'),
        clickedWordIndex: clickedIndex,
        mode
      });

      if (action === 'translated-word') {
        handleTranslatedWordClick(event);
        return;
      }

      if (action === 'seek-word') {
        event.preventDefault();
        event.stopPropagation();
        const wasRunning = isReaderRunning();
        const group = findReadingGroup(clickedIndex);
        stopReader();
        state.index = group?.start ?? clickedIndex;
        state.viewportAnchorIndex = state.index;
        persistReaderSession({ immediate: true });
        updateReaderStatus(`Reading position moved to word ${(state.index + 1).toLocaleString()}.`);
        startReader();
        if (!wasRunning) window.setTimeout(pauseReader, 0);
        return;
      }

      // PROTECTED READER CONTRACT: clicking reader blank space toggles playback.
      if (isReaderRunning()) pauseReader();
      else startReader();
      persistReaderSession();
    };
    reader.addEventListener('click', clickHandler);

    return { clickHandler, spacebarHandler: state.spacebarHandler };
  }

  return Object.freeze({
    SEEKABLE_MODES,
    classifyReaderClick,
    shouldHandleSpacebar,
    install
  });
});
