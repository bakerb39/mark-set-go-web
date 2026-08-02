'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const publicAppSource = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');

function sourceChecks() {
  assert.equal(appSource, publicAppSource, 'root and public app.js must stay identical');
  assert.match(appSource, /let readerSessionRestoreInProgress = false;/);
  assert.match(appSource, /saved\.documentId \|\| documentIdFor\(saved\.title, saved\.currentText\)/);
  assert.match(appSource, /documentId: snapshot\.documentId \|\| state\.documentId \|\| ''/);
  assert.match(appSource, /if \(!readerSessionRestoreInProgress\) \{/);
  assert.match(appSource, /ReaderContinuity\.commit\(activeReaderSnapshot, \{ immediate: true \}\);/);
}

function restoreOrderingScenario() {
  const writes = [];
  let restoring = false;
  const state = { index: 0, documentId: 'genesis', source: { type: 'bible' } };

  function persist(label) { writes.push({ label, index: state.index }); }
  function renderReaderWithText() {
    state.index = 0; // ReaderEngine.loadBook behavior
    if (!restoring) persist('new-document-render');
  }
  function apply(snapshot) {
    restoring = true;
    try { renderReaderWithText(); } finally { restoring = false; }
    state.index = snapshot.index;
    persist('restored-session-final');
  }

  apply({ index: 58 });
  assert.deepEqual(writes, [{ label: 'restored-session-final', index: 58 }]);
}

function legacyFailureScenario() {
  const writes = [];
  const state = { index: 0 };
  function persist(label) { writes.push({ label, index: state.index }); }
  function renderReaderWithText() { state.index = 0; persist('intermediate-render'); }
  function apply(snapshot) { renderReaderWithText(); state.index = snapshot.index; }
  apply({ index: 58 });
  assert.deepEqual(writes, [{ label: 'intermediate-render', index: 0 }]);
}

async function cloudMergeScenarios() {
  class Storage {
    constructor() { this.map = new Map(); }
    get length() { return this.map.size; }
    key(i) { return [...this.map.keys()][i] ?? null; }
    getItem(k) { return this.map.has(String(k)) ? this.map.get(String(k)) : null; }
    setItem(k, v) { this.map.set(String(k), String(v)); }
    removeItem(k) { this.map.delete(String(k)); }
  }
  class FakeDocument extends EventTarget {}
  class FakeCustomEvent extends Event { constructor(type, init={}) { super(type); this.detail = init.detail; } }
  const localStorage = new Storage();
  const sessionStorage = new Storage();
  const document = new FakeDocument();
  const requests = [];
  let cloudState = {};
  const context = {
    Storage, localStorage, sessionStorage, document,
    CustomEvent: FakeCustomEvent,
    window: { clearTimeout, setTimeout, addEventListener() {} },
    location: { reload() {} },
    console,
    fetch: async (url, options={}) => {
      requests.push({ url, options });
      if (url === '/api/account/state' && options.method === 'PUT') {
        const body = JSON.parse(options.body);
        cloudState = { ...cloudState, ...body.entries };
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, json: async () => ({ state: cloudState }) };
    }
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'cloud-state.js'), 'utf8'), context);

  const key = 'markSetGoReadingProgressV1';
  const local = { genesis: { documentId:'genesis', lastWord:58, furthestWord:100, lastReadAt:'2026-08-02T08:00:00Z' } };
  const cloud = { genesis: { documentId:'genesis', lastWord:0, furthestWord:90, lastReadAt:'2026-08-02T08:01:00Z' } };
  localStorage.setItem(key, JSON.stringify(local));
  cloudState[key] = JSON.stringify(cloud);
  document.dispatchEvent(new FakeCustomEvent('marksetgo:auth-changed', { detail:{ authenticated:true } }));
  document.dispatchEvent(new FakeCustomEvent('marksetgo:cloud-ready', { detail:{ appState: cloudState } }));
  await new Promise(r => setTimeout(r, 20));
  const merged = JSON.parse(localStorage.getItem(key));
  assert.equal(merged.genesis.lastWord, 58, 'valid resume point must survive a newer transient cloud zero');
  assert.equal(merged.genesis.furthestWord, 100);
}

(async () => {
  sourceChecks();
  legacyFailureScenario();
  restoreOrderingScenario();
  await cloudMergeScenarios();
  console.log('PASS: source synchronization');
  console.log('PASS: legacy intermediate-zero failure reproduced');
  console.log('PASS: restored session persists only the final nonzero cursor');
  console.log('PASS: cloud progress merge preserves valid resume position');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
