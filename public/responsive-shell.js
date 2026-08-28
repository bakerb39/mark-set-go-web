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
})();
