'use strict';

(() => {
  const STORAGE_KEY = 'markSetGoExplorerVisualDesignerV1';
  const CONFIG_VERSION = 1; // v1.1 remains backward-compatible with saved v1 designs
  const MANAGED_ATTR = 'data-msg-vd-selectable';

  const TARGETS = [
    { id:'workspace', label:'Workspace', virtual:true, group:'Environment' },
    { id:'backdrop', label:'Antique Reader Backdrop', selector:'.msg-vd-antique-backdrop', group:'Environment', backdrop:true },
    { id:'title', label:'Reader title', selector:'.reader-page-panel > .reader-title-row', group:'Reader' },
    { id:'controls', label:'Top controls', selector:'.reader-page-panel > .reader-pane-controls', group:'Reader' },
    { id:'topics', label:'My Topics', selector:'.reader-page-panel .navigation-pane', group:'Panes' },
    { id:'reader', label:'Reader frame', selector:'.reader-page-panel #reader-frame', group:'Panes' },
    { id:'footer', label:'Page controls', selector:'.reader-page-panel .reader-viewer-footer', group:'Reader' },
    { id:'playback', label:'Start / Pause', selector:'.reader-page-panel .playback-controls', group:'Reader' },
    { id:'companion', label:'Companion pane', selector:'.reader-page-panel .mark-companion-panel', group:'Panes' },
    { id:'left-art', label:'Left artwork', selector:'.explorer-world-art__left', group:'Artwork', art:true },
    { id:'right-art', label:'Right artwork', selector:'.explorer-world-art__right', group:'Artwork', art:true },
    { id:'top-art', label:'Top panorama', selector:'.explorer-world-art__top', group:'Artwork', art:true }
  ];

  const STYLE_CONTROLS = {
    title: [
      range('marginTop','Top spacing',-30,60,1,'px','.reader-page-panel > .reader-title-row','margin-top'),
      range('marginBottom','Bottom spacing',-20,60,1,'px','.reader-page-panel > .reader-title-row','margin-bottom'),
      range('fontSize','Title size',14,44,1,'px','.reader-title-copy h1','font-size'),
      color('titleColor','Title color','.reader-title-copy h1','color')
    ],
    controls: [
      range('marginTop','Top spacing',-20,50,1,'px','.reader-page-panel > .reader-pane-controls','margin-top'),
      range('marginBottom','Bottom spacing',-20,50,1,'px','.reader-page-panel > .reader-pane-controls','margin-bottom'),
      range('gap','Button spacing',0,26,1,'px','.reader-page-panel .reader-pane-buttons','gap'),
      range('minHeight','Row height',24,70,1,'px','.reader-page-panel > .reader-pane-controls','min-height')
    ],
    topics: [
      range('width','Pane width',180,430,2,'navWidth','#reader-layout','--navigation-width'),
      color('background','Background','.reader-page-panel .navigation-pane','background'),
      color('borderColor','Border color','.reader-page-panel .navigation-pane','border-color'),
      range('borderWidth','Border width',0,6,1,'px','.reader-page-panel .navigation-pane','border-width'),
      range('radius','Corner radius',0,28,1,'px','.reader-page-panel .navigation-pane','border-radius'),
      range('shadow','Shadow',0,40,1,'shadow','.reader-page-panel .navigation-pane','box-shadow')
    ],
    reader: [
      range('width','Frame width',70,100,1,'%', '.reader-page-panel #reader-frame','width'),
      range('marginTop','Top spacing',-30,50,1,'px','.reader-page-panel #reader-frame','margin-top'),
      color('background','Frame background','.reader-page-panel #reader-frame','background'),
      color('borderColor','Border color','.reader-page-panel #reader-frame','border-color'),
      range('borderWidth','Border width',0,7,1,'px','.reader-page-panel #reader-frame','border-width'),
      range('radius','Corner radius',0,28,1,'px','.reader-page-panel #reader-frame','border-radius'),
      range('shadow','Shadow',0,45,1,'shadow','.reader-page-panel #reader-frame','box-shadow')
    ],
    footer: [
      range('marginTop','Top spacing',-20,50,1,'px','.reader-page-panel .reader-viewer-footer','margin-top'),
      range('paddingY','Vertical padding',0,28,1,'paddingY','.reader-page-panel .reader-viewer-footer','padding'),
      color('background','Background','.reader-page-panel .reader-viewer-footer','background')
    ],
    playback: [
      range('marginTop','Top spacing',-20,80,1,'px','.reader-page-panel .playback-controls','margin-top'),
      range('marginBottom','Bottom spacing',-20,60,1,'px','.reader-page-panel .playback-controls','margin-bottom'),
      color('background','Background','.reader-page-panel .playback-controls','background')
    ],
    companion: [
      range('width','Pane width',260,560,5,'wordWidth','#reader-layout','--word-panel-width'),
      color('background','Main body','.reader-page-panel .mark-companion-panel .askmark-premium','background-color'),
      color('headerBackground','Header','.reader-page-panel .mark-companion-panel .askmark-hero','background'),
      color('composerBackground','Composer','.reader-page-panel .mark-companion-panel .askmark-composer','background'),
      color('borderColor','Frame border','.reader-page-panel .mark-companion-panel','border-color'),
      range('radius','Corner radius',0,28,1,'px','.reader-page-panel .mark-companion-panel','border-radius'),
      range('shadow','Shadow',0,40,1,'shadow','.reader-page-panel .mark-companion-panel','box-shadow')
    ]
  };

  const ART_CONTROLS = [
    range('x','Move left / right',-350,350,2,'px',null,null),
    range('y','Move up / down',-350,350,2,'px',null,null),
    range('width','Artwork width',90,600,2,'px',null,null),
    range('scale','Scale',50,180,1,'%',null,null),
    range('opacity','Opacity',10,100,1,'%',null,null),
    check('visible','Show artwork'),
    text('src','Image URL'),
    fileControl('imageFile','Replace with image')
  ];

  const BACKDROP_CONTROLS = [
    range('x','Move left / right',-500,500,2,'px',null,null),
    range('y','Move up / down',-450,450,2,'px',null,null),
    range('width','Backdrop width',40,140,1,'%',null,null),
    range('height','Backdrop height',35,140,1,'%',null,null),
    range('opacity','Opacity',0,100,1,'%',null,null),
    color('color','Antique tint',null,null),
    range('borderWidth','Border width',0,8,1,'px',null,null),
    color('borderColor','Border color',null,null),
    range('radius','Corner radius',0,60,1,'px',null,null),
    range('shadow','Shadow',0,60,1,'shadow',null,null),
    check('visible','Show backdrop')
  ];

  const WORKSPACE_CONTROLS = [
    colorVar('workspaceColor','Page background','--msg-vd-workspace-color'),
    colorVar('worldColor','Center work surface','--msg-vd-world-color'),
    colorVar('accentColor','Primary accent','--msg-vd-accent-color'),
    rangeVar('overlayOpacity','Center overlay',0,100,1,'%', '--msg-vd-overlay-opacity')
  ];

  let launcher = null;
  let panel = null;
  let selectedId = null;
  let selectedElement = null;
  let config = loadConfig();
  let sessionStartConfig = clone(config);
  let undoStack = [];
  let editBaseline = null;
  let dragState = null;
  let backdropHandle = null;

  function range(key,label,min,max,step,unit,selector,prop) {
    return { type:'range', key,label,min,max,step,unit,selector,prop };
  }
  function color(key,label,selector,prop) { return { type:'color', key,label,selector,prop }; }
  function colorVar(key,label,variable) { return { type:'colorVar', key,label,variable }; }
  function rangeVar(key,label,min,max,step,unit,variable) { return { type:'rangeVar', key,label,min,max,step,unit,variable }; }
  function check(key,label) { return { type:'check', key,label }; }
  function text(key,label) { return { type:'text', key,label }; }
  function fileControl(key,label) { return { type:'file', key,label }; }

  function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
  function blankConfig() { return { version:CONFIG_VERSION, targets:{}, globals:{} }; }
  function loadConfig() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!raw || raw.version !== CONFIG_VERSION) return blankConfig();
      raw.targets ||= {};
      raw.globals ||= {};
      return raw;
    } catch { return blankConfig(); }
  }

  function isExplorer() {
    return document.documentElement.dataset.msgExperienceTheme === 'explorer';
  }

  function targetById(id) { return TARGETS.find((item) => item.id === id) || null; }
  function targetElement(target) {
    if (target?.virtual) return document.documentElement;
    if (target?.backdrop) return ensureBackdrop();
    return document.querySelector(target?.selector || '');
  }

  function ensureBackdrop() {
    const world = document.querySelector('.explorer-world-art');
    if (!world) return null;
    let backdrop = world.querySelector('.msg-vd-antique-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'msg-vd-antique-backdrop';
      backdrop.setAttribute('aria-hidden','true');
      world.insertBefore(backdrop,world.firstChild);
    }
    world.classList.add('msg-vd-designer-backdrop-active');
    return backdrop;
  }

  function ensureBackdropHandle() {
    if (backdropHandle) return backdropHandle;
    backdropHandle = document.createElement('div');
    backdropHandle.id = 'msg-vd-backdrop-handle';
    backdropHandle.dataset.vdBackdropHandle = '1';
    backdropHandle.hidden = true;
    backdropHandle.setAttribute('aria-label','Drag Antique Reader Backdrop');
    backdropHandle.title = 'Drag to move the Antique Reader Backdrop';
    document.body.appendChild(backdropHandle);
    return backdropHandle;
  }

  function hideBackdropHandle() {
    if (backdropHandle) backdropHandle.hidden = true;
  }

  function syncBackdropHandle() {
    const handle = ensureBackdropHandle();
    const backdrop = ensureBackdrop();
    const shouldShow = Boolean(
      backdrop &&
      isExplorer() &&
      selectedId === 'backdrop' &&
      document.body.classList.contains('msg-vd-design-mode') &&
      !document.body.classList.contains('msg-vd-preview-mode') &&
      panel && !panel.hidden &&
      getComputedStyle(backdrop).display !== 'none'
    );
    if (!shouldShow) {
      handle.hidden = true;
      return;
    }
    const rect = backdrop.getBoundingClientRect();
    handle.hidden = false;
    handle.style.left = `${Math.round(rect.left)}px`;
    handle.style.top = `${Math.round(rect.top)}px`;
    handle.style.width = `${Math.max(1,Math.round(rect.width))}px`;
    handle.style.height = `${Math.max(1,Math.round(rect.height))}px`;
  }

  function ensureUI() {
    ensureBackdrop();
    ensureBackdropHandle();
    if (!launcher) {
      launcher = document.createElement('button');
      launcher.id = 'msg-explorer-design-launcher';
      launcher.type = 'button';
      launcher.textContent = '✦ Design';
      launcher.title = 'Visually edit the Explorer interface';
      launcher.addEventListener('click', openDesigner);
      document.body.appendChild(launcher);
    }

    if (!panel) {
      panel = document.createElement('aside');
      panel.id = 'msg-explorer-visual-designer';
      panel.hidden = true;
      panel.setAttribute('aria-label','Explorer visual designer');
      panel.innerHTML = `
        <div class="msg-vd-head">
          <div class="msg-vd-head-copy"><strong>Explorer Designer</strong><small>Click the page or choose a layer</small></div>
          <button type="button" data-vd-preview title="Preview without editor outlines">◉</button>
          <button type="button" data-vd-close aria-label="Close designer">×</button>
        </div>
        <div class="msg-vd-toolbar">
          <button type="button" data-vd-undo disabled>Undo</button>
          <button type="button" data-vd-reset-selected disabled>Reset layer</button>
          <button type="button" data-vd-export>Export</button>
          <button type="button" data-vd-import>Import</button>
          <input type="file" accept="application/json" data-vd-import-file hidden>
        </div>
        <div class="msg-vd-scroll">
          <section class="msg-vd-section">
            <div class="msg-vd-section-title"><span>Layers</span><span>select one</span></div>
            <div class="msg-vd-layers" data-vd-layers></div>
          </section>
          <section class="msg-vd-section">
            <div class="msg-vd-section-title"><span>Inspector</span><span data-vd-selection-name>nothing selected</span></div>
            <div data-vd-inspector><p class="msg-vd-inspector-empty">Choose a layer above or click directly on the live Explorer interface.</p></div>
          </section>
        </div>
        <div>
          <div class="msg-vd-status" data-vd-status>Changes are live but not saved yet.</div>
          <div class="msg-vd-bottom-actions">
            <button type="button" class="msg-vd-danger" data-vd-reset-all>Reset Explorer</button>
            <button type="button" class="msg-vd-save" data-vd-save>Save design</button>
          </div>
        </div>`;
      document.body.appendChild(panel);
      bindUI();
    }
    refreshLayers();
  }

  function bindUI() {
    panel.querySelector('[data-vd-close]')?.addEventListener('click', closeDesigner);
    panel.querySelector('[data-vd-preview]')?.addEventListener('click', togglePreview);
    panel.querySelector('[data-vd-undo]')?.addEventListener('click', undo);
    panel.querySelector('[data-vd-reset-selected]')?.addEventListener('click', resetSelected);
    panel.querySelector('[data-vd-reset-all]')?.addEventListener('click', resetAll);
    panel.querySelector('[data-vd-save]')?.addEventListener('click', save);
    panel.querySelector('[data-vd-export]')?.addEventListener('click', exportConfig);
    panel.querySelector('[data-vd-import]')?.addEventListener('click', () => panel.querySelector('[data-vd-import-file]')?.click());
    panel.querySelector('[data-vd-import-file]')?.addEventListener('change', importConfig);
  }

  function openDesigner() {
    ensureUI();
    panel.hidden = false;
    launcher.textContent = '✦ Designing';
    document.body.classList.add('msg-vd-design-mode');
    document.body.classList.remove('msg-vd-preview-mode');
    markSelectableElements();
    if (!selectedId) selectTarget('reader');
    setStatus('Design mode is live. Click a layer or the page.', false);
  }

  function closeDesigner() {
    panel.hidden = true;
    launcher.textContent = '✦ Design';
    document.body.classList.remove('msg-vd-design-mode','msg-vd-preview-mode');
    clearSelectionOutline();
    clearSelectableMarks();
    hideBackdropHandle();
  }

  function togglePreview() {
    const preview = document.body.classList.toggle('msg-vd-preview-mode');
    if (preview) {
      panel.hidden = true;
      launcher.textContent = '✦ Edit';
      clearSelectionOutline();
      hideBackdropHandle();
    } else {
      panel.hidden = false;
      launcher.textContent = '✦ Designing';
      applySelectionOutline();
      syncBackdropHandle();
    }
  }

  function markSelectableElements() {
    TARGETS.filter((target) => !target.virtual).forEach((target) => {
      const el = targetElement(target);
      if (el) el.setAttribute(MANAGED_ATTR,'1');
    });
  }
  function clearSelectableMarks() {
    document.querySelectorAll(`[${MANAGED_ATTR}]`).forEach((el) => el.removeAttribute(MANAGED_ATTR));
  }

  function refreshLayers() {
    if (!panel) return;
    const host = panel.querySelector('[data-vd-layers]');
    if (!host) return;
    host.innerHTML = TARGETS.map((target) => {
      const exists = Boolean(targetElement(target));
      return `<button type="button" class="msg-vd-layer ${target.id === selectedId ? 'is-selected' : ''}" data-vd-layer="${target.id}" ${exists ? '' : 'disabled'}>${target.label}</button>`;
    }).join('');
    host.querySelectorAll('[data-vd-layer]').forEach((button) => button.addEventListener('click', () => selectTarget(button.dataset.vdLayer)));
  }

  function selectTarget(id) {
    const target = targetById(id);
    if (!target) return;
    const element = targetElement(target);
    if (!element) {
      setStatus(`${target.label} is not visible on this page.`, false);
      refreshLayers();
      return;
    }
    clearSelectionOutline();
    selectedId = id;
    selectedElement = target.virtual ? null : element;
    applySelectionOutline();
    refreshLayers();
    renderInspector();
    panel.querySelector('[data-vd-reset-selected]')?.removeAttribute('disabled');
  }

  function clearSelectionOutline() {
    document.querySelectorAll('.msg-vd-selected').forEach((el) => el.classList.remove('msg-vd-selected'));
    hideBackdropHandle();
  }
  function applySelectionOutline() {
    if (document.body.classList.contains('msg-vd-preview-mode')) return;
    const target = targetById(selectedId);
    const element = targetElement(target);
    if (element && !target?.virtual) element.classList.add('msg-vd-selected');
    if (target?.backdrop) syncBackdropHandle();
  }

  function controlsForTarget(target) {
    if (!target) return [];
    if (target.virtual) return WORKSPACE_CONTROLS;
    if (target.backdrop) return BACKDROP_CONTROLS;
    if (target.art) return ART_CONTROLS;
    return STYLE_CONTROLS[target.id] || [];
  }

  function renderInspector() {
    if (!panel) return;
    const target = targetById(selectedId);
    const host = panel.querySelector('[data-vd-inspector]');
    const name = panel.querySelector('[data-vd-selection-name]');
    if (!target || !host) return;
    if (name) name.textContent = target.label;

    const controls = controlsForTarget(target);
    if (!controls.length) {
      host.innerHTML = '<p class="msg-vd-inspector-empty">This layer is selectable but has no editable properties in v1.</p>';
      return;
    }

    host.innerHTML = controls.map((control) => controlMarkup(target, control)).join('');
    bindInspectorControls(target, controls, host);
  }

  function controlMarkup(target, control) {
    const value = controlValue(target, control);
    if (control.type === 'range' || control.type === 'rangeVar') {
      return `<div class="msg-vd-control"><label>${control.label}</label><output class="msg-vd-control-output" data-vd-output="${control.key}">${formatValue(control,value)}</output><input type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${value}" data-vd-control="${control.key}"></div>`;
    }
    if (control.type === 'color' || control.type === 'colorVar') {
      return `<div class="msg-vd-control"><label>${control.label}</label><input type="color" value="${normalizeColor(value)}" data-vd-control="${control.key}"></div>`;
    }
    if (control.type === 'check') {
      return `<div class="msg-vd-control"><label class="msg-vd-check"><input type="checkbox" ${value !== false ? 'checked' : ''} data-vd-control="${control.key}">${control.label}</label></div>`;
    }
    if (control.type === 'text') {
      return `<div class="msg-vd-control"><label>${control.label}</label><input type="text" value="${escapeAttr(value || '')}" placeholder="/assets/explorer/... or https://..." data-vd-control="${control.key}"></div>`;
    }
    if (control.type === 'file') {
      return `<div class="msg-vd-control"><label>${control.label}</label><div class="msg-vd-file-row"><button type="button" data-vd-file-pick>Choose image…</button><button type="button" data-vd-image-original>Use original</button><input type="file" accept="image/*" data-vd-image-file hidden></div></div>`;
    }
    return '';
  }

  function bindInspectorControls(target, controls, host) {
    controls.forEach((control) => {
      if (control.type === 'file') return;
      const input = host.querySelector(`[data-vd-control="${control.key}"]`);
      if (!input) return;
      input.addEventListener('focus', beginEdit, { once:false });
      input.addEventListener('pointerdown', beginEdit, { once:false });
      const eventName = control.type === 'text' ? 'change' : 'input';
      input.addEventListener(eventName, () => {
        const value = inputValue(control,input);
        setControlValue(target,control,value);
        const output = host.querySelector(`[data-vd-output="${control.key}"]`);
        if (output) output.textContent = formatValue(control,value);
        markDirty();
      });
      input.addEventListener('change', commitEdit);
    });

    const fileInput = host.querySelector('[data-vd-image-file]');
    host.querySelector('[data-vd-file-pick]')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', (event) => replaceImageFile(target,event));
    host.querySelector('[data-vd-image-original]')?.addEventListener('click', () => restoreOriginalImage(target));
  }

  function beginEdit() {
    if (!editBaseline) editBaseline = clone(config);
  }
  function commitEdit() {
    if (!editBaseline) return;
    undoStack.push(editBaseline);
    editBaseline = null;
    updateUndoState();
  }
  function pushUndoSnapshot() {
    undoStack.push(clone(config));
    updateUndoState();
  }

  function controlValue(target, control) {
    const bucket = target.virtual ? config.globals : (config.targets[target.id] ||= {});
    if (Object.prototype.hasOwnProperty.call(bucket,control.key)) return bucket[control.key];

    if (target.backdrop) {
      const el = targetElement(target);
      const parent = el?.parentElement;
      const computed = el ? getComputedStyle(el) : null;
      if (control.key === 'x' || control.key === 'y') return 0;
      if (control.key === 'width') return parent?.clientWidth ? Math.round((el.getBoundingClientRect().width / parent.clientWidth) * 100) : 100;
      if (control.key === 'height') return parent?.clientHeight ? Math.round((el.getBoundingClientRect().height / parent.clientHeight) * 100) : 100;
      if (control.key === 'opacity') return Math.round((parseFloat(computed?.opacity) || 1) * 100);
      if (control.key === 'color') return '#f6edd6';
      if (control.key === 'borderWidth') return parseFloat(computed?.borderTopWidth) || 0;
      if (control.key === 'borderColor') return normalizeColor(computed?.borderTopColor || '#a9823c');
      if (control.key === 'radius') return parseFloat(computed?.borderTopLeftRadius) || 0;
      if (control.key === 'shadow') return estimateShadow(computed?.boxShadow || 'none');
      if (control.key === 'visible') return computed?.display !== 'none';
    }

    if (target.art) {
      const el = targetElement(target);
      if (control.key === 'x' || control.key === 'y') return 0;
      if (control.key === 'scale') return 100;
      if (control.key === 'opacity') return Math.round((parseFloat(getComputedStyle(el).opacity) || 1) * 100);
      if (control.key === 'width') return Math.round(el?.getBoundingClientRect().width || 250);
      if (control.key === 'visible') return !el?.hidden;
      if (control.key === 'src') return el?.getAttribute('src') || '';
    }

    if (control.type === 'rangeVar') {
      const computed = getComputedStyle(document.documentElement).getPropertyValue(control.variable).trim();
      const number = parseFloat(computed);
      return Number.isFinite(number) ? clamp(number,control.min,control.max) : 42;
    }

    if (control.type === 'colorVar') {
      const computed = getComputedStyle(document.documentElement).getPropertyValue(control.variable).trim();
      return computed || fallbackGlobalColor(control.key);
    }

    const el = document.querySelector(control.selector || target.selector || '');
    if (!el) return control.min ?? '';
    const computed = getComputedStyle(el);
    if (control.type === 'color') return computed.getPropertyValue(control.prop) || '#ffffff';
    if (control.type === 'range') {
      if (control.unit === 'navWidth' || control.unit === 'wordWidth') {
        const raw = computed.getPropertyValue(control.prop).trim();
        const number = parseFloat(raw);
        return Number.isFinite(number) ? clamp(number,control.min,control.max) : control.min;
      }
      if (control.unit === 'shadow') return estimateShadow(computed.boxShadow);
      if (control.unit === 'paddingY') return parseFloat(computed.paddingTop) || 0;
      if (control.unit === '%') {
        const parent = el.parentElement;
        if (parent && parent.clientWidth) return Math.round((el.getBoundingClientRect().width / parent.clientWidth) * 100);
      }
      const number = parseFloat(computed.getPropertyValue(control.prop));
      return Number.isFinite(number) ? clamp(number,control.min,control.max) : control.min;
    }
    return '';
  }

  function inputValue(control,input) {
    if (control.type === 'check') return Boolean(input.checked);
    if (control.type === 'range' || control.type === 'rangeVar') return Number(input.value);
    return input.value;
  }

  function setControlValue(target,control,value) {
    const bucket = target.virtual ? config.globals : (config.targets[target.id] ||= {});
    bucket[control.key] = value;
    if (target.virtual) applyGlobals();
    else applyTarget(target);
  }

  function applyAll() {
    ensureBackdrop();
    applyGlobals();
    TARGETS.filter((target) => !target.virtual).forEach(applyTarget);
    markSelectableElements();
    applySelectionOutline();
    syncBackdropHandle();
  }

  function applyGlobals() {
    const root = document.documentElement;
    const globals = config.globals || {};
    setOrRemove(root,'--msg-vd-workspace-color',globals.workspaceColor);
    setOrRemove(root,'--msg-vd-world-color',globals.worldColor);
    setOrRemove(root,'--msg-vd-accent-color',globals.accentColor);
    setOrRemove(root,'--msg-vd-overlay-opacity',Object.prototype.hasOwnProperty.call(globals,'overlayOpacity') ? String(Number(globals.overlayOpacity)/100) : '');
  }

  function applyTarget(target) {
    const values = config.targets[target.id];
    if (!values) return;
    const el = targetElement(target);
    if (!el) return;

    if (target.backdrop) {
      applyBackdrop(el,values);
      syncBackdropHandle();
      return;
    }

    if (target.art) {
      applyArt(target,el,values);
      return;
    }

    const controls = STYLE_CONTROLS[target.id] || [];
    controls.forEach((control) => {
      if (!Object.prototype.hasOwnProperty.call(values,control.key)) return;
      const node = document.querySelector(control.selector || target.selector || '');
      if (!node) return;
      applyStyleControl(node,control,values[control.key]);
    });
  }

  function applyStyleControl(node,control,value) {
    if (control.unit === 'navWidth' || control.unit === 'wordWidth') {
      node.style.setProperty(control.prop,`${value}px`,'important');
      return;
    }
    if (control.unit === 'shadow') {
      const amount = Number(value) || 0;
      node.style.setProperty('box-shadow', amount <= 0 ? 'none' : `0 ${Math.max(2,Math.round(amount*.35))}px ${amount}px rgba(38,47,39,.22)`, 'important');
      return;
    }
    if (control.unit === 'paddingY') {
      node.style.setProperty('padding-top',`${value}px`,'important');
      node.style.setProperty('padding-bottom',`${value}px`,'important');
      return;
    }
    if (control.type === 'color') {
      node.style.setProperty(control.prop,String(value),'important');
      return;
    }
    if (control.type === 'range') {
      const suffix = control.unit === '%' ? '%' : 'px';
      node.style.setProperty(control.prop,`${value}${suffix}`,'important');
      if (control.prop === 'width' && control.unit === '%') {
        node.style.setProperty('margin-left','auto','important');
        node.style.setProperty('margin-right','auto','important');
      }
    }
  }

  function applyBackdrop(el,values) {
    const x = Number(values.x ?? 0);
    const y = Number(values.y ?? 0);
    el.style.setProperty('transform',`translate3d(${x}px,${y}px,0)`,'important');
    if (Object.prototype.hasOwnProperty.call(values,'width')) el.style.setProperty('width',`${values.width}%`,'important');
    if (Object.prototype.hasOwnProperty.call(values,'height')) el.style.setProperty('height',`${values.height}%`,'important');
    if (Object.prototype.hasOwnProperty.call(values,'opacity')) el.style.setProperty('opacity',String(Number(values.opacity)/100),'important');
    if (Object.prototype.hasOwnProperty.call(values,'visible')) el.style.setProperty('display',values.visible === false ? 'none' : 'block','important');
    if (Object.prototype.hasOwnProperty.call(values,'borderWidth')) el.style.setProperty('border-width',`${values.borderWidth}px`,'important');
    if (Object.prototype.hasOwnProperty.call(values,'borderColor')) el.style.setProperty('border-color',String(values.borderColor),'important');
    if (Object.prototype.hasOwnProperty.call(values,'radius')) el.style.setProperty('border-radius',`${values.radius}px`,'important');
    if (Object.prototype.hasOwnProperty.call(values,'shadow')) {
      const amount = Number(values.shadow) || 0;
      el.style.setProperty('box-shadow',amount <= 0 ? 'none' : `0 ${Math.max(2,Math.round(amount*.28))}px ${amount}px rgba(65,48,26,.24)`,'important');
    }
    if (values.color) {
      const rgb = hexToRgb(values.color);
      if (rgb) {
        el.style.setProperty('background',
          `linear-gradient(90deg,transparent 0 14%,rgba(${rgb.r},${rgb.g},${rgb.b},.42) 21%,rgba(${rgb.r},${rgb.g},${rgb.b},.78) 31%,rgba(${rgb.r},${rgb.g},${rgb.b},.78) 69%,rgba(${rgb.r},${rgb.g},${rgb.b},.42) 79%,transparent 86%),linear-gradient(180deg,rgba(255,249,233,.18),rgba(114,84,49,.16))`,
          'important');
      }
    }
  }

  function applyArt(target,el,values) {
    const x = Number(values.x ?? 0);
    const y = Number(values.y ?? 0);
    const scale = Number(values.scale ?? 100) / 100;
    if (Object.prototype.hasOwnProperty.call(values,'width')) el.style.setProperty('width',`${values.width}px`,'important');
    el.style.setProperty('transform',`translate3d(${x}px,${y}px,0) scale(${scale})`,'important');
    el.style.setProperty('transform-origin', target.id === 'left-art' ? 'left bottom' : target.id === 'right-art' ? 'right bottom' : 'center top','important');
    if (Object.prototype.hasOwnProperty.call(values,'opacity')) el.style.setProperty('opacity',String(Number(values.opacity)/100),'important');
    if (Object.prototype.hasOwnProperty.call(values,'visible')) el.style.setProperty('display',values.visible === false ? 'none' : 'block','important');
    if (values.src) {
      if (!el.dataset.msgVdOriginalSrc) el.dataset.msgVdOriginalSrc = el.getAttribute('src') || '';
      if (el.getAttribute('src') !== values.src) el.setAttribute('src',values.src);
    }
  }

  function setOrRemove(node,prop,value) {
    if (value) node.style.setProperty(prop,String(value));
    else node.style.removeProperty(prop);
  }

  function replaceImageFile(target,event) {
    const file = event.target.files?.[0];
    if (!file || !target?.art) return;
    if (file.size > 1800000) {
      setStatus('That image is too large for local theme storage. Please use an image under about 1.8 MB.', false);
      event.target.value = '';
      return;
    }
    pushUndoSnapshot();
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const bucket = config.targets[target.id] ||= {};
      bucket.src = String(reader.result || '');
      applyTarget(target);
      renderInspector();
      markDirty('Image replaced locally. Save to keep it in this browser.');
    });
    reader.readAsDataURL(file);
  }

  function restoreOriginalImage(target) {
    if (!target?.art) return;
    pushUndoSnapshot();
    const el = targetElement(target);
    const bucket = config.targets[target.id] ||= {};
    delete bucket.src;
    const original = el?.dataset.msgVdOriginalSrc;
    if (el && original) el.setAttribute('src',original);
    renderInspector();
    markDirty('Original artwork restored.');
  }

  function clearTargetStyles(target) {
    if (!target) return;
    if (target.virtual) {
      config.globals = {};
      ['--msg-vd-workspace-color','--msg-vd-world-color','--msg-vd-accent-color','--msg-vd-overlay-opacity'].forEach((prop) => document.documentElement.style.removeProperty(prop));
      return;
    }
    const controls = target.backdrop ? BACKDROP_CONTROLS : (target.art ? ART_CONTROLS : (STYLE_CONTROLS[target.id] || []));
    const el = targetElement(target);
    if (target.backdrop && el) {
      ['width','height','transform','opacity','display','background','border-width','border-color','border-radius','box-shadow'].forEach((prop) => el.style.removeProperty(prop));
    } else if (target.art && el) {
      ['width','transform','transform-origin','opacity','display'].forEach((prop) => el.style.removeProperty(prop));
      const original = el.dataset.msgVdOriginalSrc;
      if (original) el.setAttribute('src',original);
    } else {
      controls.forEach((control) => {
        if (!control.selector || !control.prop) return;
        const node = document.querySelector(control.selector);
        if (!node) return;
        if (control.unit === 'paddingY') {
          node.style.removeProperty('padding-top');
          node.style.removeProperty('padding-bottom');
        } else {
          node.style.removeProperty(control.prop);
          if (control.prop === 'width' && control.unit === '%') {
            node.style.removeProperty('margin-left');
            node.style.removeProperty('margin-right');
          }
        }
      });
    }
    delete config.targets[target.id];
    if (target.backdrop) syncBackdropHandle();
  }

  function resetSelected() {
    const target = targetById(selectedId);
    if (!target) return;
    pushUndoSnapshot();
    clearTargetStyles(target);
    renderInspector();
    markDirty(`${target.label} reset to the theme CSS.`);
    window.dispatchEvent(new Event('resize'));
  }

  function resetAll() {
    if (!window.confirm('Reset all Explorer Designer changes in this browser?')) return;
    pushUndoSnapshot();
    TARGETS.forEach(clearTargetStyles);
    config = blankConfig();
    localStorage.removeItem(STORAGE_KEY);
    renderInspector();
    refreshLayers();
    setStatus('Explorer Designer overrides were reset.', false);
    window.dispatchEvent(new Event('resize'));
  }

  function undo() {
    const previous = undoStack.pop();
    if (!previous) return;
    TARGETS.forEach(clearTargetStyles);
    config = clone(previous);
    applyAll();
    renderInspector();
    refreshLayers();
    updateUndoState();
    setStatus('Undid the last design change.', false);
    window.dispatchEvent(new Event('resize'));
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY,JSON.stringify(config));
      sessionStartConfig = clone(config);
      setStatus('Saved in this browser. Reloading will keep this design.', true);
    } catch (error) {
      setStatus('Could not save. Large replacement images can exceed browser storage; try a smaller image.', false);
    }
  }

  function exportConfig() {
    const blob = new Blob([JSON.stringify(config,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mark-set-go-explorer-design.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    setStatus('Design JSON exported.', true);
  }

  function importConfig(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      try {
        const next = JSON.parse(String(reader.result || '{}'));
        if (next.version !== CONFIG_VERSION || typeof next.targets !== 'object') throw new Error('Unsupported config');
        pushUndoSnapshot();
        TARGETS.forEach(clearTargetStyles);
        config = next;
        config.globals ||= {};
        applyAll();
        renderInspector();
        refreshLayers();
        markDirty('Imported design is live. Save when you are happy with it.');
      } catch {
        setStatus('That file is not a valid Explorer Designer v1 export.', false);
      }
    });
    reader.readAsText(file);
    event.target.value = '';
  }

  function markDirty(message='Changes are live but not saved yet.') {
    setStatus(message,false);
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }
  function setStatus(message,saved) {
    const node = panel?.querySelector('[data-vd-status]');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('is-saved',Boolean(saved));
  }
  function updateUndoState() {
    const button = panel?.querySelector('[data-vd-undo]');
    if (button) button.disabled = undoStack.length === 0;
  }

  function findTargetFromClick(element) {
    if (!(element instanceof Element)) return null;
    if (element.closest('#msg-vd-backdrop-handle')) return targetById('backdrop');
    return TARGETS.find((target) => !target.virtual && element.closest(target.selector)) || null;
  }

  function onDocumentClick(event) {
    if (!document.body.classList.contains('msg-vd-design-mode') || document.body.classList.contains('msg-vd-preview-mode')) return;
    if (event.target instanceof Element && event.target.closest('#msg-explorer-visual-designer,#msg-explorer-design-launcher')) return;
    const target = findTargetFromClick(event.target);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    selectTarget(target.id);
  }

  function onPointerDown(event) {
    if (!document.body.classList.contains('msg-vd-design-mode') || document.body.classList.contains('msg-vd-preview-mode')) return;
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest('#msg-vd-backdrop-handle')
      ? targetById('backdrop')
      : TARGETS.find((candidate) => candidate.art && event.target.closest(candidate.selector));
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    selectTarget(target.id);
    pushUndoSnapshot();
    const values = config.targets[target.id] ||= {};
    dragState = {
      target,
      pointerId:event.pointerId,
      startX:event.clientX,
      startY:event.clientY,
      baseX:Number(values.x ?? 0),
      baseY:Number(values.y ?? 0)
    };
    event.target.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const values = config.targets[dragState.target.id] ||= {};
    values.x = Math.round(dragState.baseX + event.clientX - dragState.startX);
    values.y = Math.round(dragState.baseY + event.clientY - dragState.startY);
    applyTarget(dragState.target);
    if (dragState.target.backdrop) syncBackdropHandle();
    if (selectedId === dragState.target.id) renderInspector();
    markDirty(dragState.target.backdrop ? 'Antique Reader Backdrop moved. Save when positioned correctly.' : 'Artwork moved. Save when positioned correctly.');
  }

  function onPointerUp(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    dragState = null;
    syncBackdropHandle();
    updateUndoState();
  }

  function formatValue(control,value) {
    if (control.unit === 'shadow') return String(Math.round(Number(value) || 0));
    if (control.unit === 'navWidth' || control.unit === 'wordWidth') return `${Math.round(Number(value)||0)}px`;
    if (control.unit === 'paddingY') return `${Math.round(Number(value)||0)}px`;
    return `${Math.round(Number(value)||0)}${control.unit || ''}`;
  }
  function clamp(value,min,max) { return Math.min(max,Math.max(min,value)); }
  function estimateShadow(value) {
    if (!value || value === 'none') return 0;
    const nums = value.match(/-?\d+(?:\.\d+)?px/g)?.map((item) => Math.abs(parseFloat(item))) || [];
    return clamp(Math.round(Math.max(...nums,0)),0,45);
  }
  function hexToRgb(value) {
    const hex = normalizeColor(value).replace('#','');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
    return { r:parseInt(hex.slice(0,2),16), g:parseInt(hex.slice(2,4),16), b:parseInt(hex.slice(4,6),16) };
  }

  function normalizeColor(value) {
    const text = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text;
    const match = text.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    if (!match) return '#ffffff';
    return '#' + [match[1],match[2],match[3]].map((n) => clamp(Number(n),0,255).toString(16).padStart(2,'0')).join('');
  }
  function fallbackGlobalColor(key) {
    if (key === 'workspaceColor') return normalizeColor(getComputedStyle(document.body).backgroundColor) || '#c9bda5';
    if (key === 'worldColor') return '#d9c9aa';
    return '#285f56';
  }
  function escapeAttr(value) {
    return String(value).replace(/[&<>"']/g,(char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  function scheduleApply() {
    [0,80,260,700].forEach((delay) => window.setTimeout(() => {
      applyAll();
      if (panel && !panel.hidden) refreshLayers();
      syncBackdropHandle();
    },delay));
  }

  function init() {
    ensureUI();
    applyAll();
    document.addEventListener('click',onDocumentClick,true);
    document.addEventListener('pointerdown',onPointerDown,true);
    document.addEventListener('pointermove',onPointerMove,true);
    document.addEventListener('pointerup',onPointerUp,true);
    document.addEventListener('pointercancel',onPointerUp,true);
    document.addEventListener('marksetgo:document-available',scheduleApply);
    window.addEventListener('pageshow',scheduleApply);
    window.addEventListener('resize',() => { if (panel && !panel.hidden) refreshLayers(); syncBackdropHandle(); });

    // The app rebuilds views after explicit navigation. Reapply only after those
    // user events; there is intentionally no MutationObserver watching the Reader.
    document.addEventListener('click',(event) => {
      if (event.target instanceof Element && event.target.closest('[data-action],[data-read],[data-topic-read]')) scheduleApply();
    },true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
