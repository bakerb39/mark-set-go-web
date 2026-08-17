(() => {
  'use strict';

  const CLOSE_SELECTOR = '[data-askmark-close]';
  const MUSIC_SELECTOR = '[data-reader-wpm-music-toggle]';
  const FULLSCREEN_SELECTOR = '#toggle-reader-fullscreen';

  function closeCompanionPanel(event) {
    const target = event?.target?.closest?.(CLOSE_SELECTOR);
    if (!target) return false;

    event.preventDefault();
    event.stopImmediatePropagation();

    const layout = document.querySelector('#app #reader-layout');
    if (layout) layout.classList.add('word-panel-hidden');

    const markButton = document.querySelector('#app #toggle-mark-panel');
    const toolsButton = document.querySelector('#app #toggle-word-panel');

    for (const button of [markButton, toolsButton]) {
      button?.setAttribute('aria-pressed', 'false');
      button?.classList.add('pane-closed');
    }

    // Fire resize so book-page and reader measurements settle after the pane closes.
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return true;
  }

  // Capture before any Ask Mark/Chad handlers. Pointerdown makes the close action
  // work even if a later click listener is lost during a panel rerender.
  document.addEventListener('pointerdown', closeCompanionPanel, true);
  document.addEventListener('click', closeCompanionPanel, true);

  let scheduled = false;

  function positionMusicAboveFullscreen() {
    scheduled = false;

    const app = document.querySelector('#app');
    const music = app?.querySelector(MUSIC_SELECTOR);
    const fullscreen = app?.querySelector(FULLSCREEN_SELECTOR);
    const controls = fullscreen?.closest('.reader-pane-controls');

    if (!music || !fullscreen || !controls) return;

    // Restore the original Full screen control completely. The hotfix moves ONLY
    // the music icon and does not touch the companion panel/header.
    for (const property of ['position','top','right','bottom','left','margin','transform','z-index']) {
      fullscreen.style.removeProperty(property);
    }

    controls.style.setProperty('position', 'relative', 'important');
    controls.style.setProperty('overflow', 'visible', 'important');

    // First neutralize every prior music positioning rule.
    music.style.setProperty('position', 'absolute', 'important');
    music.style.setProperty('right', 'auto', 'important');
    music.style.setProperty('bottom', 'auto', 'important');
    music.style.setProperty('margin', '0', 'important');
    music.style.setProperty('transform', 'none', 'important');
    music.style.setProperty('z-index', '30', 'important');

    const controlsRect = controls.getBoundingClientRect();
    const fullRect = fullscreen.getBoundingClientRect();
    const musicRect = music.getBoundingClientRect();

    const width = musicRect.width || 30;
    const height = musicRect.height || 30;

    // Match Full screen's RIGHT EDGE and place Music 8px ABOVE it.
    const left = Math.max(0, fullRect.right - controlsRect.left - width);
    const top = fullRect.top - controlsRect.top - height - 8;

    music.style.setProperty('left', `${Math.round(left)}px`, 'important');
    music.style.setProperty('top', `${Math.round(top)}px`, 'important');
  }

  function schedulePosition() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(positionMusicAboveFullscreen);
  }

  // Re-apply after Reader rerenders, companion opens/closes, and viewport changes.
  const observer = new MutationObserver(schedulePosition);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'style']
  });

  window.addEventListener('resize', schedulePosition, { passive: true });
  window.addEventListener('scroll', schedulePosition, { passive: true });
  document.addEventListener('marksetgo:document-available', schedulePosition);

  // Keep the close X clickable without changing its layout coordinates.
  function protectCloseButton() {
    document.querySelectorAll(CLOSE_SELECTOR).forEach((button) => {
      button.style.setProperty('pointer-events', 'auto', 'important');
      button.style.setProperty('cursor', 'pointer', 'important');
      button.style.setProperty('z-index', '50', 'important');
    });
  }

  const protectObserver = new MutationObserver(() => {
    protectCloseButton();
    schedulePosition();
  });
  protectObserver.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      protectCloseButton();
      schedulePosition();
    }, { once: true });
  } else {
    protectCloseButton();
    schedulePosition();
  }

  // One delayed pass catches the Reader's deferred scripts.
  window.setTimeout(() => {
    protectCloseButton();
    schedulePosition();
  }, 250);
})();
