/*
 * Mark, Set, Go! — Training Lab v0.1.0
 * Additive training layer. Does not replace ReaderEngine or ReaderContinuity.
 * No MutationObserver: runtime tracking uses reader events + requestAnimationFrame.
 */
(() => {
  'use strict';
  if (window.MarkSetGoTrainingLab) return;

  const VERSION = '0.3.2-side-frame-compatible';
  const STORAGE_KEY = 'markSetGoTrainingLabV1';
  const runtime = { raf:0, timer:0, mode:'', startedAt:0, startIndex:0, startWpm:0, burstPhase:0, overlay:null, hud:null, session:null, scopedNodes:null, fixationCursor:0, peripheralCursor:0, fixationResizeObserver:null, fixationWindowResize:null };
  const DEFAULTS = {
    baselineWpm: 300, comprehension: 85, trainingWpm: 330, stretchWpm: 390,
    visualSpan: 3, fixationsPerLine: 4, regressionLevel: 'soft',
    sessions: [], assessments: [], preferences: { dailyMinutes: 15, comprehensionFloor: 85 }
  };

  const EXERCISES = [
    {id:'fixation',group:'eyes',title:'Fixation Trainer',tag:'Ready',desc:'Guides your eyes through fixation points on the text you are actually reading, using highlighted text when you select a passage.'},
    {id:'peripheral',group:'eyes',title:'Peripheral Span',tag:'Ready',desc:'Uses words from your current Reader passage and expands the phrase around a fixed center word.'},
    {id:'regression',group:'eyes',title:'Regression Control',tag:'Ready',desc:'Progressively fades words behind the reading position to discourage unnecessary backward jumps.'},
    {id:'edge',group:'eyes',title:'Edge Avoidance',tag:'Experimental',desc:'Encourages fixation inside the line rather than on its first and last words; implemented through target placement.'},
    {id:'burst',group:'speed',title:'Speed Bursts',tag:'Ready',desc:'Alternates training and stretch WPM to create progressive overload without sustaining an unrealistic pace.'},
    {id:'phrase',group:'speed',title:'Phrase RSVP',tag:'Ready',desc:'Configures Flash + meaningful chunks so the reader sees thought-sized phrases instead of isolated words.'},
    {id:'tunnel',group:'speed',title:'Focus Tunnel',tag:'Ready',desc:'Keeps only the active visual line bright while the surrounding page is visually suppressed.'},
    {id:'adaptive',group:'speed',title:'Adaptive Pace',tag:'Ready',desc:'Calculates the next target from speed × comprehension instead of rewarding raw WPM alone.'},
    {id:'preview',group:'comprehension',title:'Preview / Map',tag:'Prototype',desc:'Builds a local structural preview now and exposes an event hook for a richer AI-generated map later.'},
    {id:'recall',group:'comprehension',title:'Active Recall',tag:'Ready',desc:'Pauses reading and asks the reader to reconstruct the key ideas without looking back.'},
    {id:'prediction',group:'comprehension',title:'Prediction',tag:'Ready',desc:'Prompts the reader to anticipate what comes next, turning reading into an active hypothesis process.'},
    {id:'semantic',group:'advanced',title:'Semantic Chunking',tag:'Integrated',desc:'Uses the existing Meaningful Chunks path immediately; an AI/NLP adapter can later supply richer phrase boundaries.'}
  ];

  function safeParse(raw, fallback){ try { return JSON.parse(raw) || fallback; } catch { return fallback; } }
  function load(){ return {...DEFAULTS, ...safeParse(localStorage.getItem(STORAGE_KEY), {})}; }
  function save(data){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {} }
  let data = load();
  function $ (s, root=document){ return root.querySelector(s); }
  function $$ (s, root=document){ return [...root.querySelectorAll(s)]; }
  function clamp(n,min,max){ return Math.min(max,Math.max(min,Number(n)||0)); }
  function reader(){ return $('#reader'); }
  function wordNodes(){ return $$('#reader .reader-word[data-index]'); }
  function selectedReaderWordNodes(){
    const selection=window.getSelection?.();
    if(!selection || selection.rangeCount===0 || selection.isCollapsed) return [];
    const r=reader(); if(!r) return [];
    const range=selection.getRangeAt(0);
    if(!r.contains(range.commonAncestorContainer)) return [];
    return wordNodes().filter(node=>{
      try { return range.intersectsNode(node); } catch { return false; }
    });
  }
  function exerciseWordNodes(){
    if(Array.isArray(runtime.scopedNodes) && runtime.scopedNodes.length) return runtime.scopedNodes.filter(n=>n?.isConnected);
    const selected=selectedReaderWordNodes();
    if(selected.length){ runtime.scopedNodes=selected; return selected; }
    return wordNodes();
  }
  function captureExerciseScope(){
    runtime.scopedNodes=selectedReaderWordNodes();
    return runtime.scopedNodes.length ? 'Highlighted text' : 'Current Reader text';
  }
  function currentIndex(){
    try { if (typeof state !== 'undefined' && Number.isFinite(Number(state.index))) return Number(state.index); } catch {}
    const active = $('#reader .reader-word.active, #reader .reader-word.current, #reader .reader-word.is-active');
    return Number(active?.dataset?.index || 0);
  }
  function currentWpm(){
    const input = $('#speed');
    if (input) return clamp(input.value,30,900);
    try { return clamp(state.wpm,30,900); } catch { return data.trainingWpm || 300; }
  }
  function setWpm(wpm){
    const value = Math.round(clamp(wpm,30,900));
    for (const id of ['#speed','#fs-speed']) { const el=$(id); if(el){ el.value=String(value); el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new Event('input',{bubbles:true})); } }
    try { if (typeof state !== 'undefined') state.wpm=value; } catch {}
    return value;
  }
  function setSelect(id,value){ const el=$(id); if(!el)return false; el.value=value; el.dispatchEvent(new Event('change',{bubbles:true})); return true; }
  function setCheck(id,value){ const el=$(id); if(!el)return false; el.checked=Boolean(value); el.dispatchEvent(new Event('change',{bubbles:true})); return true; }
  function startReaderIfPossible(){ const normal=$('#start-reader'); if(normal && !normal.disabled) normal.click(); else { const full=$('#fs-start'); if(full && !full.disabled) full.click(); } }
  function pauseReaderIfPossible(){ const b=$('#pause-reader'); if(b && !b.disabled) b.click(); else { const f=$('#fs-pause'); if(f && !f.disabled) f.click(); } }
  function hasDocument(){ return Boolean(reader() && wordNodes().length); }
  function dispatch(name, detail={}){ document.dispatchEvent(new CustomEvent(name,{detail:{version:VERSION,...detail}})); }

  function ensureRuntimeLayer(){
    let layer=$('#training-runtime-layer');
    if(!layer){ layer=document.createElement('div'); layer.id='training-runtime-layer'; document.body.appendChild(layer); }
    runtime.overlay=layer; return layer;
  }
  function clearRuntime(){
    cancelAnimationFrame(runtime.raf); clearTimeout(runtime.timer); runtime.raf=0; runtime.timer=0;
    const r=reader(); if(r){ r.classList.remove('training-regression-soft','training-regression-medium','training-regression-strict'); wordNodes().forEach(n=>n.classList.remove('tl-read','tl-fixation-active','tl-peripheral-word','tl-peripheral-center-word'));
    try { runtime.fixationResizeObserver?.disconnect(); } catch {}
    if(runtime.fixationWindowResize) window.removeEventListener('resize',runtime.fixationWindowResize);
    runtime.fixationResizeObserver=null; runtime.fixationWindowResize=null;
    runtime.scopedNodes=null; runtime.fixationCursor=0; runtime.peripheralCursor=0; }
    $('#training-runtime-layer')?.remove(); runtime.overlay=null; runtime.hud=null; runtime.mode='';
    dispatch('marksetgo:training-stopped');
  }
  function hud(title, detail=''){
    const layer=ensureRuntimeLayer(); let el=$('.tl-runtime-hud',layer);
    if(!el){ el=document.createElement('div'); el.className='tl-runtime-hud'; layer.appendChild(el); }
    el.innerHTML=`<div class="tl-runtime-hud-row"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(String(currentWpm()))} WPM</span></div><small>${escapeHtml(detail)}</small><button class="tl-secondary" type="button" data-tl-stop>Stop exercise</button>`;
    $('[data-tl-stop]',el)?.addEventListener('click',clearRuntime,{once:true}); runtime.hud=el; return el;
  }
  function escapeHtml(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }

  function visualLines(nodes=exerciseWordNodes()){
    const rr=reader()?.getBoundingClientRect();
    const visible=nodes.filter(n=>{ const r=n.getBoundingClientRect(); return r.width && r.height && rr && r.bottom>rr.top && r.top<rr.bottom && r.right>rr.left && r.left<rr.right; });
    const lines=[]; const tol=6;
    for(const n of visible){ const r=n.getBoundingClientRect(); let line=lines.find(x=>Math.abs(x.top-r.top)<tol); if(!line){ line={top:r.top,bottom:r.bottom,nodes:[]}; lines.push(line); } line.nodes.push(n); line.bottom=Math.max(line.bottom,r.bottom); }
    return lines.sort((a,b)=>a.top-b.top);
  }
  function fixationTargets(nodes, perLine){
    const lines=[]; const tol=6;
    for(const n of nodes){ const r=n.getBoundingClientRect(); let line=lines.find(x=>Math.abs(x.top-r.top)<tol); if(!line){ line={top:r.top,nodes:[]}; lines.push(line); } line.nodes.push(n); }
    const targets=[];
    for(const line of lines){
      const count=Math.min(perLine,line.nodes.length);
      for(let i=0;i<count;i++){
        const pos=Math.min(line.nodes.length-1,Math.round(((i+.5)/count)*(line.nodes.length-1)));
        const node=line.nodes[pos]; if(node && !targets.includes(node)) targets.push(node);
      }
    }
    return targets;
  }
  function runFixation({targets=data.fixationsPerLine||4}={}){
    if(!hasDocument()) return notifyNeedReader(); clearRuntime(); runtime.mode='fixation';
    const scope=captureExerciseScope();
    const nodes=exerciseWordNodes();
    const perLine=Math.max(2,Math.min(5,targets));
    let targetNodes=[];
    let currentNode=null;
    let lastWidth=0;

    const rebuildTargets=()=>{
      if(runtime.mode!=='fixation') return;
      const liveNodes=nodes.filter(n=>n?.isConnected);
      targetNodes=fixationTargets(liveNodes,perLine);
      if(!targetNodes.length) return;
      if(currentNode?.isConnected){
        const exact=targetNodes.indexOf(currentNode);
        if(exact>=0){
          runtime.fixationCursor=exact;
        } else {
          const currentIndex=Number(currentNode.dataset.index);
          const next=targetNodes.findIndex(n=>Number(n.dataset.index)>=currentIndex);
          runtime.fixationCursor=next>=0?next:0;
        }
      } else {
        runtime.fixationCursor=Math.min(runtime.fixationCursor,targetNodes.length-1);
      }
    };

    rebuildTargets();
    if(!targetNodes.length) return notifyNeedReader();

    const layer=ensureRuntimeLayer();
    const dot=document.createElement('span');
    dot.className='tl-fixation-dot tl-fixation-dot-active';
    layer.appendChild(dot);
    hud('Fixation Trainer',`${scope} · ${perLine} fixations/line`);

    const positionDot=()=>{
      if(runtime.mode!=='fixation' || !currentNode?.isConnected) return;
      const r=reader(); if(!r) return;
      const rect=currentNode.getBoundingClientRect();
      const rr=r.getBoundingClientRect();
      if(rect.bottom<rr.top || rect.top>rr.bottom){
        currentNode.scrollIntoView({block:'center',inline:'nearest'});
        requestAnimationFrame(()=>requestAnimationFrame(positionDot));
        return;
      }
      dot.style.left=`${Math.max(rr.left+6,Math.min(rr.right-6,rect.left+rect.width/2))}px`;
      dot.style.top=`${Math.max(rr.top+6,Math.min(rr.bottom-6,rect.bottom+5))}px`;
    };

    const step=()=>{
      if(runtime.mode!=='fixation') return;
      const r=reader();
      const width=Math.round(r?.getBoundingClientRect().width||0);
      if(width && width!==lastWidth){ lastWidth=width; rebuildTargets(); }
      if(!targetNodes.length){ clearRuntime(); return; }
      wordNodes().forEach(n=>n.classList.remove('tl-fixation-active'));
      currentNode=targetNodes[runtime.fixationCursor % targetNodes.length];
      if(!currentNode?.isConnected){ rebuildTargets(); currentNode=targetNodes[runtime.fixationCursor % Math.max(1,targetNodes.length)]; }
      if(!currentNode?.isConnected){ clearRuntime(); return; }
      currentNode.classList.add('tl-fixation-active');
      currentNode.scrollIntoView({block:'nearest',inline:'nearest'});
      requestAnimationFrame(()=>requestAnimationFrame(positionDot));
      runtime.fixationCursor++;
      const wordsPerFix=Math.max(1,Math.round(nodes.length/Math.max(1,targetNodes.length)));
      const delay=Math.max(180,Math.round((60000/currentWpm())*wordsPerFix));
      runtime.timer=setTimeout(step,delay);
    };

    if(typeof ResizeObserver==='function'){
      runtime.fixationResizeObserver=new ResizeObserver(()=>{
        if(runtime.mode!=='fixation') return;
        requestAnimationFrame(()=>{ rebuildTargets(); positionDot(); });
      });
      runtime.fixationResizeObserver.observe(reader());
    } else {
      runtime.fixationWindowResize=()=>{
        if(runtime.mode!=='fixation') return;
        requestAnimationFrame(()=>{ rebuildTargets(); positionDot(); });
      };
      window.addEventListener('resize',runtime.fixationWindowResize,{passive:true});
    }

    step();
    dispatch('marksetgo:training-started',{exercise:'fixation',scope});
  }
  function runRegression(level=data.regressionLevel||'soft'){
    if(!hasDocument()) return notifyNeedReader(); clearRuntime(); runtime.mode='regression'; const scope=captureExerciseScope(); const r=reader(); r.classList.add(`training-regression-${level}`); hud('Regression Control',`${scope} · ${level[0].toUpperCase()+level.slice(1)} fade behind current position`);
    const paint=()=>{ if(runtime.mode!=='regression')return; const idx=currentIndex(); const scoped=new Set(exerciseWordNodes()); wordNodes().forEach(n=>n.classList.toggle('tl-read',scoped.has(n) && Number(n.dataset.index)<idx)); runtime.raf=requestAnimationFrame(paint); }; paint(); dispatch('marksetgo:training-started',{exercise:'regression',level});
  }
  function runTunnel(){
    if(!hasDocument())return notifyNeedReader(); clearRuntime(); runtime.mode='tunnel'; const layer=ensureRuntimeLayer(); const box=document.createElement('div'); box.className='tl-focus-tunnel'; layer.appendChild(box); hud('Focus Tunnel','Active line stays visually dominant');
    const paint=()=>{ if(runtime.mode!=='tunnel')return; const idx=currentIndex(); let node=$(`#reader .reader-word[data-index="${idx}"]`); if(!node){ const visible=wordNodes().find(n=>{const r=n.getBoundingClientRect();return r.top>0&&r.bottom<innerHeight;}); node=visible; } if(node){ const nr=node.getBoundingClientRect(); const r=reader().getBoundingClientRect(); box.style.left=`${Math.max(r.left,nr.left-16)}px`; box.style.top=`${nr.top-7}px`; box.style.width=`${Math.min(r.right-nr.left+12,Math.max(160,r.width*.7))}px`; box.style.height=`${nr.height+14}px`; } runtime.raf=requestAnimationFrame(paint); }; paint(); dispatch('marksetgo:training-started',{exercise:'tunnel'});
  }
  function getWordsAround(count=9){
    const idx=currentIndex(); let words=[]; try { if(typeof state!=='undefined'&&Array.isArray(state.words)) words=state.words; } catch {}
    if(!words.length) words=wordNodes().map(n=>n.textContent.trim());
    const start=Math.max(0,idx-Math.floor(count/2)); return words.slice(start,start+count).map(w=>typeof w==='string'?w:(w?.text||String(w||'')));
  }
  function runPeripheral(){
    if(!hasDocument())return notifyNeedReader(); clearRuntime(); runtime.mode='peripheral';
    const scope=captureExerciseScope(); const nodes=exerciseWordNodes(); let span=Math.max(3,data.visualSpan||3); if(span%2===0)span++;
    let cursor=Math.max(0,nodes.findIndex(n=>Number(n.dataset.index)>=currentIndex())); if(cursor<0)cursor=0; runtime.peripheralCursor=cursor;
    const panel=hud('Peripheral Span',`${scope} · keep your gaze on the center word`);
    const controls=document.createElement('div'); controls.className='tl-runtime-actions';
    controls.innerHTML='<button class="tl-secondary" data-span-less type="button">Too wide</button><button class="tl-primary" data-span-more type="button">Captured</button><button class="tl-secondary" data-span-next type="button">Next phrase</button>';
    panel.appendChild(controls);
    const render=()=>{
      if(runtime.mode!=='peripheral')return;
      wordNodes().forEach(n=>n.classList.remove('tl-peripheral-word','tl-peripheral-center-word'));
      const half=Math.floor(span/2); const center=Math.min(nodes.length-1,Math.max(0,runtime.peripheralCursor));
      const a=Math.max(0,center-half), b=Math.min(nodes.length,center+half+1);
      nodes.slice(a,b).forEach(n=>n.classList.add('tl-peripheral-word'));
      nodes[center]?.classList.add('tl-peripheral-center-word'); nodes[center]?.scrollIntoView({block:'nearest'});
    };
    $('[data-span-more]',controls).onclick=()=>{span=Math.min(13,span+2);data.visualSpan=span;save(data);render();};
    $('[data-span-less]',controls).onclick=()=>{span=Math.max(3,span-2);data.visualSpan=span;save(data);render();};
    $('[data-span-next]',controls).onclick=()=>{runtime.peripheralCursor=Math.min(nodes.length-1,runtime.peripheralCursor+span);render();};
    render(); dispatch('marksetgo:training-started',{exercise:'peripheral',scope});
  }
  function runPhrase(){
    if(!hasDocument())return notifyNeedReader(); clearRuntime(); setSelect('#mode-select','flash'); setSelect('#fs-mode-select','flash'); setCheck('#meaningful-chunks',true); setCheck('#fs-meaningful-chunks',true); const wc=$('#word-count'); if(wc){wc.value=String(clamp(Math.round(currentWpm()/100),3,7));wc.dispatchEvent(new Event('change',{bubbles:true}));} hud('Phrase RSVP','Flash + meaningful chunks configured'); runtime.mode='phrase'; startReaderIfPossible(); dispatch('marksetgo:training-started',{exercise:'phrase'});
  }
  function runSemantic(){
    if(!hasDocument())return notifyNeedReader(); setCheck('#meaningful-chunks',true); setCheck('#fs-meaningful-chunks',true); notify('Meaningful Chunks enabled. The AI/NLP phrase-boundary adapter can replace these local boundaries later.'); dispatch('marksetgo:training-started',{exercise:'semantic'});
  }
  function runBurst(){
    if(!hasDocument())return notifyNeedReader(); clearRuntime(); runtime.mode='burst'; runtime.startWpm=currentWpm(); const base=Math.max(data.trainingWpm||runtime.startWpm,runtime.startWpm); const stretch=Math.max(data.stretchWpm||Math.round(base*1.18),base+40); const phases=[{sec:45,wpm:base,label:'Training pace'},{sec:20,wpm:stretch,label:'Stretch burst'},{sec:45,wpm:base+15,label:'Training pace'},{sec:20,wpm:stretch+25,label:'Stretch burst'}]; let i=0;
    const next=()=>{ if(runtime.mode!=='burst')return; if(i>=phases.length){setWpm(base);recordSession({type:'burst',minutes:130/60,wpm:base});clearRuntime();notify('Speed Burst complete.');return;} const p=phases[i++]; setWpm(p.wpm); hud('Speed Bursts',`${p.label} · ${p.sec}s`); startReaderIfPossible(); runtime.timer=setTimeout(next,p.sec*1000); }; next(); dispatch('marksetgo:training-started',{exercise:'burst'});
  }
  function runEdge(){ data.fixationsPerLine=Math.min(4,Math.max(2,data.fixationsPerLine||4)); save(data); runFixation({targets:data.fixationsPerLine}); notify('Edge Avoidance uses interior fixation targets; avoid deliberately looking at the first and last words of each line.'); }

  function effectiveRate(wpm,comp){ return Math.round((Number(wpm)||0)*(Number(comp)||0)/100); }
  function adaptiveRecommendation(wpm,comp){
    const floor=data.preferences?.comprehensionFloor||85; let next=wpm;
    if(comp>=92) next=wpm*1.10; else if(comp>=floor) next=wpm*1.05; else if(comp>=75) next=wpm*.96; else next=wpm*.88;
    return Math.round(clamp(next,80,900)/5)*5;
  }
  function submitAssessment(wpm,comp){
    wpm=clamp(wpm,30,1200); comp=clamp(comp,0,100); const effective=effectiveRate(wpm,comp); const next=adaptiveRecommendation(wpm,comp);
    data.baselineWpm=data.baselineWpm||wpm; data.comprehension=comp; data.trainingWpm=next; data.stretchWpm=Math.round(next*1.15/5)*5; data.assessments.unshift({at:new Date().toISOString(),wpm,comprehension:comp,effective,next}); data.assessments=data.assessments.slice(0,100); save(data); renderProgress(); return {wpm,comp,effective,next};
  }
  function recordSession(extra={}){ data.sessions.unshift({at:new Date().toISOString(),...extra}); data.sessions=data.sessions.slice(0,200); save(data); renderProgress(); }

  function localPreview(){
    let title='Current reading'; try{ if(typeof state!=='undefined'&&state.title)title=state.title; }catch{}
    const headings=$$('#reader .document-structure[role="heading"], #reader [role="heading"]').slice(0,8).map(n=>n.textContent.trim()).filter(Boolean);
    const words=getWordsAround(80).join(' '); const sentences=words.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0,3);
    return {title,headings,sentences};
  }
  function showPreview(){
    if(!hasDocument())return notifyNeedReader(); const p=localPreview(); const view=$('#training-view-comprehension'); const box=$('#tl-comprehension-output');
    box.innerHTML=`<div class="tl-result"><h4>${escapeHtml(p.title)} — quick map</h4>${p.headings.length?`<p><strong>Visible structure:</strong> ${p.headings.map(escapeHtml).join(' · ')}</p>`:''}<p><strong>Opening ideas near your position:</strong> ${escapeHtml(p.sentences.join(' '))}</p><p><small>This is the local fallback. The lab also dispatched <code>marksetgo:training-ai-request</code> so your existing AI layer can later return a richer preview.</small></p></div>`;
    const scoped=selectedReaderWordNodes(); const previewText=(scoped.length?scoped.map(n=>n.textContent.trim()):getWordsAround(500)).join(' '); dispatch('marksetgo:training-ai-request',{task:'preview',text:previewText,title:p.title}); openLab('comprehension');
  }
  function promptRecall(){
    if(!hasDocument())return notifyNeedReader(); pauseReaderIfPossible(); openLab('comprehension'); const box=$('#tl-comprehension-output'); box.innerHTML=`<div class="tl-card"><h4>Active Recall</h4><p>Without looking back, write the 2–4 most important ideas from what you just read.</p><div class="tl-field"><textarea id="tl-recall-text" placeholder="What do you remember?"></textarea></div><div class="tl-card-actions"><button class="tl-primary" id="tl-save-recall" type="button">Save recall</button></div></div>`; $('#tl-save-recall').onclick=()=>{const text=$('#tl-recall-text').value.trim();if(!text)return;recordSession({type:'recall',response:text.slice(0,1200)});box.insertAdjacentHTML('beforeend','<div class="tl-result">Recall saved. In a later refinement, Ask Mark can score concept coverage against the source passage.</div>');dispatch('marksetgo:training-ai-request',{task:'score-recall',response:text});};
  }
  function promptPrediction(){
    if(!hasDocument())return notifyNeedReader(); pauseReaderIfPossible(); openLab('comprehension'); const box=$('#tl-comprehension-output'); box.innerHTML=`<div class="tl-card"><h4>Prediction</h4><p>Based on the argument so far, what do you expect the author to explain or argue next?</p><div class="tl-field"><textarea id="tl-prediction-text" placeholder="I predict that…"></textarea></div><div class="tl-card-actions"><button class="tl-primary" id="tl-save-prediction" type="button">Save prediction</button></div></div>`; $('#tl-save-prediction').onclick=()=>{const text=$('#tl-prediction-text').value.trim();if(!text)return;recordSession({type:'prediction',response:text.slice(0,1200),index:currentIndex()});box.insertAdjacentHTML('beforeend','<div class="tl-result">Prediction saved with your current reading position.</div>');};
  }
  function notifyNeedReader(){ notify('Open a book or article in the Reader first, then launch this exercise.'); }
  function notify(message){
    let n=$('#tl-global-notice'); if(!n){n=document.createElement('div');n.id='tl-global-notice';n.style.cssText='position:fixed;z-index:2147483647;left:50%;bottom:22px;transform:translateX(-50%);background:#10243c;color:#fff;border:1px solid rgba(255,255,255,.18);padding:11px 16px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:min(680px,90vw)';document.body.appendChild(n);} n.textContent=message; clearTimeout(n._timer);n._timer=setTimeout(()=>n.remove(),4200);
  }

  function exerciseCards(group){ return EXERCISES.filter(x=>x.group===group).map(x=>`<article class="tl-card"><span class="tl-badge ${x.tag==='Ready'||x.tag==='Integrated'?'ready':'experimental'}">${escapeHtml(x.tag)}</span><h4>${escapeHtml(x.title)}</h4><p>${escapeHtml(x.desc)}</p><div class="tl-card-actions"><button class="tl-secondary" type="button" data-tl-run="${x.id}">Start</button></div></article>`).join(''); }

  function askBethShell(){
    return $('.reader-control-shell.mark-shell');
  }

  function askBethPremium(){
    return askBethShell()?.querySelector('[data-askmark-premium]') || null;
  }

  function setTrainingLabWide(enabled){
    const layout=$('#reader-layout') || $('.reader-layout');
    const panel=$('#word-panel');
    layout?.classList.toggle('training-lab-wide-open',Boolean(enabled));
    panel?.classList.toggle('training-lab-wide-open',Boolean(enabled));
  }

  function activateAskBethView(view='chat'){
    const host=askBethShell();
    if(!host)return false;
    const panels=$$('[data-askmark-view-panel]',host);
    if(!panels.length)return false;
    panels.forEach(panel=>panel.classList.toggle('is-active',panel.dataset.askmarkViewPanel===view));
    host.classList.toggle('askmark-secondary-open',view!=='chat');
    setTrainingLabWide(view==='training');
    return Boolean(host.querySelector(`[data-askmark-view-panel="${view}"]`));
  }

  function ensureAskBethTrainingView(){
    const host=askBethShell();
    const premium=askBethPremium();
    const stage=premium?.querySelector('.askmark-stage');
    if(!host || !premium || !stage)return null;

    let view=stage.querySelector('[data-askmark-view-panel="training"]');
    if(!view){
      view=document.createElement('section');
      view.className='askmark-view training-lab-askbeth-view';
      view.dataset.askmarkViewPanel='training';
      view.innerHTML='<div class="training-lab-askbeth-host" data-training-lab-askbeth-host></div>';
      stage.appendChild(view);
    }

    const headerActions=
      premium.querySelector('.askmark-header-tool-actions') ||
      premium.querySelector('.askmark-header-actions');

    if(headerActions && !headerActions.querySelector('[data-training-lab-askbeth-button]')){
      const button=document.createElement('button');
      button.type='button';
      button.dataset.trainingLabAskbethButton='1';
      button.setAttribute('aria-label','Open Training Lab');
      button.title='Training Lab';
      button.textContent='◎';
      button.addEventListener('click',(event)=>{
        event.preventDefault();
        event.stopPropagation();
        openLab('today');
      });
      headerActions.appendChild(button);
    }

    return view.querySelector('[data-training-lab-askbeth-host]');
  }

  function openAskBethPanel(){
    const shell=askBethShell();
    if(shell){
      const style=getComputedStyle(shell);
      const visible=style.display!=='none' && style.visibility!=='hidden' && shell.getBoundingClientRect().width>0;
      if(visible)return true;
    }
    const toggle=$('#toggle-mark-panel');
    if(toggle){
      toggle.click();
      return true;
    }
    return false;
  }

  function mountLabInsideAskBeth(){
    const externalHost=window.MSGTrainingLabFrameHost;
    const lab=$('#training-lab-shell');
    if(externalHost?.isConnected && lab){
      if(lab.parentElement!==externalHost)externalHost.appendChild(lab);
      lab.classList.add('training-lab-embedded','training-lab-frame-hosted');
      const close=$('[data-tl-close]',lab);
      if(close){
        close.textContent='×';
        close.setAttribute('aria-label','Close Training Lab frame');
        close.title='Close Training Lab frame';
      }
      return true;
    }

    const host=ensureAskBethTrainingView();
    if(!host || !lab)return false;
    if(lab.parentElement!==host)host.appendChild(lab);
    lab.classList.remove('training-lab-frame-hosted');
    lab.classList.add('training-lab-embedded');
    const close=$('[data-tl-close]',lab);
    if(close){
      close.textContent='←';
      close.setAttribute('aria-label','Back to Ask Beth');
      close.title='Back to Ask Beth';
    }
    return true;
  }

  function scheduleAskBethIntegration(){
    let tries=0;
    const attempt=()=>{
      tries+=1;
      const host=ensureAskBethTrainingView();
      if(host){
        buildLab();
        mountLabInsideAskBeth();
        return;
      }
      if(tries<90)requestAnimationFrame(attempt);
    };
    requestAnimationFrame(attempt);
  }

  function buildLab(){
    if($('#training-lab-shell'))return;
    const shell=document.createElement('div'); shell.id='training-lab-shell'; shell.className='training-lab-shell'; shell.hidden=true;
    shell.innerHTML=`<section class="training-lab-dialog" role="dialog" aria-modal="true" aria-labelledby="training-lab-title"><header class="training-lab-header"><div><div class="training-lab-eyebrow">Reading Performance</div><h2 id="training-lab-title">Training Lab</h2><p>Train speed, eye movement, comprehension and retention — not WPM alone.</p></div><button class="training-lab-close" data-tl-close aria-label="Close Training Lab">×</button></header><div class="training-lab-body"><nav class="training-lab-nav" aria-label="Training Lab sections"><button data-tl-view="today" class="is-active">Today</button><button data-tl-view="eyes">Eye Training</button><button data-tl-view="speed">Speed</button><button data-tl-view="comprehension">Comprehension</button><button data-tl-view="advanced">Advanced</button><button data-tl-view="progress">Progress</button></nav><main class="training-lab-main">
      <section class="training-lab-view" id="training-view-today"><h3>Today's training</h3><p class="training-lab-sub">A guided 15-minute session built from the same exercises you can run individually.</p><div class="tl-hero"><div class="tl-hero-row"><div><h4>Train me to read faster</h4><p>The Lab will work slightly above your comfortable pace while keeping comprehension as the governing metric.</p></div><button class="tl-primary" id="tl-start-daily">Start today's training</button></div></div><div id="tl-today-metrics" class="tl-metrics"></div><div id="tl-session-plan"></div></section>
      <section class="training-lab-view" id="training-view-eyes" hidden><h3>Eye Training</h3><p class="training-lab-sub">Practice efficient fixation patterns, useful visual span and forward reading.</p><div class="tl-grid">${exerciseCards('eyes')}</div></section>
      <section class="training-lab-view" id="training-view-speed" hidden><h3>Speed Training</h3><p class="training-lab-sub">Use progressive overload while preserving thought-sized language units.</p><div class="tl-grid">${exerciseCards('speed')}</div><div class="tl-card" style="margin-top:16px"><h4>Record a comprehension check</h4><p>Use this after a timed section or quiz. The next training speed is calculated from comprehension, not raw speed.</p><div class="tl-form-row"><div class="tl-field"><label>WPM</label><input id="tl-assess-wpm" type="number" min="30" max="1200"></div><div class="tl-field"><label>Comprehension %</label><input id="tl-assess-comp" type="number" min="0" max="100" value="85"></div><button class="tl-primary" id="tl-assess-submit">Calculate next pace</button></div><div id="tl-assess-result"></div></div></section>
      <section class="training-lab-view" id="training-view-comprehension" hidden><h3>Comprehension Training</h3><p class="training-lab-sub">Preview, predict and retrieve so faster reading remains meaningful reading.</p><div class="tl-grid">${exerciseCards('comprehension')}</div><div id="tl-comprehension-output"></div></section>
      <section class="training-lab-view" id="training-view-advanced" hidden><h3>Advanced Training</h3><p class="training-lab-sub">Hooks for semantic phrase boundaries and future difficulty-aware pacing.</p><div class="tl-grid">${exerciseCards('advanced')}</div><div class="tl-notice"><strong>Integration contract:</strong> listen for <code>marksetgo:training-ai-request</code> to connect Ask Mark or another AI endpoint. Return richer results through your app without coupling this module to a specific provider.</div></section>
      <section class="training-lab-view" id="training-view-progress" hidden><h3>Progress</h3><p class="training-lab-sub">Verified performance emphasizes speed × comprehension.</p><div id="tl-progress-content"></div></section>
    </main></div></section>`;
    const embeddedHost=ensureAskBethTrainingView();
    (embeddedHost || document.body).appendChild(shell);
    if(embeddedHost)shell.classList.add('training-lab-embedded');
    shell.addEventListener('click',onLabClick); $('[data-tl-close]',shell).onclick=closeLab; $('#tl-start-daily').onclick=startDailySession; $('#tl-assess-submit').onclick=()=>{const r=submitAssessment($('#tl-assess-wpm').value,$('#tl-assess-comp').value);$('#tl-assess-result').innerHTML=`<div class="tl-result"><strong>Verified rate: ${r.effective} effective WPM.</strong><br>Recommended next training pace: <strong>${r.next} WPM</strong>.</div>`;renderToday();};
    renderToday(); renderProgress();
  }
  function onLabClick(e){ const v=e.target.closest('[data-tl-view]');if(v){openLab(v.dataset.tlView);return;} const b=e.target.closest('[data-tl-run]');if(b){runExercise(b.dataset.tlRun);} }
  function runExercise(id){ closeLab(); ({fixation:runFixation,peripheral:runPeripheral,regression:()=>runRegression(data.regressionLevel),edge:runEdge,burst:runBurst,phrase:runPhrase,tunnel:runTunnel,adaptive:()=>{openLab('speed');$('#tl-assess-wpm').value=currentWpm();$('#tl-assess-comp').focus();},preview:showPreview,recall:promptRecall,prediction:promptPrediction,semantic:runSemantic}[id]||(()=>{}))(); }
  function openLab(view='today'){
    const externalHost=window.MSGTrainingLabFrameHost;
    if(!externalHost?.isConnected)openAskBethPanel();
    buildLab();

    const reveal=()=>{
      const shell=$('#training-lab-shell');
      if(!shell)return false;
      const embedded=mountLabInsideAskBeth();
      shell.hidden=false;
      shell.classList.toggle('training-lab-embedded',embedded);
      if(!embedded)document.body.style.setProperty('--training-lab-open','1');
      else document.body.style.removeProperty('--training-lab-open');

      $$('.training-lab-view',shell).forEach(x=>x.hidden=x.id!==`training-view-${view}`);
      $$('.training-lab-nav [data-tl-view]',shell).forEach(x=>x.classList.toggle('is-active',x.dataset.tlView===view));
      if(view==='progress')renderProgress();
      if(view==='today')renderToday();
      if(embedded)activateAskBethView('training');
      return embedded;
    };

    if(reveal())return;
    let tries=0;
    const retry=()=>{
      tries+=1;
      if(reveal() || tries>=45)return;
      requestAnimationFrame(retry);
    };
    requestAnimationFrame(retry);
  }

  function closeLab(){
    const shell=$('#training-lab-shell');
    if(shell?.classList.contains('training-lab-frame-hosted')){
      document.dispatchEvent(new CustomEvent('marksetgo:learning-frame-close-request'));
      shell.hidden=false;
    }else if(shell?.classList.contains('training-lab-embedded')){
      activateAskBethView('chat');
      shell.hidden=false;
    }else if(shell){
      shell.hidden=true;
    }
    setTrainingLabWide(false);
    document.body.style.removeProperty('--training-lab-open');
  }

  function renderToday(){ if(!$('#tl-today-metrics'))return; const last=data.assessments[0]; $('#tl-today-metrics').innerHTML=`<div class="tl-metric"><span>Baseline</span><strong>${Math.round(data.baselineWpm||300)}</strong><small>WPM</small></div><div class="tl-metric"><span>Training</span><strong>${Math.round(data.trainingWpm||330)}</strong><small>WPM</small></div><div class="tl-metric"><span>Stretch</span><strong>${Math.round(data.stretchWpm||390)}</strong><small>WPM</small></div><div class="tl-metric"><span>Verified rate</span><strong>${last?.effective||'—'}</strong><small>speed × comprehension</small></div>`;
    const steps=[['Warm-up','Normal reading at training pace','2 min'],['Fixation','Interior fixation targets','3 min'],['Phrase reading','Meaningful phrase presentation','3 min'],['Speed bursts','Short progressive overload','3 min'],['Recall','Retrieve key ideas','2 min'],['Comprehension','Record score and adapt pace','2 min']]; $('#tl-session-plan').innerHTML=`<div class="tl-session-steps">${steps.map((s,i)=>`<div class="tl-step"><span class="tl-step-number">${i+1}</span><div><strong>${s[0]}</strong><br><small>${s[1]}</small></div><small>${s[2]}</small></div>`).join('')}</div>`;
  }
  function renderProgress(){ const box=$('#tl-progress-content');if(!box)return; const a=data.assessments.slice(0,8); const best=a.length?Math.max(...a.map(x=>x.effective||0)):0; const latest=a[0]; box.innerHTML=`<div class="tl-metrics"><div class="tl-metric"><span>Current training</span><strong>${data.trainingWpm||330}</strong><small>WPM</small></div><div class="tl-metric"><span>Comprehension</span><strong>${latest?latest.comprehension+'%':'—'}</strong><small>latest check</small></div><div class="tl-metric"><span>Best verified</span><strong>${best||'—'}</strong><small>effective WPM</small></div><div class="tl-metric"><span>Visual span</span><strong>${data.visualSpan||3}</strong><small>words</small></div></div>${a.length?`<div class="tl-card"><h4>Recent assessments</h4>${a.map(x=>`<div class="tl-step"><span class="tl-step-number">${x.comprehension}%</span><div><strong>${x.wpm} WPM → ${x.effective} verified</strong><br><small>${new Date(x.at).toLocaleString()}</small></div><small>next ${x.next}</small></div>`).join('')}</div>`:'<div class="tl-notice">No scored assessments yet. Complete a timed reading and enter the WPM + comprehension score under Speed.</div>'}`; }

  function startDailySession(){
    if(!hasDocument())return notifyNeedReader(); closeLab(); clearRuntime(); runtime.session={step:0,startedAt:Date.now()}; setWpm(data.trainingWpm||330); notify('Training session started: 2-minute warm-up at training pace.'); startReaderIfPossible();
    const steps=[
      {ms:120000,go:()=>{hud('Daily Training','Warm-up · training pace');runtime.mode='daily';}},
      {ms:180000,go:()=>{runFixation({targets:data.fixationsPerLine||4});hud('Daily Training','Fixation · interior targets');}},
      {ms:180000,go:()=>{runPhrase();hud('Daily Training','Phrase RSVP · meaningful chunks');}},
      {ms:130000,go:()=>{clearRuntime();runtime.mode='daily-burst';setWpm(data.stretchWpm||390);hud('Daily Training','Stretch pace · controlled overload');startReaderIfPossible();}},
      {ms:0,go:()=>{clearRuntime();promptRecall();recordSession({type:'daily',minutes:Math.round((Date.now()-runtime.session.startedAt)/6000)/10});}}
    ];
    let i=0; const next=()=>{ if(i>=steps.length)return; const s=steps[i++]; s.go(); if(s.ms) runtime.timer=setTimeout(next,s.ms); }; next();
  }

  function boot(){
    buildLab();
    scheduleAskBethIntegration();

    document.addEventListener('click',e=>{
      const trigger=e.target.closest('[data-training-lab-launch]');
      if(trigger){
        e.preventDefault();
        e.stopPropagation();
        openLab('today');
        const menu=trigger.closest('details.top-nav-menu');
        if(menu)menu.open=false;
        return;
      }

      if(e.target.closest('#toggle-mark-panel')){
        window.setTimeout(scheduleAskBethIntegration,0);
      }

      const otherAskBethView=e.target.closest('[data-askmark-view]');
      if(otherAskBethView && !e.target.closest('[data-training-lab-askbeth-button]')){
        setTrainingLabWide(false);
      }
    },true);

    for(const eventName of [
      'marksetgo:reader-session-list-changed',
      'marksetgo:reader-session-activated',
      'marksetgo:reader-session-changed'
    ]){
      document.addEventListener(eventName,()=>window.setTimeout(scheduleAskBethIntegration,0));
    }

    window.addEventListener('keydown',e=>{
      if(e.key==='Escape'){
        const lab=$('#training-lab-shell');
        if(lab && !lab.hidden)closeLab();
      }
    });

    dispatch('marksetgo:training-ready');
  }

  window.MarkSetGoTrainingLab={version:VERSION,open:openLab,close:closeLab,run:runExercise,stop:clearRuntime,getProgress:()=>typeof structuredClone==='function'?structuredClone(data):JSON.parse(JSON.stringify(data)),recordAssessment:submitAssessment,setWpm};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
