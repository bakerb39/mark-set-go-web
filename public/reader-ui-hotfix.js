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
    const originalMusic = app?.querySelector('[data-reader-wpm-music-toggle]');

    if (!app || !fullscreen || !controls || !originalMusic) return;

    let tools = controls.querySelector('.reader-quick-tools');
    if (!tools) {
      tools = document.createElement('div');
      tools.className = 'reader-quick-tools';
      tools.setAttribute('aria-label', 'Reader quick controls');
      tools.innerHTML = `
        <span class="reader-font-group" aria-label="Reader font size">
          <span class="reader-quick-item" data-reader-font-decrease role="button" tabindex="0" aria-label="Decrease reader font size" title="Smaller text">−</span>
          <span class="reader-font-divider" aria-hidden="true">|</span>
          <span class="reader-quick-item" data-reader-font-increase role="button" tabindex="0" aria-label="Increase reader font size" title="Larger text">+</span>
        </span>
        <span class="reader-outer-divider" aria-hidden="true">|</span>
        <span class="reader-quick-item reader-music-item" data-reader-music-proxy role="button" tabindex="0" aria-label="Open reading music" title="Reading music">♫</span>
      `;
      controls.appendChild(tools);

      const activate = (node, fn) => {
        node?.addEventListener('click', fn);
        node?.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fn();
          }
        });
      };

      activate(tools.querySelector('[data-reader-font-decrease]'), () => changeReaderFont(-1));
      activate(tools.querySelector('[data-reader-font-increase]'), () => changeReaderFont(1));
      activate(tools.querySelector('[data-reader-music-proxy]'), () => {
        const liveMusic = document.querySelector('#app [data-reader-wpm-music-toggle]');
        liveMusic?.click();
      });
    }

    // Keep the real music button alive for its existing behavior, but hide it visually.
    originalMusic.style.setProperty('position', 'absolute', 'important');
    originalMusic.style.setProperty('width', '1px', 'important');
    originalMusic.style.setProperty('height', '1px', 'important');
    originalMusic.style.setProperty('padding', '0', 'important');
    originalMusic.style.setProperty('margin', '-1px', 'important');
    originalMusic.style.setProperty('overflow', 'hidden', 'important');
    originalMusic.style.setProperty('clip', 'rect(0 0 0 0)', 'important');
    originalMusic.style.setProperty('clip-path', 'inset(50%)', 'important');
    originalMusic.style.setProperty('white-space', 'nowrap', 'important');
    originalMusic.style.setProperty('border', '0', 'important');

    controls.style.setProperty('position', 'relative', 'important');
    controls.style.setProperty('overflow', 'visible', 'important');

    // Exact visual target:
    // [ − | + ]  |  ♫
    tools.style.setProperty('position', 'absolute', 'important');
    tools.style.setProperty('display', 'inline-flex', 'important');
    tools.style.setProperty('align-items', 'center', 'important');
    tools.style.setProperty('height', '34px', 'important');
    tools.style.setProperty('padding', '0', 'important');
    tools.style.setProperty('margin', '0', 'important');
    tools.style.setProperty('background', 'transparent', 'important');
    tools.style.setProperty('border', '0', 'important');
    tools.style.setProperty('box-shadow', 'none', 'important');
    tools.style.setProperty('z-index', '40', 'important');
    tools.style.setProperty('white-space', 'nowrap', 'important');

    const fontGroup = tools.querySelector('.reader-font-group');
    Object.assign(fontGroup.style, {
      display: 'inline-flex',
      alignItems: 'center',
      height: '34px',
      padding: '0 8px',
      borderRadius: '8px',
      background: '#0b2e4f',
      border: '1px solid rgba(255,255,255,.08)',
      boxShadow: '0 2px 7px rgba(10,30,50,.22)'
    });

    tools.querySelectorAll('.reader-quick-item').forEach((item) => {
      item.style.setProperty('display', 'inline-flex', 'important');
      item.style.setProperty('align-items', 'center', 'important');
      item.style.setProperty('justify-content', 'center', 'important');
      item.style.setProperty('height', '34px', 'important');
      item.style.setProperty('padding', '0', 'important');
      item.style.setProperty('margin', '0', 'important');
      item.style.setProperty('border', '0', 'important');
      item.style.setProperty('background', 'transparent', 'important');
      item.style.setProperty('font-size', '15px', 'important');
      item.style.setProperty('font-weight', '500', 'important');
      item.style.setProperty('line-height', '1', 'important');
      item.style.setProperty('cursor', 'pointer', 'important');
      item.style.setProperty('user-select', 'none', 'important');
    });

    tools.querySelectorAll('.reader-font-group .reader-quick-item').forEach((item) => {
      item.style.setProperty('width', '24px', 'important');
      item.style.setProperty('color', '#ffffff', 'important');
      item.style.setProperty('-webkit-text-fill-color', '#ffffff', 'important');
      item.style.setProperty('opacity', '1', 'important');
      item.style.setProperty('text-shadow', 'none', 'important');
      item.style.setProperty('filter', 'none', 'important');
    });

    const minusItem = tools.querySelector('[data-reader-font-decrease]');
    const plusItem = tools.querySelector('[data-reader-font-increase]');
    [minusItem, plusItem].forEach((item) => {
      if (!item) return;
      item.style.setProperty('font-weight', '700', 'important');
    });

    const innerDivider = tools.querySelector('.reader-font-divider');
    Object.assign(innerDivider.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '12px',
      height: '34px',
      color: 'rgba(255,255,255,.4)',
      fontSize: '13px',
      pointerEvents: 'none'
    });

    const outerDivider = tools.querySelector('.reader-outer-divider');
    Object.assign(outerDivider.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '22px',
      height: '34px',
      margin: '0 3px',
      color: '#6d7f91',
      fontSize: '14px',
      pointerEvents: 'none'
    });

    const musicItem = tools.querySelector('.reader-music-item');
    musicItem.style.setProperty('width', '28px', 'important');
    musicItem.style.setProperty('color', '#173f67', 'important');
    musicItem.style.setProperty('font-size', '15px', 'important');

    const controlsRect = controls.getBoundingClientRect();
    const fullRect = fullscreen.getBoundingClientRect();
    const toolsRect = tools.getBoundingClientRect();
    const gap = 16;

    const left = Math.max(0, fullRect.left - controlsRect.left - toolsRect.width - gap);
    const top = fullRect.top - controlsRect.top + (fullRect.height - toolsRect.height) / 2;

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
