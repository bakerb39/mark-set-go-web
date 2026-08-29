
(() => {
  'use strict';

  const DOCS = [
    { id:'readme', title:'MSG Developer Docs', note:'Overview and document index', file:'/docs/README.md' },
    { id:'rules', title:'Development Rules', note:'Priorities, workflow, architecture', file:'/docs/MSG-DEVELOPMENT-RULES.md' },
    { id:'constraints', title:'MSG Constraints', note:'Hard rules and regression guards', file:'/docs/MSG-CONSTRAINTS.md' }
  ];

  const list = document.getElementById('msg-docs-list');
  const content = document.getElementById('msg-docs-content');
  const title = document.getElementById('msg-docs-title');
  const status = document.getElementById('msg-docs-status');
  const search = document.getElementById('msg-docs-search');
  const copy = document.getElementById('msg-docs-copy');
  const rawButton = document.getElementById('msg-docs-raw');

  let active = DOCS[0];
  let activeMarkdown = '';
  const cache = new Map();

  const escapeHtml = (value='') => String(value)
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'","&#39;");

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
    let inCode = false, code = [], listType = '', quote = [];

    const closeList = () => {
      if (listType) { out.push(`</${listType}>`); listType = ''; }
    };
    const closeQuote = () => {
      if (quote.length) { out.push(`<blockquote>${quote.map(x=>`<p>${inline(x)}</p>`).join('')}</blockquote>`); quote=[]; }
    };

    for (let i=0; i<lines.length; i++) {
      const line = lines[i];

      if (/^```/.test(line)) {
        closeList(); closeQuote();
        if (!inCode) { inCode = true; code = []; }
        else { out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); inCode = false; code = []; }
        continue;
      }
      if (inCode) { code.push(line); continue; }

      if (/^>\s?/.test(line)) {
        closeList();
        quote.push(line.replace(/^>\s?/, ''));
        continue;
      } else closeQuote();

      if (!line.trim()) { closeList(); continue; }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        closeList();
        const n = heading[1].length;
        out.push(`<h${n}>${inline(heading[2])}</h${n}>`);
        continue;
      }
      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        closeList(); out.push('<hr>'); continue;
      }

      const ul = line.match(/^\s*[-*+]\s+(.+)$/);
      const ol = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (ul || ol) {
        const wanted = ul ? 'ul' : 'ol';
        if (listType !== wanted) { closeList(); listType = wanted; out.push(`<${wanted}>`); }
        out.push(`<li>${inline((ul || ol)[1])}</li>`);
        continue;
      }

      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }

    if (inCode) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
    closeList(); closeQuote();
    return out.join('\n');
  }

  async function fetchDoc(doc) {
    if (cache.has(doc.id)) return cache.get(doc.id);
    const response = await fetch(doc.file, { cache:'no-store' });
    if (!response.ok) throw new Error(`Could not load ${doc.title} (${response.status})`);
    const text = await response.text();
    cache.set(doc.id, text);
    return text;
  }

  function renderList(filter='') {
    const q = filter.trim().toLowerCase();
    list.innerHTML = '';
    DOCS.filter(d => !q || `${d.title} ${d.note}`.toLowerCase().includes(q)).forEach(doc => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `msg-doc-link${doc.id === active.id ? ' active' : ''}`;
      button.innerHTML = `<strong>${escapeHtml(doc.title)}</strong><small>${escapeHtml(doc.note)}</small>`;
      button.addEventListener('click', () => loadDoc(doc));
      list.appendChild(button);
    });
    if (!list.children.length) list.innerHTML = '<div class="msg-docs-empty">No document titles match.</div>';
  }

  function highlightRendered(query) {
    if (!query) return;
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest('code,pre')) continue;
      if (node.nodeValue.toLowerCase().includes(query.toLowerCase())) nodes.push(node);
    }
    nodes.forEach(node => {
      const text = node.nodeValue;
      const rx = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'ig');
      const span = document.createElement('span');
      span.innerHTML = escapeHtml(text).replace(rx, '<mark>$1</mark>');
      node.replaceWith(...span.childNodes);
    });
  }

  async function loadDoc(doc) {
    active = doc;
    renderList(search.value);
    title.textContent = doc.title;
    status.textContent = 'Loading…';
    try {
      activeMarkdown = await fetchDoc(doc);
      content.innerHTML = markdownToHtml(activeMarkdown);
      status.textContent = '';
      if (search.value.trim()) highlightRendered(search.value.trim());
      const url = new URL(location.href);
      url.searchParams.set('doc', doc.id);
      history.replaceState(null, '', url);
    } catch (error) {
      activeMarkdown = '';
      content.innerHTML = `<div class="msg-docs-empty">${escapeHtml(error.message)}</div>`;
      status.textContent = '';
    }
  }

  search.addEventListener('input', () => {
    renderList(search.value);
    content.innerHTML = markdownToHtml(activeMarkdown);
    if (search.value.trim()) highlightRendered(search.value.trim());
  });

  copy.addEventListener('click', async () => {
    if (!activeMarkdown) return;
    try {
      await navigator.clipboard.writeText(activeMarkdown);
      status.textContent = 'Markdown copied.';
      setTimeout(() => { if (status.textContent === 'Markdown copied.') status.textContent=''; }, 1400);
    } catch {
      status.textContent = 'Copy was blocked by the browser.';
    }
  });

  rawButton.addEventListener('click', () => {
    window.open(active.file, '_blank', 'noopener');
  });

  const requested = new URLSearchParams(location.search).get('doc');
  active = DOCS.find(d => d.id === requested) || DOCS[0];
  renderList();
  loadDoc(active);
})();
