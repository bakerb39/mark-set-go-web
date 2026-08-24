'use strict';

/*
 * Mark, Set, Go! — single continuous experience background v2.0.0
 *
 * One dedicated full-width image now owns each scenic experience theme.
 * The legacy left / top / right artwork remains in the repository for
 * compatibility, but it no longer participates visually.
 *
 * No MutationObserver: refreshes occur at startup and on explicit theme/profile
 * change signals only. Workspace-pane.html intentionally does not load this file;
 * the outer application remains the background owner.
 */
(() => {
  const root = document.documentElement;

  const BACKGROUNDS = Object.freeze({
    explorer:'/assets/themes/full/explorer-background.png?v=20260824-full-v1',
    patriotic:'/assets/themes/full/patriotic-background.png?v=20260824-full-v1',
    scholar:'/assets/themes/full/scholar-background.png?v=20260824-full-v1',
    artistic:'/assets/themes/full/artistic-background.png?v=20260824-full-v1',
    modern:'/assets/themes/full/modern-background.png?v=20260824-full-v1',
    galactic:'/assets/themes/full/galactic-background.png?v=20260824-full-v1',
    expedition:'/assets/themes/full/expedition-background.png?v=20260824-full-v1'
  });

  const scenicThemes = new Set(Object.keys(BACKGROUNDS));

  const legacyScenerySelector = [
    '.explorer-world-art',
    '.explorer-world-art__left',
    '.explorer-world-art__right',
    '.explorer-world-art__top'
  ].join(',');

  function cssUrl(src) {
    return `url(${JSON.stringify(src)})`;
  }

  function hideLegacyScenery() {
    document.querySelectorAll(legacyScenerySelector).forEach((node) => {
      node.style.setProperty('display', 'none', 'important');
      node.style.setProperty('visibility', 'hidden', 'important');
      node.setAttribute('aria-hidden', 'true');
    });
  }

  function syncSceneVariables(theme) {
    const src = BACKGROUNDS[theme] || '';
    const image = src ? cssUrl(src) : 'none';

    // Keep the older three-layer layout sheet harmless. If it renders before
    // this script's body override, it now has only ONE center/cover image.
    root.style.setProperty('--msg-scene-full', image);
    root.style.setProperty('--msg-scene-left', 'none');
    root.style.setProperty('--msg-scene-center', image);
    root.style.setProperty('--msg-scene-right', 'none');
  }

  function clearSingleBackground() {
    root.classList.remove('msg-single-theme-background');
    syncSceneVariables('');

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

    hideLegacyScenery();

    const theme = String(
      root.dataset.msgExperienceTheme ||
      root.dataset.experienceAppearance ||
      ''
    ).trim();

    if (!scenicThemes.has(theme)) {
      clearSingleBackground();
      return true;
    }

    const src = BACKGROUNDS[theme];
    if (!src) return false;

    syncSceneVariables(theme);

    // Inline !important deliberately outranks older theme sheets and any
    // three-piece body scenery. One clear image owns the complete viewport.
    body.style.setProperty('background-image', cssUrl(src), 'important');
    body.style.setProperty('background-size', 'cover', 'important');
    body.style.setProperty('background-position', 'center center', 'important');
    body.style.setProperty('background-repeat', 'no-repeat', 'important');
    body.style.setProperty('background-attachment', 'fixed', 'important');

    root.classList.add('msg-single-theme-background');
    return true;
  }

  function refreshWithShortRetries() {
    applySingleBackground();

    // Theme/scenery nodes are created by deferred code. Bounded retries ensure
    // legacy art stays hidden without introducing an observer.
    [0, 40, 120, 260].forEach((delay) => {
      window.setTimeout(() => applySingleBackground(), delay);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshWithShortRetries, { once:true });
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
