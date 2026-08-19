
'use strict';

(() => {
  const KEY = 'markSetGoExperienceThemeV1';
  const THEMES = {
    classic: {
      label:'Classic',
      description:'The original Mark, Set, Go! appearance.'
    },
    explorer: {
      label:'Explorer',
      description:'Maps, natural history, expedition scenery, green and brass.'
    },
    patriotic: {
      label:'Patriotic',
      description:'American history, navy, ivory, restrained red and brass.'
    },
    scholar: {
      label:'Scholar',
      description:'Old library, manuscripts, walnut, burgundy and parchment.'
    },
    artistic: {
      label:'Artistic',
      description:'Studio and gallery atmosphere with warm creative color.'
    },
    modern: {
      label:'Modern',
      description:'Clean architecture, restrained geometry and minimal surfaces.'
    },
    galactic: {
      label:'Galactic',
      description:'Original space-opera atmosphere with stars and luminous instruments.'
    },
    expedition: {
      label:'Expedition',
      description:'Original archaeology-adventure atmosphere with maps, ruins and field journals.'
    }
  };

  const ART = {
    scholar: {
      top: svg(1200,240,`
        <defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#392419"/><stop offset="1" stop-color="#7d5b38"/></linearGradient></defs>
        <rect width="1200" height="240" fill="url(#g)"/>
        <rect x="70" y="24" width="1060" height="180" rx="8" fill="#4b2e20" stroke="#b59055" stroke-width="4"/>
        ${books(100,55,18,42)}${books(420,55,18,42)}${books(740,55,18,42)}
        <circle cx="600" cy="105" r="54" fill="#efe0af" opacity=".96"/>
        <path d="M600 60v90M555 105h90" stroke="#a27633" stroke-width="3" opacity=".6"/>
        <text x="600" y="188" text-anchor="middle" font-family="Georgia" font-size="24" fill="#f1dfb7">STUDIUM • DISCIPLINA • SAPIENTIA</text>
      `),
      left: svg(320,760,`
        <rect width="320" height="760" fill="none"/>
        <path d="M24 728h250V115H48z" fill="#5a3924" stroke="#a67c45" stroke-width="5"/>
        ${books(60,150,10,33)}${books(60,330,10,33)}${books(60,510,10,33)}
        <path d="M42 108h244l-20-45H68z" fill="#6c462a"/>
      `),
      right: svg(320,760,`
        <rect width="320" height="760" fill="none"/>
        <ellipse cx="160" cy="650" rx="118" ry="35" fill="#3d291c" opacity=".5"/>
        <path d="M115 640h92l-8-285h-76z" fill="#765033" stroke="#a88150" stroke-width="4"/>
        <path d="M82 360h156l-38-115h-80z" fill="#eadba9" stroke="#9c7441" stroke-width="4"/>
        <path d="M98 245q62-85 124 0" fill="none" stroke="#b38b4c" stroke-width="10"/>
        <circle cx="160" cy="185" r="45" fill="#e9d495" opacity=".9"/>
      `)
    },
    patriotic: {
      top: svg(1200,240,`
        <rect width="1200" height="240" fill="#f7f1e4"/>
        <path d="M0 0h1200v50H0zM0 100h1200v50H0zM0 200h1200v40H0z" fill="#a62c3b" opacity=".9"/>
        <rect width="470" height="135" fill="#183b68"/>
        ${stars(28,18,7,5,55)}
        <path d="M510 190h180l-20-92H530z" fill="#e6dbc6" stroke="#8e7b62" stroke-width="3"/>
        <path d="M600 30l28 55h-56z" fill="#d8b75f"/>
      `),
      left: svg(320,760,`<rect width="320" height="760" fill="none"/><path d="M75 720h170V190H75z" fill="#dfd8ca" stroke="#8b7f70" stroke-width="5"/><path d="M50 190h220L160 82z" fill="#ece5d6" stroke="#8b7f70" stroke-width="5"/><path d="M115 720V330h90v390" fill="#c8c1b4"/>`),
      right: svg(320,760,`<rect width="320" height="760" fill="none"/><path d="M65 700q95-180 190 0" fill="#173b68" opacity=".18"/><path d="M160 110v540" stroke="#8e6e3b" stroke-width="10"/><path d="M170 125q105 20 100 115-70-35-100-5z" fill="#a52d3d"/><path d="M170 125q80 14 95 55-57-10-95 2z" fill="#f4efe4"/>`)
    },
    artistic: {
      top: svg(1200,240,`
        <rect width="1200" height="240" fill="#efe6dc"/>
        <circle cx="250" cy="95" r="105" fill="#b46977" opacity=".38"/><circle cx="430" cy="135" r="92" fill="#d69b52" opacity=".34"/>
        <circle cx="760" cy="100" r="115" fill="#6687a0" opacity=".32"/><circle cx="945" cy="130" r="88" fill="#7c617f" opacity=".34"/>
        <path d="M60 195q240-120 470-20t610-20" fill="none" stroke="#5a3a50" stroke-width="8" opacity=".55"/>
        <rect x="530" y="30" width="140" height="155" fill="#fbf6ed" stroke="#7b5c45" stroke-width="7"/>
      `),
      left: svg(320,760,`<rect width="320" height="760" fill="none"/><path d="M54 700l90-480h25l96 480" fill="none" stroke="#7d5d42" stroke-width="14"/><rect x="80" y="180" width="160" height="220" fill="#f4eadc" stroke="#8c6a50" stroke-width="8"/><circle cx="135" cy="260" r="48" fill="#b86678" opacity=".6"/><circle cx="185" cy="315" r="42" fill="#617e9a" opacity=".55"/>`),
      right: svg(320,760,`<rect width="320" height="760" fill="none"/><ellipse cx="165" cy="600" rx="105" ry="75" fill="#c89a62" stroke="#77513b" stroke-width="7"/><circle cx="125" cy="580" r="18" fill="#9f4555"/><circle cx="175" cy="560" r="18" fill="#4e7896"/><circle cx="205" cy="610" r="18" fill="#d39b42"/><path d="M225 120L115 600" stroke="#754e38" stroke-width="12"/><path d="M245 115l-28 65-24-18 34-57z" fill="#8c5a34"/>`)
    },
    modern: {
      top: svg(1200,240,`<rect width="1200" height="240" fill="#dce3e8"/><path d="M0 190L330 45l250 145L830 70l370 120v50H0z" fill="#617582" opacity=".35"/><rect x="120" y="55" width="185" height="110" fill="#f7fafb" opacity=".85"/><rect x="885" y="40" width="170" height="130" fill="#273946" opacity=".82"/><path d="M420 40v150M450 40v150M480 40v150" stroke="#93a6b2" stroke-width="3"/>`),
      left: svg(320,760,`<rect width="320" height="760" fill="none"/><rect x="40" y="180" width="210" height="470" fill="#e9eef1" stroke="#7d909b" stroke-width="5"/><rect x="80" y="230" width="130" height="130" fill="#273b48"/><path d="M80 410h130M80 470h130M80 530h130" stroke="#9aaab3" stroke-width="6"/>`),
      right: svg(320,760,`<rect width="320" height="760" fill="none"/><path d="M80 680V250h160v430" fill="#dbe3e7" stroke="#718793" stroke-width="5"/><path d="M110 300h100v80H110zM110 420h100v80H110z" fill="#263a47"/>`)
    },
    galactic: {
      top: svg(1200,240,`<rect width="1200" height="240" fill="#050914"/>${starfield(90,1200,240)}<ellipse cx="840" cy="110" rx="170" ry="58" fill="#244965" opacity=".45"/><circle cx="840" cy="110" r="58" fill="#b5d4df"/><path d="M120 190L350 85l180 105" fill="none" stroke="#5fa7c5" stroke-width="3"/><path d="M565 190l110-125 140 125" fill="none" stroke="#d2b95f" stroke-width="3"/>`),
      left: svg(320,760,`<rect width="320" height="760" fill="none"/>${starfield(35,320,760)}<path d="M22 700V240l90-80 60 75 85-60v525" fill="#0d1724" stroke="#547e9a" stroke-width="4"/><circle cx="110" cy="330" r="12" fill="#6dc6de"/><circle cx="180" cy="420" r="8" fill="#d6ba5e"/>`),
      right: svg(320,760,`<rect width="320" height="760" fill="none"/>${starfield(35,320,760)}<path d="M68 690h190V255H68z" fill="#101b28" stroke="#5d8198" stroke-width="4"/><path d="M90 300h145v95H90z" fill="#17334a"/><circle cx="120" cy="455" r="12" fill="#75cbe1"/><circle cx="168" cy="455" r="12" fill="#d2b85d"/><circle cx="216" cy="455" r="12" fill="#a75f68"/>`)
    },
    expedition: {
      top: svg(1200,240,`<rect width="1200" height="240" fill="#c9ad78"/><path d="M0 160q210-90 400 0t400 0 400 0v80H0z" fill="#6d6c3e" opacity=".6"/><path d="M440 205l160-170 165 170z" fill="#b98d53" stroke="#6b4c2b" stroke-width="5"/><path d="M515 205l85-105 88 105z" fill="#d0aa70"/><path d="M80 40q180 50 315 15M850 45q120 20 275-8" fill="none" stroke="#6a4c2d" stroke-width="4" stroke-dasharray="10 8"/>`),
      left: svg(320,760,`<rect width="320" height="760" fill="none"/><path d="M30 700Q70 380 220 120" fill="none" stroke="#6b6636" stroke-width="22"/><path d="M75 570q80-65 150-20M105 450q75-70 140-30M140 330q70-65 125-35" fill="none" stroke="#50602d" stroke-width="14"/><rect x="55" y="520" width="120" height="150" rx="8" fill="#8a5b32" stroke="#4a301d" stroke-width="6"/>`),
      right: svg(320,760,`<rect width="320" height="760" fill="none"/><path d="M70 680h190l-35-350H105z" fill="#9b794e" stroke="#644725" stroke-width="6"/><path d="M100 330l62-130 65 130" fill="#c7a36c" stroke="#644725" stroke-width="6"/><circle cx="160" cy="160" r="55" fill="#d5b979" opacity=".72"/><path d="M160 95v130M95 160h130" stroke="#876330" stroke-width="4"/>`)
    }
  };

  let original = null;
  let dialog = null;

  function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function svg(w,h,body){
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  }
  function books(x,y,count,step){
    const colors=['#6d2c37','#31564f','#7b5a32','#3f4966','#8e6f42'];
    let out='';
    for(let i=0;i<count;i++){
      const h=75+(i%5)*8, w=18+(i%3)*4;
      out += `<rect x="${x+i*step}" y="${y+110-h}" width="${w}" height="${h}" rx="2" fill="${colors[i%colors.length]}" stroke="#2f2118" stroke-width="2"/>`;
    }
    return out;
  }
  function stars(x,y,cols,rows,step){
    let out='';
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
      const cx=x+c*step+(r%2?step/2:0), cy=y+r*22;
      if(cx<455) out+=`<circle cx="${cx}" cy="${cy}" r="3" fill="#f6f1dc"/>`;
    }
    return out;
  }
  function starfield(count,w,h){
    let out='';
    for(let i=0;i<count;i++){
      const x=(i*83)%w, y=(i*47)%h, r=(i%5===0?2:1);
      out+=`<circle cx="${x}" cy="${y}" r="${r}" fill="#d8edf7" opacity="${.35+(i%6)*.1}"/>`;
    }
    return out;
  }

  function scenery(){
    return {
      top:document.querySelector('.explorer-world-art__top'),
      left:document.querySelector('.explorer-world-art__left'),
      right:document.querySelector('.explorer-world-art__right')
    };
  }

  function rememberOriginal(){
    if(original) return;
    const nodes=scenery();
    original={
      top:nodes.top?.getAttribute('src')||'',
      left:nodes.left?.getAttribute('src')||'',
      right:nodes.right?.getAttribute('src')||''
    };
  }

  function apply(theme, save=true){
    const key = THEMES[theme] ? theme : 'classic';
    rememberOriginal();
    const root=document.documentElement;
    const nodes=scenery();

    if(key==='classic'){
      delete root.dataset.msgExperienceTheme;
      document.body?.classList.remove('msg-experience-themed');
      Object.values(nodes).forEach(node=>{ if(node) node.style.display='none'; });
    }else{
      root.dataset.msgExperienceTheme=key;
      document.body?.classList.add('msg-experience-themed');
      Object.values(nodes).forEach(node=>{ if(node) node.style.removeProperty('display'); });

      if(key==='explorer'){
        if(nodes.top && original?.top) nodes.top.src=original.top;
        if(nodes.left && original?.left) nodes.left.src=original.left;
        if(nodes.right && original?.right) nodes.right.src=original.right;
      }else if(ART[key]){
        if(nodes.top) nodes.top.src=ART[key].top;
        if(nodes.left) nodes.left.src=ART[key].left;
        if(nodes.right) nodes.right.src=ART[key].right;
      }
    }

    if(save){
      try{ localStorage.setItem(KEY,key); }catch{}
    }
    refreshPressed(key);
    window.dispatchEvent(new CustomEvent('msg:experience-theme-changed',{detail:{theme:key}}));
  }

  function current(){
    try{
      const saved=localStorage.getItem(KEY);
      if(saved && THEMES[saved]) return saved;
    }catch{}
    const active=document.documentElement.dataset.msgExperienceTheme;
    return THEMES[active] ? active : 'classic';
  }

  function ensureLauncher(){
    let launcher=document.querySelector('#msg-theme-launcher');
    if(launcher) return launcher;
    const profile=document.querySelector('.top-level-nav-button[data-action="profile-preferences"]');
    if(!profile?.parentElement) return null;
    launcher=document.createElement('button');
    launcher.id='msg-theme-launcher';
    launcher.type='button';
    launcher.className='top-level-nav-button';
    launcher.innerHTML='<span class="nav-icon" aria-hidden="true">✦</span> Themes';
    launcher.addEventListener('click',open);
    profile.insertAdjacentElement('afterend',launcher);
    return launcher;
  }

  function ensureDialog(){
    if(dialog) return dialog;
    dialog=document.createElement('div');
    dialog.id='msg-theme-dialog';
    dialog.hidden=true;
    dialog.innerHTML=`
      <section class="msg-theme-card" role="dialog" aria-modal="true" aria-labelledby="msg-theme-title">
        <div class="msg-theme-head">
          <h2 id="msg-theme-title">Experience Theme</h2>
          <button class="msg-theme-close" type="button" aria-label="Close">×</button>
        </div>
        <div class="msg-theme-grid">
          ${Object.entries(THEMES).map(([key,t])=>`
            <button type="button" class="msg-theme-choice" data-msg-theme="${esc(key)}" aria-pressed="false">
              <strong>${esc(t.label)}</strong><small>${esc(t.description)}</small>
            </button>`).join('')}
        </div>
      </section>`;
    document.body.appendChild(dialog);
    dialog.querySelector('.msg-theme-close')?.addEventListener('click',close);
    dialog.addEventListener('click',e=>{ if(e.target===dialog) close(); });
    dialog.querySelectorAll('[data-msg-theme]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        apply(btn.dataset.msgTheme,true);
        close();
      });
    });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape' && !dialog.hidden) close(); });
    return dialog;
  }

  function refreshPressed(key=current()){
    dialog?.querySelectorAll('[data-msg-theme]').forEach(btn=>{
      btn.setAttribute('aria-pressed',String(btn.dataset.msgTheme===key));
    });
  }
  function open(){
    ensureDialog();
    refreshPressed();
    dialog.hidden=false;
    dialog.querySelector(`[data-msg-theme="${current()}"]`)?.focus();
  }
  function close(){ if(dialog) dialog.hidden=true; }

  function init(){
    rememberOriginal();
    ensureLauncher();
    ensureDialog();
    apply(current(),false);
  }

  window.MarkSetGoExperienceThemes={apply,current,themes:{...THEMES}};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
