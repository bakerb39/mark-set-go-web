(() => {
  'use strict';

  // Media Player launch polish:
  // - Initial Float opening belongs under the Reader's ▶ media button.
  // - Once the user drags the Float player, manual placement wins.
  // - "Suggested music" is presented as "Suggested media".
  // Event-driven with bounded launch retries only.

  let readerAnchorActive = true;
  let scheduled = false;

  function dock() {
    return document.querySelector('#music-dock');
  }

  function player() {
    return document.querySelector('#music-player');
  }

  function readerArrow() {
    return document.querySelector('#app [data-reader-wpm-music-toggle]');
  }

  function isFloatMode() {
    const mode = window.MarkSetGoMediaPanel?.mode;
    if (mode) return mode === 'float';
    const node = dock();
    return Boolean(node) &&
      !node.classList.contains('msg-media-beside') &&
      !node.classList.contains('msg-media-expanded');
  }

  function normalizeSuggestedMediaText(value) {
    return String(value || '')
      .replace(/Suggested music/g, 'Suggested media')
      .replace(/suggested music/g, 'suggested media');
  }

  function normalizeLabels() {
    const title = document.querySelector('#music-now-title');
    if (title) {
      const next = normalizeSuggestedMediaText(title.textContent);
      if (next !== title.textContent) title.textContent = next;
    }

    const suggestion = document.querySelector('[data-wpm-music-suggested]');
    if (suggestion) {
      const next = normalizeSuggestedMediaText(suggestion.textContent);
      if (next !== suggestion.textContent) suggestion.textContent = next;
    }

    try {
      const raw = localStorage.getItem('markSetGoMusic');
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object' && typeof saved.title === 'string') {
          const nextTitle = normalizeSuggestedMediaText(saved.title);
          if (nextTitle !== saved.title) {
            saved.title = nextTitle;
            localStorage.setItem('markSetGoMusic', JSON.stringify(saved));
          }
        }
      }
    } catch {}
  }

  function positionUnderReaderArrow() {
    const node = dock();
    const arrow = readerArrow();

    if (!readerAnchorActive || !node || node.hidden || !arrow || !isFloatMode()) {
      normalizeLabels();
      return false;
    }

    const rect = arrow.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      normalizeLabels();
      return false;
    }

    const right = Math.max(8, window.innerWidth - rect.right);
    const top = Math.max(8, rect.bottom + 8);

    node.dataset.readerChooserPositioned = '1';
    delete node.dataset.msgMediaFloatGeometry;

    node.style.setProperty('position', 'fixed', 'important');
    node.style.setProperty('left', 'auto', 'important');
    node.style.setProperty('right', `${Math.round(right)}px`, 'important');
    node.style.setProperty('top', `${Math.round(top)}px`, 'important');
    node.style.setProperty('bottom', 'auto', 'important');
    node.style.setProperty('transform', 'none', 'important');
    node.style.setProperty('margin', '0', 'important');

    normalizeLabels();
    return true;
  }

  function scheduleAnchor() {
    if (scheduled) return;
    scheduled = true;

    [0, 40, 120, 280, 650].forEach((delay, index) => {
      window.setTimeout(() => {
        positionUnderReaderArrow();
        normalizeLabels();
        if (index === 4) scheduled = false;
      }, delay);
    });
  }

  function beginFreshReaderLaunch() {
    readerAnchorActive = true;
    scheduleAnchor();
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-reader-wpm-music-toggle]')) {
      beginFreshReaderLaunch();
      return;
    }

    if (target.closest('#reader-music-wpm-chooser')) {
      scheduleAnchor();
      return;
    }

    if (target.closest('#music-close')) {
      readerAnchorActive = true;
      normalizeLabels();
      return;
    }
  }, true);

  document.addEventListener('change', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('#reader-music-wpm-chooser')) scheduleAnchor();
  }, true);

  document.addEventListener('pointerdown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const bar = target?.closest('#music-dock .music-dock-bar');
    if (!bar || !isFloatMode()) return;

    if (target.closest('button,a,input,select,textarea,[role="button"],[contenteditable="true"]')) {
      return;
    }

    readerAnchorActive = false;
    const node = dock();
    if (node) delete node.dataset.readerChooserPositioned;
  }, true);

  player()?.addEventListener('load', () => {
    normalizeLabels();
    if (readerAnchorActive) scheduleAnchor();
  });

  [
    'marksetgo:media-search-start',
    'marksetgo:media-search-results',
    'marksetgo:media-playing'
  ].forEach((name) => {
    document.addEventListener(name, () => {
      normalizeLabels();
      if (readerAnchorActive) scheduleAnchor();
    });
  });

  window.addEventListener('resize', () => {
    if (readerAnchorActive) scheduleAnchor();
  });

  window.addEventListener('pageshow', normalizeLabels);

  normalizeLabels();

  window.MarkSetGoMediaLaunchPolish = Object.freeze({
    anchor:() => {
      readerAnchorActive = true;
      return positionUnderReaderArrow();
    },
    releaseAnchor:() => {
      readerAnchorActive = false;
      const node = dock();
      if (node) delete node.dataset.readerChooserPositioned;
      return true;
    },
    normalizeLabels,
    get anchored(){ return readerAnchorActive; }
  });
})();