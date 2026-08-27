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

/*
  IMPORTANT:
  There is intentionally NO patchAskMarkHubArticleOwner() here.

  ask-mark-hub.js already owns the correct routing rule:
    highlighted passage -> selection
    no highlight        -> whole article

  The prior startup patch forced article questions to whole-article context and
  created a second behavior owner. This version leaves the Hub source intact.
*/

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
  'ask-mark-hub.js',
  '20260826-v9.6.11-selection-first-owner'
);

index = replaceAssetVersion(
  index,
  'user-settings.js',
  '20260826-v1.3.0-reader-workspace'
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
  'media-toolbar-responsive.css',
  '20260826-v1.0.0-toolbar-wrap'
);

index = replaceAssetVersion(
  index,
  'ask-mark-window.css',
  '20260826-v1.5.3-white-companion-title'
);

index = replaceAssetVersion(
  index,
  'ask-mark-window.js',
  '20260826-v1.5.2-conversation-scroll-geometry'
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

index = replaceAssetVersion(
  index,
  'ask-mark-article-mode.css',
  '20260826-v1.2.0-conversation-first'
);

index = replaceAssetVersion(
  index,
  'ask-mark-article-mode.js',
  '20260826-v1.2.1-canonical-selection-clear'
);

index = replaceAssetVersion(
  index,
  'ask-mark-popout-controller.js',
  '20260826-v1.4.0-live-scope'
);

index = replaceAssetVersion(
  index,
  'workspace-profile-setting.css',
  '20260826-v1.0.0-reader-workspace'
);

index = replaceAssetVersion(
  index,
  'workspace-profile-setting.js',
  '20260826-v1.0.0-reader-workspace'
);

index = replaceAssetVersion(
  index,
  'read-with-mark-extension-fallback.js',
  '20260826-v0.1.0-extension-first'
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
  'media-panel.css',
  '<link href="/media-toolbar-responsive.css?v=20260826-v1.0.0-toolbar-wrap" rel="stylesheet"/>'
);

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
  'read-anything.js',
  '  <script defer src="/read-with-mark-extension-fallback.js?v=20260826-v0.1.0-extension-first"></script>'
);

index = ensureAfterAsset(
  index,
  'desktop-workspace.css',
  '<link href="/desktop-workspace-compact.css?v=20260826-v1.1.1-menu-layout-only" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'user-settings.css',
  '<link href="/workspace-profile-setting.css?v=20260826-v1.0.0-reader-workspace" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-window.css',
  '<link href="/ask-mark-article-mode.css?v=20260826-v1.2.0-conversation-first" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-window.css',
  '<link href="/ask-mark-popout-controller.css?v=20260826-v1.2.1-always-typeable" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-window.css',
  '<link href="/ask-mark-desktop.css?v=20260826-v2.2.0-disabled-stability" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'user-settings.js',
  '  <script defer src="/workspace-profile-setting.js?v=20260826-v1.0.0-reader-workspace"></script>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-window.js',
  '  <script defer src="/ask-mark-article-mode.js?v=20260826-v1.2.1-canonical-selection-clear"></script>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-article-mode.js',
  '  <script defer src="/ask-mark-popout-controller.js?v=20260826-v1.4.0-live-scope"></script>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-window.js',
  '  <script defer src="/ask-mark-desktop.js?v=20260826-v2.2.0-disabled-stability"></script>'
);

if (index !== before) {
  fs.writeFileSync(indexPath, index, 'utf8');
  console.log('ui cache: Ask Beth + Read with Mark extension fallback current');
} else {
  console.log('ui cache: UI assets already current');
}
