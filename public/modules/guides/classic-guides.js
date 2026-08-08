
(() => {
  'use strict';
  const app = () => document.querySelector('#app');
  const ROOT = '/data/';
  const state = { catalog: [], guide: null, tab: 'Guide', query: '', era: 'All', category: 'All' };

  function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  async function json(path){ const r=await fetch(path,{cache:'no-store'}); if(!r.ok) throw new Error(`Could not load ${path}`); return r.json(); }
  function normalizeGuideTitle(value=''){
    return String(value)
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/^the\s+/, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function isGreatBooksPage(){
    const h = [...document.querySelectorAll('h1,h2')]
      .find(el => /great books of the western world/i.test(el.textContent || ''));
    return Boolean(h);
  }

  function makeClassicGuideButton(id, label='Classic Guide'){
    const b=document.createElement('button');
    b.type='button';
    b.dataset.classicGuideId=id;
    b.className='cg-great-books-btn';
    b.textContent=label;
    return b;
  }

  function injectGreatBooksHeaderButton(){
    if(!isGreatBooksPage()) return false;
    if(document.querySelector('[data-cg-open-library]')) return true;

    const searchBtn=[...document.querySelectorAll('button')]
      .find(b => /search gutenberg/i.test((b.textContent || '').trim()));
    const returnBtn=[...document.querySelectorAll('button')]
      .find(b => /return to reader/i.test((b.textContent || '').trim()));
    const anchor=searchBtn || returnBtn;
    if(!anchor) return false;

    const b=document.createElement('button');
    b.type='button';
    b.dataset.cgOpenLibrary='1';
    b.className=anchor.className || '';
    b.textContent='Classic Guides';
    anchor.insertAdjacentElement('beforebegin',b);
    return true;
  }

  function rowHasReadyGuide(row, readyByTitle){
    const text = normalizeGuideTitle(row.textContent || '');
    // Prefer exact title matches by looking for the title inside the row text.
    for(const [title,id] of readyByTitle){
      if(text.includes(title)) return id;
    }
    return null;
  }

  async function injectGreatBooksRowButtons(){
    if(!isGreatBooksPage()) return false;
    if(!state.catalog.length){
      try{ state.catalog=await json(ROOT+'classic-guides-catalog.json'); }
      catch(_e){ return false; }
    }

    const ready = state.catalog
      .filter(x => x.status === 'ready')
      .map(x => [normalizeGuideTitle(x.title), x.id]);

    const importButtons=[...document.querySelectorAll('button')]
      .filter(b => /find\s*&\s*import edition/i.test((b.textContent || '').trim()));

    for(const importBtn of importButtons){
      // Walk upward until we find the work row containing the neighboring actions.
      let row=importBtn.parentElement;
      for(let depth=0; row && depth<5; depth++, row=row.parentElement){
        const text=row.textContent || '';
        if(/study\s*\/\s*great ideas/i.test(text) && /grokipedia/i.test(text)) break;
      }
      if(!row) continue;
      if(row.querySelector('[data-classic-guide-id]')) continue;

      const id=rowHasReadyGuide(row, ready);
      if(!id) continue;

      const studyBtn=[...row.querySelectorAll('button')]
        .find(b => /study\s*\/\s*great ideas/i.test((b.textContent || '').trim()));
      const grokBtn=[...row.querySelectorAll('button')]
        .find(b => /grokipedia/i.test((b.textContent || '').trim()));

      const b=makeClassicGuideButton(id);
      if(grokBtn) grokBtn.insertAdjacentElement('beforebegin',b);
      else if(studyBtn) studyBtn.insertAdjacentElement('afterend',b);
      else importBtn.insertAdjacentElement('afterend',b);
    }
    return true;
  }

  function installGreatBooksIntegration(){
    const refresh=()=>{
      if(!isGreatBooksPage()) return;
      injectGreatBooksHeaderButton();
      injectGreatBooksRowButtons();
    };
    refresh();

    let scheduled=false;
    const observer=new MutationObserver(()=>{
      if(scheduled) return;
      scheduled=true;
      requestAnimationFrame(()=>{
        scheduled=false;
        refresh();
      });
    });
    observer.observe(document.querySelector('#app') || document.body,{
      childList:true,
      subtree:true
    });
    window.__classicGuidesGreatBooksObserver=observer;
  }

  async function openLibrary(){
    ensureCss();
    if(!state.catalog.length) state.catalog=await json(ROOT+'classic-guides-catalog.json');
    state.guide=null; renderLibrary();
  }
  function uniq(k){return [...new Set(state.catalog.map(x=>x[k]))].sort();}
  function renderLibrary(){
    const root=app(); if(!root)return;
    const q=state.query.toLowerCase().trim();
    const rows=state.catalog.filter(x=>(!q||`${x.title} ${x.author} ${x.category}`.toLowerCase().includes(q))&&(state.era==='All'||x.era===state.era)&&(state.category==='All'||x.category===state.category));
    root.innerHTML=`<div class="classic-guides-shell">
      <aside class="cg-sidebar"><h2>CLASSIC GUIDES</h2><p>The Great Conversation, one work at a time.</p>
        <button class="cg-nav-btn active">All Classic Guides</button>
        <button class="cg-nav-btn" data-cg-filter="Ancient">Ancient World</button>
        <button class="cg-nav-btn" data-cg-filter="Medieval">Medieval</button>
        <button class="cg-nav-btn" data-cg-filter="Renaissance">Renaissance</button>
        <button class="cg-nav-btn" data-cg-filter="Enlightenment">Enlightenment</button>
        <button class="cg-nav-btn" data-cg-filter="19th Century">19th Century</button>
        <button class="cg-nav-btn" data-cg-filter="20th Century">20th Century</button>
      </aside>
      <section class="cg-main">
        <div class="cg-hero"><div class="cg-kicker">GREAT BOOKS OF THE WESTERN WORLD</div><h1>Classic Guides</h1>
          <p>Independent reading companions for the works in the Great Books tradition. Understand the context, arguments, characters, themes, Great Ideas, and connections across the centuries.</p>
          <div class="cg-tools">
            <input id="cg-search" value="${esc(state.query)}" placeholder="Search title, author, or subject…">
            <select id="cg-era"><option>All</option>${uniq('era').map(x=>`<option ${x===state.era?'selected':''}>${esc(x)}</option>`).join('')}</select>
            <select id="cg-category"><option>All</option>${uniq('category').map(x=>`<option ${x===state.category?'selected':''}>${esc(x)}</option>`).join('')}</select>
          </div>
        </div>
        <p class="cg-count">${rows.length} works shown · ${state.catalog.filter(x=>x.status==='ready').length} complete guide available</p>
        <div class="cg-grid">${rows.map(card).join('')}</div>
      </section></div>`;
    bindLibrary();
  }
  function card(x){return `<article class="cg-card ${x.status==='ready'?'ready':''}">
    <span class="cg-badge ${x.status==='ready'?'ready':''}">${x.status==='ready'?'GUIDE READY':'COMING SOON'}</span>
    <h3>${esc(x.title)}</h3><div class="author">${esc(x.author)}</div>
    <div class="meta">Vol. ${esc(x.volume)} · ${esc(x.era)} · ${esc(x.category)}</div>
    <button class="cg-open" ${x.status==='ready'?`data-cg-open="${esc(x.id)}"`:'disabled'}>${x.status==='ready'?'Open Guide':'Guide Coming Soon'}</button>
  </article>`}
  function bindLibrary(){
    const s=document.querySelector('#cg-search'),e=document.querySelector('#cg-era'),c=document.querySelector('#cg-category');
    s?.addEventListener('input',()=>{state.query=s.value;renderLibrary()}); e?.addEventListener('change',()=>{state.era=e.value;renderLibrary()}); c?.addEventListener('change',()=>{state.category=c.value;renderLibrary()});
    document.querySelectorAll('[data-cg-open]').forEach(b=>b.addEventListener('click',()=>openGuide(b.dataset.cgOpen)));
    document.querySelectorAll('[data-cg-filter]').forEach(b=>b.addEventListener('click',()=>{state.era=b.dataset.cgFilter;renderLibrary()}));
  }
  async function openGuide(id){
    if(id!=='iliad') return;
    state.guide=await json(ROOT+'classic-guide-iliad.json'); state.tab='Guide'; renderGuide();
  }
  function renderGuide(){
    const g=state.guide,root=app(); if(!g||!root)return;
    root.innerHTML=`<div class="cg-guide-page"><div class="cg-guide-header">
      <div class="cg-titlebar"><div><button class="cg-back" data-cg-back>← Back to Classic Guides</button><h1>${esc(g.title)}</h1><p>${esc(g.author)} · ${esc(g.subtitle)}</p></div></div>
      <div class="cg-tabs">${g.tabs.map(t=>`<button class="cg-tab ${t===state.tab?'active':''}" data-cg-tab="${esc(t)}">${esc(t)}${t==='Images'?' (0)':''}</button>`).join('')}</div>
    </div>${guideBody(g)}</div>`;
    document.querySelector('[data-cg-back]')?.addEventListener('click',openLibrary);
    document.querySelectorAll('[data-cg-tab]').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.cgTab;renderGuide()}));
    document.querySelectorAll('[data-cg-section]').forEach(b=>b.addEventListener('click',()=>document.querySelector(`#cg-sec-${b.dataset.cgSection}`)?.scrollIntoView({behavior:'smooth'})));
    document.querySelector('[data-cg-check]')?.addEventListener('click',scoreQuiz);
  }
  function guideBody(g){
    if(state.tab!=='Guide') return `<div class="cg-guide-body"><div></div><main class="cg-content">${tabPanel(g)}</main><div></div></div>`;
    return `<div class="cg-guide-body">
      <aside class="cg-toc"><h3>CONTENTS</h3>${g.sections.map((s,i)=>`<button data-cg-section="${i}">${i+1}. ${esc(s.title)}</button>`).join('')}</aside>
      <main class="cg-content">${g.sections.map((s,i)=>`<section class="cg-section" id="cg-sec-${i}"><h2>${i+1}. ${esc(s.title)}</h2>${s.body.map(p=>`<p>${esc(p)}</p>`).join('')}<div class="cg-remember"><strong>Key idea to remember:</strong> ${esc(s.remember)}</div><div class="cg-mark-box"><strong>Ask Mark About This Section</strong><br><button data-cg-ask="Explain ${esc(s.title)}">Explain this more deeply</button><button data-cg-ask="Compare ${esc(s.title)}">Connect it to another Great Book</button></div></section>`).join('')}</main>
      <aside class="cg-aside"><h3>GUIDE AT A GLANCE</h3><ul class="cg-facts"><li>⏱ ${esc(g.meta.readingTime)}</li><li>📄 ${esc(g.meta.length)}</li><li>🏷 ${esc(g.meta.category)}</li><li>◎ ${esc(g.meta.bestFor)}</li></ul><h3>GREAT IDEAS</h3><div class="cg-idea-tags">${g.greatIdeas.map(x=>`<span>${esc(x)}</span>`).join('')}</div></aside>
    </div>`;
  }
  function tabPanel(g){
    if(state.tab==='Key Ideas') return `<h2 class="cg-panel-title">Key Ideas</h2><div class="cg-idea-tags">${g.greatIdeas.map(x=>`<span>${esc(x)}</span>`).join('')}</div><p>The Iliad connects these ideas through characters and choices rather than abstract definitions. Future versions will link each tag directly into the Great Ideas/Syntopicon workspace.</p>`;
    if(state.tab==='Quiz') return `<h2 class="cg-panel-title">Quiz</h2>${g.quiz.map((q,i)=>`<div class="cg-quiz-q"><strong>${i+1}. ${esc(q.q)}</strong>${q.choices.map((c,j)=>`<label><input type="radio" name="cgq${i}" value="${j}"> ${esc(c)}</label>`).join('')}</div>`).join('')}<button class="cg-open cg-check" data-cg-check>Check Answers</button><p id="cg-score"></p>`;
    if(state.tab==='Action Plan') return `<h2 class="cg-panel-title">Reading & Study Plan</h2><ol>${g.actionPlan.map(x=>`<li style="margin:12px 0;line-height:1.6">${esc(x)}</li>`).join('')}</ol>`;
    if(state.tab==='Images') return `<h2 class="cg-panel-title">Images</h2><p>The image gallery is intentionally empty in v1. The module is ready for curated public-domain maps, art, artifacts, and character/location visuals.</p>`;
    if(state.tab==='Notebook') return `<h2 class="cg-panel-title">Notebook</h2><p>This tab is reserved for the existing Mark, Set, Go! notebook integration. The Classic Guides module does not alter notebook storage.</p>`;
    if(state.tab==='Ask Mark Chats') return `<h2 class="cg-panel-title">Ask Mark Chats</h2><p>This tab is reserved for guide-specific conversations with Mark. The v1 scaffold avoids changing the existing Ask Mark runtime.</p>`;
    return `<h2 class="cg-panel-title">${esc(state.tab)}</h2><p>Classic-guide content for this tab is ready to be expanded.</p>`;
  }
  function scoreQuiz(){
    let n=0; state.guide.quiz.forEach((q,i)=>{const el=document.querySelector(`input[name="cgq${i}"]:checked`); if(el&&Number(el.value)===q.answer)n++;});
    const out=document.querySelector('#cg-score'); if(out) out.innerHTML=`<strong>${n}/${state.guide.quiz.length} correct.</strong>`;
  }
  document.addEventListener('click',e=>{
    const libraryBtn=e.target.closest('[data-cg-open-library]');
    const guideBtn=e.target.closest('[data-classic-guide-id]');
    if(!libraryBtn && !guideBtn) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    document.querySelectorAll('details[open]').forEach(d=>d.removeAttribute('open'));

    const run = guideBtn
      ? openGuide(guideBtn.dataset.classicGuideId)
      : openLibrary();

    Promise.resolve(run).catch(err=>{
      if(app()) app().innerHTML=`<p style="padding:30px">Classic Guides could not load: ${esc(err.message)}</p>`;
    });
  },true);
  window.MarkSetGoClassicGuides={open:openLibrary};
  function init(){ensureCss();installGreatBooksIntegration();}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
