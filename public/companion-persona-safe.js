(() => {
  'use strict';

  const STORAGE_KEY = 'msg_companion_persona_v2';
  const LEGACY_KEY = 'msg_companion_persona_v1';

  const CONFIG = Object.freeze({
    mark: Object.freeze({
      id: 'mark',
      name: 'Mark',
      ask: 'Ask Mark',
      notebook: 'Mark’s Notebook',
      avatar: '/assets/ask-mark/ask-mark-avatar.png',
      home: '/assets/walkthrough/mark-walkthrough-guide.png',
      description: 'Your thoughtful general reading companion'
    }),
    beth: Object.freeze({
      id: 'beth',
      name: 'Beth',
      ask: 'Ask Beth',
      notebook: 'Beth’s Notebook',
      avatar: '/assets/companions/beth/beth-ui-avatar.png?v=9.6.9',
      home: '/assets/companions/beth/beth-frontpage-badge.png',
      description: 'A warm, encouraging reading companion'
    }),
    chad: Object.freeze({
      id: 'chad',
      name: 'Chad',
      ask: 'Ask Chad',
      notebook: 'Chad’s Notebook',
      avatar: '/assets/companions/chad/chad-avatar.png',
      home: '/assets/companions/chad/chad-avatar.png',
      description: 'Financial analysis, investing, markets & economics'
    }),
    scott: Object.freeze({
      id: 'scott',
      name: 'Scott',
      ask: 'Ask Scott',
      notebook: 'Scott’s Notebook',
      avatar: '/assets/companions/scott/scott-avatar.png?v=20260817',
      home: '/assets/companions/scott/scott-avatar.png?v=20260817',
      description: 'Enterprise software, banking, treasury & product strategy'
    })
  });

  const VALID = new Set(Object.keys(CONFIG));
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function storedId() {
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

  let id = storedId();
  const cfg = () => CONFIG[id] || CONFIG.mark;

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, id);
      localStorage.setItem(LEGACY_KEY, id);
    } catch {}
  }

  function setImage(img, src, alt = '') {
    if (!(img instanceof HTMLImageElement) || !src) return;
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    if (alt) img.setAttribute('alt', alt);
  }

  function setCompanionButton(button) {
    if (!button) return;
    const current = cfg();
    let img = button.querySelector(':scope > img');
    if (img) setImage(img, current.avatar, current.name);

    let label = button.querySelector('[data-companion-label]');
    if (!label) {
      const spans = Array.from(button.querySelectorAll(':scope > span'));
      label = spans.find((span) => !span.matches('[aria-hidden="true"]')) || null;
      if (!label) {
        label = document.createElement('span');
        button.appendChild(label);
      }
      label.dataset.companionLabel = '1';
    }
    label.textContent = current.ask;
  }

  function replaceKnownCompanionText(root = document) {
    const current = cfg();

    qsa('.askmark-brand-copy h2', root).forEach((el) => { el.textContent = current.ask; });
    qsa('.reader-control-header strong', root).forEach((el) => {
      if (/Ask (Mark|Beth|Chad|Scott)/i.test(el.textContent || '')) el.textContent = current.ask;
    });
    qsa('[data-fs-mark-tab="selection"]', root).forEach((el) => { el.textContent = current.ask; });
    qsa('[data-mark-toolbar-action="ask"]', root).forEach((el) => { el.textContent = `✦ ${current.ask}`; });
    qsa('.mark-response-heading span', root).forEach((el) => { el.textContent = current.ask; });

    qsa('#fullscreen-mark-drawer [aria-label], #mark-selection-toolbar [aria-label]', root).forEach((el) => {
      const label = el.getAttribute('aria-label') || '';
      if (/Ask (Mark|Beth|Chad|Scott)/i.test(label)) el.setAttribute('aria-label', current.ask);
    });

    qsa('.askmark-message.mark-message img,.askmark-brand-avatar img,.askmark-avatar', root)
      .forEach((img) => setImage(img, current.avatar, current.name));

    qsa('.askmark-message.mark-message span', root).forEach((el) => {
      if (/^(Mark|Beth|Chad|Scott)(\s*·.*)?$/i.test((el.textContent || '').trim())) {
        const suffix = el.textContent.includes('·') ? ` · ${el.textContent.split('·').slice(1).join('·').trim()}` : '';
        el.textContent = `${current.name}${suffix}`;
      }
    });

    qsa('[data-notebook-slot] .mark-list-heading strong, .askmark-subhead h3', root).forEach((el) => {
      if (/Notebook/i.test(el.textContent || '')) el.textContent = current.notebook;
    });
  }

  function applyKnownSurfaces(root = document) {
    const current = cfg();
    document.documentElement.dataset.companion = id;

    setCompanionButton(root.querySelector('#toggle-mark-panel'));
    setCompanionButton(root.querySelector('#fullscreen-mark-toggle'));
    replaceKnownCompanionText(root);

    qsa('.home-mark-icon-stage', root).forEach((stage) => {
      stage.classList.toggle('companion-frontpage-badge-mode', id !== 'mark');
    });

    qsa('.home-mark-avatar', root).forEach((img) => {
      setImage(img, current.home || current.avatar, `${current.name}, your reading companion.`);
    });

    qsa('.home-mark-card figcaption strong', root).forEach((el) => {
      el.textContent = `Meet ${current.name}.`;
    });
  }

  function cardMarkup(current) {
    return `
      <button type="button" data-companion-choice="${current.id}" role="radio" aria-checked="false">
        <img src="${current.avatar}" alt="${current.name}">
        <span><strong>${current.name}</strong><small>${current.description}</small></span>
        <span class="companion-check companion-safe-check" aria-hidden="true">✓</span>
      </button>`;
  }

  function ensureProfileControl() {
    const app = document.getElementById('app');
    const page = app?.querySelector('.profile-preferences-page');
    if (!page) return;

    // Remove the emergency selector from older Chad/Scott patches. The canonical
    // four-person selector below is the only profile selector allowed to own state.
    page.querySelectorAll('[data-chad-fallback-selector]').forEach((node) => node.remove());

    let card = page.querySelector('.companion-persona-settings-safe');
    if (!card) {
      card = document.createElement('section');
      card.className = 'profile-preset-card companion-persona-settings companion-persona-settings-safe';
      card.innerHTML = `
        <div class="companion-persona-heading">
          <div><span class="companion-persona-kicker">READING COMPANION</span><h2>Choose your companion</h2></div>
          <p>Choose the perspective you want throughout the Reader, notebook, study, and companion tools.</p>
        </div>
        <div class="companion-safe-grid companion-persona-options" role="radiogroup" aria-label="Reading companion">
          ${Object.values(CONFIG).map(cardMarkup).join('')}
        </div>`;

      const hero = page.querySelector('.platform-hero');
      hero?.insertAdjacentElement('afterend', card);

      card.addEventListener('click', (event) => {
        const button = event.target.closest('[data-companion-choice]');
        if (!button || !card.contains(button)) return;
        api.set(button.dataset.companionChoice);
      });
    }

    qsa('[data-companion-choice]', card).forEach((button) => {
      const selected = button.dataset.companionChoice === id;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', String(selected));
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  let refreshTimer = 0;
  function refreshSoon(delay = 0) {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      // Re-read storage because another established companion surface may have
      // changed it. Never normalize Chad or Scott back to Mark.
      id = storedId();
      ensureProfileControl();
      applyKnownSurfaces();
    }, delay);
  }

  const api = {
    get id() { return id; },
    get name() { return cfg().name; },
    get config() { return { ...cfg() }; },
    set(next) {
      const normalized = String(next || '').toLowerCase();
      if (!VALID.has(normalized)) return false;
      id = normalized;
      persist();
      ensureProfileControl();
      applyKnownSurfaces();

      const detail = { companion: id, id, config: { ...cfg() } };
      document.dispatchEvent(new CustomEvent('marksetgo:companion-changed', { detail }));
      window.dispatchEvent(new CustomEvent('msg:companion-changed', { detail }));
      return true;
    },
    apply() {
      id = storedId();
      ensureProfileControl();
      applyKnownSurfaces();
    }
  };

  window.MSGCompanion = api;

  // Existing app navigation rebuilds Profile/Reader DOM. Re-apply on the same
  // explicit lifecycle events; no DOM observer or polling is used.
  document.addEventListener('marksetgo:document-available', () => refreshSoon(0));
  document.addEventListener('marksetgo:auth-changed', () => refreshSoon(0));
  window.addEventListener('popstate', () => refreshSoon(0));
  window.addEventListener('hashchange', () => refreshSoon(0));

  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-action], .top-nav-menu, .profile-preferences-page')) {
      refreshSoon(0);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => refreshSoon(0), { once: true });
  } else {
    refreshSoon(0);
  }
})();
