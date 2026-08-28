(() => {
  'use strict';

  const WIDTH_KEY = 'msg-standard-reader-outer-width-v1';
  const COLLAPSED_KEY = 'msg-standard-reader-outer-collapsed-v1';

  function parentTheme() {
    const select = document.querySelector('#theme-select');
    if (select && (select.value === 'light' || select.value === 'dark')) {
      return select.value;
    }
    return 'light';
  }

  function actualWorkspaceActive() {
    const shell = document.querySelector('.msg-workspace-shell');
    if (!shell) return false;

    const primary = shell.querySelector(':scope > .msg-workspace-primary');
    const divider = shell.querySelector(':scope > .msg-workspace-divider');
    const secondary = shell.querySelector(':scope > .msg-workspace-secondary');

    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };

    return visible(primary) && visible(divider) && visible(secondary);
  }

  function resetFreshStandaloneWidth() {
    if (!document.body.classList.contains('msg-primary-reader-standalone')) return;
    if (actualWorkspaceActive()) return;

    try {
      localStorage.removeItem(WIDTH_KEY);
      localStorage.setItem(COLLAPSED_KEY, '0');
    } catch {}

    const panel = document.querySelector('#app .reader-page-panel');
    if (panel) {
      ['box-sizing','width','max-width','margin-left','margin-right','transform']
        .forEach((prop) => panel.style.removeProperty(prop));
    }
  }

  function syncIframeReader(frame) {
    if (!frame || !frame.isConnected) return;
    let doc;
    try {
      doc = frame.contentDocument;
    } catch {
      return;
    }
    if (!doc?.documentElement) return;

    const theme = parentTheme();
    const select = doc.querySelector('#theme-select');
    if (select && select.value !== theme) {
      select.value = theme;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Embedded Reader frames should not paint a second full-page theme background.
    doc.documentElement.style.setProperty('background', 'transparent', 'important');
    if (doc.body) {
      doc.body.style.setProperty('background', 'transparent', 'important');
      doc.body.style.setProperty('background-image', 'none', 'important');
    }
  }

  function syncVisibleSecondaryReaders() {
    document.querySelectorAll(
      'iframe.msg-secondary-reader-frame, iframe.msg-aux-reader-frame, iframe.msg-workspace-page-frame'
    ).forEach((frame) => {
      const rect = frame.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      syncIframeReader(frame);
    });
  }

  document.addEventListener('marksetgo:document-available', () => {
    resetFreshStandaloneWidth();
    [0, 50, 150, 350].forEach((delay) => {
      window.setTimeout(() => {
        resetFreshStandaloneWidth();
        syncVisibleSecondaryReaders();
      }, delay);
    });
  });

  document.addEventListener('load', (event) => {
    const frame = event.target;
    if (frame instanceof HTMLIFrameElement) {
      window.setTimeout(() => syncIframeReader(frame), 0);
      window.setTimeout(() => syncIframeReader(frame), 120);
    }
  }, true);

  window.addEventListener('pageshow', () => {
    [0, 120, 350].forEach((delay) => window.setTimeout(syncVisibleSecondaryReaders, delay));
  });
})();
