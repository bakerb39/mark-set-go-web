'use strict';

const fs = require('node:fs');
const path = require('node:path');

const indexPath = path.join(__dirname, 'public', 'index.html');

function replaceAssetVersion(content, asset, version) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`/${escaped}(?:\\?v=[^"'\\s>]+)?`, 'g');
  return content.replace(pattern, `/${asset}?v=${version}`);
}

function ensureAfterAsset(content, anchorAsset, html) {
  if (content.includes(html.match(/\/([^?"']+)/)?.[0] || '__never__')) return content;

  const escaped = anchorAsset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const linkPattern = new RegExp(
    `(<link[^>]+href=["'][^"']*/${escaped}(?:\\?[^"']*)?["'][^>]*>)`,
    'i'
  );
  const scriptPattern = new RegExp(
    `(<script[^>]+src=["'][^"']*/${escaped}(?:\\?[^"']*)?["'][^>]*><\\/script>)`,
    'i'
  );

  if (linkPattern.test(content)) {
    return content.replace(linkPattern, `$1\n${html}`);
  }
  if (scriptPattern.test(content)) {
    return content.replace(scriptPattern, `$1\n${html}`);
  }
  throw new Error(`ui cache: could not locate anchor asset ${anchorAsset}`);
}

let index = fs.readFileSync(indexPath, 'utf8');
const before = index;

/* Preserve the current direct-owner cache versions. */
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
  '20260825-v2.5.7-boundary-gap-1px'
);

index = replaceAssetVersion(
  index,
  'media-panel.js',
  '20260826-v1.2.2-beside-reader-layout'
);

/* Phase 2 Reading Companion Desktop bridge.
   Loaded after Phase 1 Ask Mark window assets and after Desktop Workspace. */
index = ensureAfterAsset(
  index,
  'topic-feeds.css',
  '<link href="/topic-feed-title-stability.css?v=20260826-v1.0.0-first-paint" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'read-anything.js',
  '  <script defer src="/topic-feed-title-stability.js?v=20260826-v1.0.0-first-paint"></script>'
);

index = ensureAfterAsset(
  index,
  'desktop-workspace.css',
  '<link href="/desktop-workspace-compact.css?v=20260826-v1.0.0-compact-toolbar" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-window.css',
  '<link href="/ask-mark-desktop.css?v=20260826-v2.0.2-live-companion" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-window.js',
  '  <script defer src="/ask-mark-desktop.js?v=20260826-v2.0.2-live-companion"></script>'
);

if (index !== before) {
  fs.writeFileSync(indexPath, index, 'utf8');
  console.log('ui cache: Reading Companion Desktop Phase 2 assets installed');
} else {
  console.log('ui cache: Reading Companion Desktop Phase 2 assets already current');
}
