'use strict';

(() => {
  const VALID = new Set([
    'default','explorer','patriotic','scholar','artistic','modern','galactic','expedition'
  ]);
  let appearance='default';
  try {
    const saved=JSON.parse(localStorage.getItem('markSetGoExperienceProfileV1') || 'null');
    const candidate=String(saved?.appearance || 'default').trim();
    if(VALID.has(candidate)) appearance=candidate;
  } catch {}

  const root=document.documentElement;
  root.dataset.experienceAppearance=appearance;
  root.dataset.msgExperienceLayout='explorer';
  if(appearance==='default'){
    delete root.dataset.msgExperienceTheme;
  }else{
    root.dataset.msgExperienceTheme=appearance;
  }
  root.classList.add(`msg-theme-${appearance === 'default' ? 'classic' : appearance}`);
})();
