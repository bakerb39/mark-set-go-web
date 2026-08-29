
(() => {
  'use strict';
  const list = document.getElementById('msg-docs-list');
  const content = document.getElementById('msg-docs-content');
  const title = document.getElementById('msg-docs-title');
  const status = document.getElementById('msg-docs-status');
  const search = document.getElementById('msg-docs-search');
  const copy = document.getElementById('msg-docs-copy');
  const rawButton = document.getElementById('msg-docs-raw');
  const refresh = document.getElementById('msg-docs-refresh');

  let docs = [];
  let active = null;
  let activeMarkdown = '';

  const escapeHtml = (value='') => String(value)
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'","&#39;");

  const displayName = (filename='') => String(filename)
    .replace(/\.md$/i,'').replace(/[-_]+/g,' ')
    .replace(/\bmsg\b/ig,'MSG')
    .replace(/\b\w/g, m => m.toUpperCase());

  function inline(text) {
    let s = escapeHtml(text);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return s;
  }

  function markdownToHtml(markdown) {
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let inCode=false, code=[], listType='', quote=[];
    const closeList=()=>{ if(listType){out.push(`</${listType}>`);listType='';} };
    const closeQuote=()=>{ if(quote.length){out.push(`<blockquote>${quote.map(x=>`<p>${inline(x)}</p>`).join('')}</blockquote>`);quote=[];} };

    for (const line of lines) {
      if (/^```/.test(line)) {
        closeList(); closeQuote();
        if (!inCode) { inCode=true; code=[]; }
        else { out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); inCode=false; code=[]; }
        continue;
      }
      if (inCode) { code.push(line); continue; }
      if (/^>\s?/.test(line)) { closeList(); quote.push(line.replace(/^>\s?/,'')); continue; }
      closeQuote();
      if (!line.trim()) { closeList(); continue; }

      const h=line.match(/^(#{1,6})\s+(.+)$/);
      if(h){closeList();const n=h[1].length;out.push(`<h${n}>${inline(h[2])}</h${n}>`);continue;}
      if(/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)){closeList();out.push('<hr>');continue;}

      const ul=line.match(/^\s*[-*+]\s+(.+)$/), ol=line.match(/^\s*\d+[.)]\s+(.+)$/);
      if(ul||ol){
        const wanted=ul?'ul':'ol';
        if(listType!==wanted){closeList();listType=wanted;out.push(`<${wanted}>`);}
        out.push(`<li>${inline((ul||ol)[1])}</li>`);continue;
      }

      closeList(); out.push(`<p>${inline(line)}</p>`);
    }
    if(inCode) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
    closeList(); closeQuote(); return out.join('\n');
  }

  function firstHeading(md, fallback) {
    const m=String(md||'').match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : fallback;
  }

  function renderList() {
    list.innerHTML='';
    docs.forEach(doc=>{
      const b=document.createElement('button');
      b.type='button'; b.className=`msg-doc-link${active?.name===doc.name?' active':''}`;
      b.innerHTML=`<strong>${escapeHtml(doc.title||displayName(doc.name))}</strong><small>${escapeHtml(doc.name)}</small>`;
      b.addEventListener('click',()=>loadDoc(doc));
      list.appendChild(b);
    });
    if(!docs.length) list.innerHTML='<div class="msg-docs-empty">No Markdown files were found in /public/docs/.</div>';
  }

  function highlightRendered(query) {
    if(!query) return;
    const walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()){
      const node=walker.currentNode;
      if(node.parentElement?.closest('code,pre')) continue;
      if(node.nodeValue.toLowerCase().includes(query.toLowerCase())) nodes.push(node);
    }
    nodes.forEach(node=>{
      const text=node.nodeValue;
      const rx=new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`,'ig');
      const span=document.createElement('span');
      span.innerHTML=escapeHtml(text).replace(rx,'<mark>$1</mark>');
      node.replaceWith(...span.childNodes);
    });
  }

  async function loadDoc(doc) {
    active=doc; renderList(); status.textContent='Loading…';
    try{
      const response=await fetch(doc.url,{cache:'no-store'});
      if(!response.ok) throw new Error(`Could not load ${doc.name} (${response.status}).`);
      activeMarkdown=await response.text();
      title.textContent=firstHeading(activeMarkdown,doc.title||displayName(doc.name));
      content.innerHTML=markdownToHtml(activeMarkdown);
      status.textContent='';
      if(search.value.trim()) highlightRendered(search.value.trim());
    }catch(error){
      activeMarkdown=''; content.innerHTML=`<div class="msg-docs-empty">${escapeHtml(error.message)}</div>`; status.textContent='';
    }
  }

  async function discover({preserve=true}={}) {
    const oldName=preserve?active?.name:'';
    status.textContent='Refreshing document list…';
    try{
      const response=await fetch('/api/docs',{cache:'no-store'});
      if(!response.ok) throw new Error(`Could not list docs (${response.status}).`);
      const payload=await response.json();
      docs=Array.isArray(payload.docs)?payload.docs:[];
      active=docs.find(d=>d.name===oldName)||docs[0]||null;
      renderList();
      if(active) await loadDoc(active);
      else { title.textContent='MSG Docs'; activeMarkdown=''; content.innerHTML='<div class="msg-docs-empty">Drop a .md file into /public/docs/ and press Refresh.</div>'; status.textContent=''; }
    }catch(error){
      docs=[]; active=null; renderList(); content.innerHTML=`<div class="msg-docs-empty">${escapeHtml(error.message)}</div>`; status.textContent='';
    }
  }

  search.addEventListener('input',()=>{
    content.innerHTML=markdownToHtml(activeMarkdown);
    if(search.value.trim()) highlightRendered(search.value.trim());
  });
  refresh.addEventListener('click',()=>discover({preserve:true}));
  copy.addEventListener('click',async()=>{
    if(!activeMarkdown)return;
    try{await navigator.clipboard.writeText(activeMarkdown);status.textContent='Markdown copied.';setTimeout(()=>{if(status.textContent==='Markdown copied.')status.textContent='';},1400);}
    catch{status.textContent='Copy was blocked by the browser.';}
  });
  rawButton.addEventListener('click',()=>{ if(active?.url) window.open(active.url,'_blank','noopener'); });

  discover({preserve:false});
})();
