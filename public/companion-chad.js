(() => {
  'use strict';

  const STORAGE_KEY = 'msg_companion_persona_v2';
  const LEGACY_KEY = 'msg_companion_persona_v1';
  const CHAD = Object.freeze({
    id: 'chad',
    name: 'Chad',
    ask: 'Ask Chad',
    avatar: '/assets/companions/chad/chad-avatar.png',
    specialty: 'Financial analysis, markets, investing, business, and economics'
  });

  const originalText = new WeakMap();
  const originalSrc = new WeakMap();
  let applying = false;
  let scheduled = false;

  function selected() {
    try {
      return (localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY) || 'mark').toLowerCase();
    } catch {
      return 'mark';
    }
  }

  function setSelected(value) {
    const id = ['mark', 'beth', 'chad'].includes(value) ? value : 'mark';
    try {
      localStorage.setItem(STORAGE_KEY, id);
      localStorage.setItem(LEGACY_KEY, id);
    } catch {}
    document.documentElement.dataset.companion = id;
    document.dispatchEvent(new CustomEvent('marksetgo:companion-changed', { detail: { id } }));
    scheduleApply();
  }

  function rememberText(node) {
    if (node && !originalText.has(node)) originalText.set(node, node.nodeValue);
  }

  function rememberSrc(img) {
    if (img && !originalSrc.has(img)) originalSrc.set(img, img.getAttribute('src') || '');
  }

  function restoreTracked() {
    originalText.forEach?.(() => {}); // WeakMap is intentionally non-iterable.
    document.querySelectorAll('[data-chad-original-text]').forEach((el) => {
      el.textContent = el.dataset.chadOriginalText;
      delete el.dataset.chadOriginalText;
    });
    document.querySelectorAll('[data-chad-original-src]').forEach((img) => {
      img.setAttribute('src', img.dataset.chadOriginalSrc);
      delete img.dataset.chadOriginalSrc;
    });
    document.querySelectorAll('.chad-persona-only').forEach((el) => el.remove());
    document.documentElement.classList.remove('msg-chad-active');
  }

  function setElementText(el, value) {
    if (!el || el.textContent === value) return;
    if (!el.dataset.chadOriginalText) el.dataset.chadOriginalText = el.textContent || '';
    el.textContent = value;
  }

  function setImage(img, src, alt = '') {
    if (!img) return;
    if (!img.dataset.chadOriginalSrc) img.dataset.chadOriginalSrc = img.getAttribute('src') || '';
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    if (alt) img.setAttribute('alt', alt);
  }

  function replaceTextNodes(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const current = node.nodeValue || '';
      if (!/Ask Mark|Meet Mark|Hi, I’m Ask Mark|Mark’s notebook|Mark's notebook|requests to Ask Mark|Ask Mark insight/.test(current)) continue;
      let next = current
        .replace(/Hi, I’m Ask Mark\./g, 'Hi, I’m Chad.')
        .replace(/Hi, I'm Ask Mark\./g, "Hi, I'm Chad.")
        .replace(/Ask Mark/g, 'Ask Chad')
        .replace(/Meet Mark/g, 'Meet Chad')
        .replace(/Mark’s notebook/g, 'Chad’s notebook')
        .replace(/Mark's notebook/g, "Chad's notebook")
        .replace(/Ask Chad insight/g, 'Ask Chad insight');
      if (next !== current) {
        if (!node.parentElement?.dataset.chadOriginalTextNode) {
          node.parentElement?.setAttribute('data-chad-original-text-node', current);
        }
        node.nodeValue = next;
      }
    }
  }

  function restoreTextNodes() {
    document.querySelectorAll('[data-chad-original-text-node]').forEach((el) => {
      const saved = el.dataset.chadOriginalTextNode;
      if (el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE) {
        el.firstChild.nodeValue = saved;
      }
      delete el.dataset.chadOriginalTextNode;
    });
  }

  function addProfileChoice() {
    const options = document.querySelector('.companion-persona-options');
    if (!options) return;

    let button = options.querySelector('[data-companion-choice="chad"], [data-persona="chad"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.companionChoice = 'chad';
      button.className = 'companion-chad-choice';
      button.innerHTML = `
        <img src="${CHAD.avatar}" alt="Chad">
        <span>
          <strong>Chad</strong>
          <small>Financial analysis, investing, markets &amp; economics</small>
        </span>
        <span class="companion-check" aria-hidden="true">✓</span>`;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        setSelected('chad');
      });
      options.appendChild(button);
    }

    const current = selected();
    options.querySelectorAll('button').forEach((option) => {
      const id = option.dataset.companionChoice || option.dataset.persona ||
        (/beth/i.test(option.textContent || '') ? 'beth' :
         /chad/i.test(option.textContent || '') ? 'chad' : 'mark');
      const active = id === current;
      option.classList.toggle('is-selected', active);
      option.setAttribute('aria-pressed', String(active));
    });
  }

  function updateFrontPage() {
    const avatar = document.querySelector('.home-mark-avatar');
    if (avatar) {
      setImage(avatar, CHAD.avatar, 'Chad, your financial analysis companion.');
      avatar.closest('.home-mark-icon-stage')?.classList.add('companion-frontpage-badge-mode');
    }

    const card = document.querySelector('.home-mark-card');
    if (card) {
      [...card.querySelectorAll('strong')].forEach((el) => {
        if (/^Meet (Mark|Beth|Chad)\.?$/i.test(el.textContent.trim())) setElementText(el, 'Meet Chad.');
      });
      replaceTextNodes(card);
    }
  }

  function updateReaderButtons() {
    const buttons = [
      document.querySelector('#toggle-mark-panel'),
      document.querySelector('#fullscreen-mark-toggle'),
      ...document.querySelectorAll('.ask-mark-button, [data-action="ask-mark"], .mark-pane-button')
    ].filter(Boolean);

    for (const button of buttons) {
      button.classList.add('msg-companion-avatar-fallback');
      button.style.setProperty('--msg-companion-button-avatar', `url("${CHAD.avatar}")`);

      const img = button.querySelector('img');
      if (img) setImage(img, CHAD.avatar, 'Chad');

      replaceTextNodes(button);
      const text = (button.textContent || '').trim();
      if (text === 'Ask Mark' || text === 'Ask Beth') {
        // Preserve icon elements by changing only matching text nodes.
        for (const node of button.childNodes) {
          if (node.nodeType === Node.TEXT_NODE && /Ask (Mark|Beth)/.test(node.nodeValue || '')) {
            node.nodeValue = (node.nodeValue || '').replace(/Ask (Mark|Beth)/g, 'Ask Chad');
          }
        }
      }
    }

    document.querySelectorAll('[data-mark-toolbar-action="ask"]').forEach((button) => replaceTextNodes(button));
  }

  function updateChatSurfaces() {
    const roots = [
      document.querySelector('#mark-selection-panel'),
      document.querySelector('#word-panel'),
      document.querySelector('#fullscreen-mark-drawer'),
      document.querySelector('#ask-mark-hub'),
      document.querySelector('.ask-mark-hub'),
      document.querySelector('.global-notebook-page')
    ].filter(Boolean);

    roots.forEach(replaceTextNodes);

    document.querySelectorAll('.mark-response-heading span').forEach((span) => {
      if (/Ask (Mark|Beth|Chad)/i.test(span.textContent || '')) setElementText(span, 'Ask Chad');
    });

    document.querySelectorAll('[data-mark-tab="selection"], [data-fs-mark-tab="selection"]').forEach((button) => {
      if (/Ask (Mark|Beth|Chad)/i.test(button.textContent || '')) setElementText(button, 'Ask Chad');
    });

    const investor = document.querySelector('[data-action="investor-analysis"]');
    if (investor) setElementText(investor, 'Ask Chad');
  }

  function updateProfileCopy() {
    const page = document.querySelector('.profile-preferences-page');
    if (!page) return;
    addProfileChoice();

    page.querySelectorAll('h2, p, small, strong, span').forEach((el) => {
      if (el.closest('.companion-persona-options')) return;
      const text = el.textContent || '';
      if (/^Mark uses the tools you enable/i.test(text)) {
        setElementText(el, text.replace(/^Mark uses/i, 'Chad uses'));
      } else if (/available to Mark/i.test(text)) {
        setElementText(el, text.replace(/Mark/g, 'Chad'));
      }
    });
  }

  function installIdentityOverride() {
    if (window.__MSG_CHAD_IDENTITY_WRAPPED__) return;
    const original = typeof window.currentCompanionIdentity === 'function'
      ? window.currentCompanionIdentity
      : null;

    window.currentCompanionIdentity = function currentCompanionIdentityWithChad() {
      if (selected() === 'chad') return CHAD;
      if (original) return original();
      const id = selected();
      return id === 'beth'
        ? { id:'beth', name:'Beth', ask:'Ask Beth', avatar:'/assets/companions/beth/beth-avatar.png' }
        : { id:'mark', name:'Mark', ask:'Ask Mark', avatar:'/assets/ask-mark/ask-mark-avatar.png' };
    };
    window.__MSG_CHAD_IDENTITY_WRAPPED__ = true;
  }

  function installFetchBridge() {
    if (window.__MSG_CHAD_FETCH_WRAPPED__) return;
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async function chadAwareFetch(input, init = {}) {
      let url = '';
      try { url = typeof input === 'string' ? input : input?.url || ''; } catch {}

      const shouldInject = [
        '/api/mark-selection',
        '/api/read-anything/investor-analysis',
        '/api/app-help'
      ].some((path) => url.includes(path));

      if (shouldInject && init && typeof init.body === 'string') {
        const contentType = new Headers(init.headers || {}).get('Content-Type') || '';
        if (contentType.includes('application/json')) {
          try {
            const body = JSON.parse(init.body);
            body.companion = selected();
            init = { ...init, body: JSON.stringify(body) };
          } catch {}
        }
      }

      return nativeFetch(input, init);
    };

    window.__MSG_CHAD_FETCH_WRAPPED__ = true;
  }

  function apply() {
    if (applying) return;
    applying = true;
    try {
      const id = selected();
      document.documentElement.dataset.companion = id;

      addProfileChoice();

      if (id !== 'chad') {
        document.documentElement.classList.remove('msg-chad-active');
        restoreTextNodes();
        document.querySelectorAll('[data-chad-original-text]').forEach((el) => {
          el.textContent = el.dataset.chadOriginalText || '';
          delete el.dataset.chadOriginalText;
        });
        document.querySelectorAll('[data-chad-original-src]').forEach((img) => {
          img.setAttribute('src', img.dataset.chadOriginalSrc || '');
          delete img.dataset.chadOriginalSrc;
        });
        return;
      }

      document.documentElement.classList.add('msg-chad-active');
      document.documentElement.style.setProperty('--msg-companion-button-avatar', `url("${CHAD.avatar}")`);

      installIdentityOverride();
      updateFrontPage();
      updateReaderButtons();
      updateChatSurfaces();
      updateProfileCopy();

      document.querySelectorAll('.msg-walkthrough-mark-illustration, .msg-beth-photo').forEach((img) => {
        setImage(img, CHAD.avatar, 'Chad');
      });
    } finally {
      applying = false;
    }
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }

  // Observe the two existing persona options as well, so switching back from Chad
  // immediately restores normal Mark/Beth behavior.
  document.addEventListener('click', (event) => {
    const option = event.target.closest?.('.companion-persona-options button');
    if (!option) return;
    const label = (option.textContent || '').toLowerCase();
    if (label.includes('chad')) return;
    setTimeout(scheduleApply, 0);
  }, true);

  installFetchBridge();

  const boot = () => {
    installIdentityOverride();
    apply();

    const target = document.getElementById('app') || document.body;
    new MutationObserver(scheduleApply).observe(target, {
      childList: true,
      subtree: true
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.MSGChad = Object.freeze({
    config: CHAD,
    selected: () => selected() === 'chad',
    select: () => setSelected('chad'),
    apply: scheduleApply
  });
})();
