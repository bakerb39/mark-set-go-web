/* Mark, Set, Go! Profile theme control fix v1.0.0
   Makes existing Profile theme choices call the same experience-theme API
   formerly used by the top-level Themes dialog. No MutationObserver. */
(() => {
  'use strict';

  const KNOWN = new Set([
    'classic', 'explorer', 'patriotic', 'scholar',
    'artistic', 'modern', 'galactic', 'expedition'
  ]);

  const APPEARANCE_TO_THEME = {
    default: 'classic',
    explorer: 'explorer',
    patriotic: 'patriotic',
    scholar: 'scholar',
    artistic: 'artistic',
    modern: 'modern',
    galactic: 'galactic',
    expedition: 'expedition'
  };

  function normalize(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (KNOWN.has(raw)) return raw;
    if (APPEARANCE_TO_THEME[raw]) return APPEARANCE_TO_THEME[raw];
    return '';
  }

  function themeFromControl(control) {
    if (!(control instanceof Element)) return '';

    const candidates = [
      control.getAttribute('data-msg-theme'),
      control.getAttribute('data-theme'),
      control.getAttribute('data-experience-theme'),
      control.getAttribute('data-appearance'),
      control.getAttribute('value'),
      control.dataset?.value
    ];

    for (const candidate of candidates) {
      const theme = normalize(candidate);
      if (theme) return theme;
    }

    const label = String(control.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    for (const theme of KNOWN) {
      if (label === theme || label.startsWith(`${theme} `)) return theme;
    }

    return '';
  }

  function applyTheme(theme) {
    const key = normalize(theme);
    if (!key) return false;

    const api = window.MarkSetGoExperienceThemes;
    if (api && typeof api.apply === 'function') {
      api.apply(key);
      return true;
    }

    const profile = window.MarkSetGoExperienceProfile;
    if (profile?.get && profile?.save) {
      const current = profile.get() || {};
      profile.save({
        preset: current.preset,
        appearance: key === 'classic' ? 'default' : key,
        features: { ...(current.features || {}) }
      });
      return true;
    }

    return false;
  }

  document.addEventListener('click', (event) => {
    const page = event.target.closest?.('.profile-preferences-page');
    if (!page) return;

    const control = event.target.closest?.(
      '[data-msg-theme], [data-theme], [data-experience-theme], [data-appearance], button, [role="button"]'
    );
    if (!control || !page.contains(control)) return;

    const theme = themeFromControl(control);
    if (!theme) return;

    applyTheme(theme);
  }, true);

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('.profile-preferences-page')) return;

    const theme = themeFromControl(target);
    if (!theme) return;

    applyTheme(theme);
  }, true);

  window.MarkSetGoProfileThemeFix = Object.freeze({ apply: applyTheme });
})();
