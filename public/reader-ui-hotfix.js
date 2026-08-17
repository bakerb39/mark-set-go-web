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

  function canonicalNotebookLabel() {
    const live = window.MSGCompanion?.config;
    if (live?.name) return `${String(live.name).trim()}'s Notebook`;

    let id = 'mark';
    try {
      id = String(
        localStorage.getItem('msg_companion_persona_v2') ||
        localStorage.getItem('msg_companion_persona_v1') ||
        'mark'
      ).toLowerCase();
    } catch {}

    if (id === 'chad') return "Chad's Notebook";
    if (id === 'beth') return "Beth's Notebook";
    return "Mark's Notebook";
  }

  function stabilizeNotebookHeading() {
    const heading = document.querySelector('#app .askmark-subhead h3');
    if (!heading) return;
    const label = canonicalNotebookLabel();
    if (heading.textContent !== label) heading.textContent = label;
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
        <button type="button" data-reader-font-decrease aria-label="Decrease reader font size" title="Smaller text">−</button>
        <span class="reader-quick-divider" aria-hidden="true"></span>
        <button type="button" data-reader-font-increase aria-label="Increase reader font size" title="Larger text">+</button>
        <span class="reader-quick-divider" aria-hidden="true"></span>
      `;
      controls.appendChild(tools);

      tools.querySelector('[data-reader-font-decrease]')?.addEventListener('click', () => changeReaderFont(-1));
      tools.querySelector('[data-reader-font-increase]')?.addEventListener('click', () => changeReaderFont(1));
    }

    if (music.parentElement !== tools) tools.appendChild(music);

    controls.style.setProperty('position', 'relative', 'important');
    controls.style.setProperty('overflow', 'visible', 'important');

    // Exact visual: [ − | + | ♫ ]
    tools.style.setProperty('position', 'absolute', 'important');
    tools.style.setProperty('display', 'inline-flex', 'important');
    tools.style.setProperty('align-items', 'center', 'important');
    tools.style.setProperty('justify-content', 'center', 'important');
    tools.style.setProperty('width', '110px', 'important');
    tools.style.setProperty('height', '36px', 'important');
    tools.style.setProperty('padding', '0 5px', 'important');
    tools.style.setProperty('margin', '0', 'important');
    tools.style.setProperty('box-sizing', 'border-box', 'important');
    tools.style.setProperty('border-radius', '8px', 'important');
    tools.style.setProperty('background', '#0b2e4f', 'important');
    tools.style.setProperty('border', '1px solid rgba(255,255,255,.08)', 'important');
    tools.style.setProperty('box-shadow', '0 2px 7px rgba(10,30,50,.22)', 'important');
    tools.style.setProperty('z-index', '40', 'important');
    tools.style.setProperty('white-space', 'nowrap', 'important');
    tools.style.setProperty('overflow', 'hidden', 'important');

    const minus = tools.querySelector('[data-reader-font-decrease]');
    const plus = tools.querySelector('[data-reader-font-increase]');

    [minus, plus, music].forEach((button) => {
      if (!button) return;
      button.style.setProperty('position', 'static', 'important');
      button.style.setProperty('inset', 'auto', 'important');
      button.style.setProperty('display', 'inline-flex', 'important');
      button.style.setProperty('align-items', 'center', 'important');
      button.style.setProperty('justify-content', 'center', 'important');
      button.style.setProperty('flex', '0 0 30px', 'important');
      button.style.setProperty('width', '30px', 'important');
      button.style.setProperty('height', '30px', 'important');
      button.style.setProperty('min-width', '30px', 'important');
      button.style.setProperty('max-width', '30px', 'important');
      button.style.setProperty('padding', '0', 'important');
      button.style.setProperty('margin', '0', 'important');
      button.style.setProperty('border', '0', 'important');
      button.style.setProperty('border-radius', '0', 'important');
      button.style.setProperty('background', 'transparent', 'important');
      button.style.setProperty('color', '#ffffff', 'important');
      button.style.setProperty('box-shadow', 'none', 'important');
      button.style.setProperty('transform', 'none', 'important');
      button.style.setProperty('line-height', '1', 'important');
      button.style.setProperty('cursor', 'pointer', 'important');
    });

    if (minus) {
      minus.textContent = '−';
      minus.style.setProperty('font-size', '16px', 'important');
      minus.style.setProperty('font-weight', '500', 'important');
    }

    if (plus) {
      plus.textContent = '+';
      plus.style.setProperty('font-size', '16px', 'important');
      plus.style.setProperty('font-weight', '500', 'important');
    }

    // Normalize the music glyph so it occupies only its own third of the bar.
    music.innerHTML = '<span aria-hidden="true">♫</span>';
    const musicGlyph = music.querySelector('span');
    if (musicGlyph) {
      musicGlyph.style.setProperty('display', 'block', 'important');
      musicGlyph.style.setProperty('font-size', '15px', 'important');
      musicGlyph.style.setProperty('line-height', '1', 'important');
      musicGlyph.style.setProperty('margin', '0', 'important');
      musicGlyph.style.setProperty('padding', '0', 'important');
      musicGlyph.style.setProperty('transform', 'none', 'important');
    }

    tools.querySelectorAll('.reader-quick-divider').forEach((divider) => {
      divider.style.setProperty('display', 'block', 'important');
      divider.style.setProperty('flex', '0 0 1px', 'important');
      divider.style.setProperty('width', '1px', 'important');
      divider.style.setProperty('height', '18px', 'important');
      divider.style.setProperty('margin', '0 3px', 'important');
      divider.style.setProperty('background', 'rgba(255,255,255,.28)', 'important');
    });

    const controlsRect = controls.getBoundingClientRect();
    const fullRect = fullscreen.getBoundingClientRect();
    const toolbarWidth = 110;
    const toolbarHeight = 36;
    const gap = 8;

    const left = Math.max(0, fullRect.left - controlsRect.left - toolbarWidth - gap);
    const top = fullRect.top - controlsRect.top + (fullRect.height - toolbarHeight) / 2;

    tools.style.setProperty('left', `${Math.round(left)}px`, 'important');
    tools.style.setProperty('right', 'auto', 'important');
    tools.style.setProperty('top', `${Math.round(top)}px`, 'important');
    tools.style.setProperty('bottom', 'auto', 'important');
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
      stabilizeNotebookHeading();
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
  window.addEventListener('msg:companion-changed', schedule);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else {
    schedule();
  }
  setTimeout(schedule, 250);
})();
