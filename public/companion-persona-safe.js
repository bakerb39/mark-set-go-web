(() => {
  'use strict';

  const STORAGE_KEY = 'msg_companion_persona_v2';
  const LEGACY_KEY = 'msg_companion_persona_v1';
  const VALID = new Set(['mark', 'beth', 'chad']);

  // These are the SAME established companion assets already used by the app.
  // They are used only for the three Profile choice cards.
  const CONFIG = Object.freeze({
    mark: Object.freeze({
      id: 'mark',
      name: 'Mark',
      ask: 'Ask Mark',
      avatar: '/assets/ask-mark/ask-mark-avatar.png',
      description: 'Your thoughtful general reading companion'
    }),
    beth: Object.freeze({
      id: 'beth',
      name: 'Beth',
      ask: 'Ask Beth',
      avatar: '/assets/companions/beth/beth-avatar.png',
      description: 'A warm, encouraging reading companion'
    }),
    chad: Object.freeze({
      id: 'chad',
      name: 'Chad',
      ask: 'Ask Chad',
      avatar: '/assets/companions/chad/chad-avatar.png',
      description: 'Financial analysis, investing, markets & economics'
    })
  });

  function readStoredId() {
    try {
      const value = String(
        localStorage.getItem(STORAGE_KEY) ||
        localStorage.getItem(LEGACY_KEY) ||
        'mark'
      ).toLowerCase();
      return VALID.has(value) ? value : 'mark';
    } catch {
      return 'mark';
    }
  }

  let id = readStoredId();
  const cfg = () => CONFIG[id] || CONFIG.mark;

  function profileMarkup() {
    return `
      <div class="section-heading">
        <div>
          <span class="source-category">Reading companion</span>
          <h2>Choose your companion</h2>
          <p>Choose the perspective you want throughout the Reader, notebook, study, and companion tools.</p>
        </div>
      </div>
      <div class="companion-persona-options companion-safe-grid"
           role="radiogroup"
           aria-label="Reading companion">
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
            <span class="companion-safe-check companion-check" aria-hidden="true">✓</span>
          </button>`).join('')}
      </div>`;
  }

  function syncProfileSelection(card) {
    if (!card) return;
    card.querySelectorAll('[data-companion-choice]').forEach((button) => {
      const selected = button.dataset.companionChoice === id;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  function ensureProfileControl() {
    const page = document.querySelector('#app .profile-preferences-page');
    if (!page) return;

    // Never allow the old emergency duplicate selector to survive.
    page.querySelectorAll('[data-chad-fallback-selector]').forEach((node) => node.remove());

    let card = page.querySelector('.companion-persona-settings-safe');
    if (!card) {
      card = document.createElement('section');
      card.className = 'profile-preset-card companion-persona-settings-safe';
      page.querySelector('.platform-hero')?.insertAdjacentElement('afterend', card);
    }

    if (card.dataset.companionControlVersion !== '4') {
      card.dataset.companionControlVersion = '4';
      card.innerHTML = profileMarkup();
    }

    if (card.dataset.companionBound !== '1') {
      card.dataset.companionBound = '1';
      card.addEventListener('click', (event) => {
        const choice = event.target.closest('[data-companion-choice]');
        if (!choice || !card.contains(choice)) return;
        api.set(choice.dataset.companionChoice);
      });
    }

    syncProfileSelection(card);
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

      document.documentElement.dataset.companion = id;
      ensureProfileControl();

      window.dispatchEvent(new CustomEvent('msg:companion-changed', {
        detail: { companion: id, config: cfg() }
      }));
      document.dispatchEvent(new CustomEvent('marksetgo:companion-changed', {
        detail: { id, config: cfg() }
      }));
    },

    apply() {
      id = readStoredId();
      document.documentElement.dataset.companion = id;
      ensureProfileControl();
    }
  };

  window.MSGCompanion = api;

  const schedule = () => window.setTimeout(api.apply, 0);

  document.addEventListener('DOMContentLoaded', schedule, { once: true });
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-action="profile"], .profile-preferences-page')) {
      window.setTimeout(api.apply, 100);
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === LEGACY_KEY) schedule();
  });

  api.apply();
})();
