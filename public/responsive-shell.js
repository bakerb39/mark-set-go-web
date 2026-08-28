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
     Standard Reader window-style width
     ------------------------------------------------------------ */
  const READER_WIDTH_KEY = 'msg-standard-reader-window-width-v1';
  const READER_COLLAPSED_KEY = 'msg-standard-reader-window-collapsed-v1';
  let readerWidthDrag = null;
  let readerEdgeLeft = null;
  let readerEdgeRight = null;

  function standardReaderAvailable() {
    return !document.body.classList.contains('msg-desktop-workspace-active')
      && window.innerWidth > 760;
  }

  function readerFrame() {
    return document.querySelector('#reader-frame');
  }

  function readerCenterColumn() {
    return document.querySelector('.reader-center-column');
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
    const column = readerCenterColumn();
    const measured = column?.getBoundingClientRect().width || readerFrame()?.parentElement?.getBoundingClientRect().width || 0;
    return Math.max(0, Math.floor(measured));
  }

  function minReaderWidth() {
    const max = maxReaderWidth();
    return Math.min(max, Math.max(460, Math.min(620, Math.round(max * .58))));
  }

  function comfortableReaderWidth() {
    const max = maxReaderWidth();
    return Math.max(minReaderWidth(), Math.min(760, Math.round(max * .72)));
  }

  function clampReaderWidth(value) {
    const max = maxReaderWidth();
    if (!max) return Math.max(0, Math.round(value || 0));
    return Math.max(minReaderWidth(), Math.min(max, Math.round(value)));
  }

  function setReaderWidth(value, persist = false) {
    const frame = readerFrame();
    if (!frame) return;

    if (!standardReaderAvailable()) {
      frame.classList.remove('msg-reader-window-width');
      frame.style.removeProperty('--msg-reader-window-width');
      return;
    }

    const width = clampReaderWidth(value);
    frame.classList.add('msg-reader-window-width');
    frame.style.setProperty('--msg-reader-window-width', `${width}px`);

    if (persist) {
      try {
        localStorage.setItem(READER_WIDTH_KEY, String(width));
        localStorage.setItem(READER_COLLAPSED_KEY, width < maxReaderWidth() - 8 ? '1' : '0');
      } catch {}
    }

    positionReaderEdges();
    updateReaderWindowButton();
  }

  function restoreReaderFullWidth(persist = true) {
    const frame = readerFrame();
    if (!frame) return;
    frame.classList.add('msg-reader-window-width');
    frame.style.setProperty('--msg-reader-window-width', '100%');
    if (persist) {
      try {
        localStorage.removeItem(READER_WIDTH_KEY);
        localStorage.setItem(READER_COLLAPSED_KEY, '0');
      } catch {}
    }
    positionReaderEdges();
    updateReaderWindowButton();
    try { window.dispatchEvent(new Event('resize')); } catch {}
  }

  function snapReaderSmaller() {
    setReaderWidth(storedReaderWidth() || comfortableReaderWidth(), true);
    try { localStorage.setItem(READER_COLLAPSED_KEY, '1'); } catch {}
    updateReaderWindowButton();
    try { window.dispatchEvent(new Event('resize')); } catch {}
  }

  function removeLegacyReaderWidthControl() {
    const roots = [
      document.querySelector('.reader-pane-controls'),
      document.querySelector('.reader-toolbar'),
      document.querySelector('.reader-page-panel')
    ].filter(Boolean);

    for (const root of roots) {
      for (const label of root.querySelectorAll('label')) {
        const ownText = [...label.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();

        if (ownText === 'width' && label.querySelector('select')) {
          label.remove();
          return true;
        }
      }
    }
    return false;
  }

  function ensureReaderWindowButton() {
    const controls = document.querySelector('.reader-pane-controls');
    const fullscreen = controls?.querySelector('#toggle-reader-fullscreen');
    if (!controls || !fullscreen) return null;

    let button = controls.querySelector('#msg-reader-window-toggle');
    if (!button) {
      button = document.createElement('button');
      button.id = 'msg-reader-window-toggle';
      button.type = 'button';
      button.className = 'secondary pane-toggle';
      button.innerHTML = '<span class="msg-reader-window-icon" aria-hidden="true">▣</span>';
      button.title = 'Make Reader smaller';
      button.setAttribute('aria-label', 'Make Reader smaller');
      controls.insertBefore(button, fullscreen);

      button.addEventListener('click', () => {
        const frame = readerFrame();
        if (!frame || !standardReaderAvailable()) return;
        const current = frame.getBoundingClientRect().width;
        const max = maxReaderWidth();
        if (current >= max - 8) snapReaderSmaller();
        else restoreReaderFullWidth(true);
      });
    }

    return button;
  }

  function updateReaderWindowButton() {
    const button = document.querySelector('#msg-reader-window-toggle');
    const frame = readerFrame();
    if (!button || !frame) return;

    const isSmaller = standardReaderAvailable()
      && frame.getBoundingClientRect().width < maxReaderWidth() - 8;

    button.innerHTML = `<span class="msg-reader-window-icon" aria-hidden="true">${isSmaller ? '□' : '▣'}</span>`;
    button.title = isSmaller ? 'Restore Reader width' : 'Make Reader smaller';
    button.setAttribute('aria-label', isSmaller ? 'Restore Reader width' : 'Make Reader smaller');
    button.setAttribute('aria-pressed', isSmaller ? 'true' : 'false');
  }

  function ensureReaderEdges() {
    if (!readerEdgeLeft) {
      readerEdgeLeft = document.createElement('div');
      readerEdgeLeft.className = 'msg-reader-window-edge msg-reader-window-edge-left';
      readerEdgeLeft.dataset.readerWindowEdge = 'left';
      readerEdgeLeft.setAttribute('aria-hidden', 'true');
      document.body.appendChild(readerEdgeLeft);
      bindReaderEdge(readerEdgeLeft);
    }

    if (!readerEdgeRight) {
      readerEdgeRight = document.createElement('div');
      readerEdgeRight.className = 'msg-reader-window-edge msg-reader-window-edge-right';
      readerEdgeRight.dataset.readerWindowEdge = 'right';
      readerEdgeRight.setAttribute('aria-hidden', 'true');
      document.body.appendChild(readerEdgeRight);
      bindReaderEdge(readerEdgeRight);
    }
  }

  function positionReaderEdges() {
    const frame = readerFrame();
    if (!frame || !readerEdgeLeft || !readerEdgeRight || !standardReaderAvailable()) {
      if (readerEdgeLeft) readerEdgeLeft.style.display = 'none';
      if (readerEdgeRight) readerEdgeRight.style.display = 'none';
      return;
    }

    const rect = frame.getBoundingClientRect();
    const top = Math.max(0, Math.round(rect.top));
    const height = Math.max(0, Math.round(rect.height));

    readerEdgeLeft.style.display = 'block';
    readerEdgeRight.style.display = 'block';
    readerEdgeLeft.style.left = `${Math.round(rect.left - 6)}px`;
    readerEdgeRight.style.left = `${Math.round(rect.right - 6)}px`;
    readerEdgeLeft.style.top = `${top}px`;
    readerEdgeRight.style.top = `${top}px`;
    readerEdgeLeft.style.height = `${height}px`;
    readerEdgeRight.style.height = `${height}px`;
  }

  function bindReaderEdge(edge) {
    edge.addEventListener('pointerdown', (event) => {
      const frame = readerFrame();
      if (!frame || !standardReaderAvailable()) return;

      event.preventDefault();
      event.stopPropagation();

      readerWidthDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: frame.getBoundingClientRect().width,
        edge: edge.dataset.readerWindowEdge
      };

      try { edge.setPointerCapture(event.pointerId); } catch {}
      document.body.classList.add('msg-reader-window-resizing');
    });

    edge.addEventListener('pointermove', (event) => {
      if (!readerWidthDrag || readerWidthDrag.pointerId !== event.pointerId) return;
      event.preventDefault();

      const delta = event.clientX - readerWidthDrag.startX;
      const next = readerWidthDrag.edge === 'right'
        ? readerWidthDrag.startWidth + (delta * 2)
        : readerWidthDrag.startWidth - (delta * 2);

      setReaderWidth(next, false);
      try { window.dispatchEvent(new Event('resize')); } catch {}
    });

    const finish = (event) => {
      if (!readerWidthDrag || readerWidthDrag.pointerId !== event.pointerId) return;
      event.preventDefault();

      const frame = readerFrame();
      if (frame) setReaderWidth(frame.getBoundingClientRect().width, true);

      readerWidthDrag = null;
      document.body.classList.remove('msg-reader-window-resizing');
      try { edge.releasePointerCapture(event.pointerId); } catch {}
      try { window.dispatchEvent(new Event('resize')); } catch {}
    };

    edge.addEventListener('pointerup', finish);
    edge.addEventListener('pointercancel', finish);

    edge.addEventListener('dblclick', () => restoreReaderFullWidth(true));
  }

  function syncStandardReaderWindow() {
    removeLegacyReaderWidthControl();
    const frame = readerFrame();

    if (!frame) {
      positionReaderEdges();
      return;
    }

    ensureReaderWindowButton();
    ensureReaderEdges();

    if (!standardReaderAvailable()) {
      frame.classList.remove('msg-reader-window-width');
      frame.style.removeProperty('--msg-reader-window-width');
      updateReaderWindowButton();
      positionReaderEdges();
      return;
    }

    if (readerCollapsed()) {
      setReaderWidth(storedReaderWidth() || comfortableReaderWidth(), false);
    } else {
      restoreReaderFullWidth(false);
    }

    updateReaderWindowButton();
    requestAnimationFrame(positionReaderEdges);
  }

  document.addEventListener('click', () => {
    [0, 80, 220].forEach((delay) => window.setTimeout(syncStandardReaderWindow, delay));
  }, { passive: true });

  window.addEventListener('resize', () => {
    const frame = readerFrame();
    if (!frame) return;
    if (standardReaderAvailable() && readerCollapsed()) {
      setReaderWidth(storedReaderWidth() || comfortableReaderWidth(), false);
    }
    requestAnimationFrame(positionReaderEdges);
  }, { passive: true });

  window.addEventListener('scroll', () => requestAnimationFrame(positionReaderEdges), { passive: true });

  [0, 100, 300, 700, 1200].forEach((delay) => window.setTimeout(syncStandardReaderWindow, delay));

})();
