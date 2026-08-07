const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const protectedFiles = [
  'public/reader/BookModel.js',
  'public/reader/SessionManager.js',
  'public/reader/ReaderEngine.js',
  'public/reader/VirtualRenderer.js',
  'public/reader/ReaderInteractions.js'
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
}

const checksumPath = path.join(root, 'PROTECTED-READER-SHA256.txt');
const expected = new Map(
  fs.readFileSync(checksumPath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => {
    const m = line.match(/^([a-f0-9]{64})\s+(.+)$/);
    if (!m) throw new Error(`Invalid checksum line: ${line}`);
    return [m[2], m[1]];
  })
);

for (const file of protectedFiles) {
  assert(expected.has(file), `Protected checksum missing for ${file}`);
  assert.strictEqual(sha256(file), expected.get(file), `Protected reader file changed: ${file}`);
}

// Load pure interaction contract helpers in Node. Element is needed only when
// shouldHandleSpacebar receives a DOM target; these tests intentionally use null targets.
global.Element = class Element {};
const interactions = require(path.join(root, 'public/reader/ReaderInteractions.js'));

assert.strictEqual(interactions.classifyReaderClick({ mode: 'highlight' }), 'toggle-playback', 'Blank reader click must toggle playback.');
assert.strictEqual(interactions.classifyReaderClick({ mode: 'two-column' }), 'toggle-playback', 'Blank click contract must not silently disappear by mode.');
assert.strictEqual(interactions.classifyReaderClick({ clickedWordIndex: 42, mode: 'highlight' }), 'seek-word', 'Word click in Highlight must seek.');
assert.strictEqual(interactions.classifyReaderClick({ clickedWordIndex: 42, mode: 'bold-focus' }), 'seek-word', 'Word click in Bold Focus must seek.');
assert.strictEqual(interactions.classifyReaderClick({ translatedWord: true, clickedWordIndex: 42, mode: 'highlight' }), 'translated-word', 'Translated-word action must take precedence.');
assert.strictEqual(interactions.shouldHandleSpacebar({ code: 'Space', repeat: false, altKey: false, ctrlKey: false, metaKey: false, target: null }, { readerPresent: true, mode: 'highlight' }), true, 'Spacebar must toggle in normal reader modes.');
assert.strictEqual(interactions.shouldHandleSpacebar({ code: 'Space', repeat: false, altKey: false, ctrlKey: false, metaKey: false, target: null }, { readerPresent: true, mode: 'two-column' }), false, 'Spacebar remains disabled in two-column mode.');

const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
assert(app.includes('window.ReaderInteractions.install({'), 'app.js must delegate protected interactions to ReaderInteractions.');
assert(!app.includes("reader.addEventListener('click', (event) => {\n    const translatedWord"), 'Protected bubble click handler must not be reimplemented in app.js.');

console.log('Protected reader contract audit passed.');
