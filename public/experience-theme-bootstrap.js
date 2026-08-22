'use strict';

(() => {
  const THEMES = new Set([
    'default','explorer','patriotic','scholar','artistic','modern','galactic','expedition'
  ]);

  let theme = 'default';
  try {
    const saved = JSON.parse(localStorage.getItem('markSetGoExperienceProfileV1') || 'null');
    const candidate = String(saved?.appearance || '').trim();
    if (THEMES.has(candidate)) theme = candidate;
  } catch {}

  const root = document.documentElement;
  root.dataset.experienceAppearance = theme;
  root.dataset.msgExperienceTheme = theme;
})();
