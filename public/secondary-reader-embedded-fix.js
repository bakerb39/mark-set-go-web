(() => {
  'use strict';

  if (!window.__MSG_SECONDARY_READER__) return;

  function forceEmbeddedLightReader() {
    const reader = document.querySelector('#reader');
    if (!reader) return false;

    const themeSelect = document.querySelector('#theme-select');
    const fsThemeSelect = document.querySelector('#fs-theme-select');

    if (themeSelect && themeSelect.value !== 'light') {
      themeSelect.value = 'light';
      themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (fsThemeSelect && fsThemeSelect.value !== 'light') {
      fsThemeSelect.value = 'light';
      fsThemeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // bindAppearance() uses this class as the actual Reader presentation state.
    reader.classList.add('light');
    return true;
  }

  function clearEmbeddedStandaloneWidth() {
    const app = document.querySelector('#app');
    const shell = document.querySelector('#app .reader-page-panel, #app .empty-reader-page');

    // Reader 2+ width is owned by the parent workspace tab/pane.
    [app, shell].forEach((node) => {
      if (!node) return;
      node.style.removeProperty('width');
      node.style.removeProperty('max-width');
      node.style.removeProperty('min-width');
      node.style.removeProperty('left');
      node.style.removeProperty('right');
      node.style.removeProperty('transform');
    });

    document.body.classList.remove('msg-primary-reader-standalone');
    document.querySelector('#msg-reader-window-toggle')?.remove();
    document.querySelectorAll('.msg-primary-reader-resize-grip').forEach((node) => node.remove());
  }

  function clearEmbeddedThemeBackground() {
    const html = document.documentElement;
    const body = document.body;
    [html, body].forEach((node) => {
      if (!node) return;
      node.style.setProperty('background', 'transparent', 'important');
      node.style.setProperty('background-color', 'transparent', 'important');
      node.style.setProperty('background-image', 'none', 'important');
    });

    document.querySelectorAll('.explorer-world-art, .msg-vd-center-work-surface, #msg-vd-surface-handle').forEach((node) => {
      node.style.setProperty('display', 'none', 'important');
      node.style.setProperty('background', 'none', 'important');
      node.style.setProperty('background-image', 'none', 'important');
    });
  }

  function releaseFirstPaintShield() {
    document.documentElement.classList.remove('msg-secondary-reader-booting');
  }

  function normalizeEmbeddedReader() {
    clearEmbeddedStandaloneWidth();
    clearEmbeddedThemeBackground();
    const readerReady = forceEmbeddedLightReader();
    if (readerReady) releaseFirstPaintShield();
  }

  function scheduleNormalize() {
    [0, 40, 120, 260, 500, 900].forEach((delay) => {
      window.setTimeout(normalizeEmbeddedReader, delay);
    });
  }

  // Normalize around the actual Reader render functions rather than watching
  // the DOM. This keeps the fix bounded and avoids MutationObserver.
  if (typeof window.renderReaderWithText === 'function') {
    const originalRenderReaderWithText = window.renderReaderWithText;
    window.renderReaderWithText = function embeddedReaderRenderWithText(...args) {
      const result = originalRenderReaderWithText.apply(this, args);
      scheduleNormalize();
      return result;
    };
  }

  if (typeof window.applyReaderSessionSnapshot === 'function') {
    const originalApplyReaderSessionSnapshot = window.applyReaderSessionSnapshot;
    window.applyReaderSessionSnapshot = function embeddedReaderApplySnapshot(...args) {
      const result = originalApplyReaderSessionSnapshot.apply(this, args);
      scheduleNormalize();
      return result;
    };
  }

  document.addEventListener('DOMContentLoaded', scheduleNormalize, { once: true });
  window.addEventListener('load', scheduleNormalize, { once: true });
  window.addEventListener('pageshow', scheduleNormalize);
  document.addEventListener('marksetgo:document-available', scheduleNormalize);
  document.addEventListener('marksetgo:reader-session-changed', scheduleNormalize);
  document.addEventListener('marksetgo:experience-profile-changed', scheduleNormalize);
  document.addEventListener('marksetgo:experience-theme-changed', scheduleNormalize);

  scheduleNormalize();
})();
