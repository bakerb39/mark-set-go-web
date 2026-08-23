(() => {
  'use strict';
  const DRAFT_KEY='markSetGoComparisonDraftV1';
  const SAVED_KEY='markSetGoComparisonProjectsV1';
  const DB_NAME='markSetGoLocalLibraryV1';
  const STORE_NAME='books';
  const GREAT_IDEAS=['Angel','Animal','Aristocracy','Art','Astronomy','Beauty','Being','Cause','Chance','Change','Citizen','Constitution','Courage','Custom','Definition','Democracy','Desire','Dialectic','Duty','Education','Element','Emotion','Equality','Eternity','Evolution','Experience','Family','Fate','Form','God','Good and Evil','Government','Habit','Happiness','History','Honor','Hypothesis','Idea','Immortality','Induction','Infinity','Judgment','Justice','Knowledge','Labor','Language','Law','Liberty','Life and Death','Logic','Love','Man','Mathematics','Matter','Memory and Imagination','Metaphysics','Mind','Monarchy','Nature','Necessity and Contingency','Oligarchy','One and Many','Opinion','Opposition','Philosophy','Pleasure and Pain','Poetry','Principle','Progress','Prophecy','Prudence','Punishment','Quality','Quantity','Reasoning','Relation','Religion','Revolution','Rhetoric','Same and Other','Science','Sense','Sign and Symbol','Sin','Slavery','Soul','Space','State','Temperance','Theology','Time','Truth','Tyranny','Universal and Particular','Virtue and Vice','War and Peace','Wealth','Will','Wisdom','World'];
  const STOP=new Set('a an and are as at be been being but by can could did do does for from had has have he her hers him his how i if in into is it its may me might more most must my no not of on one or our ours she should so some such than that the their theirs them then there these they this those through to too under up us very was we were what when where which who why will with would you your yours'.split(' '));
  const $=s=>document.querySelector(s);
  const $$=s=>[...document.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const words=s=>String(s||'').toLowerCase().match(/[a-z][a-z'-]{2,}/g)||[];
  const PARAMS=new URLSearchParams(window.location.search);
  const PASSAGE_BASKET_MODE=PARAMS.get('passageBasket')==='1';
  const state=PASSAGE_BASKET_MODE
    ? {id:`comparison-${Date.now()}`,createdAt:new Date().toISOString(),primary:{title:'Waiting for selected passages',passage:'Return to a Reader, highlight passages, and choose Compare.'},comparisonTexts:[],mode:'agreement',notes:''}
    : loadDraft();
  let passageBasketChannel=null;

  function loadDraft(){
    try{
      const parsed=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');
      if(parsed?.primary?.passage) return {...parsed,comparisonTexts:Array.isArray(parsed.comparisonTexts)?parsed.comparisonTexts:[],mode:parsed.mode||'syntopicon',notes:parsed.notes||''};
    }catch{}
    return {id:`comparison-${Date.now()}`,createdAt:new Date().toISOString(),primary:{title:'No passage selected',passage:'Return to the reader, highlight a passage, and choose Compare.'},comparisonTexts:[],mode:'syntopicon',notes:''};
  }
  function persist(){if(PASSAGE_BASKET_MODE)return;try{localStorage.setItem(DRAFT_KEY,JSON.stringify(state));}catch{}}
  function renderPrimary(){
    $('#primary-title').textContent=state.primary.title||'Current text';
    $('#primary-passage').textContent=state.primary.passage||'';
    $('#primary-location').textContent=state.primary.chapter||((Number.isFinite(state.primary.startIndex))?`Word ${Number(state.primary.startIndex)+1}`:'');
  }
  function applyPassageBasket(items){
    const list=(Array.isArray(items)?items:[]).filter(item=>item&&String(item.text||item.passage||'').trim()).slice(0,8);
    if(!list.length)return false;
    const first=list[0];
    state.id=`comparison-${Date.now()}`;
    state.createdAt=new Date().toISOString();
    state.primary={
      documentId:first.documentId||'',
      title:first.title||'Selected passage',
      author:first.author||'',
      passage:String(first.text||first.passage||'').trim(),
      startIndex:Number.isFinite(Number(first.startIndex))?Number(first.startIndex):null,
      endIndex:Number.isFinite(Number(first.endIndex))?Number(first.endIndex):null,
      chapter:first.chapter||'',
      source:null
    };
    state.comparisonTexts=list.slice(1).map((item,index)=>({
      id:item.id||`passage-${index+2}-${Date.now()}`,
      title:item.title||`Passage ${index+2}`,
      author:item.author||'',
      text:String(item.text||item.passage||'').trim(),
      origin:[item.chapter,item.readerLabel,'Selected passage'].filter(Boolean)[0]||'Selected passage',
      passageOnly:true,
      chapter:item.chapter||'',
      startIndex:Number.isFinite(Number(item.startIndex))?Number(item.startIndex):null
    }));
    state.mode='agreement';
    renderPrimary();
    renderAll();
    return true;
  }
  function requestPassageBasket(){
    if(!PASSAGE_BASKET_MODE)return;
    const save=$('#save-workspace');
    if(save){save.hidden=true;save.title='Live passage comparisons are kept in memory rather than browser storage.';}
    try{
      if(window.opener&&!window.opener.closed){
        window.opener.postMessage({type:'msg-passage-comparison-workspace-ready'},window.location.origin);
      }
    }catch{}
    if('BroadcastChannel' in window){
      try{
        passageBasketChannel=new BroadcastChannel('msg-passage-comparison-v1');
        passageBasketChannel.addEventListener('message',event=>{
          const data=event.data||{};
          if(data.type==='state'&&Array.isArray(data.passages))applyPassageBasket(data.passages);
        });
        passageBasketChannel.postMessage({type:'request-state',source:`workspace-${Date.now()}`});
      }catch{passageBasketChannel=null;}
    }
  }
  function init(){
    renderPrimary();
    $('#workspace-notes').value=state.notes||'';
    bind(); renderAll(); requestPassageBasket();
  }
  function bind(){
    $('#add-text').addEventListener('click',openAddDialog); $('#add-text-secondary').addEventListener('click',openAddDialog);
    $('#close-workspace').addEventListener('click',()=>window.close());
    $('#save-workspace').addEventListener('click',saveProject);
    $('#workspace-notes').addEventListener('input',e=>{state.notes=e.target.value;persist();});
    $$('#comparison-modes [data-mode]').forEach(btn=>btn.addEventListener('click',()=>{state.mode=btn.dataset.mode;persist();renderAll();}));
    $$('#add-text-dialog [data-dialog-tab]').forEach(btn=>btn.addEventListener('click',()=>activateDialogTab(btn.dataset.dialogTab)));
    $('#add-pasted-text').addEventListener('click',addPastedText);
    $('#upload-text').addEventListener('change',handleUpload);
    $('#analyze-mark').addEventListener('click',askMarkToCompare);
  }
  async function openAddDialog(){
    activateDialogTab('library');
    const dialog=$('#add-text-dialog'); dialog.showModal();
    await renderLibrary();
  }
  function activateDialogTab(tab){
    $$('#add-text-dialog [data-dialog-tab]').forEach(b=>b.classList.toggle('active',b.dataset.dialogTab===tab));
    $$('#add-text-dialog [data-dialog-panel]').forEach(p=>p.hidden=p.dataset.dialogPanel!==tab);
  }
  function openDb(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE_NAME))r.result.createObjectStore(STORE_NAME,{keyPath:'key'});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function allLibraryBooks(){
    try{const db=await openDb();const rows=await new Promise((res,rej)=>{const tx=db.transaction(STORE_NAME,'readonly');const rq=tx.objectStore(STORE_NAME).getAll();rq.onsuccess=()=>res(rq.result||[]);rq.onerror=()=>rej(rq.error);});db.close();return rows.filter(x=>x?.text); }catch{return [];}
  }
  async function renderLibrary(){
    const box=$('#library-list'); box.innerHTML='<p class="muted">Loading saved books…</p>';
    const books=await allLibraryBooks();
    if(!books.length){box.innerHTML='<div class="empty-state">No locally saved full texts were found. Use Paste text or Upload file.</div>';return;}
    box.innerHTML=books.map((b,i)=>`<div class="library-choice"><div><strong>${esc(b.title||'Untitled')}</strong><small>${esc(b.author||b.source?.author||'')} · ${(words(b.text).length).toLocaleString()} words</small></div><button class="primary" type="button" data-library-index="${i}">Add</button></div>`).join('');
    box.querySelectorAll('[data-library-index]').forEach(btn=>btn.addEventListener('click',()=>{const b=books[Number(btn.dataset.libraryIndex)];addSource({id:b.key||`library-${Date.now()}`,title:b.title||'Untitled',author:b.author||b.source?.author||'',text:b.text,origin:'My Library'});$('#add-text-dialog').close();}));
  }
  function addPastedText(){
    const title=$('#paste-title').value.trim()||'Pasted text'; const author=$('#paste-author').value.trim(); const text=$('#paste-text').value.trim();
    if(!text){$('#paste-text').focus();return;}
    addSource({id:`paste-${Date.now()}`,title,author,text,origin:'Pasted text'}); $('#paste-title').value='';$('#paste-author').value='';$('#paste-text').value='';$('#add-text-dialog').close();
  }
  async function handleUpload(event){
    const file=event.target.files?.[0]; if(!file)return; const status=$('#upload-status'); status.textContent='Reading file…';
    try{let text=await file.text();if(/\.html?$/i.test(file.name)){const doc=new DOMParser().parseFromString(text,'text/html');text=doc.body?.innerText||text;} text=text.trim();if(!text)throw new Error('The file did not contain readable text.');addSource({id:`file-${Date.now()}`,title:file.name.replace(/\.[^.]+$/,''),author:'',text,origin:'Uploaded file'});status.textContent='';event.target.value='';$('#add-text-dialog').close();}catch(e){status.textContent=e.message;status.className='muted status-error';}
  }
  function addSource(source){
    if(state.comparisonTexts.some(x=>x.id===source.id))return;
    state.comparisonTexts.push(source);persist();renderAll();
  }
  function removeSource(id){state.comparisonTexts=state.comparisonTexts.filter(x=>x.id!==id);persist();renderAll();}
  function renderAll(){
    $$('#comparison-modes [data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
    const labels={syntopicon:'Syntopicon ideas',arguments:'Key arguments',agreement:'Agreement & difference',definitions:'Definitions',themes:'Themes'}; $('#analysis-heading').textContent=labels[state.mode]||labels.syntopicon;
    renderSources();renderIdeas();renderPassages();$('#mark-analysis').hidden=true;
  }
  function renderSources(){
    const box=$('#source-list');
    if(!state.comparisonTexts.length){box.innerHTML='<div class="empty-state">Add a book, article, or passage to begin comparing.</div>';return;}
    box.innerHTML=state.comparisonTexts.map(s=>`<article class="source-item"><h3>${esc(s.title)}</h3><p>${esc(s.author||s.origin||'Comparison text')}</p><footer><small>${words(s.text).length.toLocaleString()} words</small><button type="button" data-remove-source="${esc(s.id)}">Remove</button></footer></article>`).join('');
    box.querySelectorAll('[data-remove-source]').forEach(b=>b.addEventListener('click',()=>removeSource(b.dataset.removeSource)));
  }
  function keyTerms(text,limit=24){const counts=new Map();for(const w of words(text)){if(STOP.has(w))continue;counts.set(w,(counts.get(w)||0)+1);}return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(x=>x[0]);}
  function detectedIdeas(){
    const corpus=[state.primary.passage,...state.comparisonTexts.map(x=>x.text.slice(0,20000))].join(' ').toLowerCase();
    const terms=new Set(keyTerms(corpus,80));
    const direct=GREAT_IDEAS.filter(idea=>idea.toLowerCase().split(/\W+/).some(w=>w.length>3&&(corpus.includes(w)||terms.has(w))));
    const fallback=['Truth','Knowledge','Justice','Happiness','Virtue and Vice','Government','Liberty','Education','Love','Good and Evil'];
    return [...new Set([...direct,...fallback])].slice(0,12);
  }
  function renderIdeas(){const ideas=detectedIdeas();$('#idea-chips').innerHTML=ideas.map(i=>`<span class="idea-chip">${esc(i)}</span>`).join('');}
  function chunks(text,size=900){const paras=String(text||'').split(/\n\s*\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);const out=[];for(const p of paras){if(p.length<=size)out.push(p);else for(let i=0;i<p.length;i+=size)out.push(p.slice(i,i+size));}return out;}
  function scoreChunk(chunk,queryTerms){const set=new Set(words(chunk));let score=0;for(const t of queryTerms)if(set.has(t))score+=1;return score;}
  function bestPassages(source){const query=keyTerms(state.primary.passage,22);return chunks(source.text).map((text,index)=>({text,index,score:scoreChunk(text,query)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,3);}
  function renderPassages(){
    const box=$('#passage-results'); if(!state.comparisonTexts.length){box.innerHTML='';return;}
    const cards=[];for(const source of state.comparisonTexts){const matches=bestPassages(source);if(!matches.length){cards.push(`<article class="passage-card"><header><div><h3>${esc(source.title)}</h3><small>No strong lexical match found</small></div></header><p class="muted">Ask Mark can still compare the full text conceptually.</p></article>`);continue;}for(const m of matches){cards.push(`<article class="passage-card"><header><div><h3>${esc(source.title)}</h3><small>${esc(source.author||source.origin||'')} · passage ${m.index+1}</small></div><span class="score">${m.score} shared terms</span></header><blockquote>${esc(m.text)}</blockquote></article>`);}}
    box.innerHTML=cards.join('');
  }
  async function askMarkToCompare(){
    const panel=$('#mark-analysis');panel.hidden=false;if(!state.comparisonTexts.length){panel.innerHTML='<p>Add at least one comparison text first.</p>';return;}
    panel.innerHTML='<p>Ask Mark is comparing the selected passage with your texts…</p>';
    const excerpts=state.comparisonTexts.map(s=>{const passages=bestPassages(s);return `${s.title}${s.author?` by ${s.author}`:''}:\n${(passages[0]?.text||s.text.slice(0,1800))}`;}).join('\n\n');
    const lens={syntopicon:'Identify the relevant Syntopicon Great Ideas and explain how each author treats them.',arguments:'Compare the central claims, assumptions, and reasoning.',agreement:'Explain the strongest agreements, disagreements, and meaningful distinctions.',definitions:'Compare how the texts define and use their most important terms.',themes:'Compare recurring themes, motifs, and implications.'}[state.mode];
    const question=`You are helping with a multi-text comparison. ${lens}\n\nPRIMARY PASSAGE (${state.primary.title}):\n${state.primary.passage}\n\nCOMPARISON TEXTS:\n${excerpts}\n\nGive a clear synthesis with headings, specific textual connections, cautions about weak matches, and 3 questions for further study.`;
    try{const response=await fetch('/api/mark-selection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selection:state.primary.passage,action:'ask',question,title:state.primary.title,chapter:state.primary.chapter||''})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||payload.detail||`HTTP ${response.status}`);const result=payload.result||{};panel.innerHTML=`<h3>${esc(result.heading||'Ask Mark comparison')}</h3><p>${esc(result.response||'')}</p>${result.keyPoints?.length?`<ul>${result.keyPoints.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${result.cautions?.length?`<div>${result.cautions.map(x=>`<p><strong>Caution:</strong> ${esc(x)}</p>`).join('')}</div>`:''}`;}catch(e){panel.innerHTML=`<p class="status-error">${esc(e.message)}</p>`;}
  }
  window.addEventListener('message',event=>{
    if(!PASSAGE_BASKET_MODE||event.origin!==window.location.origin)return;
    const data=event.data||{};
    if(data.type==='msg-passage-comparison-workspace-data'&&Array.isArray(data.passages)){
      applyPassageBasket(data.passages);
    }
  });

  function saveProject(){
    state.updatedAt=new Date().toISOString();persist();let projects=[];try{projects=JSON.parse(localStorage.getItem(SAVED_KEY)||'[]');if(!Array.isArray(projects))projects=[];}catch{}const i=projects.findIndex(x=>x.id===state.id);if(i>=0)projects[i]=state;else projects.unshift(state);try{localStorage.setItem(SAVED_KEY,JSON.stringify(projects.slice(0,50)));}catch{}const b=$('#save-workspace');const original=b.textContent;b.textContent='Saved';setTimeout(()=>b.textContent=original,1200);
  }
  init();
})();
