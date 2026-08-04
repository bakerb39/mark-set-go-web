(() => {
  'use strict';

  const app = document.getElementById('app');
  const CAPTURE_KEY = 'markSetGoPendingWebCaptureV1';
  const CAPTURE_STORAGE = window.localStorage;
  const IMPORT_HISTORY_KEY = 'markSetGoImportHistoryV1';
  let allowLegacyUpload = false;
  let activeImportedDocument = null;
  let activeImportedVersion = 'original';
  let formatControlObserver = null;

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

  function cleanFormatText(value) {
    const lines = String(value || '').replace(/\r/g, '').split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim());
    const output = [];
    let paragraph = [];
    const flush = () => { if (paragraph.length) { output.push(paragraph.join(' ').replace(/\s+/g, ' ').trim()); paragraph = []; } };
    for (const line of lines) {
      if (!line) { flush(); continue; }
      if (/^(chapter|part|section)\s+[\divxlcdm]+\b/i.test(line) || (/^[A-Z0-9][A-Z0-9 ’'“”"—–:-]{3,90}$/.test(line) && line.split(/\s+/).length < 12)) {
        flush(); output.push(line); continue;
      }
      if (/^[•▪◦*-]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) { flush(); output.push(line); continue; }
      paragraph.push(line);
      if (/[.!?][”"']?$/.test(line) && paragraph.join(' ').length > 420) flush();
    }
    flush();
    return output.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function versionLabel(level) {
    return ({ original: 'Original', clean: 'Clean Format', college: 'College Level', highschool: 'High School Level', grade8: 'Grade 8', grade6: 'Grade 6', grade4: 'Grade 4' })[level] || level;
  }

  function showTransformStatus(message, isError = false) {
    const el = document.querySelector('#read-anything-transform-status');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', isError);
    el.hidden = !message;
  }

  function renderImportedVersion(level) {
    if (!activeImportedDocument) return;
    const text = activeImportedDocument.versions?.[level];
    if (!text) return;
    activeImportedVersion = level;
    const suffix = level === 'original' ? '' : ` — ${versionLabel(level)}`;
    window.renderReaderWithText(`${activeImportedDocument.title}${suffix}`, text, {
      ...(activeImportedDocument.source || {}),
      author: activeImportedDocument.author || activeImportedDocument.source?.author || '',
      importedAt: activeImportedDocument.source?.importedAt || new Date().toISOString(),
      readAnything: true,
      adaptedFrom: activeImportedDocument.title,
      readingLevel: level
    });
    window.setTimeout(installFormatControl, 0);
    window.setTimeout(installFormatControl, 100);
    window.setTimeout(installFormatControl, 500);
  }

  async function requestReadingLevel(level) {
    if (!activeImportedDocument) return;
    if (activeImportedDocument.versions[level]) return renderImportedVersion(level);
    showTransformStatus(`Creating ${versionLabel(level)} version…`);
    const requestBody = JSON.stringify({
      title: activeImportedDocument.title,
      text: activeImportedDocument.versions.clean || activeImportedDocument.versions.original,
      level
    });

    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 115000);
      try {
        if (attempt > 1) showTransformStatus(`Retrying ${versionLabel(level)} version…`);
        const response = await fetch('/api/read-anything/adapt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
          signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || payload.error || `Server returned HTTP ${response.status}.`);
        if (!payload.text) throw new Error('The server returned an empty adapted version.');
        activeImportedDocument.versions[level] = payload.text;
        showTransformStatus('');
        renderImportedVersion(level);
        return;
      } catch (error) {
        lastError = error;
        if (error?.name === 'AbortError') lastError = new Error('The adaptation took too long. Try a shorter article or section.');
        if (attempt < 2 && error?.name !== 'AbortError') await new Promise((resolve) => window.setTimeout(resolve, 1200));
      } finally {
        window.clearTimeout(timeout);
      }
    }
    throw new Error(lastError?.message === 'Failed to fetch'
      ? 'The adaptation connection was interrupted. Try again, or use a shorter article.'
      : lastError?.message || 'The reading-level version could not be created.');
  }

  function ensureFormatControlObserver() {
    if (formatControlObserver || !document.body) return;
    formatControlObserver = new MutationObserver(() => {
      if (!activeImportedDocument) return;
      window.requestAnimationFrame(installFormatControl);
    });
    formatControlObserver.observe(document.body, { childList: true, subtree: true });
  }

  function installFormatControl() {
    if (!activeImportedDocument) return;
    ensureFormatControlObserver();
    const titleRow = document.querySelector('.reader-title-row');
    if (!titleRow || titleRow.querySelector('#read-anything-format-control')) return;
    const control = document.createElement('details');
    control.id = 'read-anything-format-control';
    control.className = 'read-anything-format-control';
    control.innerHTML = `<summary>Format</summary><div class="read-anything-format-menu"><strong>Imported text</strong><button type="button" data-level="original">Original wording</button><button type="button" data-level="clean">Clean layout</button><label>Reading level<select id="read-anything-level"><option value="original">Original</option><option value="college">College</option><option value="highschool">High school</option><option value="grade8">Grade 8</option><option value="grade6">Grade 6</option><option value="grade4">Grade 4</option></select></label><button type="button" class="primary" data-action="apply-level">Apply level</button><small>Adapted versions preserve the original and are labeled separately.</small><div id="read-anything-transform-status" class="status" hidden></div></div>`;
    titleRow.appendChild(control);
    control.querySelector('#read-anything-level').value = activeImportedVersion;
    control.addEventListener('click', async (event) => {
      const levelButton = event.target.closest('[data-level]');
      if (levelButton) {
        const level = levelButton.dataset.level;
        if (level === 'clean' && !activeImportedDocument.versions.clean) activeImportedDocument.versions.clean = cleanFormatText(activeImportedDocument.versions.original);
        renderImportedVersion(level);
        return;
      }
      if (event.target.closest('[data-action="apply-level"]')) {
        const level = control.querySelector('#read-anything-level').value;
        try {
          if (level === 'original') return renderImportedVersion('original');
          await requestReadingLevel(level);
        } catch (error) { showTransformStatus(error.message, true); }
      }
    });
  }

  function openDocument(documentRecord) {
    const title = String(documentRecord?.title || 'Untitled').trim();
    const text = String(documentRecord?.text || '').trim();
    if (!text) throw new Error('No readable text was found.');
    if (typeof window.renderReaderWithText !== 'function') throw new Error('The reader is not ready.');
    addHistory({ ...documentRecord, title, text });
    activeImportedDocument = {
      ...documentRecord, title, author: documentRecord.author || documentRecord.source?.author || '',
      versions: { original: text, clean: cleanFormatText(text) }
    };
    activeImportedVersion = 'original';
    renderImportedVersion('original');
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
    return `javascript:(()=>{const e=s=>String(s||'').replace(/\s+/g,' ').trim(),s=e(window.getSelection?.().toString()),r=document.querySelector('article,main,[role=main]')||document.body,t=e(document.querySelector('meta[property="og:title"]')?.content||document.querySelector('h1')?.innerText||document.title),a=e(document.querySelector('meta[name="author"]')?.content||document.querySelector('[rel=author]')?.innerText),x=s||[...r.querySelectorAll('h1,h2,h3,p,blockquote,li')].map(n=>e(n.innerText)).filter(v=>v.length>20).filter((v,i,z)=>z.indexOf(v)===i).join('\n\n'),k=s?'selection':'page',c=s?e(window.getSelection()?.anchorNode?.parentElement?.closest('p,blockquote,li')?.innerText||''):'',f=document.createElement('form');f.method='POST';f.action='${target}';f.target='_blank';[['title',t],['author',a],['url',location.href],['text',x],['captureType',k],['context',c]].forEach(([n,v])=>{const i=document.createElement('textarea');i.name=n;i.value=v;f.appendChild(i)});f.hidden=true;document.body.appendChild(f);f.submit();f.remove()})()`;
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
            <span class="read-anything-icon">🔖</span><h2>Read with Mark</h2><p>Import a full webpage, or highlight a passage first to send only the selection.</p>
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
      workspace.innerHTML = `<h2>Install “Read with Mark”</h2><p>Drag this button to your bookmarks bar. Highlight text before clicking it to capture only that passage; otherwise it imports the full page. On iPhone Safari, create a bookmark and replace its address with the code below.</p><p><a class="primary button-link" href="${escapeHtml(code)}">Read with Mark</a></p><label>Bookmark address<textarea id="bookmarklet-code" rows="6" readonly>${escapeHtml(code)}</textarea></label>`;
      workspace.querySelector('#bookmarklet-code').addEventListener('focus', (event) => event.currentTarget.select());
    });
  }

  function openPendingCapture(attempt = 0) {
    let payload = null;
    try { payload = JSON.parse(CAPTURE_STORAGE.getItem(CAPTURE_KEY) || 'null'); } catch {}
    if (!payload?.text) return;
    if (typeof window.renderReaderWithText !== 'function' || attempt < 4) {
      if (attempt < 24) window.setTimeout(() => openPendingCapture(attempt + 1), 250);
      return;
    }
    try {
      const isSelection = payload.captureType === 'selection';
      openDocument({
        title: isSelection ? `Selected passage — ${payload.title || 'Web Page'}` : (payload.title || 'Web Article'),
        author: payload.author || '',
        text: payload.text,
        source: {
          type: isSelection ? 'web-passage' : 'bookmarklet',
          url: payload.url || '',
          context: payload.context || '',
          captureType: payload.captureType || 'page',
          importedAt: new Date().toISOString()
        }
      });
      CAPTURE_STORAGE.removeItem(CAPTURE_KEY);
      if (location.hash.includes('read-anything-capture')) history.replaceState({}, '', location.pathname);
    } catch {
      if (attempt < 24) window.setTimeout(() => openPendingCapture(attempt + 1), 250);
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest?.('[data-read="upload"],[data-action="read-anything"]');
    if (!target || allowLegacyUpload) return;
    event.preventDefault(); event.stopImmediatePropagation();
    renderHub();
  }, true);

  window.MarkSetGoReadAnything = Object.freeze({ render: renderHub, openDocument, bookmarkletCode, cleanFormatText });
  window.setTimeout(openPendingCapture, 0);
})();
