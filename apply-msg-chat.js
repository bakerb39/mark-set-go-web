'use strict';

/*
 * Run once from the mark-set-go-web repository root:
 *
 *   node apply-msg-chat.js
 *
 * It makes timestamped backups before editing server.js and public/index.html.
 * The actual chat implementation lives in separate files.
 */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const serverPath = path.join(root, 'server.js');
const indexPath = path.join(root, 'public', 'index.html');

function fail(message) {
  console.error(`\nMark, Set, Go! Chat installer: ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(serverPath) || !fs.existsSync(indexPath)) {
  fail('Run this script from the mark-set-go-web repository root.');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
for (const file of [serverPath, indexPath]) {
  fs.copyFileSync(file, `${file}.before-msg-chat-${stamp}.bak`);
}

let server = fs.readFileSync(serverPath, 'utf8');
let index = fs.readFileSync(indexPath, 'utf8');

const requireLine = "const installMarkSetGoChat = require('./msg-chat-routes');";
if (!server.includes(requireLine)) {
  const anchor = "const { pool, checkDatabase, databaseConfigured, closeDatabase, query } = require('./db');";
  if (!server.includes(anchor)) fail('Could not find the database import in server.js.');
  server = server.replace(anchor, `${anchor}\n${requireLine}`);
}

const installLine = "installMarkSetGoChat(app, { query, databaseConfigured });";
if (!server.includes(installLine)) {
  const catchAll = "app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));";
  if (!server.includes(catchAll)) fail('Could not find the final app.get(*) route in server.js.');
  server = server.replace(catchAll, `${installLine}\n\n${catchAll}`);
}

const cssLink = '<link rel="stylesheet" href="/msg-chat.css?v=1.0.0">';
if (!index.includes(cssLink)) {
  const cssAnchor = '<link href="/explorer-visual-designer.css?v=2.2.3-draggable-panel" rel="stylesheet"/>';
  if (index.includes(cssAnchor)) index = index.replace(cssAnchor, `${cssAnchor}\n${cssLink}`);
  else index = index.replace('</head>', `${cssLink}\n</head>`);
}

const jsScript = '<script defer src="/msg-chat.js?v=1.0.0"></script>';
if (!index.includes(jsScript)) {
  index = index.replace('</head>', `  ${jsScript}\n</head>`);
}

const chatButton = '<button class="top-level-nav-button" data-action="msg-chat" type="button"><span class="nav-icon" aria-hidden="true">◫</span> Chat</button>';
if (!index.includes('data-action="msg-chat"')) {
  const profileButton = '<button class="top-level-nav-button" data-action="profile-preferences" type="button"><span class="nav-icon" aria-hidden="true">◉</span> Profile</button>';
  if (!index.includes(profileButton)) fail('Could not find the Profile menu button in public/index.html.');
  index = index.replace(profileButton, `${chatButton}\n\n${profileButton}`);
}

/* Themes are intentionally left in Profile. If an old top-level Themes button
   exists, remove only that button/details element without touching Profile. */
index = index.replace(/\n?<button[^>]*data-action="(?:theme|themes|theme-picker|experience-themes)"[^>]*>[\s\S]*?<\/button>\n?/gi, '\n');

fs.writeFileSync(serverPath, server, 'utf8');
fs.writeFileSync(indexPath, index, 'utf8');

console.log('Mark, Set, Go! Chat installed into this repository.');
console.log('Backups were created beside server.js and public/index.html.');
console.log('Next: npm run check (if available) or node --check server.js && node --check public/msg-chat.js');
