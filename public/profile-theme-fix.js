/* Mark, Set, Go! Profile theme control fix v1.1.0
   A theme selected inside the workspace Profile pane is applied to the OUTER
   Mark, Set, Go! application first, then mirrored into the pane.
   No MutationObserver. */
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
    return APPEARANCE_TO_THEME[raw] || '';
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

  function applyThroughWindow(targetWindow, theme) {
    if (!targetWindow) return false;

    try {
      const api = targetWindow.MarkSetGoExperienceThemes;
      if (api && typeof api.apply === 'function') {
        api.apply(theme);
        return true;
      }

      const profile = targetWindow.MarkSetGoExperienceProfile;
      if (profile?.get && profile?.save) {
        const current = profile.get() || {};
        profile.save({
          preset: current.preset,
          appearance: theme === 'classic' ? 'default' : theme,
          features: { ...(current.features || {}) }
        });
        return true;
      }
    } catch (error) {
      console.warn('Theme application failed in target window:', error);
    }

    return false;
  }

  function applyTheme(theme) {
    const key = normalize(theme);
    if (!key) return false;

    let outerApplied = false;

    // Workspace panes are same-origin. The Reader lives in parent, so parent
    // must own the persistent profile/theme change.
    if (window.parent && window.parent !== window) {
      try {
        if (window.parent.location.origin === window.location.origin) {
          outerApplied = applyThroughWindow(window.parent, key);
        }
      } catch {}
    }

    // Mirror the resulting choice into this document as well so the Profile
    // pane visually follows the Reader immediately.
    const localApplied = applyThroughWindow(window, key);

    // If parent is not directly available for some future reason, ask it to
    // apply the theme through the workspace message bridge.
    if (!outerApplied && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(
          { type: 'msg-workspace-theme-change', theme: key },
          window.location.origin
        );
      } catch {}
    }

    return outerApplied || localApplied;
  }

  function handleControl(control) {
    const theme = themeFromControl(control);
    if (!theme) return false;
    return applyTheme(theme);
  }

  document.addEventListener('click', (event) => {
    const page = event.target.closest?.('.profile-preferences-page');
    if (!page) return;

    const control = event.target.closest?.(
      '[data-msg-theme], [data-theme], [data-experience-theme], [data-appearance], button, [role="button"]'
    );
    if (!control || !page.contains(control)) return;

    handleControl(control);
  }, true);

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('.profile-preferences-page')) return;

    handleControl(target);
  }, true);

  window.MarkSetGoProfileThemeFix = Object.freeze({
    apply: applyTheme
  });
})();
