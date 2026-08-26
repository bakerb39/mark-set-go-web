(() => {
  'use strict';

  /* Ask Beth window management — popup-only edition.
     Expanded/overlay mode has been retired.
     This file preserves:
       - normal docked Ask Beth width handling
       - existing Reader splitter behavior
       - header grouping used by the pop-out controller
       - compatibility API for any older callers
     It deliberately does NOT create an Expand/Restore control. */

  const STORAGE_KEY = 'markSetGoAskMarkWindowV1';
  const DEFAULT_DOCK_WIDTH = 500;
  const MIN_DOCK_WIDTH = 360;
  const MAX_DOCK_WIDTH = 760;

  let installScheduled = false;

  function readSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
      return {
        dockWidth:Number(parsed.dockWidth) || DEFAULT_DOCK_WIDTH
      };
    } catch {
      return { dockWidth:DEFAULT_DOCK_WIDTH };
    }
  }

  function writeSettings(patch = {}) {
    let current = {};
    try { current = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
    catch {}

    // Retire expanded geometry from persisted state while preserving dock width.
    const next = {
      ...current,
      ...patch
    };
    delete next.expandedWidth;

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    return next;
  }

  function layout() {
    return document.getElementById('reader-layout');
  }

  function panel() {
    return document.querySelector('.mark-companion-panel');
  }

  function premiumShell() {
    return document.querySelector('.mark-companion-panel [data-askmark-premium]');
  }

  function askButton() {
    return document.getElementById('toggle-mark-panel');
  }

  function askMarkVisible() {
    const targetLayout = layout();
    const targetPanel = panel();
    if (!targetLayout || !targetPanel || targetLayout.classList.contains('word-panel-hidden')) return false;

    const pressed = askButton()?.getAttribute('aria-pressed');
    if (pressed === 'true') return true;

    const selectionTab = document.querySelector('[data-mark-tab="selection"]');
    return Boolean(selectionTab?.classList.contains('active') || premiumShell());
  }

  function clampDockWidth(value) {
    const viewportMax = Math.max(
      MIN_DOCK_WIDTH,
      Math.min(MAX_DOCK_WIDTH, Math.floor(window.innerWidth * .56), window.innerWidth - 390)
    );
    return Math.max(
      MIN_DOCK_WIDTH,
      Math.min(viewportMax, Math.round(Number(value) || DEFAULT_DOCK_WIDTH))
    );
  }

  function clearExpandedMode() {
    const root = document.documentElement;

    // Remove the state that triggered the fixed overlay.
    root.classList.remove('msg-askmark-expanded');

    [
      '--msg-askmark-expanded-width',
      '--msg-askmark-expanded-height',
      '--msg-askmark-expanded-top',
      '--msg-askmark-expanded-right',
      '--msg-askmark-expanded-bottom'
    ].forEach((name) => root.style.removeProperty(name));

    // Remove controls installed by the retired expanded-window implementation.
    document.querySelectorAll(
      '[data-askmark-window-toggle], .askmark-window-toggle, ' +
      '[data-askmark-window-resize], .askmark-window-resize'
    ).forEach((node) => node.remove());

    // Do not keep stale expanded width in storage.
    writeSettings({});
  }

  function applyDockWidth({ force = false } = {}) {
    const targetLayout = layout();
    if (!targetLayout) return false;

    targetLayout.classList.add('msg-askmark-window-ready');

    const saved = readSettings();
    const currentInline = String(
      targetLayout.style.getPropertyValue('--word-panel-width') || ''
    ).trim();
    const width = clampDockWidth(saved.dockWidth || DEFAULT_DOCK_WIDTH);

    // Preserve a live splitter width unless restoring after a Reader rebuild.
    if (force || !currentInline) {
      targetLayout.style.setProperty('--word-panel-width', `${width}px`);
    }

    document.documentElement.style.setProperty(
      '--msg-askmark-docked-width',
      `${width}px`
    );
    return true;
  }

  function rememberDockWidth() {
    const targetPanel = panel();
    if (!targetPanel || !askMarkVisible()) return false;

    const width = clampDockWidth(targetPanel.getBoundingClientRect().width);
    writeSettings({ dockWidth:width });
    document.documentElement.style.setProperty(
      '--msg-askmark-docked-width',
      `${width}px`
    );
    return true;
  }

  function ensureHeaderActionGroups(actions) {
    if (!actions) return { tools:null, windows:null };

    let tools = actions.querySelector(':scope > .askmark-header-tool-actions');
    if (!tools) {
      tools = document.createElement('div');
      tools.className = 'askmark-header-tool-actions';
      tools.setAttribute('aria-label', 'Companion tools');
      actions.prepend(tools);
    }

    let windows = actions.querySelector(':scope > .askmark-header-window-actions');
    if (!windows) {
      windows = document.createElement('div');
      windows.className = 'askmark-header-window-actions';
      windows.setAttribute('aria-label', 'Companion window actions');
      actions.appendChild(windows);
    }

    actions.querySelectorAll('[data-askmark-view]').forEach((button) => {
      if (button.parentElement !== tools) tools.appendChild(button);
    });

    // Expanded mode is retired. Remove any stale control before grouping popup.
    actions.querySelectorAll(
      '[data-askmark-window-toggle], .askmark-window-toggle'
    ).forEach((button) => button.remove());

    const popout = actions.querySelector('[data-askmark-popout]');
    if (popout && popout.parentElement !== windows) windows.appendChild(popout);

    return { tools, windows };
  }

  function install() {
    installScheduled = false;
    clearExpandedMode();
    applyDockWidth({ force:false });

    const premium = premiumShell();
    if (!premium) return false;

    ensureHeaderActionGroups(premium.querySelector('.askmark-header-actions'));
    return true;
  }

  function scheduleInstall() {
    if (installScheduled) return;
    installScheduled = true;

    [0, 80, 240, 650, 1100].forEach((delay, index) => {
      window.setTimeout(() => {
        install();
        if (index === 4) installScheduled = false;
      }, delay);
    });
  }

  // Re-apply grouping after normal Reader navigation or Ask Beth opening.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (
      target.closest('#toggle-mark-panel') ||
      target.closest('[data-mark-tab="selection"]') ||
      target.closest('[data-action="reader"]')
    ) {
      scheduleInstall();
    }
  }, true);

  // The normal Reader splitter remains the width owner.
  document.addEventListener('pointerup', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('#right-pane-splitter')) {
      window.setTimeout(rememberDockWidth, 0);
    }
  }, true);

  document.addEventListener('keyup', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('#right-pane-splitter')) {
      window.setTimeout(rememberDockWidth, 0);
    }
  }, true);

  document.addEventListener('marksetgo:document-available', () => {
    window.setTimeout(() => {
      clearExpandedMode();
      applyDockWidth({ force:true });
      scheduleInstall();
    }, 0);
  });

  window.addEventListener('resize', () => {
    clearExpandedMode();
    applyDockWidth({ force:false });
  });

  window.addEventListener('pageshow', () => {
    clearExpandedMode();
    scheduleInstall();
  });

  // Compatibility surface: older code can call these without throwing, but
  // expansion is intentionally unavailable.
  window.MarkSetGoAskMarkWindow = Object.freeze({
    expand:() => false,
    restore:() => {
      clearExpandedMode();
      return true;
    },
    toggle:() => false,
    setDockWidth:(width) => {
      const value = clampDockWidth(width);
      writeSettings({ dockWidth:value });
      const targetLayout = layout();
      targetLayout?.style.setProperty('--word-panel-width', `${value}px`);
      document.documentElement.style.setProperty(
        '--msg-askmark-docked-width',
        `${value}px`
      );
      return value;
    },
    resetWidth:() => {
      writeSettings({ dockWidth:DEFAULT_DOCK_WIDTH });
      const targetLayout = layout();
      targetLayout?.style.setProperty(
        '--word-panel-width',
        `${DEFAULT_DOCK_WIDTH}px`
      );
      document.documentElement.style.setProperty(
        '--msg-askmark-docked-width',
        `${DEFAULT_DOCK_WIDTH}px`
      );
      return DEFAULT_DOCK_WIDTH;
    },
    status:() => ({
      expanded:false,
      dockWidth:readSettings().dockWidth,
      expandedWidth:0,
      expandedHeight:'',
      visible:askMarkVisible(),
      popupOnly:true
    })
  });

  clearExpandedMode();
  scheduleInstall();
})();
