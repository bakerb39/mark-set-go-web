(() => {
  'use strict';

  const STORAGE_KEY = 'msg_companion_persona_v2';
  const LEGACY_KEY = 'msg_companion_persona_v1';
  const VALID = new Set(['mark', 'beth']);
  const CONFIG = {
    mark: {
      id: 'mark', name: 'Mark', ask: 'Ask Mark', notebook: "Mark's Notebook",
      avatar: '/assets/ask-mark/ask-mark-avatar.png',
      home: '/assets/walkthrough/mark-walkthrough-guide.png'
    },
    beth: {
      id: 'beth', name: 'Beth', ask: 'Ask Beth', notebook: "Beth's Notebook",
      avatar: '/assets/companions/beth/beth-universal-v1.png',
      home: '/assets/companions/beth/beth-universal-v1.png'
    }
  };

  let id = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY) || 'mark';
  if (!VALID.has(id)) id = 'mark';

  const cfg = () => CONFIG[id];
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function setText(el, markText, bethText) {
    if (!el) return;
    const desired = id === 'beth' ? bethText : markText;
    if (el.textContent !== desired) el.textContent = desired;
  }

  function setButtonLabel(el, markText, bethText) {
    if (!el) return;
    const img = el.querySelector('img');
    const desired = id === 'beth' ? bethText : markText;
    if (img) {
      Array.from(el.childNodes).forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) node.nodeValue = '';
      });
      let span = el.querySelector('[data-companion-label]') || el.querySelector(':scope > span');
      if (!span) {
        span = document.createElement('span');
        el.appendChild(span);
      }
      span.dataset.companionLabel = '1';
      span.textContent = desired;
    } else {
      const icon = el.querySelector('[aria-hidden="true"]');
      if (icon) {
        let label = el.querySelector('[data-companion-label]');
        if (!label) {
          Array.from(el.childNodes).forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) node.nodeValue = '';
          });
          label = document.createElement('span');
          label.dataset.companionLabel = '1';
          el.appendChild(label);
        }
        label.textContent = desired;
      } else {
        el.textContent = desired;
      }
    }
  }

  function applyAvatar(img) {
    if (!(img instanceof HTMLImageElement)) return;
    if (!img.dataset.msgMarkSrc) img.dataset.msgMarkSrc = CONFIG.mark.avatar;
    img.src = id === 'beth' ? CONFIG.beth.avatar : img.dataset.msgMarkSrc;
    img.alt = cfg().name;
  }

  function applyKnownSurfaces(root = document) {
    document.documentElement.dataset.companion = id;

    // Global app-help companion identity is owned exclusively by app-help-mark.js.
    // Do not rewrite its label/avatar here; competing writers caused mixed Mark/Beth UI.

    const readerCompanionButton = root.querySelector('#toggle-mark-panel');
    setButtonLabel(readerCompanionButton, 'Ask Mark', 'Ask Beth');
    // Keep the Reader companion button's avatar and label on the same persona.
    // Previously only the label changed, leaving Mark's avatar beside "Ask Beth".
    applyAvatar(readerCompanionButton?.querySelector(':scope > img'));

    setButtonLabel(root.querySelector('#fullscreen-mark-toggle'), 'Ask Mark', 'Ask Beth');
    qsa('.askmark-brand-copy h2', root).forEach((el) => setText(el, 'Ask Mark', 'Ask Beth'));
    qsa('.reader-control-header strong', root).forEach((el) => {
      if (/Ask (Mark|Beth)/.test(el.textContent || '')) setText(el, 'Ask Mark', 'Ask Beth');
    });
    qsa('[data-fs-mark-tab="selection"]', root).forEach((el) => setText(el, 'Ask Mark', 'Ask Beth'));
    qsa('#fullscreen-mark-drawer [aria-label], #mark-selection-toolbar [aria-label]', root).forEach((el) => {
      if (el.getAttribute('aria-label')?.includes('Ask Mark') || el.getAttribute('aria-label')?.includes('Ask Beth')) {
        el.setAttribute('aria-label', cfg().ask);
      }
    });

    qsa('[data-mark-toolbar-action="ask"]', root).forEach((el) => setText(el, '✦ Ask Mark', '✦ Ask Beth'));
    qsa('.mark-response-heading span', root).forEach((el) => setText(el, 'Ask Mark', 'Ask Beth'));
    qsa('.askmark-message.mark-message img,.askmark-brand-avatar img,.askmark-avatar', root).forEach(applyAvatar);
    qsa('.askmark-message.mark-message span', root).forEach((el) => {
      if (/^(Mark|Beth)$/.test((el.textContent || '').trim())) setText(el, 'Mark', 'Beth');
    });
    qsa('[data-notebook-slot] .mark-list-heading strong', root).forEach((el) => {
      if (/Notebook/.test(el.textContent || '')) el.textContent = cfg().notebook;
    });
    qsa('.askmark-subhead h3', root).forEach((el) => {
      if (/^(Mark|Beth)[’']s Notebook$/.test((el.textContent || '').trim())) el.textContent = id === 'beth' ? 'Beth’s Notebook' : 'Mark’s Notebook';
    });

    qsa('.home-mark-icon-stage', root).forEach((stage) => {
      stage.classList.toggle('companion-frontpage-badge-mode', id === 'beth');
    });
    qsa('.home-mark-avatar', root).forEach((img) => {
      if (!(img instanceof HTMLImageElement)) return;
      if (!img.dataset.msgMarkSrc) img.dataset.msgMarkSrc = img.src;
      img.src = id === 'beth' ? CONFIG.beth.home : img.dataset.msgMarkSrc;
      img.alt = `${cfg().name}, your reading companion.`;
    });
    qsa('.home-mark-card figcaption strong', root).forEach((el) => setText(el, 'Meet Mark.', 'Meet Beth.'));
  }

  function ensureProfileControl() {
    const app = document.getElementById('app');
    const page = app?.querySelector('.profile-preferences-page');
    if (!page) return;
    let card = page.querySelector('.companion-persona-settings-safe');
    if (!card) {
      card = document.createElement('section');
      card.className = 'profile-preset-card companion-persona-settings-safe';
      card.innerHTML = `
        <div class="section-heading">
          <div><span class="source-category">Reading companion</span><h2>Choose your companion</h2><p>Use the same reading, notebook, study, and help tools with Mark or Beth.</p></div>
        </div>
        <div class="companion-safe-grid" role="radiogroup" aria-label="Reading companion">
          <button type="button" data-companion-choice="mark" role="radio"><img src="${CONFIG.mark.avatar}" alt="Mark"><span><strong>Mark</strong><small>Ask Mark</small></span><span class="companion-safe-check">✓</span></button>
          <button type="button" data-companion-choice="beth" role="radio"><img src="${CONFIG.beth.avatar}" alt="Beth"><span><strong>Beth</strong><small>Ask Beth</small></span><span class="companion-safe-check">✓</span></button>
        </div>`;
      const hero = page.querySelector('.platform-hero');
      hero?.insertAdjacentElement('afterend', card);
      card.addEventListener('click', (event) => {
        const button = event.target.closest('[data-companion-choice]');
        if (!button) return;
        api.set(button.dataset.companionChoice);
      });
    }
    qsa('[data-companion-choice]', card).forEach((button) => {
      const selected = button.dataset.companionChoice === id;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
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
      if (!VALID.has(next)) return;
      id = next;
      localStorage.setItem(STORAGE_KEY, id);
      localStorage.setItem(LEGACY_KEY, id);
      ensureProfileControl();
      applyKnownSurfaces();
      window.dispatchEvent(new CustomEvent('msg:companion-changed', { detail: { companion: id, config: cfg() } }));
    },
    apply() {
      ensureProfileControl();
      applyKnownSurfaces();
    }
  };
  window.MSGCompanion = api;

  document.addEventListener('click', () => {
    refreshSoon(0);
    setTimeout(() => api.apply(), 180);
  }, false);
  window.addEventListener('popstate', () => refreshSoon(0));
  window.addEventListener('hashchange', () => refreshSoon(0));
  window.addEventListener('msg:companion-changed', () => refreshSoon(0));
  document.addEventListener('DOMContentLoaded', () => refreshSoon(0), { once: true });
  refreshSoon(0);
})();
