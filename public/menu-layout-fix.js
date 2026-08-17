(() => {
  'use strict';

  function fixRandomNotesMenuItem() {
    const menu = document.querySelector('.professional-library-menu');
    if (!menu) return;

    let button =
      menu.querySelector(':scope > button[data-action="random-notes"]') ||
      Array.from(menu.querySelectorAll(':scope > button')).find((node) =>
        /Random Notes/i.test(node.textContent || '')
      );

    if (!button) return;

    const icon = button.querySelector('.menu-icon');
    const iconMarkup = icon
      ? icon.outerHTML
      : '<span class="menu-icon icon-random-notes">✎</span>';

    button.innerHTML = `
      ${iconMarkup}
      <span class="menu-copy">
        <strong>Random Notes</strong>
        <small>Ideas and notes beyond your reading</small>
      </span>
    `;

    const copy = button.querySelector('.menu-copy');
    const title = copy?.querySelector('strong');
    const description = copy?.querySelector('small');

    if (copy) {
      copy.style.setProperty('display', 'grid', 'important');
      copy.style.setProperty('grid-template-columns', 'minmax(0, 1fr)', 'important');
      copy.style.setProperty('gap', '2px', 'important');
      copy.style.setProperty('min-width', '0', 'important');
      copy.style.setProperty('align-items', 'start', 'important');
    }

    if (title) {
      title.style.setProperty('display', 'block', 'important');
      title.style.setProperty('width', '100%', 'important');
      title.style.setProperty('line-height', '1.2', 'important');
    }

    if (description) {
      description.style.setProperty('display', 'block', 'important');
      description.style.setProperty('width', '100%', 'important');
      description.style.setProperty('margin', '0', 'important');
      description.style.setProperty('line-height', '1.25', 'important');
      description.style.setProperty('white-space', 'normal', 'important');
    }
  }

  let queued = false;
  function scheduleFix() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fixRandomNotesMenuItem();
    });
  }

  const observer = new MutationObserver(scheduleFix);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleFix, { once: true });
  } else {
    scheduleFix();
  }

  setTimeout(scheduleFix, 250);
  setTimeout(scheduleFix, 900);
})();
