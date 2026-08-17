(() => {
  'use strict';

  // Scott is an additive fourth companion layered on the existing
  // Mark / Beth / Chad companion system. Uses event-driven synchronization only.
  const STORAGE_KEY = 'msg_companion_persona_v2';
  const LEGACY_STORAGE_KEY = 'msg_companion_persona_v1';
  const SCOTT_FLAG_KEY = 'msg_companion_scott_selected_v1';

  const SCOTT = Object.freeze({
    id: 'scott',
    name: 'Scott',
    ask: 'Ask Scott',
    notebook: 'Scott’s Notebook',
    avatar: '/assets/companions/scott/scott-avatar.png',
    description: 'CEO & Co-Founder · SK Global Software'
  });

  const FALLBACKS = {
    mark: {
      id: 'mark', name: 'Mark', ask: 'Ask Mark', notebook: 'Mark’s Notebook',
      avatar: '/assets/ask-mark/ask-mark-avatar.png'
    },
    beth: {
      id: 'beth', name: 'Beth', ask: 'Ask Beth', notebook: 'Beth’s Notebook',
      avatar: '/assets/companions/beth/beth-ui-avatar.png?v=9.6.9'
    },
    chad: {
      id: 'chad', name: 'Chad', ask: 'Ask Chad', notebook: 'Chad’s Notebook',
      avatar: '/assets/companions/chad/chad-avatar.png'
    }
  };

  function storedCompanion() {
    try {
      if (localStorage.getItem(SCOTT_FLAG_KEY) === '1') return 'scott';
      return String(
        localStorage.getItem(STORAGE_KEY) ||
        localStorage.getItem(LEGACY_STORAGE_KEY) ||
        'mark'
      ).toLowerCase();
    } catch {
      return 'mark';
    }
  }

  function ensureCompanionObject() {
    try {
      if (!window.MSGCompanion || typeof window.MSGCompanion !== 'object') {
        window.MSGCompanion = {};
      }
      return window.MSGCompanion;
    } catch {
      return null;
    }
  }

  function setLiveConfig(config) {
    const live = ensureCompanionObject();
    if (!live) return false;
    try {
      live.config = { ...config };
      return true;
    } catch {
      return false;
    }
  }

  function dispatchCompanionChange(config) {
    window.dispatchEvent(new CustomEvent('msg:companion-changed', {
      detail: { companion: config.id, config: { ...config } }
    }));
  }

  function replaceCompanionName(value, name = 'Scott') {
    return String(value || '').replace(/\b(?:Mark|Beth|Chad|Scott)\b/g, name);
  }

  function syncAskButtons() {
    const selectors = [
      '#toggle-mark-panel',
      '.reader-pane-buttons .mark-pane-button',
      '.ask-mark-button',
      '[data-action="ask-mark"]'
    ];

    document.documentElement.style.setProperty(
      '--msg-companion-button-avatar',
      `url("${SCOTT.avatar}")`
    );

    document.querySelectorAll(selectors.join(',')).forEach((button) => {
      button.classList.add('msg-companion-avatar-fallback');
      const labelNodes = [...button.querySelectorAll('span,strong')].filter((node) =>
        /Ask\s+(?:Mark|Beth|Chad|Scott)/i.test(node.textContent || '')
      );
      if (labelNodes.length) {
        labelNodes.forEach((node) => { node.textContent = SCOTT.ask; });
      } else if (/Ask\s+(?:Mark|Beth|Chad|Scott)/i.test(button.textContent || '')) {
        [...button.childNodes].forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE && /Ask\s+(?:Mark|Beth|Chad|Scott)/i.test(node.textContent || '')) {
            node.textContent = node.textContent.replace(/Ask\s+(?:Mark|Beth|Chad|Scott)/ig, SCOTT.ask);
          }
        });
      }
      if (button.getAttribute('aria-label')) {
        button.setAttribute('aria-label', replaceCompanionName(button.getAttribute('aria-label')));
      }
      if (button.title && /Mark|Beth|Chad|Scott/.test(button.title)) {
        button.title = replaceCompanionName(button.title);
      }
    });
  }

  function syncFullscreenCopy() {
    const drawer = document.querySelector('#fullscreen-mark-drawer');
    if (!drawer) return;
    const heading = drawer.querySelector('.fullscreen-mark-header strong');
    if (heading) heading.textContent = SCOTT.ask;
    const tab = drawer.querySelector('[data-fs-mark-tab="selection"]');
    if (tab) tab.textContent = SCOTT.ask;
    drawer.setAttribute('aria-label', 'Ask Scott reading companion');
    drawer.querySelectorAll('[aria-label]').forEach((node) => {
      const label = node.getAttribute('aria-label');
      if (label && /Mark|Beth|Chad|Scott/.test(label)) {
        node.setAttribute('aria-label', replaceCompanionName(label));
      }
    });
  }

  function syncHomeBadge() {
    const avatar = document.querySelector('.home-mark-avatar');
    if (!avatar) return;
    avatar.src = SCOTT.avatar;
    avatar.alt = 'Scott, your reading companion.';
    const stage = avatar.closest('.home-mark-icon-stage');
    stage?.classList.add('companion-frontpage-badge-mode');
  }

  function syncExistingConversation() {
    const shell = document.querySelector('.askmark-shell, #ask-mark-hub, .askmark-hub');
    if (!shell) return;
    const avatar = shell.querySelector('.askmark-avatar');
    if (avatar) {
      avatar.src = SCOTT.avatar;
      avatar.alt = SCOTT.name;
    }
    const heading = shell.querySelector('.askmark-brand-copy h2');
    if (heading) heading.textContent = SCOTT.ask;
    shell.querySelectorAll('.askmark-message.mark-message').forEach((message) => {
      const img = message.querySelector(':scope > img');
      if (img) { img.src = SCOTT.avatar; img.alt = SCOTT.name; }
      const name = message.querySelector(':scope > div > span');
      if (name && /^(Mark|Beth|Chad|Scott)(\s*·.*)?$/.test(name.textContent.trim())) {
        name.textContent = name.textContent.includes('·')
          ? `${SCOTT.name} · ${name.textContent.split('·').slice(1).join('·').trim()}`
          : SCOTT.name;
      }
      message.querySelectorAll('.mark-response-heading span').forEach((node) => {
        node.textContent = SCOTT.ask;
      });
    });
    const notebook = shell.querySelector('.askmark-subhead h3');
    if (notebook && /Notebook/.test(notebook.textContent || '')) notebook.textContent = SCOTT.notebook;
  }

  function syncSelectedPresentation() {
    if (storedCompanion() !== 'scott') return;
    document.documentElement.dataset.companion = 'scott';
    setLiveConfig(SCOTT);
    syncAskButtons();
    syncFullscreenCopy();
    syncHomeBadge();
    syncExistingConversation();
  }

  function companionIdFromButton(button) {
    if (!button) return '';
    if (button.matches('[data-companion-scott]')) return 'scott';
    const attrs = [
      button.dataset.companion,
      button.dataset.companionPersona,
      button.dataset.persona,
      button.dataset.companionChoice,
      button.getAttribute('value')
    ];
    const direct = attrs.find((value) => /^(mark|beth|chad|scott)$/i.test(String(value || '')));
    if (direct) return String(direct).toLowerCase();
    const text = String(button.textContent || '').trim();
    const match = text.match(/\b(Mark|Beth|Chad|Scott)\b/i);
    return match ? match[1].toLowerCase() : '';
  }

  function makeScottButton(container) {
    const buttons = [...container.querySelectorAll('button')];
    const chadButton = buttons.find((button) => companionIdFromButton(button) === 'chad');
    let button;

    if (chadButton) {
      button = chadButton.cloneNode(true);
      button.removeAttribute('id');
      [...button.attributes].forEach((attribute) => {
        if (/chad/i.test(attribute.value)) {
          button.setAttribute(attribute.name, attribute.value.replace(/chad/ig, 'scott'));
        }
      });
      const image = button.querySelector('img');
      if (image) {
        image.src = SCOTT.avatar;
        image.alt = 'Scott';
      }
      const strong = button.querySelector('strong');
      if (strong) strong.textContent = 'Scott';
      const small = button.querySelector('small');
      if (small) small.textContent = SCOTT.description;
    } else {
      button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = `
        <img src="${SCOTT.avatar}" alt="Scott">
        <span><strong>Scott</strong><small>${SCOTT.description}</small></span>
        <span class="companion-check" aria-hidden="true">✓</span>`;
    }

    button.type = 'button';
    button.dataset.companionScott = 'scott';
    button.dataset.companion = 'scott';
    button.setAttribute('aria-label', 'Choose Scott as your reading companion');
    button.classList.remove('is-selected');
    return button;
  }

  function installScottProfileChoice() {
    const container = document.querySelector('.companion-persona-options');
    if (!container) return false;

    let button = container.querySelector('[data-companion-scott="scott"]');
    if (!button) {
      button = makeScottButton(container);
      container.appendChild(button);
    }

    if (storedCompanion() === 'scott') {
      container.querySelectorAll('button.is-selected').forEach((item) => item.classList.remove('is-selected'));
      button.classList.add('is-selected');
      button.setAttribute('aria-pressed', 'true');
    } else {
      button.classList.remove('is-selected');
      button.setAttribute('aria-pressed', 'false');
    }

    return true;
  }

  function selectScott() {
    try {
      localStorage.setItem(STORAGE_KEY, 'scott');
      localStorage.setItem(LEGACY_STORAGE_KEY, 'scott');
      localStorage.setItem(SCOTT_FLAG_KEY, '1');
    } catch {}

    document.documentElement.dataset.companion = 'scott';
    setLiveConfig(SCOTT);
    installScottProfileChoice();
    syncSelectedPresentation();
    dispatchCompanionChange(SCOTT);

    // Re-apply once after the existing companion listeners have handled the same
    // change event. This is a one-shot task, not DOM observation.
    queueMicrotask(() => {
      setLiveConfig(SCOTT);
      syncSelectedPresentation();
      installScottProfileChoice();
    });
  }

  function leaveScottIfNeeded(button) {
    const id = companionIdFromButton(button);
    if (!id || id === 'scott') return;
    try { localStorage.removeItem(SCOTT_FLAG_KEY); } catch {}

    // If the existing companion system has not yet replaced Scott's live config,
    // restore a compatible fallback for the selected existing companion.
    queueMicrotask(() => {
      if (window.MSGCompanion?.config?.id === 'scott') {
        setLiveConfig(FALLBACKS[id] || FALLBACKS.mark);
      }
    });
  }

  function scheduleProfileInstall() {
    requestAnimationFrame(() => {
      installScottProfileChoice();
      if (storedCompanion() === 'scott') syncSelectedPresentation();
    });
    [60, 180, 420].forEach((delay) => {
      window.setTimeout(() => {
        installScottProfileChoice();
        if (storedCompanion() === 'scott') syncSelectedPresentation();
      }, delay);
    });
  }

  // Capture only Scott's own new button so older delegated handlers cannot
  // misinterpret an unfamiliar fourth persona. Existing Mark/Beth/Chad clicks
  // are left entirely to their current handlers.
  document.addEventListener('click', (event) => {
    const scottButton = event.target.closest?.('[data-companion-scott="scott"]');
    if (scottButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      selectScott();
      return;
    }

    const existingChoice = event.target.closest?.('.companion-persona-options button');
    if (existingChoice) leaveScottIfNeeded(existingChoice);

    // Profile/home/reader are rendered dynamically by app.js. A one-shot
    // post-click install keeps Scott synchronized without observing the DOM.
    if (event.target.closest?.('[data-action]')) scheduleProfileInstall();
  }, true);

  window.addEventListener('msg:companion-changed', () => {
    if (storedCompanion() === 'scott') {
      queueMicrotask(() => {
        setLiveConfig(SCOTT);
        syncSelectedPresentation();
        installScottProfileChoice();
      });
    }
  });

  window.MarkSetGoScottCompanion = Object.freeze({
    config: SCOTT,
    select: selectScott,
    sync: () => {
      installScottProfileChoice();
      syncSelectedPresentation();
    }
  });

  if (storedCompanion() === 'scott') {
    setLiveConfig(SCOTT);
    document.documentElement.dataset.companion = 'scott';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleProfileInstall, { once: true });
  } else {
    scheduleProfileInstall();
  }
})();
