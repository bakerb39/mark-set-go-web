'use strict';

(() => {
  const THEMES = new Set([
    'default','explorer','patriotic','scholar','artistic','modern','galactic','expedition'
  ]);

  const STORAGE_KEY = 'markSetGoExperienceProfileV1';

  function readStoredTheme() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      const candidate = String(saved?.appearance || '').trim();
      return THEMES.has(candidate) ? candidate : 'default';
    } catch {
      return 'default';
    }
  }

  function applyTheme(theme = readStoredTheme()) {
    const value = THEMES.has(theme) ? theme : 'default';
    const root = document.documentElement;
    root.dataset.experienceAppearance = value;
    root.dataset.msgExperienceTheme = value;
  }

  applyTheme();

  // Keep standalone pages (for example Comparison Workspace) synchronized when
  // the active theme changes in another Mark, Set, Go! tab.
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) applyTheme();
  });

  document.addEventListener('marksetgo:experience-profile-changed', event => {
    const candidate = String(event.detail?.profile?.appearance || '').trim();
    applyTheme(THEMES.has(candidate) ? candidate : readStoredTheme());
  });
})();
