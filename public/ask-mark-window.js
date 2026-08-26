(() => {
  'use strict';

  const STORAGE_KEY = 'markSetGoAskMarkWindowV1';
  const DEFAULT_DOCK_WIDTH = 500;
  const MIN_DOCK_WIDTH = 360;
  const MAX_DOCK_WIDTH = 760;
  const MIN_EXPANDED_WIDTH = 520;
  const MAX_EXPANDED_WIDTH = 980;

  let expanded = false;
  let resizeState = null;
  let installScheduled = false;

  function readSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
      return {
        dockWidth:Number(parsed.dockWidth) || DEFAULT_DOCK_WIDTH,
        expandedWidth:Number(parsed.expandedWidth) || 0
      };
    } catch {
      return { dockWidth:DEFAULT_DOCK_WIDTH, expandedWidth:0 };
    }
  }

  function writeSettings(patch = {}) {
    const next = { ...readSettings(), ...patch };
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
    return Math.max(MIN_DOCK_WIDTH, Math.min(viewportMax, Math.round(Number(value) || DEFAULT_DOCK_WIDTH)));
  }

  function desktopReaderContentRect() {
    if (!document.body.classList.contains('msg-desktop-workspace-active')) return null;
    const host = document.querySelector(
      '.msg-desktop-reader-one-window .msg-desktop-window-content'
    );
    const rect = host?.getBoundingClientRect?.();
    if (!rect || rect.width < 120 || rect.height < 160) return null;
    return rect;
  }

  function clampExpandedWidth(value) {
    const hostRect = desktopReaderContentRect();
    const availableWidth = hostRect
      ? Math.max(280, Math.floor(hostRect.width - 12))
      : Math.max(280, window.innerWidth - 28);

    const viewportMax = Math.max(
      Math.min(MIN_EXPANDED_WIDTH, availableWidth),
      Math.min(MAX_EXPANDED_WIDTH, availableWidth)
    );
    return Math.max(
      Math.min(MIN_EXPANDED_WIDTH, viewportMax),
      Math.min(
        viewportMax,
        Math.round(Number(value) || Math.min(900, availableWidth * .82))
      )
    );
  }

  function updateViewportBounds() {
    const root = document.documentElement;
    const desktopRect = desktopReaderContentRect();

    let top = 8;
    let right = 14;
    let availableHeight = Math.max(360, window.innerHeight - 28);

    if (desktopRect) {
      const inset = 10;
      const usableTop = desktopRect.top + inset;
      const usableBottom = desktopRect.bottom - inset;
      availableHeight = Math.max(300, usableBottom - usableTop);

      // Expanded means "more reading room", not "fill the entire Desktop
      // window". Keep the composer comfortably above the bottom edge.
      const desiredHeight = Math.min(
        680,
        Math.max(420, Math.round(availableHeight * 0.74))
      );
      const height = Math.min(desiredHeight, Math.max(300, availableHeight));
      const verticalSlack = Math.max(0, availableHeight - height);

      top = Math.round(usableTop + verticalSlack * 0.42);
      right = Math.max(
        inset,
        Math.round(window.innerWidth - desktopRect.right + inset)
      );

      root.style.setProperty('--msg-askmark-expanded-height', `${height}px`);
    } else {
      const header = document.querySelector('.site-header');
      const headerRect = header?.getBoundingClientRect();
      const usableTop = Math.max(8, Math.round((headerRect?.bottom || 0) + 12));

      let usableBottom = window.innerHeight - 18;
      const ribbon = document.getElementById('msg-shared-bottom');
      if (ribbon) {
        const rect = ribbon.getBoundingClientRect();
        if (rect.height > 0 && rect.top > 0 && rect.top < window.innerHeight) {
          usableBottom = Math.min(usableBottom, Math.round(rect.top - 18));
        }
      }

      availableHeight = Math.max(300, usableBottom - usableTop);
      const desiredHeight = Math.min(
        680,
        Math.max(440, Math.round(availableHeight * 0.78))
      );
      const height = Math.min(desiredHeight, Math.max(300, availableHeight));
      const verticalSlack = Math.max(0, availableHeight - height);

      top = Math.round(usableTop + verticalSlack * 0.34);
      root.style.setProperty('--msg-askmark-expanded-height', `${height}px`);
    }

    root.style.setProperty('--msg-askmark-expanded-top', `${top}px`);
    root.style.setProperty('--msg-askmark-expanded-right', `${right}px`);

    // Kept only as a compatibility variable for older cached CSS. The new
    // layout uses explicit height + top and does not stretch with bottom.
    root.style.setProperty('--msg-askmark-expanded-bottom', 'auto');
  }

  function applyDockWidth({ force = false } = {}) {
    const targetLayout = layout();
    if (!targetLayout) return false;

    targetLayout.classList.add('msg-askmark-window-ready');

    const saved = readSettings();
    const currentInline = String(targetLayout.style.getPropertyValue('--word-panel-width') || '').trim();
    const width = clampDockWidth(saved.dockWidth || DEFAULT_DOCK_WIDTH);

    // Preserve an existing live splitter width unless we are restoring our
    // saved width after a Reader rebuild.
    if (force || !currentInline) {
      targetLayout.style.setProperty('--word-panel-width', `${width}px`);
    }

    document.documentElement.style.setProperty('--msg-askmark-docked-width', `${width}px`);
    return true;
  }

  function rememberDockWidth() {
    if (expanded) return false;
    const targetPanel = panel();
    if (!targetPanel || !askMarkVisible()) return false;

    const width = clampDockWidth(targetPanel.getBoundingClientRect().width);
    writeSettings({ dockWidth:width });
    document.documentElement.style.setProperty('--msg-askmark-docked-width', `${width}px`);
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

    const expand = actions.querySelector('[data-askmark-window-toggle]');
    if (expand && expand.parentElement !== windows) windows.appendChild(expand);

    const popout = actions.querySelector('[data-askmark-popout]');
    if (popout && popout.parentElement !== windows) windows.appendChild(popout);

    return { tools, windows };
  }

  function ensureWindowControls() {
    const premium = premiumShell();
    const targetPanel = panel();
    if (!premium || !targetPanel) return false;

    const actions = premium.querySelector('.askmark-header-actions');
    const groups = ensureHeaderActionGroups(actions);
    if (actions && !actions.querySelector('[data-askmark-window-toggle]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'askmark-window-toggle';
      button.dataset.askmarkWindowToggle = '1';
      button.setAttribute('aria-pressed', 'false');
      (groups.windows || actions).appendChild(button);
    }
    ensureHeaderActionGroups(actions);

    if (!targetPanel.querySelector('[data-askmark-window-resize]')) {
      const grip = document.createElement('div');
      grip.className = 'askmark-window-resize';
      grip.dataset.askmarkWindowResize = '1';
      grip.setAttribute('role', 'separator');
      grip.setAttribute('aria-orientation', 'vertical');
      grip.setAttribute('aria-label', 'Resize expanded Ask Mark');
      grip.setAttribute('tabindex', '0');
      targetPanel.appendChild(grip);
    }

    syncButton();
    return true;
  }

  function syncButton() {
    const button = document.querySelector('[data-askmark-window-toggle]');
    if (!button) return;

    button.textContent = expanded ? '❐' : '⤢';
    button.title = expanded ? 'Restore Ask Mark' : 'Expand Ask Mark';
    button.setAttribute('aria-label', expanded ? 'Restore Ask Mark' : 'Expand Ask Mark');
    button.setAttribute('aria-pressed', expanded ? 'true' : 'false');
  }

  function applyExpandedWidth() {
    const saved = readSettings();
    const width = clampExpandedWidth(saved.expandedWidth || Math.min(900, window.innerWidth * .64));
    document.documentElement.style.setProperty('--msg-askmark-expanded-width', `${width}px`);
    return width;
  }

  function setExpanded(next) {
    const shouldExpand = Boolean(next);
    if (shouldExpand === expanded) {
      syncButton();
      return expanded;
    }

    if (shouldExpand) {
      rememberDockWidth();
      updateViewportBounds();
      applyExpandedWidth();
    }

    expanded = shouldExpand;
    document.documentElement.classList.toggle('msg-askmark-expanded', expanded);
    syncButton();

    // Ask Mark is the same DOM before/after. Resize only lets its existing
    // scroll containers recalculate; no session/conversation is recreated.
    try { window.dispatchEvent(new Event('resize')); } catch {}
    return expanded;
  }

  function toggleExpanded() {
    return setExpanded(!expanded);
  }

  function restore() {
    return setExpanded(false);
  }

  function beginExpandedResize(event) {
    if (!expanded || event.button > 0) return;
    const targetPanel = panel();
    if (!targetPanel) return;

    event.preventDefault();
    event.stopPropagation();

    resizeState = {
      pointerId:event.pointerId,
      startX:event.clientX,
      startWidth:targetPanel.getBoundingClientRect().width
    };

    const grip = event.currentTarget;
    try { grip.setPointerCapture(event.pointerId); } catch {}

    const move = (moveEvent) => {
      if (!resizeState || moveEvent.pointerId !== resizeState.pointerId) return;
      // Dragging the left edge left increases width; dragging right decreases it.
      const width = clampExpandedWidth(
        resizeState.startWidth + (resizeState.startX - moveEvent.clientX)
      );
      document.documentElement.style.setProperty('--msg-askmark-expanded-width', `${width}px`);
    };

    const stop = (stopEvent) => {
      if (!resizeState || stopEvent.pointerId !== resizeState.pointerId) return;
      const targetPanelNow = panel();
      const width = targetPanelNow
        ? clampExpandedWidth(targetPanelNow.getBoundingClientRect().width)
        : clampExpandedWidth(resizeState.startWidth);
      writeSettings({ expandedWidth:width });
      resizeState = null;
      try { grip.releasePointerCapture(stopEvent.pointerId); } catch {}
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', stop);
      grip.removeEventListener('pointercancel', stop);
    };

    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', stop);
    grip.addEventListener('pointercancel', stop);
  }

  function install() {
    installScheduled = false;
    applyDockWidth({ force:false });
    if (!ensureWindowControls()) return false;

    const button = document.querySelector('[data-askmark-window-toggle]');
    if (button && button.dataset.askmarkWindowBound !== '1') {
      button.dataset.askmarkWindowBound = '1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleExpanded();
      });
    }

    const grip = document.querySelector('[data-askmark-window-resize]');
    if (grip && grip.dataset.askmarkWindowBound !== '1') {
      grip.dataset.askmarkWindowBound = '1';
      grip.addEventListener('pointerdown', beginExpandedResize);
      grip.addEventListener('keydown', (event) => {
        if (!expanded || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const current = panel()?.getBoundingClientRect().width || applyExpandedWidth();
        const delta = event.key === 'ArrowLeft' ? 30 : -30;
        const width = clampExpandedWidth(current + delta);
        document.documentElement.style.setProperty('--msg-askmark-expanded-width', `${width}px`);
        writeSettings({ expandedWidth:width });
      });
    }

    return true;
  }

  function scheduleInstall() {
    if (installScheduled) return;
    installScheduled = true;
    [0, 80, 240, 650].forEach((delay, index) => {
      window.setTimeout(() => {
        install();
        if (index === 3) installScheduled = false;
      }, delay);
    });
  }

  // One document-level event delegation survives Reader shell rebuilds.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-askmark-close]')) {
      restore();
      return;
    }

    if (
      target.closest('#toggle-mark-panel') ||
      target.closest('[data-mark-tab="selection"]') ||
      target.closest('[data-action="reader"]')
    ) {
      scheduleInstall();
    }
  }, true);

  // The existing splitter remains the docked resize interaction. We only
  // remember its final width.
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

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      restore();
    }
  });

  document.addEventListener('marksetgo:document-available', () => {
    // A Reader rebuild can replace the Ask Mark shell. Preserve the thread
    // logic owned by ask-mark-hub.js; just reattach our window controls.
    window.setTimeout(() => {
      applyDockWidth({ force:true });
      scheduleInstall();
    }, 0);
  });

  window.addEventListener('resize', () => {
    updateViewportBounds();
    if (expanded) applyExpandedWidth();
    else applyDockWidth({ force:false });
  });

  window.addEventListener('pageshow', scheduleInstall);

  window.MarkSetGoAskMarkWindow = Object.freeze({
    expand:() => setExpanded(true),
    restore,
    toggle:toggleExpanded,
    setDockWidth:(width) => {
      const value = clampDockWidth(width);
      writeSettings({ dockWidth:value });
      const targetLayout = layout();
      targetLayout?.style.setProperty('--word-panel-width', `${value}px`);
      document.documentElement.style.setProperty('--msg-askmark-docked-width', `${value}px`);
      return value;
    },
    resetWidth:() => {
      writeSettings({ dockWidth:DEFAULT_DOCK_WIDTH, expandedWidth:0 });
      const targetLayout = layout();
      targetLayout?.style.setProperty('--word-panel-width', `${DEFAULT_DOCK_WIDTH}px`);
      document.documentElement.style.setProperty('--msg-askmark-docked-width', `${DEFAULT_DOCK_WIDTH}px`);
      document.documentElement.style.removeProperty('--msg-askmark-expanded-width');
      return DEFAULT_DOCK_WIDTH;
    },
    status:() => ({
      expanded,
      dockWidth:readSettings().dockWidth,
      expandedWidth:readSettings().expandedWidth,
      expandedHeight:document.documentElement.style.getPropertyValue('--msg-askmark-expanded-height') || '',
      visible:askMarkVisible()
    })
  });

  updateViewportBounds();
  scheduleInstall();
})();