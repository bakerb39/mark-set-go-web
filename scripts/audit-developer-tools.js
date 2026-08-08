const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const checks = [
  ['right-click live menu guard', () => read('app.js').includes('__msgDictionaryOutsideCloseInstalled')],
  ['first-person reading status', () => read('app.js').includes('I’m reading this…') && !read('app.js').includes('Ask Mark is reading the selection…')],
  ['active companion modules have no MutationObserver', () => !read('companion-persona-safe.js').includes('MutationObserver') && !read('ask-mark-hub.js').includes('MutationObserver')],
  ['deprecated observer companion is not loaded', () => !read('index.html').includes('src="/companion-persona.js') && !read('public/index.html').includes('src="/companion-persona.js')],
  ['dictionary action has one execution path', () => read('app.js').includes('__msgDictionaryDelegationInstalled') && !read('app.js').includes("menu.addEventListener('pointerup'")],
  ['companion response sync is explicit-event driven', () => read('app.js').includes('marksetgo:askmark-legacy-updated') && read('ask-mark-hub.js').includes('marksetgo:askmark-legacy-updated')],
  ['debug route exists', () => read('developer-tools.js').includes("params.has('debug')")],
  ['features route exists', () => read('developer-tools.js').includes("params.has('features')")],
  ['page help knowledge exists', () => read('app-help-knowledge.js').includes('MarkSetGoPageHelpKnowledge')],
  ['formatter CSS exists', () => read('read-anything.css').includes('.smart-format-heading')]
];
let failed = 0;
for (const [name, fn] of checks) {
  let ok = false; try { ok = !!fn(); } catch {}
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++;
}
if (failed) process.exit(1);
