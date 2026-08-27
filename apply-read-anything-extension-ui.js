'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const readAnythingPath = path.join(root, 'public', 'read-anything.js');
const indexPath = path.join(root, 'public', 'index.html');
const MARKER = 'READ_WITH_MARK_EXTENSION_NATIVE_V1';
const ASSET_VERSION = '20260827-v2.5.8-native-rwm-extension-final';

function patchReadAnything() {
  const original = fs.readFileSync(readAnythingPath, 'utf8');
  let source = original;

  if (!source.includes(MARKER)) {
    const oldCard = `          <section class="read-anything-card">
            <span class="read-anything-icon">🔖</span><h2>Read with Mark</h2><p>Import a full webpage, or highlight a passage first to send only the selection.</p>
            <button id="read-anything-bookmarklet" class="secondary" type="button">Show Bookmarklet</button>
          </section>`;

    const newCards = `          <!-- ${MARKER} -->
          <section class="read-anything-card read-anything-extension-card" id="read-anything-extension-card">
            <span class="read-anything-icon">🧩</span><h2>Read with Mark Extension</h2><p><strong>Recommended.</strong> Automatically recover readable full articles when the normal import cannot retrieve them.</p>
            <div id="read-anything-extension-status" class="read-anything-extension-status" data-state="checking">Checking extension…</div>
            <button id="read-anything-extension-setup" class="secondary" type="button">Install Extension</button>
          </section>
          <section class="read-anything-card">
            <span class="read-anything-icon">🔖</span><h2>Read with Mark Bookmarklet</h2><p><strong>Manual fallback.</strong> Open any webpage and send the full page, or highlight a passage first to send only that selection.</p>
            <button id="read-anything-bookmarklet" class="secondary" type="button">Show Bookmarklet</button>
          </section>`;

    if (!source.includes(oldCard)) {
      throw new Error(
        'Read Anything installer could not find the current native Read with Mark card. No changes were written.'
      );
    }
    source = source.replace(oldCard, newCards);

    const statusAnchor = `    const status = app.querySelector('#read-anything-status');
`;
    const statusOwner = `    const status = app.querySelector('#read-anything-status');

    // ${MARKER}: Read Anything owns its extension status/setup directly.
    const extensionStatus = app.querySelector('#read-anything-extension-status');
    const extensionSetup = app.querySelector('#read-anything-extension-setup');

    const syncReadWithMarkExtensionStatus = () => {
      const installed = Boolean(window.MarkSetGoReadWithMarkExtensionFallback?.ready);
      if (extensionStatus) {
        extensionStatus.dataset.state = installed ? 'installed' : 'missing';
        extensionStatus.textContent = installed ? '✓ Installed and connected' : 'Not installed';
      }
      if (extensionSetup) {
        extensionSetup.textContent = installed ? 'Extension Settings' : 'Install Extension';
      }
      return installed;
    };

    extensionSetup?.addEventListener('click', () => {
      const workspace = app.querySelector('#read-anything-workspace');
      const installed = syncReadWithMarkExtensionStatus();
      workspace.hidden = false;
      workspace.innerHTML = \`
        <div class="read-anything-extension-setup">
          <h2>Read with Mark Extension</h2>
          <p><strong>Recommended for article recovery.</strong> Automatically recover readable full articles when the normal import cannot retrieve them.</p>
          <div class="extension-setup-status" id="read-anything-extension-setup-status" data-state="\${installed ? 'installed' : 'missing'}">
            \${installed ? '✓ Installed and connected' : 'Not installed'}
          </div>
          <div class="source-actions">
            <a class="primary button-link" href="/downloads/read-with-mark-auto-import-extension-v0.1.1.zip" download>Download Extension</a>
            <button id="read-anything-extension-copy" class="secondary" type="button">Copy chrome://extensions</button>
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
          <p><small><strong>Manual fallback:</strong> use the Read with Mark Bookmarklet if you do not want to install the extension or automatic recovery cannot retrieve a particular publisher page.</small></p>
        </div>\`;

      workspace.querySelector('#read-anything-extension-copy')?.addEventListener('click', async (event) => {
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
        const ready = syncReadWithMarkExtensionStatus();
        const setupStatus = workspace.querySelector('#read-anything-extension-setup-status');
        if (setupStatus) {
          setupStatus.dataset.state = ready ? 'installed' : 'missing';
          setupStatus.textContent = ready ? '✓ Installed and connected' : 'Not detected — reload the extension';
        }
        button.disabled = false;
        button.textContent = 'Check Installation';
      });

      workspace.querySelector('#read-anything-extension-bookmarklet')?.addEventListener('click', () => {
        app.querySelector('#read-anything-bookmarklet')?.click();
      });

      workspace.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    syncReadWithMarkExtensionStatus();
    window.setTimeout(syncReadWithMarkExtensionStatus, 350);
    window.setTimeout(syncReadWithMarkExtensionStatus, 1200);
`;

    if (!source.includes(statusAnchor)) {
      throw new Error(
        'Read Anything installer could not find the native Read Anything status owner. No changes were written.'
      );
    }
    source = source.replace(statusAnchor, statusOwner);

    const oldBookmarklet = `      workspace.innerHTML = \`<h2>Install “Read with Mark”</h2><p>Drag this button to your bookmarks bar. Highlight text before clicking it to capture only that passage; otherwise it imports the full page. On iPhone Safari, create a bookmark and replace its address with the code below.</p><p><a class="primary button-link" href="\${escapeHtml(code)}">Read with Mark</a></p><label>Bookmark address<textarea id="bookmarklet-code" rows="6" readonly>\${escapeHtml(code)}</textarea></label>\`;`;

    const newBookmarklet = `      workspace.innerHTML = \`<h2>Read with Mark Bookmarklet</h2><p><strong>Manual fallback:</strong> use the bookmarklet when the extension is not installed or automatic recovery cannot retrieve a publisher page. Drag this button to your bookmarks bar. Highlight text before clicking it to capture only that passage; otherwise it imports the full page. On iPhone Safari, create a bookmark and replace its address with the code below.</p><p><a class="primary button-link" href="\${escapeHtml(code)}">Read with Mark</a></p><label>Bookmark address<textarea id="bookmarklet-code" rows="6" readonly>\${escapeHtml(code)}</textarea></label>\`;`;

    if (source.includes(oldBookmarklet)) {
      source = source.replace(oldBookmarklet, newBookmarklet);
    }

    fs.writeFileSync(readAnythingPath, source, 'utf8');

    const check = spawnSync(process.execPath, ['--check', readAnythingPath], {
      encoding: 'utf8'
    });

    if (check.status !== 0) {
      fs.writeFileSync(readAnythingPath, original, 'utf8');
      process.stderr.write(check.stderr || 'read-anything.js syntax validation failed\n');
      throw new Error(
        'Read Anything installer rolled back because public/read-anything.js did not validate.'
      );
    }

    console.log('read anything: installed native Read with Mark Extension + Bookmarklet UI');
  } else {
    console.log('read anything: native Read with Mark Extension UI already installed');
  }
}

function bumpBrowserAsset() {
  let index = fs.readFileSync(indexPath, 'utf8');
  const pattern = /\/read-anything\.js(?:\?v=[^"'\\s>]+)?/g;

  if (!pattern.test(index)) {
    throw new Error(
      'Read Anything installer could not locate /read-anything.js in public/index.html.'
    );
  }

  pattern.lastIndex = 0;
  const next = index.replace(
    pattern,
    `/read-anything.js?v=${ASSET_VERSION}`
  );

  if (next !== index) {
    fs.writeFileSync(indexPath, next, 'utf8');
    console.log(`read anything: browser asset bumped to ${ASSET_VERSION}`);
  } else {
    console.log(`read anything: browser asset already ${ASSET_VERSION}`);
  }
}

patchReadAnything();
bumpBrowserAsset();
