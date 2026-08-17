(() => {
  'use strict';

  const CLOSE_SELECTOR = '[data-askmark-close]';

  function closeCompanionPanel(event) {
    const closeButton = event?.target?.closest?.(CLOSE_SELECTOR);
    if (!closeButton) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const layout = document.querySelector('#app #reader-layout');
    if (layout) layout.classList.add('word-panel-hidden');

    for (const id of ['toggle-mark-panel', 'toggle-word-panel']) {
      const button = document.querySelector(`#app #${id}`);
      button?.setAttribute('aria-pressed', 'false');
      button?.classList.add('pane-closed');
    }

    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  document.addEventListener('pointerdown', closeCompanionPanel, true);
  document.addEventListener('click', closeCompanionPanel, true);

  function changeReaderFont(delta) {
    const select = document.querySelector('#app #font-size');
    if (!select) return;

    const options = Array.from(select.options || [])
      .map(option => Number(option.value))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    const current = Number(select.value) || 14;
    let next;

    if (options.length) {
      if (delta > 0) next = options.find(value => value > current) ?? options[options.length - 1];
      else next = [...options].reverse().find(value => value < current) ?? options[0];
    } else {
      next = Math.max(10, Math.min(40, current + delta * 2));
    }

    if (next === current) return;
    select.value = String(next);
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const fsSelect = document.querySelector('#app #fs-font-size');
    if (fsSelect) fsSelect.value = String(next);
  }

  function ensureQuickTools() {
    const app = document.querySelector('#app');
    const fullscreen = app?.querySelector('#toggle-reader-fullscreen');
    const controls = fullscreen?.closest('.reader-pane-controls');
    const music = app?.querySelector('[data-reader-wpm-music-toggle]');

    if (!app || !fullscreen || !controls || !music) return;

    let tools = controls.querySelector('.reader-quick-tools');
    if (!tools) {
      tools = document.createElement('div');
      tools.className = 'reader-quick-tools';
      tools.setAttribute('aria-label', 'Reader quick controls');
      tools.innerHTML = `
        <button type="button" class="reader-quick-font" data-reader-font-decrease aria-label="Decrease reader font size" title="Smaller text">−</button>
        <button type="button" class="reader-quick-font" data-reader-font-increase aria-label="Increase reader font size" title="Larger text">+</button>
      `;
      controls.appendChild(tools);

      tools.querySelector('[data-reader-font-decrease]')?.addEventListener('click', () => changeReaderFont(-1));
      tools.querySelector('[data-reader-font-increase]')?.addEventListener('click', () => changeReaderFont(1));
    }

    // Move only the MUSIC BUTTON into the floating quick-tools group.
    // Full screen stays untouched in its native app position.
    if (music.parentElement !== tools) tools.appendChild(music);

    controls.style.setProperty('position', 'relative', 'important');
    controls.style.setProperty('overflow', 'visible', 'important');

    Object.assign(tools.style, {
      position: 'absolute',
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
      margin: '0',
      zIndex: '40'
    });

    tools.querySelectorAll('button').forEach(button => {
      button.style.setProperty('position', 'static', 'important');
      button.style.setProperty('inset', 'auto', 'important');
      button.style.setProperty('margin', '0', 'important');
      button.style.setProperty('transform', 'none', 'important');
    });

    const controlsRect = controls.getBoundingClientRect();
    const fullRect = fullscreen.getBoundingClientRect();

    // Measure after the toolbar is assembled.
    const toolsRect = tools.getBoundingClientRect();
    const gap = 8;

    // Put the entire toolbar immediately LEFT of Full screen and vertically centered.
    const left = fullRect.left - controlsRect.left - toolsRect.width - gap;
    const top = fullRect.top - controlsRect.top + (fullRect.height - toolsRect.height) / 2;

    tools.style.setProperty('left', `${Math.round(left)}px`, 'important');
    tools.style.setProperty('top', `${Math.round(top)}px`, 'important');
    tools.style.setProperty('right', 'auto', 'important');
    tools.style.setProperty('bottom', 'auto', 'important');

    // Compact, matching controls.
    tools.querySelectorAll('.reader-quick-font').forEach(button => {
      button.style.setProperty('width', '30px', 'important');
      button.style.setProperty('height', '30px', 'important');
      button.style.setProperty('min-width', '30px', 'important');
      button.style.setProperty('padding', '0', 'important');
      button.style.setProperty('border-radius', '7px', 'important');
      button.style.setProperty('font-size', '20px', 'important');
      button.style.setProperty('line-height', '1', 'important');
      button.style.setProperty('font-weight', '700', 'important');
    });

    music.style.setProperty('width', '30px', 'important');
    music.style.setProperty('height', '30px', 'important');
    music.style.setProperty('min-width', '30px', 'important');
    music.style.setProperty('padding', '0', 'important');
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      document.querySelectorAll(CLOSE_SELECTOR).forEach(button => {
        button.style.setProperty('pointer-events', 'auto', 'important');
        button.style.setProperty('cursor', 'pointer', 'important');
        button.style.setProperty('z-index', '50', 'important');
      });
      ensureQuickTools();
    });
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden']
  });

  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('marksetgo:document-available', schedule);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else {
    schedule();
  }
  setTimeout(schedule, 250);
})();
