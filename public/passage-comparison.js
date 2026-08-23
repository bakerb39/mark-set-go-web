/* Mark, Set, Go! — Passage Comparison Basket v1.3
   - Intercepts the Reader popup toolbar's existing ∞ Compare action.
   - Collects selected passages without browser storage.
   - Reader 2 hands selections to the parent Reader.
   - Separate top-level tabs synchronize live with BroadcastChannel.
   - Ask Mark can compare immediately; Comparison Workspace remains optional.
   - No MutationObserver. */
(() => {
  'use strict';

  const MAX_PASSAGES = 8;
  const CHANNEL_NAME = 'msg-passage-comparison-v1';
  const instanceId = globalThis.crypto?.randomUUID?.() || `pc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const isChildFrame = window.parent && window.parent !== window;
  let passages = [];
  let expanded = false;
  let statusMessage = '';
  let channel = null;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[char]));

  const clean = (value, max = 12000) => String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max);

  function normalizePassage(input = {}) {
    const text = clean(input.text || input.passage || input.selection || '', 12000);
    const title = clean(input.title || 'Selected passage', 300) || 'Selected passage';
    return {
      id: clean(input.id || `passage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, 180),
      documentId: clean(input.documentId || '', 240),
      title,
      author: clean(input.author || '', 220),
      chapter: clean(input.chapter || '', 300),
      text,
      startIndex: Number.isFinite(Number(input.startIndex)) ? Math.max(0, Number(input.startIndex)) : null,
      endIndex: Number.isFinite(Number(input.endIndex)) ? Math.max(0, Number(input.endIndex)) : null,
      readerLabel: clean(input.readerLabel || '', 80),
      sourceLabel: clean(input.sourceLabel || title, 300),
      sourceUrl: clean(input.sourceUrl || '', 2000),
      createdAt: clean(input.createdAt || new Date().toISOString(), 80)
    };
  }

  function passageKey(passage) {
    return [
      passage.documentId,
      passage.startIndex ?? '',
      passage.endIndex ?? '',
      passage.text
    ].join('|');
  }

  function currentReaderDocument() {
    try { return window.MarkSetGoCurrentReaderDocument?.get?.() || {}; }
    catch { return {}; }
  }

  function selectedReaderWords() {
    const reader = document.querySelector('#reader');
    if (!reader) return [];
    const seen = new Set();
    return [...reader.querySelectorAll('.reader-word.ask-mark-selected[data-index]')]
      .filter((node) => {
        const index = Number(node.dataset.index);
        if (!Number.isFinite(index) || seen.has(index)) return false;
        seen.add(index);
        return true;
      })
      .sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index));
  }

  function collectCurrentSelection() {
    const reader = document.querySelector('#reader');
    if (!reader) return null;

    const words = selectedReaderWords();
    let text = '';
    let canonicalSelection = null;

    // Prefer the Reader's public canonical selection bridge. It resolves the
    // exact Ask Mark selection from Reader state, so clicking the toolbar cannot
    // collapse native browser selection and make Reader 2 lose Passage B.
    try {
      canonicalSelection = window.MarkSetGoCurrentReaderDocument?.getSelectionRange?.() || null;
      if (canonicalSelection?.text) {
        text = clean(canonicalSelection.text.replace(/\s+/g, ' '), 12000);
      }
    } catch {}

    // Fallbacks support older Reader builds and nonstandard readable surfaces.
    if (!text) {
      try {
        const selection = window.getSelection?.();
        if (selection && !selection.isCollapsed && selection.rangeCount) {
          const range = selection.getRangeAt(0);
          const common = range.commonAncestorContainer?.nodeType === Node.ELEMENT_NODE
            ? range.commonAncestorContainer
            : range.commonAncestorContainer?.parentElement;
          if (common && (common === reader || reader.contains(common))) {
            text = clean(selection.toString().replace(/\s+/g, ' '), 12000);
          }
        }
      } catch {}
    }

    if (!text && words.length) {
      text = clean(words.map((node) => node.textContent || '').join(' ').replace(/\s+/g, ' '), 12000);
    }
    if (!text) return null;

    const doc = currentReaderDocument();
    const source = doc?.source || {};
    const title = clean(
      doc?.title ||
      document.querySelector('.reader-title-copy h1')?.textContent ||
      document.querySelector('.reader-page-panel h1')?.textContent ||
      document.title ||
      'Current text',
      300
    );
    const author = clean(doc?.author || source?.author || '', 220);
    const chapter = clean(doc?.chapter || doc?.section || source?.chapter || '', 300);
    const startIndex = Number.isFinite(Number(canonicalSelection?.startIndex))
      ? Number(canonicalSelection.startIndex)
      : (words.length ? Number(words[0].dataset.index) : null);
    const endIndex = Number.isFinite(Number(canonicalSelection?.endIndex))
      ? Number(canonicalSelection.endIndex)
      : (words.length ? Number(words[words.length - 1].dataset.index) + 1 : null);
    const readerLabel = window.__MSG_SECONDARY_READER__ ? 'Reader 2' : 'Reader 1';

    return normalizePassage({
      documentId: canonicalSelection?.documentId || doc?.documentId || doc?.id || source?.documentId || '',
      title,
      author,
      chapter,
      text,
      startIndex,
      endIndex,
      readerLabel,
      sourceLabel: author ? `${title} — ${author}` : title,
      sourceUrl: source?.url || ''
    });
  }

  function notify(message) {
    statusMessage = clean(message, 300);
    renderTray();
  }

  function broadcastState() {
    if (!channel || isChildFrame) return;
    try {
      channel.postMessage({
        type: 'state',
        source: instanceId,
        passages
      });
    } catch {}
  }

  function replacePassages(next, { broadcast = false, open = false } = {}) {
    const normalized = (Array.isArray(next) ? next : [])
      .map(normalizePassage)
      .filter((item) => item.text)
      .slice(0, MAX_PASSAGES);
    const unique = [];
    const keys = new Set();
    normalized.forEach((item) => {
      const key = passageKey(item);
      if (keys.has(key)) return;
      keys.add(key);
      unique.push(item);
    });
    passages = unique;
    if (open && passages.length) expanded = true;
    renderTray();
    if (broadcast) broadcastState();
  }

  function addPassage(input, { broadcast = true } = {}) {
    const passage = normalizePassage(input);
    if (!passage.text) return false;

    const key = passageKey(passage);
    if (passages.some((item) => passageKey(item) === key)) {
      expanded = true;
      notify('That passage is already in the comparison.');
      return true;
    }

    if (passages.length >= MAX_PASSAGES) passages = passages.slice(1);
    passages.push(passage);
    expanded = true;
    statusMessage = passages.length === 1
      ? 'Passage 1 added. Highlight another passage and choose Compare.'
      : `${passages.length} passages ready. Ask Mark now or add another.`;
    renderTray();
    if (broadcast) broadcastState();
    return true;
  }

  function removePassage(id) {
    passages = passages.filter((item) => item.id !== id);
    statusMessage = passages.length
      ? `${passages.length} passage${passages.length === 1 ? '' : 's'} in comparison.`
      : '';
    if (!passages.length) expanded = false;
    renderTray();
    broadcastState();
  }

  function clearPassages() {
    passages = [];
    expanded = false;
    statusMessage = '';
    renderTray();
    broadcastState();
  }

  function lensInstruction() {
    const value = document.querySelector('#msg-passage-comparison-lens')?.value || 'compare';
    return ({
      compare: 'Compare the passages directly. Identify the most important similarities, differences, assumptions, and implications.',
      ideas: 'Compare the central ideas and concepts in these passages, including where the authors converge or diverge.',
      arguments: 'Compare the claims, evidence, assumptions, and reasoning in these passages. Evaluate the strongest points of tension.',
      style: 'Compare the rhetoric, voice, imagery, diction, structure, and other important stylistic choices in these passages.',
      context: 'Compare the historical, intellectual, literary, or scientific context of these passages and explain why those contexts matter.',
      synthesize: 'Synthesize these passages into a larger insight. Explain what becomes visible when they are read together rather than separately.'
    })[value] || 'Compare these passages carefully.';
  }

  function comparisonQuestion() {
    const instruction = lensInstruction();
    const blocks = [];
    let remaining = 26000;
    passages.forEach((passage, index) => {
      if (remaining <= 0) return;
      const heading = `PASSAGE ${String.fromCharCode(65 + index)} — ${passage.title}${passage.author ? ` by ${passage.author}` : ''}${passage.chapter ? ` · ${passage.chapter}` : ''}`;
      const allowance = Math.max(1000, Math.min(6500, remaining - heading.length - 12));
      const text = passage.text.slice(0, allowance);
      blocks.push(`${heading}:\n${text}`);
      remaining -= heading.length + text.length + 12;
    });
    return `${instruction}\n\n${blocks.join('\n\n')}\n\nUse specific textual connections. Distinguish strong parallels from superficial ones. End with 3 useful questions for further reading.`;
  }

  function renderMarkResult(panel, payload) {
    const result = payload?.result || {};
    const heading = clean(result.heading || 'Passage comparison', 300);
    const response = clean(result.response || '', 16000);
    const keyPoints = Array.isArray(result.keyPoints) ? result.keyPoints.slice(0, 12) : [];
    const cautions = Array.isArray(result.cautions) ? result.cautions.slice(0, 8) : [];

    panel.innerHTML = `
      <div class="mark-response-heading"><span>Ask Mark</span><strong>${esc(heading)}</strong></div>
      <p>${esc(response)}</p>
      ${keyPoints.length ? `<ul>${keyPoints.map((item) => `<li>${esc(clean(item, 1200))}</li>`).join('')}</ul>` : ''}
      ${cautions.length ? `<div class="mark-cautions">${cautions.map((item) => `<p>${esc(clean(item, 1200))}</p>`).join('')}</div>` : ''}`;
  }

  async function askMarkToCompare() {
    if (passages.length < 2) {
      expanded = true;
      notify('Add at least two passages before asking Mark to compare them.');
      return;
    }

    try {
      if (typeof window.openMarkPanel === 'function') window.openMarkPanel('selection');
      if (typeof window.renderMarkSelectionCard === 'function') window.renderMarkSelectionCard();
    } catch {}

    let panel = document.querySelector('#mark-response');
    const trayResponse = document.querySelector('[data-pc-inline-response]');
    if (!panel && trayResponse) {
      trayResponse.hidden = false;
      panel = trayResponse;
    }
    if (!panel) return;

    panel.hidden = false;
    panel.innerHTML = '<p class="status">Ask Mark is comparing the selected passages…</p>';
    statusMessage = 'Sent to Ask Mark.';
    renderTray();

    const first = passages[0];
    try {
      const response = await fetch('/api/mark-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selection: first.text,
          action: 'ask',
          question: comparisonQuestion(),
          title: first.title,
          chapter: first.chapter || ''
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.detail || `HTTP ${response.status}`);
      renderMarkResult(panel, payload);
      statusMessage = 'Mark finished the comparison. Your passages remain in the tray.';
      renderTray();
    } catch (error) {
      panel.innerHTML = `<p class="status error">${esc(error?.message || 'Ask Mark could not complete the comparison.')}</p>`;
      statusMessage = 'Ask Mark could not complete the comparison.';
      renderTray();
    }
  }

  function openComparisonWorkspace() {
    if (passages.length < 2) {
      expanded = true;
      notify('Add at least two passages before opening the Comparison Workspace.');
      return;
    }
    const opened = window.open('/comparison-workspace.html?passageBasket=1', '_blank');
    if (!opened) {
      expanded = true;
      notify('The Comparison Workspace was blocked. Allow pop-ups for this site and try again.');
      return;
    }
    statusMessage = 'Comparison Workspace opened with these passages.';
    renderTray();
  }

  function ensureTray() {
    if (isChildFrame) return null;
    let tray = document.getElementById('msg-passage-comparison-tray');
    if (tray) return tray;

    tray = document.createElement('aside');
    tray.id = 'msg-passage-comparison-tray';
    tray.className = 'msg-passage-comparison-tray';
    tray.hidden = true;
    tray.setAttribute('aria-label', 'Passage comparison');
    tray.innerHTML = `
      <button type="button" class="msg-pc-pill" data-pc-toggle aria-expanded="false">
        <span aria-hidden="true">∞</span> Compare <strong data-pc-count>0</strong>
      </button>
      <section class="msg-pc-panel" data-pc-panel hidden>
        <header class="msg-pc-head">
          <div><span>ASK MARK</span><strong>Compare passages</strong></div>
          <button type="button" data-pc-collapse aria-label="Collapse comparison tray">−</button>
        </header>
        <p class="msg-pc-status" data-pc-status></p>
        <div class="msg-pc-list" data-pc-list></div>
        <label class="msg-pc-lens">Compare by
          <select id="msg-passage-comparison-lens">
            <option value="compare">Overall comparison</option>
            <option value="ideas">Ideas &amp; concepts</option>
            <option value="arguments">Arguments &amp; reasoning</option>
            <option value="style">Style &amp; rhetoric</option>
            <option value="context">Historical/contextual lens</option>
            <option value="synthesize">Synthesize</option>
          </select>
        </label>
        <div class="msg-pc-actions">
          <button type="button" class="primary" data-pc-ask>Ask Mark to compare</button>
          <button type="button" class="secondary" data-pc-workspace>Open Comparison Workspace</button>
          <button type="button" class="ghost" data-pc-clear>Clear</button>
        </div>
        <div class="msg-pc-inline-response mark-response" data-pc-inline-response hidden></div>
      </section>`;
    document.body.appendChild(tray);

    tray.querySelector('[data-pc-toggle]')?.addEventListener('click', () => {
      expanded = true;
      renderTray();
    });
    tray.querySelector('[data-pc-collapse]')?.addEventListener('click', () => {
      expanded = false;
      renderTray();
    });
    tray.querySelector('[data-pc-ask]')?.addEventListener('click', askMarkToCompare);
    tray.querySelector('[data-pc-workspace]')?.addEventListener('click', openComparisonWorkspace);
    tray.querySelector('[data-pc-clear]')?.addEventListener('click', clearPassages);
    tray.querySelector('[data-pc-list]')?.addEventListener('click', (event) => {
      const remove = event.target.closest?.('[data-pc-remove]');
      if (remove) removePassage(remove.dataset.pcRemove);
    });
    return tray;
  }

  function renderTray() {
    if (isChildFrame) return;
    const tray = ensureTray();
    if (!tray) return;
    tray.hidden = passages.length === 0;
    if (!passages.length) return;

    const pill = tray.querySelector('[data-pc-toggle]');
    const panel = tray.querySelector('[data-pc-panel]');
    const count = tray.querySelector('[data-pc-count]');
    const status = tray.querySelector('[data-pc-status]');
    const list = tray.querySelector('[data-pc-list]');
    const ask = tray.querySelector('[data-pc-ask]');
    const workspace = tray.querySelector('[data-pc-workspace]');

    pill.hidden = expanded;
    pill.setAttribute('aria-expanded', String(expanded));
    panel.hidden = !expanded;
    count.textContent = String(passages.length);
    status.textContent = statusMessage || (passages.length === 1
      ? 'Highlight another passage and choose Compare.'
      : `${passages.length} passages ready.`);
    ask.disabled = passages.length < 2;
    workspace.disabled = passages.length < 2;

    list.innerHTML = passages.map((passage, index) => `
      <article class="msg-pc-item">
        <div class="msg-pc-item-head">
          <span class="msg-pc-letter">${String.fromCharCode(65 + index)}</span>
          <div><strong>${esc(passage.title)}</strong><small>${esc([passage.author, passage.chapter, passage.readerLabel].filter(Boolean).join(' · '))}</small></div>
          <button type="button" data-pc-remove="${esc(passage.id)}" aria-label="Remove ${esc(passage.title)}">×</button>
        </div>
        <p>${esc(passage.text.slice(0, 320))}${passage.text.length > 320 ? '…' : ''}</p>
      </article>`).join('');
  }

  function forwardSelection(passage) {
    if (!isChildFrame) return addPassage(passage);
    try {
      if (window.parent.MSGPassageComparison?.addPassage) {
        window.parent.MSGPassageComparison.addPassage(passage);
        return true;
      }
    } catch {}
    try {
      window.parent.postMessage({ type: 'msg-passage-comparison-add', passage }, window.location.origin);
      return true;
    } catch { return false; }
  }

  function compareToolbarButton(event) {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest?.('button');
    if (!button) return null;

    // Reader 1 and Reader 2 both use an Ask Mark selection toolbar, but keep
    // this intentionally tolerant of older/newer toolbar markup. The action
    // attribute is preferred; the visible Compare label is the compatibility
    // fallback. Never intercept Compare controls elsewhere in the application.
    const toolbar = button.closest?.(
      '#mark-selection-toolbar, .mark-selection-toolbar, [role="toolbar"][aria-label*="Ask Mark"]'
    );
    if (!toolbar) return null;

    const action = clean(button.dataset.markToolbarAction || '', 40).toLowerCase();
    const label = clean(button.textContent || '', 80).replace(/\s+/g, ' ').toLowerCase();
    const isCompare = action === 'related' || action === 'compare' || /(^|\s)compare(\s|$)/i.test(label);
    return isCompare ? button : null;
  }

  // Absolute safety gate for the legacy Reader Compare implementation.
  // app.js still has a direct button listener that writes a one-passage draft
  // and opens bare /comparison-workspace.html. If that legacy listener ever
  // receives the click (for example inside Reader 2), convert the attempted
  // navigation into a basket add instead. The basket's own explicit workspace
  // action uses ?passageBasket=1 and is deliberately allowed through.
  const nativeWindowOpen = window.open.bind(window);

  function isLegacyComparisonWorkspaceUrl(value) {
    try {
      const url = new URL(String(value || ''), window.location.href);
      return url.origin === window.location.origin
        && url.pathname === '/comparison-workspace.html'
        && url.searchParams.get('passageBasket') !== '1';
    } catch {
      return false;
    }
  }

  window.open = function passageComparisonWindowOpen(url, target, features) {
    if (!isLegacyComparisonWorkspaceUrl(url)) {
      return nativeWindowOpen(url, target, features);
    }

    const passage = collectCurrentSelection();
    if (passage) {
      forwardSelection(passage);
    } else if (isChildFrame) {
      try {
        window.parent.postMessage({
          type: 'msg-passage-comparison-status',
          message: 'Reader 2 could not find the highlighted passage. Highlight it again and choose Compare.'
        }, window.location.origin);
      } catch {}
    } else {
      expanded = true;
      notify('Highlight a passage first, then choose Compare.');
    }

    // The legacy handler writes this immediately before opening the old page.
    // It is not the source of truth for the passage basket, so discard that
    // one-passage handoff rather than leaving stale comparison state behind.
    try { localStorage.removeItem('markSetGoComparisonDraftV1'); } catch {}

    const toolbar = document.querySelector('#mark-selection-toolbar, .mark-selection-toolbar');
    if (toolbar) toolbar.hidden = true;

    // Return a truthy window-like object so the legacy fallback
    // `if (!opened) location.href = ...` cannot navigate the Reader either.
    return Object.freeze({ closed: false, close() {}, focus() {} });
  };

  function handleCompareClick(event) {
    const button = compareToolbarButton(event);
    if (!button) return;

    // IMPORTANT: this listener is installed on WINDOW capture, which is earlier
    // in the event path than app.js's document/toolbar listeners. Reader 2 used
    // to reach the legacy openComparisonWorkspace() handler before the basket
    // could forward its second passage. Owning the event here guarantees that
    // Compare means "add this passage" until the reader explicitly chooses
    // Open Comparison Workspace from the basket.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const passage = collectCurrentSelection();
    if (!passage) {
      if (!isChildFrame) notify('Highlight a passage first, then choose Compare.');
      else {
        try {
          window.parent.postMessage({
            type: 'msg-passage-comparison-status',
            message: 'Reader 2 could not find the highlighted passage. Highlight it again and choose Compare.'
          }, window.location.origin);
        } catch {}
      }
      return;
    }

    forwardSelection(passage);
    const toolbar = button.closest?.('#mark-selection-toolbar, .mark-selection-toolbar');
    if (toolbar) toolbar.hidden = true;
  }

  // Window capture is deliberate. It runs before document/target listeners even
  // though this module is loaded after app.js. This is what makes Reader 2 safe
  // from the legacy one-passage comparison navigation.
  window.addEventListener('click', handleCompareClick, true);

  if (!isChildFrame) {
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data || {};
      if (data.type === 'msg-passage-comparison-add' && data.passage) {
        addPassage(data.passage);
        return;
      }
      if (data.type === 'msg-passage-comparison-status' && data.message) {
        expanded = true;
        notify(data.message);
        return;
      }
      if (data.type === 'msg-passage-comparison-workspace-ready' && event.source) {
        try {
          event.source.postMessage({
            type: 'msg-passage-comparison-workspace-data',
            passages
          }, window.location.origin);
        } catch {}
      }
    });

    if ('BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.addEventListener('message', (event) => {
          const data = event.data || {};
          if (data.source === instanceId) return;
          if (data.type === 'state' && Array.isArray(data.passages)) {
            replacePassages(data.passages, { broadcast: false, open: false });
          } else if (data.type === 'request-state' && passages.length) {
            broadcastState();
          }
        });
        channel.postMessage({ type: 'request-state', source: instanceId });
      } catch { channel = null; }
    }
  }

  window.MSGPassageComparison = Object.freeze({
    version: '1.3-canonical-selection-gate',
    addPassage: (passage) => isChildFrame ? forwardSelection(normalizePassage(passage)) : addPassage(passage),
    clear: clearPassages,
    passages: () => passages.map((item) => ({ ...item })),
    askMark: askMarkToCompare,
    openWorkspace: openComparisonWorkspace
  });
})();
