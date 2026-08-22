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
 * Mark, Set, Go! Chat navigation/workspace bootstrap v1.3
 * - Menu label is simply "Chat"
 * - Page remains branded "Mark, Set, Go! Chat"
 * - No MutationObserver
 * - Explicitly opens Chat when this document is a workspace pane requesting msg-chat
 */
(() => {
  'use strict';

  const CHAT_ACTION = 'msg-chat';
  const CHAT_BUTTON_ID = 'msg-chat-nav-button';
  const OLD_BB_CHAT_BUTTON_ID = 'bb-chat-nav-button';
  const THEME_LAUNCHER_ID = 'msg-theme-launcher';

  const params = new URLSearchParams(window.location.search);
  const isWorkspacePane = params.get('msgWorkspacePane') === '1';
  const workspaceMode = params.get('msgWorkspaceMode') || 'action';
  const workspaceValue = params.get('msgWorkspaceValue') || '';

  let chatScriptLoading = null;

  function mainNav() {
    return document.querySelector('.site-header nav[aria-label="Main navigation"]');
  }

  function ensureChatCss() {
    if (document.querySelector('link[href^="/msg-chat.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/msg-chat.css?v=1.3.0';
    document.head.appendChild(link);
  }

  function ensureChatScript() {
    if (window.MarkSetGoChat?.open) return Promise.resolve();

    if (chatScriptLoading) return chatScriptLoading;

    const existing = document.querySelector('script[src^="/msg-chat.js"]');
    if (existing) {
      chatScriptLoading = new Promise((resolve, reject) => {
        if (window.MarkSetGoChat?.open) return resolve();

        const done = () => resolve();
        existing.addEventListener('load', done, { once: true });
        existing.addEventListener('error', reject, { once: true });

        // If the script already loaded before this listener was attached,
        // poll briefly for the public API.
        let tries = 0;
        const timer = window.setInterval(() => {
          tries += 1;
          if (window.MarkSetGoChat?.open) {
            window.clearInterval(timer);
            resolve();
          } else if (tries >= 50) {
            window.clearInterval(timer);
            resolve();
          }
        }, 20);
      });
      return chatScriptLoading;
    }

    chatScriptLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/msg-chat.js?v=1.3.0';
      script.async = false;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', reject, { once: true });
      document.head.appendChild(script);
    });

    return chatScriptLoading;
  }

  function ensureChatAssets() {
    ensureChatCss();
    return ensureChatScript();
  }

  function removeObsoleteNavigation() {
    document.getElementById(OLD_BB_CHAT_BUTTON_ID)?.remove();
    document.getElementById(THEME_LAUNCHER_ID)?.remove();

    const nav = mainNav();
    if (!nav) return;

    [...nav.children].forEach((node) => {
      if (!(node instanceof Element)) return;
      if (node.id === CHAT_BUTTON_ID) return;

      const source = node.matches('details')
        ? node.querySelector(':scope > summary')
        : node;

      const label = String(source?.textContent || '')
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

      const profile = nav.querySelector(':scope > [data-action="profile-preferences"]');
      const company = nav.querySelector(':scope > .company-menu');
      nav.insertBefore(button, profile || company || null);
    }

    button.id = CHAT_BUTTON_ID;
    button.dataset.action = CHAT_ACTION;
    button.title = 'Open Mark, Set, Go! Chat';
    button.setAttribute('aria-label', 'Open Mark, Set, Go! Chat');
    button.innerHTML = '<span class="nav-icon" aria-hidden="true">◫</span> Chat';

    // Intentionally no click handler.
    // The existing workspace navigation system owns this event.
    return true;
  }

  async function openRequestedWorkspaceChat() {
    if (!isWorkspacePane || workspaceMode !== 'action' || workspaceValue !== CHAT_ACTION) {
      return false;
    }

    // Hide the startup Home screen while the Chat module loads.
    document.documentElement.classList.add('msg-chat-workspace-pending');

    try {
      await ensureChatAssets();

      let tries = 0;
      while (!window.MarkSetGoChat?.open && tries < 100) {
        await new Promise(resolve => window.setTimeout(resolve, 20));
        tries += 1;
      }

      if (window.MarkSetGoChat?.open) {
        window.MarkSetGoChat.open();
        document.documentElement.classList.remove('msg-chat-workspace-pending');
        document.documentElement.classList.add('msg-workspace-pane-ready');
        return true;
      }
    } catch (error) {
      console.error('Unable to open Mark, Set, Go! Chat in workspace:', error);
    }

    document.documentElement.classList.remove('msg-chat-workspace-pending');
    return false;
  }

  function ensurePendingStyle() {
    if (document.getElementById('msg-chat-workspace-pending-style')) return;

    const style = document.createElement('style');
    style.id = 'msg-chat-workspace-pending-style';
    style.textContent = `
      html.msg-chat-workspace-pending #app {
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

  function syncNavigation() {
    ensureChatCss();
    removeObsoleteNavigation();
    ensureChatButton();
  }

  function init() {
    ensurePendingStyle();
    syncNavigation();

    // Explicitly handle the Chat workspace pane rather than relying on the
    // generic fallback click to race a dynamically loaded module.
    openRequestedWorkspaceChat();

    // experience-themes.js historically creates the Themes launcher during
    // startup. Remove it after startup with bounded passes, not an observer.
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

  document.addEventListener('marksetgo:experience-profile-changed', () => {
    window.setTimeout(syncNavigation, 0);
  });
})();
