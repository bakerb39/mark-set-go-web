/* Mark, Set, Go! Profile theme bridge v1.2.0
   Robust parent/app synchronization for theme changes made from Profile.
   No MutationObserver. */
(() => {
  'use strict';

  const KNOWN = new Set([
    'classic', 'explorer', 'patriotic', 'scholar',
    'artistic', 'modern', 'galactic', 'expedition'
  ]);

  const normalize = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'default') return 'classic';
    return KNOWN.has(raw) ? raw : '';
  };

  function themeFromControl(control) {
    if (!(control instanceof Element)) return '';

    const candidates = [
      control.getAttribute('data-msg-theme'),
      control.getAttribute('data-theme'),
      control.getAttribute('data-experience-theme'),
      control.getAttribute('data-appearance'),
      control.getAttribute('value'),
      control.value,
      control.dataset?.value
    ];

    for (const candidate of candidates) {
      const theme = normalize(candidate);
      if (theme) return theme;
    }

    const text = String(control.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    for (const theme of KNOWN) {
      if (text === theme || text.startsWith(`${theme} `)) return theme;
    }

    return '';
  }

  function applyTo(targetWindow, theme) {
    if (!targetWindow) return false;

    try {
      const themes = targetWindow.MarkSetGoExperienceThemes;
      if (typeof themes?.apply === 'function') {
        themes.apply(theme);
        return true;
      }

      const profile = targetWindow.MarkSetGoExperienceProfile;
      if (typeof profile?.get === 'function' && typeof profile?.save === 'function') {
        const current = profile.get() || {};
        profile.save({
          preset: current.preset,
          appearance: theme === 'classic' ? 'default' : theme,
          features: { ...(current.features || {}) }
        });
        return true;
      }
    } catch (error) {
      console.warn('Unable to apply Mark, Set, Go! theme:', error);
    }

    return false;
  }

  function applyTheme(value) {
    const theme = normalize(value);
    if (!theme) return false;

    let parentApplied = false;

    if (window.parent && window.parent !== window) {
      try {
        if (window.parent.location.origin === window.location.origin) {
          parentApplied = applyTo(window.parent, theme);
        }
      } catch {}
    }

    const localApplied = applyTo(window, theme);

    if (!parentApplied && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(
          { type: 'msg-workspace-theme-change', theme },
          window.location.origin
        );
      } catch {}
    }

    return parentApplied || localApplied;
  }

  function relevantControl(target) {
    if (!(target instanceof Element)) return null;

    return target.closest?.([
      '[data-msg-theme]',
      '[data-theme]',
      '[data-experience-theme]',
      '[data-appearance]',
      'select[name*="appearance" i]',
      'select[id*="appearance" i]',
      'select[name*="theme" i]',
      'select[id*="theme" i]',
      'input[name*="appearance" i]',
      'input[name*="theme" i]',
      'button',
      '[role="button"]'
    ].join(','));
  }

  document.addEventListener('change', (event) => {
    const control = relevantControl(event.target);
    if (!control) return;

    const theme = themeFromControl(control);
    if (!theme) return;

    applyTheme(theme);
  }, true);

  document.addEventListener('click', (event) => {
    const control = relevantControl(event.target);
    if (!control) return;

    const theme = themeFromControl(control);
    if (!theme) return;

    applyTheme(theme);
  }, true);

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== 'msg-workspace-theme-change') return;
    applyTo(window, normalize(event.data.theme));
  });

  window.MarkSetGoProfileThemeFix = Object.freeze({
    apply: applyTheme
  });
})();
