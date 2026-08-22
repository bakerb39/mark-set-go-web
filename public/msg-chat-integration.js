'use strict';

(() => {
  function removeOldNavArtifacts() {
    document.getElementById('bb-chat-nav-button')?.remove();
    document.getElementById('msg-theme-launcher')?.remove();
  }

  function ensureChatLabel() {
    const button = document.querySelector('.site-header nav [data-action="msg-chat"]');
    if (!button) return;
    button.title = 'Open Mark, Set, Go! Chat';
    button.setAttribute('aria-label', 'Open Mark, Set, Go! Chat');
  }

  function sync() {
    removeOldNavArtifacts();
    ensureChatLabel();
  }

  function init() {
    sync();
    // experience-themes.js creates its launcher during DOMContentLoaded.
    // These scheduled cleanup passes happen after that initialization.
    [0, 40, 180].forEach(delay => window.setTimeout(sync, delay));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.addEventListener('pageshow', sync);
  document.addEventListener('marksetgo:experience-profile-changed', sync);
})();
