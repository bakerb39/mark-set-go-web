'use strict';

const PACMAN_PROGRESS_PREFIX = 'msg-pacman-progress-v1:';
const pacmanProgressCache = new Map();
let pacmanSaveTimer = null;

function pacmanDocumentKey() {
  const identity = state.documentId || state.title || 'current-book';
  return `${PACMAN_PROGRESS_PREFIX}${encodeURIComponent(identity)}`;
}

function indexesToRanges(indexes) {
  const sorted = [...indexes].filter(Number.isFinite).sort((a, b) => a - b);
  const ranges = [];
  for (const value of sorted) {
    const last = ranges[ranges.length - 1];
    if (!last || value > last[1] + 1) ranges.push([value, value]);
    else last[1] = value;
  }
  return ranges;
}

function rangesToIndexes(ranges) {
  const indexes = new Set();
  for (const range of Array.isArray(ranges) ? ranges : []) {
    const start = Math.max(0, Number(range?.[0]) || 0);
    const end = Math.max(start, Number(range?.[1]) || start);
    for (let index = start; index <= end; index += 1) indexes.add(index);
  }
  return indexes;
}

function getPacmanChompedIndexes() {
  const key = pacmanDocumentKey();
  if (pacmanProgressCache.has(key)) return pacmanProgressCache.get(key);

  let indexes = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    indexes = rangesToIndexes(saved);
  } catch (error) {
    console.warn('Pac-Man progress could not be restored:', error);
  }

  pacmanProgressCache.set(key, indexes);
  return indexes;
}

function schedulePacmanProgressSave() {
  window.clearTimeout(pacmanSaveTimer);
  pacmanSaveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(
        pacmanDocumentKey(),
        JSON.stringify(indexesToRanges(getPacmanChompedIndexes()))
      );
    } catch (error) {
      console.warn('Pac-Man progress could not be saved:', error);
    }
  }, 350);
}

function markPacmanWordChomped(index) {
  const value = Number(index);
  if (!Number.isFinite(value) || value < 0) return;
  getPacmanChompedIndexes().add(value);
  schedulePacmanProgressSave();
}

function isPacmanWordChomped(index) {
  return getPacmanChompedIndexes().has(Number(index));
}

function restorePacmanWord(element, { preserveEaten = true } = {}) {
  if (!element) return;
  const original = element.dataset.pacmanOriginal;
  if (original != null) {
    element.textContent = original;
    delete element.dataset.pacmanOriginal;
  }

  element.classList.remove('pacman-current-word');
  const index = Number(element.dataset.index);
  element.classList.toggle(
    'pacman-eaten-word',
    preserveEaten && isPacmanWordChomped(index)
  );
}

function applyPacmanChompState(reader) {
  if (!reader) return;
  reader.querySelectorAll('.reader-word[data-index]').forEach((element) => {
    const index = Number(element.dataset.index);
    const eaten = isPacmanWordChomped(index);
    element.classList.toggle('pacman-eaten-word', eaten);
    element.setAttribute('aria-hidden', eaten ? 'true' : 'false');
  });
}

function resetPacmanRenderedWords(reader, { clearProgress = false } = {}) {
  reader?.querySelectorAll('.reader-word[data-pacman-original]').forEach((element) => {
    restorePacmanWord(element, { preserveEaten: !clearProgress });
  });

  if (clearProgress) {
    getPacmanChompedIndexes().clear();
    schedulePacmanProgressSave();
  }

  applyPacmanChompState(reader);
}

function preparePacmanCharacters(wordElement) {
  if (!wordElement) return [];
  restorePacmanWord(wordElement);

  const text = wordElement.textContent || '';
  wordElement.dataset.pacmanOriginal = text;
  wordElement.textContent = '';
  wordElement.classList.remove('pacman-eaten-word');
  wordElement.removeAttribute('aria-hidden');
  wordElement.classList.add('pacman-current-word');

  return Array.from(text).map((character) => {
    const span = document.createElement('span');
    span.className = 'pacman-character';
    span.textContent = character;
    wordElement.append(span);
    return span;
  });
}

function movePacmanToCharacter(reader, marker, characterElement, fallbackWord) {
  if (!reader || !marker) return;
  const target = characterElement || fallbackWord;
  if (!target) return;

  const readerRect = reader.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const left = targetRect.left - readerRect.left + reader.scrollLeft - marker.offsetWidth * .72;
  const top = targetRect.top - readerRect.top + reader.scrollTop
    + (targetRect.height - marker.offsetHeight) / 2;

  marker.style.transform = `translate3d(${Math.max(0, left)}px, ${Math.max(0, top)}px, 0)`;
  marker.classList.add('visible');
}

function findNextUnchompedPacmanIndex(startIndex) {
  let index = Math.max(0, Number(startIndex) || 0);
  while (index < state.words.length && isPacmanWordChomped(index)) index += 1;
  return index;
}

function positionPacmanAtWord(reader, index) {
  ensureWordsRendered(
    reader,
    'pacman',
    1,
    Math.min(state.words.length, Math.max(index + 1000, state.renderedWordEnd || 0))
  );
  applyPacmanChompState(reader);

  const marker = reader.querySelector('.pacman-chomper');
  const word = reader.querySelector(`.reader-word[data-index="${index}"]`);
  if (!marker || !word) return false;

  scrollWordToReadingLine(reader, index);
  window.requestAnimationFrame(() => movePacmanToCharacter(reader, marker, null, word));
  return true;
}

function bindPacmanNavigation(reader) {
  if (!reader || reader.dataset.pacmanNavigationBound === 'true') return;
  reader.dataset.pacmanNavigationBound = 'true';

  reader.addEventListener('click', (event) => {
    if (state.renderedMode !== 'pacman') return;
    const word = event.target.closest?.('.reader-word[data-index]');
    if (!word || !reader.contains(word)) return;

    const clickedIndex = Number(word.dataset.index);
    if (!Number.isFinite(clickedIndex) || isPacmanWordChomped(clickedIndex)) return;

    event.preventDefault();
    event.stopPropagation();

    const wasRunning = isReaderRunning();
    state.runToken += 1;
    window.clearTimeout(state.interval);
    state.interval = null;

    const current = reader.querySelector('.reader-word.pacman-current-word');
    if (current) restorePacmanWord(current);

    state.index = clickedIndex;
    persistReaderSession({ immediate: true });
    positionPacmanAtWord(reader, clickedIndex);
    updateReaderStatus(`Pac-Man moved to word ${clickedIndex + 1}.`);

    if (wasRunning) {
      const speed = Math.min(
        900,
        Math.max(30, Number(app.querySelector('#speed')?.value) || state.wpm || 300)
      );
      startPacmanReader({
        reader,
        speed,
        start: app.querySelector('#start-reader'),
        pause: app.querySelector('#pause-reader')
      });
    }
  });
}

function initializePacmanMode(reader) {
  bindPacmanNavigation(reader);
  applyPacmanChompState(reader);

  const nextIndex = findNextUnchompedPacmanIndex(state.index);
  state.index = Math.min(nextIndex, state.words.length);
  if (state.index < state.words.length) positionPacmanAtWord(reader, state.index);
}

function startPacmanReader({ reader, speed, start, pause }) {
  const marker = reader.querySelector('.pacman-chomper');
  if (!marker) return;

  bindPacmanNavigation(reader);
  applyPacmanChompState(reader);

  const current = reader.querySelector('.reader-word.pacman-current-word');
  if (current) restorePacmanWord(current);

  const token = ++state.runToken;

  const consumeNextWord = () => {
    if (token !== state.runToken) return;

    state.index = findNextUnchompedPacmanIndex(state.index);
    if (state.index >= state.words.length) {
      pauseReader();
      marker.classList.remove('visible');
      updateReaderStatus('Pac-Man finished the book!');
      return;
    }

    ensureWordsRendered(
      reader,
      'pacman',
      1,
      Math.min(state.words.length, state.index + 1000)
    );
    applyPacmanChompState(reader);

    const wordIndex = state.index;
    const wordElement = reader.querySelector(`.reader-word[data-index="${wordIndex}"]`);

    if (!wordElement) {
      state.interval = window.setTimeout(consumeNextWord, 30);
      return;
    }

    scrollWordToReadingLine(reader, wordIndex);
    const characters = preparePacmanCharacters(wordElement);
    const wordDuration = Math.max(80, 60000 / speed);
    const visibleCharacters = characters.length || 1;
    const characterDuration = Math.max(22, wordDuration / visibleCharacters);
    let characterIndex = 0;

    const chompCharacter = () => {
      if (token !== state.runToken) return;

      const character = characters[characterIndex];
      movePacmanToCharacter(reader, marker, character, wordElement);
      if (character) character.classList.add('pacman-eaten-character');

      characterIndex += 1;
      if (characterIndex < characters.length) {
        state.interval = window.setTimeout(chompCharacter, characterDuration);
        return;
      }

      markPacmanWordChomped(wordIndex);
      wordElement.classList.remove('pacman-current-word');
      wordElement.classList.add('pacman-eaten-word');
      wordElement.setAttribute('aria-hidden', 'true');

      state.index = Math.min(state.words.length, wordIndex + 1);
      persistReaderSession({ immediate: true });
      updateFocusAnchorOverlay(state.words.slice(wordIndex, wordIndex + 1));
      updateReaderStatus();

      const elapsed = characterDuration * Math.max(1, characters.length);
      state.interval = window.setTimeout(
        consumeNextWord,
        Math.max(0, wordDuration - elapsed)
      );
    };

    chompCharacter();
  };

  consumeNextWord();
}

window.MarkSetGoModules = window.MarkSetGoModules || {};
window.MarkSetGoModules['pacman-mode'] = {
  loaded: true,
  version: '7.2.2'
};
