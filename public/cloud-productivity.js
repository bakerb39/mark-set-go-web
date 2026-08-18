(() => {
  'use strict';

  const VERSION = '7.7.16';
  const state = { notes: [], editingId: null, books: [], initialized: false };
  const appRoot = () => document.getElementById('app');
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmtDate = (value) => value ? new Date(value).toLocaleString([], { dateStyle:'medium', timeStyle:'short' }) : '';

  async function request(path, options = {}) {
    const response = await fetch(path, { credentials:'same-origin', ...options, headers:{ 'Content-Type':'application/json', ...(options.headers||{}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed with HTTP ${response.status}.`);
    return payload;
  }

  function injectStyles() {
    if (document.getElementById('cloud-productivity-styles')) return;
    const style = document.createElement('style');
    style.id = 'cloud-productivity-styles';
    style.textContent = `
      .random-notes-page{max-width:1180px;margin:0 auto}.random-notes-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);gap:1rem}.random-note-editor-card,.random-note-list-card{background:var(--panel,#fff);border:1px solid var(--border,#d6dfda);border-radius:18px;padding:1rem}.random-note-title{width:100%;font-size:1.2rem;font-weight:750;margin-bottom:.65rem}.random-note-toolbar{display:flex;gap:.45rem;flex-wrap:wrap;align-items:center;margin-bottom:.65rem}.random-note-editor{min-height:360px;resize:vertical;overflow:auto;border:1px solid var(--border,#ccd6d1);border-radius:12px;padding:1rem;background:#fff;line-height:1.55;white-space:pre-wrap}.random-note-editor:focus{outline:3px solid rgba(47,117,181,.16);border-color:#2f75b5}.random-note-editor img{max-width:100%;height:auto;border-radius:10px;display:block;margin:.7rem 0}.random-note-meta{font-size:.78rem;color:var(--muted,#66736d);margin:.5rem 0}.random-note-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem}.random-note-card{border:1px solid var(--border,#d8e0dc);border-radius:12px;padding:.8rem;margin:.55rem 0;background:#fff}.random-note-card h3{margin:0 0 .25rem}.random-note-preview{font-size:.86rem;color:#536b82;max-height:4.1em;overflow:hidden}.random-note-badges{display:flex;gap:.35rem;flex-wrap:wrap;margin:.35rem 0}.random-note-badge{font-size:.68rem;background:#e8f2fb;color:#245f91;padding:.18rem .42rem;border-radius:999px}.random-note-image-help{font-size:.78rem;color:#64716c}.random-note-status{min-height:1.25rem;margin-top:.5rem}.cloud-document-state{font-size:.72rem;font-weight:750;margin-left:.35rem}.cloud-document-state.metadata{color:#936d00}.cloud-document-state.document{color:#245f91}.email-cloud-status{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.45rem;margin-top:.75rem}.email-cloud-status span{padding:.55rem .7rem;border-radius:10px;background:#eef5fb;font-size:.78rem}.email-cloud-status .ok{color:#245f91}.email-cloud-status .off{color:#865e00}@media(max-width:850px){.random-notes-layout{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function addNavigation() {
    document.querySelectorAll('.site-header nav details').forEach((details) => {
      const label = details.querySelector('summary')?.textContent || '';
      if (!/my library/i.test(label)) return;
      const menu = details.querySelector('.menu-popover') || details;
      if (menu.querySelector('[data-random-notes-nav]')) return;
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.randomNotesNav = '1';
      button.innerHTML = '<span aria-hidden="true">✎</span><span><strong>Random Notes</strong><small>Ideas and notes beyond your reading</small></span>';
      menu.appendChild(button);
    });
  }

  async function loadBooks() {
    try { state.books = window.MarkSetGoCloudLibrary?.list?.() || (await request('/api/account/library')).books || []; } catch { state.books = []; }
  }
  async function loadNotes() { state.notes = (await request('/api/account/random-notes')).notes || []; }

  function editorImagesValid(editor) {
    const images = [...editor.querySelectorAll('img[src^="data:image/"]')];
    if (images.length > 5) throw new Error('A Random Note can contain up to 5 pasted images.');
    images.forEach((img) => {
      const approx = Math.ceil((img.src.length - img.src.indexOf(',') - 1) * .75);
      if (approx > 1024 * 1024) throw new Error('Each image must be 1 MB or smaller.');
    });
  }

  function insertImageFile(editor, file) {
    if (!file || !/^image\/(png|jpeg|gif|webp)$/i.test(file.type)) throw new Error('Use PNG, JPEG, GIF, or WebP images.');
    if (file.size > 1024 * 1024) throw new Error('Each image must be 1 MB or smaller.');
    const reader = new FileReader();
    reader.onload = () => {
      const img = document.createElement('img'); img.src = reader.result; img.alt = file.name || 'Pasted image';
      const selection = window.getSelection();
      if (selection?.rangeCount && editor.contains(selection.anchorNode)) { const range=selection.getRangeAt(0); range.deleteContents(); range.insertNode(img); range.setStartAfter(img); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); }
      else editor.append(img);
      editor.dispatchEvent(new Event('input', { bubbles:true }));
    };
    reader.readAsDataURL(file);
  }

  function notePayload() {
    const editor = document.getElementById('random-note-editor');
    editorImagesValid(editor);
    return {
      title: document.getElementById('random-note-title').value.trim() || 'Untitled note',
      contentHtml: editor.innerHTML,
      contentText: editor.innerText.trim(),
      pinned: document.getElementById('random-note-pinned').checked,
      favorite: document.getElementById('random-note-favorite').checked,
      tags: document.getElementById('random-note-tags').value.split(',').map(x=>x.trim()).filter(Boolean),
      relatedBookIds: [...document.querySelectorAll('[data-related-book]:checked')].map(x=>x.value)
    };
  }

  function renderNoteList() {
    const list = document.getElementById('random-note-list'); if (!list) return;
    list.innerHTML = state.notes.length ? state.notes.map(note => `
      <article class="random-note-card" data-note-id="${escapeHtml(note.id)}">
        <h3>${escapeHtml(note.title)}</h3>
        <div class="random-note-badges">${note.pinned?'<span class="random-note-badge">Pinned</span>':''}${note.favorite?'<span class="random-note-badge">Favorite</span>':''}${(note.tags||[]).map(t=>`<span class="random-note-badge">${escapeHtml(t)}</span>`).join('')}</div>
        <div class="random-note-preview">${escapeHtml(note.content_text || 'Image note')}</div>
        <div class="random-note-meta">Created ${fmtDate(note.created_at)} · Updated ${fmtDate(note.updated_at)}</div>
        <div class="random-note-actions"><button class="secondary" data-note-edit="${note.id}">Edit</button><button class="secondary" data-note-email="${note.id}">Email</button><button class="secondary danger-text" data-note-delete="${note.id}">Delete</button></div>
      </article>`).join('') : '<div class="empty-library"><h3>No Random Notes yet</h3><p>Capture an idea, plan, reminder, screenshot, or anything else you want to keep.</p></div>';
  }

  function resetEditor() {
    state.editingId = null;
    document.getElementById('random-note-title').value=''; document.getElementById('random-note-editor').innerHTML='';
    document.getElementById('random-note-tags').value=''; document.getElementById('random-note-pinned').checked=false; document.getElementById('random-note-favorite').checked=false;
    document.querySelectorAll('[data-related-book]').forEach(x=>x.checked=false);
    document.getElementById('random-note-timestamps').textContent='A creation date and time will be attached when saved.';
    document.getElementById('save-random-note').textContent='Save Random Note';
  }

  async function renderRandomNotes() {
    injectStyles();
    const root=appRoot(); if(!root)return;
    root.innerHTML='<section class="panel random-notes-page"><p>Loading Random Notes…</p></section>';
    try { await Promise.all([loadNotes(),loadBooks()]); } catch(error){ root.innerHTML=`<section class="panel"><h1>Random Notes</h1><p class="status error">${escapeHtml(error.message)}</p></section>`; return; }
    root.innerHTML = `<section class="random-notes-page">
      <header class="platform-hero"><div><span class="source-category">My Library & Collections</span><h1>Random Notes</h1><p>Store ideas, plans, reminders, pasted images, and notes that are not tied to a specific reading session.</p></div><button class="secondary" type="button" data-action="my-library">Back to My Library</button></header>
      <div class="random-notes-layout">
        <section class="random-note-editor-card">
          <input id="random-note-title" class="random-note-title" maxlength="240" placeholder="Note title">
          <div class="random-note-toolbar"><button class="secondary" id="random-note-image-button" type="button">Upload image</button><input id="random-note-image-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden><label><input id="random-note-pinned" type="checkbox"> Pin</label><label><input id="random-note-favorite" type="checkbox"> Favorite</label></div>
          <div id="random-note-editor" class="random-note-editor" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Start writing… Paste, drag, or upload images directly into this area."></div>
          <p class="random-note-image-help">Paste with Ctrl+V, drag and drop, or upload. Up to 5 images, 1 MB each. The writing area expands and can also be resized.</p>
          <label>Tags (comma separated)<input id="random-note-tags" placeholder="idea, personal, project"></label>
          <details><summary>Related books</summary><div class="random-note-badges">${state.books.map(b=>`<label class="random-note-badge"><input data-related-book type="checkbox" value="${escapeHtml(b.id)}"> ${escapeHtml(b.title)}</label>`).join('') || 'No cloud library books yet.'}</div></details>
          <div id="random-note-timestamps" class="random-note-meta">A creation date and time will be attached when saved.</div>
          <div class="random-note-actions"><button class="primary" id="save-random-note" type="button">Save Random Note</button><button class="secondary" id="new-random-note" type="button">New note</button><button class="secondary" id="email-all-random-notes" type="button">Email all Random Notes</button></div><p id="random-note-status" class="status random-note-status"></p>
        </section>
        <aside class="random-note-list-card"><div class="section-heading"><div><h2>Saved notes</h2><p>${state.notes.length} note${state.notes.length===1?'':'s'} in your account</p></div></div><div id="random-note-list"></div></aside>
      </div></section>`;
    renderNoteList();
    const editor=document.getElementById('random-note-editor');
    editor.addEventListener('paste',(event)=>{const files=[...event.clipboardData.items].filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(Boolean);if(files.length){event.preventDefault();files.forEach(f=>{try{insertImageFile(editor,f)}catch(e){alert(e.message)}})}});
    editor.addEventListener('dragover',e=>{e.preventDefault()}); editor.addEventListener('drop',e=>{e.preventDefault();[...e.dataTransfer.files].forEach(f=>{try{insertImageFile(editor,f)}catch(err){alert(err.message)}})});
    document.getElementById('random-note-image-button').onclick=()=>document.getElementById('random-note-image-input').click();
    document.getElementById('random-note-image-input').onchange=(e)=>[...e.target.files].forEach(f=>{try{insertImageFile(editor,f)}catch(err){alert(err.message)}});
    document.getElementById('new-random-note').onclick=resetEditor;
    document.getElementById('save-random-note').onclick=async()=>{const status=document.getElementById('random-note-status');status.textContent='Saving…';try{const payload=notePayload();const result=await request(state.editingId?`/api/account/random-notes/${state.editingId}`:'/api/account/random-notes',{method:state.editingId?'PUT':'POST',body:JSON.stringify(payload)});state.editingId=result.note.id;await loadNotes();renderNoteList();document.getElementById('random-note-timestamps').textContent=`Created ${fmtDate(result.note.created_at)} · Last updated ${fmtDate(result.note.updated_at)}`;document.getElementById('save-random-note').textContent='Update Random Note';status.textContent='Random Note saved to your account.';}catch(error){status.textContent=error.message;status.classList.add('error')}};
    document.getElementById('email-all-random-notes').onclick=()=>emailRandomNotes([]);
    document.getElementById('random-note-list').onclick=async(e)=>{const edit=e.target.closest('[data-note-edit]'),del=e.target.closest('[data-note-delete]'),email=e.target.closest('[data-note-email]');if(email)return emailRandomNotes([email.dataset.noteEmail]);if(del){if(confirm('Delete this Random Note?')){await request(`/api/account/random-notes/${del.dataset.noteDelete}`,{method:'DELETE'});await loadNotes();renderNoteList()}return}if(edit){const n=state.notes.find(x=>x.id===edit.dataset.noteEdit);if(!n)return;state.editingId=n.id;document.getElementById('random-note-title').value=n.title||'';editor.innerHTML=n.content_html||'';document.getElementById('random-note-tags').value=(n.tags||[]).join(', ');document.getElementById('random-note-pinned').checked=!!n.pinned;document.getElementById('random-note-favorite').checked=!!n.favorite;document.querySelectorAll('[data-related-book]').forEach(x=>x.checked=(n.related_book_ids||[]).includes(x.value));document.getElementById('random-note-timestamps').textContent=`Created ${fmtDate(n.created_at)} · Last updated ${fmtDate(n.updated_at)}`;document.getElementById('save-random-note').textContent='Update Random Note';editor.focus();window.scrollTo({top:0,behavior:'smooth'})}};
  }

  async function emailRandomNotes(ids) { const status=document.getElementById('random-note-status');if(status)status.textContent='Sending…';try{const result=await request('/api/account/random-notes/email',{method:'POST',body:JSON.stringify({ids})});if(status)status.textContent=`${result.count} Random Note${result.count===1?' was':'s were'} emailed${result.attachments?` with ${result.attachments} image attachment${result.attachments===1?'':'s'}`:''}.`;}catch(error){if(status){status.textContent=error.message;status.classList.add('error')}else alert(error.message)} }

  function enhanceActionCenter() {
    const section=document.querySelector('.action-email-settings'); if(!section||section.dataset.cloudEnhanced)return;section.dataset.cloudEnhanced='1';
    const buttons=section.querySelector('.action-email-buttons'); if(buttons&&!buttons.querySelector('#send-random-notes-email')){const b=document.createElement('button');b.className='secondary';b.type='button';b.id='send-random-notes-email';b.textContent='Email Random Notes';b.onclick=()=>emailRandomNotes([]);buttons.appendChild(b)}
    const status=document.createElement('div');status.className='email-cloud-status';status.innerHTML='<span id="email-status-address">Email: checking…</span><span id="email-status-notes">Notes: checking…</span><span id="email-status-saved">Last saved: checking…</span>';section.appendChild(status);
    request('/api/email/preferences').then(r=>{const p=r.preferences;document.getElementById('email-status-address').className=p?.email?'ok':'off';document.getElementById('email-status-address').textContent=p?.email?`✓ ${p.email}`:'Email address not saved';document.getElementById('email-status-notes').className=p?.notes?'ok':'off';document.getElementById('email-status-notes').textContent=p?.notes?'✓ Notes email enabled':'Notes email disabled';document.getElementById('email-status-saved').textContent=p?.updated_at?`Last saved ${fmtDate(p.updated_at)}`:'Not saved to account';}).catch(()=>{});
    const save=section.querySelector('#save-action-email'); if(save)save.addEventListener('click',()=>setTimeout(()=>{request('/api/email/preferences').then(r=>{const p=r.preferences;const s=document.getElementById('email-status-saved');if(s)s.textContent=p?.updated_at?`Last saved ${fmtDate(p.updated_at)}`:'Not saved';}).catch(()=>{})},800));
  }

  function enhanceCloudDocumentLabels() {
    const books=window.MarkSetGoCloudLibrary?.list?.()||[];
    document.querySelectorAll('.cloud-library-account-card').forEach(card=>{const id=card.dataset.cloudLibraryBookId;const book=books.find(b=>String(b.id)===String(id));if(!book)return;card.querySelectorAll('.cloud-document-state').forEach(x=>x.remove());const h=card.querySelector('h3');if(h)h.insertAdjacentHTML('beforeend',book.documentStored?'<span class="cloud-document-state document">Document saved to account</span>':'<span class="cloud-document-state metadata">Library entry saved</span>')});
    document.querySelectorAll('button').forEach(button=>{if(!/resume reading|continue reading/i.test(button.textContent||''))return;const card=button.closest('article,section,div');const title=card?.querySelector('h2,h3,strong')?.textContent?.trim();const book=books.find(b=>title&&b.title&&title.includes(b.title));if(!book||button.dataset.cloudResumeEnhanced)return;button.dataset.cloudResumeEnhanced='1';button.addEventListener('click',async(e)=>{if(book.documentStored){const localKey=`markSetGoDocumentV1:${book.clientRecordId}`;if(!localStorage.getItem(localKey)){e.preventDefault();e.stopImmediatePropagation();try{await window.MarkSetGoCloudDocuments.openText(book.id)}catch(err){alert(err.message)}}}},true)});
  }

  document.addEventListener('click',(event)=>{if(event.target.closest('[data-random-notes-nav]')){event.preventDefault();document.querySelectorAll('.site-header nav details[open]').forEach(x=>x.removeAttribute('open'));renderRandomNotes()}},true);
  const refreshProductivityEnhancements=()=>requestAnimationFrame(()=>{addNavigation();enhanceActionCenter();enhanceCloudDocumentLabels()});
  document.addEventListener('marksetgo:library-rendered',refreshProductivityEnhancements);
  document.addEventListener('marksetgo:action-saved',refreshProductivityEnhancements);
  document.addEventListener('marksetgo:cloud-library-ready',()=>{enhanceCloudDocumentLabels();refreshProductivityEnhancements();});
  document.addEventListener('click',(event)=>{if(event.target.closest?.('[data-action]'))window.setTimeout(refreshProductivityEnhancements,0);},true);
  [100,500,1200].forEach(delay=>window.setTimeout(refreshProductivityEnhancements,delay));
  injectStyles(); addNavigation();
  window.MarkSetGoRandomNotes=Object.freeze({open:renderRandomNotes,refresh:loadNotes,email:emailRandomNotes,version:VERSION});
})();
