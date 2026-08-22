'use strict';

(() => {
  const API = '/api/msg-chat';
  const STORE = 'msgchat.';
  const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];
  const POLL_MS = 2000;
  const LIST_POLL_MS = 6000;

  const state = {
    displayName: localStorage.getItem(`${STORE}displayName`) || '',
    activeConversationId: Number(localStorage.getItem(`${STORE}activeConversationId`)) || null,
    conversations: [],
    messages: new Map(),
    lastMessageId: 0,
    lastSyncAt: null,
    polling: localStorage.getItem(`${STORE}polling`) !== 'false',
    pollTimer: null,
    listTimer: null,
    pendingImage: null,
    editingId: null
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
    return { data, response };
  }

  function currentUserOwns(message) {
    return message.sender === state.displayName && message.sender !== 'System';
  }

  function formatTime(value) {
    try {
      return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
    } catch { return ''; }
  }

  function stopTimers() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    if (state.listTimer) clearInterval(state.listTimer);
    state.pollTimer = null;
    state.listTimer = null;
  }

  function startTimers() {
    stopTimers();
    if (!state.polling) return;
    state.pollTimer = window.setInterval(() => {
      if (!document.hidden && document.querySelector('.msg-chat-page')) refreshMessages();
    }, POLL_MS);
    state.listTimer = window.setInterval(() => {
      if (!document.hidden && document.querySelector('.msg-chat-page')) loadConversations(true);
    }, LIST_POLL_MS);
  }

  function renderPage() {
    const app = document.querySelector('#app');
    if (!app) return;
    if (!window.MSGWorkspacePane && !window.__MSG_WORKSPACE_PANE__) {
      try { ReaderContinuity?.saveBeforeNavigation?.(); } catch {}
      try { stopReader?.(); } catch {}
    }
    stopTimers();

    app.dataset.viewKey = 'msg-chat';
    app.innerHTML = `
      <section class="msg-chat-page" aria-label="Mark, Set, Go! Chat">
        <aside class="msg-chat-sidebar">
          <div class="msg-chat-brand-row">
            <div>
              <h1>Mark, Set, Go! Chat</h1>
              <p>Discuss what you're reading.</p>
            </div>
            <button class="msg-chat-icon-button" data-msg-new type="button" title="New conversation" aria-label="New conversation">+</button>
          </div>
          <div class="msg-chat-identity">
            <span>Chatting as <strong data-msg-name></strong></span>
            <button class="msg-chat-link-button" data-msg-change-name type="button">Change</button>
          </div>
          <div class="msg-chat-conversations" data-msg-conversations></div>
        </aside>

        <main class="msg-chat-main">
          <header class="msg-chat-header">
            <div>
              <h2 data-msg-title>Select a conversation</h2>
              <p data-msg-status>Ready</p>
            </div>
            <div class="msg-chat-header-actions">
              <label><input data-msg-poll type="checkbox"> Auto-refresh</label>
              <button class="secondary" data-msg-refresh type="button">Refresh</button>
              <button class="secondary msg-chat-danger" data-msg-delete-chat type="button" disabled>Delete chat</button>
            </div>
          </header>

          <section class="msg-chat-messages" data-msg-messages aria-live="polite">
            <div class="msg-chat-empty">Choose a conversation to begin.</div>
          </section>

          <div class="msg-chat-composer">
            <div class="msg-chat-composer-input">
              <textarea data-msg-input rows="2" maxlength="4000" placeholder="Type a message or paste a photo…" disabled></textarea>
              <div class="msg-chat-image-preview" data-msg-image-preview hidden>
                <img data-msg-image-preview-img alt="Photo ready to send">
                <span data-msg-image-preview-name></span>
                <button class="msg-chat-link-button" data-msg-remove-image type="button">Remove</button>
              </div>
              <small>Paste an image with Ctrl+V / Cmd+V, or choose Photo.</small>
            </div>
            <input data-msg-file type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
            <button class="secondary" data-msg-photo type="button" disabled>Photo</button>
            <button class="primary" data-msg-send type="button" disabled>Send</button>
          </div>
        </main>

        <dialog class="msg-chat-dialog" data-msg-name-dialog>
          <form method="dialog" data-msg-name-form>
            <h2>Your display name</h2>
            <p>This is the name other readers will see in Mark, Set, Go! Chat.</p>
            <input data-msg-name-input maxlength="80" autocomplete="name" required>
            <div><button class="primary" type="submit">Continue</button></div>
          </form>
        </dialog>

        <dialog class="msg-chat-dialog" data-msg-conversation-dialog>
          <form method="dialog" data-msg-conversation-form>
            <h2>New conversation</h2>
            <input data-msg-conversation-input maxlength="120" placeholder="e.g. The Republic — Book VII" required>
            <div>
              <button class="secondary" data-msg-conversation-cancel type="button">Cancel</button>
              <button class="primary" type="submit">Create</button>
            </div>
          </form>
        </dialog>
      </section>`;

    bind();
    ensureIdentity();
    loadConversations();
    startTimers();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function q(selector) { return document.querySelector(`.msg-chat-page ${selector}`); }

  function setStatus(text) {
    const node = q('[data-msg-status]');
    if (node) node.textContent = text;
  }

  function bind() {
    q('[data-msg-name]').textContent = state.displayName || 'Guest';
    q('[data-msg-poll]').checked = state.polling;

    q('[data-msg-new]').addEventListener('click', () => q('[data-msg-conversation-dialog]').showModal());
    q('[data-msg-change-name]').addEventListener('click', () => {
      q('[data-msg-name-input]').value = state.displayName;
      q('[data-msg-name-dialog]').showModal();
    });
    q('[data-msg-refresh]').addEventListener('click', async () => {
      await loadConversations(true);
      await refreshMessages(true);
    });
    q('[data-msg-poll]').addEventListener('change', event => {
      state.polling = event.target.checked;
      localStorage.setItem(`${STORE}polling`, String(state.polling));
      startTimers();
      setStatus(state.polling ? 'Auto-refresh on · every 2 seconds' : 'Auto-refresh off');
    });
    q('[data-msg-delete-chat]').addEventListener('click', deleteConversation);
    q('[data-msg-send]').addEventListener('click', sendMessage);
    q('[data-msg-photo]').addEventListener('click', () => q('[data-msg-file]').click());
    q('[data-msg-file]').addEventListener('change', event => attachImage(event.target.files?.[0]));
    q('[data-msg-remove-image]').addEventListener('click', clearImage);
    q('[data-msg-input]').addEventListener('paste', event => {
      const file = [...(event.clipboardData?.files || [])].find(item => item.type.startsWith('image/'));
      if (file) { event.preventDefault(); attachImage(file); }
    });
    q('[data-msg-input]').addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    q('[data-msg-name-form]').addEventListener('submit', event => {
      event.preventDefault();
      const name = q('[data-msg-name-input]').value.trim().slice(0, 80);
      if (!name) return;
      state.displayName = name;
      localStorage.setItem(`${STORE}displayName`, name);
      q('[data-msg-name]').textContent = name;
      q('[data-msg-name-dialog]').close();
      renderMessages();
    });

    q('[data-msg-conversation-form]').addEventListener('submit', createConversation);
    q('[data-msg-conversation-cancel]').addEventListener('click', () => q('[data-msg-conversation-dialog]').close());
  }

  function ensureIdentity() {
    if (state.displayName) return;
    q('[data-msg-name-input]').value = '';
    q('[data-msg-name-dialog]').showModal();
  }

  async function loadConversations(preserveStatus = false) {
    try {
      const { data } = await api('/conversations');
      state.conversations = Array.isArray(data) ? data : [];
      renderConversations();

      if (!state.conversations.length) {
        state.activeConversationId = null;
        localStorage.removeItem(`${STORE}activeConversationId`);
        disableComposer();
      } else {
        const exists = state.conversations.some(c => Number(c.id) === state.activeConversationId);
        if (!exists) state.activeConversationId = Number(state.conversations[0].id);
        localStorage.setItem(`${STORE}activeConversationId`, String(state.activeConversationId));
        await selectConversation(state.activeConversationId, true);
      }

      if (!preserveStatus) setStatus(state.polling ? 'Auto-refresh on · every 2 seconds' : 'Auto-refresh off');
    } catch (error) {
      setStatus(error.message);
    }
  }

  function renderConversations() {
    const host = q('[data-msg-conversations]');
    host.textContent = '';
    state.conversations.forEach(conversation => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'msg-chat-conversation';
      if (Number(conversation.id) === state.activeConversationId) button.classList.add('active');
      button.innerHTML = `
        <strong>${escapeHtml(conversation.title)}</strong>
        <span>${escapeHtml(conversation.last_message_preview || 'No messages yet')}</span>`;
      button.addEventListener('click', () => selectConversation(Number(conversation.id)));
      host.appendChild(button);
    });
  }

  async function selectConversation(id, force = false) {
    if (!id || (!force && id === state.activeConversationId && state.messages.size)) return;
    state.activeConversationId = Number(id);
    localStorage.setItem(`${STORE}activeConversationId`, String(id));
    state.messages.clear();
    state.lastMessageId = 0;
    state.lastSyncAt = null;
    state.editingId = null;
    clearImage();

    const conversation = state.conversations.find(c => Number(c.id) === Number(id));
    q('[data-msg-title]').textContent = conversation?.title || 'Conversation';
    q('[data-msg-input]').disabled = false;
    q('[data-msg-photo]').disabled = false;
    q('[data-msg-send]').disabled = false;
    q('[data-msg-delete-chat]').disabled = false;
    renderConversations();
    await refreshMessages(true);
  }

  function disableComposer() {
    q('[data-msg-title]').textContent = 'No conversations';
    q('[data-msg-messages]').innerHTML = '<div class="msg-chat-empty">Create a conversation to begin.</div>';
    q('[data-msg-input]').disabled = true;
    q('[data-msg-photo]').disabled = true;
    q('[data-msg-send]').disabled = true;
    q('[data-msg-delete-chat]').disabled = true;
  }

  async function refreshMessages(scroll = false) {
    if (!state.activeConversationId) return;
    try {
      const params = new URLSearchParams({ after: String(state.lastMessageId) });
      if (state.lastSyncAt) params.set('changedAfter', state.lastSyncAt);
      const response = await fetch(`${API}/conversations/${state.activeConversationId}/messages?${params}`);
      const data = await response.json().catch(() => []);
      if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);

      for (const message of data) {
        state.messages.set(Number(message.id), message);
        state.lastMessageId = Math.max(state.lastMessageId, Number(message.id));
      }
      state.lastSyncAt = response.headers.get('X-MSGChat-Sync-Time') || new Date().toISOString();
      renderMessages(scroll);
    } catch (error) {
      setStatus(error.message);
    }
  }

  function renderMessages(scroll = false) {
    const host = q('[data-msg-messages]');
    const messages = [...state.messages.values()].sort((a,b) => Number(a.id) - Number(b.id));
    if (!messages.length) {
      host.innerHTML = '<div class="msg-chat-empty">No messages yet. Start the conversation.</div>';
      return;
    }

    host.innerHTML = '';
    messages.forEach(message => host.appendChild(messageNode(message)));
    if (scroll) host.scrollTop = host.scrollHeight;
  }

  function messageNode(message) {
    const article = document.createElement('article');
    article.className = 'msg-chat-message';
    if (currentUserOwns(message)) article.classList.add('mine');
    if (message.sender === 'System') article.classList.add('system');

    const deleted = Boolean(message.deleted_at);
    const reactions = message.reactions || {};
    const reactionHtml = Object.entries(reactions).map(([emoji, names]) =>
      `<button type="button" class="msg-chat-reaction-pill" data-emoji="${escapeHtml(emoji)}" title="${escapeHtml(names.join(', '))}">${emoji} ${names.length}</button>`
    ).join('');

    const imageHtml = !deleted && message.image_data && message.image_mime
      ? `<a class="msg-chat-image-link" href="data:${escapeHtml(message.image_mime)};base64,${message.image_data}" target="_blank" rel="noopener">
           <img src="data:${escapeHtml(message.image_mime)};base64,${message.image_data}" alt="${escapeHtml(message.image_name || 'Shared photo')}">
         </a>`
      : '';

    const bodyHtml = deleted
      ? '<div class="msg-chat-deleted">This message was deleted.</div>'
      : (message.body ? `<div class="msg-chat-bubble">${escapeHtml(message.body)}</div>` : '');

    article.innerHTML = `
      <div class="msg-chat-meta">
        <strong>${escapeHtml(message.sender)}</strong>
        <span>${escapeHtml(formatTime(message.created_at))}${message.edited_at ? ' · edited' : ''}</span>
      </div>
      ${!deleted ? `
      <div class="msg-chat-message-actions">
        <div class="msg-chat-reaction-control">
          <button type="button" data-react>☺</button>
          <div class="msg-chat-reaction-picker" data-picker hidden>
            ${REACTIONS.map(emoji => `<button type="button" data-emoji="${emoji}">${emoji}</button>`).join('')}
          </div>
        </div>
        ${currentUserOwns(message) ? '<button type="button" data-edit>Edit</button><button type="button" data-delete>Delete</button>' : ''}
      </div>` : ''}
      <div class="msg-chat-content">${bodyHtml}${imageHtml}</div>
      ${reactionHtml ? `<div class="msg-chat-reactions">${reactionHtml}</div>` : ''}`;

    const picker = article.querySelector('[data-picker]');
    article.querySelector('[data-react]')?.addEventListener('click', event => {
      event.stopPropagation();
      picker.hidden = !picker.hidden;
    });
    article.querySelectorAll('[data-picker] [data-emoji], .msg-chat-reaction-pill').forEach(button => {
      button.addEventListener('click', () => react(message, button.dataset.emoji));
    });
    article.querySelector('[data-edit]')?.addEventListener('click', () => beginEdit(message, article));
    article.querySelector('[data-delete]')?.addEventListener('click', () => deleteMessage(message));
    return article;
  }

  function beginEdit(message, article) {
    state.editingId = Number(message.id);
    const content = article.querySelector('.msg-chat-content');
    content.innerHTML = `
      <div class="msg-chat-inline-edit">
        <textarea maxlength="4000">${escapeHtml(message.body || '')}</textarea>
        <div><button class="secondary" data-cancel type="button">Cancel</button><button class="primary" data-save type="button">Save</button></div>
      </div>`;
    const textarea = content.querySelector('textarea');
    textarea.focus();
    content.querySelector('[data-cancel]').addEventListener('click', () => { state.editingId = null; renderMessages(); });
    content.querySelector('[data-save]').addEventListener('click', () => saveEdit(message, textarea.value));
    textarea.addEventListener('keydown', event => {
      if (event.key === 'Escape') { state.editingId = null; renderMessages(); }
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); saveEdit(message, textarea.value); }
    });
  }

  async function saveEdit(message, body) {
    try {
      const { data } = await api(`/conversations/${state.activeConversationId}/messages/${message.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sender: state.displayName, body })
      });
      state.messages.set(Number(data.id), data);
      state.editingId = null;
      renderMessages();
    } catch (error) { setStatus(error.message); }
  }

  async function deleteMessage(message) {
    if (!confirm('Delete this message?')) return;
    try {
      const { data } = await api(`/conversations/${state.activeConversationId}/messages/${message.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ sender: state.displayName })
      });
      state.messages.set(Number(data.id), data);
      renderMessages();
    } catch (error) { setStatus(error.message); }
  }

  async function react(message, emoji) {
    if (!state.displayName) return ensureIdentity();
    try {
      const { data } = await api(`/conversations/${state.activeConversationId}/messages/${message.id}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ sender: state.displayName, emoji })
      });
      state.messages.set(Number(data.id), data);
      renderMessages();
    } catch (error) { setStatus(error.message); }
  }

  async function createConversation(event) {
    event.preventDefault();
    const title = q('[data-msg-conversation-input]').value.trim().slice(0, 120);
    if (!title || !state.displayName) return;
    try {
      const { data } = await api('/conversations', {
        method: 'POST',
        body: JSON.stringify({ title, createdBy: state.displayName })
      });
      q('[data-msg-conversation-input]').value = '';
      q('[data-msg-conversation-dialog]').close();
      state.activeConversationId = Number(data.id);
      await loadConversations();
    } catch (error) { setStatus(error.message); }
  }

  async function deleteConversation() {
    if (!state.activeConversationId || !confirm('Delete this entire chat and all of its messages?')) return;
    try {
      await api(`/conversations/${state.activeConversationId}`, { method: 'DELETE' });
      state.activeConversationId = null;
      state.messages.clear();
      localStorage.removeItem(`${STORE}activeConversationId`);
      await loadConversations();
    } catch (error) { setStatus(error.message); }
  }

  function attachImage(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)) return setStatus('Use a PNG, JPEG, WebP, or GIF image.');
    if (file.size > 5 * 1024 * 1024) return setStatus('Images must be 5 MB or smaller.');
    const reader = new FileReader();
    reader.onload = () => {
      state.pendingImage = { dataUrl: reader.result, name: file.name || 'Pasted photo' };
      q('[data-msg-image-preview-img]').src = reader.result;
      q('[data-msg-image-preview-name]').textContent = state.pendingImage.name;
      q('[data-msg-image-preview]').hidden = false;
    };
    reader.readAsDataURL(file);
  }

  function clearImage() {
    state.pendingImage = null;
    const preview = q('[data-msg-image-preview]');
    if (!preview) return;
    preview.hidden = true;
    q('[data-msg-image-preview-img]').removeAttribute('src');
    q('[data-msg-image-preview-name]').textContent = '';
    q('[data-msg-file]').value = '';
  }

  async function sendMessage() {
    if (!state.activeConversationId || !state.displayName) return;
    const input = q('[data-msg-input]');
    const body = input.value.trim();
    if (!body && !state.pendingImage) return;

    const optimisticText = body;
    input.value = '';
    setStatus('Sending…');
    try {
      const { data } = await api(`/conversations/${state.activeConversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          sender: state.displayName,
          body,
          imageData: state.pendingImage?.dataUrl || null,
          imageName: state.pendingImage?.name || null
        })
      });
      clearImage();
      state.messages.set(Number(data.id), data);
      state.lastMessageId = Math.max(state.lastMessageId, Number(data.id));
      renderMessages(true);
      setStatus(state.polling ? 'Auto-refresh on · every 2 seconds' : 'Sent');
      loadConversations(true);
    } catch (error) {
      input.value = optimisticText;
      setStatus(error.message);
    }
  }

  document.addEventListener('click', event => {
    const trigger = event.target.closest?.('[data-action="msg-chat"]');
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    renderPage();
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && document.querySelector('.msg-chat-page')) {
      loadConversations(true);
      refreshMessages();
    }
  });

  window.MarkSetGoChat = { open: renderPage };
})();
