(() => {
  'use strict';

  const DESKTOP_LAYOUT_KEY = 'msg-desktop-workspace-layout-v1';
  const WINDOW_KEY = 'tool:ask-mark';
  const MIN_WIDTH = 390;
  const MIN_HEIGHT = 320;
  const TOOLBAR_CLEARANCE = 46;

  let panelNode = null;
  let homeParent = null;
  let homeNextSibling = null;
  let windowNode = null;
  let dragState = null;
  let resizeState = null;
  let maximized = false;
  let restoreGeometry = null;
  let dockSuppressed = false;
  let syncScheduled = false;

  function desktopApi() {
    return window.MSGDesktopWorkspace || null;
  }

  function desktopActive() {
    return Boolean(
      desktopApi()?.active ||
      document.body.classList.contains('msg-desktop-workspace-active')
    );
  }

  function canvas() {
    return document.querySelector('.msg-desktop-canvas');
  }

  function companionPanel() {
    if (panelNode?.isConnected) return panelNode;
    return document.querySelector('.mark-companion-panel');
  }

  function readerLayout() {
    return document.getElementById('reader-layout');
  }

  function askToggle() {
    return document.getElementById('toggle-mark-panel');
  }

  function companionIsOpen() {
    if (windowNode?.isConnected && panelNode?.isConnected) return true;

    const layout = readerLayout();
    const panel = companionPanel();
    if (!layout || !panel) return false;
    if (layout.classList.contains('word-panel-hidden')) return false;

    const pressed = askToggle()?.getAttribute('aria-pressed');
    if (pressed === 'true') return true;

    try {
      const style = getComputedStyle(panel);
      return style.display !== 'none' && style.visibility !== 'hidden';
    } catch {
      return true;
    }
  }

  function readDesktopLayout() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DESKTOP_LAYOUT_KEY) || 'null');
      return parsed && typeof parsed === 'object' && parsed.windows && typeof parsed.windows === 'object'
        ? parsed
        : { version:1, windows:{} };
    } catch {
      return { version:1, windows:{} };
    }
  }

  function writeDesktopLayout(value) {
    try { localStorage.setItem(DESKTOP_LAYOUT_KEY, JSON.stringify(value)); } catch {}
  }

  function savedGeometry() {
    const value = readDesktopLayout().windows?.[WINDOW_KEY];
    return value && typeof value === 'object' ? value : null;
  }

  function canvasBounds() {
    const node = canvas();
    const rect = node?.getBoundingClientRect();
    return {
      width:Math.max(720, Math.round(rect?.width || window.innerWidth - 24)),
      height:Math.max(560, Math.round(rect?.height || window.innerHeight - 100))
    };
  }

  function clampGeometry(input = {}) {
    const bounds = canvasBounds();
    const minWidth = Math.min(MIN_WIDTH, Math.max(300, bounds.width - 24));
    const minHeight = Math.min(MIN_HEIGHT, Math.max(240, bounds.height - TOOLBAR_CLEARANCE - 18));

    const width = Math.max(
      minWidth,
      Math.min(Number(input.width) || Math.round(bounds.width * .42), bounds.width - 16)
    );
    const height = Math.max(
      minHeight,
      Math.min(Number(input.height) || Math.round((bounds.height - TOOLBAR_CLEARANCE) * .80), bounds.height - TOOLBAR_CLEARANCE - 8)
    );

    const maxLeft = Math.max(8, bounds.width - width - 8);
    const maxTop = Math.max(TOOLBAR_CLEARANCE, bounds.height - height - 8);

    return {
      left:Math.round(Math.max(8, Math.min(Number(input.left) || maxLeft, maxLeft))),
      top:Math.round(Math.max(TOOLBAR_CLEARANCE, Math.min(Number(input.top) || TOOLBAR_CLEARANCE + 12, maxTop))),
      width:Math.round(width),
      height:Math.round(height)
    };
  }

  function defaultGeometry() {
    const bounds = canvasBounds();
    const width = Math.min(
      bounds.width - 24,
      Math.max(440, Math.round(bounds.width * .43))
    );
    const height = Math.min(
      bounds.height - TOOLBAR_CLEARANCE - 14,
      Math.max(480, Math.round((bounds.height - TOOLBAR_CLEARANCE) * .82))
    );

    return clampGeometry({
      left:bounds.width - width - 16,
      top:TOOLBAR_CLEARANCE + 10,
      width,
      height
    });
  }

  function applyGeometry(input, { persist = false } = {}) {
    if (!windowNode) return null;
    const next = clampGeometry(input);
    windowNode.style.left = `${next.left}px`;
    windowNode.style.top = `${next.top}px`;
    windowNode.style.width = `${next.width}px`;
    windowNode.style.height = `${next.height}px`;

    if (persist && !maximized) {
      const layout = readDesktopLayout();
      layout.windows[WINDOW_KEY] = next;
      writeDesktopLayout(layout);
    }
    return next;
  }

  function currentGeometry() {
    if (!windowNode) return defaultGeometry();
    return {
      left:parseFloat(windowNode.style.left) || windowNode.offsetLeft,
      top:parseFloat(windowNode.style.top) || windowNode.offsetTop,
      width:parseFloat(windowNode.style.width) || windowNode.offsetWidth,
      height:parseFloat(windowNode.style.height) || windowNode.offsetHeight
    };
  }

  function persistGeometry() {
    if (!windowNode || maximized) return;
    applyGeometry(currentGeometry(), { persist:true });
  }

  function markReaderDetached(active) {
    document.querySelectorAll('#reader-layout').forEach((layout) => {
      layout.classList.toggle('msg-askmark-desktop-detached', Boolean(active));
    });
  }

  function bringFront() {
    if (!windowNode) return;

    // Desktop core keeps its own z counter. Rather than competing with it,
    // companion focus is explicit: when Companion is clicked it goes high;
    // clicking another Desktop window lowers it again.
    document.querySelectorAll('.msg-desktop-window').forEach((node) => {
      node.classList.toggle('is-front', node === windowNode);
    });
    windowNode.style.zIndex = '21000';
  }

  function lowerBehindActiveDesktopWindow() {
    if (!windowNode) return;
    windowNode.classList.remove('is-front');
    windowNode.style.zIndex = '39';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function companionLabel() {
    let title = '';
    try {
      title = String(window.MarkSetGoCurrentReaderDocument?.get?.()?.title || '').trim();
    } catch {}
    return title ? `Ask Mark — ${title}` : 'Ask Mark';
  }

  function installResizeHandles(wrapper) {
    ['n','e','s','w','ne','nw','se','sw'].forEach((edge) => {
      const handle = document.createElement('div');
      handle.className = `msg-desktop-resize-handle msg-desktop-resize-${edge}`;
      handle.dataset.msgAskmarkDesktopResize = edge;
      handle.setAttribute('aria-hidden','true');
      wrapper.appendChild(handle);
    });
  }

  function notifyResize() {
    try { window.dispatchEvent(new Event('resize')); } catch {}
  }

  function toggleMaximize() {
    if (!windowNode) return;

    const button = windowNode.querySelector('[data-askmark-desktop-maximize]');
    if (maximized) {
      maximized = false;
      windowNode.classList.remove('msg-desktop-window-maximized');
      applyGeometry(restoreGeometry || savedGeometry() || defaultGeometry());
      restoreGeometry = null;
      if (button) {
        button.textContent = '□';
        button.title = 'Maximize';
        button.setAttribute('aria-label','Maximize Ask Mark');
      }
      persistGeometry();
    } else {
      restoreGeometry = currentGeometry();
      maximized = true;
      windowNode.classList.add('msg-desktop-window-maximized');
      const bounds = canvasBounds();
      windowNode.style.left = '8px';
      windowNode.style.top = `${TOOLBAR_CLEARANCE}px`;
      windowNode.style.width = `${Math.max(MIN_WIDTH, bounds.width - 16)}px`;
      windowNode.style.height = `${Math.max(MIN_HEIGHT, bounds.height - TOOLBAR_CLEARANCE - 8)}px`;
      if (button) {
        button.textContent = '❐';
        button.title = 'Restore';
        button.setAttribute('aria-label','Restore Ask Mark');
      }
    }

    bringFront();
    notifyResize();
  }

  function bindWindow() {
    if (!windowNode || windowNode.dataset.msgAskmarkDesktopBound === '1') return;
    windowNode.dataset.msgAskmarkDesktopBound = '1';

    const titlebar = windowNode.querySelector('[data-askmark-desktop-drag]');
    const dock = windowNode.querySelector('[data-askmark-desktop-dock]');
    const maximize = windowNode.querySelector('[data-askmark-desktop-maximize]');
    const close = windowNode.querySelector('[data-askmark-desktop-close]');

    windowNode.addEventListener('pointerdown', bringFront, true);

    titlebar?.addEventListener('dblclick', (event) => {
      if (event.target instanceof Element && event.target.closest('button')) return;
      event.preventDefault();
      toggleMaximize();
    });

    titlebar?.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest('button')) return;
      if (maximized) return;

      dragState = {
        pointerId:event.pointerId,
        startX:event.clientX,
        startY:event.clientY,
        geometry:currentGeometry()
      };
      windowNode.classList.add('msg-desktop-window-moving');
      document.body.classList.add('msg-desktop-dragging');
      bringFront();
      try { titlebar.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
    });

    titlebar?.addEventListener('pointermove', (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      applyGeometry({
        ...dragState.geometry,
        left:dragState.geometry.left + (event.clientX - dragState.startX),
        top:dragState.geometry.top + (event.clientY - dragState.startY)
      });
      event.preventDefault();
    });

    const finishDrag = (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      try { titlebar?.releasePointerCapture(event.pointerId); } catch {}
      windowNode?.classList.remove('msg-desktop-window-moving');
      document.body.classList.remove('msg-desktop-dragging');
      dragState = null;
      persistGeometry();
      notifyResize();
    };
    titlebar?.addEventListener('pointerup', finishDrag);
    titlebar?.addEventListener('pointercancel', finishDrag);

    windowNode.querySelectorAll('[data-msg-askmark-desktop-resize]').forEach((handle) => {
      handle.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (maximized) return;

        resizeState = {
          pointerId:event.pointerId,
          edge:String(handle.dataset.msgAskmarkDesktopResize || ''),
          startX:event.clientX,
          startY:event.clientY,
          geometry:currentGeometry()
        };
        windowNode?.classList.add('msg-desktop-window-resizing');
        document.body.classList.add('msg-desktop-resizing');
        bringFront();
        try { handle.setPointerCapture(event.pointerId); } catch {}
        event.preventDefault();
        event.stopPropagation();
      });

      handle.addEventListener('pointermove', (event) => {
        if (!resizeState || resizeState.pointerId !== event.pointerId || !windowNode) return;

        const { geometry, edge } = resizeState;
        const dx = event.clientX - resizeState.startX;
        const dy = event.clientY - resizeState.startY;
        let next = { ...geometry };

        if (edge.includes('e')) next.width = geometry.width + dx;
        if (edge.includes('s')) next.height = geometry.height + dy;
        if (edge.includes('w')) {
          next.left = geometry.left + dx;
          next.width = geometry.width - dx;
        }
        if (edge.includes('n')) {
          next.top = geometry.top + dy;
          next.height = geometry.height - dy;
        }

        if (next.width < MIN_WIDTH) {
          if (edge.includes('w')) next.left -= MIN_WIDTH - next.width;
          next.width = MIN_WIDTH;
        }
        if (next.height < MIN_HEIGHT) {
          if (edge.includes('n')) next.top -= MIN_HEIGHT - next.height;
          next.height = MIN_HEIGHT;
        }

        applyGeometry(next);
        notifyResize();
        event.preventDefault();
      });

      const finishResize = (event) => {
        if (!resizeState || resizeState.pointerId !== event.pointerId) return;
        try { handle.releasePointerCapture(event.pointerId); } catch {}
        windowNode?.classList.remove('msg-desktop-window-resizing');
        document.body.classList.remove('msg-desktop-resizing');
        resizeState = null;
        persistGeometry();
        notifyResize();
      };
      handle.addEventListener('pointerup', finishResize);
      handle.addEventListener('pointercancel', finishResize);
    });

    dock?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      dockSuppressed = true;
      restoreToReader({ keepOpen:true });
    });

    maximize?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleMaximize();
    });

    close?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeCompanion();
    });
  }

  function createDesktopWindow() {
    const targetCanvas = canvas();
    if (!targetCanvas || !panelNode) return null;

    if (windowNode?.isConnected) return windowNode;

    const wrapper = document.createElement('section');
    wrapper.className = 'msg-desktop-window msg-askmark-desktop-window';
    wrapper.dataset.msgDesktopWindowKey = WINDOW_KEY;
    wrapper.setAttribute('aria-label','Ask Mark');

    wrapper.innerHTML = `
      <div class="msg-desktop-titlebar" data-askmark-desktop-drag>
        <div class="msg-desktop-window-title">
          <span class="msg-desktop-window-dot" aria-hidden="true"></span>
          <strong data-askmark-desktop-title>${escapeHtml(companionLabel())}</strong>
        </div>
        <div class="msg-desktop-window-actions">
          <button type="button" data-askmark-desktop-dock aria-label="Dock Ask Mark back in Reader" title="Dock back in Reader">↙</button>
          <button type="button" data-askmark-desktop-maximize aria-label="Maximize Ask Mark" title="Maximize">□</button>
          <button type="button" data-askmark-desktop-close aria-label="Close Ask Mark" title="Close">×</button>
        </div>
      </div>
      <div class="msg-desktop-window-content msg-askmark-desktop-content"></div>`;

    installResizeHandles(wrapper);
    wrapper.querySelector('.msg-askmark-desktop-content')?.appendChild(panelNode);
    targetCanvas.appendChild(wrapper);

    windowNode = wrapper;
    applyGeometry(savedGeometry() || defaultGeometry());
    bindWindow();
    bringFront();
    notifyResize();
    return wrapper;
  }

  function detachToDesktop() {
    if (!desktopActive() || dockSuppressed) return false;

    const targetCanvas = canvas();
    const panel = companionPanel();
    if (!targetCanvas || !panel || !companionIsOpen()) return false;

    if (windowNode?.isConnected && panelNode === panel) {
      bringFront();
      return true;
    }

    // Expanded mode is a Standard-workspace presentation. Desktop gets its own
    // maximize/restore controls around the exact same live companion node.
    try { window.MarkSetGoAskMarkWindow?.restore?.(); } catch {}

    panelNode = panel;
    if (!homeParent || !homeParent.isConnected) {
      homeParent = panel.parentNode;
      homeNextSibling = panel.nextSibling;
    }

    panelNode.dataset.msgAskmarkDesktopDetached = '1';
    markReaderDetached(true);
    createDesktopWindow();
    return Boolean(windowNode?.isConnected);
  }

  function resolveHomeParent() {
    if (homeParent?.isConnected) return homeParent;

    const layout = readerLayout();
    if (!layout) return null;

    const replacement = layout.querySelector('.mark-companion-panel');
    if (replacement && replacement !== panelNode) {
      try { replacement.remove(); } catch {}
    }
    return layout;
  }

  function restoreToReader({ keepOpen = true } = {}) {
    const panel = panelNode || companionPanel();

    if (!panel) {
      windowNode?.remove();
      windowNode = null;
      markReaderDetached(false);
      return false;
    }

    const target = resolveHomeParent();
    if (target) {
      const sibling = homeNextSibling && homeNextSibling.parentNode === target
        ? homeNextSibling
        : null;
      target.insertBefore(panel, sibling);
    }

    delete panel.dataset.msgAskmarkDesktopDetached;
    markReaderDetached(false);

    windowNode?.remove();
    windowNode = null;
    maximized = false;
    restoreGeometry = null;
    dragState = null;
    resizeState = null;

    if (!keepOpen) {
      const internalClose = panel.querySelector('[data-askmark-close]');
      const toggle = askToggle();
      window.setTimeout(() => {
        if (internalClose?.isConnected) {
          internalClose.click();
        } else if (toggle?.getAttribute('aria-pressed') === 'true') {
          toggle.click();
        }
      }, 0);
    }

    panelNode = panel;
    notifyResize();
    return true;
  }

  function closeCompanion() {
    dockSuppressed = true;
    return restoreToReader({ keepOpen:false });
  }

  function ensureDesktopOpenButton() {
    const actions = document.querySelector('.mark-companion-panel [data-askmark-premium] .askmark-header-actions');
    if (!actions) return null;

    let button = actions.querySelector('[data-askmark-open-desktop]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'askmark-desktop-open-button';
      button.dataset.askmarkOpenDesktop = '1';
      button.textContent = '▣';
      button.title = 'Open Ask Mark in Desktop Workspace';
      button.setAttribute('aria-label','Open Ask Mark in Desktop Workspace');
      actions.prepend(button);

      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        dockSuppressed = false;
        try { window.MarkSetGoAskMarkWindow?.restore?.(); } catch {}
        try { desktopApi()?.activate?.(); } catch {}
        scheduleSync();
      });
    }
    return button;
  }

  function updateDesktopTitle() {
    const title = windowNode?.querySelector('[data-askmark-desktop-title]');
    if (title) title.textContent = companionLabel();
  }

  function sync() {
    syncScheduled = false;
    ensureDesktopOpenButton();

    if (!desktopActive()) {
      if (windowNode?.isConnected || panelNode?.dataset?.msgAskmarkDesktopDetached === '1') {
        dockSuppressed = false;
        restoreToReader({ keepOpen:true });
      }
      return;
    }

    if (!companionIsOpen()) {
      if (windowNode?.isConnected) restoreToReader({ keepOpen:true });
      return;
    }

    if (!dockSuppressed) detachToDesktop();
    updateDesktopTitle();
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    [0, 60, 160, 360, 800].forEach((delay, index) => {
      window.setTimeout(() => {
        sync();
        if (index === 4) syncScheduled = false;
      }, delay);
    });
  }

  // Opening Ask Mark from Reader while Desktop is active should produce its
  // Desktop window automatically. Closing/reopening after an explicit Dock Back
  // clears the suppression and allows detaching again.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-askmark-open-desktop]')) return;

    if (target.closest('#toggle-mark-panel')) {
      dockSuppressed = false;
      scheduleSync();
      return;
    }

    if (target.closest('[data-mark-tab="selection"]')) {
      dockSuppressed = false;
      scheduleSync();
      return;
    }

    if (target.closest('[data-askmark-close]') && windowNode?.isConnected) {
      // Put the node home before Ask Mark's own close handler finishes.
      dockSuppressed = true;
      restoreToReader({ keepOpen:true });
      return;
    }

    if (target.closest('[data-msg-desktop-reset]')) {
      // Desktop core clears the shared layout key. Re-cascade Companion too.
      window.setTimeout(() => {
        if (!windowNode?.isConnected) return;
        maximized = false;
        windowNode.classList.remove('msg-desktop-window-maximized');
        applyGeometry(defaultGeometry(), { persist:true });
        notifyResize();
      }, 0);
      return;
    }

    const otherDesktopWindow = target.closest('.msg-desktop-window');
    if (otherDesktopWindow && otherDesktopWindow !== windowNode) {
      lowerBehindActiveDesktopWindow();
    }
  }, true);

  document.addEventListener('marksetgo:workspace-layout-mode', (event) => {
    const mode = String(event.detail?.mode || '');
    if (mode === 'standard') {
      dockSuppressed = false;
      restoreToReader({ keepOpen:true });
    } else if (mode === 'desktop') {
      dockSuppressed = false;
      scheduleSync();
    }
  });

  document.addEventListener('marksetgo:document-available', () => {
    updateDesktopTitle();
    scheduleSync();
  });

  window.addEventListener('resize', () => {
    // Desktop core may deactivate first on narrow screens. Our retained node
    // reference lets us restore immediately even if its canvas was removed.
    window.setTimeout(() => {
      if (!desktopActive()) {
        if (panelNode) restoreToReader({ keepOpen:true });
        return;
      }

      if (windowNode?.isConnected) {
        if (maximized) {
          const bounds = canvasBounds();
          windowNode.style.left = '8px';
          windowNode.style.top = `${TOOLBAR_CLEARANCE}px`;
          windowNode.style.width = `${bounds.width - 16}px`;
          windowNode.style.height = `${bounds.height - TOOLBAR_CLEARANCE - 8}px`;
        } else {
          applyGeometry(currentGeometry());
        }
        notifyResize();
      } else {
        scheduleSync();
      }
    }, 0);
  });

  window.addEventListener('pageshow', scheduleSync);

  // Phase 1 may install/rebuild its header controls a moment after Ask Mark
  // opens. Finite checks are enough to add the Desktop control.
  [0, 100, 320, 900, 1800].forEach((delay) => window.setTimeout(() => {
    ensureDesktopOpenButton();
    sync();
  }, delay));

  window.MarkSetGoAskMarkDesktop = Object.freeze({
    open:() => {
      dockSuppressed = false;
      try { desktopApi()?.activate?.(); } catch {}
      scheduleSync();
      return true;
    },
    dock:() => {
      dockSuppressed = true;
      return restoreToReader({ keepOpen:true });
    },
    close:closeCompanion,
    sync,
    get detached(){ return Boolean(windowNode?.isConnected); },
    status:() => ({
      desktopActive:desktopActive(),
      detached:Boolean(windowNode?.isConnected),
      dockSuppressed,
      geometry:windowNode?.isConnected ? currentGeometry() : savedGeometry()
    })
  });
})();