'use strict';

(() => {
  const API = '/api/msg-chat';
  const STORE = 'msgchat.';
  const HANDOFF_KEY = 'msg.symposiumHandoff.v1';
  let pendingChatContent = null;
  let selectionPayload = null;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));

  function clean(value, max = 12000) {
    return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
  }

  function normalizeContent(input = {}) {
    const source = input && typeof input === 'object' ? input : { text: input };
    const content = {
      version: 1,
      type: clean(source.type || 'content', 60) || 'content',
      title: clean(source.title || 'Shared content', 300) || 'Shared content',
      text: clean(source.text || source.selection || source.body || '', 12000),
      context: clean(source.context || '', 12000),
      sourceLabel: clean(source.sourceLabel || source.source || '', 180),
      sourceUrl: clean(source.sourceUrl || source.url || '', 2000),
      documentId: clean(source.documentId || '', 240),
      chapter: clean(source.chapter || '', 300),
      startIndex: Number.isFinite(Number(source.startIndex)) ? Math.max(0, Number(source.startIndex)) : null,
      createdAt: clean(source.createdAt || new Date().toISOString(), 80)
    };
    if (source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)) {
      const metadata = {};
      for (const [key, value] of Object.entries(source.metadata).slice(0, 20)) {
        const safeKey = clean(key, 80);
        if (!safeKey) continue;
        metadata[safeKey] = clean(typeof value === 'string' ? value : JSON.stringify(value), 1000);
      }
      content.metadata = metadata;
    }
    return content;
  }

  function contentTypeLabel(type = '') {
    return ({
      passage: 'Reader passage',
      selection: 'Selected content',
      'ask-mark-response': 'Ask Mark response',
      'chat-message': 'Chat message',
      'symposium-turn': 'Symposium turn',
      'symposium-excerpt': 'Symposium excerpt',
      'symposium-transcript': 'Symposium transcript',
      article: 'Article',
      note: 'Note',
      book: 'Book'
    })[type] || 'Shared content';
  }

  function symposiumContext(content) {
    const pieces = [];
    if (content.context) pieces.push(`Source context:\n${content.context}`);
    if (content.text) pieces.push(`${contentTypeLabel(content.type)}:\n${content.text}`);
    if (content.sourceLabel) pieces.push(`Source: ${content.sourceLabel}`);
    if (content.chapter) pieces.push(`Section: ${content.chapter}`);
    return clean(pieces.join('\n\n'), 18000);
  }

  function symposiumTopic(content) {
    const title = clean(content.title, 220);
    if (content.type === 'chat-message') return `Discuss this chat message: ${title}`.slice(0, 300);
    if (content.type === 'passage' || content.type === 'selection') return `Discuss this passage from ${title}`.slice(0, 300);
    return `Discuss: ${title}`.slice(0, 300);
  }

  function storeSymposiumHandoff(content) {
    const normalized = normalizeContent(content);
    const handoff = {
      ...normalized,
      symposiumTopic: symposiumTopic(normalized),
      symposiumContext: symposiumContext(normalized),
      handoffAt: new Date().toISOString()
    };
    try { sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff)); } catch {}
    return handoff;
  }

  function takeSymposiumHandoff() {
    try {
      const raw = sessionStorage.getItem(HANDOFF_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(HANDOFF_KEY);
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch { return null; }
  }

  function peekSymposiumHandoff() {
    try {
      const raw = sessionStorage.getItem(HANDOFF_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch { return null; }
  }

  function toSymposium(input) {
    const content = normalizeContent(input);

    if (window.parent && window.parent !== window && window.parent.MSGContentShare?.toSymposium) {
      window.parent.MSGContentShare.toSymposium(content);
      return true;
    }

    storeSymposiumHandoff(content);

    try {
      const workspace = window.MSGWorkspaceExperiment;
      if (document.querySelector('#reader') && workspace?.enabled?.() && typeof workspace.symposium === 'function') {
        workspace.symposium();
        return true;
      }
    } catch {}

    try {
      if (typeof window.renderSymposium === 'function') {
        window.renderSymposium();
        return true;
      }
    } catch {}

    const trigger = document.querySelector('[data-action="symposium"]');
    if (trigger) {
      trigger.click();
      return true;
    }

    window.alert('The Symposium is not ready yet.');
    return false;
  }

  function ensureDialog() {
    let dialog = document.getElementById('msg-content-share-dialog');
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.id = 'msg-content-share-dialog';
    dialog.className = 'msg-content-share-dialog';
    dialog.innerHTML = `
      <form method="dialog" class="msg-content-share-form">
        <div class="msg-content-share-heading">
          <div>
            <span>Send to Chat</span>
            <h2 data-share-title>Shared content</h2>
          </div>
          <button type="button" class="msg-content-share-close" data-share-close aria-label="Close">×</button>
        </div>
        <div class="msg-content-share-preview">
          <span data-share-type>Shared content</span>
          <strong data-share-preview-title></strong>
          <p data-share-preview-text></p>
        </div>
        <label>Your display name
          <input data-share-name maxlength="80" autocomplete="name" placeholder="Name shown in Chat">
        </label>
        <label>Conversation
          <select data-share-conversation></select>
        </label>
        <label data-share-new-wrap hidden>New conversation title
          <input data-share-new-title maxlength="120">
        </label>
        <label>Add a message <span>(optional)</span>
          <textarea data-share-comment rows="3" maxlength="4000" placeholder="Why are you sharing this?"></textarea>
        </label>
        <p class="msg-content-share-status" data-share-status></p>
        <div class="msg-content-share-actions">
          <button type="button" class="secondary" data-share-cancel>Cancel</button>
          <button type="button" class="primary" data-share-send>Send</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);

    const close = () => { if (dialog.open) dialog.close(); };
    dialog.querySelector('[data-share-close]').addEventListener('click', close);
    dialog.querySelector('[data-share-cancel]').addEventListener('click', close);
    dialog.querySelector('[data-share-conversation]').addEventListener('change', (event) => {
      const isNew = event.target.value === '__new__';
      dialog.querySelector('[data-share-new-wrap]').hidden = !isNew;
      if (isNew) dialog.querySelector('[data-share-new-title]').focus();
    });
    dialog.querySelector('[data-share-send]').addEventListener('click', sendPendingToChat);
    return dialog;
  }

  async function fetchJson(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      headers: { 'Content-Type':'application/json', ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
    return data;
  }

  async function populateConversations(dialog, content) {
    const select = dialog.querySelector('[data-share-conversation]');
    const status = dialog.querySelector('[data-share-status]');
    select.innerHTML = '<option value="">Loading conversations…</option>';
    select.disabled = true;
    status.textContent = '';
    try {
      const conversations = await fetchJson('/conversations');
      select.innerHTML = '';
      (Array.isArray(conversations) ? conversations : []).forEach((conversation) => {
        const option = document.createElement('option');
        option.value = String(conversation.id);
        option.textContent = conversation.title || 'Conversation';
        select.appendChild(option);
      });
      const newOption = document.createElement('option');
      newOption.value = '__new__';
      newOption.textContent = '＋ New conversation…';
      select.appendChild(newOption);
      if (!select.options.length || select.options.length === 1) select.value = '__new__';
      dialog.querySelector('[data-share-new-wrap]').hidden = select.value !== '__new__';
      dialog.querySelector('[data-share-new-title]').value = clean(content.title, 120) || 'Shared reading';
    } catch (error) {
      status.textContent = error.message;
      select.innerHTML = '<option value="__new__">＋ New conversation…</option>';
      select.value = '__new__';
      dialog.querySelector('[data-share-new-wrap]').hidden = false;
    } finally {
      select.disabled = false;
    }
  }

  async function toChat(input) {
    const content = normalizeContent(input);
    if (window.parent && window.parent !== window && window.parent.MSGContentShare?.toChat) {
      return window.parent.MSGContentShare.toChat(content);
    }

    pendingChatContent = content;
    const dialog = ensureDialog();
    dialog.querySelector('[data-share-title]').textContent = content.title;
    dialog.querySelector('[data-share-type]').textContent = contentTypeLabel(content.type);
    dialog.querySelector('[data-share-preview-title]').textContent = content.title;
    dialog.querySelector('[data-share-preview-text]').textContent = clean(content.text || content.context, 560) || 'Share this item with a conversation.';
    dialog.querySelector('[data-share-name]').value = localStorage.getItem(`${STORE}displayName`) || '';
    dialog.querySelector('[data-share-comment]').value = '';
    dialog.querySelector('[data-share-status]').textContent = '';
    await populateConversations(dialog, content);
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => {
      const name = dialog.querySelector('[data-share-name]');
      if (!name.value) name.focus();
    });
    return true;
  }

  async function sendPendingToChat() {
    const dialog = ensureDialog();
    const sendButton = dialog.querySelector('[data-share-send]');
    const status = dialog.querySelector('[data-share-status]');
    const name = clean(dialog.querySelector('[data-share-name]').value, 80);
    const comment = clean(dialog.querySelector('[data-share-comment]').value, 4000);
    let conversationId = dialog.querySelector('[data-share-conversation]').value;

    if (!pendingChatContent) return;
    if (!name) {
      status.textContent = 'Enter your display name.';
      dialog.querySelector('[data-share-name]').focus();
      return;
    }

    sendButton.disabled = true;
    status.textContent = 'Sending…';
    try {
      localStorage.setItem(`${STORE}displayName`, name);
      if (conversationId === '__new__') {
        const title = clean(dialog.querySelector('[data-share-new-title]').value, 120);
        if (!title) throw new Error('Enter a conversation title.');
        const conversation = await fetchJson('/conversations', {
          method:'POST',
          body:JSON.stringify({ title, createdBy:name })
        });
        conversationId = String(conversation.id);
      }
      if (!conversationId) throw new Error('Choose a conversation.');

      await fetchJson(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method:'POST',
        body:JSON.stringify({
          sender:name,
          body:comment,
          sharedContent:pendingChatContent
        })
      });

      localStorage.setItem(`${STORE}activeConversationId`, String(conversationId));
      status.textContent = 'Sent to Chat.';
      document.dispatchEvent(new CustomEvent('marksetgo:content-shared-to-chat', {
        detail:{ conversationId:Number(conversationId), content:pendingChatContent }
      }));
      window.setTimeout(() => { if (dialog.open) dialog.close(); }, 500);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      sendButton.disabled = false;
    }
  }

  function selectionTitle(range) {
    const start = range?.startContainer?.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range?.startContainer?.parentElement;
    const local = start?.closest?.('article, section, main, .panel, .card, .notebook-entry, .mark-response');
    const heading = local?.querySelector?.('h1,h2,h3,strong')?.textContent?.trim();
    return clean(heading || document.querySelector('#app h1, #app h2')?.textContent || document.title || 'Selected content', 300);
  }

  function ensureSelectionToolbar() {
    let toolbar = document.getElementById('msg-content-selection-toolbar');
    if (toolbar) return toolbar;
    toolbar = document.createElement('div');
    toolbar.id = 'msg-content-selection-toolbar';
    toolbar.className = 'msg-content-selection-toolbar';
    toolbar.hidden = true;
    toolbar.innerHTML = '<button type="button" data-share-selection-chat>💬 Chat</button><button type="button" data-share-selection-symposium>🏛 Symposium</button>';
    document.body.appendChild(toolbar);
    toolbar.addEventListener('pointerdown', (event) => event.preventDefault());
    toolbar.querySelector('[data-share-selection-chat]').addEventListener('click', () => {
      if (selectionPayload) toChat(selectionPayload);
      toolbar.hidden = true;
    });
    toolbar.querySelector('[data-share-selection-symposium]').addEventListener('click', () => {
      if (selectionPayload) toSymposium(selectionPayload);
      toolbar.hidden = true;
    });
    return toolbar;
  }

  function hideSelectionToolbar(clear = false) {
    const toolbar = document.getElementById('msg-content-selection-toolbar');
    if (toolbar) toolbar.hidden = true;
    if (clear) selectionPayload = null;
  }

  function captureGeneralSelection() {
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return hideSelectionToolbar(true);
    const range = selection.getRangeAt(0);
    const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const end = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer : range.endContainer.parentElement;
    if (!start || !end) return hideSelectionToolbar(true);
    if (start.closest('input,textarea,select,[contenteditable="true"],#reader,.symposium-transcript,.msg-chat-page,.msg-content-share-dialog') ||
        end.closest('input,textarea,select,[contenteditable="true"],#reader,.symposium-transcript,.msg-chat-page,.msg-content-share-dialog')) {
      return hideSelectionToolbar(true);
    }
    const text = clean(selection.toString().replace(/\s+/g, ' '), 12000);
    if (!text) return hideSelectionToolbar(true);
    selectionPayload = normalizeContent({
      type:'selection',
      title:selectionTitle(range),
      text,
      sourceLabel:clean(document.querySelector('#app')?.dataset?.viewKey || 'Mark, Set, Go!', 180),
      sourceUrl:location.href
    });
    const rect = range.getBoundingClientRect();
    const toolbar = ensureSelectionToolbar();
    toolbar.hidden = false;
    const width = toolbar.offsetWidth || 180;
    const height = toolbar.offsetHeight || 38;
    const left = Math.max(8, Math.min(innerWidth - width - 8, rect.left + rect.width / 2 - width / 2));
    let top = rect.bottom + 8;
    if (top + height > innerHeight - 8) top = Math.max(8, rect.top - height - 8);
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
  }

  document.addEventListener('pointerup', () => window.setTimeout(captureGeneralSelection, 0));
  document.addEventListener('keyup', (event) => {
    if (event.key === 'Shift' || event.key.startsWith('Arrow')) window.setTimeout(captureGeneralSelection, 0);
  });
  document.addEventListener('pointerdown', (event) => {
    if (event.target.closest?.('#msg-content-selection-toolbar')) return;
    hideSelectionToolbar();
  }, true);
  window.addEventListener('scroll', () => hideSelectionToolbar(), true);

  window.MSGContentShare = Object.freeze({
    normalize: normalizeContent,
    toChat,
    toSymposium,
    storeSymposiumHandoff,
    takeSymposiumHandoff,
    peekSymposiumHandoff,
    contentTypeLabel
  });
})();
