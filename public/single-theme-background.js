'use strict';

/*
 * Mark, Set, Go! — single continuous experience background v1.0.0
 *
 * The legacy theme layer renders three scenery images (left / top / right).
 * The main application now uses only the active theme's center/top artwork as
 * one fixed full-viewport body background. The old scenery assembly is hidden.
 *
 * No MutationObserver: refreshes occur at startup and on explicit theme/profile
 * change signals only. Workspace-pane.html intentionally does not load this file;
 * the outer application remains the background owner.
 */
(() => {
  const root = document.documentElement;
  const scenicThemes = new Set([
    'explorer', 'patriotic', 'scholar', 'artistic', 'modern', 'galactic', 'expedition'
  ]);

  const backgroundSource = () => {
    const image = document.querySelector('.explorer-world-art__top');
    if (!image) return '';
    return String(image.currentSrc || image.src || image.getAttribute('src') || '').trim();
  };

  function clearSingleBackground() {
    root.classList.remove('msg-single-theme-background');
    const body = document.body;
    if (!body) return;
    [
      'background-image',
      'background-size',
      'background-position',
      'background-repeat',
      'background-attachment'
    ].forEach((property) => body.style.removeProperty(property));
  }

  function applySingleBackground() {
    const body = document.body;
    if (!body) return false;

    const theme = String(root.dataset.msgExperienceTheme || root.dataset.experienceAppearance || '').trim();
    if (!scenicThemes.has(theme)) {
      clearSingleBackground();
      return true;
    }

    const src = backgroundSource();
    if (!src) return false;

    // Inline !important deliberately outranks the older theme sheets that paint
    // body/theme surfaces. One image now owns the complete viewport.
    body.style.setProperty('background-image', `url(${JSON.stringify(src)})`, 'important');
    body.style.setProperty('background-size', 'cover', 'important');
    body.style.setProperty('background-position', 'center center', 'important');
    body.style.setProperty('background-repeat', 'no-repeat', 'important');
    body.style.setProperty('background-attachment', 'fixed', 'important');
    root.classList.add('msg-single-theme-background');
    return true;
  }

  function refreshWithShortRetries() {
    if (applySingleBackground()) return;
    // Theme artwork is created by deferred theme code. A few bounded startup
    // retries avoid an observer while still allowing that code to finish first.
    [0, 40, 120, 260].forEach((delay) => {
      window.setTimeout(() => applySingleBackground(), delay);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshWithShortRetries, { once: true });
  } else {
    refreshWithShortRetries();
  }

  window.addEventListener('pageshow', refreshWithShortRetries);
  window.addEventListener('storage', (event) => {
    if (event.key === 'markSetGoExperienceProfileV1') refreshWithShortRetries();
  });
  document.addEventListener('marksetgo:experience-profile-changed', () => {
    window.requestAnimationFrame(refreshWithShortRetries);
  });
})();
