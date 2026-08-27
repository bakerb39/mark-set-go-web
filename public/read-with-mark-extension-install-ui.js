(() => {
  'use strict';

  const DOWNLOAD_URL = '/downloads/read-with-mark-auto-import-extension-v0.1.1.zip';
  const EXTENSIONS_URL = 'chrome://extensions';
  const CARD_ID = 'read-anything-extension-card';
  const VERSION = '1.1.0';

  function api() {
    return window.MarkSetGoReadWithMarkExtensionFallback;
  }

  function isReady() {
    return Boolean(api()?.ready);
  }

  function cardMarkup() {
    return `
      <section class="read-anything-card read-anything-extension-card" id="${CARD_ID}">
        <span class="read-anything-icon">🧩</span>
        <h2>Read with Mark Extension</h2>
        <p><strong>Recommended.</strong> Automatically recover readable full articles when the normal import cannot retrieve them.</p>
        <div class="read-anything-extension-status" data-rwm-install-status data-state="checking">
          Checking extension…
        </div>
        <div class="read-anything-extension-actions">
          <button id="read-anything-extension-setup" class="secondary" type="button">
            Set up extension
          </button>
        </div>
      </section>`;
  }

  function updateStatus(root = document) {
    const ready = isReady();
    root.querySelectorAll('[data-rwm-install-status]').forEach((node) => {
      node.dataset.state = ready ? 'installed' : 'missing';
      node.textContent = ready ? '✓ Installed and connected' : 'Not installed';
    });

    const setup = root.querySelector('#read-anything-extension-setup');
    if (setup) {
      setup.textContent = ready ? 'Extension settings' : 'Install extension';
    }
    return ready;
  }

  function updateBookmarkletCard() {
    const button = document.querySelector('#read-anything-bookmarklet');
    const card = button?.closest('.read-anything-card');
    if (!card) return false;

    const heading = card.querySelector('h2');
    const description = card.querySelector('p');

    if (heading) heading.textContent = 'Read with Mark Bookmarklet';
    if (description) {
      description.innerHTML =
        '<strong>Manual fallback.</strong> Open any webpage and send the full page, ' +
        'or highlight a passage first to send only that selection.';
    }

    if (button) {
      button.textContent = 'Show Bookmarklet';
      button.title =
        'Manual fallback for pages the extension cannot recover automatically';
    }
    return true;
  }

  function updateBookmarkletWorkspace() {
    const target = workspace();
    if (!target || target.hidden) return false;

    const heading = target.querySelector('h2');
    const paragraph = target.querySelector('p');

    if (heading && /Install [“"]?Read with Mark/i.test(heading.textContent || '')) {
      heading.textContent = 'Read with Mark Bookmarklet';
    }

    if (paragraph && /Drag this button to your bookmarks bar/i.test(paragraph.textContent || '')) {
      paragraph.innerHTML =
        '<strong>Manual fallback:</strong> use the bookmarklet when the extension is not installed ' +
        'or automatic recovery cannot retrieve a publisher page. Drag the button to your bookmarks bar. ' +
        'Highlight text before clicking it to capture only that passage; otherwise it imports the full page. ' +
        'On iPhone Safari, create a bookmark and replace its address with the code below.';
    }
    return true;
  }

  function installCard() {
    const grid = document.querySelector('.read-anything-grid');
    if (!grid) return false;
    updateBookmarkletCard();

    if (grid.querySelector(`#${CARD_ID}`)) {
      updateStatus(grid);
      return true;
    }

    const bookmarkletCard =
      document.querySelector('#read-anything-bookmarklet')?.closest('.read-anything-card');

    if (bookmarkletCard) {
      bookmarkletCard.insertAdjacentHTML('beforebegin', cardMarkup());
    } else {
      grid.insertAdjacentHTML('beforeend', cardMarkup());
    }

    bindCard();
    updateStatus(grid);
    return true;
  }

  function workspace() {
    return document.querySelector('#read-anything-workspace');
  }

  function renderSetup() {
    const target = workspace();
    if (!target) return false;

    const ready = isReady();
    target.hidden = false;
    target.innerHTML = `
      <div class="read-anything-extension-setup">
        <div>
          <h2>Read with Mark Extension</h2>
          <p>
            <strong>Recommended for article recovery.</strong> The extension lets
            Mark, Set, Go! recover readable article text directly from the publisher
            page when the normal import is incomplete.
          </p>
        </div>

        <div class="extension-setup-status" data-rwm-install-status data-state="${ready ? 'installed' : 'missing'}">
          ${ready ? '✓ Installed and connected' : 'Not installed'}
        </div>

        <div class="source-actions">
          <a class="primary button-link" href="${DOWNLOAD_URL}" download>
            Download extension
          </a>
          <button id="rwm-copy-extensions-url" class="secondary" type="button">
            Copy chrome://extensions
          </button>
          <button id="rwm-check-installation" class="secondary" type="button">
            Check installation
          </button>
          <button id="rwm-show-bookmarklet-fallback" class="secondary" type="button">
            Bookmarklet fallback
          </button>
        </div>

        <ol>
          <li>Download and unzip the extension.</li>
          <li>Open <code>chrome://extensions</code> in Chrome.</li>
          <li>Turn on <strong>Developer mode</strong>.</li>
          <li>Choose <strong>Load unpacked</strong>.</li>
          <li>Select the unzipped <code>read-with-mark-auto-import-extension</code> folder.</li>
          <li>Return to Mark, Set, Go! and click <strong>Check installation</strong>.</li>
        </ol>

        <p class="read-anything-extension-note">
          <strong>Manual fallback:</strong> the Read with Mark Bookmarklet remains
          available if you do not want to install the extension or if a particular
          publisher page cannot be recovered automatically.
        </p>

        <p class="read-anything-extension-note">
          Chrome does not allow a website to silently install an unpacked extension.
          Once Read with Mark is published in the Chrome Web Store, this setup can
          become a normal one-click install link.
        </p>

        <p class="read-anything-extension-note">
          The extension does not attempt to bypass subscriptions, sign-in walls,
          paywalls, CAPTCHAs, or other access controls.
        </p>
      </div>`;

    target.querySelector('#rwm-show-bookmarklet-fallback')?.addEventListener('click', () => {
      const render = window.MarkSetGoReadAnything?.render;
      if (typeof render === 'function') render();

      window.setTimeout(() => {
        updateBookmarkletCard();
        document.querySelector('#read-anything-bookmarklet')?.click();
        window.setTimeout(updateBookmarkletWorkspace, 0);
      }, 60);
    });

    target.querySelector('#rwm-copy-extensions-url')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      try {
        await navigator.clipboard.writeText(EXTENSIONS_URL);
        button.textContent = 'Copied';
        window.setTimeout(() => {
          if (button.isConnected) button.textContent = 'Copy chrome://extensions';
        }, 1500);
      } catch {
        button.textContent = EXTENSIONS_URL;
      }
    });

    target.querySelector('#rwm-check-installation')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Checking…';

      try {
        api()?.ping?.();
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        updateStatus(target);
        updateStatus(document);

        button.textContent = isReady() ? 'Installed ✓' : 'Not detected — try Reload';
      } finally {
        window.setTimeout(() => {
          if (!button.isConnected) return;
          button.disabled = false;
          button.textContent = 'Check installation';
        }, 1800);
      }
    });

    target.scrollIntoView({ behavior:'smooth', block:'nearest' });
    return true;
  }

  function bindCard() {
    const button = document.querySelector('#read-anything-extension-setup');
    if (!button || button.dataset.rwmInstallBound === '1') return;

    button.dataset.rwmInstallBound = '1';
    button.addEventListener('click', renderSetup);
  }

  function scheduleInstall() {
    [0,80,220,520].forEach((delay) => {
      window.setTimeout(() => {
        installCard();
        updateStatus(document);
      }, delay);
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (
      target.closest('[data-action="read-anything"]') ||
      target.closest('[data-read="upload"]')
    ) {
      scheduleInstall();
    }

    if (target.closest('#read-anything-bookmarklet')) {
      window.setTimeout(updateBookmarkletWorkspace, 0);
    }
  }, true);

  document.addEventListener('marksetgo:rwm-extension-ready', () => {
    updateStatus(document);
  });

  document.addEventListener('marksetgo:read-with-mark-auto-recovered', () => {
    updateStatus(document);
  });

  window.addEventListener('pageshow', scheduleInstall);

  window.MarkSetGoReadWithMarkExtensionInstallUi = Object.freeze({
    version:VERSION,
    open:renderSetup,
    refresh:() => updateStatus(document)
  });

  scheduleInstall();
})();