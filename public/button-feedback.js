(() => {
  const selector = 'button:not(:disabled), [role="button"]:not([aria-disabled="true"]), a.button-link, label.read-anything-file-button';
  let active = null;

  const clear = () => {
    active?.classList.remove('msg-button-pressed');
    active = null;
  };

  document.addEventListener('pointerdown', (event) => {
    clear();
    const target = event.target.closest?.(selector);
    if (!target) return;
    active = target;
    target.classList.add('msg-button-pressed');
  }, { passive: true });

  document.addEventListener('pointerup', clear, { passive: true });
  document.addEventListener('pointercancel', clear, { passive: true });
  window.addEventListener('blur', clear);
})();

/*
 * Mark, Set, Go! Chat navigation bootstrap v1.2
 *
 * Replaces the obsolete BB Chat iframe integration that previously lived in
 * this file. No MutationObserver is used.
 *
 * IMPORTANT: this bootstrap deliberately does NOT attach a click handler to
 * the Chat navigation button. The existing workspace-experiment.js owns
 * top-level navigation when a Reader is open and workspace mode is enabled.
 */
(() => {
  'use strict';

  const CHAT_ACTION = 'msg-chat';
  const CHAT_BUTTON_ID = 'msg-chat-nav-button';
  const OLD_BB_CHAT_BUTTON_ID = 'bb-chat-nav-button';
  const THEME_LAUNCHER_ID = 'msg-theme-launcher';

  function mainNav() {
    return document.querySelector('.site-header nav[aria-label="Main navigation"]');
  }

  function ensureAsset(tagName, selector, attributes) {
    if (document.querySelector(selector)) return;

    const node = document.createElement(tagName);
    Object.entries(attributes).forEach(([name, value]) => {
      if (name === 'textContent') node.textContent = value;
      else node.setAttribute(name, value);
    });
    document.head.appendChild(node);
  }

  function ensureChatAssets() {
    ensureAsset(
      'link',
      'link[href^="/msg-chat.css"]',
      { rel: 'stylesheet', href: '/msg-chat.css?v=1.2.0' }
    );

    ensureAsset(
      'script',
      'script[src^="/msg-chat.js"]',
      { defer: '', src: '/msg-chat.js?v=1.2.0' }
    );
  }

  function removeObsoleteNavigation() {
    document.getElementById(OLD_BB_CHAT_BUTTON_ID)?.remove();
    document.getElementById(THEME_LAUNCHER_ID)?.remove();

    const nav = mainNav();
    if (!nav) return;

    // Defensive cleanup for any old hard-coded Theme/BB Chat menu entry.
    [...nav.children].forEach((node) => {
      if (!(node instanceof Element)) return;
      if (node.id === CHAT_BUTTON_ID) return;

      const summary = node.matches('details') ? node.querySelector(':scope > summary') : node;
      const label = String(summary?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();

      if (/^(?:✦\s*)?Themes?$/i.test(label) || /^BB Chat$/i.test(label)) {
        node.remove();
      }
    });
  }

  function ensureChatButton() {
    const nav = mainNav();
    if (!nav) return false;

    let button = document.getElementById(CHAT_BUTTON_ID)
      || nav.querySelector(`:scope > [data-action="${CHAT_ACTION}"]`);

    if (!button) {
      button = document.createElement('button');
      button.id = CHAT_BUTTON_ID;
      button.className = 'top-level-nav-button';
      button.type = 'button';
      button.dataset.action = CHAT_ACTION;
      button.innerHTML = '<span class="nav-icon" aria-hidden="true">◫</span> Mark, Set, Go! Chat';

      const profile = nav.querySelector(':scope > [data-action="profile-preferences"]');
      const company = nav.querySelector(':scope > .company-menu');
      nav.insertBefore(button, profile || company || null);
    }

    button.id = CHAT_BUTTON_ID;
    button.dataset.action = CHAT_ACTION;
    button.title = 'Open Mark, Set, Go! Chat';
    button.setAttribute('aria-label', 'Open Mark, Set, Go! Chat');

    // Do NOT add click handling here. Workspace-experiment.js must see the
    // ordinary data-action navigation event first.
    return true;
  }

  function syncNavigation() {
    ensureChatAssets();
    removeObsoleteNavigation();
    ensureChatButton();
  }

  function init() {
    syncNavigation();

    // experience-themes.js creates its historical top-level launcher during its
    // own startup. Run a few bounded cleanup passes after startup. This is not
    // an observer and does not run continuously.
    [0, 30, 100, 300, 900, 1800].forEach((delay) => {
      window.setTimeout(syncNavigation, delay);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.addEventListener('pageshow', syncNavigation);

  // Changing themes must not recreate a top-level Themes launcher.
  document.addEventListener('marksetgo:experience-profile-changed', () => {
    window.setTimeout(syncNavigation, 0);
  });
})();
