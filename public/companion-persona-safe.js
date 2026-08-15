(() => {
  'use strict';

  const STORAGE_KEY = 'msg_companion_persona_v2';
  const LEGACY_KEY = 'msg_companion_persona_v1';
  const VALID = new Set(['mark', 'beth', 'chad']);

  const CONFIG = Object.freeze({
    mark: Object.freeze({
      id: 'mark',
      name: 'Mark',
      ask: 'Ask Mark',
      notebook: "Mark's Notebook",
      avatar: '/assets/ask-mark/ask-mark-avatar.png',
      home: '/assets/walkthrough/mark-walkthrough-guide.png',
      description: 'Your thoughtful general reading companion'
    }),
    beth: Object.freeze({
      id: 'beth',
      name: 'Beth',
      ask: 'Ask Beth',
      notebook: "Beth's Notebook",
      avatar: '/assets/companions/beth/beth-avatar.png',
      home: '/assets/companions/beth/beth-frontpage-badge.png',
      description: 'A warm, encouraging reading companion'
    }),
    chad: Object.freeze({
      id: 'chad',
      name: 'Chad',
      ask: 'Ask Chad',
      notebook: "Chad's Notebook",
      avatar: '/assets/companions/chad/chad-avatar.png',
      home: '/assets/companions/chad/chad-avatar.png',
      description: 'Financial analysis, investing, markets & economics'
    })
  });

  function readStoredId() {
    try {
      const stored = String(
        localStorage.getItem(STORAGE_KEY) ||
        localStorage.getItem(LEGACY_KEY) ||
        'mark'
      ).toLowerCase();
      return VALID.has(stored) ? stored : 'mark';
    } catch {
      return 'mark';
    }
  }

  let id = readStoredId();
  const cfg = () => CONFIG[id] || CONFIG.mark;
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function setButtonLabel(button, label) {
    if (!button) return;

    const img = button.querySelector(':scope > img');
    if (img) {
      Array.from(button.childNodes).forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) node.nodeValue = '';
      });

      let span = button.querySelector('[data-companion-label]');
      if (!span) {
        span = document.createElement('span');
        span.dataset.companionLabel = '1';
        button.appendChild(span);
      }
      span.textContent = label;
      return;
    }

    const icon = button.querySelector('[aria-hidden="true"]');
    if (icon) {
      let span = button.querySelector('[data-companion-label]');
      if (!span) {
        Array.from(button.childNodes).forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) node.nodeValue = '';
        });
        span = document.createElement('span');
        span.dataset.companionLabel = '1';
        button.appendChild(span);
      }
      span.textContent = label;
      return;
    }

    button.textContent = label;
  }

  function applyAvatar(img, src = cfg().avatar, alt = cfg().name) {
    if (!(img instanceof HTMLImageElement) || !src) return;
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    img.alt = alt;
  }

  function replaceExactPersonaLabel(element, prefix = '') {
    if (!element) return;
    const current = (element.textContent || '').trim();
    if (/^(?:Ask )?(?:Mark|Beth|Chad)$/i.test(current)) {
      element.textContent = prefix ? `${prefix}${cfg().name}` : cfg().name;
    }
  }

  function applyKnownSurfaces(root = document) {
    document.documentElement.dataset.companion = id;

    const readerButton = root.querySelector('#toggle-mark-panel');
    setButtonLabel(readerButton, cfg().ask);
    applyAvatar(readerButton?.querySelector(':scope > img'));

    const fullscreenButton = root.querySelector('#fullscreen-mark-toggle');
    setButtonLabel(fullscreenButton, cfg().ask);
    applyAvatar(fullscreenButton?.querySelector(':scope > img'));

    qsa('.askmark-brand-copy h2', root).forEach((el) => {
      if (/^Ask (Mark|Beth|Chad)$/i.test((el.textContent || '').trim())) {
        el.textContent = cfg().ask;
      }
    });

    qsa('.reader-control-header strong', root).forEach((el) => {
      if (/^Ask (Mark|Beth|Chad)$/i.test((el.textContent || '').trim())) {
        el.textContent = cfg().ask;
      }
    });

    qsa('[data-fs-mark-tab="selection"]', root).forEach((el) => {
      if (/^Ask (Mark|Beth|Chad)$/i.test((el.textContent || '').trim())) {
        el.textContent = cfg().ask;
      }
    });

    qsa('#fullscreen-mark-drawer [aria-label], #mark-selection-toolbar [aria-label]', root).forEach((el) => {
      const label = el.getAttribute('aria-label') || '';
      if (/Ask (Mark|Beth|Chad)/i.test(label)) {
        el.setAttribute('aria-label', label.replace(/Ask (Mark|Beth|Chad)/ig, cfg().ask));
      }
    });

    qsa('[data-mark-toolbar-action="ask"]', root).forEach((el) => {
      el.textContent = `✦ ${cfg().ask}`;
    });

    qsa('.mark-response-heading span', root).forEach((el) => {
      if (/^Ask (Mark|Beth|Chad)$/i.test((el.textContent || '').trim())) {
        el.textContent = cfg().ask;
      }
    });

    qsa(
      '.askmark-message.mark-message img, .askmark-brand-avatar img, .askmark-avatar, ' +
      '#word-panel img.mark-avatar, #fullscreen-mark-drawer img.mark-avatar',
      root
    ).forEach((img) => applyAvatar(img));

    qsa('.askmark-message.mark-message span', root).forEach((el) => {
      if (/^(Mark|Beth|Chad)$/i.test((el.textContent || '').trim())) {
        el.textContent = cfg().name;
      }
    });

    qsa('[data-notebook-slot] .mark-list-heading strong, .askmark-subhead h3', root).forEach((el) => {
      if (/(Mark|Beth|Chad)[’']s Notebook|Notebook/i.test(el.textContent || '')) {
        el.textContent = cfg().notebook.replace("'", '’');
      }
    });

    qsa('.home-mark-icon-stage', root).forEach((stage) => {
      stage.classList.toggle('companion-frontpage-badge-mode', id !== 'mark');
    });

    qsa('.home-mark-avatar', root).forEach((img) => {
      applyAvatar(img, cfg().home, `${cfg().name}, your reading companion.`);
    });

    qsa('.home-mark-card figcaption strong', root).forEach((el) => {
      if (/^Meet (Mark|Beth|Chad)\.?$/i.test((el.textContent || '').trim())) {
        el.textContent = `Meet ${cfg().name}.`;
      }
    });
  }

  function profileMarkup() {
    return `
      <div class="section-heading">
        <div>
          <span class="source-category">Reading companion</span>
          <h2>Choose your companion</h2>
          <p>Choose the perspective you want throughout the Reader, notebook, study, and companion tools.</p>
        </div>
      </div>
      <div class="companion-safe-grid" role="radiogroup" aria-label="Reading companion">
        ${Object.values(CONFIG).map((person) => `
          <button type="button"
                  data-companion-choice="${person.id}"
                  role="radio"
                  aria-checked="false">
            <img src="${person.avatar}" alt="${person.name}">
            <span>
              <strong>${person.name}</strong>
              <small>${person.description}</small>
            </span>
            <span class="companion-safe-check" aria-hidden="true">✓</span>
          </button>`).join('')}
      </div>`;
  }

  function ensureProfileControl() {
    const app = document.getElementById('app');
    const page = app?.querySelector('.profile-preferences-page');
    if (!page) return;

    // Remove the old emergency Chad selector. It was the source of the duplicate
    // companion panel when the normal profile control arrived later.
    page.querySelectorAll('[data-chad-fallback-selector]').forEach((section) => section.remove());

    let card = page.querySelector('.companion-persona-settings-safe');

    if (!card) {
      card = document.createElement('section');
      card.className = 'profile-preset-card companion-persona-settings-safe';
      const hero = page.querySelector('.platform-hero');
      hero?.insertAdjacentElement('afterend', card);
    }

    if (card.dataset.companionControlVersion !== '3') {
      card.dataset.companionControlVersion = '3';
      card.innerHTML = profileMarkup();
    }

    if (card.dataset.companionBound !== '1') {
      card.dataset.companionBound = '1';
      card.addEventListener('click', (event) => {
        const button = event.target.closest('[data-companion-choice]');
        if (!button || !card.contains(button)) return;
        api.set(button.dataset.companionChoice);
      });
    }

    qsa('[data-companion-choice]', card).forEach((button) => {
      const selected = button.dataset.companionChoice === id;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  let refreshTimer = 0;
  function refreshSoon(delay = 0) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      ensureProfileControl();
      applyKnownSurfaces();
    }, delay);
  }

  const api = {
    get id() { return id; },
    get name() { return cfg().name; },
    get config() { return { ...cfg() }; },

    set(next) {
      const value = String(next || '').toLowerCase();
      if (!VALID.has(value)) return;

      id = value;

      try {
        localStorage.setItem(STORAGE_KEY, id);
        localStorage.setItem(LEGACY_KEY, id);
      } catch {}

      ensureProfileControl();
      applyKnownSurfaces();

      window.dispatchEvent(new CustomEvent('msg:companion-changed', {
        detail: { companion: id, config: cfg() }
      }));

      document.dispatchEvent(new CustomEvent('marksetgo:companion-changed', {
        detail: { id, config: cfg() }
      }));
    },

    apply() {
      id = readStoredId();
      ensureProfileControl();
      applyKnownSurfaces();
    }
  };

  // One canonical companion API owns all three personas.
  window.MSGCompanion = api;

  document.addEventListener('click', () => {
    refreshSoon(0);
    setTimeout(() => api.apply(), 180);
  }, false);

  window.addEventListener('popstate', () => refreshSoon(0));
  window.addEventListener('hashchange', () => refreshSoon(0));
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === LEGACY_KEY) refreshSoon(0);
  });
  window.addEventListener('msg:companion-changed', () => refreshSoon(0));
  document.addEventListener('marksetgo:companion-changed', () => refreshSoon(0));

  document.addEventListener('DOMContentLoaded', () => refreshSoon(0), { once: true });
  refreshSoon(0);
})();
