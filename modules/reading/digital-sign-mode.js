'use strict';

function createTickerChunk(startIndex, chunkSize = 80) {
  const endIndex = Math.min(state.words.length, startIndex + chunkSize);
  if (endIndex <= startIndex) return null;

  const chunk = document.createElement('span');
  chunk.className = 'digital-sign-chunk';
  chunk.dataset.start = String(startIndex);
  chunk.dataset.end = String(endIndex);
  renderPhrase(chunk, state.words.slice(startIndex, endIndex));
  return { chunk, endIndex, wordCount: endIndex - startIndex };
}

function fillTickerBuffer(stage, reader, { maxChunks = 4 } = {}) {
  // Keep only a bounded amount of upcoming text in the DOM. Return the number
  // of words actually added so callers can stop immediately when the visual
  // buffer is already wide enough.
  const targetWidth = Math.max(reader.clientWidth * 2.5, 1800);
  const startingWordIndex = state.tickerNextWordIndex;
  let guard = 0;

  while (state.tickerNextWordIndex < state.words.length
      && (stage.scrollWidth < targetWidth || stage.children.length < 3)
      && guard < Math.max(1, maxChunks)) {
    const result = createTickerChunk(state.tickerNextWordIndex);
    if (!result || result.endIndex <= state.tickerNextWordIndex) break;
    stage.append(result.chunk);
    state.tickerNextWordIndex = result.endIndex;
    state.tickerLoadedWords += result.wordCount;
    guard += 1;
  }

  return Math.max(0, state.tickerNextWordIndex - startingWordIndex);
}


function createWpmClock(startIndex, speed, carriedWords = 0) {
  return {
    startIndex: Math.max(0, Number(startIndex) || 0),
    speed: Math.max(1, Number(speed) || 1),
    startedAt: performance.now(),
    carriedWords: Math.max(0, Number(carriedWords) || 0)
  };
}

function wordsDueFromClock(clock, now = performance.now()) {
  if (!clock) return 0;
  const elapsedMinutes = Math.max(0, now - clock.startedAt) / 60000;
  return clock.carriedWords + (elapsedMinutes * clock.speed);
}

function targetWordFromClock(clock, now = performance.now()) {
  return Math.min(
    state.words.length,
    clock.startIndex + Math.floor(wordsDueFromClock(clock, now))
  );
}

function wordElementForIndex(reader, index) {
  if (!reader) return null;
  return reader.querySelector(`.reader-word[data-index="${Math.max(0, Math.trunc(index))}"]`)
    || reader.querySelector(`.reader-group[data-start-index="${Math.max(0, Math.trunc(index))}"]`);
}

function scrollWordToReadingLine(reader, index) {
  const element = wordElementForIndex(reader, index);
  if (!element) return false;

  const readerRect = reader.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const desiredTop = Math.max(16, reader.clientHeight * 0.32);
  const currentTop = elementRect.top - readerRect.top;
  const delta = currentTop - desiredTop;

  if (Math.abs(delta) >= 1) {
    reader.scrollTop = Math.max(0, reader.scrollTop + delta);
  }
  return true;
}
function startDigitalSignReader({ reader, speed, start, pause }) {
  const stage = reader.querySelector('.digital-sign-stage');
  if (!stage || state.index >= state.words.length) return;

  const token = ++state.runToken;
  const isResume = state.tickerPaused && stage.children.length > 0;
  const resumeIndex = Math.max(0, state.index);

  if (!isResume) {
    stage.replaceChildren();
    state.tickerStartIndex = resumeIndex;
    state.tickerNextWordIndex = resumeIndex;
    state.tickerLoadedWords = 0;
    fillTickerBuffer(stage, reader);
  }

  // The word clock is authoritative. Pixel movement is only a visualization.
  const clock = createWpmClock(resumeIndex, speed);
  state.tickerPaused = false;
  state.tickerLastAt = clock.startedAt;

  const frame = (now) => {
    if (token !== state.runToken || state.tickerPaused) {
      state.tickerFrame = null;
      return;
    }

    const targetIndex = targetWordFromClock(clock, now);
    state.index = Math.max(resumeIndex, targetIndex);

    // Keep enough upcoming text buffered, but never spin when the visual
    // buffer is already sufficiently wide. At most two small fill attempts are
    // allowed in one animation frame.
    const desiredWordIndex = Math.min(state.words.length, state.index + 300);
    let fillAttempts = 0;
    while (state.tickerNextWordIndex < desiredWordIndex && fillAttempts < 2) {
      const addedWords = fillTickerBuffer(stage, reader, { maxChunks: 2 });
      fillAttempts += 1;
      if (addedWords <= 0 || state.tickerNextWordIndex >= state.words.length) break;
    }

    // Remove chunks that are entirely behind the authoritative target word.
    let first = stage.firstElementChild;
    let removedChunks = 0;
    while (first && Number(first.dataset.end) <= state.index && removedChunks < 6) {
      state.tickerLoadedWords -= Math.max(
        0,
        (Number(first.dataset.end) || 0) - (Number(first.dataset.start) || 0)
      );
      first.remove();
      removedChunks += 1;
      first = stage.firstElementChild;
    }
    if (removedChunks > 0) fillTickerBuffer(stage, reader, { maxChunks: 3 });

    /*
      Position the currently due word near the horizontal reading anchor.
      This calculation is repeated from the current viewport dimensions, so a
      resize changes only where the word appears—not how many words are due.
    */
    const anchorX = Math.max(24, reader.clientWidth * 0.35);
    const currentChunk = stage.firstElementChild;
    if (currentChunk) {
      const chunkStart = Number(currentChunk.dataset.start) || state.index;
      const chunkEnd = Math.max(chunkStart + 1, Number(currentChunk.dataset.end) || chunkStart + 1);
      const chunkWords = Math.max(1, chunkEnd - chunkStart);
      const chunkWidth = Math.max(1, currentChunk.getBoundingClientRect().width);
      const localWords = Math.max(0, Math.min(chunkWords, state.index - chunkStart));
      const localOffset = (localWords / chunkWords) * chunkWidth;
      state.tickerOffset = anchorX - localOffset;
      stage.style.transform = `translate3d(${state.tickerOffset}px, 0, 0)`;
    }

    updateReaderStatus();

    if (state.index >= state.words.length) {
      state.tickerFrame = null;
      state.tickerPaused = false;
      if (start) { start.disabled = false; start.textContent = 'Start'; }
      if (pause) pause.disabled = true;
      updateReaderStatus('Finished.');
      return;
    }

    state.tickerFrame = requestAnimationFrame(frame);
  };

  state.tickerFrame = requestAnimationFrame(frame);
  start.disabled = true;
  pause.disabled = false;
}

window.MarkSetGoModules = window.MarkSetGoModules || {};
window.MarkSetGoModules["digital-sign-mode"] = {
  loaded: true,
  version: '7.2.0'
};
