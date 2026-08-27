(() => {
  'use strict';

  const VERSION = '1.0.0';
  const DOWNLOAD_URL = '/downloads/read-with-mark-auto-import-extension-v0.1.1.zip';
  const EXTENSIONS_URL = 'chrome://extensions';

  function extensionApi() {
    return window.MarkSetGoReadWithMarkExtensionFallback || null;
  }

  function extensionReady() {
    return Boolean(extensionApi()?.ready);
  }

  function workspace() {
    return document.querySelector('#read-anything-workspace');
  }

  function updateStatus(root = document) {
    const ready = extensionReady();

    root.querySelectorAll('[data-rwm-install-status]').forEach((node) => {
      node.dataset.state = ready ? 'installed' : 'missing';
      node.textContent = ready
        ? '✓ Installed and connected'
        : 'Not installed';
    });

    root.querySelectorAll('[data-rwm-extension-setup]').forEach((button) => {
      button.textContent = ready ? 'Extension settings' : 'Install extension';
    });

    return ready;
  }

  function copyExtensionsUrl(button) {
    return navigator.clipboard.writeText(EXTENSIONS_URL)
      .then(() => {
        button.textContent = 'Copied';
        window.setTimeout(() => {
          if (button.isConnected) button.textContent = 'Copy chrome://extensions';
        }, 1500);
      })
      .catch(() => {
        button.textContent = EXTENSIONS_URL;
      });
  }

  function showBookmarkletFallback() {
    const button = document.querySelector('#read-anything-bookmarklet');
    if (!button) return false;
    button.click();
    return true;
  }

  function renderInlineSetup() {
    const target = workspace();
    if (!target) return false;

    const ready = extensionReady();
    target.hidden = false;
    target.innerHTML = `
      <div class="read-anything-extension-setup">
        <div>
          <h2>Read with Mark Extension</h2>
          <p>
            <strong>Recommended for article recovery.</strong>
            Automatically recover readable full articles when the normal import
            cannot retrieve them.
          </p>
        </div>

        <div class="extension-setup-status" data-rwm-install-status
             data-state="${ready ? 'installed' : 'missing'}">
          ${ready ? '✓ Installed and connected' : 'Not installed'}
        </div>

        <div class="source-actions">
          <a class="primary button-link" href="${DOWNLOAD_URL}" download>
            Download extension
          </a>
          <button id="rwm-owner-copy-extensions" class="secondary" type="button">
            Copy chrome://extensions
          </button>
          <button id="rwm-owner-check-installation" class="secondary" type="button">
            Check installation
          </button>
          <button id="rwm-owner-bookmarklet" class="secondary" type="button">
            Bookmarklet fallback
          </button>
        </div>

        <ol>
          <li>Download and unzip the extension.</li>
          <li>Open <code>chrome://extensions</code>.</li>
          <li>Turn on <strong>Developer mode</strong>.</li>
          <li>Choose <strong>Load unpacked</strong>.</li>
          <li>Select the unzipped <code>read-with-mark-auto-import-extension</code> folder.</li>
          <li>Return here and click <strong>Check installation</strong>.</li>
        </ol>

        <p class="read-anything-extension-note">
          <strong>Manual fallback:</strong> use the Read with Mark Bookmarklet
          if you do not want to install the extension or if a particular
          publisher page cannot be recovered automatically.
        </p>
      </div>`;

    target.querySelector('#rwm-owner-copy-extensions')?.addEventListener(
      'click',
      (event) => void copyExtensionsUrl(event.currentTarget)
    );

    target.querySelector('#rwm-owner-check-installation')?.addEventListener(
      'click',
      async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = 'Checking…';

        try {
          extensionApi()?.ping?.();
          await new Promise((resolve) => window.setTimeout(resolve, 750));
          updateStatus(target);
          updateStatus(document);
          button.textContent = extensionReady()
            ? 'Installed ✓'
            : 'Not detected — reload extension';
        } finally {
          window.setTimeout(() => {
            if (!button.isConnected) return;
            button.disabled = false;
            button.textContent = 'Check installation';
          }, 1800);
        }
      }
    );

    target.querySelector('#rwm-owner-bookmarklet')?.addEventListener(
      'click',
      () => {
        showBookmarkletFallback();
      }
    );

    target.scrollIntoView({ behavior:'smooth', block:'nearest' });
    return true;
  }

  function openExtensionSetup() {
    const helper = window.MarkSetGoReadWithMarkExtensionInstallUi;
    if (typeof helper?.open === 'function') {
      return helper.open();
    }
    return renderInlineSetup();
  }

  function ensureExtensionCard(grid, bookmarkletCard) {
    let card = grid.querySelector('#read-anything-extension-card');

    if (!card) {
      const markup = `
        <section class="read-anything-card read-anything-extension-card"
                 id="read-anything-extension-card">
          <span class="read-anything-icon">🧩</span>
          <h2>Read with Mark Extension</h2>
          <p>
            <strong>Recommended.</strong>
            Automatically recover readable full articles when the normal import
            cannot retrieve them.
          </p>
          <div class="read-anything-extension-status"
               data-rwm-install-status
               data-state="checking">
            Checking extension…
          </div>
          <div class="read-anything-extension-actions">
            <button class="secondary"
                    type="button"
                    data-rwm-extension-setup>
              Install extension
            </button>
          </div>
        </section>`;

      if (bookmarkletCard) {
        bookmarkletCard.insertAdjacentHTML('beforebegin', markup);
      } else {
        grid.insertAdjacentHTML('beforeend', markup);
      }

      card = grid.querySelector('#read-anything-extension-card');
    }

    const button = card?.querySelector('[data-rwm-extension-setup]');
    if (button && button.dataset.rwmOwnerBound !== '1') {
      button.dataset.rwmOwnerBound = '1';
      button.addEventListener('click', openExtensionSetup);
    }

    return Boolean(card);
  }

  function ensureBookmarkletCopy() {
    const button = document.querySelector('#read-anything-bookmarklet');
    const card = button?.closest('.read-anything-card');
    if (!card) return null;

    const heading = card.querySelector('h2');
    const description = card.querySelector('p');

    if (heading) heading.textContent = 'Read with Mark Bookmarklet';
    if (description) {
      description.innerHTML =
        '<strong>Manual fallback.</strong> Open any webpage and send the full page, ' +
        'or highlight a passage first to send only that selection.';
    }

    button.textContent = 'Show Bookmarklet';
    button.title =
      'Manual fallback for pages the extension cannot recover automatically';

    return card;
  }

  function ensureBookmarkletWorkspaceCopy() {
    const target = workspace();
    if (!target || target.hidden) return false;

    const heading = target.querySelector('h2');
    const paragraph = target.querySelector('p');

    if (
      heading &&
      /Install [“"]?Read with Mark/i.test(heading.textContent || '')
    ) {
      heading.textContent = 'Read with Mark Bookmarklet';
    }

    if (
      paragraph &&
      /Drag this button to your bookmarks bar/i.test(paragraph.textContent || '')
    ) {
      paragraph.innerHTML =
        '<strong>Manual fallback:</strong> use the bookmarklet when the extension ' +
        'is not installed or automatic recovery cannot retrieve a publisher page. ' +
        'Drag the button to your bookmarks bar. Highlight text before clicking it ' +
        'to capture only that passage; otherwise it imports the full page. ' +
        'On iPhone Safari, create a bookmark and replace its address with the code below.';
    }

    return true;
  }

  function ensureReadAnythingUi() {
    const grid = document.querySelector('.read-anything-grid');
    if (!grid) return false;

    const bookmarkletCard = ensureBookmarkletCopy();
    ensureExtensionCard(grid, bookmarkletCard);
    updateStatus(grid);
    return true;
  }

  function scheduleEnsure() {
    [0,40,120,280,650,1200,2200].forEach((delay) => {
      window.setTimeout(() => {
        ensureReadAnythingUi();
        ensureBookmarkletWorkspaceCopy();
      }, delay);
    });
  }

  function wrapReadAnythingApi() {
    const original = window.MarkSetGoReadAnything;
    if (!original || original.__rwmExtensionCardOwner === VERSION) return false;

    try {
      const wrapped = {
        ...original,
        render(...args) {
          const result = original.render(...args);
          scheduleEnsure();
          return result;
        },
        __rwmExtensionCardOwner:VERSION
      };

      window.MarkSetGoReadAnything = Object.freeze(wrapped);
      return true;
    } catch {
      return false;
    }
  }

  // Any ordinary app click can be the event that opens a routed/workspace page.
  // This is intentionally event-based rather than MutationObserver-based.
  document.addEventListener('click', (event) => {
    window.setTimeout(() => {
      wrapReadAnythingApi();
      ensureReadAnythingUi();

      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest?.('#read-anything-bookmarklet')) {
        window.setTimeout(ensureBookmarkletWorkspaceCopy, 0);
      }
    }, 0);
  }, true);

  document.addEventListener('marksetgo:rwm-extension-ready', () => {
    updateStatus(document);
  });

  window.addEventListener('hashchange', scheduleEnsure);
  window.addEventListener('popstate', scheduleEnsure);
  window.addEventListener('pageshow', scheduleEnsure);

  // Cover initial boot order without leaving a permanent polling loop.
  let bootChecks = 0;
  const bootTimer = window.setInterval(() => {
    bootChecks += 1;
    wrapReadAnythingApi();
    ensureReadAnythingUi();
    if (bootChecks >= 15) window.clearInterval(bootTimer);
  }, 500);

  wrapReadAnythingApi();
  scheduleEnsure();

  window.MarkSetGoReadAnythingExtensionCardOwner = Object.freeze({
    version:VERSION,
    apply:ensureReadAnythingUi,
    setup:openExtensionSetup
  });
})();