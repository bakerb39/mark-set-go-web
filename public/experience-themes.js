'use strict';

(() => {
  const THEMES = {
    classic:{label:'Classic',description:'The original Mark, Set, Go! appearance.',appearance:'default'},
    explorer:{label:'Explorer',description:'Maps, natural history, expedition scenery, green and brass.',appearance:'explorer'},
    patriotic:{label:'Patriotic',description:'American history, navy, ivory, restrained red and brass.',appearance:'patriotic'},
    scholar:{label:'Scholar',description:'Old library, manuscripts, walnut, burgundy and parchment.',appearance:'scholar'},
    artistic:{label:'Artistic',description:'Studio and gallery atmosphere with warm creative color.',appearance:'artistic'},
    modern:{label:'Modern',description:'Clean architecture, restrained geometry and minimal surfaces.',appearance:'modern'},
    galactic:{label:'Galactic',description:'Original space-opera atmosphere with stars and luminous instruments.',appearance:'galactic'},
    expedition:{label:'Expedition',description:'Original archaeology-adventure atmosphere with maps, ruins and field journals.',appearance:'expedition'}
  };

  const APPEARANCE_TO_THEME = Object.fromEntries(
    Object.entries(THEMES).map(([theme,value]) => [value.appearance,theme])
  );

  const ART = {
    explorer:{
      top:'/assets/explorer/explorer-top.png?v=1.0.0',
      left:'/assets/explorer/explorer-left.png?v=1.0.0',
      right:'/assets/explorer/explorer-right.png?v=1.0.0'
    },
    scholar:{
      top:'/assets/themes/scholar/scholar-top.png?v=20260819-art-v1',
      left:'/assets/themes/scholar/scholar-left.png?v=20260819-art-v1',
      right:'/assets/themes/scholar/scholar-right.png?v=20260819-art-v1'
    },
    patriotic:{
      top:'/assets/themes/patriotic/patriotic-top.png?v=20260819-art-v1',
      left:'/assets/themes/patriotic/patriotic-left.png?v=20260819-art-v1',
      right:'/assets/themes/patriotic/patriotic-right.png?v=20260819-art-v1'
    },
    artistic:{
      top:'/assets/themes/artistic/artistic-top.png?v=20260819-art-v1',
      left:'/assets/themes/artistic/artistic-left.png?v=20260819-art-v1',
      right:'/assets/themes/artistic/artistic-right.png?v=20260819-art-v1'
    },
    modern:{
      top:'/assets/themes/modern/modern-top.png?v=20260819-art-v1',
      left:'/assets/themes/modern/modern-left.png?v=20260819-art-v1',
      right:'/assets/themes/modern/modern-right.png?v=20260819-art-v1'
    },
    galactic:{
      top:'/assets/themes/galactic/galactic-top.png?v=20260819-art-v1',
      left:'/assets/themes/galactic/galactic-left.png?v=20260819-art-v1',
      right:'/assets/themes/galactic/galactic-right.png?v=20260819-art-v1'
    },
    expedition:{
      top:'/assets/themes/expedition/expedition-top.png?v=20260819-art-v2',
      left:'/assets/themes/expedition/expedition-left.png?v=20260819-art-v2',
      right:'/assets/themes/expedition/expedition-right.png?v=20260819-art-v2'
    }
  };

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

  function setScenery(nodes,art){
    if(nodes.top && art?.top) nodes.top.src=art.top;
    if(nodes.left && art?.left) nodes.left.src=art.left;
    if(nodes.right && art?.right) nodes.right.src=art.right;
  }

  function themeFromAppearance(appearance){
    return APPEARANCE_TO_THEME[String(appearance || 'default')] || 'classic';
  }

  function syncVisualState(appearance){
    const key=themeFromAppearance(appearance);
    const root=document.documentElement;
    const nodes=scenery();
    const themeClasses=Object.keys(THEMES).map(name=>`msg-theme-${name}`);

    root.classList.remove(...themeClasses);
    root.classList.add(`msg-theme-${key}`);

    /*
     * Reader mechanics are shared by every appearance. This attribute selects
     * mechanics only; visual colors MUST come from data-msg-experience-theme.
     */
    root.dataset.msgExperienceLayout='explorer';

    /*
     * One profile pipeline for every appearance. The saved appearance value is
     * always exposed to CSS. Default and Explorer are no longer special JS
     * branches; their own CSS sources decide how they look.
     */
    const appearanceKey=THEMES[key].appearance;
    if(appearanceKey==='default'){
      delete root.dataset.msgExperienceTheme;
    }else{
      root.dataset.msgExperienceTheme=appearanceKey;
    }

    if(ART[appearanceKey]) setScenery(nodes,ART[appearanceKey]);

    refreshPressed(key);
    return key;
  }

  function current(){
    const profile=window.MarkSetGoExperienceProfile?.get?.();
    return themeFromAppearance(profile?.appearance || 'default');
  }

  function apply(theme){
    const key=THEMES[theme] ? theme : 'classic';
    const profileApi=window.MarkSetGoExperienceProfile;
    if(!profileApi?.get || !profileApi?.save) return;

    const currentProfile=profileApi.get();
    profileApi.save({
      preset:currentProfile.preset,
      appearance:THEMES[key].appearance,
      features:{...(currentProfile.features || {})}
    });

    /*
     * Apply the visual state immediately as well as listening for the profile
     * event. Theme rendering must not depend on event delivery/timing.
     */
    syncVisualState(THEMES[key].appearance);
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
        apply(btn.dataset.msgTheme);
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
    ensureLauncher();
    ensureDialog();

    const profile=window.MarkSetGoExperienceProfile?.get?.();
    syncVisualState(profile?.appearance || 'default');

    // Run before Explorer Designer's normal listener so it sees the NEW theme
    // and releases Explorer-owned inline colors/layout when leaving Explorer.
    document.addEventListener('marksetgo:experience-profile-changed',event=>{
      syncVisualState(event.detail?.profile?.appearance || 'default');
    }, { capture:true });
  }

  window.MarkSetGoExperienceThemes={apply,current,themes:{...THEMES}};

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    init();
  }
})();
