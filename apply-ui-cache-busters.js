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

/* Preserve current direct-owner versions. */
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
  '20260826-v1.2.3-reader-launch-owner'
);

index = replaceAssetVersion(
  index,
  'media-player-launch-polish.js',
  '20260826-v1.1.0-label-only'
);


index = replaceAssetVersion(
  index,
  'ask-mark-window.css',
  '20260826-v1.1.1-desktop-bounds-buttons-kept'
);

index = replaceAssetVersion(
  index,
  'ask-mark-window.js',
  '20260826-v1.1.1-desktop-bounds-buttons-kept'
);

index = replaceAssetVersion(
  index,
  'desktop-workspace.js',
  '20260826-v1.0.5-menu-layout-only'
);

index = replaceAssetVersion(
  index,
  'desktop-workspace-compact.css',
  '20260826-v1.1.1-menu-layout-only'
);

/* Stability rollback:
   Keep the asset slots so old runtime-injected tags get a NEW cache URL,
   but load a disabled/no-reparent implementation instead of Phase 2. */
index = replaceAssetVersion(
  index,
  'ask-mark-desktop.css',
  '20260826-v2.2.0-disabled-stability'
);

index = replaceAssetVersion(
  index,
  'ask-mark-desktop.js',
  '20260826-v2.2.0-disabled-stability'
);

/* Other additive UI assets remain unchanged. */
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
  '<link href="/desktop-workspace-compact.css?v=20260826-v1.1.1-menu-layout-only" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-window.css',
  '<link href="/ask-mark-popout-controller.css?v=20260826-v1.1.0-popout-exclusive" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-window.css',
  '<link href="/ask-mark-desktop.css?v=20260826-v2.2.0-disabled-stability" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-window.js',
  '  <script defer src="/ask-mark-popout-controller.js?v=20260826-v1.1.0-popout-exclusive"></script>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-window.js',
  '  <script defer src="/ask-mark-desktop.js?v=20260826-v2.2.0-disabled-stability"></script>'
);

if (index !== before) {
  fs.writeFileSync(indexPath, index, 'utf8');
  console.log('ui cache: Ask Mark Desktop bridge disabled for stability');
} else {
  console.log('ui cache: Ask Mark Desktop stability rollback already current');
}
