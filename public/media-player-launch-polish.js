(() => {
  'use strict';

  // Media wording only.
  // Geometry ownership intentionally lives elsewhere:
  //   initial Reader launch -> reader-music-quick.js
  //   Float drag / Beside / Expanded -> media-panel.js

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

  function scheduleLabels() {
    [0, 80, 240].forEach((delay) => window.setTimeout(normalizeLabels, delay));
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (
      target.closest('[data-reader-wpm-music-toggle]') ||
      target.closest('#reader-music-wpm-chooser') ||
      target.closest('#msg-media-panel-toggle')
    ) {
      scheduleLabels();
    }
  }, true);

  document.addEventListener('change', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('#reader-music-wpm-chooser')) scheduleLabels();
  }, true);

  [
    'marksetgo:media-search-start',
    'marksetgo:media-search-results',
    'marksetgo:media-playing'
  ].forEach((name) => document.addEventListener(name, scheduleLabels));

  document.querySelector('#music-player')?.addEventListener('load', normalizeLabels);
  window.addEventListener('pageshow', normalizeLabels);

  normalizeLabels();

  window.MarkSetGoMediaLaunchPolish = Object.freeze({
    normalizeLabels,
    get geometryOwner(){ return 'reader-music-quick + media-panel'; }
  });
})();