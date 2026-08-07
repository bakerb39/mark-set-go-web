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
  'public/reader/ReaderLegacyRuntime.js'
];
const WORKING_MONOLITH_HASH = 'fccb0da5923ab16c72bf734ea5bf94a2232ada40d5bc10901f4bad0399412968';

function hashBuffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function sha256(rel) {
  return hashBuffer(fs.readFileSync(path.join(root, rel)));
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

const app = read('public/app.js');
const runtime = read('public/reader/ReaderLegacyRuntime.js');
const anchor = 'function splitTranslationChunks(text, maxChars = 3500) {';
const anchorIndex = app.indexOf(anchor);
assert(anchorIndex >= 0, 'Could not find extraction reinsertion anchor in app.js.');
const reconstructed = app.slice(0, anchorIndex) + runtime + app.slice(anchorIndex);
assert.strictEqual(hashBuffer(Buffer.from(reconstructed)), WORKING_MONOLITH_HASH,
  'Extracted app.js + ReaderLegacyRuntime.js no longer reconstruct the exact working reader baseline.');

const index = read('public/index.html');
const runtimePos = index.indexOf('/reader/ReaderLegacyRuntime.js');
const appPos = index.indexOf('/app.js');
assert(runtimePos >= 0, 'ReaderLegacyRuntime.js is not loaded.');
assert(appPos >= 0, 'app.js is not loaded.');
assert(runtimePos < appPos, 'ReaderLegacyRuntime.js must load before app.js.');
assert(!index.includes('ReaderInteractions.js'), 'Experimental ReaderInteractions.js must not be loaded.');

// Explicit invariants in the exact extracted source.
assert(runtime.includes("reader.addEventListener('click', (event) => {"), 'Working reader click handler is missing.');
assert(runtime.includes('state.spacebarHandler = (event) => {'), 'Working reader spacebar handler is missing.');
assert(runtime.includes('function pauseReader() {'), 'pauseReader() is missing.');
assert(runtime.includes('function startReader() {'), 'startReader() is missing.');
assert(runtime.includes('function goToBookSpread('), 'Book Pages navigation is missing.');
assert(runtime.includes('function restoreCapturedReaderLocation('), 'Reader location restoration is missing.');

console.log('Protected reader exact-extraction audit passed.');
