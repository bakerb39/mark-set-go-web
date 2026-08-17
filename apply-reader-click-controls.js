'use strict';

/*
 * Mark, Set, Go! — Reader click-controls patch
 *
 * Purpose:
 *   Adds a persistent "Reader clicks: On/Off" control beside Start/Pause/Reset.
 *   When Off, clicks/taps in the reading canvas cannot start, resume, pause,
 *   or move the playback position.
 *
 * Preserved behavior:
 *   - Start / Pause / Reset buttons still work.
 *   - Spacebar behavior is unchanged.
 *   - Scrolling is unchanged.
 *   - Text selection / Ask companion selection flow is unchanged.
 *   - Translated-word lookup remains clickable.
 *   - No MutationObserver is added.
 *
 * Run from the repository root:
 *   node apply-reader-click-controls.js
 */

const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'public', 'app.js');

if (!fs.existsSync(target)) {
  console.error(`Could not find ${target}`);
  process.exit(1);
}

let source = fs.readFileSync(target, 'utf8');

if (source.includes("const READER_CLICK_CONTROLS_KEY = 'msg_reader_click_controls_v1';")) {
  console.log('Reader click controls are already installed. No changes made.');
  process.exit(0);
}

function replaceOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first < 0) {
    console.error(`PATCH STOPPED: could not find the expected ${label} block.`);
    console.error('No file was changed. This protects newer Reader code from an unsafe replacement.');
    process.exit(2);
  }
  const second = source.indexOf(before, first + before.length);
  if (second >= 0) {
    console.error(`PATCH STOPPED: found more than one ${label} block.`);
    console.error('No file was changed because the target was ambiguous.');
    process.exit(3);
  }
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  'renderReaderWithText start',
`function renderReaderWithText(title, text, source = { type: 'text' }) {
  app.dataset.viewKey = 'reader';
  const bookModel = new BookModel({ title, text, source, tokenizer: splitWords });`,
`function renderReaderWithText(title, text, source = { type: 'text' }) {
  app.dataset.viewKey = 'reader';

  // Reader-surface click controls are intentionally separate from the explicit
  // Start / Pause / Reset buttons. Turning this off creates a passive reading
  // canvas while leaving deliberate button controls available.
  const READER_CLICK_CONTROLS_KEY = 'msg_reader_click_controls_v1';
  let readerClickControlsEnabled = true;
  try {
    readerClickControlsEnabled = localStorage.getItem(READER_CLICK_CONTROLS_KEY) !== 'off';
  } catch {}

  const bookModel = new BookModel({ title, text, source, tokenizer: splitWords });`
);

replaceOnce(
  'playback controls',
`      <div class="controls playback-controls">
        <button id="start-reader" class="primary">Start</button>
        <button id="pause-reader" class="secondary" disabled>Pause</button>
        <button id="reset-reader" class="secondary">Reset</button>
        <span id="reader-status" class="status">\${state.words.length.toLocaleString()} words loaded. Click a word to continue from there; click empty space or press Space to pause or resume.</span>
      </div>`,
`      <div class="controls playback-controls">
        <button id="start-reader" class="primary">Start</button>
        <button id="pause-reader" class="secondary" disabled>Pause</button>
        <button id="reset-reader" class="secondary">Reset</button>
        <button
          id="reader-click-controls"
          class="secondary"
          type="button"
          aria-pressed="\${readerClickControlsEnabled ? 'true' : 'false'}"
          title="Allow clicks in the reading area to start, resume, pause, or move the reading position."
        >Reader clicks: \${readerClickControlsEnabled ? 'On' : 'Off'}</button>
        <span id="reader-status" class="status">\${state.words.length.toLocaleString()} words loaded. \${readerClickControlsEnabled ? 'Click a word to continue from there; click empty space or press Space to pause or resume.' : 'Reader click controls are off. Use Start, Pause, or Reset when needed.'}</span>
      </div>`
);

replaceOnce(
  'Reader click-control binding',
`  document.addEventListener('keydown', state.spacebarHandler);

  readerFrame.addEventListener('click', (event) => {`,
`  document.addEventListener('keydown', state.spacebarHandler);

  const readerClickControlsButton = app.querySelector('#reader-click-controls');
  const syncReaderClickControlsButton = () => {
    if (!readerClickControlsButton) return;
    readerClickControlsButton.textContent = \`Reader clicks: \${readerClickControlsEnabled ? 'On' : 'Off'}\`;
    readerClickControlsButton.setAttribute('aria-pressed', String(readerClickControlsEnabled));
    readerClickControlsButton.title = readerClickControlsEnabled
      ? 'Reader clicks can start, resume, pause, or move the reading position.'
      : 'Reader clicks are passive. Use the Start, Pause, and Reset buttons when wanted.';
  };
  readerClickControlsButton?.addEventListener('click', () => {
    readerClickControlsEnabled = !readerClickControlsEnabled;
    try {
      localStorage.setItem(READER_CLICK_CONTROLS_KEY, readerClickControlsEnabled ? 'on' : 'off');
    } catch {}
    syncReaderClickControlsButton();
    updateReaderStatus(
      readerClickControlsEnabled
        ? 'Reader click controls are on.'
        : 'Reader click controls are off. Reading-area clicks will not start, resume, pause, or seek.'
    );
  });
  syncReaderClickControlsButton();

  readerFrame.addEventListener('click', (event) => {`
);

replaceOnce(
  'Reader canvas playback gate',
`    const translatedWord = target.closest('.translated-word');
    if (translatedWord && state.language !== 'en') {
      handleTranslatedWordClick(event);
      return;
    }

    const clickedWord = target.closest('.reader-word[data-index]');`,
`    const translatedWord = target.closest('.translated-word');
    if (translatedWord && state.language !== 'en') {
      handleTranslatedWordClick(event);
      return;
    }

    // Passive-reading mode: preserve selection, scrolling, translation lookup,
    // annotations, and explicit controls, but do not let the reading canvas
    // itself start/resume/pause playback or seek to a clicked word.
    if (!readerClickControlsEnabled) return;

    const clickedWord = target.closest('.reader-word[data-index]');`
);

const backup = target + '.before-reader-click-controls';
if (!fs.existsSync(backup)) {
  fs.copyFileSync(target, backup);
}

fs.writeFileSync(target, source, 'utf8');

console.log('Updated public/app.js successfully.');
console.log(`Backup: ${backup}`);
console.log('Added: Reader clicks On/Off beside Start / Pause / Reset.');
console.log('No MutationObserver was added.');
