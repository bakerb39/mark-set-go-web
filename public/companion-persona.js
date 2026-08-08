(() => {
  'use strict';

  /*
   * v9.4.1 right-click-safe companion persona layer.
   *
   * IMPORTANT: this module intentionally does NOT observe the whole reader DOM.
   * The v9.4.0 global MutationObservers could run while the reader was creating
   * its custom word context menu. Companion updates are now event-driven and
   * stays isolated from reader interaction handlers.
   */

  const STORAGE_KEY = 'msg_companion_persona_v1';
  const VALID = new Set(['mark', 'beth']);
  const MARK_AVATAR = '/assets/walkthrough/mark-walkthrough-guide.png';
  const BETH_AVATAR = '/assets/companions/beth/beth-avatar.png';
  const BETH_FRONTPAGE = '/assets/companions/beth/beth-avatar.png';
  const BETH_READING = '/assets/companions/beth/beth-avatar.png';
  const BETH_POINTING = '/assets/companions/beth/beth-avatar.png';

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
    [/Meet Mark\./g, 'Meet Beth.'],
    [/Meet Mark\b/g, 'Meet Beth'],
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
     to reader interaction state. */
  const PROTECTED_SELECTOR = [
    '#reader-frame',
    '#reader',
    '.reader',
    '.reader-frame',
    '.reader-word',
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

  function applyFrontpageCompanionMode(root = document) {
    const stage = root.querySelector?.('.home-mark-icon-stage');
    if (!stage) return;
    stage.classList.toggle('companion-frontpage-badge-mode', state.id === 'beth');
    stage.querySelectorAll('.home-mark-stage-caption').forEach((el) => {
      el.hidden = state.id === 'beth';
    });
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

  function applyAskCompanionButtonAvatar() {
    const buttons = document.querySelectorAll([
      '#toggle-mark-panel',
      '.reader-pane-buttons .mark-pane-button',
      '.ask-mark-button',
      '[data-action="ask-mark"]'
    ].join(','));

    buttons.forEach((button) => {
      if (!(button instanceof HTMLElement)) return;
      const desiredSrc = state.id === 'beth' ? BETH_AVATAR : MARK_AVATAR;
      const desiredName = state.id === 'beth' ? 'Beth' : 'Mark';

      /* Prefer the button's real image when it has one. This avoids adding a
         second icon on builds where the Ask companion control already renders
         a portrait. */
      const img = button.querySelector('img');
      if (img instanceof HTMLImageElement) {
        if (!img.dataset.msgOriginalCompanionButtonSrc) {
          img.dataset.msgOriginalCompanionButtonSrc = img.getAttribute('src') || '';
        }
        img.src = state.id === 'beth'
          ? desiredSrc
          : (img.dataset.msgOriginalCompanionButtonSrc || desiredSrc);
        img.alt = desiredName;
        button.classList.remove('msg-companion-avatar-fallback');
        return;
      }

      /* Some reader builds render the old Mark medallion as an icon/span rather
         than an <img>. In that case CSS supplies one persona-aware portrait and
         suppresses only the legacy icon inside this button. */
      button.classList.add('msg-companion-avatar-fallback');
      button.style.setProperty('--msg-companion-button-avatar', `url("${desiredSrc}")`);
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
    // Put the companion choice at the TOP of Customize My Experience / Profile.
    // Prefer the existing experience/profile content container instead of appending
    // to the end of #app. If a visible heading named "Customize My Experience"
    // exists, insert the selector immediately after that heading block.
    const experienceHost =
      document.querySelector('.experience-profile,.profile-preferences,[data-page="profile"],.profile-page') || app;

    const headings = Array.from(experienceHost.querySelectorAll('h1,h2,h3,.page-title,.section-title'));
    const customizeHeading = headings.find((el) =>
      /customize\s+my\s+experience/i.test((el.textContent || '').trim())
    );

    if (customizeHeading) {
      const headingBlock = customizeHeading.closest('header,.page-header,.section-header') || customizeHeading;
      headingBlock.insertAdjacentElement('afterend', card);
    } else {
      // No named heading found: make it the first setting in the profile/experience area.
      experienceHost.insertBefore(card, experienceHost.firstElementChild || null);
    }

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
    applyAskCompanionButtonAvatar();
    applyImages(document);
    applyFrontpageCompanionMode(document);
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

  /* Bubble-phase companion/profile click listener only. */
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
