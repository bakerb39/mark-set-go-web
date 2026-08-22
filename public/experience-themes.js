'use strict';

(() => {
  const THEMES = Object.freeze({
    default:{label:'Default',description:'The original Mark, Set, Go! navy, blue, and white appearance.'},
    explorer:{label:'Explorer',description:'Maps, natural history, expedition scenery, green and brass.'},
    patriotic:{label:'Patriotic',description:'American history, navy, ivory, restrained red and brass.'},
    scholar:{label:'Scholar',description:'Old library, manuscripts, walnut, burgundy and parchment.'},
    artistic:{label:'Artistic',description:'Studio and gallery atmosphere with warm creative color.'},
    modern:{label:'Modern',description:'Clean architecture, restrained geometry and minimal surfaces.'},
    galactic:{label:'Galactic',description:'Original space-opera atmosphere with stars and luminous instruments.'},
    expedition:{label:'Expedition',description:'Original archaeology-adventure atmosphere with maps, ruins and field journals.'}
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

  function apply(value) {
    const theme = syncVisualState(value);
    const profileApi = window.MarkSetGoExperienceProfile;
    if (!profileApi?.get || !profileApi?.save) return theme;

    const profile = profileApi.get();
    profileApi.save({
      preset:profile.preset,
      appearance:theme,
      features:{...(profile.features || {})}
    });
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
              <strong>${esc(theme.label)}</strong>
              <small>${esc(theme.description)}</small>
            </button>`).join('')}
        </div>
      </section>`;

    document.body.appendChild(dialog);
    dialog.querySelector('.msg-theme-close')?.addEventListener('click', close);
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    dialog.querySelectorAll('[data-msg-theme]').forEach(button => {
      button.addEventListener('click', () => {
        apply(button.dataset.msgTheme);
        close();
      });
    });
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

    document.addEventListener('click', event => {
      const button = event.target instanceof Element
        ? event.target.closest('[data-profile-appearance]')
        : null;
      if (!button) return;
      const requested = String(button.dataset.profileAppearance || '').trim();
      if (!Object.prototype.hasOwnProperty.call(THEMES, requested)) return;
      event.preventDefault();
      apply(requested);
    });

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
