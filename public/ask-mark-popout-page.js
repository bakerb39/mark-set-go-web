(() => {
  'use strict';

  const CHANNEL_NAME = 'mark-set-go-askmark-popout-v1';
  const shell = document.querySelector('[data-popout-shell]');
  const conversation = document.querySelector('[data-popout-conversation]');
  const input = document.querySelector('[data-popout-input]');
  const sendButton = document.querySelector('[data-popout-send]');
  const status = document.querySelector('[data-connection-status]');
  const readingTitle = document.querySelector('[data-reading-title]');
  const nameNode = document.querySelector('[data-popout-name]');
  const avatar = document.querySelector('[data-popout-avatar]');

  let channel = null;
  let lastStateAt = 0;
  let connected = false;
  let sending = false;
  let queuedQuestion = '';
  let queuedArticleAction = '';
  let lastReconnectRequestAt = 0;

  function makeId() {
    return `popout-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  }

  function ensureChannel() {
    if (channel || !('BroadcastChannel' in window)) return channel;
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener('message', (event) => handleMessage(event.data || {}));
    return channel;
  }

  function post(message) {
    ensureChannel()?.postMessage(message);
  }

  function setConnection(value, label = '') {
    connected = Boolean(value);
    status.textContent = label || (connected ? 'Connected to Reader' : 'Waiting for Reader…');

    // Connection status must never prevent composing a question.
    input.disabled = false;
    sendButton.disabled = Boolean(sending);
  }

  function cleanConversationMarkup(html) {
    const holder = document.createElement('div');
    holder.innerHTML = String(html || '');

    // The pop-out is chat-focused. Main-window inline buttons are intentionally
    // hidden/noninteractive here so there is only one command owner.
    holder.querySelectorAll('button,input,textarea,select,script').forEach((node) => node.remove());
    holder.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    return holder.innerHTML;
  }

  function renderState(state) {
    lastStateAt = Date.now();
    setConnection(true, state.busy ? 'Ask Beth is responding…' : 'Connected to Reader');

    const companion = state.companion || {};
    const reading = state.reading || {};

    nameNode.textContent = companion.ask || companion.name || 'Reading Companion';
    document.title = companion.ask || companion.name || 'Reading Companion';

    if (companion.avatar) {
      avatar.src = companion.avatar;
      avatar.alt = companion.name || 'Reading Companion';
      avatar.hidden = false;
    } else {
      avatar.hidden = true;
    }

    readingTitle.textContent = reading.title || 'Current reading';

    const articleActions = document.querySelector('[data-popout-article-actions]');
    if (articleActions) articleActions.hidden = !state.articleMode;

    input.placeholder = state.articleMode
      ? 'Ask anything about the whole article…'
      : 'Ask about the current reading…';

    const html = cleanConversationMarkup(state.conversationHtml);
    const nearBottom =
      conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight < 90;

    conversation.innerHTML = html || `
      <div class="popout-empty">
        The Companion is connected. Ask a question about the current reading.
      </div>`;

    if (nearBottom || state.busy) {
      conversation.scrollTop = conversation.scrollHeight;
    }

    if (!state.busy) {
      sending = false;
      sendButton.disabled = false;
    }

    window.setTimeout(flushQueuedWork, 0);
  }

  function handleMessage(message) {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'STATE') {
      renderState(message);
      return;
    }

    if (message.type === 'ASK_ACCEPTED') {
      sending = true;
      setConnection(true, 'Sending to Reader…');
      return;
    }

    if (message.type === 'ASK_ERROR') {
      sending = false;
      setConnection(true, message.error || 'The question could not be sent.');
      return;
    }

    if (message.type === 'READER_CLOSING') {
      setConnection(false, 'Reader is reloading or closing…');
    }
  }

  function flushQueuedWork() {
    if (!connected || sending) return false;

    if (queuedArticleAction) {
      const action = queuedArticleAction;
      queuedArticleAction = '';
      sending = true;
      const requestId = makeId();

      post({
        type:'ARTICLE_ACTION',
        requestId,
        action,
        at:Date.now()
      });

      setConnection(true, 'Working with the whole article…');
      return true;
    }

    if (queuedQuestion) {
      const question = queuedQuestion;
      queuedQuestion = '';
      sending = true;
      const requestId = makeId();

      post({
        type:'ASK',
        requestId,
        question,
        at:Date.now()
      });

      setConnection(true, 'Sending to Reader…');
      return true;
    }

    return false;
  }

  function requestReconnect(reason = 'compose') {
    const now = Date.now();
    if (now - lastReconnectRequestAt < 500) return;
    lastReconnectRequestAt = now;
    post({ type:'REQUEST_STATE', reason, at:now });
  }

  function submit() {
    const question = String(input.value || '').trim();
    if (!question || sending) return;

    if (!connected) {
      queuedQuestion = question;
      input.value = '';
      input.style.height = '';
      setConnection(false, 'Question ready · reconnecting to Reader…');
      requestReconnect('queued-question');
      return;
    }

    queuedQuestion = question;
    flushQueuedWork();
    input.value = '';
    input.style.height = '';
  }

  sendButton.addEventListener('click', submit);

  document.querySelectorAll('[data-popout-article-action]').forEach((button) => {
    button.addEventListener('click', () => {
      if (sending) return;

      const action = String(button.dataset.popoutArticleAction || '');
      if (!action) return;

      if (!connected) {
        queuedArticleAction = action;
        setConnection(false, 'Action ready · reconnecting to Reader…');
        requestReconnect('queued-article-action');
        return;
      }

      queuedArticleAction = action;
      flushQueuedWork();
    });
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
  });

  document.querySelector('[data-focus-reader]')?.addEventListener('click', () => {
    post({ type:'FOCUS_READER', at:Date.now() });
    try { window.opener?.focus?.(); } catch {}
  });

  document.querySelector('[data-close-popout]')?.addEventListener('click', () => {
    window.close();
  });

  window.addEventListener('focus', () => {
    post({ type:'REQUEST_STATE', reason:'focus', at:Date.now() });
  });

  window.addEventListener('beforeunload', () => {
    try { channel?.close?.(); } catch {}
  });

  ensureChannel();
  setConnection(false, 'Connecting to Reader…');

  window.setTimeout(() => {
    try { input.focus({ preventScroll:true }); } catch { input.focus(); }
  }, 0);

  post({ type:'READY', at:Date.now() });

  // Low-frequency heartbeat only for reconnecting after a Reader refresh.
  // Conversation updates themselves are event-driven/bounded from the Reader.
  window.setInterval(() => {
    const staleFor = Date.now() - lastStateAt;

    if (staleFor > 6000) {
      requestReconnect('heartbeat');
    }

    if (staleFor > 18000 && connected) {
      setConnection(false, 'Reconnecting to Reader…');
    }
  }, 3000);
})();