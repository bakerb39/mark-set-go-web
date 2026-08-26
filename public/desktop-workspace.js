(() => {
  'use strict';

  const MODE_KEY = 'msg-workspace-layout-mode-v1';
  const LAYOUT_KEY = 'msg-desktop-workspace-layout-v1';
  const MIN_DESKTOP_WIDTH = 1000;
  const MIN_WINDOW_WIDTH = 360;
  const MIN_WINDOW_HEIGHT = 300;
  const TOOLBAR_CLEARANCE = 8;

  const app = document.querySelector('#app');
  if (!app) return;

  const windows = new Map();
  let desktopActive = false;
  let zCounter = 40;
  let dragState = null;
  let resizeState = null;
  let savedShellStyle = null;

  function readMode() {
    try {
      return localStorage.getItem(MODE_KEY) === 'desktop' ? 'desktop' : 'standard';
    } catch {
      return 'standard';
    }
  }

  function writeMode(value) {
    const mode = value === 'desktop' ? 'desktop' : 'standard';
    try { localStorage.setItem(MODE_KEY, mode); } catch {}
    document.dispatchEvent(new CustomEvent('marksetgo:workspace-layout-mode', {
      detail:{ mode }
    }));
    return mode;
  }

  function readLayout() {
    try {
      const value = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null');
      return value && typeof value === 'object' && value.windows && typeof value.windows === 'object'
        ? value
        : { version:1, windows:{} };
    } catch {
      return { version:1, windows:{} };
    }
  }

  function writeLayout(layout) {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch {}
  }

  function clearLayout() {
    try { localStorage.removeItem(LAYOUT_KEY); } catch {}
  }

  function workspaceShell() {
    return app.querySelector(':scope > .msg-workspace-shell');
  }

  function panelBody(shell = workspaceShell()) {
    return shell?.querySelector('.msg-workspace-panel-body') || null;
  }

  function desktopCanvas(shell = workspaceShell()) {
    return shell?.querySelector(':scope > .msg-desktop-canvas') || null;
  }

  function viewportAllowsDesktop() {
    return window.innerWidth >= MIN_DESKTOP_WIDTH;
  }

  function shellIsOpen(shell = workspaceShell()) {
    return Boolean(shell && !shell.classList.contains('is-closed'));
  }

  function slug(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'panel';
  }

  function panelKey(node) {
    if (!node) return '';
    if (node.dataset.msgDesktopKey) return node.dataset.msgDesktopKey;

    const readerNumber = Number.parseInt(node.dataset.msgReaderNumber || '', 10);
    if (Number.isFinite(readerNumber) && readerNumber >= 2) {
      const key = `reader:${readerNumber}`;
      node.dataset.msgDesktopKey = key;
      return key;
    }

    if (node.classList.contains('msg-workspace-symposium')) {
      node.dataset.msgDesktopKey = 'tool:symposium';
      return 'tool:symposium';
    }
    if (node.classList.contains('msg-workspace-browser')) {
      node.dataset.msgDesktopKey = 'tool:browser';
      return 'tool:browser';
    }

    const frame = node.querySelector('.msg-workspace-page-frame');
    if (frame?.src) {
      try {
        const url = new URL(frame.src, window.location.href);
        const mode = String(url.searchParams.get('msgWorkspaceMode') || '').trim();
        const value = String(url.searchParams.get('msgWorkspaceValue') || '').trim();
        if (mode === 'reader') {
          const parsed = Number.parseInt(url.searchParams.get('msgReaderNumber') || value.replace(/^reader-/, ''), 10);
          if (Number.isFinite(parsed) && parsed >= 2) {
            const key = `reader:${parsed}`;
            node.dataset.msgDesktopKey = key;
            return key;
          }
        }
        if (mode || value) {
          const key = `page:${mode}:${value}`;
          node.dataset.msgDesktopKey = key;
          return key;
        }
      } catch {}
    }

    const key = `panel:${slug(frame?.title || node.className)}`;
    node.dataset.msgDesktopKey = key;
    return key;
  }

  function panelLabel(node, key = panelKey(node)) {
    if (key === 'reader:1') {
      const title = String(window.MarkSetGoCurrentReaderDocument?.get?.()?.title || '').trim();
      return title ? `Reader 1 — ${title}` : 'Reader 1';
    }

    const readerMatch = /^reader:(\d+)$/.exec(key);
    if (readerMatch) {
      const frame = node?.querySelector?.('.msg-workspace-page-frame');
      let title = '';
      try {
        title = String(frame?.contentDocument?.querySelector?.('.reader-title-copy h1')?.textContent || '').trim();
      } catch {}
      return title ? `Reader ${readerMatch[1]} — ${title}` : `Reader ${readerMatch[1]}`;
    }

    if (key === 'tool:symposium') return 'Symposium';
    if (key === 'tool:browser') return 'Web';

    const frame = node?.querySelector?.('.msg-workspace-page-frame');
    return String(frame?.title || key.split(':').pop() || 'Workspace').trim();
  }

  function ensureModeButton(shell = workspaceShell()) {
    // Layout mode is controlled only from Readers -> Layout.
    // Remove the older redundant Desktop/Standard button from window chrome.
    shell?.querySelectorAll('[data-msg-desktop-toggle]').forEach((button) => {
      try { button.remove(); } catch {}
    });
    return null;
  }

  function ensureReadersMenuOption() {
    const popover = document.querySelector('.msg-readers-popover');
    if (!popover) return null;

    // Layout is a property of the Reader workspace, not another Reader.
    popover.querySelector('[data-msg-desktop-menu-toggle]')?.remove();

    let control = popover.querySelector('[data-msg-readers-layout-control]');
    if (!control) {
      control = document.createElement('div');
      control.className = 'msg-readers-layout-control';
      control.dataset.msgReadersLayoutControl = '1';
      control.setAttribute('role','group');
      control.setAttribute('aria-label','Reader workspace layout');

      control.innerHTML = `
        <span class="msg-readers-layout-label">Layout</span>
        <div class="msg-readers-layout-options">
          <button type="button"
            class="msg-readers-layout-option"
            data-msg-layout-choice="standard">Standard</button>
          <button type="button"
            class="msg-readers-layout-option"
            data-msg-layout-choice="desktop">Desktop</button>
        </div>
        <button type="button"
          class="msg-readers-layout-reset"
          data-msg-layout-reset
          hidden>Reset layout</button>`;

      const addButton = popover.querySelector('[data-msg-reader-add]');
      if (addButton) addButton.insertAdjacentElement('afterend', control);
      else popover.appendChild(control);

      control.addEventListener('click', (event) => {
        const reset = event.target.closest('[data-msg-layout-reset]');
        if (reset) {
          event.preventDefault();
          event.stopPropagation();
          resetDesktopLayout();
          ensureReadersMenuOption();
          return;
        }

        const button = event.target.closest('[data-msg-layout-choice]');
        if (!button) return;

        event.preventDefault();
        event.stopPropagation();

        const requested = String(button.dataset.msgLayoutChoice || 'standard');
        if (requested === 'desktop') {
          if (!desktopActive) {
            writeMode('desktop');
            const activated = activateDesktop();
            if (!activated) writeMode('standard');
          }
        } else {
          writeMode('standard');
          if (desktopActive) deactivateDesktop();
        }

        ensureReadersMenuOption();
      });
    }

    const standard = control.querySelector('[data-msg-layout-choice="standard"]');
    const desktop = control.querySelector('[data-msg-layout-choice="desktop"]');
    const reset = control.querySelector('[data-msg-layout-reset]');

    standard?.setAttribute('aria-pressed', desktopActive ? 'false' : 'true');
    desktop?.setAttribute('aria-pressed', desktopActive ? 'true' : 'false');
    standard?.classList.toggle('is-active', !desktopActive);
    desktop?.classList.toggle('is-active', desktopActive);

    if (!viewportAllowsDesktop()) {
      desktop?.setAttribute('disabled','');
      desktop?.setAttribute('title','Desktop layout is available on wider screens.');
    } else {
      desktop?.removeAttribute('disabled');
      desktop?.removeAttribute('title');
    }

    if (reset) reset.hidden = !desktopActive;

    return control;
  }


  function canvasBounds(canvas = desktopCanvas()) {
    const rect = canvas?.getBoundingClientRect?.();
    const width = Math.max(640, Math.round(rect?.width || app.clientWidth || window.innerWidth - 24));
    const height = Math.max(560, Math.round(rect?.height || window.innerHeight - 100));
    return { width, height };
  }

  function clampGeometry(geometry, canvas = desktopCanvas()) {
    const bounds = canvasBounds(canvas);
    const minWidth = Math.min(MIN_WINDOW_WIDTH, Math.max(280, bounds.width - 20));
    const minHeight = Math.min(MIN_WINDOW_HEIGHT, Math.max(220, bounds.height - TOOLBAR_CLEARANCE - 16));

    const width = Math.round(Math.max(
      minWidth,
      Math.min(Number(geometry?.width) || minWidth, bounds.width - 16)
    ));
    const height = Math.round(Math.max(
      minHeight,
      Math.min(Number(geometry?.height) || minHeight, bounds.height - TOOLBAR_CLEARANCE - 8)
    ));

    const maxLeft = Math.max(8, bounds.width - width - 8);
    const maxTop = Math.max(TOOLBAR_CLEARANCE, bounds.height - height - 8);

    return {
      left:Math.round(Math.max(8, Math.min(Number(geometry?.left) || 8, maxLeft))),
      top:Math.round(Math.max(TOOLBAR_CLEARANCE, Math.min(Number(geometry?.top) || TOOLBAR_CLEARANCE, maxTop))),
      width,
      height
    };
  }

  function defaultGeometry(key, index, canvas = desktopCanvas()) {
    const bounds = canvasBounds(canvas);
    const usableHeight = Math.max(420, bounds.height - TOOLBAR_CLEARANCE - 20);

    if (key === 'reader:1') {
      return clampGeometry({
        left:16,
        top:TOOLBAR_CLEARANCE + 8,
        width:Math.min(bounds.width - 70, Math.max(620, Math.round(bounds.width * .58))),
        height:Math.min(usableHeight, Math.max(520, Math.round(usableHeight * .9)))
      }, canvas);
    }

    const reader = /^reader:(\d+)$/.test(key);
    const cascade = Math.max(0, index - 1);
    const baseLeft = reader
      ? Math.round(bounds.width * .43) + (cascade % 4) * 28
      : 76 + (cascade % 5) * 34;
    const baseTop = TOOLBAR_CLEARANCE + 34 + (cascade % 5) * 28;

    return clampGeometry({
      left:baseLeft,
      top:baseTop,
      width:Math.min(bounds.width - 80, Math.max(reader ? 520 : 440, Math.round(bounds.width * (reader ? .50 : .43)))),
      height:Math.min(usableHeight - 20, Math.max(reader ? 500 : 420, Math.round(usableHeight * (reader ? .76 : .68))))
    }, canvas);
  }

  function savedGeometry(key) {
    const layout = readLayout();
    const value = layout.windows?.[key];
    return value && typeof value === 'object' ? value : null;
  }

  function persistGeometry(key, wrapper) {
    if (!key || !wrapper || wrapper.classList.contains('msg-desktop-window-maximized')) return;
    const layout = readLayout();
    const geometry = {
      left:parseFloat(wrapper.style.left) || 0,
      top:parseFloat(wrapper.style.top) || 0,
      width:parseFloat(wrapper.style.width) || wrapper.offsetWidth,
      height:parseFloat(wrapper.style.height) || wrapper.offsetHeight
    };
    layout.windows[key] = clampGeometry(geometry);
    writeLayout(layout);
  }

  function applyGeometry(wrapper, geometry, { persist = false } = {}) {
    if (!wrapper) return null;
    const next = clampGeometry(geometry);
    wrapper.style.left = `${next.left}px`;
    wrapper.style.top = `${next.top}px`;
    wrapper.style.width = `${next.width}px`;
    wrapper.style.height = `${next.height}px`;
    if (persist) persistGeometry(wrapper.dataset.msgDesktopWindowKey, wrapper);
    return next;
  }

  function bringToFront(wrapper) {
    if (!wrapper) return;
    zCounter += 1;
    wrapper.style.zIndex = String(zCounter);
    windows.forEach((entry) => entry.wrapper.classList.toggle('is-front', entry.wrapper === wrapper));
  }

  function notifyWindowResize(entry) {
    if (!entry) return;
    if (entry.key === 'reader:1') {
      try { window.dispatchEvent(new Event('resize')); } catch {}
      return;
    }
    const frame = entry.contentNode?.querySelector?.('iframe');
    if (frame?.contentWindow) {
      try { frame.contentWindow.dispatchEvent(new Event('resize')); } catch {}
    }
  }

  function titlebarHtml(label, canClose) {
    return `
      <div class="msg-desktop-titlebar" data-msg-desktop-drag-handle>
        <div class="msg-desktop-window-title">
          <span class="msg-desktop-window-dot" aria-hidden="true"></span>
          <strong data-msg-desktop-window-title>${escapeHtml(label)}</strong>
        </div>
        <div class="msg-desktop-window-actions">
          <button type="button" data-msg-desktop-maximize aria-label="Maximize window" title="Maximize">□</button>
          ${canClose ? '<button type="button" data-msg-desktop-close aria-label="Close window" title="Close">×</button>' : ''}
        </div>
      </div>`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function installResizeHandles(wrapper) {
    ['n','e','s','w','ne','nw','se','sw'].forEach((edge) => {
      const handle = document.createElement('div');
      handle.className = `msg-desktop-resize-handle msg-desktop-resize-${edge}`;
      handle.dataset.msgDesktopResize = edge;
      handle.setAttribute('aria-hidden','true');
      wrapper.appendChild(handle);
    });
  }

  function createWindow(key, label, contentNode, { primary = false } = {}) {
    const canvas = desktopCanvas();
    if (!canvas || !contentNode) return null;

    let entry = windows.get(key);
    if (entry?.wrapper?.isConnected) return entry;

    const wrapper = document.createElement('section');
    wrapper.className = `msg-desktop-window${primary ? ' msg-desktop-reader-one-window' : ''}`;
    wrapper.dataset.msgDesktopWindowKey = key;
    wrapper.setAttribute('aria-label', label);
    wrapper.innerHTML = titlebarHtml(label, true) + '<div class="msg-desktop-window-content"></div>';
    installResizeHandles(wrapper);

    const content = wrapper.querySelector('.msg-desktop-window-content');
    content.appendChild(contentNode);
    canvas.appendChild(wrapper);

    entry = { key, label, wrapper, contentNode, primary };
    windows.set(key, entry);

    const order = [...windows.keys()].indexOf(key);
    const initial = savedGeometry(key) || defaultGeometry(key, order, canvas);
    applyGeometry(wrapper, initial);
    bringToFront(wrapper);
    bindWindow(entry);
    return entry;
  }

  function closeDesktopWindow(entry) {
    if (!entry) return;

    if (entry.key === 'reader:1') {
      try {
        if (window.MSGWorkspaceExperiment?.closePrimaryReader?.()) {
          scheduleSync();
          return;
        }
      } catch {}
      return;
    }

    const escaped = window.CSS?.escape ? CSS.escape(entry.key) : entry.key.replace(/"/g,'\\"');
    const close = document.querySelector(`[data-msg-workspace-tab-close="${escaped}"]`);
    if (close) {
      close.click();
      scheduleSync();
    }
  }

  function toggleMaximize(entry) {
    if (!entry?.wrapper) return;
    const wrapper = entry.wrapper;
    const button = wrapper.querySelector('[data-msg-desktop-maximize]');

    if (wrapper.classList.contains('msg-desktop-window-maximized')) {
      const restore = wrapper.__msgDesktopRestoreGeometry || savedGeometry(entry.key) || defaultGeometry(entry.key, 0);
      wrapper.classList.remove('msg-desktop-window-maximized');
      applyGeometry(wrapper, restore);
      if (button) {
        button.textContent = '□';
        button.title = 'Maximize';
        button.setAttribute('aria-label','Maximize window');
      }
      persistGeometry(entry.key, wrapper);
    } else {
      wrapper.__msgDesktopRestoreGeometry = {
        left:parseFloat(wrapper.style.left) || wrapper.offsetLeft,
        top:parseFloat(wrapper.style.top) || wrapper.offsetTop,
        width:parseFloat(wrapper.style.width) || wrapper.offsetWidth,
        height:parseFloat(wrapper.style.height) || wrapper.offsetHeight
      };
      const bounds = canvasBounds();
      wrapper.classList.add('msg-desktop-window-maximized');
      wrapper.style.left = '8px';
      wrapper.style.top = `${TOOLBAR_CLEARANCE}px`;
      wrapper.style.width = `${Math.max(MIN_WINDOW_WIDTH, bounds.width - 16)}px`;
      wrapper.style.height = `${Math.max(MIN_WINDOW_HEIGHT, bounds.height - TOOLBAR_CLEARANCE - 8)}px`;
      if (button) {
        button.textContent = '❐';
        button.title = 'Restore';
        button.setAttribute('aria-label','Restore window');
      }
    }

    bringToFront(wrapper);
    notifyWindowResize(entry);
  }

  function bindWindow(entry) {
    const { wrapper } = entry;
    const titlebar = wrapper.querySelector('[data-msg-desktop-drag-handle]');

    wrapper.addEventListener('pointerdown', () => bringToFront(wrapper), true);

    titlebar?.addEventListener('dblclick', (event) => {
      if (event.target instanceof Element && event.target.closest('button')) return;
      event.preventDefault();
      toggleMaximize(entry);
    });

    titlebar?.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest('button')) return;
      if (wrapper.classList.contains('msg-desktop-window-maximized')) return;

      const geometry = {
        left:parseFloat(wrapper.style.left) || wrapper.offsetLeft,
        top:parseFloat(wrapper.style.top) || wrapper.offsetTop,
        width:parseFloat(wrapper.style.width) || wrapper.offsetWidth,
        height:parseFloat(wrapper.style.height) || wrapper.offsetHeight
      };

      dragState = {
        entry,
        pointerId:event.pointerId,
        startX:event.clientX,
        startY:event.clientY,
        geometry
      };
      wrapper.classList.add('msg-desktop-window-moving');
      document.body.classList.add('msg-desktop-dragging');
      bringToFront(wrapper);
      try { titlebar.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
    });

    titlebar?.addEventListener('pointermove', (event) => {
      if (!dragState || dragState.entry !== entry || dragState.pointerId !== event.pointerId) return;
      applyGeometry(wrapper, {
        ...dragState.geometry,
        left:dragState.geometry.left + (event.clientX - dragState.startX),
        top:dragState.geometry.top + (event.clientY - dragState.startY)
      });
      event.preventDefault();
    });

    const finishDrag = (event) => {
      if (!dragState || dragState.entry !== entry || dragState.pointerId !== event.pointerId) return;
      try { titlebar?.releasePointerCapture(event.pointerId); } catch {}
      wrapper.classList.remove('msg-desktop-window-moving');
      document.body.classList.remove('msg-desktop-dragging');
      persistGeometry(entry.key, wrapper);
      dragState = null;
      notifyWindowResize(entry);
    };
    titlebar?.addEventListener('pointerup', finishDrag);
    titlebar?.addEventListener('pointercancel', finishDrag);

    wrapper.querySelectorAll('[data-msg-desktop-resize]').forEach((handle) => {
      handle.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (wrapper.classList.contains('msg-desktop-window-maximized')) return;
        resizeState = {
          entry,
          edge:handle.dataset.msgDesktopResize,
          pointerId:event.pointerId,
          startX:event.clientX,
          startY:event.clientY,
          geometry:{
            left:parseFloat(wrapper.style.left) || wrapper.offsetLeft,
            top:parseFloat(wrapper.style.top) || wrapper.offsetTop,
            width:parseFloat(wrapper.style.width) || wrapper.offsetWidth,
            height:parseFloat(wrapper.style.height) || wrapper.offsetHeight
          }
        };
        wrapper.classList.add('msg-desktop-window-resizing');
        document.body.classList.add('msg-desktop-resizing');
        bringToFront(wrapper);
        try { handle.setPointerCapture(event.pointerId); } catch {}
        event.preventDefault();
        event.stopPropagation();
      });

      handle.addEventListener('pointermove', (event) => {
        if (!resizeState || resizeState.entry !== entry || resizeState.pointerId !== event.pointerId) return;
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

        // Preserve the opposite edge while honoring the minimum dimensions.
        if (next.width < MIN_WINDOW_WIDTH) {
          if (edge.includes('w')) next.left -= MIN_WINDOW_WIDTH - next.width;
          next.width = MIN_WINDOW_WIDTH;
        }
        if (next.height < MIN_WINDOW_HEIGHT) {
          if (edge.includes('n')) next.top -= MIN_WINDOW_HEIGHT - next.height;
          next.height = MIN_WINDOW_HEIGHT;
        }

        applyGeometry(wrapper, next);
        notifyWindowResize(entry);
        event.preventDefault();
      });

      const finishResize = (event) => {
        if (!resizeState || resizeState.entry !== entry || resizeState.pointerId !== event.pointerId) return;
        try { handle.releasePointerCapture(event.pointerId); } catch {}
        wrapper.classList.remove('msg-desktop-window-resizing');
        document.body.classList.remove('msg-desktop-resizing');
        persistGeometry(entry.key, wrapper);
        resizeState = null;
        notifyWindowResize(entry);
      };
      handle.addEventListener('pointerup', finishResize);
      handle.addEventListener('pointercancel', finishResize);
    });

    wrapper.querySelector('[data-msg-desktop-maximize]')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleMaximize(entry);
    });

    wrapper.querySelector('[data-msg-desktop-close]')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDesktopWindow(entry);
    });
  }

  function ensureCanvas(shell) {
    let canvas = desktopCanvas(shell);
    if (canvas) return canvas;

    canvas = document.createElement('div');
    canvas.className = 'msg-desktop-canvas';
    // Layout controls live in Readers -> Layout. No persistent canvas toolbar.
    shell.appendChild(canvas);
    return canvas;
  }

  function updateCanvasSize(shell = workspaceShell()) {
    if (!desktopActive || !shell) return;
    const rect = shell.getBoundingClientRect();
    const top = Math.max(0, rect.top);
    const height = Math.max(620, Math.round(window.innerHeight - top - 12));
    shell.style.setProperty('display','block','important');
    shell.style.setProperty('grid-template-columns','none','important');
    shell.style.setProperty('width','100%','important');
    shell.style.setProperty('max-width','none','important');
    shell.style.setProperty('height',`${height}px`,'important');
    shell.style.setProperty('min-height',`${height}px`,'important');
    shell.style.setProperty('max-height','none','important');

    const canvas = desktopCanvas(shell);
    if (canvas) {
      canvas.style.height = `${height}px`;
      canvas.style.minHeight = `${height}px`;
    }
  }

  function wrapPrimary(shell, canvas) {
    const primary = shell.querySelector('.msg-workspace-primary');
    if (!primary) return null;

    let entry = windows.get('reader:1');

    // The Standard workspace can briefly reparent the live Reader while a
    // Desktop window is closing. A connected wrapper is not enough: it must
    // still own the current live Reader node. If it does not, discard only the
    // stale wrapper record and immediately wrap the same live Reader again.
    if (
      entry?.wrapper?.isConnected &&
      entry.contentNode === primary &&
      entry.wrapper.contains(primary)
    ) {
      return entry;
    }

    if (entry) {
      try { entry.wrapper?.remove(); } catch {}
      windows.delete('reader:1');
    }

    entry = createWindow('reader:1', panelLabel(primary, 'reader:1'), primary, { primary:true });
    if (entry) {
      entry.wrapper.hidden = shell.classList.contains('msg-primary-reader-hidden');
    }
    return entry;
  }

  function wrapPanels(shell, canvas) {
    const nodes = [...shell.querySelectorAll('.msg-workspace-panel')];
    nodes.forEach((node) => {
      const key = panelKey(node);
      if (!key) return;

      let entry = windows.get(key);
      const entryOwnsLiveNode = Boolean(
        entry?.wrapper?.isConnected &&
        entry.contentNode === node &&
        entry.wrapper.contains(node)
      );

      if (!entryOwnsLiveNode) {
        if (entry) {
          try { entry.wrapper?.remove(); } catch {}
          windows.delete(key);
        }
        entry = createWindow(key, panelLabel(node, key), node, { primary:false });
      }

      try { node.inert = false; } catch {}
      node.setAttribute('aria-hidden','false');
      entry?.wrapper?.removeAttribute('hidden');
    });
  }

  function cleanupDeadWindows() {
    windows.forEach((entry, key) => {
      if (!entry.wrapper?.isConnected) {
        windows.delete(key);
        return;
      }
      if (!entry.contentNode?.isConnected || !entry.wrapper.contains(entry.contentNode)) {
        entry.wrapper.remove();
        windows.delete(key);
      }
    });
  }

  function refreshWindowTitles() {
    windows.forEach((entry) => {
      const label = panelLabel(entry.contentNode, entry.key);
      entry.label = label;
      entry.wrapper.setAttribute('aria-label', label);
      const node = entry.wrapper.querySelector('[data-msg-desktop-window-title]');
      if (node && node.textContent !== label) node.textContent = label;
    });
  }

  function syncDesktop() {
    const shell = workspaceShell();
    ensureModeButton(shell);
    ensureReadersMenuOption();

    if (!desktopActive) {
      if (readMode() === 'desktop' && shellIsOpen(shell) && viewportAllowsDesktop()) {
        activateDesktop();
      }
      return;
    }

    if (!shell || shell.classList.contains('is-closed')) {
      deactivateDesktop({ preserveMode:true });
      return;
    }

    if (!viewportAllowsDesktop()) {
      deactivateDesktop({ preserveMode:true });
      return;
    }

    const canvas = ensureCanvas(shell);
    updateCanvasSize(shell);

    // A close action can cause the underlying Standard workspace to reparent a
    // live pane. Remove stale window ownership first, then rebuild around the
    // same live nodes in this very sync pass.
    cleanupDeadWindows();
    wrapPrimary(shell, canvas);
    wrapPanels(shell, canvas);
    cleanupDeadWindows();
    refreshWindowTitles();

    const primary = windows.get('reader:1');
    if (primary?.wrapper) {
      primary.wrapper.hidden = shell.classList.contains('msg-primary-reader-hidden');
    }

    // Existing workspace activation marks non-active tabs inert. Desktop mode
    // deliberately exposes all live panes at once while leaving those classes
    // intact so Standard mode can be restored without reconstructing state.
    windows.forEach((entry) => {
      if (!entry.primary) {
        try { entry.contentNode.inert = false; } catch {}
        entry.contentNode.setAttribute('aria-hidden','false');
      }
    });

    ensureModeButton(shell);
  }

  function activateDesktop() {
    const shell = workspaceShell();
    if (!shellIsOpen(shell)) return false;
    if (!viewportAllowsDesktop()) {
      window.alert('Desktop Workspace is available on wider screens. Standard Workspace remains active here.');
      return false;
    }
    if (desktopActive) {
      syncDesktop();
      return true;
    }

    savedShellStyle = shell.getAttribute('style');
    desktopActive = true;
    document.body.classList.add('msg-desktop-workspace-active');
    shell.classList.add('msg-desktop-workspace');

    const canvas = ensureCanvas(shell);
    updateCanvasSize(shell);
    wrapPrimary(shell, canvas);
    wrapPanels(shell, canvas);
    refreshWindowTitles();
    ensureModeButton(shell);
    ensureReadersMenuOption();
    try { window.dispatchEvent(new Event('resize')); } catch {}
    return true;
  }

  function restorePanelStandardState(node) {
    if (!node) return;
    const active = node.classList.contains('msg-workspace-panel-active');
    try { node.inert = !active; } catch {}
    node.setAttribute('aria-hidden', active ? 'false' : 'true');
  }

  function deactivateDesktop({ preserveMode = false } = {}) {
    if (!desktopActive) {
      if (!preserveMode) writeMode('standard');
      return false;
    }

    const shell = workspaceShell();
    if (!shell) {
      desktopActive = false;
      document.body.classList.remove('msg-desktop-workspace-active','msg-desktop-dragging','msg-desktop-resizing');
      windows.clear();
      return false;
    }

    const divider = shell.querySelector('.msg-workspace-divider');
    const body = panelBody(shell);

    const primaryEntry = windows.get('reader:1');
    if (primaryEntry?.contentNode?.isConnected) {
      shell.insertBefore(primaryEntry.contentNode, divider || shell.firstChild);
    }

    [...windows.values()].forEach((entry) => {
      if (entry.key === 'reader:1') return;
      if (entry.contentNode?.isConnected && body) {
        body.appendChild(entry.contentNode);
        restorePanelStandardState(entry.contentNode);
      }
    });

    desktopCanvas(shell)?.remove();
    windows.clear();
    shell.classList.remove('msg-desktop-workspace');
    document.body.classList.remove('msg-desktop-workspace-active','msg-desktop-dragging','msg-desktop-resizing');

    if (savedShellStyle == null || savedShellStyle === '') shell.removeAttribute('style');
    else shell.setAttribute('style', savedShellStyle);
    savedShellStyle = null;
    desktopActive = false;

    if (!preserveMode) writeMode('standard');
    ensureModeButton(shell);
    ensureReadersMenuOption();
    try { window.dispatchEvent(new Event('resize')); } catch {}
    window.requestAnimationFrame(() => {
      shell.querySelectorAll('.msg-workspace-page-frame').forEach((frame) => {
        try { frame.contentWindow?.dispatchEvent?.(new Event('resize')); } catch {}
      });
    });
    return true;
  }

  function resetDesktopLayout() {
    clearLayout();
    if (!desktopActive) return true;
    const canvas = desktopCanvas();
    let index = 0;
    windows.forEach((entry) => {
      entry.wrapper.classList.remove('msg-desktop-window-maximized');
      entry.wrapper.__msgDesktopRestoreGeometry = null;
      const button = entry.wrapper.querySelector('[data-msg-desktop-maximize]');
      if (button) {
        button.textContent = '□';
        button.title = 'Maximize';
        button.setAttribute('aria-label','Maximize window');
      }
      applyGeometry(entry.wrapper, defaultGeometry(entry.key, index, canvas), { persist:true });
      index += 1;
      notifyWindowResize(entry);
    });
    return true;
  }

  function scheduleSync() {
    // Workspace close/reparent work can finish on a later task/frame. Keep this
    // deliberately finite (no observer / no polling) but cover the late close
    // path so Desktop repairs an orphaned pane automatically.
    [0, 90, 260, 650, 1200].forEach((delay) => {
      window.setTimeout(syncDesktop, delay);
    });
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;

    const modeButton = event.target.closest('[data-msg-desktop-toggle]');
    if (modeButton) return;

    if (event.target.closest(
      '[data-msg-reader-add], [data-msg-reader-select], .msg-readers-menu summary, [data-msg-workspace-open], [data-msg-workspace-tab], [data-msg-workspace-tab-close], [data-msg-workspace-close], [data-action], [data-read], [data-test]'
    )) {
      scheduleSync();
    }
  }, true);

  document.addEventListener('marksetgo:document-available', scheduleSync);
  document.addEventListener('marksetgo:workspace-layout-mode', scheduleSync);
  window.addEventListener('pageshow', scheduleSync);
  window.addEventListener('resize', () => {
    if (!desktopActive) {
      scheduleSync();
      return;
    }
    if (!viewportAllowsDesktop()) {
      deactivateDesktop({ preserveMode:true });
      return;
    }
    updateCanvasSize();
    windows.forEach((entry) => {
      if (!entry.wrapper.classList.contains('msg-desktop-window-maximized')) {
        applyGeometry(entry.wrapper, {
          left:parseFloat(entry.wrapper.style.left),
          top:parseFloat(entry.wrapper.style.top),
          width:parseFloat(entry.wrapper.style.width),
          height:parseFloat(entry.wrapper.style.height)
        });
      } else {
        const bounds = canvasBounds();
        entry.wrapper.style.left = '8px';
        entry.wrapper.style.top = `${TOOLBAR_CLEARANCE}px`;
        entry.wrapper.style.width = `${bounds.width - 16}px`;
        entry.wrapper.style.height = `${bounds.height - TOOLBAR_CLEARANCE - 8}px`;
      }
      notifyWindowResize(entry);
    });
  });

  // Finite startup checks only; no DOM observer.
  [0,120,350,800,1600].forEach((delay) => window.setTimeout(syncDesktop, delay));

  window.MSGDesktopWorkspace = Object.freeze({
    activate:() => {
      writeMode('desktop');
      return activateDesktop();
    },
    standard:() => {
      writeMode('standard');
      return deactivateDesktop();
    },
    toggle:() => desktopActive
      ? (writeMode('standard'), deactivateDesktop())
      : (writeMode('desktop'), activateDesktop()),
    reset:resetDesktopLayout,
    sync:syncDesktop,
    get active(){ return desktopActive; },
    get mode(){ return desktopActive ? 'desktop' : 'standard'; },
    windows:() => [...windows.values()].map((entry) => ({
      key:entry.key,
      label:entry.label,
      maximized:entry.wrapper.classList.contains('msg-desktop-window-maximized'),
      geometry:{
        left:parseFloat(entry.wrapper.style.left) || 0,
        top:parseFloat(entry.wrapper.style.top) || 0,
        width:parseFloat(entry.wrapper.style.width) || entry.wrapper.offsetWidth,
        height:parseFloat(entry.wrapper.style.height) || entry.wrapper.offsetHeight
      }
    }))
  });
})();
