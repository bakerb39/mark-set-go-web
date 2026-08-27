'use strict';

const fs = require('node:fs');
const path = require('node:path');

const indexPath = path.join(__dirname, 'public', 'index.html');

function replaceAssetVersion(content, asset, version) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`/${escaped}(?:\\?v=[^"'\\s>]+)?`, 'g');
  return content.replace(pattern, `/${asset}?v=${version}`);
}


function ensureAfterAsset(content, asset, tag) {
  if (content.includes(tag.match(/src="([^"]+)"/)?.[1] || tag)) return content;
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^[\\t ]*<script[^>]+src="/${escaped}(?:\\?v=[^"]+)?[^>]*></script>[\\t ]*$)`, 'm');
  return content.replace(pattern, `$1\n${tag}`);
}


function ensureBeforeClosingTag(content, closingTag, tag) {
  if (content.includes(tag)) return content;
  return content.replace(closingTag, `${tag}\n${closingTag}`);
}

let index = fs.readFileSync(indexPath, 'utf8');
const before = index;

index = replaceAssetVersion(
  index,
  'page-theme-polish.css',
  '20260825-v1.0.8-reader-exact'
);

index = replaceAssetVersion(
  index,
  'app.js',
  '20260825-v2.7.3-home-dismiss-hard'
);

index = replaceAssetVersion(
  index,
  'topic-feeds.js',
  '20260827-v2.5.10-workspace-read-anything'
);


index = ensureAfterAsset(
  index,
  'read-anything.js',
  '  <script defer src="/read-with-mark-extension-fallback.js?v=20260827-v0.1.1-html-cleanup"></script>'
);


index = ensureBeforeClosingTag(
  index,
  '</head>',
  '  <link rel="stylesheet" href="/read-with-mark-extension-install-ui.css?v=20260827-v0.1.1">'
);

index = ensureAfterAsset(
  index,
  'read-with-mark-extension-fallback.js',
  '  <script defer src="/read-with-mark-extension-install-ui.js?v=20260827-v0.1.1"></script>'
);

if (index !== before) {
  fs.writeFileSync(indexPath, index, 'utf8');
  console.log('ui cache: direct Topic Feed ceiling and Home dismissal assets current');
} else {
  console.log('ui cache: direct UI asset URLs already current');
}
