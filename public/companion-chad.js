(() => {
  'use strict';

  const STORAGE_KEY = 'msg_companion_persona_v2';
  const LEGACY_KEY = 'msg_companion_persona_v1';

  const CHAD = Object.freeze({
    id: 'chad',
    name: 'Chad',
    ask: 'Ask Chad',
    avatar: '/assets/companions/chad/chad-avatar.png',
    specialty: 'Financial analysis, investing, markets, business, and economics'
  });

  const FALLBACK_DELAY_MS = 1500;
  let scheduled = false;
  let applying = false;
  let fallbackTimer = 0;

  function selected() {
    try {
      const value = (localStorage.getItem(STORAGE_KEY) ||
        localStorage.getItem(LEGACY_KEY) || 'mark').toLowerCase();
      return ['mark', 'beth', 'chad'].includes(value) ? value : 'mark';
    } catch {
      return 'mark';
    }
  }

  function writeSelected(id) {
    const value = ['mark', 'beth', 'chad'].includes(id) ? id : 'mark';
    try {
      localStorage.setItem(STORAGE_KEY, value);
      localStorage.setItem(LEGACY_KEY, value);
    } catch {}
    document.documentElement.dataset.companion = value;
    document.dispatchEvent(new CustomEvent('marksetgo:companion-changed', {
      detail: { id: value }
    }));
  }

  function currentIdentity() {
    if (selected() === 'chad') return CHAD;

    const live = window.MSGCompanion?.config;
    if (live?.id && live.id !== 'chad') return live;

    return selected() === 'beth'
      ? {
          id: 'beth',
          name: 'Beth',
          ask: 'Ask Beth',
          avatar: '/assets/companions/beth/beth-ui-avatar.png?v=9.6.9'
        }
      : {
          id: 'mark',
          name: 'Mark',
          ask: 'Ask Mark',
          avatar: '/assets/ask-mark/ask-mark-avatar.png'
        };
  }

  // The app's own currentCompanionIdentity() reads window.MSGCompanion.config.
  // Expose Chad through THAT existing contract rather than creating a second
  // competing companion system.
  let activeCompanionProxy = null;
  let activeCompanionTarget = null;

  function installCompanionProxy() {
    // The legacy Mark/Beth script can replace window.MSGCompanion after Chad has
    // already loaded. Re-wrap the live object whenever that happens instead of
    // assuming a one-time proxy remains installed forever.
    if (activeCompanionProxy && window.MSGCompanion === activeCompanionProxy) return;

    const live = window.MSGCompanion || {};
    const target = live === activeCompanionProxy
      ? (activeCompanionTarget || {})
      : live;

    const proxy = new Proxy(target, {
      get(targetObject, property, receiver) {
        if (property === 'config' && selected() === 'chad') return CHAD;
        const value = Reflect.get(targetObject, property, receiver);
        return typeof value === 'function' ? value.bind(targetObject) : value;
      }
    });

    try {
      activeCompanionTarget = target;
      activeCompanionProxy = proxy;
      window.MSGCompanion = proxy;
      window.__MSG_CHAD_COMPANION_PROXY__ = true;
      window.__MSG_CHAD_ORIGINAL_COMPANION__ = target;
    } catch (error) {
      console.warn('Ask Chad could not wrap the existing companion API.', error);
    }
  }

  function chadCardMarkup() {
    return `
      <button type="button"
              data-companion-choice="chad"
              class="companion-chad-choice"
              aria-pressed="false">
        <img src="${CHAD.avatar}" alt="Chad">
        <span>
          <strong>Chad</strong>
          <small>Financial analysis, investing, markets &amp; economics</small>
        </span>
        <span class="companion-check" aria-hidden="true">✓</span>
      </button>`;
  }

  function canonicalCompanionOptions() {
    const groups = Array.from(
      document.querySelectorAll('#app .companion-persona-options')
    );

    // Never choose our emergency fallback when the app's real Mark/Beth
    // selector exists elsewhere in #app (the current build places it outside
    // the profile-preferences-page wrapper).
    return groups.find((group) => !group.closest('[data-chad-fallback-selector]')) || null;
  }

  function removeFallbackSelector() {
    document.querySelectorAll('[data-chad-fallback-selector]')
      .forEach((section) => section.remove());
  }

  function bindChadButton(button) {
    if (!button || button.dataset.chadBound === '1') return;
    button.dataset.chadBound = '1';

    button.addEventListener('click', (event) => {
      // The legacy Mark/Beth selector does not understand a third value.
      // Prevent its delegated click handler from normalizing Chad back to Beth.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      writeSelected('chad');
      installCompanionProxy();
      applyNow();
    }, true);
  }

  function addChadToCanonicalSelector() {
    const options = canonicalCompanionOptions();
    if (!options) return false;

    removeFallbackSelector();

    let button = options.querySelector(
      '[data-companion-choice="chad"], [data-persona="chad"]'
    );

    if (!button) {
      const holder = document.createElement('div');
      holder.innerHTML = chadCardMarkup().trim();
      button = holder.firstElementChild;
      options.appendChild(button);
    }

    bindChadButton(button);
    return true;
  }

  function createFallbackSelector() {
    if (canonicalCompanionOptions()) return;
    if (document.querySelector('[data-chad-fallback-selector]')) return;

    const page = document.querySelector('#app .profile-preferences-page');
    if (!page) return;

    const section = document.createElement('section');
    section.className = 'companion-persona-settings profile-feature-card';
    section.dataset.chadFallbackSelector = '1';
    section.innerHTML = `
      <div class="companion-persona-heading">
        <div>
          <span class="companion-persona-kicker">READING COMPANION</span>
          <h2>Choose your companion</h2>
        </div>
        <p>Choose the perspective you want throughout the Reader and Ask companion tools.</p>
      </div>
      <div class="companion-persona-options">
        <button type="button" data-companion-choice="mark">
          <img src="/assets/ask-mark/ask-mark-avatar.png" alt="Mark">
          <span><strong>Mark</strong><small>Your thoughtful general reading companion</small></span>
          <span class="companion-check" aria-hidden="true">✓</span>
        </button>
        <button type="button" data-companion-choice="beth">
          <img src="/assets/companions/beth/beth-ui-avatar.png?v=9.6.9" alt="Beth">
          <span><strong>Beth</strong><small>A warm, encouraging reading companion</small></span>
          <span class="companion-check" aria-hidden="true">✓</span>
        </button>
        ${chadCardMarkup()}
      </div>`;

    const hero = page.querySelector('.platform-hero');
    hero?.insertAdjacentElement('afterend', section);

    section.querySelector('[data-companion-choice="mark"]')?.addEventListener('click', () => {
      writeSelected('mark');
      applyNow();
    });
    section.querySelector('[data-companion-choice="beth"]')?.addEventListener('click', () => {
      writeSelected('beth');
      applyNow();
    });
    bindChadButton(section.querySelector('[data-companion-choice="chad"]'));
  }

  function ensureProfileSelector() {
    // The unified Profile selector is owned by companion-persona-safe.js.
    // Never create a second/emergency selector here.
    window.clearTimeout(fallbackTimer);
    addChadToCanonicalSelector();
    syncProfileSelection();
  }

  function resolvedChoiceId(button) {
    const explicit = button?.dataset?.companionChoice ||
      button?.dataset?.persona || '';
    if (['mark', 'beth', 'chad'].includes(explicit)) return explicit;

    const text = (button?.textContent || '').toLowerCase();
    if (text.includes('chad')) return 'chad';
    if (text.includes('beth')) return 'beth';
    return 'mark';
  }

  function syncProfileSelection() {
    const id = selected();

    document.querySelectorAll('#app .companion-persona-options button')
      .forEach((button) => {
        const active = resolvedChoiceId(button) === id;
        button.classList.toggle('is-selected', active);
        button.setAttribute('aria-pressed', String(active));

        const check = button.querySelector('.companion-check');
        if (check) check.style.opacity = active ? '1' : '';
      });
  }

  function setImage(img, src, alt) {
    if (!img || !src) return;
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    if (alt) img.setAttribute('alt', alt);
  }

  function replaceCompanionText(root, identity) {
    if (!root || !identity) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const current = node.nodeValue || '';
      let next = current;

      next = next
        .replace(/Ask (Mark|Beth|Chad)/gi, identity.ask)
        .replace(/Meet (Mark|Beth|Chad)/gi, `Meet ${identity.name}`)
        .replace(/Hi,\s*I[’']m (?:Ask )?(Mark|Beth|Chad)/gi, `Hi, I’m ${identity.name}`)
        .replace(/\b(Mark|Beth|Chad)[’']s notebook\b/gi, `${identity.name}’s notebook`);

      // Companion labels in the drawer/header are often standalone uppercase
      // text nodes such as "BETH".
      const trimmed = next.trim();
      if (/^(MARK|BETH|CHAD)$/i.test(trimmed)) {
        const prefix = next.slice(0, next.indexOf(trimmed));
        const suffix = next.slice(next.indexOf(trimmed) + trimmed.length);
        const replacement = trimmed === trimmed.toUpperCase()
          ? identity.name.toUpperCase()
          : identity.name;
        next = `${prefix}${replacement}${suffix}`;
      }

      if (next !== current) node.nodeValue = next;
    }
  }

  function isKnownCompanionPortrait(img) {
    if (!img) return false;

    const src = String(img.getAttribute('src') || '').toLowerCase();
    const alt = String(img.getAttribute('alt') || '').toLowerCase();

    return (
      src.includes('/assets/ask-mark/') ||
      src.includes('/assets/companions/beth/') ||
      src.includes('/assets/companions/chad/') ||
      src.includes('ask-mark-avatar') ||
      src.includes('beth-avatar') ||
      src.includes('beth-universal') ||
      src.includes('chad-avatar') ||
      /^(mark|beth|chad)$/.test(alt.trim())
    );
  }

  function syncCompanionPortraits(root, identity) {
    if (!root || !identity) return;

    root.querySelectorAll('img').forEach((img) => {
      const inCompanionChrome = Boolean(img.closest(
        '.reader-control-header, ' +
        '.fullscreen-mark-header, ' +
        '.mark-selection-card, ' +
        '.mark-response, ' +
        '.mark-empty, ' +
        '.mark-panel-view, ' +
        '.fullscreen-mark-selection-card, ' +
        '.fullscreen-mark-drawer'
      ));

      if (isKnownCompanionPortrait(img) || inCompanionChrome) {
        setImage(img, identity.avatar, identity.name);
      }
    });

    // Some companion surfaces use an inline background-image instead of <img>.
    root.querySelectorAll('[style*="background-image"]').forEach((element) => {
      const value = String(element.style.backgroundImage || '').toLowerCase();
      if (
        value.includes('ask-mark') ||
        value.includes('companions/beth') ||
        value.includes('companions/chad')
      ) {
        element.style.backgroundImage = `url("${identity.avatar}")`;
      }
    });
  }

  function cleanDuplicateReaderButtonLabel(button) {
    if (!button) return;

    const personaText = /^(Ask\s+)?(Mark|Beth|Chad)$/i;

    // Remove the temporary label span introduced by the broken profile repair.
    button.querySelectorAll(':scope > [data-companion-label]').forEach((node) => node.remove());

    // If more than one direct child contains exactly the same Ask-persona label,
    // keep the first and remove only the duplicates. Icons/images are untouched.
    const labelChildren = Array.from(button.children).filter((child) =>
      child.tagName !== 'IMG' &&
      child.getAttribute('aria-hidden') !== 'true' &&
      personaText.test((child.textContent || '').trim())
    );
    labelChildren.slice(1).forEach((node) => node.remove());
  }

  function syncReaderButtons(identity) {
    const buttons = [
      document.querySelector('#toggle-mark-panel'),
      document.querySelector('#fullscreen-mark-toggle'),
      ...document.querySelectorAll(
        '.reader-pane-buttons .mark-pane-button, .ask-mark-button, [data-action="ask-mark"]'
      )
    ].filter(Boolean);

    for (const button of buttons) {
      cleanDuplicateReaderButtonLabel(button);
      const img = button.querySelector('img');

      if (img) {
        // This is the duplicated-avatar bug in the screenshots: a real <img>
        // PLUS the fallback ::before portrait. Never allow both.
        button.classList.remove('msg-companion-avatar-fallback');
        button.style.removeProperty('--msg-companion-button-avatar');
        setImage(img, identity.avatar, identity.name);
      } else {
        button.classList.add('msg-companion-avatar-fallback');
        button.style.setProperty(
          '--msg-companion-button-avatar',
          `url("${identity.avatar}")`
        );
      }

      replaceCompanionText(button, identity);
    }
  }

  function syncChatAndDrawer(identity) {
    const roots = [
      document.querySelector('#word-panel'),
      document.querySelector('#mark-selection-panel'),
      document.querySelector('#fullscreen-mark-drawer'),
      document.querySelector('#ask-mark-hub'),
      document.querySelector('.ask-mark-hub'),
      document.querySelector('.global-notebook-page')
    ].filter(Boolean);

    roots.forEach((root) => replaceCompanionText(root, identity));

    // The legacy companion code uses more than one avatar class depending on
    // which Reader surface is rendered. Synchronize every known companion
    // portrait inside the Reader drawer rather than relying on one class name.
    [
      document.querySelector('#word-panel'),
      document.querySelector('#fullscreen-mark-drawer')
    ].filter(Boolean).forEach((root) => syncCompanionPortraits(root, identity));

    // Also cover the main Reader companion buttons after their legacy script
    // has added a real <img> portrait.
    [
      document.querySelector('#toggle-mark-panel'),
      document.querySelector('#fullscreen-mark-toggle')
    ].filter(Boolean).forEach((root) => syncCompanionPortraits(root, identity));

  }

  function syncFrontPage(identity) {
    const avatar = document.querySelector('.home-mark-avatar');
    if (avatar) {
      setImage(avatar, identity.avatar, `${identity.name}, your reading companion.`);
      const stage = avatar.closest('.home-mark-icon-stage');
      stage?.classList.toggle(
        'companion-frontpage-badge-mode',
        identity.id === 'beth' || identity.id === 'chad'
      );
    }

    const card = document.querySelector('.home-mark-card');
    if (card) replaceCompanionText(card, identity);
  }

  function syncWalkthrough(identity) {
    document.querySelectorAll(
      '.msg-walkthrough-mark-illustration, .msg-beth-photo'
    ).forEach((img) => {
      // Limit generic Beth images to companion UI, not arbitrary content.
      if (
        img.classList.contains('msg-walkthrough-mark-illustration') ||
        img.closest('#word-panel, #fullscreen-mark-drawer, .companion-persona-settings')
      ) {
        setImage(img, identity.avatar, identity.name);
      }
    });
  }

  function installFetchBridge() {
    if (window.__MSG_CHAD_FETCH_WRAPPED__) return;

    const nativeFetch = window.fetch.bind(window);

    window.fetch = async function chadAwareFetch(input, init = {}) {
      let url = '';
      try {
        url = typeof input === 'string' ? input : input?.url || '';
      } catch {}

      const shouldInject = [
        '/api/mark-selection',
        '/api/read-anything/investor-analysis',
        '/api/app-help'
      ].some((path) => url.includes(path));

      if (shouldInject && typeof init?.body === 'string') {
        const headers = new Headers(init.headers || {});
        const contentType = headers.get('Content-Type') || '';

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

  function applyNow() {
    if (applying) return;
    applying = true;

    try {
      installCompanionProxy();
      ensureProfileSelector();

      const identity = currentIdentity();
      document.documentElement.dataset.companion = selected();
      document.documentElement.classList.toggle(
        'msg-chad-active',
        selected() === 'chad'
      );
      document.documentElement.style.setProperty(
        '--msg-companion-button-avatar',
        `url("${identity.avatar}")`
      );

      syncProfileSelection();
      syncReaderButtons(identity);
      syncChatAndDrawer(identity);
      syncFrontPage(identity);
      syncWalkthrough(identity);
    } finally {
      applying = false;
    }
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;
      applyNow();
    });
  }

  // Let Mark/Beth keep their existing click behavior. After their handler runs,
  // just synchronize the Chad layer to whatever choice they saved.
  document.addEventListener('click', (event) => {
    const choice = event.target.closest?.('.companion-persona-options button');
    if (!choice || resolvedChoiceId(choice) === 'chad') return;
    window.setTimeout(scheduleApply, 0);
  });

  installFetchBridge();

  const boot = () => {
    installCompanionProxy();
    applyNow();

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
    select() {
      writeSelected('chad');
      applyNow();
    },
    apply: scheduleApply
  });
})();
