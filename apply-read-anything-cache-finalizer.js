'use strict';

const fs = require('node:fs');
const path = require('node:path');

const indexPath = path.join(__dirname, 'public', 'index.html');
const version = '20260827-v2.5.10-rwm-native-final';

let index = fs.readFileSync(indexPath, 'utf8');
const pattern = /\/read-anything\.js(?:\?v=[^"'\s>]+)?/g;

if (!pattern.test(index)) {
  throw new Error('Read Anything cache finalizer could not locate /read-anything.js in public/index.html');
}

pattern.lastIndex = 0;
const next = index.replace(pattern, `/read-anything.js?v=${version}`);

if (next !== index) {
  fs.writeFileSync(indexPath, next, 'utf8');
  console.log(`read anything: final browser cache key -> ${version}`);
} else {
  console.log(`read anything: final browser cache key already ${version}`);
}
