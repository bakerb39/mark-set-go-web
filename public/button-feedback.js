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

(() => {
  'use strict';

  const CHAT_ID = 'msg-chat-nav-button';

  function nav() {
    return document.querySelector('.site-header nav[aria-label="Main navigation"]');
  }

  function ensureLink(href) {
    if (document.querySelector(`link[href^="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${href}?v=1.4.0`;
    document.head.appendChild(link);
  }

  function ensureScript(src) {
    if (document.querySelector(`script[src^="${src}"]`)) return;
    const script = document.createElement('script');
    script.src = `${src}?v=1.4.0`;
    script.defer = true;
    document.head.appendChild(script);
  }

  function removeOldTopLevelItems() {
    document.getElementById('bb-chat-nav-button')?.remove();
    document.getElementById('msg-theme-launcher')?.remove();

    const root = nav();
    if (!root) return;
    [...root.children].forEach((node) => {
      if (!(node instanceof Element) || node.id === CHAT_ID) return;
      const source = node.matches('details') ? node.querySelector(':scope > summary') : node;
      const label = String(source?.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^(?:✦\s*)?Themes?$/i.test(label) || /^BB Chat$/i.test(label)) node.remove();
    });
  }

  function ensureChatButton() {
    const root = nav();
    if (!root) return;

    let button = root.querySelector(':scope > [data-action="msg-chat"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'top-level-nav-button';
      button.dataset.action = 'msg-chat';
      const profile = root.querySelector(':scope > [data-action="profile-preferences"]');
      const company = root.querySelector(':scope > .company-menu');
      root.insertBefore(button, profile || company || null);
    }

    button.id = CHAT_ID;
    button.innerHTML = '<span class="nav-icon" aria-hidden="true">◫</span> Chat';
    button.title = 'Open Mark, Set, Go! Chat';
    button.setAttribute('aria-label', 'Open Mark, Set, Go! Chat');
    // No click handler: workspace-experiment.js must own normal navigation.
  }

  function sync() {
    ensureLink('/msg-chat.css');
    ensureLink('/app-viewport-fix.css');
    ensureScript('/msg-chat.js');
    ensureScript('/profile-theme-fix.js');
    removeOldTopLevelItems();
    ensureChatButton();
  }

  function init() {
    sync();
    [0, 50, 200, 700, 1600].forEach(delay => setTimeout(sync, delay));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.addEventListener('pageshow', sync);
  document.addEventListener('marksetgo:experience-profile-changed', () => setTimeout(sync, 0));

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== 'msg-workspace-theme-change') return;
    const theme = String(event.data.theme || '').trim();
    if (!theme) return;
    try {
      if (window.MarkSetGoExperienceThemes?.apply) {
        window.MarkSetGoExperienceThemes.apply(theme);
      } else if (window.MarkSetGoProfileThemeFix?.apply) {
        window.MarkSetGoProfileThemeFix.apply(theme);
      }
    } catch (error) {
      console.warn('Unable to apply workspace theme change:', error);
    }
  });
})();
