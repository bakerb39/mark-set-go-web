'use strict';

(() => {
  const STORAGE_KEY = 'markSetGoExplorerVisualDesignerV2';
  const CONFIG_VERSION = 2;
  const MANAGED_ATTR = 'data-msg-vd-selectable';

  const TARGETS = [
    { id:'shell', label:'Reader shell', selector:'.reader-page-panel', group:'Layout' },
    { id:'title', label:'Reader title', selector:'.reader-page-panel > .reader-title-row', group:'Layout' },
    { id:'controls', label:'Top controls', selector:'.reader-page-panel > .reader-pane-controls', group:'Layout' },
    { id:'topics', label:'My Topics', selector:'.reader-page-panel .navigation-pane', group:'Panes' },
    { id:'reader', label:'Reading page', selector:'.reader-page-panel #reader-frame', group:'Panes' },
    { id:'footer', label:'Page controls', selector:'.reader-page-panel .reader-viewer-footer', group:'Layout' },
    { id:'playback', label:'Start / Pause', selector:'.reader-page-panel .playback-controls', group:'Layout' },
    { id:'companion', label:'Companion pane', selector:'.reader-page-panel .mark-companion-panel', group:'Panes' },
    { id:'left-art', label:'Left scenery', selector:'.explorer-world-art__left', group:'Scenery', art:true },
    { id:'right-art', label:'Right scenery', selector:'.explorer-world-art__right', group:'Scenery', art:true },
    { id:'top-art', label:'Top panorama', selector:'.explorer-world-art__top', group:'Scenery', art:true }
  ];

  const STYLE_CONTROLS = {
    shell: [
      range('width','Shell width',55,110,1,'%', '.reader-page-panel','width'),
      range('moveY','Move shell up / down',-150,150,1,'translateY','.reader-page-panel','transform'),
      range('marginTop','Top margin',-100,160,1,'px','.reader-page-panel','margin-top'),
      range('marginBottom','Bottom gap',0,180,1,'px','.reader-page-panel','margin-bottom'),
      range('paddingX','Side padding',0,100,1,'paddingX','.reader-page-panel','padding'),
      range('paddingY','Top / bottom padding',0,100,1,'paddingY','.reader-page-panel','padding'),
      color('background','Shell color','.reader-page-panel','background'),
      color('borderColor','Border color','.reader-page-panel','border-color'),
      range('borderWidth','Border width',0,12,1,'px','.reader-page-panel','border-width'),
      range('radius','Corner radius',0,80,1,'px','.reader-page-panel','border-radius'),
      range('shadow','Shadow',0,100,1,'shadow','.reader-page-panel','box-shadow')
    ],
    title: [
      range('marginTop','Top spacing',-100,150,1,'px','.reader-page-panel > .reader-title-row','margin-top'),
      range('marginBottom','Bottom spacing',-80,150,1,'px','.reader-page-panel > .reader-title-row','margin-bottom'),
      range('fontSize','Title size',10,72,1,'px','.reader-title-copy h1','font-size'),
      color('titleColor','Title color','.reader-title-copy h1','color')
    ],
    controls: [
      range('marginTop','Top spacing',-100,160,1,'px','.reader-page-panel > .reader-pane-controls','margin-top'),
      range('marginBottom','Bottom spacing',-100,180,1,'px','.reader-page-panel > .reader-pane-controls','margin-bottom'),
      range('gap','Button spacing',0,80,1,'px','.reader-page-panel .reader-pane-buttons','gap'),
      range('minHeight','Row height',20,160,1,'px','.reader-page-panel > .reader-pane-controls','min-height')
    ],
    topics: [
      range('width','Pane width',120,700,2,'navWidth','#reader-layout','--navigation-width'),
      range('marginTop','Top spacing',-100,150,1,'px','.reader-page-panel .navigation-pane','margin-top'),
      range('height','Pane height',240,1200,5,'px','.reader-page-panel .navigation-pane','height'),
      range('marginBottom','Bottom spacing',-80,180,1,'px','.reader-page-panel .navigation-pane','margin-bottom'),
      color('background','Background','.reader-page-panel .navigation-pane','background'),
      color('borderColor','Border color','.reader-page-panel .navigation-pane','border-color'),
      range('radius','Corner radius',0,80,1,'px','.reader-page-panel .navigation-pane','border-radius'),
      range('shadow','Shadow',0,100,1,'shadow','.reader-page-panel .navigation-pane','box-shadow')
    ],
    reader: [
      range('marginTop','Top spacing',-100,150,1,'px','.reader-page-panel #reader-frame','margin-top'),
      color('background','Frame color','.reader-page-panel #reader-frame','background'),
      color('borderColor','Border color','.reader-page-panel #reader-frame','border-color'),
      range('borderWidth','Border width',0,12,1,'px','.reader-page-panel #reader-frame','border-width'),
      range('radius','Corner radius',0,80,1,'px','.reader-page-panel #reader-frame','border-radius'),
      range('shadow','Shadow',0,100,1,'shadow','.reader-page-panel #reader-frame','box-shadow')
    ],
    footer: [
      range('marginTop','Top spacing',-100,150,1,'px','.reader-page-panel .reader-viewer-footer','margin-top'),
      range('paddingY','Vertical padding',0,80,1,'paddingY','.reader-page-panel .reader-viewer-footer','padding')
    ],
    playback: [
      range('marginTop','Top spacing',-100,150,1,'px','.reader-page-panel .playback-controls','margin-top'),
      range('marginBottom','Bottom spacing',-100,150,1,'px','.reader-page-panel .playback-controls','margin-bottom')
    ],
    companion: [
      range('width','Pane width',180,800,5,'wordWidth','#reader-layout','--word-panel-width'),
      color('background','Main body','.reader-page-panel .mark-companion-panel .askmark-premium','background'),
      color('headerBackground','Header','.reader-page-panel .mark-companion-panel .askmark-hero','background'),
      color('composerBackground','Composer','.reader-page-panel .mark-companion-panel .askmark-composer','background'),
      color('borderColor','Frame border','.reader-page-panel .mark-companion-panel','border-color'),
      range('radius','Corner radius',0,80,1,'px','.reader-page-panel .mark-companion-panel','border-radius'),
      range('shadow','Shadow',0,100,1,'shadow','.reader-page-panel .mark-companion-panel','box-shadow')
    ]
  };

  const ART_CONTROLS = [
    range('x','Move left / right',-800,800,2,'px',null,null),
    range('y','Move up / down',-800,800,2,'px',null,null),
    range('width','Artwork width',50,900,2,'px',null,null),
    range('scale','Scale',25,250,1,'%',null,null),
    range('opacity','Opacity',0,100,1,'%',null,null),
    check('visible','Show artwork'),
    text('src','Image URL'),
    fileControl('imageFile','Replace with image')
  ];

  let launcher = null;
  let panel = null;
  let selectedId = null;
  let config = loadConfig();
  let undoStack = [];
  let editBaseline = null;
  let dragState = null;

  function range(key,label,min,max,step,unit,selector,prop){return{type:'range',key,label,min,max,step,unit,selector,prop};}
  function color(key,label,selector,prop){return{type:'color',key,label,selector,prop};}
  function check(key,label){return{type:'check',key,label};}
  function text(key,label){return{type:'text',key,label};}
  function fileControl(key,label){return{type:'file',key,label};}
  function clone(value){return JSON.parse(JSON.stringify(value||{}));}
  function blankConfig(){return{version:CONFIG_VERSION,targets:{}};}

  function loadConfig(){
    try{
      const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if(!raw||raw.version!==CONFIG_VERSION)return blankConfig();
      raw.targets||={};
      return raw;
    }catch{return blankConfig();}
  }
  function isExplorer(){return document.documentElement.dataset.msgExperienceTheme==='explorer';}
  function targetById(id){return TARGETS.find(t=>t.id===id)||null;}
  function targetElement(target){return document.querySelector(target?.selector||'');}
  function controlsForTarget(target){return target?.art?ART_CONTROLS:(STYLE_CONTROLS[target?.id]||[]);}

  function ensureUI(){
    if(!launcher){
      launcher=document.createElement('button');
      launcher.id='msg-explorer-design-launcher';
      launcher.type='button';
      launcher.textContent='✦ Design';
      launcher.title='Fine-tune the Explorer Reader layout';
      launcher.addEventListener('click',openDesigner);
      document.body.appendChild(launcher);
    }
    if(!panel){
      panel=document.createElement('aside');
      panel.id='msg-explorer-visual-designer';
      panel.hidden=true;
      panel.setAttribute('aria-label','Explorer visual designer');
      panel.innerHTML=`
        <div class="msg-vd-head">
          <div class="msg-vd-head-copy"><strong>Explorer Designer</strong><small>Fine-tune the restored Reader composition</small></div>
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
            <div class="msg-vd-section-title"><span>Layers</span><span>click page or choose</span></div>
            <div class="msg-vd-layers" data-vd-layers></div>
          </section>
          <section class="msg-vd-section">
            <div class="msg-vd-section-title"><span>Inspector</span><span data-vd-selection-name>Reader shell</span></div>
            <div data-vd-inspector></div>
          </section>
        </div>
        <div class="msg-vd-status" data-vd-status>Changes are live but not saved yet.</div>
        <div class="msg-vd-bottom-actions">
          <button type="button" class="msg-vd-danger" data-vd-reset-all>Reset Explorer</button>
          <button type="button" class="msg-vd-save" data-vd-save>Save design</button>
        </div>`;
      document.body.appendChild(panel);
      bindUI();
    }
    refreshLayers();
  }

  function bindUI(){
    panel.querySelector('[data-vd-close]')?.addEventListener('click',closeDesigner);
    panel.querySelector('[data-vd-preview]')?.addEventListener('click',togglePreview);
    panel.querySelector('[data-vd-undo]')?.addEventListener('click',undo);
    panel.querySelector('[data-vd-reset-selected]')?.addEventListener('click',resetSelected);
    panel.querySelector('[data-vd-reset-all]')?.addEventListener('click',resetAll);
    panel.querySelector('[data-vd-save]')?.addEventListener('click',save);
    panel.querySelector('[data-vd-export]')?.addEventListener('click',exportConfig);
    panel.querySelector('[data-vd-import]')?.addEventListener('click',()=>panel.querySelector('[data-vd-import-file]')?.click());
    panel.querySelector('[data-vd-import-file]')?.addEventListener('change',importConfig);
  }

  function openDesigner(){
    ensureUI();
    panel.hidden=false;
    launcher.textContent='✦ Designing';
    document.body.classList.add('msg-vd-design-mode');
    document.body.classList.remove('msg-vd-preview-mode');
    markSelectableElements();
    selectTarget(selectedId||'shell');
    setStatus('Reader shell selected. Adjust the composition, then Save.',false);
  }
  function closeDesigner(){
    panel.hidden=true;
    launcher.textContent='✦ Design';
    document.body.classList.remove('msg-vd-design-mode','msg-vd-preview-mode');
    clearSelectionOutline();
    clearSelectableMarks();
  }
  function togglePreview(){
    const preview=document.body.classList.toggle('msg-vd-preview-mode');
    if(preview){panel.hidden=true;launcher.textContent='✦ Edit';clearSelectionOutline();}
    else{panel.hidden=false;launcher.textContent='✦ Designing';applySelectionOutline();}
  }

  function markSelectableElements(){
    TARGETS.forEach(target=>{const el=targetElement(target);if(el)el.setAttribute(MANAGED_ATTR,'1');});
  }
  function clearSelectableMarks(){document.querySelectorAll(`[${MANAGED_ATTR}]`).forEach(el=>el.removeAttribute(MANAGED_ATTR));}
  function clearSelectionOutline(){document.querySelectorAll('.msg-vd-selected').forEach(el=>el.classList.remove('msg-vd-selected'));}
  function applySelectionOutline(){
    if(document.body.classList.contains('msg-vd-preview-mode'))return;
    const el=targetElement(targetById(selectedId));
    if(el)el.classList.add('msg-vd-selected');
  }

  function refreshLayers(){
    if(!panel)return;
    const host=panel.querySelector('[data-vd-layers]');
    if(!host)return;
    host.innerHTML=TARGETS.map(target=>{
      const exists=Boolean(targetElement(target));
      return `<button type="button" class="msg-vd-layer ${target.id===selectedId?'is-selected':''} ${target.id==='shell'?'is-primary-layer':''}" data-vd-layer="${target.id}" ${exists?'':'disabled'}>${target.label}</button>`;
    }).join('');
    host.querySelectorAll('[data-vd-layer]').forEach(button=>button.addEventListener('click',()=>selectTarget(button.dataset.vdLayer)));
  }

  function selectTarget(id){
    const target=targetById(id);
    if(!target)return;
    const el=targetElement(target);
    if(!el){setStatus(`${target.label} is not visible on this page.`,false);return;}
    clearSelectionOutline();
    selectedId=id;
    applySelectionOutline();
    refreshLayers();
    renderInspector();
    panel.querySelector('[data-vd-reset-selected]')?.removeAttribute('disabled');
  }

  function renderInspector(){
    if(!panel)return;
    const target=targetById(selectedId)||targetById('shell');
    const host=panel.querySelector('[data-vd-inspector]');
    const name=panel.querySelector('[data-vd-selection-name]');
    if(!target||!host)return;
    if(name)name.textContent=target.label;
    const controls=controlsForTarget(target);
    host.innerHTML=controls.map(control=>controlMarkup(target,control)).join('');
    bindInspectorControls(target,controls,host);
  }

  function controlMarkup(target,control){
    const value=controlValue(target,control);
    if(control.type==='range')return `<div class="msg-vd-control"><label>${control.label}</label><output class="msg-vd-control-output" data-vd-output="${control.key}">${formatValue(control,value)}</output><input type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${value}" data-vd-control="${control.key}"></div>`;
    if(control.type==='color')return `<div class="msg-vd-control"><label>${control.label}</label><input type="color" value="${normalizeColor(value)}" data-vd-control="${control.key}"></div>`;
    if(control.type==='check')return `<div class="msg-vd-control"><label class="msg-vd-check"><input type="checkbox" ${value!==false?'checked':''} data-vd-control="${control.key}">${control.label}</label></div>`;
    if(control.type==='text')return `<div class="msg-vd-control"><label>${control.label}</label><input type="text" value="${escapeAttr(value||'')}" placeholder="/assets/explorer/... or https://..." data-vd-control="${control.key}"></div>`;
    if(control.type==='file')return `<div class="msg-vd-control"><label>${control.label}</label><div class="msg-vd-file-row"><button type="button" data-vd-file-pick>Choose image…</button><button type="button" data-vd-image-original>Use original</button><input type="file" accept="image/*" data-vd-image-file hidden></div></div>`;
    return '';
  }

  function bindInspectorControls(target,controls,host){
    controls.forEach(control=>{
      if(control.type==='file')return;
      const input=host.querySelector(`[data-vd-control="${control.key}"]`);
      if(!input)return;
      input.addEventListener('focus',beginEdit);
      input.addEventListener('pointerdown',beginEdit);
      const eventName=control.type==='text'?'change':'input';
      input.addEventListener(eventName,()=>{
        const value=inputValue(control,input);
        setControlValue(target,control,value);
        const output=host.querySelector(`[data-vd-output="${control.key}"]`);
        if(output)output.textContent=formatValue(control,value);
        markDirty();
      });
      input.addEventListener('change',commitEdit);
    });
    const fileInput=host.querySelector('[data-vd-image-file]');
    host.querySelector('[data-vd-file-pick]')?.addEventListener('click',()=>fileInput?.click());
    fileInput?.addEventListener('change',event=>replaceImageFile(target,event));
    host.querySelector('[data-vd-image-original]')?.addEventListener('click',()=>restoreOriginalImage(target));
  }

  function beginEdit(){if(!editBaseline)editBaseline=clone(config);}
  function commitEdit(){if(!editBaseline)return;undoStack.push(editBaseline);editBaseline=null;updateUndoState();}
  function pushUndoSnapshot(){undoStack.push(clone(config));updateUndoState();}

  function controlValue(target,control){
    const bucket=config.targets[target.id]||{};
    if(Object.prototype.hasOwnProperty.call(bucket,control.key))return bucket[control.key];
    if(target.art){
      const el=targetElement(target);
      if(control.key==='x'||control.key==='y')return 0;
      if(control.key==='scale')return 100;
      if(control.key==='opacity')return Math.round((parseFloat(getComputedStyle(el).opacity)||1)*100);
      if(control.key==='width')return Math.round(el?.getBoundingClientRect().width||250);
      if(control.key==='visible')return getComputedStyle(el).display!=='none';
      if(control.key==='src')return el?.getAttribute('src')||'';
    }
    const el=document.querySelector(control.selector||target.selector||'');
    if(!el)return control.min??'';
    const computed=getComputedStyle(el);
    if(control.type==='color')return control.prop==='background' ? computed.backgroundColor : (computed.getPropertyValue(control.prop)||'#ffffff');
    if(control.unit==='navWidth'||control.unit==='wordWidth'){
      const raw=getComputedStyle(document.querySelector(control.selector)).getPropertyValue(control.prop).trim();
      const n=parseFloat(raw);return Number.isFinite(n)?clamp(n,control.min,control.max):control.min;
    }
    if(control.unit==='shadow')return estimateShadow(computed.boxShadow);
    if(control.unit==='paddingY')return parseFloat(computed.paddingTop)||0;
    if(control.unit==='paddingX')return parseFloat(computed.paddingLeft)||0;
    if(control.unit==='translateY')return 0;
    if(control.unit==='%'){
      const parent=el.parentElement;
      if(parent?.clientWidth)return clamp(Math.round((el.getBoundingClientRect().width/parent.clientWidth)*100),control.min,control.max);
    }
    const n=parseFloat(computed.getPropertyValue(control.prop));
    return Number.isFinite(n)?clamp(n,control.min,control.max):control.min;
  }

  function inputValue(control,input){
    if(control.type==='check')return Boolean(input.checked);
    if(control.type==='range')return Number(input.value);
    return input.value;
  }

  function setControlValue(target,control,value){
    const bucket=config.targets[target.id]||={};
    bucket[control.key]=value;
    applyTarget(target);
  }

  function applyAll(){TARGETS.forEach(applyTarget);markSelectableElements();applySelectionOutline();}
  function applyTarget(target){
    const values=config.targets[target.id];
    if(!values)return;
    const el=targetElement(target);
    if(!el)return;
    if(target.art){applyArt(target,el,values);return;}
    const controls=STYLE_CONTROLS[target.id]||[];
    controls.forEach(control=>{
      if(!Object.prototype.hasOwnProperty.call(values,control.key))return;
      const node=document.querySelector(control.selector||target.selector||'');
      if(node)applyStyleControl(node,control,values[control.key]);
    });
  }

  function applyStyleControl(node,control,value){
    if(control.unit==='navWidth'||control.unit==='wordWidth'){
      node.style.setProperty(control.prop,`${value}px`,'important');return;
    }
    if(control.unit==='shadow'){
      const amount=Number(value)||0;
      node.style.setProperty('box-shadow',amount<=0?'none':`0 ${Math.max(3,Math.round(amount*.35))}px ${amount}px rgba(35,48,41,.22)`,'important');return;
    }
    if(control.unit==='paddingY'){
      node.style.setProperty('padding-top',`${value}px`,'important');
      node.style.setProperty('padding-bottom',`${value}px`,'important');return;
    }
    if(control.unit==='paddingX'){
      node.style.setProperty('padding-left',`${value}px`,'important');
      node.style.setProperty('padding-right',`${value}px`,'important');return;
    }
    if(control.unit==='translateY'){
      node.style.setProperty('transform',`translate3d(0,${value}px,0)`,'important');return;
    }
    if(control.type==='color'){
      node.style.setProperty(control.prop,String(value),'important');return;
    }
    const suffix=control.unit==='%'?'%':'px';
    node.style.setProperty(control.prop,`${value}${suffix}`,'important');
    if(control.prop==='width'&&control.unit==='%'){
      node.style.setProperty('margin-left','auto','important');
      node.style.setProperty('margin-right','auto','important');
    }
  }

  function applyArt(target,el,values){
    const x=Number(values.x??0),y=Number(values.y??0),scale=Number(values.scale??100)/100;
    if(Object.prototype.hasOwnProperty.call(values,'width'))el.style.setProperty('width',`${values.width}px`,'important');
    el.style.setProperty('transform',`translate3d(${x}px,${y}px,0) scale(${scale})`,'important');
    el.style.setProperty('transform-origin',target.id==='left-art'?'left bottom':target.id==='right-art'?'right bottom':'center top','important');
    if(Object.prototype.hasOwnProperty.call(values,'opacity'))el.style.setProperty('opacity',String(Number(values.opacity)/100),'important');
    if(Object.prototype.hasOwnProperty.call(values,'visible'))el.style.setProperty('display',values.visible===false?'none':'block','important');
    if(values.src){
      if(!el.dataset.msgVdOriginalSrc)el.dataset.msgVdOriginalSrc=el.getAttribute('src')||'';
      if(el.getAttribute('src')!==values.src)el.setAttribute('src',values.src);
    }
  }

  function replaceImageFile(target,event){
    const file=event.target.files?.[0];
    if(!file||!target?.art)return;
    if(file.size>1800000){setStatus('Use an image under about 1.8 MB for browser-saved replacements.',false);event.target.value='';return;}
    pushUndoSnapshot();
    const reader=new FileReader();
    reader.addEventListener('load',()=>{
      const bucket=config.targets[target.id]||={};bucket.src=String(reader.result||'');applyTarget(target);renderInspector();markDirty('Image replaced locally. Save to keep it.');
    });
    reader.readAsDataURL(file);
  }
  function restoreOriginalImage(target){
    if(!target?.art)return;
    pushUndoSnapshot();
    const el=targetElement(target),bucket=config.targets[target.id]||={};delete bucket.src;
    const original=el?.dataset.msgVdOriginalSrc;if(el&&original)el.setAttribute('src',original);
    renderInspector();markDirty('Original artwork restored.');
  }

  function clearTargetStyles(target){
    if(!target)return;
    const el=targetElement(target);
    if(target.art&&el){
      ['width','transform','transform-origin','opacity','display'].forEach(prop=>el.style.removeProperty(prop));
      const original=el.dataset.msgVdOriginalSrc;if(original)el.setAttribute('src',original);
    }else{
      (STYLE_CONTROLS[target.id]||[]).forEach(control=>{
        const node=document.querySelector(control.selector||target.selector||'');if(!node)return;
        if(control.unit==='paddingY'){node.style.removeProperty('padding-top');node.style.removeProperty('padding-bottom');}
        else if(control.unit==='paddingX'){node.style.removeProperty('padding-left');node.style.removeProperty('padding-right');}
        else if(control.unit==='translateY'){node.style.removeProperty('transform');}
        else{node.style.removeProperty(control.prop);if(control.prop==='width'&&control.unit==='%'){node.style.removeProperty('margin-left');node.style.removeProperty('margin-right');}}
      });
    }
    delete config.targets[target.id];
  }
  function resetSelected(){
    const target=targetById(selectedId);if(!target)return;pushUndoSnapshot();clearTargetStyles(target);renderInspector();markDirty(`${target.label} reset.`);window.dispatchEvent(new Event('resize'));
  }
  function resetAll(){
    if(!window.confirm('Reset all Explorer Designer v2 changes in this browser?'))return;
    pushUndoSnapshot();TARGETS.forEach(clearTargetStyles);config=blankConfig();localStorage.removeItem(STORAGE_KEY);selectTarget('shell');setStatus('Explorer Designer overrides reset to the restored shell.',false);window.dispatchEvent(new Event('resize'));
  }
  function undo(){
    const previous=undoStack.pop();if(!previous)return;TARGETS.forEach(clearTargetStyles);config=clone(previous);applyAll();renderInspector();refreshLayers();updateUndoState();setStatus('Undid the last design change.',false);window.dispatchEvent(new Event('resize'));
  }
  function save(){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(config));setStatus('Saved in this browser.',true);}catch{setStatus('Could not save. Large local images may exceed browser storage.',false);}
  }
  function exportConfig(){
    const blob=new Blob([JSON.stringify(config,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='mark-set-go-explorer-design-v2.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('Design JSON exported.',true);
  }
  function importConfig(event){
    const file=event.target.files?.[0];if(!file)return;const reader=new FileReader();
    reader.addEventListener('load',()=>{try{const next=JSON.parse(String(reader.result||'{}'));if(next.version!==CONFIG_VERSION||typeof next.targets!=='object')throw new Error();pushUndoSnapshot();TARGETS.forEach(clearTargetStyles);config=next;applyAll();renderInspector();refreshLayers();markDirty('Imported design is live. Save when ready.');}catch{setStatus('That is not a valid Explorer Designer v2 export.',false);}});
    reader.readAsText(file);event.target.value='';
  }

  function markDirty(message='Changes are live but not saved yet.'){setStatus(message,false);window.requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));}
  function setStatus(message,saved){const node=panel?.querySelector('[data-vd-status]');if(!node)return;node.textContent=message;node.classList.toggle('is-saved',Boolean(saved));}
  function updateUndoState(){const button=panel?.querySelector('[data-vd-undo]');if(button)button.disabled=undoStack.length===0;}

  function findTargetFromClick(element){
    if(!(element instanceof Element))return null;
    const specific=TARGETS.filter(t=>t.id!=='shell').find(target=>element.closest(target.selector));
    return specific||(element.closest('.reader-page-panel')?targetById('shell'):null);
  }
  function onDocumentClick(event){
    if(!document.body.classList.contains('msg-vd-design-mode')||document.body.classList.contains('msg-vd-preview-mode'))return;
    if(event.target instanceof Element&&event.target.closest('#msg-explorer-visual-designer,#msg-explorer-design-launcher'))return;
    const target=findTargetFromClick(event.target);if(!target)return;
    event.preventDefault();event.stopPropagation();selectTarget(target.id);
  }
  function onPointerDown(event){
    if(!document.body.classList.contains('msg-vd-design-mode')||document.body.classList.contains('msg-vd-preview-mode'))return;
    if(!(event.target instanceof Element))return;
    const target=TARGETS.find(candidate=>candidate.art&&event.target.closest(candidate.selector));if(!target)return;
    event.preventDefault();event.stopPropagation();selectTarget(target.id);pushUndoSnapshot();
    const values=config.targets[target.id]||={};
    dragState={target,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,baseX:Number(values.x??0),baseY:Number(values.y??0)};
    event.target.setPointerCapture?.(event.pointerId);
  }
  function onPointerMove(event){
    if(!dragState||event.pointerId!==dragState.pointerId)return;
    const values=config.targets[dragState.target.id]||={};values.x=Math.round(dragState.baseX+event.clientX-dragState.startX);values.y=Math.round(dragState.baseY+event.clientY-dragState.startY);applyTarget(dragState.target);if(selectedId===dragState.target.id)renderInspector();markDirty('Scenery moved. Save when positioned correctly.');
  }
  function onPointerUp(event){if(!dragState||event.pointerId!==dragState.pointerId)return;dragState=null;updateUndoState();}

  function formatValue(control,value){
    if(control.unit==='shadow')return String(Math.round(Number(value)||0));
    if(control.unit==='navWidth'||control.unit==='wordWidth'||control.unit==='paddingY'||control.unit==='paddingX'||control.unit==='translateY')return `${Math.round(Number(value)||0)}px`;
    return `${Math.round(Number(value)||0)}${control.unit||''}`;
  }
  function clamp(value,min,max){return Math.min(max,Math.max(min,value));}
  function estimateShadow(value){if(!value||value==='none')return 0;const nums=value.match(/-?\d+(?:\.\d+)?px/g)?.map(item=>Math.abs(parseFloat(item)))||[];return clamp(Math.round(Math.max(...nums,0)),0,100);}
  function normalizeColor(value){
    const text=String(value||'').trim();if(/^#[0-9a-f]{6}$/i.test(text))return text;
    const match=text.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);if(!match)return'#ffffff';
    return'#'+[match[1],match[2],match[3]].map(n=>clamp(Number(n),0,255).toString(16).padStart(2,'0')).join('');
  }
  function escapeAttr(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}

  function scheduleApply(){[0,80,260,700].forEach(delay=>window.setTimeout(()=>{applyAll();if(panel&&!panel.hidden)refreshLayers();},delay));}
  function init(){
    ensureUI();applyAll();
    document.addEventListener('click',onDocumentClick,true);
    document.addEventListener('pointerdown',onPointerDown,true);
    document.addEventListener('pointermove',onPointerMove,true);
    document.addEventListener('pointerup',onPointerUp,true);
    document.addEventListener('pointercancel',onPointerUp,true);
    document.addEventListener('marksetgo:document-available',scheduleApply);
    window.addEventListener('pageshow',scheduleApply);
    window.addEventListener('resize',()=>{if(panel&&!panel.hidden)refreshLayers();});
    document.addEventListener('click',event=>{if(event.target instanceof Element&&event.target.closest('[data-action],[data-read],[data-topic-read]'))scheduleApply();},true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
