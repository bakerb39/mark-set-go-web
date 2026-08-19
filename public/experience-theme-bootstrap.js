'use strict';

(() => {
  const PROFILE_KEY = 'markSetGoExperienceProfileV1';
  const APPEARANCES = new Set([
    'default','explorer','patriotic','scholar','artistic','modern','galactic','expedition'
  ]);
  const ROOT_CLASSES = [
    'msg-theme-classic','msg-theme-explorer','msg-theme-patriotic','msg-theme-scholar',
    'msg-theme-artistic','msg-theme-modern','msg-theme-galactic','msg-theme-expedition'
  ];

  let appearance = 'default';
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    if (profile && APPEARANCES.has(String(profile.appearance || ''))) {
      appearance = String(profile.appearance);
    }
  } catch {}

  const root = document.documentElement;
  root.classList.remove(...ROOT_CLASSES);
  root.classList.add(appearance === 'default' ? 'msg-theme-classic' : `msg-theme-${appearance}`);
  root.dataset.msgExperienceLayout = 'explorer';

  if (appearance === 'default') {
    delete root.dataset.msgExperienceTheme;
  } else {
    root.dataset.msgExperienceTheme = appearance;
  }
})();
