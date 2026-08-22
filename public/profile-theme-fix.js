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

  window.MarkSetGoProfileThemeFix = Object.freeze({ apply: applyTheme });
})();


/* Topic Feed bookmark fallback.
   Uses the Reader's established markSetGoReaderPageBookmarksV1 store and then
   triggers the Reader's existing scroll-bound marker refresh. */
(() => {
  const READER_BOOKMARKS_KEY = 'markSetGoReaderPageBookmarksV1';

  function currentReaderDocument() {
    try {
      return window.MarkSetGoCurrentReaderDocument?.get?.() || null;
    } catch {
      return null;
    }
  }

  function pageForReader(reader) {
    if (!reader) return { pageNumber: 1, pageKey: 'scroll-page-1', side: 'single' };

    if (reader.classList.contains('book-pages-layout')) {
      const spreadWidth = Math.max(1, reader.clientWidth);
      const spreadIndex = Math.max(0, Math.round((Number(reader.scrollLeft) || 0) / spreadWidth));
      const pageNumber = spreadIndex * 2 + 1;
      return { pageNumber, pageKey: `book-page-${pageNumber}`, side: 'left' };
    }

    const viewportHeight = Math.max(1, reader.clientHeight);
    const pageNumber = Math.max(1, Math.floor((Number(reader.scrollTop) || 0) / viewportHeight) + 1);
    return { pageNumber, pageKey: `scroll-page-${pageNumber}`, side: 'single' };
  }

  function addCurrentPageBookmark(button) {
    const reader = document.querySelector('#reader');
    const doc = currentReaderDocument();
    const documentId = String(doc?.documentId || doc?.id || '').trim();
    if (!reader || !documentId) return false;

    const page = pageForReader(reader);
    let items = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(READER_BOOKMARKS_KEY) || '[]');
      items = Array.isArray(parsed) ? parsed : [];
    } catch {}

    const exists = items.some((item) =>
      String(item?.documentId || '') === documentId &&
      String(item?.pageKey || '') === page.pageKey
    );

    if (!exists) {
      items.push({
        id: `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        documentId,
        title: String(doc?.title || document.querySelector('.reader-title-copy h1')?.textContent || 'Untitled'),
        wordIndex: 0,
        pageNumber: page.pageNumber,
        pageKey: page.pageKey,
        side: page.side,
        createdAt: new Date().toISOString()
      });
      try {
        localStorage.setItem(READER_BOOKMARKS_KEY, JSON.stringify(items));
      } catch {
        return false;
      }
    }

    /* ReaderLegacyRuntime already refreshes page-bookmark markers on reader scroll. */
    reader.dispatchEvent(new Event('scroll'));

    if (button) {
      const original = button.textContent;
      button.textContent = exists ? '✓ Bookmarked' : '✓ Bookmark added';
      window.setTimeout(() => {
        if (button.isConnected) button.textContent = original || '＋ Bookmark';
      }, 900);
    }
    return true;
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('#add-bookmark.topic-reader-bookmark-button');
    if (!button) return;

    /* Let a working native listener win. This fallback runs at the end of the
       same turn only when no bookmark appeared. */
    const before = (() => {
      try { return localStorage.getItem(READER_BOOKMARKS_KEY) || '[]'; }
      catch { return '[]'; }
    })();

    window.setTimeout(() => {
      const after = (() => {
        try { return localStorage.getItem(READER_BOOKMARKS_KEY) || '[]'; }
        catch { return '[]'; }
      })();
      if (after === before) addCurrentPageBookmark(button);
    }, 0);
  }, true);
})();
