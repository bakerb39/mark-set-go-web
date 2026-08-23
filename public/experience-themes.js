'use strict';

(() => {
  const THEMES = Object.freeze({
    default:{label:'Default',description:'The original Mark, Set, Go! navy, blue, and white appearance.',colors:['#07182d','#0c2340','#d5a928','#ffffff','#eef1f4']},
    explorer:{label:'Explorer',description:'Maps, natural history, expedition scenery, green and brass.',colors:['#1f5149','#317165','#c5a152','#fffdf7','#e9dfc9']},
    patriotic:{label:'Patriotic',description:'American history, navy, ivory, restrained red and brass.',colors:['#0d2341','#17365f','#c7a44d','#fffdf8','#e7e9ed']},
    scholar:{label:'Scholar',description:'Old library, manuscripts, walnut, burgundy and parchment.',colors:['#32151c','#5a2330','#b38b42','#fff9ea','#d8cfbb']},
    artistic:{label:'Artistic',description:'Studio and gallery atmosphere with warm creative color.',colors:['#41233b','#6d3f63','#bd8d52','#fffaf4','#e6ddd6']},
    modern:{label:'Modern',description:'Clean architecture, restrained geometry and minimal surfaces.',colors:['#111b24','#263746','#9aa6ae','#ffffff','#e9edf0']},
    galactic:{label:'Galactic',description:'Original space-opera atmosphere with stars and luminous instruments.',colors:['#07101e','#17253f','#d8bd65','#f8fbff','#060a12']},
    expedition:{label:'Expedition',description:'Original archaeology-adventure atmosphere with maps, ruins and field journals.',colors:['#3d281a','#66452c','#b68232','#fff6df','#c8b58d']}
  });

  let dialog = null;

  function esc(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[char]));
  }

  function validTheme(value) {
    const key = String(value || '').trim();
    return Object.prototype.hasOwnProperty.call(THEMES, key) ? key : 'default';
  }

  function storedTheme() {
    try {
      const saved = JSON.parse(localStorage.getItem('markSetGoExperienceProfileV1') || 'null');
      return validTheme(saved?.appearance);
    } catch {
      return 'default';
    }
  }

  function current() {
    return validTheme(document.documentElement.dataset.msgExperienceTheme || storedTheme());
  }

  function syncVisualState(value) {
    const theme = validTheme(value);
    const root = document.documentElement;
    root.dataset.experienceAppearance = theme;
    root.dataset.msgExperienceTheme = theme;
    refreshPressed(theme);
    return theme;
  }

  function isWorkspacePane() {
    return window.parent !== window
      && new URLSearchParams(window.location.search).has('msgWorkspaceMode');
  }

  function syncOuterTheme(theme) {
    if (!isWorkspacePane()) return;
    try {
      if (window.parent.location.origin !== window.location.origin) return;
      const parentThemes = window.parent.MarkSetGoExperienceThemes;
      if (typeof parentThemes?.apply === 'function') {
        parentThemes.apply(theme);
        return;
      }

      // Startup fallback: keep the outer document visually synchronized even
      // if its theme controller has not finished initializing yet.
      const parentRoot = window.parent.document?.documentElement;
      if (!parentRoot) return;
      parentRoot.dataset.experienceAppearance = theme;
      parentRoot.dataset.msgExperienceTheme = theme;
    } catch (error) {
      console.warn('Workspace could not synchronize theme with outer app.', error);
    }
  }

  function apply(value) {
    const theme = syncVisualState(value);
    const profileApi = window.MarkSetGoExperienceProfile;

    if (profileApi?.get && profileApi?.save) {
      const profile = profileApi.get();
      profileApi.save({
        preset:profile.preset,
        appearance:theme,
        features:{...(profile.features || {})}
      });
    }

    // A workspace pane is a secondary view. Finish the normal local theme path
    // first, then make the OUTER app the owner of the page-level background.
    syncOuterTheme(theme);
    return theme;
  }

  function ensureLauncher() {
    let launcher = document.querySelector('#msg-theme-launcher');
    if (launcher) return launcher;
    const profile = document.querySelector('.top-level-nav-button[data-action="profile-preferences"]');
    if (!profile?.parentElement) return null;

    launcher = document.createElement('button');
    launcher.id = 'msg-theme-launcher';
    launcher.type = 'button';
    launcher.className = 'top-level-nav-button';
    launcher.innerHTML = '<span class="nav-icon" aria-hidden="true">✦</span> Themes';
    launcher.addEventListener('click', open);
    profile.insertAdjacentElement('afterend', launcher);
    return launcher;
  }

  function ensureDialog() {
    if (dialog) return dialog;

    dialog = document.createElement('div');
    dialog.id = 'msg-theme-dialog';
    dialog.hidden = true;
    dialog.innerHTML = `
      <section class="msg-theme-card" role="dialog" aria-modal="true" aria-labelledby="msg-theme-title">
        <div class="msg-theme-head">
          <h2 id="msg-theme-title">Experience Theme</h2>
          <button class="msg-theme-close" type="button" aria-label="Close">×</button>
        </div>
        <div class="msg-theme-grid">
          ${Object.entries(THEMES).map(([key, theme]) => `
            <button type="button" class="msg-theme-choice" data-msg-theme="${esc(key)}" aria-pressed="false">
              <span class="msg-theme-swatches" aria-hidden="true">${theme.colors.map(color => `<span style="background:${esc(color)}"></span>`).join('')}</span>
              <strong>${esc(theme.label)}</strong>
              <small>${esc(theme.description)}</small>
            </button>`).join('')}
        </div>
      </section>`;

    document.body.appendChild(dialog);
    dialog.querySelector('.msg-theme-close')?.addEventListener('click', close);
    dialog.querySelectorAll('[data-msg-theme]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        apply(button.dataset.msgTheme);
        close();
      });
    });
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !dialog.hidden) close();
    });
    return dialog;
  }

  function refreshPressed(theme = current()) {
    const selected = validTheme(theme);

    dialog?.querySelectorAll('[data-msg-theme]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.msgTheme === selected));
    });

    document.querySelectorAll('[data-profile-appearance]').forEach(button => {
      const active = button.dataset.profileAppearance === selected;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      const check = button.querySelector('.profile-preset-check');
      if (check) check.textContent = active ? '✓' : '';
    });
  }

  function open() {
    ensureDialog();
    refreshPressed();
    dialog.hidden = false;
    dialog.querySelector(`[data-msg-theme="${current()}"]`)?.focus();
  }

  function close() {
    if (dialog) dialog.hidden = true;
  }

  function init() {
    ensureLauncher();
    ensureDialog();
    syncVisualState(document.documentElement.dataset.msgExperienceTheme || storedTheme());

    document.addEventListener('marksetgo:experience-profile-changed', event => {
      syncVisualState(event.detail?.profile?.appearance);
    });
  }

  window.MarkSetGoExperienceThemes = Object.freeze({
    apply,
    current,
    themes:THEMES
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once:true});
  } else {
    init();
  }
})();
