#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();

function read(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`Missing ${file}. Run this from the mark-set-go-web repository root.`);
  return fs.readFileSync(full, 'utf8');
}
function write(file, content) {
  fs.writeFileSync(path.join(root, file), content, 'utf8');
}
function copy(name, target) {
  fs.copyFileSync(path.join(__dirname, name), path.join(root, target));
}
function insertOnce(text, marker, insertion, label) {
  if (text.includes(insertion.trim())) return text;
  const at = text.indexOf(marker);
  if (at < 0) throw new Error(`Could not find ${label} marker.`);
  return text.slice(0, at) + insertion + text.slice(at);
}

copy('topic-feeds.js', 'public/topic-feeds.js');
copy('topic-feeds.css', 'public/topic-feeds.css');

for (const htmlFile of ['public/index.html']) {
  let html = read(htmlFile);

  if (!html.includes('/topic-feeds.css')) {
    html = insertOnce(
      html,
      '<link href="/theme-system.css',
      '<link rel="stylesheet" href="/topic-feeds.css?v=1.0.0-topic-feeds-beta">\n',
      'stylesheet'
    );
  }

  if (!html.includes('/topic-feeds.js')) {
    html = insertOnce(
      html,
      '<script defer src="/mobile-simple.js',
      '  <script defer src="/topic-feeds.js?v=1.0.0-topic-feeds-beta"></script>\n',
      'script'
    );
  }

  if (!html.includes('data-action="topic-feeds"')) {
    const anchor = '  <button data-read="upload" type="button" role="menuitem">';
    const insertion = `  <button data-action="topic-feeds" type="button" role="menuitem">
    <span class="menu-icon icon-reading">☰</span>
    <span class="menu-copy"><strong>Topic Feeds</strong><small>Daily or weekly articles from sources you choose</small></span>
  </button>

`;
    html = insertOnce(html, anchor, insertion, 'My Library / Read Anything');
  }

  write(htmlFile, html);
}

let server = read('server.js');
if (!server.includes("app.post('/api/topic-feeds/fetch'")) {
  const patch = fs.readFileSync(path.join(__dirname, 'server-topic-feeds.patch.js'), 'utf8').trim() + '\n\n';
  const markers = [
    "app.listen(PORT",
    "const server = app.listen",
    "checkDatabase().then",
    "process.on('SIGTERM'"
  ];
  let marker = markers.find((candidate) => server.includes(candidate));
  if (!marker) {
    throw new Error('Could not locate the server startup marker. Add server-topic-feeds.patch.js above the server startup block manually.');
  }
  server = insertOnce(server, marker, patch, 'server startup');
  write('server.js', server);
}

console.log('Topic Feeds beta applied.');
console.log('Changed: public/index.html, server.js');
console.log('Added: public/topic-feeds.js, public/topic-feeds.css');
console.log('Reader core files were not changed.');
