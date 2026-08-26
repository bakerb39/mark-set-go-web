'use strict';

const fs = require('node:fs');
const path = require('node:path');

const indexPath = path.join(__dirname, 'public', 'index.html');

function replaceAssetVersion(content, asset, version) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`/${escaped}(?:\\?v=[^"'\\s>]+)?`, 'g');
  const next = `/${asset}?v=${version}`;
  return content.replace(pattern, next);
}

function ensureHeadAsset(content, asset, version, tag) {
  const url = `/${asset}?v=${version}`;

  if (content.includes(`/${asset}`)) {
    return replaceAssetVersion(content, asset, version);
  }

  if (!/<\/head>/i.test(content)) {
    throw new Error(`ui cache: cannot install ${asset}; </head> was not found`);
  }

  return content.replace(/<\/head>/i, `  ${tag.replace('__URL__', url)}\n</head>`);
}

let index = fs.readFileSync(indexPath, 'utf8');
const before = index;

/* Preserve the already-established page-close cache busts. */
index = replaceAssetVersion(
  index,
  'page-theme-polish.css',
  '20260825-v1.0.8-reader-exact'
);

index = replaceAssetVersion(
  index,
  'app.js',
  '20260825-v2.7.2-page-close-local'
);

/* Topic Feed: presentation-only mask loaded late so it wins over older feed
   header styles without replacing topic-feeds.css/header-stability.css. */
index = ensureHeadAsset(
  index,
  'topic-feed-top-mask.css',
  '20260825-v1.0.0-top-edge-mask',
  '<link rel="stylesheet" href="__URL__">'
);

/* Home: capture-phase close ownership loaded as a small additive guard. */
index = ensureHeadAsset(
  index,
  'home-close-guard.js',
  '20260825-v1.0.0-dismiss-only',
  '<script defer src="__URL__"></script>'
);

if (index !== before) {
  fs.writeFileSync(indexPath, index, 'utf8');
  console.log('ui cache: refreshed page-close assets and installed Topic Feed/Home guards');
} else {
  console.log('ui cache: UI asset URLs and guards already current');
}
