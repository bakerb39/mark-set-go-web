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

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;

      document.querySelectorAll(CLOSE_SELECTOR).forEach((button) => {
        button.style.setProperty('pointer-events', 'auto', 'important');
        button.style.setProperty('cursor', 'pointer', 'important');
        button.style.setProperty('z-index', '50', 'important');
      });

      stabilizeNotebookHeading();
    });
  }

  // Event-driven only. No MutationObserver.

  document.addEventListener('marksetgo:document-available', schedule);
  window.addEventListener('msg:companion-changed', schedule);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else {
    schedule();
  }

  setTimeout(schedule, 250);
})();
