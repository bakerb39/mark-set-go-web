(() => {
  'use strict';

  /*
   * v9.4.1 right-click-safe companion persona layer.
   *
   * IMPORTANT: this module intentionally does NOT observe the whole reader DOM.
   * The v9.4.0 global MutationObservers could run while the reader was creating
   * its custom word context menu. Companion updates are now event-driven and
   * never intercept contextmenu/pointer events.
   */

  const STORAGE_KEY = 'msg_companion_persona_v1';
  const VALID = new Set(['mark', 'beth']);
  const MARK_AVATAR = '/assets/walkthrough/mark-walkthrough-guide.png';
  const BETH_AVATAR = '/assets/companions/beth/beth-avatar.png';
  const BETH_FRONTPAGE = '/assets/companions/beth/beth-frontpage-badge.png';
  const BETH_READING = '/assets/companions/beth/beth-reading.png';
  const BETH_POINTING = '/assets/companions/beth/beth-pointing.png';

  const state = {
    id: VALID.has(localStorage.getItem(STORAGE_KEY)) ? localStorage.getItem(STORAGE_KEY) : 'mark'
  };

  const config = {
    mark: { id:'mark', name:'Mark', ask:'Ask Mark', notebook:"Mark's Notebook", subject:'he', object:'him', possessive:'his', avatar:MARK_AVATAR },
    beth: { id:'beth', name:'Beth', ask:'Ask Beth', notebook:"Beth's Notebook", subject:'she', object:'her', possessive:'her', avatar:BETH_AVATAR, frontpage:BETH_FRONTPAGE, reading:BETH_READING, pointing:BETH_POINTING }
  };

  const textRules = [
    [/Ask Mark/g, 'Ask Beth'],
    [/ASK MARK/g, 'ASK BETH'],
    [/Discuss with Mark/g, 'Discuss with Beth'],
    [/Send to Ask Mark/g, 'Send to Ask Beth'],
    [/Send to Mark/g, 'Send to Beth'],
    [/Mark is reading/g, 'Beth is reading'],
    [/Mark’s Notebook/g, 'Beth’s Notebook'],
    [/Mark's Notebook/g, "Beth's Notebook"],
    [/Go Further with Mark/g, 'Go Further with Beth'],
    [/Mark will guide you/g, 'Beth will guide you'],
    [/study with Mark/g, 'study with Beth'],
    [/Open Mark as your reading companion\. He/g, 'Open Beth as your reading companion. She'],
    [/Open Mark as your reading companion/g, 'Open Beth as your reading companion'],
    [/Mark output/g, 'Beth output'],
    [/Mark as your reading companion/g, 'Beth as your reading companion'],
    [/with Mark\b/g, 'with Beth'],
    [/from Mark\b/g, 'from Beth']
  ];

  const bethImageSelectors = [
    '.home-mark-avatar',
    '.mark-photo-pointer-image',
    '.msg-walkthrough-mark-illustration',
    'img.ask-mark-avatar',
    'img[class*="ask-mark"][class*="avatar"]',
    'img[class*="mark"][class*="portrait"]',
    'img[class*="mark"][class*="avatar"]'
  ].join(',');

  /* Reader surfaces are deliberately excluded from broad companion rewriting.
     The word context menu is especially protected because its lifetime is tied
     to the contextmenu event. */
  const PROTECTED_SELECTOR = [
    '#reader-frame',
    '#reader',
    '.reader',
    '.reader-frame',
    '.reader-word',
    '.word-context-menu',
    '.reader-selection-toolbar',
    '#mark-selection-toolbar'
  ].join(',');

  function current() { return config[state.id] || config.mark; }

  function isBrandNode(node) {
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return !!el?.closest?.('.brand,.site-footer,.site-footer-version,[data-companion-no-swap]');
  }

  function isProtectedNode(node) {
    const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return !!el?.closest?.(PROTECTED_SELECTOR);
  }

  function replaceTextValue(value) {
    if (state.id !== 'beth' || !value || value.includes('Mark, Set, Go!')) return value;
    let out = value;
    for (const [re, replacement] of textRules) out = out.replace(re, replacement);
    return out;
  }

  function applyText(root = document.body, { includeProtected = false } = {}) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      if (isBrandNode(node)) continue;
      if (!includeProtected && isProtectedNode(node)) continue;

      if (state.id === 'beth') {
        const next = replaceTextValue(node.nodeValue);
        if (node.__msgOriginalText == null && next !== node.nodeValue) node.__msgOriginalText = node.nodeValue;
        if (next !== node.nodeValue) node.nodeValue = next;
      } else if (node.__msgOriginalText != null) {
        node.nodeValue = node.__msgOriginalText;
        delete node.__msgOriginalText;
      }
    }

    root.querySelectorAll?.('[aria-label],[title],[placeholder],input[value],button[value]').forEach((el) => {
      if (isBrandNode(el)) return;
      if (!includeProtected && isProtectedNode(el)) return;

      ['aria-label','title','placeholder','value'].forEach((attr) => {
        if (!el.hasAttribute(attr)) return;
        const key = `msgOriginal${attr.replace(/[^a-z]/gi,'_')}`;
        if (state.id === 'beth') {
          const before = el.getAttribute(attr);
          const after = replaceTextValue(before);
          if (after !== before) {
            if (!(key in el.dataset)) el.dataset[key] = before;
            el.setAttribute(attr, after);
          }
        } else if (key in el.dataset) {
          el.setAttribute(attr, el.dataset[key]);
          delete el.dataset[key];
        }
      });
    });
  }

  function bethAssetForImage(img) {
    if (img.matches('.home-mark-avatar')) return BETH_FRONTPAGE;
    if (img.matches('.mark-photo-pointer-image,.msg-walkthrough-mark-illustration')) return BETH_POINTING;
    if (img.matches('img.ask-mark-avatar,img[class*="ask-mark"][class*="avatar"]')) return BETH_AVATAR;
    if (img.matches('img[class*="mark"][class*="portrait"]')) return BETH_READING;
    return BETH_AVATAR;
  }

  function applyImages(root = document) {
    root.querySelectorAll?.(bethImageSelectors).forEach((img) => {
      if (!(img instanceof HTMLImageElement)) return;
      if (!img.dataset.msgOriginalSrc) img.dataset.msgOriginalSrc = img.getAttribute('src') || '';
      if (state.id === 'beth') {
        img.src = bethAssetForImage(img);
        img.alt = img.alt?.replace(/Mark/g, 'Beth') || 'Beth';
        img.classList.add('msg-beth-photo');
      } else {
        if (img.dataset.msgOriginalSrc) img.src = img.dataset.msgOriginalSrc;
        img.classList.remove('msg-beth-photo');
      }
    });
  }

  function applyKnownReaderLabels() {
    /* Target only visible companion labels inside protected reader UI. This
       avoids walking/mutating the reader or word context-menu DOM. */
    const selectors = [
      '[data-action="ask-mark"]',
      '[data-action="discuss-with-mark"]',
      '[data-ask-mark]',
      '.ask-mark-button',
      '.discuss-with-mark',
      '.selection-send-to-mark',
      '#mark-selection-toolbar [data-action*="mark"]'
    ];
    document.querySelectorAll(selectors.join(',')).forEach((el) => {
      if (el.matches('.word-context-menu,.word-context-menu *')) return;
      const text = el.textContent;
      if (!text) return;
      if (!el.dataset.msgOriginalCompanionText) el.dataset.msgOriginalCompanionText = text;
      const source = el.dataset.msgOriginalCompanionText;
      const next = state.id === 'beth' ? replaceTextValue(source) : source;
      if (text !== next) el.textContent = next;
    });
  }

  function profileLikelyOpen() {
    if (document.querySelector('.companion-persona-settings')) return true;
    return !!document.querySelector('[data-page="profile"],.profile-page,.profile-preferences,.experience-profile');
  }

  function ensureProfileControl(force = false) {
    const app = document.getElementById('app');
    if (!app || document.querySelector('.companion-persona-settings')) return;
    if (!force && !profileLikelyOpen()) return;

    const card = document.createElement('section');
    card.className = 'companion-persona-settings';
    card.setAttribute('aria-labelledby','companion-persona-title');
    card.innerHTML = `
      <div class="companion-persona-heading">
        <div><span class="companion-persona-kicker">READING COMPANION</span><h2 id="companion-persona-title">Choose your companion</h2></div>
        <p>Use the same reading, study, notebook, and walkthrough features with Mark or Beth.</p>
      </div>
      <div class="companion-persona-options" role="radiogroup" aria-label="Reading companion">
        <button type="button" data-companion-choice="mark" role="radio"><img src="${MARK_AVATAR}" alt="Mark"><span><strong>Mark</strong><small>Ask Mark</small></span><span class="companion-check">✓</span></button>
        <button type="button" data-companion-choice="beth" role="radio"><img src="${BETH_AVATAR}" alt="Beth"><span><strong>Beth</strong><small>Ask Beth</small></span><span class="companion-check">✓</span></button>
      </div>`;
    app.appendChild(card);
    card.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-companion-choice]');
      if (!btn) return;
      api.set(btn.dataset.companionChoice);
    });
    updateProfileControl();
  }

  function updateProfileControl() {
    document.querySelectorAll('[data-companion-choice]').forEach((btn) => {
      const selected = btn.dataset.companionChoice === state.id;
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
  }

  let applyTimer = 0;
  function applyAll({ includeProtected = false } = {}) {
    document.documentElement.dataset.companion = state.id;
    applyText(document.body, { includeProtected });
    applyKnownReaderLabels();
    applyImages(document);
    updateProfileControl();
  }

  function scheduleApply(delay = 0) {
    window.clearTimeout(applyTimer);
    applyTimer = window.setTimeout(() => applyAll(), delay);
  }

  function scheduleAfterUiAction() {
    /* A few bounded passes catch normal app renders without observing every
       DOM mutation. None run synchronously inside contextmenu handling. */
    scheduleApply(0);
    window.setTimeout(() => applyAll(), 90);
    window.setTimeout(() => applyAll(), 260);
  }

  const api = {
    get id() { return state.id; },
    get name() { return current().name; },
    get config() { return current(); },
    set(id) {
      const next = VALID.has(id) ? id : 'mark';
      if (state.id === next) return;
      state.id = next;
      localStorage.setItem(STORAGE_KEY, next);
      applyAll({ includeProtected: false });
      window.dispatchEvent(new CustomEvent('msg:companion-changed', { detail: { companion: next } }));
    },
    apply: applyAll,
    ensureProfileControl
  };
  window.MSGCompanion = api;

  /* Bubble-phase click listener only. It never receives right-click/contextmenu
     events and never calls preventDefault/stopPropagation. */
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="profile-preferences"]')) {
      window.setTimeout(() => ensureProfileControl(true), 80);
      window.setTimeout(() => ensureProfileControl(true), 300);
    }
    scheduleAfterUiAction();
  }, false);

  window.addEventListener('hashchange', scheduleAfterUiAction);
  window.addEventListener('popstate', scheduleAfterUiAction);
  window.addEventListener('msg:companion-changed', () => scheduleAfterUiAction());

  document.addEventListener('DOMContentLoaded', () => {
    applyAll();
    window.setTimeout(() => applyAll(), 120);
  });
})();
