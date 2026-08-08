const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const checks = [
  ['right-click live menu guard', () => read('app.js').includes('__msgDictionaryOutsideCloseInstalled')],
  ['first-person reading status', () => read('app.js').includes('I’m reading this…') && !read('app.js').includes('Ask Mark is reading the selection…')],
  ['safe companion has no MutationObserver', () => !read('companion-persona-safe.js').includes('MutationObserver')],
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
