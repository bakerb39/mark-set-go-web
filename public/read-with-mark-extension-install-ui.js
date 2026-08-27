(() => {
  'use strict';

  const DOWNLOAD_URL = '/downloads/read-with-mark-auto-import-extension-v0.1.1.zip';
  const EXTENSIONS_URL = 'chrome://extensions';
  const CARD_ID = 'read-anything-extension-card';

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
        <p>Automatically recover more full articles when a publisher blocks the normal import.</p>
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
      setup.textContent = ready ? 'Extension settings' : 'Set up extension';
    }
    return ready;
  }

  function installCard() {
    const grid = document.querySelector('.read-anything-grid');
    if (!grid) return false;
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
            The extension lets Mark, Set, Go! recover readable article text directly
            from the publisher page when the normal server import is incomplete.
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
          Chrome does not allow a website to silently install an unpacked extension.
          Once Read with Mark is published in the Chrome Web Store, this setup can
          become a normal one-click install link.
        </p>

        <p class="read-anything-extension-note">
          The extension does not attempt to bypass subscriptions, sign-in walls,
          paywalls, CAPTCHAs, or other access controls.
        </p>
      </div>`;

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
  }, true);

  document.addEventListener('marksetgo:rwm-extension-ready', () => {
    updateStatus(document);
  });

  document.addEventListener('marksetgo:read-with-mark-auto-recovered', () => {
    updateStatus(document);
  });

  window.addEventListener('pageshow', scheduleInstall);

  window.MarkSetGoReadWithMarkExtensionInstallUi = Object.freeze({
    version:'1.0.0',
    open:renderSetup,
    refresh:() => updateStatus(document)
  });

  scheduleInstall();
})();