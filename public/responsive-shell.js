(() => {
  'use strict';

  const STORAGE_KEY = 'msg-desktop-outer-shell-width-v1';
  const MODE_EVENT = 'marksetgo:workspace-layout-mode';
  const app = document.querySelector('#app');
  if (!app) return;

  let leftHandle = null;
  let rightHandle = null;
  let drag = null;

  function desktopActive() {
    return document.body.classList.contains('msg-desktop-workspace-active');
  }

  function safeMaxWidth() {
    return Math.max(0, window.innerWidth - 24);
  }

  function safeMinWidth() {
    return Math.min(760, safeMaxWidth());
  }

  function savedWidth() {
    try {
      const value = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(value) && value > 0 ? value : null;
    } catch {
      return null;
    }
  }

  function clampWidth(value) {
    return Math.max(safeMinWidth(), Math.min(safeMaxWidth(), Math.round(value)));
  }

  function currentWidth() {
    const saved = savedWidth();
    if (saved) return clampWidth(saved);
    const rect = app.getBoundingClientRect();
    const measured = rect.width > 0 ? rect.width : Math.min(1180, safeMaxWidth());
    return clampWidth(measured);
  }

  function setWidth(value, persist = false) {
    const width = clampWidth(value);
    document.documentElement.style.setProperty('--msg-desktop-shell-width', `${width}px`);
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, String(width)); } catch {}
    }
    positionHandles();
  }

  function ensureHandles() {
    if (!leftHandle) {
      leftHandle = document.createElement('div');
      leftHandle.className = 'msg-desktop-shell-resize-handle msg-desktop-shell-resize-left';
      leftHandle.dataset.msgDesktopShellResize = 'left';
      leftHandle.setAttribute('aria-hidden', 'true');
      document.body.appendChild(leftHandle);
      bindHandle(leftHandle);
    }
    if (!rightHandle) {
      rightHandle = document.createElement('div');
      rightHandle.className = 'msg-desktop-shell-resize-handle msg-desktop-shell-resize-right';
      rightHandle.dataset.msgDesktopShellResize = 'right';
      rightHandle.setAttribute('aria-hidden', 'true');
      document.body.appendChild(rightHandle);
      bindHandle(rightHandle);
    }
  }

  function positionHandles() {
    if (!leftHandle || !rightHandle || !desktopActive()) return;
    const rect = app.getBoundingClientRect();
    leftHandle.style.left = `${Math.round(rect.left - 5)}px`;
    rightHandle.style.left = `${Math.round(rect.right - 5)}px`;
    leftHandle.style.top = `${Math.max(0, Math.round(rect.top))}px`;
    rightHandle.style.top = leftHandle.style.top;
  }

  function bindHandle(handle) {
    handle.addEventListener('pointerdown', (event) => {
      if (!desktopActive() || window.innerWidth < 1000) return;
      event.preventDefault();
      event.stopPropagation();

      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: app.getBoundingClientRect().width,
        edge: handle.dataset.msgDesktopShellResize
      };
      try { handle.setPointerCapture(event.pointerId); } catch {}
      document.body.classList.add('msg-desktop-shell-resizing');
    });

    handle.addEventListener('pointermove', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      const delta = event.clientX - drag.startX;

      // Shell remains centered: either edge changes total width symmetrically.
      const next = drag.edge === 'right'
        ? drag.startWidth + (delta * 2)
        : drag.startWidth - (delta * 2);

      setWidth(next, false);
    });

    const finish = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      setWidth(app.getBoundingClientRect().width, true);
      drag = null;
      document.body.classList.remove('msg-desktop-shell-resizing');
      try { handle.releasePointerCapture(event.pointerId); } catch {}
    };

    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);

    handle.addEventListener('dblclick', () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      setWidth(Math.min(1180, safeMaxWidth()), true);
    });
  }

  function sync() {
    ensureHandles();

    if (desktopActive()) {
      setWidth(currentWidth(), false);
      requestAnimationFrame(positionHandles);
    } else {
      document.documentElement.style.removeProperty('--msg-desktop-shell-width');
    }
  }

  window.addEventListener('resize', () => {
    if (!desktopActive()) return;
    setWidth(currentWidth(), false);
    requestAnimationFrame(positionHandles);
  }, { passive: true });

  document.addEventListener(MODE_EVENT, () => {
    requestAnimationFrame(() => requestAnimationFrame(sync));
  });

  document.addEventListener('DOMContentLoaded', sync, { once: true });
  window.addEventListener('pageshow', sync);
  window.addEventListener('focus', sync);

  // Desktop Workspace may activate after this module initializes.
  [0, 120, 350, 800].forEach((delay) => window.setTimeout(sync, delay));


  /* ------------------------------------------------------------
     Standard Reader OUTER shell window-style width
     MSG constraint: presentation only; no Reader engine/state changes.
     ------------------------------------------------------------ */
  const READER_WIDTH_KEY = 'msg-standard-reader-outer-width-v1';
  const READER_COLLAPSED_KEY = 'msg-standard-reader-outer-collapsed-v1';
  let readerWidthDrag = null;
  let readerEdgeLeft = null;
  let readerEdgeRight = null;

  function standardReaderAvailable() {
    return !window.__MSG_SECONDARY_READER__
      && !document.documentElement.classList.contains('msg-secondary-reader-document')
      && !desktopWorkspaceActive()
      && window.innerWidth > 760;
  }

  function readerShell() {
    return document.querySelector('#app .reader-page-panel');
  }

  function readerShellParentWidth() {
    const shell = readerShell();
    const parent = shell?.parentElement;
    const width = parent?.getBoundingClientRect().width || shell?.getBoundingClientRect().width || 0;
    return Math.max(0, Math.floor(width));
  }


  function secondaryWorkspaceReaderActive() {
    return !!document.querySelector(
      '.msg-workspace-secondary .msg-workspace-secondary-reader-page.msg-workspace-panel-active, ' +
      '.msg-workspace-secondary .msg-workspace-aux-reader-page.msg-workspace-panel-active'
    );
  }

  // Any active Standard-mode side panel (Notebook, Music, etc.) means the
  // Reader is no longer a true standalone surface. Do not let standalone
  // Reader sizing constrain the outer #app width while that panel is open.
  function standardWorkspacePanelActive() {
    return !!document.querySelector(
      '.msg-workspace-shell:not(.msg-desktop-workspace) .msg-workspace-secondary .msg-workspace-panel-active, ' +
      '.msg-workspace-shell:not(.msg-desktop-workspace) .msg-workspace-secondary iframe, ' +
      '.msg-workspace-shell:not(.msg-desktop-workspace) .msg-workspace-secondary [data-msg-workspace-tab]'
    );
  }

  function desktopWorkspaceActive() {
    return document.body.classList.contains('msg-desktop-workspace-active')
      || !!document.querySelector('.msg-workspace-shell.msg-desktop-workspace');
  }

  function standaloneReaderActive() {
    return document.body.classList.contains('msg-primary-reader-standalone')
      && !desktopWorkspaceActive()
      && !secondaryWorkspaceReaderActive()
      && !standardWorkspacePanelActive();
  }

  function standaloneReaderChromeWidth() {
    const shell = readerShell();
    if (!shell || !standaloneReaderActive()) return 0;

    const appRect = app.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    return Math.max(0, Math.round(appRect.width - shellRect.width));
  }

  function safeStandaloneAppWidth() {
    return Math.max(0, Math.floor(window.innerWidth - 32));
  }

  function setStandaloneAppWidthForReader(readerWidth) {
    if (!standaloneReaderActive()) return;

    const chrome = readerWidthDrag?.chromeWidth ?? standaloneReaderChromeWidth();
    const desiredAppWidth = Math.min(
      safeStandaloneAppWidth(),
      Math.max(0, Math.round(readerWidth + chrome))
    );

    app.style.setProperty('box-sizing', 'border-box', 'important');
    app.style.setProperty('width', `${desiredAppWidth}px`, 'important');
    app.style.setProperty('max-width', 'calc(100vw - 32px)', 'important');
    app.style.setProperty('margin-left', 'auto', 'important');
    app.style.setProperty('margin-right', 'auto', 'important');
  }

  function clearStandaloneAppWidth() {
    ['box-sizing','width','max-width','margin-left','margin-right'].forEach((prop) => {
      app.style.removeProperty(prop);
    });
  }

  function storedReaderWidth() {
    try {
      const n = Number(localStorage.getItem(READER_WIDTH_KEY));
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }

  function readerCollapsed() {
    try { return localStorage.getItem(READER_COLLAPSED_KEY) === '1'; }
    catch { return false; }
  }

  function maxReaderWidth() {
    if (!standaloneReaderActive()) return readerShellParentWidth();

    const chrome = readerWidthDrag?.chromeWidth ?? standaloneReaderChromeWidth();
    return Math.max(0, safeStandaloneAppWidth() - chrome);
  }

  function minReaderWidth() {
    const max = maxReaderWidth();
    return Math.min(max, Math.max(520, Math.min(700, Math.round(max * .55))));
  }

  function comfortableReaderWidth() {
    const max = maxReaderWidth();
    return Math.max(minReaderWidth(), Math.min(820, Math.round(max * .72)));
  }

  function clampReaderWidth(value) {
    const max = maxReaderWidth();
    if (!max) return Math.max(0, Math.round(value || 0));
    return Math.max(minReaderWidth(), Math.min(max, Math.round(value)));
  }

  function setShellWidthImportant(shell, value) {
    shell.style.setProperty('box-sizing', 'border-box', 'important');
    shell.style.setProperty('width', value, 'important');
    shell.style.setProperty('max-width', '100%', 'important');
    shell.style.setProperty('margin-left', 'auto', 'important');
    shell.style.setProperty('margin-right', 'auto', 'important');
  }

  function clearShellWidth(shell) {
    ['box-sizing','width','max-width','margin-left','margin-right'].forEach((prop) => {
      shell.style.removeProperty(prop);
    });
  }

  function setReaderWidth(value, persist = false) {
    const shell = readerShell();
    if (!shell) return;

    if (!standardReaderAvailable()) {
      clearShellWidth(shell);
      clearStandaloneAppWidth();
      return;
    }

    const width = clampReaderWidth(value);

    if (standaloneReaderActive()) {
      setStandaloneAppWidthForReader(width);
    } else if (secondaryWorkspaceReaderActive()) {
      clearStandaloneAppWidth();
    }

    setShellWidthImportant(shell, `${width}px`);

    if (persist) {
      try {
        localStorage.setItem(READER_WIDTH_KEY, String(width));
        localStorage.setItem(READER_COLLAPSED_KEY, width < maxReaderWidth() - 8 ? '1' : '0');
      } catch {}
    }

    updateReaderWindowButton();
  }

  function restoreReaderFullWidth(persist = true) {
    const shell = readerShell();
    if (!shell) return;

    if (!standardReaderAvailable()) {
      clearShellWidth(shell);
      clearStandaloneAppWidth();
      return;
    }

    if (standaloneReaderActive()) {
      clearStandaloneAppWidth();
    }
    setShellWidthImportant(shell, '100%');

    if (persist) {
      try {
        localStorage.removeItem(READER_WIDTH_KEY);
        localStorage.setItem(READER_COLLAPSED_KEY, '0');
      } catch {}
    }

    updateReaderWindowButton();
  }

  function snapReaderSmaller() {
    setReaderWidth(storedReaderWidth() || comfortableReaderWidth(), true);
    try { localStorage.setItem(READER_COLLAPSED_KEY, '1'); } catch {}
    updateReaderWindowButton();
  }

  function retireObsoleteReaderSurfaceHandle() {
    const handle = document.getElementById('msg-vd-surface-handle');
    if (!handle) return false;
    handle.remove();
    return true;
  }

  function normalizeReaderTopicsToggle() {
    const toggle = document.querySelector('#app .reader-pane-buttons #toggle-navigation-pane');
    if (!toggle) return false;

    // Keep the native My Topics control in the toolbar. Some existing Reader/topic
    // styles turn this same button into a left-edge semicircular tab after a
    // workspace transition; manual Reader resizing makes that presentation obsolete.
    const props = {
      position: 'static',
      inset: 'auto',
      left: 'auto',
      right: 'auto',
      top: 'auto',
      bottom: 'auto',
      transform: 'none',
      translate: 'none',
      width: 'auto',
      height: 'auto',
      margin: '0',
      clipPath: 'none'
    };
    Object.entries(props).forEach(([key, value]) => {
      toggle.style.setProperty(
        key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
        value,
        'important'
      );
    });
    toggle.classList.add('msg-reader-topics-toolbar-normalized');

    // Legacy edge-tab decoration can be carried by inline border/radius rules.
    ['border-radius','border-top-left-radius','border-bottom-left-radius',
     'border-top-right-radius','border-bottom-right-radius'].forEach((prop) => {
      toggle.style.removeProperty(prop);
    });

    return true;
  }

  function visibleReaderCloseButton() {
    const shell = readerShell();
    if (!shell) return null;
    const shellRect = shell.getBoundingClientRect();

    const candidates = [...shell.querySelectorAll('button')].filter((button) => {
      if (button.id === 'msg-reader-window-toggle') return false;
      if (button.matches('#fullscreen-mark-close, #close-reader-controls, [data-askmark-close]')) return false;

      const rect = button.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;

      const style = getComputedStyle(button);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;

      const text = (button.textContent || '').trim();
      const aria = (button.getAttribute('aria-label') || '').toLowerCase();
      const title = (button.getAttribute('title') || '').toLowerCase();
      const looksLikeClose = text === '×' || text === 'x' || aria.includes('close reader') || title.includes('close reader');
      if (!looksLikeClose) return false;

      // Only consider window-level controls near the outer Reader's top-right.
      return rect.top <= shellRect.top + 150 && rect.left >= shellRect.left + (shellRect.width * .55);
    });

    if (!candidates.length) return null;

    candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const ad = Math.abs(shellRect.right - ar.right) + Math.abs(ar.top - shellRect.top);
      const bd = Math.abs(shellRect.right - br.right) + Math.abs(br.top - shellRect.top);
      return ad - bd;
    });

    return candidates[0];
  }

  function ensureReaderWindowButton() {
    const shell = readerShell();
    if (!shell) return null;

    const closeButton = visibleReaderCloseButton();
    let button = shell.querySelector('#msg-reader-window-toggle');

    if (!button) {
      button = document.createElement('button');
      button.id = 'msg-reader-window-toggle';
      button.type = 'button';
      button.className = 'msg-reader-window-toggle';
      button.innerHTML = '<span class="msg-reader-window-icon" aria-hidden="true">□</span>';
      button.title = 'Make Reader smaller';
      button.setAttribute('aria-label', 'Make Reader smaller');

      button.addEventListener('click', () => {
        const currentShell = readerShell();
        if (!currentShell || !standardReaderAvailable()) return;
        const current = currentShell.getBoundingClientRect().width;
        const max = maxReaderWidth();
        if (current >= max - 8) snapReaderSmaller();
        else restoreReaderFullWidth(true);
      });
    }

    if (closeButton?.parentNode) {
      // Reuse the wrapper that already owns the X on later syncs. Without this
      // guard, closeButton.parentNode can itself be the group, and attempting
      // group.insertBefore(group, closeButton) throws HierarchyRequestError.
      let group = closeButton.closest('.msg-reader-window-control-group')
        || shell.querySelector('.msg-reader-window-control-group');

      if (!group) {
        group = document.createElement('div');
        group.className = 'msg-reader-window-control-group';
      }

      const parent = closeButton.parentNode;

      if (!group.contains(closeButton) && group.parentNode !== parent) {
        parent.insertBefore(group, closeButton);
      } else if (!group.isConnected && parent && parent !== group) {
        parent.insertBefore(group, closeButton);
      }

      // The group is anchored directly to the Reader shell by CSS.
      // Do not inherit stale absolute positioning from the legacy X.
      group.style.removeProperty('top');
      group.style.removeProperty('right');
      group.style.removeProperty('bottom');
      group.style.removeProperty('left');
      group.style.removeProperty('z-index');
      group.style.removeProperty('position');
      group.style.removeProperty('transform');

      if (button.parentNode !== group) group.appendChild(button);
      if (closeButton.parentNode !== group) group.appendChild(closeButton);

      // Preserve the existing X classes/handler but neutralize its old absolute
      // positioning now that the wrapper owns the window-control position.
      [button, closeButton].forEach((control) => {
        control.style.setProperty('position', 'static', 'important');
        control.style.setProperty('inset', 'auto', 'important');
        control.style.setProperty('top', 'auto', 'important');
        control.style.setProperty('right', 'auto', 'important');
        control.style.setProperty('bottom', 'auto', 'important');
        control.style.setProperty('left', 'auto', 'important');
        control.style.setProperty('transform', 'none', 'important');
        control.style.setProperty('margin', '0', 'important');
      });

      // Match the X's visual classes without copying any close-specific data attrs.
      const closeClasses = [...closeButton.classList]
        .filter((name) => !/^msg-reader-window-/.test(name));
      button.className = [...new Set([...closeClasses, 'msg-reader-window-toggle'])].join(' ');
    }

    return button;
  }

  function updateReaderWindowButton() {
    const button = document.querySelector('#msg-reader-window-toggle');
    const shell = readerShell();
    if (!button || !shell) return;

    const isSmaller = standardReaderAvailable()
      && shell.getBoundingClientRect().width < maxReaderWidth() - 8;

    button.innerHTML = `<span class="msg-reader-window-icon" aria-hidden="true">${isSmaller ? '▣' : '□'}</span>`;
    button.title = isSmaller ? 'Restore Reader width' : 'Make Reader smaller';
    button.setAttribute('aria-label', isSmaller ? 'Restore Reader width' : 'Make Reader smaller');
    button.setAttribute('aria-pressed', isSmaller ? 'true' : 'false');
  }

  function ensureReaderEdgeResizeBinding() {
    const shell = readerShell();
    if (!shell || shell.dataset.readerEdgeResizeBound === '1') return;

    shell.dataset.readerEdgeResizeBound = '1';

    const EDGE_HIT_PX = 10;

    function edgeForPointer(event) {
      if (!standardReaderAvailable()) return null;
      const rect = shell.getBoundingClientRect();
      const leftDistance = Math.abs(event.clientX - rect.left);
      const rightDistance = Math.abs(rect.right - event.clientX);

      if (leftDistance <= EDGE_HIT_PX) return 'left';
      if (rightDistance <= EDGE_HIT_PX) return 'right';
      return null;
    }

    shell.addEventListener('pointermove', (event) => {
      if (readerWidthDrag) return;
      shell.style.cursor = edgeForPointer(event) ? 'ew-resize' : '';
    });

    shell.addEventListener('pointerleave', () => {
      if (!readerWidthDrag) shell.style.cursor = '';
    });

    shell.addEventListener('pointerdown', (event) => {
      const edge = edgeForPointer(event);
      if (!edge || !standardReaderAvailable()) return;

      event.preventDefault();
      event.stopPropagation();

      if (secondaryWorkspaceReaderActive()) {
        document.querySelector('.msg-workspace-shell')?.classList.remove('msg-reader-focus-mode');
        clearStandaloneAppWidth();
      }

      readerWidthDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: shell.getBoundingClientRect().width,
        chromeWidth: standaloneReaderChromeWidth(),
        edge
      };

      try { shell.setPointerCapture(event.pointerId); } catch {}
      document.body.classList.add('msg-reader-window-resizing');
      shell.style.cursor = 'ew-resize';
    });

    shell.addEventListener('pointermove', (event) => {
      if (!readerWidthDrag || readerWidthDrag.pointerId !== event.pointerId) return;

      event.preventDefault();
      const delta = event.clientX - readerWidthDrag.startX;
      const next = readerWidthDrag.edge === 'right'
        ? readerWidthDrag.startWidth + (delta * 2)
        : readerWidthDrag.startWidth - (delta * 2);

      setReaderWidth(next, false);
    });

    const finish = (event) => {
      if (!readerWidthDrag || readerWidthDrag.pointerId !== event.pointerId) return;

      event.preventDefault();
      setReaderWidth(shell.getBoundingClientRect().width, true);

      readerWidthDrag = null;
      document.body.classList.remove('msg-reader-window-resizing');
      shell.style.cursor = '';
      try { shell.releasePointerCapture(event.pointerId); } catch {}
    };

    shell.addEventListener('pointerup', finish);
    shell.addEventListener('pointercancel', finish);

    shell.addEventListener('dblclick', (event) => {
      if (edgeForPointer(event)) restoreReaderFullWidth(true);
    });
  }

  function removeLegacyReaderEdgeOverlays() {
    document.querySelectorAll('.msg-reader-window-edge').forEach((edge) => edge.remove());
    readerEdgeLeft = null;
    readerEdgeRight = null;
  }

  // v5.4: Do not paint a Standard secondary workspace panel in its temporary
  // pre-sync position. visibility:hidden preserves its layout box so the existing
  // geometry calculations can measure it without a visible "next to Reader" jump.
  const WORKSPACE_INIT_CLASS = 'msg-workspace-secondary-initializing';

  function ensureWorkspaceInitializationStyle() {
    if (document.querySelector('#msg-workspace-initialization-style')) return;
    const style = document.createElement('style');
    style.id = 'msg-workspace-initialization-style';
    style.textContent = `
      html.${WORKSPACE_INIT_CLASS} .msg-workspace-secondary {
        visibility: hidden !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function beginWorkspaceInitialization() {
    if (window.__MSG_SECONDARY_READER__ || document.documentElement.classList.contains('msg-secondary-reader-document')) return;
    ensureWorkspaceInitializationStyle();
    document.documentElement.classList.add(WORKSPACE_INIT_CLASS);
  }

  function finishWorkspaceInitialization() {
    if (!document.documentElement.classList.contains(WORKSPACE_INIT_CLASS)) return;
    // Let the existing sync write its geometry, then reveal after layout has had
    // two animation frames to settle. No dimensions are changed here.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.documentElement.classList.remove(WORKSPACE_INIT_CLASS);
      });
    });
  }

  function syncStandardReaderWindow() {
    // Reader 2+ lives inside a parent-owned workspace iframe. It must never
    // participate in Reader 1's standalone width/window-control system.
    if (window.__MSG_SECONDARY_READER__ || document.documentElement.classList.contains('msg-secondary-reader-document')) {
      clearStandaloneAppWidth();
      const embeddedShell = readerShell();
      if (embeddedShell) clearShellWidth(embeddedShell);
      document.querySelector('#msg-reader-window-toggle')?.remove();
      document.querySelectorAll('.msg-primary-reader-resize-grip').forEach((node) => node.remove());
      removeLegacyReaderEdgeOverlays();
      return;
    }

    retireObsoleteReaderSurfaceHandle();
    document.querySelectorAll('.msg-primary-reader-resize-grip').forEach((grip) => grip.remove());
    removeLegacyReaderEdgeOverlays();

    if (desktopWorkspaceActive()) {
      clearStandaloneAppWidth();
      const shell = readerShell();
      if (shell) clearShellWidth(shell);
      return;
    }

    if (secondaryWorkspaceReaderActive()) {
      document.querySelector('.msg-workspace-shell')?.classList.remove('msg-reader-focus-mode');
      clearStandaloneAppWidth();
    }

    // Standard workspace side panels own the remaining horizontal space.
    // Release any standalone Reader width from #app immediately when one is open.
    if (standardWorkspacePanelActive()) {
      clearStandaloneAppWidth();
    }

    if (!document.body.classList.contains('msg-primary-reader-standalone')) {
      clearStandaloneAppWidth();
    }

    normalizeReaderTopicsToggle();

    const shell = readerShell();
    if (!shell) {
      return;
    }

    try { ensureReaderWindowButton(); } catch (error) {
      console.warn('Reader width button could not be placed.', error);
    }
    removeLegacyReaderEdgeOverlays();
    try { ensureReaderEdgeResizeBinding(); } catch (error) {
      console.warn('Reader edge resizing could not be initialized.', error);
    }

    if (!standardReaderAvailable()) {
      clearShellWidth(shell);
      updateReaderWindowButton();
      return;
    }

    if (readerCollapsed()) {
      setReaderWidth(storedReaderWidth() || comfortableReaderWidth(), false);
    } else {
      restoreReaderFullWidth(false);
    }

    updateReaderWindowButton();

    if (standardWorkspacePanelActive()) {
      finishWorkspaceInitialization();
    }
  }

  /* Bounded resyncs only. */
  document.addEventListener('click', () => {
    [0, 80, 220].forEach((delay) => window.setTimeout(syncStandardReaderWindow, delay));
  }, { passive: true });

  // When a Standard workspace panel is opened, hide only the secondary pane
  // before the app's normal click handler can mount/paint it. Then let the
  // existing geometry sync place it correctly and reveal it.
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const workspaceOpen = event.target.closest(
      '[data-action="mark-notebook"], [data-action="music"], [data-msg-workspace-tab], [data-msg-workspace-open]'
    );
    if (!workspaceOpen) return;
    beginWorkspaceInitialization();
    [0, 60, 160, 320].forEach((delay) => window.setTimeout(syncStandardReaderWindow, delay));
  }, { capture: true, passive: true });

  document.addEventListener(MODE_EVENT, () => {
    [0, 80, 220].forEach((delay) => window.setTimeout(syncStandardReaderWindow, delay));
  });

  window.addEventListener('resize', () => {
    const shell = readerShell();
    if (!shell) return;

    if (readerWidthDrag) {
        return;
    }

    if (standardReaderAvailable() && readerCollapsed()) {
      setReaderWidth(storedReaderWidth() || comfortableReaderWidth(), false);
    } else if (!standardReaderAvailable()) {
      clearShellWidth(shell);
      clearStandaloneAppWidth();
    }

  }, { passive: true });


  // Cover restored-on-load workspaces as well as panels opened by a click.
  // The class is harmless when no secondary pane exists.
  beginWorkspaceInitialization();
  [0, 100, 300, 700, 1200, 1800, 2600, 4000].forEach((delay) => window.setTimeout(() => {
    syncStandardReaderWindow();
    // If no Standard secondary panel exists, do not leave the initialization
    // class behind.
    if (!standardWorkspacePanelActive()) {
      document.documentElement.classList.remove(WORKSPACE_INIT_CLASS);
    }
  }, delay));

  // v5.3: Standard-workspace panels such as Notebook can mount their iframe
  // after the original startup retry window. The first unrelated document click
  // was then the event that finally released Reader 1's standalone width.
  //
  // Re-run the EXISTING geometry sync when a workspace iframe finishes loading.
  // This is event-driven and bounded; no DOM observer and no width formula changes.
  document.addEventListener('load', (event) => {
    const frame = event.target;
    if (!(frame instanceof HTMLIFrameElement)) return;
    if (!frame.closest?.('.msg-workspace-secondary')) return;
    beginWorkspaceInitialization();
    [0, 60, 180, 360].forEach((delay) => window.setTimeout(syncStandardReaderWindow, delay));
  }, true);

  window.addEventListener('pageshow', () => {
    [0, 80, 220].forEach((delay) => window.setTimeout(syncStandardReaderWindow, delay));
  });

  // v2.9: Reader window controls can be mounted after the broader Reader shell.
  // Retry ONLY control installation during startup so the resize button is
  // present on load without requiring an unrelated document click. This does
  // not rerun workspace mode/geometry synchronization.
  function installReaderWindowControlsWhenReady() {
    if (window.__MSG_SECONDARY_READER__ || document.documentElement.classList.contains('msg-secondary-reader-document')) return true;
    if (desktopWorkspaceActive()) return true;

    const shell = readerShell();
    if (!shell) return false;

    const existing = shell.querySelector('#msg-reader-window-toggle');
    if (existing && existing.isConnected) {
      try { ensureReaderEdgeResizeBinding(); } catch (error) {
        console.warn('Reader edge resizing could not be initialized.', error);
      }
      updateReaderWindowButton();
      return true;
    }

    // Placement intentionally waits for the Reader's native close control so
    // we reuse its established window-control wrapper instead of inventing one.
    if (!visibleReaderCloseButton()) return false;

    try { ensureReaderWindowButton(); } catch (error) {
      console.warn('Reader width button could not be placed.', error);
      return false;
    }

    try { ensureReaderEdgeResizeBinding(); } catch (error) {
      console.warn('Reader edge resizing could not be initialized.', error);
    }
    updateReaderWindowButton();

    const button = shell.querySelector('#msg-reader-window-toggle');
    return !!(button && button.isConnected);
  }

  const readerControlStartupDelays = [0, 120, 300, 600, 1000, 1600, 2400, 3400, 4600];
  readerControlStartupDelays.forEach((delay) => {
    window.setTimeout(() => installReaderWindowControlsWhenReady(), delay);
  });

  window.addEventListener('load', () => {
    [0, 180, 500, 1100].forEach((delay) => {
      window.setTimeout(() => installReaderWindowControlsWhenReady(), delay);
    });
  }, { once: true });

})();
