'use strict';

(() => {
  const KEY = 'markSetGoExperienceThemeV1';
  const THEMES = new Set([
    'classic','explorer','patriotic','scholar','artistic','modern','galactic','expedition'
  ]);
  const ROOT_CLASSES = [...THEMES].map(key => `msg-theme-${key}`);

  let selected = 'classic';
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && THEMES.has(saved)) selected = saved;
  } catch {}

  const root = document.documentElement;
  root.classList.remove(...ROOT_CLASSES);
  root.classList.add(`msg-theme-${selected}`);
  root.dataset.msgExperienceLayout = 'explorer';

  if (selected === 'classic') {
    delete root.dataset.msgExperienceTheme;
  } else {
    root.dataset.msgExperienceTheme = selected;
  }
})();
