/* Mark, Set, Go! Chat workspace layout repair v1.0
   Workspace core resets a reopened pane to 360px. Chat needs more room.
   This applies a Chat-specific preferred width after the workspace opens.
   No MutationObserver. */
(() => {
  'use strict';

  const PREFERRED_CHAT_WIDTH = 760;
  const MIN_CHAT_WIDTH = 640;
  const MIN_READER_WIDTH = 620;
  const RIGHT_GUTTER = 12;

  function shell() {
    return document.querySelector('#app > .msg-workspace-shell:not(.is-closed)');
  }

  function widenChatPane() {
    const root = shell();
    if (!root) return false;

    const rect = root.getBoundingClientRect();
    const available = Math.max(0, rect.width - MIN_READER_WIDTH - 8 - RIGHT_GUTTER);
    if (available < 520) return false;

    const width = Math.max(
      520,
      Math.min(PREFERRED_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, available))
    );

    root.style.setProperty('--msg-secondary-width', `${Math.round(width)}px`);
    root.classList.add('msg-workspace-chat-wide');
    return true;
  }

  function scheduleWiden() {
    // Workspace opening and iframe setup happen across a few synchronous/async
    // steps. Bounded retries win after its built-in 360px reset without running
    // continuously.
    [0, 35, 100, 250, 600].forEach(delay => {
      window.setTimeout(widenChatPane, delay);
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const chatNav = target.closest('[data-action="msg-chat"], #msg-chat-nav-button');
    const chatTab = target.closest('.msg-workspace-panel-tabs button');
    const isChatTab = chatTab && /\bchat\b/i.test(String(chatTab.textContent || ''));

    if (chatNav || isChatTab) scheduleWiden();
  }, true);

  // If Chat is already the active workspace pane on page restore, widen once.
  window.addEventListener('pageshow', () => {
    window.setTimeout(() => {
      const frame = document.querySelector(
        '.msg-workspace-secondary iframe[src*="msgWorkspaceValue=msg-chat"]'
      );
      if (frame) scheduleWiden();
    }, 0);
  });
})();
