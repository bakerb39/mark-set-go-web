'use strict';

/*
 * Mark, Set, Go! Visual Designer v3.2 — Profile launcher + current theme tokens
 *
 * SOURCE RULES:
 * - The application's default Reader layout lives in CSS.
 * - Designer layout values are OPTIONAL overrides only.
 * - No layout value is baked into the Designer's default configuration.
 * - "Default Layout" removes every Designer layout override and exposes the
 *   current CSS baseline immediately.
 * - Leaving Explorer releases Designer-owned inline colors/layout so other
 *   experience themes can style the complete UI normally.
 * - Returning to Explorer reapplies only values the user explicitly saved.
 * - No scenery controls. No MutationObserver.
 */

(() => {
  const STORAGE_KEY = 'markSetGoExplorerVisualDesignerV4';
  const PANEL_POSITION_KEY = 'markSetGoExplorerVisualDesignerPanelPositionV1';
  const CONFIG_VERSION = 4;

  const PRESETS = Object.freeze({
    explorer:Object.freeze({
      page:'#e9dfc9',surface:'#fffdf7',accent:'#317165',accentDark:'#1f5149',
      soft:'#e8efe8',soft2:'#f4ecd8',border:'#cbb98e',gold:'#c5a152',ink:'#20322d',muted:'#6d766f'
    }),
    antique:Object.freeze({
      page:'#d6c4a4',surface:'#fff8e7',accent:'#765b35',accentDark:'#5b432b',
      soft:'#efe1c2',soft2:'#f6ead1',border:'#c7aa75',gold:'#b8873f',ink:'#3b2b1e',muted:'#756550'
    })
  });

  const COLOR_VARS = Object.freeze({
    page:'--msg-theme-page',surface:'--msg-theme-surface',accent:'--msg-theme-accent',
    accentDark:'--msg-theme-accent-dark',soft:'--msg-theme-soft',soft2:'--msg-theme-soft-2',
    gold:'--msg-theme-gold',border:'--msg-theme-border',ink:'--msg-theme-ink',muted:'--msg-theme-muted'
  });

  const LAYERS = Object.freeze({
    shell:{label:'Reader shell',selector:'.reader-page-panel',controls:[
      r('width','Width',55,110,1,'%','width'),r('marginTop','Top margin',-80,120,1,'px','margin-top'),
      r('marginBottom','Bottom gap',0,120,1,'px','margin-bottom'),r('paddingX','Side padding',0,80,1,'paddingX','padding'),
      r('paddingY','Top / bottom padding',0,60,1,'paddingY','padding'),r('radius','Corner radius',0,50,1,'px','border-radius')
    ]},
    title:{label:'Reader title',selector:'.reader-page-panel > .reader-title-row',controls:[
      r('marginTop','Top spacing',-40,100,1,'px','margin-top'),r('marginBottom','Bottom spacing',-40,100,1,'px','margin-bottom')
    ]},
    controls:{label:'Top controls',selector:'.reader-page-panel > .reader-pane-controls',controls:[
      r('marginTop','Top spacing',-40,100,1,'px','margin-top'),r('marginBottom','Bottom spacing',-40,120,1,'px','margin-bottom'),
      r('minHeight','Row height',24,120,1,'px','min-height')
    ]},
    topics:{label:'My Topics',selector:'.reader-page-panel .navigation-pane',controls:[
      r('width','Pane width',140,600,2,'navWidth','--navigation-width'),r('marginTop','Top spacing',-30,100,1,'px','margin-top')
    ]},
    reader:{label:'Reading page',selector:'.reader-page-panel #reader-frame',controls:[
      r('marginTop','Top spacing',-30,100,1,'px','margin-top'),r('radius','Corner radius',0,40,1,'px','border-radius')
    ]},
    footer:{label:'Page controls',selector:'.reader-page-panel .reader-viewer-footer',controls:[
      r('height','Footer height',36,90,1,'footerHeight','--msg-reader-footer-height')
    ]},
    playback:{label:'Start / Pause',selector:'.reader-page-panel .playback-controls',controls:[
      r('height','Row height',34,80,1,'px','height'),r('marginTop','Top spacing',0,40,1,'px','margin-top')
    ]},
    companion:{label:'Companion pane',selector:'.reader-page-panel .mark-companion-panel',controls:[
      r('width','Pane width',220,700,5,'wordWidth','--word-panel-width'),r('marginTop','Top spacing',-30,100,1,'px','margin-top')
    ]}
  });

  function r(key,label,min,max,step,unit,prop){return{key,label,min,max,step,unit,prop};}
  function clone(v){return JSON.parse(JSON.stringify(v||{}));}
  function isExplorer(){return document.documentElement.dataset.msgExperienceTheme==='explorer';}
  function defaultConfig(){return{version:CONFIG_VERSION,preset:'explorer',colors:clone(PRESETS.explorer),layout:{}};}
  function sanitize(raw){
    const out=defaultConfig();
    if(!raw||Number(raw.version)!==CONFIG_VERSION)return out;
    out.preset=['explorer','antique','custom'].includes(String(raw.preset))?String(raw.preset):'explorer';
    for(const [k,fallback] of Object.entries(PRESETS.explorer)){
      const v=String(raw.colors?.[k]||'');out.colors[k]=/^#[0-9a-f]{6}$/i.test(v)?v:fallback;
    }
    if(raw.layout&&typeof raw.layout==='object'){
      for(const [id,layer] of Object.entries(LAYERS)){
        const src=raw.layout[id];if(!src||typeof src!=='object')continue;
        const dst={};
        for(const c of layer.controls){
          if(!Object.prototype.hasOwnProperty.call(src,c.key))continue;
          const n=Number(src[c.key]);if(Number.isFinite(n))dst[c.key]=Math.min(c.max,Math.max(c.min,n));
        }
        if(Object.keys(dst).length)out.layout[id]=dst;
      }
    }
    return out;
  }
  function loadConfig(){try{return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'));}catch{return defaultConfig();}}

  let config=loadConfig(),panel=null,launcher=null,panelDrag=null,selected='shell';

  function target(id){const def=LAYERS[id];if(!def)return null;try{return document.querySelector(def.selector);}catch{return null;}}
  function layoutRoot(){return document.querySelector('#reader-layout');}
  function computedValue(id,c){
    const saved=config.layout[id]?.[c.key];if(Number.isFinite(saved))return saved;
    const node=target(id);if(!node)return c.min;
    if(c.unit==='navWidth'||c.unit==='wordWidth'){
      const root=layoutRoot();const n=parseFloat(getComputedStyle(root).getPropertyValue(c.prop));return Number.isFinite(n)?n:c.min;
    }
    if(c.unit==='footerHeight'){
      const shell=document.querySelector('.reader-page-panel');const n=parseFloat(getComputedStyle(shell).getPropertyValue(c.prop));return Number.isFinite(n)?n:52;
    }
    if(c.unit==='paddingX')return parseFloat(getComputedStyle(node).paddingLeft)||0;
    if(c.unit==='paddingY')return parseFloat(getComputedStyle(node).paddingTop)||0;
    const n=parseFloat(getComputedStyle(node).getPropertyValue(c.prop));return Number.isFinite(n)?n:c.min;
  }

  function applyColors(){
    const root=document.documentElement;
    if(!isExplorer()){for(const v of Object.values(COLOR_VARS))root.style.removeProperty(v);return;}
    for(const [k,v] of Object.entries(COLOR_VARS))root.style.setProperty(v,config.colors[k]);
  }

  function applyOneLayout(id){
    if(!isExplorer())return;
    const def=LAYERS[id],values=config.layout[id];if(!def||!values)return;
    const node=target(id);if(!node)return;
    for(const c of def.controls){
      if(!Object.prototype.hasOwnProperty.call(values,c.key))continue;
      const value=values[c.key];
      if(c.unit==='navWidth'||c.unit==='wordWidth'){layoutRoot()?.style.setProperty(c.prop,`${value}px`,'important');continue;}
      if(c.unit==='footerHeight'){document.querySelector('.reader-page-panel')?.style.setProperty(c.prop,`${value}px`,'important');continue;}
      if(c.unit==='paddingX'){node.style.setProperty('padding-left',`${value}px`,'important');node.style.setProperty('padding-right',`${value}px`,'important');continue;}
      if(c.unit==='paddingY'){node.style.setProperty('padding-top',`${value}px`,'important');node.style.setProperty('padding-bottom',`${value}px`,'important');continue;}
      if(c.key==='width'&&id==='shell'){node.style.setProperty('width',`${value}%`,'important');node.style.setProperty('margin-left','auto','important');node.style.setProperty('margin-right','auto','important');continue;}
      node.style.setProperty(c.prop,`${value}px`,'important');
      if(id==='playback'&&c.key==='height'){node.style.setProperty('min-height',`${value}px`,'important');node.style.setProperty('max-height',`${value}px`,'important');node.style.setProperty('flex-basis',`${value}px`,'important');}
    }
  }
  function applyLayout(){if(!isExplorer()){releaseLayout();return;}for(const id of Object.keys(LAYERS))applyOneLayout(id);}

  function releaseLayer(id){
    const def=LAYERS[id],node=target(id);if(!def||!node)return;
    for(const c of def.controls){
      if(c.unit==='navWidth'||c.unit==='wordWidth'){layoutRoot()?.style.removeProperty(c.prop);continue;}
      if(c.unit==='footerHeight'){document.querySelector('.reader-page-panel')?.style.removeProperty(c.prop);continue;}
      if(c.unit==='paddingX'){node.style.removeProperty('padding-left');node.style.removeProperty('padding-right');continue;}
      if(c.unit==='paddingY'){node.style.removeProperty('padding-top');node.style.removeProperty('padding-bottom');continue;}
      node.style.removeProperty(c.prop);
      if(id==='shell'&&c.key==='width'){node.style.removeProperty('margin-left');node.style.removeProperty('margin-right');}
      if(id==='playback'&&c.key==='height'){node.style.removeProperty('min-height');node.style.removeProperty('max-height');node.style.removeProperty('flex-basis');}
    }
  }
  function releaseLayout(){for(const id of Object.keys(LAYERS))releaseLayer(id);}
  function applyAll(){applyColors();applyLayout();}

  function ensureUI(){
    if(!launcher){launcher=document.getElementById('msg-explorer-design-launcher')||document.body.appendChild(Object.assign(document.createElement('button'),{id:'msg-explorer-design-launcher',type:'button',textContent:'✦ Design',title:'Customize appearance and Reader layout',hidden:true}));launcher.addEventListener('click',openDesigner);}
    if(!panel){
      panel=document.getElementById('msg-explorer-visual-designer');
      if(!panel){panel=document.createElement('aside');panel.id='msg-explorer-visual-designer';panel.hidden=true;panel.setAttribute('aria-label','Explorer visual designer');panel.innerHTML=`
        <div class="msg-vd-head" data-vd-drag-handle title="Drag to move the Designer"><span class="msg-vd-drag-grip" aria-hidden="true">⋮⋮</span><div class="msg-vd-head-copy"><strong>Visual Designer</strong><small>Saved custom theme · Default Layout returns to the app baseline</small></div><button type="button" data-vd-close aria-label="Close designer">×</button></div>
        <div class="msg-vd-toolbar"><button type="button" data-vd-preset="explorer">Explorer Green</button><button type="button" data-vd-preset="antique">Antique Parchment</button><button type="button" data-vd-export>Export</button><button type="button" data-vd-copy>Copy JSON</button></div>
        <div class="msg-vd-scroll"><section class="msg-vd-section"><div class="msg-vd-section-title"><span>Layers</span><span>choose a layout area</span></div><div data-vd-layers></div></section><section class="msg-vd-section"><div class="msg-vd-section-title"><span>Inspector</span><span data-vd-selected-name></span></div><div data-vd-inspector></div></section><section class="msg-vd-section"><div class="msg-vd-section-title"><span>Theme colors</span><span>saved Explorer custom palette</span></div><div data-vd-colors></div></section></div>
        <div class="msg-vd-status" data-vd-status>Default Layout is the application's CSS baseline.</div>
        <div class="msg-vd-bottom-actions"><button type="button" class="msg-vd-danger" data-vd-default-layout>Default Layout</button><button type="button" data-vd-reset-layer>Reset layer</button><button type="button" class="msg-vd-save" data-vd-save>Save design</button></div>`;document.body.appendChild(panel);}
      panel.querySelector('[data-vd-close]')?.addEventListener('click',closeDesigner);
      panel.querySelector('[data-vd-save]')?.addEventListener('click',saveConfig);
      panel.querySelector('[data-vd-default-layout]')?.addEventListener('click',defaultLayout);
      panel.querySelector('[data-vd-reset-layer]')?.addEventListener('click',resetLayer);
      panel.querySelector('[data-vd-export]')?.addEventListener('click',exportConfig);
      panel.querySelector('[data-vd-copy]')?.addEventListener('click',copyConfig);
      panel.querySelectorAll('[data-vd-preset]').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.vdPreset)));
      bindPanelDragging();
    }
    render();syncVisibility();
  }

  const colorLabels={page:'Page background',surface:'Page / card surface',accent:'Primary accent',accentDark:'Dark accent',soft:'Soft accent',soft2:'Warm secondary',gold:'Brass / gold',border:'Borders',ink:'Text',muted:'Muted text'};
  function render(){
    if(!panel)return;
    const layers=panel.querySelector('[data-vd-layers]');
    layers.innerHTML=Object.entries(LAYERS).map(([id,d])=>`<button type="button" data-vd-layer="${id}" class="${selected===id?'is-selected':''}">${d.label}</button>`).join('');
    layers.querySelectorAll('[data-vd-layer]').forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.vdLayer;render();}));
    panel.querySelector('[data-vd-selected-name]').textContent=LAYERS[selected]?.label||'';
    const inspector=panel.querySelector('[data-vd-inspector]'),def=LAYERS[selected];
    inspector.innerHTML=def.controls.map(c=>{const v=Math.round(computedValue(selected,c));return`<div class="msg-vd-control"><label>${c.label}</label><output data-vd-out="${c.key}">${v}${c.unit==='%'?'%':'px'}</output><input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}" data-vd-layout="${c.key}"></div>`;}).join('');
    inspector.querySelectorAll('[data-vd-layout]').forEach(input=>input.addEventListener('input',()=>{const c=def.controls.find(x=>x.key===input.dataset.vdLayout);if(!c)return;(config.layout[selected]||={})[c.key]=Number(input.value);applyOneLayout(selected);inspector.querySelector(`[data-vd-out="${c.key}"]`).textContent=`${Math.round(Number(input.value))}${c.unit==='%'?'%':'px'}`;setStatus('Layout override is live. Save when ready.',false);}));
    const colors=panel.querySelector('[data-vd-colors]');colors.innerHTML=Object.keys(COLOR_VARS).map(k=>`<div class="msg-vd-control"><label>${colorLabels[k]}</label><input type="color" value="${config.colors[k]}" data-vd-color="${k}"></div>`).join('');
    colors.querySelectorAll('[data-vd-color]').forEach(input=>input.addEventListener('input',()=>{config.colors[input.dataset.vdColor]=input.value;config.preset='custom';applyColors();setStatus('Color override is live. Save when ready.',false);}));
  }

  function defaultLayout(){releaseLayout();config.layout={};render();setStatus('Default Layout restored from the application CSS.',true);window.dispatchEvent(new Event('resize'));}
  function resetLayer(){releaseLayer(selected);delete config.layout[selected];render();setStatus(`${LAYERS[selected].label} returned to Default Layout.`,true);window.dispatchEvent(new Event('resize'));}
  function applyPreset(name){if(!PRESETS[name])return;config.preset=name;config.colors=clone(PRESETS[name]);applyColors();render();setStatus('Color preset applied. Layout was not changed.',false);}
  function saveConfig(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(config));setStatus('Custom theme design saved.',true);}catch{setStatus('Could not save the custom theme design.',false);}}
  function exportConfig(){const blob=new Blob([JSON.stringify(config,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='mark-set-go-visual-design-v4.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('Design JSON exported.',true);}
  async function copyConfig(){try{await navigator.clipboard.writeText(JSON.stringify(config,null,2));setStatus('Design JSON copied.',true);}catch{setStatus('Clipboard copy unavailable.',false);}}
  function setStatus(msg,saved){const n=panel?.querySelector('[data-vd-status]');if(n){n.textContent=msg;n.classList.toggle('is-saved',Boolean(saved));}}

  function openDesigner(){
    if(!isExplorer()) window.MarkSetGoExperienceThemes?.apply?.('explorer');
    if(!isExplorer()) return false;
    ensureUI();
    panel.hidden=false;
    if(launcher){launcher.hidden=true;launcher.textContent='✦ Designing';}
    applyPanelPosition();
    return true;
  }
  function closeDesigner(){if(!panel)return;panel.hidden=true;if(launcher){launcher.hidden=true;launcher.textContent='✦ Design';}savePanelPosition();}
  function syncVisibility(){if(launcher)launcher.hidden=true;if(!isExplorer()&&panel)panel.hidden=true;}
  function onThemeChanged(){if(isExplorer())applyAll();else{for(const v of Object.values(COLOR_VARS))document.documentElement.style.removeProperty(v);releaseLayout();}syncVisibility();}

  function panelBounds(left,top){if(!panel)return{left:8,top:8};const r=panel.getBoundingClientRect(),m=8;return{left:Math.round(Math.min(Math.max(left,m),Math.max(m,innerWidth-r.width-m))),top:Math.round(Math.min(Math.max(top,m),Math.max(m,innerHeight-r.height-m)))}};
  function loadPanelPosition(){try{const v=JSON.parse(localStorage.getItem(PANEL_POSITION_KEY)||'null');return v&&Number.isFinite(Number(v.left))&&Number.isFinite(Number(v.top))?{left:Number(v.left),top:Number(v.top)}:null;}catch{return null;}}
  function applyPanelPosition(){if(!panel||panel.hidden)return;const p=loadPanelPosition();if(!p)return;const b=panelBounds(p.left,p.top);panel.style.left=`${b.left}px`;panel.style.top=`${b.top}px`;panel.style.right='auto';panel.style.bottom='auto';}
  function savePanelPosition(){if(!panel||panel.hidden)return;const r=panel.getBoundingClientRect(),b=panelBounds(r.left,r.top);try{localStorage.setItem(PANEL_POSITION_KEY,JSON.stringify(b));}catch{}}
  function bindPanelDragging(){const h=panel?.querySelector('[data-vd-drag-handle]');if(!h||h.dataset.vdDragBound==='1')return;h.dataset.vdDragBound='1';h.addEventListener('pointerdown',e=>{if(e.target instanceof Element&&e.target.closest('button,input,a'))return;if(panel.hidden)return;const r=panel.getBoundingClientRect();panelDrag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};h.setPointerCapture?.(e.pointerId);e.preventDefault();});h.addEventListener('pointermove',e=>{if(!panelDrag||e.pointerId!==panelDrag.id)return;const b=panelBounds(panelDrag.left+e.clientX-panelDrag.x,panelDrag.top+e.clientY-panelDrag.y);panel.style.left=`${b.left}px`;panel.style.top=`${b.top}px`;panel.style.right='auto';panel.style.bottom='auto';});const done=e=>{if(!panelDrag||e.pointerId!==panelDrag.id)return;panelDrag=null;savePanelPosition();};h.addEventListener('pointerup',done);h.addEventListener('pointercancel',done);}

  const designerApi=Object.freeze({open:openDesigner,close:closeDesigner,save:saveConfig,isOpen:()=>Boolean(panel&&!panel.hidden)});
  window.MarkSetGoVisualDesigner=designerApi;
  window.MarkSetGoExplorerVisualDesigner=designerApi;

  function init(){ensureUI();onThemeChanged();document.addEventListener('marksetgo:experience-profile-changed',onThemeChanged);window.addEventListener('pageshow',onThemeChanged);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
