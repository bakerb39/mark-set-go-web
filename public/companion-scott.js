(() => {
  'use strict';

  const STORAGE_KEY = 'msg_companion_persona_v2';
  const LEGACY_STORAGE_KEY = 'msg_companion_persona_v1';
  const COMPANIONS = Object.freeze({
    mark: Object.freeze({ id:'mark', name:'Mark', ask:'Ask Mark', notebook:'Mark’s Notebook', avatar:'/assets/ask-mark/ask-mark-avatar.png', description:'Your reading coach and guide' }),
    beth: Object.freeze({ id:'beth', name:'Beth', ask:'Ask Beth', notebook:'Beth’s Notebook', avatar:'/assets/companions/beth/beth-ui-avatar.png?v=9.6.9', description:'Your learning partner and analyst' }),
    chad: Object.freeze({ id:'chad', name:'Chad', ask:'Ask Chad', notebook:'Chad’s Notebook', avatar:'/assets/companions/chad/chad-avatar.png', description:'Your finance & investor specialist' }),
    scott: Object.freeze({ id:'scott', name:'Scott', ask:'Ask Scott', notebook:'Scott’s Notebook', avatar:'/assets/companions/scott/scott-avatar.png?v=20260816-scott-button-fix-2', description:'CEO & Co-Founder · SK Global Software' })
  });

  function selectedId() {
    try {
      const value = String(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || 'mark').toLowerCase();
      return COMPANIONS[value] ? value : 'mark';
    } catch { return 'mark'; }
  }

  function config() { return COMPANIONS[selectedId()]; }

  function setLiveConfig(next) {
    try {
      if (!window.MSGCompanion || typeof window.MSGCompanion !== 'object') window.MSGCompanion = {};
      window.MSGCompanion.config = { ...next };
    } catch {}
  }

  function writeSelection(id) {
    if (!COMPANIONS[id]) id = 'mark';
    try {
      localStorage.setItem(STORAGE_KEY, id);
      localStorage.setItem(LEGACY_STORAGE_KEY, id);
      // Remove the broken parallel-state key from the previous Scott package.
      localStorage.removeItem('msg_companion_scott_selected_v1');
    } catch {}
    document.documentElement.dataset.companion = id;
    setLiveConfig(COMPANIONS[id]);
  }

  function buttonId(button) {
    if (!button) return '';
    const direct = [button.dataset.companion, button.dataset.companionPersona, button.dataset.persona, button.dataset.companionChoice, button.value]
      .map((v) => String(v || '').toLowerCase())
      .find((v) => COMPANIONS[v]);
    if (direct) return direct;
    const match = String(button.textContent || '').match(/\b(Mark|Beth|Chad|Scott)\b/i);
    return match ? match[1].toLowerCase() : '';
  }

  function ensureScottButton() {
    const container = document.querySelector('.companion-persona-options');
    if (!container) return false;
    let button = [...container.querySelectorAll('button')].find((b) => buttonId(b) === 'scott');
    if (!button) {
      const chad = [...container.querySelectorAll('button')].find((b) => buttonId(b) === 'chad');
      button = chad ? chad.cloneNode(true) : document.createElement('button');
      button.type = 'button';
      button.removeAttribute('id');
      button.dataset.companion = 'scott';
      button.dataset.companionScott = 'scott';
      button.setAttribute('aria-label', 'Choose Scott as your reading companion');
      if (!button.innerHTML) {
        button.innerHTML = '<img><span><strong></strong><small></small></span><span class="companion-check" aria-hidden="true">✓</span>';
      }
      const img = button.querySelector('img');
      if (img) { img.src = COMPANIONS.scott.avatar; img.alt = 'Scott'; }
      const strong = button.querySelector('strong');
      if (strong) strong.textContent = 'Scott';
      const small = button.querySelector('small');
      if (small) small.textContent = COMPANIONS.scott.description;
      container.appendChild(button);
    }
    return true;
  }

  function normalizeProfileSelection() {
    const container = document.querySelector('.companion-persona-options');
    if (!container) return false;
    ensureScottButton();
    const selected = selectedId();
    [...container.querySelectorAll('button')].forEach((button) => {
      const id = buttonId(button);
      const active = id === selected;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      const check = button.querySelector('.companion-check');
      if (check) check.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    return true;
  }

  function replaceAskText(button, next) {
    if (!button) return;
    const spans = [...button.querySelectorAll('span,strong')].filter((node) => /Ask\s+(Mark|Beth|Chad|Scott)/i.test(node.textContent || ''));
    if (spans.length) spans.forEach((node) => { node.textContent = next.ask; });
    else [...button.childNodes].forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && /Ask\s+(Mark|Beth|Chad|Scott)/i.test(node.textContent || '')) node.textContent = ` ${next.ask}`;
    });
  }

  function syncVisibleUI() {
    installAppIdentityOverride();
    const next = config();
    document.documentElement.dataset.companion = next.id;
    setLiveConfig(next);
    document.documentElement.style.setProperty('--msg-companion-button-avatar', `url("${next.avatar}")`);

    document.querySelectorAll('#toggle-mark-panel, .reader-pane-buttons .mark-pane-button, .ask-mark-button, [data-action="ask-mark"], #fullscreen-mark-toggle')
      .forEach((button) => {
        replaceAskText(button, next);

        // Use a real image node for the active companion. This avoids the old
        // fallback pseudo-element retaining a stale Mark/Chad portrait.
        let img = button.querySelector('img');
        if (!img) {
          img = document.createElement('img');
          img.alt = '';
          img.setAttribute('aria-hidden', 'true');
          button.prepend(img);
        }
        if (img.getAttribute('src') !== next.avatar) img.setAttribute('src', next.avatar);
        img.alt = '';
        button.classList.remove('msg-companion-avatar-fallback');
      });

    const home = document.querySelector('.home-mark-avatar');
    if (home) { home.src = next.avatar; home.alt = `${next.name}, your reading companion.`; home.closest('.home-mark-icon-stage')?.classList.add('companion-frontpage-badge-mode'); }

    const drawer = document.querySelector('#fullscreen-mark-drawer');
    if (drawer) {
      drawer.setAttribute('aria-label', `${next.ask} reading companion`);
      const h = drawer.querySelector('.fullscreen-mark-header strong'); if (h) h.textContent = next.ask;
      const tab = drawer.querySelector('[data-fs-mark-tab="selection"]'); if (tab) tab.textContent = next.ask;
      const close = drawer.querySelector('#fullscreen-mark-close'); if (close) close.setAttribute('aria-label', `Close ${next.name}`);
    }

    const shell = document.querySelector('[data-askmark-premium]');
    if (shell) {
      const avatar = shell.querySelector('.askmark-avatar'); if (avatar) { avatar.src = next.avatar; avatar.alt = next.name; }
      const heading = shell.querySelector('.askmark-brand-copy h2'); if (heading) heading.textContent = next.ask;
      const notebook = shell.querySelector('[data-askmark-view-panel="notebook"] .askmark-subhead h3');
      if (notebook) notebook.textContent = next.notebook;
      shell.querySelectorAll('.askmark-message.mark-message').forEach((message) => {
        const img = message.querySelector(':scope > img'); if (img) { img.src = next.avatar; img.alt = next.name; }
        const name = message.querySelector(':scope > div > span');
        if (name && /^(Mark|Beth|Chad|Scott)(\s*·.*)?$/.test(name.textContent.trim())) {
          name.textContent = name.textContent.includes('·') ? `${next.name} · ${name.textContent.split('·').slice(1).join('·').trim()}` : next.name;
        }
        message.querySelectorAll('.mark-response-heading span').forEach((node) => { node.textContent = next.ask; });
      });
    }

    normalizeProfileSelection();
  }


  function installAppIdentityOverride() {
    // app.js exposes currentCompanionIdentity as a normal global function.
    // Replace only that identity lookup; do not replace or rebuild Reader code.
    if (typeof window.currentCompanionIdentity === 'function') {
      window.currentCompanionIdentity = () => ({ ...config() });
    }
  }

  function dispatchChange() {
    const next = config();
    window.dispatchEvent(new CustomEvent('msg:companion-changed', { detail:{ companion:next.id, config:{...next} } }));
  }

  function selectScott() {
    writeSelection('scott');
    syncVisibleUI();
    dispatchChange();
    queueMicrotask(syncVisibleUI);
    window.setTimeout(syncVisibleUI, 40);
  }

  function scheduleSync() {
    requestAnimationFrame(syncVisibleUI);
    [40, 120, 300].forEach((delay) => window.setTimeout(syncVisibleUI, delay));
  }

  document.addEventListener('click', (event) => {
    const choice = event.target.closest?.('.companion-persona-options button');
    if (choice) {
      const id = buttonId(choice);
      if (id === 'scott') {
        event.preventDefault();
        event.stopImmediatePropagation();
        selectScott();
        return;
      }
      // Mark/Beth/Chad keep their existing handlers. Normalize after those
      // handlers write the shared storage key.
      queueMicrotask(scheduleSync);
      return;
    }
    if (event.target.closest?.('[data-action]')) scheduleSync();
  }, true);

  window.addEventListener('msg:companion-changed', () => queueMicrotask(syncVisibleUI));
  window.addEventListener('hashchange', scheduleSync);
  window.addEventListener('popstate', scheduleSync);
  document.addEventListener('marksetgo:document-available', scheduleSync);

  window.MarkSetGoScottCompanion = Object.freeze({ config:COMPANIONS.scott, select:selectScott, sync:scheduleSync });

  // Clean up the previous broken package immediately, then honor the actual
  // shared selection key.
  try { localStorage.removeItem('msg_companion_scott_selected_v1'); } catch {}
  setLiveConfig(config());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleSync, { once:true });
  else scheduleSync();
})();
