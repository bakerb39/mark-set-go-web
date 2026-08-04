(() => {
  'use strict';

  const app = document.getElementById('app');
  const CAPTURE_KEY = 'markSetGoPendingWebCaptureV1';
  const IMPORT_HISTORY_KEY = 'markSetGoImportHistoryV1';
  let allowLegacyUpload = false;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function closeMenus() {
    document.querySelectorAll('.site-header details[open]').forEach((menu) => menu.removeAttribute('open'));
  }

  function history() {
    try { return JSON.parse(localStorage.getItem(IMPORT_HISTORY_KEY) || '[]'); } catch { return []; }
  }

  function addHistory(documentRecord) {
    const key = `${documentRecord.source?.type || 'text'}|${documentRecord.source?.url || ''}|${documentRecord.title}`.toLowerCase();
    const items = history().filter((item) => item.key !== key);
    items.unshift({
      key,
      title: documentRecord.title,
      sourceType: documentRecord.source?.type || 'text',
      sourceUrl: documentRecord.source?.url || '',
      importedAt: new Date().toISOString(),
      characters: documentRecord.text.length
    });
    localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(items.slice(0, 30)));
  }

  function openDocument(documentRecord) {
    const title = String(documentRecord?.title || 'Untitled').trim();
    const text = String(documentRecord?.text || '').trim();
    if (!text) throw new Error('No readable text was found.');
    if (typeof window.renderReaderWithText !== 'function') throw new Error('The reader is not ready.');
    addHistory({ ...documentRecord, title, text });
    window.renderReaderWithText(title, text, {
      ...(documentRecord.source || {}),
      author: documentRecord.author || documentRecord.source?.author || '',
      importedAt: documentRecord.source?.importedAt || new Date().toISOString(),
      readAnything: true
    });
  }

  function markdownToText(markdown) {
    return String(markdown || '')
      .replace(/```[\s\S]*?```/g, (block) => block.replace(/^```[^\n]*\n?|```$/g, ''))
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '• ')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/[*_~`]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function importUrl(url, status) {
    const response = await fetch('/api/fetch-text', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The webpage could not be imported.');
    const parsed = new URL(url);
    openDocument({
      title: payload.title || parsed.hostname,
      author: payload.author || '',
      text: payload.text,
      source: { type: 'website', url, site: parsed.hostname, importedAt: new Date().toISOString() }
    });
    status.textContent = 'Opening webpage…';
  }

  async function importDocx(file) {
    const response = await fetch('/api/import/docx', {
      method: 'POST', headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, body: await file.arrayBuffer()
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The Word document could not be imported.');
    openDocument({ title: payload.title || file.name.replace(/\.docx$/i, ''), text: payload.text, source: { type: 'docx', name: file.name, fileSize: file.size } });
  }

  async function importSimpleFile(file) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.docx')) return importDocx(file);
    if (lower.endsWith('.epub') || lower.endsWith('.pdf')) {
      allowLegacyUpload = true;
      const legacy = document.createElement('button');
      legacy.type = 'button';
      legacy.dataset.read = 'upload';
      legacy.hidden = true;
      document.body.appendChild(legacy);
      legacy.click();
      legacy.remove();
      allowLegacyUpload = false;
      window.setTimeout(() => document.getElementById('text-file')?.click(), 50);
      return;
    }
    const raw = await file.text();
    const text = lower.endsWith('.md') || lower.endsWith('.markdown') ? markdownToText(raw) : raw.trim();
    if (!text) throw new Error('The selected file is empty.');
    openDocument({
      title: file.name.replace(/\.(txt|md|markdown)$/i, ''), text,
      source: { type: lower.endsWith('.md') || lower.endsWith('.markdown') ? 'markdown' : 'text-upload', name: file.name, fileSize: file.size }
    });
  }

  function bookmarkletCode() {
    const target = `${location.origin}/capture`;
    return `javascript:(()=>{const e=s=>String(s||'').replace(/\\s+/g,' ').trim(),r=document.querySelector('article,main,[role=main]')||document.body,t=e(document.querySelector('meta[property="og:title"]')?.content||document.querySelector('h1')?.innerText||document.title),a=e(document.querySelector('meta[name="author"]')?.content||document.querySelector('[rel=author]')?.innerText),x=[...r.querySelectorAll('h1,h2,h3,p,blockquote,li')].map(n=>e(n.innerText)).filter(v=>v.length>20).filter((v,i,z)=>z.indexOf(v)===i).join('\\n\\n'),f=document.createElement('form');f.method='POST';f.action='${target}';f.target='_blank';[['title',t],['author',a],['url',location.href],['text',x]].forEach(([n,v])=>{const i=document.createElement('textarea');i.name=n;i.value=v;f.appendChild(i)});f.hidden=true;document.body.appendChild(f);f.submit();f.remove()})()`;
  }

  function renderHub() {
    closeMenus();
    const recent = history().slice(0, 5);
    app.innerHTML = `
      <section class="panel read-anything-page">
        <header class="read-anything-hero">
          <div><span class="source-category">Universal Import</span><h1>Read Anything</h1><p>Bring webpages, articles, books, documents, or pasted text into the same Mark, Set, Go! reader.</p></div>
          <span class="read-anything-promise">Read Anything. Learn Everything.</span>
        </header>

        <div class="read-anything-grid">
          <section class="read-anything-card featured">
            <span class="read-anything-icon">🌐</span><h2>Webpage or article</h2><p>Paste a public URL and extract its readable text.</p>
            <form id="read-anything-url-form"><label>Web address<input id="read-anything-url" type="url" required placeholder="https://example.com/article"></label><button class="primary" type="submit">Open in Reader</button></form>
          </section>
          <section class="read-anything-card">
            <span class="read-anything-icon">⇧</span><h2>Upload a file</h2><p>EPUB, PDF, Word, Markdown, and plain text.</p>
            <label class="secondary button-link read-anything-file-button">Choose file<input id="read-anything-file" type="file" accept=".epub,.pdf,.docx,.txt,.md,.markdown" hidden></label>
          </section>
          <section class="read-anything-card">
            <span class="read-anything-icon">📋</span><h2>Paste text</h2><p>Paste an article, notes, manuscript, or other text.</p>
            <button id="read-anything-paste" class="secondary" type="button">Paste Text</button>
          </section>
          <section class="read-anything-card">
            <span class="read-anything-icon">🔖</span><h2>Read with Mark</h2><p>Install the bookmarklet and capture the webpage you are viewing.</p>
            <button id="read-anything-bookmarklet" class="secondary" type="button">Show Bookmarklet</button>
          </section>
          <section class="read-anything-card">
            <span class="read-anything-icon">G</span><h2>Project Gutenberg</h2><p>Search public-domain books already supported by the app.</p>
            <button class="secondary" type="button" data-read="gutenberg">Search Gutenberg</button>
          </section>
          <section class="read-anything-card">
            <span class="read-anything-icon">◎</span><h2>All public libraries</h2><p>Search Internet Archive, Wikisource, Gutenberg, and more.</p>
            <button class="secondary" type="button" data-read="unified-library">Browse Libraries</button>
          </section>
        </div>
        <div id="read-anything-status" class="status" role="status" aria-live="polite"></div>
        <section id="read-anything-workspace" class="read-anything-workspace" hidden></section>
        ${recent.length ? `<section class="read-anything-recent"><h2>Recent imports</h2>${recent.map((item) => `<article><span>${escapeHtml(item.sourceType)}</span><strong>${escapeHtml(item.title)}</strong><small>${new Date(item.importedAt).toLocaleString()}</small></article>`).join('')}</section>` : ''}
      </section>`;

    const status = app.querySelector('#read-anything-status');
    app.querySelector('#read-anything-url-form').addEventListener('submit', async (event) => {
      event.preventDefault(); status.className = 'status'; status.textContent = 'Extracting webpage…';
      try { await importUrl(app.querySelector('#read-anything-url').value.trim(), status); }
      catch (error) { status.className = 'status error'; status.textContent = error.message; }
    });
    app.querySelector('#read-anything-file').addEventListener('change', async (event) => {
      const file = event.target.files?.[0]; if (!file) return;
      status.className = 'status'; status.textContent = `Opening ${file.name}…`;
      try { await importSimpleFile(file); }
      catch (error) { status.className = 'status error'; status.textContent = error.message; }
    });
    app.querySelector('#read-anything-paste').addEventListener('click', () => {
      const workspace = app.querySelector('#read-anything-workspace');
      workspace.hidden = false;
      workspace.innerHTML = `<h2>Paste text</h2><label>Title<input id="paste-title" type="text" placeholder="Untitled"></label><label>Text<textarea id="paste-content" rows="12" placeholder="Paste readable text here…"></textarea></label><div class="source-actions"><button id="paste-open" class="primary" type="button">Open in Reader</button><button id="paste-cancel" class="secondary" type="button">Cancel</button></div>`;
      workspace.querySelector('#paste-open').addEventListener('click', () => {
        try { openDocument({ title: workspace.querySelector('#paste-title').value || 'Pasted Text', text: workspace.querySelector('#paste-content').value, source: { type: 'pasted-text' } }); }
        catch (error) { status.className = 'status error'; status.textContent = error.message; }
      });
      workspace.querySelector('#paste-cancel').addEventListener('click', () => { workspace.hidden = true; workspace.innerHTML = ''; });
      workspace.querySelector('#paste-content').focus();
    });
    app.querySelector('#read-anything-bookmarklet').addEventListener('click', () => {
      const workspace = app.querySelector('#read-anything-workspace');
      const code = bookmarkletCode();
      workspace.hidden = false;
      workspace.innerHTML = `<h2>Install “Read with Mark”</h2><p>Drag this button to your bookmarks bar. On iPhone Safari, create a bookmark and replace its address with the code below.</p><p><a class="primary button-link" href="${escapeHtml(code)}">Read with Mark</a></p><label>Bookmark address<textarea id="bookmarklet-code" rows="6" readonly>${escapeHtml(code)}</textarea></label>`;
      workspace.querySelector('#bookmarklet-code').addEventListener('focus', (event) => event.currentTarget.select());
    });
  }

  function openPendingCapture(attempt = 0) {
    const params = new URLSearchParams(location.search);
    if (!params.has('read-anything-capture')) return;
    let payload = null;
    try { payload = JSON.parse(sessionStorage.getItem(CAPTURE_KEY) || 'null'); } catch {}
    if (!payload?.text) {
      sessionStorage.removeItem(CAPTURE_KEY);
      history.replaceState({}, '', location.pathname + location.hash);
      renderHub();
      return;
    }

    // Wait until the app's normal startup rendering has completed. Opening the
    // captured document too early allows the home-page initializer to overwrite it.
    if (typeof window.renderReaderWithText !== 'function' || attempt < 3) {
      if (attempt < 20) window.setTimeout(() => openPendingCapture(attempt + 1), 250);
      else renderHub();
      return;
    }

    try {
      openDocument({
        title: payload.title || 'Web Article',
        author: payload.author || '',
        text: payload.text,
        source: { type: 'bookmarklet', url: payload.url || '', importedAt: new Date().toISOString() }
      });
      sessionStorage.removeItem(CAPTURE_KEY);
      history.replaceState({}, '', location.pathname + location.hash);
    } catch {
      if (attempt < 20) window.setTimeout(() => openPendingCapture(attempt + 1), 250);
      else renderHub();
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest?.('[data-read="upload"],[data-action="read-anything"]');
    if (!target || allowLegacyUpload) return;
    event.preventDefault(); event.stopImmediatePropagation();
    renderHub();
  }, true);

  window.MarkSetGoReadAnything = Object.freeze({ render: renderHub, openDocument, bookmarkletCode });
  window.setTimeout(openPendingCapture, 0);
})();
