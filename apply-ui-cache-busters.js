'use strict';

const fs = require('node:fs');
const path = require('node:path');

const indexPath = path.join(__dirname, 'public', 'index.html');

const readAnythingPath = path.join(__dirname, 'public', 'read-anything.js');

function patchReadAnythingExtensionUi() {
  let source = fs.readFileSync(readAnythingPath, 'utf8');
  const before = source;

  const legacyCard = `          <section class="read-anything-card">
            <span class="read-anything-icon">🔖</span><h2>Read with Mark</h2><p>Import a full webpage, or highlight a passage first to send only the selection.</p>
            <button id="read-anything-bookmarklet" class="secondary" type="button">Show Bookmarklet</button>
          </section>`;

  const extensionFirstCards = `          <section class="read-anything-card read-anything-extension-card" id="read-anything-extension-card">
            <span class="read-anything-icon">🧩</span><h2>Read with Mark Extension</h2><p><strong>Recommended.</strong> Automatically recover readable full articles when the normal import cannot retrieve them.</p>
            <div class="read-anything-extension-status" id="read-anything-extension-status" data-state="checking">Checking extension…</div>
            <button id="read-anything-extension-setup" class="secondary" type="button">Install Extension</button>
          </section>
          <section class="read-anything-card">
            <span class="read-anything-icon">🔖</span><h2>Read with Mark Bookmarklet</h2><p><strong>Manual fallback.</strong> Open any webpage and send the full page, or highlight a passage first to send only that selection.</p>
            <button id="read-anything-bookmarklet" class="secondary" type="button">Show Bookmarklet</button>
          </section>`;

  if (source.includes(legacyCard)) {
    source = source.replace(legacyCard, extensionFirstCards);
  } else if (!source.includes('id="read-anything-extension-card"')) {
    throw new Error('ui cache: could not locate the native Read with Mark card in public/read-anything.js');
  }

  const legacyBookmarkletWorkspace =
    'workspace.innerHTML = `<h2>Install “Read with Mark”</h2><p>Drag this button to your bookmarks bar. Highlight text before clicking it to capture only that passage; otherwise it imports the full page. On iPhone Safari, create a bookmark and replace its address with the code below.</p><p><a class="primary button-link" href="${escapeHtml(code)}">Read with Mark</a></p><label>Bookmark address<textarea id="bookmarklet-code" rows="6" readonly>${escapeHtml(code)}</textarea></label>`;';

  const updatedBookmarkletWorkspace =
    'workspace.innerHTML = `<h2>Read with Mark Bookmarklet</h2><p><strong>Manual fallback:</strong> use the bookmarklet when the extension is not installed or automatic recovery cannot retrieve a publisher page. Drag this button to your bookmarks bar. Highlight text before clicking it to capture only that passage; otherwise it imports the full page. On iPhone Safari, create a bookmark and replace its address with the code below.</p><p><a class="primary button-link" href="${escapeHtml(code)}">Read with Mark</a></p><label>Bookmark address<textarea id="bookmarklet-code" rows="6" readonly>${escapeHtml(code)}</textarea></label>`;';

  if (source.includes(legacyBookmarkletWorkspace)) {
    source = source.replace(legacyBookmarkletWorkspace, updatedBookmarkletWorkspace);
  }

  const statusAnchor = "    const status = app.querySelector('#read-anything-status');\n";
  const nativeExtensionOwner = `    const status = app.querySelector('#read-anything-status');

    const extensionStatus = app.querySelector('#read-anything-extension-status');
    const extensionSetup = app.querySelector('#read-anything-extension-setup');

    const syncReadWithMarkExtensionStatus = () => {
      const ready = Boolean(window.MarkSetGoReadWithMarkExtensionFallback?.ready);
      if (extensionStatus) {
        extensionStatus.dataset.state = ready ? 'installed' : 'missing';
        extensionStatus.textContent = ready ? '✓ Installed and connected' : 'Not installed';
      }
      if (extensionSetup) {
        extensionSetup.textContent = ready ? 'Extension Settings' : 'Install Extension';
      }
      return ready;
    };

    extensionSetup?.addEventListener('click', () => {
      const workspace = app.querySelector('#read-anything-workspace');
      const ready = syncReadWithMarkExtensionStatus();
      workspace.hidden = false;
      workspace.innerHTML = \`
        <div class="read-anything-extension-setup">
          <h2>Read with Mark Extension</h2>
          <p><strong>Recommended for article recovery.</strong> The extension automatically recovers readable full articles when the normal import cannot retrieve them.</p>
          <div class="extension-setup-status" id="read-anything-extension-setup-status" data-state="\${ready ? 'installed' : 'missing'}">
            \${ready ? '✓ Installed and connected' : 'Not installed'}
          </div>
          <div class="source-actions">
            <a class="primary button-link" href="/downloads/read-with-mark-auto-import-extension-v0.1.1.zip" download>Download Extension</a>
            <button id="read-anything-extension-copy-url" class="secondary" type="button">Copy chrome://extensions</button>
            <button id="read-anything-extension-check" class="secondary" type="button">Check Installation</button>
            <button id="read-anything-extension-bookmarklet" class="secondary" type="button">Bookmarklet Fallback</button>
          </div>
          <ol>
            <li>Download and unzip the extension.</li>
            <li>Open <code>chrome://extensions</code>.</li>
            <li>Turn on <strong>Developer mode</strong>.</li>
            <li>Choose <strong>Load unpacked</strong>.</li>
            <li>Select the unzipped <code>read-with-mark-auto-import-extension</code> folder.</li>
            <li>Return here and click <strong>Check Installation</strong>.</li>
          </ol>
          <p><small><strong>Manual fallback:</strong> use the Read with Mark Bookmarklet if you do not want to install the extension or a particular publisher page cannot be recovered automatically.</small></p>
        </div>\`;

      workspace.querySelector('#read-anything-extension-copy-url')?.addEventListener('click', async (event) => {
        try {
          await navigator.clipboard.writeText('chrome://extensions');
          event.currentTarget.textContent = 'Copied';
          window.setTimeout(() => {
            if (event.currentTarget.isConnected) event.currentTarget.textContent = 'Copy chrome://extensions';
          }, 1500);
        } catch {
          event.currentTarget.textContent = 'chrome://extensions';
        }
      });

      workspace.querySelector('#read-anything-extension-check')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = 'Checking…';
        window.MarkSetGoReadWithMarkExtensionFallback?.ping?.();
        await new Promise((resolve) => window.setTimeout(resolve, 750));
        const installed = syncReadWithMarkExtensionStatus();
        const setupStatus = workspace.querySelector('#read-anything-extension-setup-status');
        if (setupStatus) {
          setupStatus.dataset.state = installed ? 'installed' : 'missing';
          setupStatus.textContent = installed ? '✓ Installed and connected' : 'Not detected — reload the extension';
        }
        button.disabled = false;
        button.textContent = 'Check Installation';
      });

      workspace.querySelector('#read-anything-extension-bookmarklet')?.addEventListener('click', () => {
        app.querySelector('#read-anything-bookmarklet')?.click();
      });

      workspace.scrollIntoView({ behavior:'smooth', block:'nearest' });
    });

    syncReadWithMarkExtensionStatus();
    window.setTimeout(syncReadWithMarkExtensionStatus, 500);
    window.setTimeout(syncReadWithMarkExtensionStatus, 1500);
`;

  if (!source.includes('const syncReadWithMarkExtensionStatus = () => {')) {
    if (!source.includes(statusAnchor)) {
      throw new Error('ui cache: could not locate Read Anything status owner');
    }
    source = source.replace(statusAnchor, nativeExtensionOwner);
  }

  if (source !== before) {
    fs.writeFileSync(readAnythingPath, source, 'utf8');
    console.log('ui cache: patched native Read Anything extension/bookmarklet UI');
  } else {
    console.log('ui cache: native Read Anything extension/bookmarklet UI already current');
  }
}


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

patchReadAnythingExtensionUi();

let index = fs.readFileSync(indexPath, 'utf8');
const before = index;

/* Native public/read-anything.js now owns the extension/bookmarklet cards.
   Remove the superseded runtime card owner if an earlier build inserted it. */
index = index.replace(
  /\s*<script[^>]+src=["']\/read-anything-extension-card-owner\.js(?:\?[^"']*)?["'][^>]*><\/script>\s*/gi,
  '\n'
);

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
  'read-anything.js',
  '20260827-v2.5.7-native-extension-ui'
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
  'media-toolbar-simplify.css',
  '20260827-v1.0.0-beside-only'
);

index = replaceAssetVersion(
  index,
  'media-toolbar-simplify.js',
  '20260827-v1.0.0-beside-only'
);


index = replaceAssetVersion(
  index,
  'read-with-mark-extension-fallback.js',
  '20260827-v0.1.3-extension-first-copy'
);


index = replaceAssetVersion(
  index,
  'read-with-mark-extension-install-ui.css',
  '20260827-v1.1.0-extension-first-copy'
);

index = replaceAssetVersion(
  index,
  'read-with-mark-extension-install-ui.js',
  '20260827-v1.1.0-extension-first-copy'
);


index = replaceAssetVersion(
  index,
  'read-anything-extension-card-owner.js',
  '20260827-v1.0.0-direct-read-anything-owner'
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
  'read-anything.css',
  '<link href="/read-with-mark-extension-install-ui.css?v=20260827-v1.1.0-extension-first-copy" rel="stylesheet"/>'
);

/* Install the extension recovery bridge first because the install/status UI
   deliberately loads after and talks to that bridge. */
index = ensureAfterAsset(
  index,
  'read-anything.js',
  '  <script defer src="/read-with-mark-extension-fallback.js?v=20260827-v0.1.3-extension-first-copy"></script>'
);

index = ensureAfterAsset(
  index,
  'read-with-mark-extension-fallback.js',
  '  <script defer src="/read-with-mark-extension-install-ui.js?v=20260827-v1.1.0-extension-first-copy"></script>'
);


/* Media assets must be installed in dependency order.
   media-panel.css is a stable index.html asset; media-toolbar-responsive.css
   is additive, so it cannot safely be used as an anchor until after we insert it. */
index = ensureAfterAsset(
  index,
  'media-panel.css',
  '<link href="/media-toolbar-responsive.css?v=20260826-v1.0.0-toolbar-wrap" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'media-toolbar-responsive.css',
  '<link href="/media-toolbar-simplify.css?v=20260827-v1.0.0-beside-only" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'media-panel.js',
  '  <script defer src="/media-toolbar-simplify.js?v=20260827-v1.0.0-beside-only"></script>'
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
  console.log('ui cache: Ask Beth conversation-first popup-only sidebar current');
} else {
  console.log('ui cache: Ask Beth conversation-first assets already current');
}
