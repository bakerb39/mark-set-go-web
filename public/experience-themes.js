
'use strict';

(() => {
  const KEY = 'markSetGoExperienceThemeV1';

  const THEMES = {
    classic:{label:'Classic',description:'The original Mark, Set, Go! appearance.'},
    explorer:{label:'Explorer',description:'Maps, natural history, expedition scenery, green and brass.'},
    patriotic:{label:'Patriotic',description:'American history, navy, ivory, restrained red and brass.'},
    scholar:{label:'Scholar',description:'Old library, manuscripts, walnut, burgundy and parchment.'},
    artistic:{label:'Artistic',description:'Studio and gallery atmosphere with warm creative color.'},
    modern:{label:'Modern',description:'Clean architecture, restrained geometry and minimal surfaces.'},
    galactic:{label:'Galactic',description:'Original space-opera atmosphere with stars and luminous instruments.'},
    expedition:{label:'Expedition',description:'Original archaeology-adventure atmosphere with maps, ruins and field journals.'}
  };

  const ART = {
    scholar:{
      top:'/assets/themes/scholar/scholar-top.png?v=1.6.0',
      left:'/assets/themes/scholar/scholar-left.png?v=1.6.0',
      right:'/assets/themes/scholar/scholar-right.png?v=1.6.0'
    },
    patriotic:{
      top:'/assets/themes/patriotic/patriotic-top.png?v=1.6.0',
      left:'/assets/themes/patriotic/patriotic-left.png?v=1.6.0',
      right:'/assets/themes/patriotic/patriotic-right.png?v=1.6.0'
    },
    artistic:{
      top:'/assets/themes/artistic/artistic-top.png?v=1.6.0',
      left:'/assets/themes/artistic/artistic-left.png?v=1.6.0',
      right:'/assets/themes/artistic/artistic-right.png?v=1.6.0'
    },
    modern:{
      top:'/assets/themes/modern/modern-top.png?v=1.6.0',
      left:'/assets/themes/modern/modern-left.png?v=1.6.0',
      right:'/assets/themes/modern/modern-right.png?v=1.6.0'
    },
    galactic:{
      top:'/assets/themes/galactic/galactic-top.png?v=1.6.0',
      left:'/assets/themes/galactic/galactic-left.png?v=1.6.0',
      right:'/assets/themes/galactic/galactic-right.png?v=1.6.0'
    },
    expedition:{
      top:'/assets/themes/expedition/expedition-top.png?v=1.6.0',
      left:'/assets/themes/expedition/expedition-left.png?v=1.6.0',
      right:'/assets/themes/expedition/expedition-right.png?v=1.6.0'
    }
  };

  let original = null;
  let dialog = null;

  function esc(s){
    return String(s).replace(/[&<>"']/g,c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
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

  function setScenery(nodes,art){
    if(nodes.top && art?.top) nodes.top.src=art.top;
    if(nodes.left && art?.left) nodes.left.src=art.left;
    if(nodes.right && art?.right) nodes.right.src=art.right;
  }

  function apply(theme,save=true){
    const key=THEMES[theme] ? theme : 'classic';
    rememberOriginal();

    const root=document.documentElement;
    const nodes=scenery();

    if(key==='classic'){
      delete root.dataset.msgExperienceTheme;
      delete root.dataset.msgExperienceVariant;
      document.body?.classList.remove('msg-experience-themed');
      Object.values(nodes).forEach(node=>{if(node) node.style.display='none';});
    }else{
      /*
       * ONE LAYOUT ENGINE:
       * Every illustrated theme deliberately remains "explorer" structurally.
       * This makes the already-working Explorer CSS/Reader shell/Designer own
       * all geometry. The selected visual identity lives in a separate variant
       * attribute and only changes artwork/palette.
       */
      root.dataset.msgExperienceTheme='explorer';
      if(key==='explorer') delete root.dataset.msgExperienceVariant;
      else root.dataset.msgExperienceVariant=key;

      document.body?.classList.add('msg-experience-themed');
      Object.values(nodes).forEach(node=>{if(node) node.style.removeProperty('display');});

      if(key==='explorer') setScenery(nodes,original);
      else setScenery(nodes,ART[key]);
    }

    if(save){
      try{localStorage.setItem(KEY,key);}catch{}
    }
    refreshPressed(key);
    window.dispatchEvent(new CustomEvent('msg:experience-theme-changed',{detail:{theme:key}}));
  }

  function current(){
    try{
      const saved=localStorage.getItem(KEY);
      if(saved && THEMES[saved]) return saved;
    }catch{}
    const root=document.documentElement;
    const variant=root.dataset.msgExperienceVariant;
    if(variant && THEMES[variant]) return variant;
    const active=root.dataset.msgExperienceTheme;
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
              <strong>${esc(t.label)}</strong>
              <small>${esc(t.description)}</small>
            </button>`).join('')}
        </div>
      </section>`;

    document.body.appendChild(dialog);
    dialog.querySelector('.msg-theme-close')?.addEventListener('click',close);
    dialog.addEventListener('click',e=>{if(e.target===dialog) close();});
    dialog.querySelectorAll('[data-msg-theme]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        apply(btn.dataset.msgTheme,true);
        close();
      });
    });
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape' && !dialog.hidden) close();
    });

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

  function close(){
    if(dialog) dialog.hidden=true;
  }

  function init(){
    rememberOriginal();
    ensureLauncher();
    ensureDialog();
    apply(current(),false);
  }

  window.MarkSetGoExperienceThemes={apply,current,themes:{...THEMES}};

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    init();
  }
})();
