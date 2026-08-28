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
      try { window.dispatchEvent(new Event('resize')); } catch {}
    });

    const finish = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      setWidth(app.getBoundingClientRect().width, true);
      drag = null;
      document.body.classList.remove('msg-desktop-shell-resizing');
      try { handle.releasePointerCapture(event.pointerId); } catch {}
      try { window.dispatchEvent(new Event('resize')); } catch {}
    };

    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);

    handle.addEventListener('dblclick', () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      setWidth(Math.min(1180, safeMaxWidth()), true);
      try { window.dispatchEvent(new Event('resize')); } catch {}
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
    return !document.body.classList.contains('msg-desktop-workspace-active')
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
    return readerShellParentWidth();
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
      return;
    }

    const width = clampReaderWidth(value);
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
      return;
    }

    setShellWidthImportant(shell, '100%');

    if (persist) {
      try {
        localStorage.removeItem(READER_WIDTH_KEY);
        localStorage.setItem(READER_COLLAPSED_KEY, '0');
      } catch {}
    }

    updateReaderWindowButton();
    try { window.dispatchEvent(new Event('resize')); } catch {}
  }

  function snapReaderSmaller() {
    setReaderWidth(storedReaderWidth() || comfortableReaderWidth(), true);
    try { localStorage.setItem(READER_COLLAPSED_KEY, '1'); } catch {}
    updateReaderWindowButton();
    try { window.dispatchEvent(new Event('resize')); } catch {}
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

      readerWidthDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: shell.getBoundingClientRect().width,
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
      try { window.dispatchEvent(new Event('resize')); } catch {}
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

  function syncStandardReaderWindow() {
    retireObsoleteReaderSurfaceHandle();
    removeLegacyReaderEdgeOverlays();
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
  }

  /* Bounded resyncs only. */
  document.addEventListener('click', () => {
    [0, 80, 220].forEach((delay) => window.setTimeout(syncStandardReaderWindow, delay));
  }, { passive: true });

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
    }

  }, { passive: true });


  [0, 100, 300, 700, 1200].forEach((delay) => window.setTimeout(syncStandardReaderWindow, delay));

})();
