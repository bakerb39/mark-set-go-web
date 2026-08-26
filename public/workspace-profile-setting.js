(() => {
  'use strict';

  const WORKSPACE_PREF_KEY = 'msg-workspace-optin-v1';
  const LAYOUT_MODE_KEY = 'msg-workspace-layout-mode-v1';

  let saveTimer = 0;

  function sameOriginParent() {
    try {
      if (window.parent && window.parent !== window && window.parent.location.origin === window.location.origin) {
        return window.parent;
      }
    } catch {}
    return window;
  }

  function hostWindow() {
    return sameOriginParent();
  }

  function readWorkspaceEnabled() {
    try { return localStorage.getItem(WORKSPACE_PREF_KEY) === '1'; }
    catch { return false; }
  }

  function readLayoutMode() {
    try { return localStorage.getItem(LAYOUT_MODE_KEY) === 'desktop' ? 'desktop' : 'standard'; }
    catch { return 'standard'; }
  }

  function writeWorkspaceEnabled(enabled) {
    const value = Boolean(enabled);
    try { localStorage.setItem(WORKSPACE_PREF_KEY, value ? '1' : '0'); } catch {}

    const host = hostWindow();
    try {
      if (host !== window) {
        host.postMessage({ type:'msg-workspace-preference', enabled:value }, window.location.origin);
      }
    } catch {}

    if (!value) {
      try { host.MSGWorkspaceExperiment?.close?.(); } catch {}
    }

    scheduleSettingsSave('reader-workspace');
    syncAll();
    return value;
  }

  function writeLayoutMode(value) {
    const mode = value === 'desktop' ? 'desktop' : 'standard';
    try { localStorage.setItem(LAYOUT_MODE_KEY, mode); } catch {}

    const host = hostWindow();

    try {
      host.document?.dispatchEvent?.(new CustomEvent('marksetgo:workspace-layout-mode', {
        detail:{ mode }
      }));
    } catch {}

    if (readWorkspaceEnabled()) {
      try {
        if (mode === 'desktop') host.MSGDesktopWorkspace?.activate?.();
        else host.MSGDesktopWorkspace?.standard?.();
      } catch {}
    }

    scheduleSettingsSave('workspace-layout');
    syncAll();
    return mode;
  }

  function scheduleSettingsSave(reason = 'workspace') {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      const host = hostWindow();
      try {
        void host.MarkSetGoUserSettings?.saveCurrent?.({ reason });
      } catch {}
    }, 250);
  }

  function cardMarkup() {
    return `
      <div class="section-heading">
        <div>
          <span class="source-category">Reader Workspace</span>
          <h2>Reader Workspace</h2>
          <p>Choose whether pages open beside the Reader and how that workspace is arranged.</p>
        </div>
      </div>

      <label class="msg-workspace-profile-toggle" for="msg-workspace-profile-toggle">
        <span class="msg-workspace-profile-copy">
          <strong>Use Reader Workspace</strong>
          <small>Keep Reader 1 open while Library, Notebook, Profile, and other pages open beside it.</small>
        </span>
        <span class="msg-workspace-switch-wrap">
          <input
            id="msg-workspace-profile-toggle"
            data-workspace-profile-toggle
            type="checkbox"
            role="switch"
            aria-label="Use Reader Workspace">
          <span class="msg-workspace-switch" aria-hidden="true"></span>
        </span>
      </label>

      <div class="msg-workspace-profile-layout">
        <span class="msg-workspace-profile-copy">
          <strong>Workspace layout</strong>
          <small>Standard keeps the normal split workspace. Desktop makes each open Reader or page a movable window.</small>
        </span>
        <div class="msg-workspace-profile-layout-options" role="group" aria-label="Workspace layout">
          <button type="button" data-workspace-profile-layout="standard" aria-pressed="false">Standard</button>
          <button type="button" data-workspace-profile-layout="desktop" aria-pressed="false">Desktop</button>
        </div>
      </div>`;
  }

  function bindCard(card) {
    const toggle = card.querySelector('[data-workspace-profile-toggle]');
    if (toggle && toggle.dataset.workspaceProfileBound !== '1') {
      toggle.dataset.workspaceProfileBound = '1';
      toggle.addEventListener('change', () => {
        writeWorkspaceEnabled(Boolean(toggle.checked));
      });
    }

    card.querySelectorAll('[data-workspace-profile-layout]').forEach((button) => {
      if (button.dataset.workspaceProfileBound === '1') return;
      button.dataset.workspaceProfileBound = '1';
      button.addEventListener('click', () => {
        writeLayoutMode(button.dataset.workspaceProfileLayout);
      });
    });
  }

  function syncCard(card) {
    if (!card) return;
    const enabled = readWorkspaceEnabled();
    const mode = readLayoutMode();

    const toggle = card.querySelector('[data-workspace-profile-toggle]');
    if (toggle) toggle.checked = enabled;

    card.classList.toggle('is-workspace-enabled', enabled);

    card.querySelectorAll('[data-workspace-profile-layout]').forEach((button) => {
      const active = button.dataset.workspaceProfileLayout === mode;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function placeCard(page, card) {
    // My Settings is the natural home when it is present. Otherwise keep the
    // card with the other profile feature cards.
    const unified = page.querySelector(':scope > .unified-settings-card');
    if (unified) {
      if (card.previousElementSibling !== unified) unified.insertAdjacentElement('afterend', card);
      return;
    }

    const cards = [...page.querySelectorAll(':scope > .profile-feature-card')];
    const coaching = cards.find((node) => /Personalized coaching/i.test(node.textContent || ''));
    if (coaching && card !== coaching.previousElementSibling) {
      page.insertBefore(card, coaching);
    } else if (!card.isConnected) {
      page.appendChild(card);
    }
  }

  function install(rootDocument = document) {
    const page = rootDocument.querySelector('.profile-preferences-page');
    if (!page) return false;

    let card = page.querySelector(
      '.msg-reader-workspace-profile-card, .msg-workspace-profile-card'
    );

    if (!card) {
      card = rootDocument.createElement('section');
      card.className = 'profile-feature-card msg-workspace-profile-card msg-reader-workspace-profile-card';
      card.dataset.workspaceProfileVersion = '2';
      card.innerHTML = cardMarkup();
      placeCard(page, card);
    } else {
      card.classList.add('profile-feature-card','msg-workspace-profile-card','msg-reader-workspace-profile-card');
      if (card.dataset.workspaceProfileVersion !== '2') {
        card.dataset.workspaceProfileVersion = '2';
        card.innerHTML = cardMarkup();
      }
      placeCard(page, card);
    }

    bindCard(card);
    syncCard(card);
    return true;
  }

  function scheduleInstall() {
    [0,80,220,520,1000].forEach((delay) => {
      window.setTimeout(() => install(document), delay);
    });
  }

  function syncAll() {
    document.querySelectorAll('.msg-reader-workspace-profile-card').forEach(syncCard);
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (
      target.closest('[data-action="profile-preferences"]') ||
      target.closest('[data-msg-layout-choice]')
    ) {
      scheduleInstall();
    }
  }, true);

  document.addEventListener('marksetgo:user-settings-applied', scheduleInstall);
  document.addEventListener('marksetgo:workspace-layout-mode', () => {
    window.setTimeout(syncAll, 0);
  });

  window.addEventListener('pageshow', scheduleInstall);
  window.addEventListener('storage', (event) => {
    if ([WORKSPACE_PREF_KEY,LAYOUT_MODE_KEY].includes(event.key)) syncAll();
  });

  window.MarkSetGoWorkspaceProfile = Object.freeze({
    install,
    sync:syncAll,
    get enabled(){ return readWorkspaceEnabled(); },
    setEnabled:writeWorkspaceEnabled,
    get layout(){ return readLayoutMode(); },
    setLayout:writeLayoutMode
  });

  scheduleInstall();
})();