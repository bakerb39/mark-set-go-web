(() => {
  'use strict';

  const CHANNEL_NAME = 'mark-set-go-askmark-popout-v1';
  const WINDOW_NAME = 'markSetGoAskCompanion';
  const POPUP_URL = '/ask-mark-popout.html';
  const BUTTON_SELECTOR = '[data-askmark-popout]';
  const MAX_SYNC_MS = 95000;

  let channel = null;
  let popupWindow = null;
  let activeSyncTimer = 0;
  let activeSyncStartedAt = 0;
  let lastSentSignature = '';
  let pendingQuestionId = '';

  function makeId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  }

  function companionConfig() {
    const live = window.MSGCompanion?.config;
    if (live?.name) return {
      id:String(live.id || ''),
      name:String(live.name || 'Reading Companion'),
      ask:String(live.ask || `Ask ${live.name || 'Companion'}`),
      avatar:String(live.avatar || '')
    };

    const shell = document.querySelector('.mark-companion-panel');
    const title = shell?.querySelector('.askmark-brand-copy h2')?.textContent?.trim()
      || 'Reading Companion';
    const name = title.replace(/^Ask\s+/i,'').trim() || 'Companion';
    const avatar = shell?.querySelector('.askmark-avatar')?.getAttribute('src') || '';
    return { id:'', name, ask:title, avatar };
  }

  function currentReading() {
    const current = window.MarkSetGoCurrentReaderDocument?.get?.() || {};
    const source = current.source && typeof current.source === 'object'
      ? current.source
      : {};
    const fallbackTitle =
      document.querySelector('.reader-title-copy h1')?.textContent?.trim() ||
      document.querySelector('#reader-title')?.textContent?.trim() ||
      'Current reading';

    return {
      documentId:String(current.documentId || ''),
      title:String(current.title || fallbackTitle || 'Current reading'),
      sourceType:String(source.type || ''),
      sourceUrl:String(source.url || ''),
      sourceName:String(source.source || source.provider || '')
    };
  }

  function conversationNode() {
    return document.querySelector('.mark-companion-panel [data-askmark-conversation]');
  }

  function conversationHtml() {
    return conversationNode()?.innerHTML || '';
  }

  function conversationSignature() {
    const node = conversationNode();
    if (!node) return '';
    return [
      node.childElementCount,
      node.textContent || '',
      Boolean(node.querySelector('.is-thinking')),
      Boolean(node.querySelector('[data-askmark-legacy-pending="1"]'))
    ].join('|').slice(-12000);
  }

  function snapshot(reason = 'sync') {
    const companion = companionConfig();
    const reading = currentReading();
    const conversation = conversationNode();

    return {
      type:'STATE',
      reason,
      at:Date.now(),
      companion,
      reading,
      conversationHtml:conversation?.innerHTML || '',
      conversationText:conversation?.textContent || '',
      busy:Boolean(
        conversation?.querySelector('.is-thinking') ||
        conversation?.querySelector('[data-askmark-legacy-pending="1"]')
      ),
      articleMode:Boolean(
        window.MarkSetGoAskMarkHub?.isWholeArticle?.() ||
        window.MarkSetGoArticleCompanion?.available?.()
      ),
      panelVisible:!document.getElementById('reader-layout')?.classList.contains('word-panel-hidden')
    };
  }

  function ensureChannel() {
    if (channel || !('BroadcastChannel' in window)) return channel;
    channel = new BroadcastChannel(CHANNEL_NAME);

    channel.addEventListener('message', (event) => {
      const message = event.data || {};
      if (!message || typeof message !== 'object') return;

      if (message.type === 'READY' || message.type === 'REQUEST_STATE') {
        sendState(message.type.toLowerCase());
        return;
      }

      if (message.type === 'ASK') {
        submitFromPopout(String(message.question || ''), String(message.requestId || ''));
        return;
      }

      if (message.type === 'ARTICLE_ACTION') {
        runArticleActionFromPopout(
          String(message.action || ''),
          String(message.requestId || '')
        );
        return;
      }

      if (message.type === 'FOCUS_READER') {
        try { window.focus(); } catch {}
      }
    });

    return channel;
  }

  function post(message) {
    ensureChannel()?.postMessage(message);
  }

  function sendState(reason = 'sync', force = false) {
    const state = snapshot(reason);
    const signature = [
      state.reading.documentId,
      state.reading.title,
      state.conversationHtml,
      state.busy,
      state.panelVisible
    ].join('|');

    if (!force && signature === lastSentSignature) return false;
    lastSentSignature = signature;
    post(state);
    return true;
  }

  function stopActiveSync(reason = 'done') {
    if (activeSyncTimer) {
      window.clearInterval(activeSyncTimer);
      activeSyncTimer = 0;
    }
    activeSyncStartedAt = 0;
    pendingQuestionId = '';
    sendState(reason, true);
  }

  function startActiveSync(reason = 'conversation') {
    if (activeSyncTimer) window.clearInterval(activeSyncTimer);

    activeSyncStartedAt = Date.now();
    let quietTicks = 0;
    let lastBusy = false;
    let observedConversationChange = false;
    const initialSignature = conversationSignature();

    sendState(`${reason}:start`, true);

    activeSyncTimer = window.setInterval(() => {
      const now = Date.now();
      const state = snapshot(`${reason}:active`);
      const signature = conversationSignature();

      if (signature !== initialSignature) observedConversationChange = true;
      sendState(`${reason}:active`);

      if (state.busy) {
        quietTicks = 0;
        lastBusy = true;
      } else if (observedConversationChange || lastBusy) {
        quietTicks += 1;
      }

      if (
        (quietTicks >= 3 && now - activeSyncStartedAt > 900) ||
        now - activeSyncStartedAt >= MAX_SYNC_MS
      ) {
        stopActiveSync(
          now - activeSyncStartedAt >= MAX_SYNC_MS ? `${reason}:timeout` : `${reason}:complete`
        );
      }
    }, 350);
  }

  function askInput() {
    return document.querySelector('.mark-companion-panel [data-askmark-input]');
  }

  function askSendButton() {
    return document.querySelector('.mark-companion-panel [data-askmark-send]');
  }

  function hideDockedCompanion() {
    const layout = document.getElementById('reader-layout');
    if (!layout) return false;

    // Keep the live Companion DOM/session mounted, but remove the duplicate
    // visible surface while the dedicated second-screen window is in use.
    layout.classList.add('word-panel-hidden');

    const markButton = document.getElementById('toggle-mark-panel');
    const toolsButton = document.getElementById('toggle-word-panel');

    markButton?.setAttribute('aria-pressed', 'false');
    toolsButton?.setAttribute('aria-pressed', 'false');
    markButton?.classList.add('pane-closed');
    toolsButton?.classList.add('pane-closed');

    return true;
  }

  function trySubmitQuestion(question, requestId, attempt = 0) {
    const input = askInput();
    const send = askSendButton();

    if (input && send) {
      input.value = question;
      input.dispatchEvent(new Event('input', { bubbles:true }));
      send.click();

      pendingQuestionId = requestId || makeId('question');
      post({
        type:'ASK_ACCEPTED',
        requestId:pendingQuestionId,
        at:Date.now()
      });
      startActiveSync('popout-question');
      return true;
    }

    // The popup can remain open while the docked Companion is closed. Normally
    // the premium DOM remains mounted, but if Reader rebuilt it, ask the Reader
    // to recreate the Companion shell and retry a few bounded times.
    if (attempt === 0) {
      const toggle = document.getElementById('toggle-mark-panel');
      if (toggle) {
        try {
          // Let the Reader rebuild the live Companion shell if necessary, then
          // immediately re-hide the docked surface before the next paint.
          toggle.click();
          hideDockedCompanion();
        } catch {}
      }
    }

    if (attempt < 5) {
      window.setTimeout(() => {
        hideDockedCompanion();
        trySubmitQuestion(question, requestId, attempt + 1);
      }, [50,120,240,420,700][attempt] || 700);
      return false;
    }

    post({
      type:'ASK_ERROR',
      requestId,
      error:'The Reading Companion is not available in the Reader yet.',
      at:Date.now()
    });
    return false;
  }

  function submitFromPopout(question, requestId = '') {
    const clean = String(question || '').trim();
    if (!clean) return false;

    hideDockedCompanion();
    const id = requestId || makeId('question');

    if (
      window.MarkSetGoAskMarkHub?.isWholeArticle?.() &&
      typeof window.MarkSetGoAskMarkHub?.askWholeArticle === 'function'
    ) {
      pendingQuestionId = id;
      post({ type:'ASK_ACCEPTED', requestId:id, at:Date.now() });
      startActiveSync('popout-article-question');

      Promise.resolve(window.MarkSetGoAskMarkHub.askWholeArticle(clean, clean))
        .catch((error) => {
          post({
            type:'ASK_ERROR',
            requestId:id,
            error:error?.message || 'The article question could not be sent.',
            at:Date.now()
          });
        });
      return true;
    }

    return trySubmitQuestion(clean, id, 0);
  }

  function runArticleActionFromPopout(action, requestId = '') {
    const id = requestId || makeId('article-action');

    if (
      !window.MarkSetGoAskMarkHub?.isWholeArticle?.() &&
      !window.MarkSetGoArticleCompanion?.available?.()
    ) {
      post({
        type:'ASK_ERROR',
        requestId:id,
        error:'Whole-article actions are available only when the Reader contains a full article.',
        at:Date.now()
      });
      return false;
    }

    hideDockedCompanion();
    pendingQuestionId = id;
    post({ type:'ASK_ACCEPTED', requestId:id, at:Date.now() });
    startActiveSync('popout-article-action');

    Promise.resolve(window.MarkSetGoArticleCompanion.action(action))
      .catch((error) => {
        post({
          type:'ASK_ERROR',
          requestId:id,
          error:error?.message || 'The article action could not be completed.',
          at:Date.now()
        });
      });
    return true;
  }

  function openPopout() {
    ensureChannel();

    try {
      if (popupWindow && !popupWindow.closed) {
        hideDockedCompanion();
        popupWindow.focus();
        sendState('focus-existing', true);
        return popupWindow;
      }
    } catch {}

    popupWindow = window.open(
      POPUP_URL,
      WINDOW_NAME,
      'popup=yes,width=720,height=860,resizable=yes,scrollbars=no'
    );

    if (!popupWindow) {
      window.alert('The browser blocked the Companion pop-out. Allow pop-ups for this site, then try again.');
      return null;
    }

    // Pop-out is now the visible chat surface. Keep the same Companion session
    // mounted in Reader, but close its docked UI so answers are not duplicated.
    hideDockedCompanion();

    try { popupWindow.focus(); } catch {}

    // The new document needs a moment to install BroadcastChannel.
    [80,220,550,1100].forEach((delay) => {
      window.setTimeout(() => sendState('popup-open', true), delay);
    });

    return popupWindow;
  }

  function ensurePopoutButton() {
    const actions = document.querySelector('.mark-companion-panel .askmark-header-actions');
    if (!actions) return null;

    let button = actions.querySelector(BUTTON_SELECTOR);
    const windowActions =
      actions.querySelector('.askmark-header-window-actions') ||
      actions;

    if (button) {
      if (button.parentElement !== windowActions) windowActions.appendChild(button);
      return button;
    }

    button = document.createElement('button');
    button.type = 'button';
    button.className = 'askmark-popout-button';
    button.dataset.askmarkPopout = '1';
    button.textContent = '↗';
    button.title = 'Pop out Reading Companion to another screen';
    button.setAttribute('aria-label','Pop out Reading Companion to another screen');

    // Expand/Restore and Pop out are both window actions, so keep the two
    // arrows together instead of splitting them around Notebook/Format/Settings.
    windowActions.appendChild(button);

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPopout();
    });

    return button;
  }

  function scheduleButtonInstall() {
    [0,80,220,520,1100].forEach((delay) => {
      window.setTimeout(ensurePopoutButton, delay);
    });
  }

  // Keep pop-out synchronized when questions originate in the main window too.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-askmark-send]')) {
      window.setTimeout(() => startActiveSync('reader-question'), 0);
      return;
    }

    if (target.closest(
      '[data-premium-mark-action],[data-document-action],[data-askmark-popout]'
    )) {
      if (!target.closest('[data-askmark-popout]')) {
        window.setTimeout(() => startActiveSync('reader-action'), 0);
      }
    }

    if (target.closest('#toggle-mark-panel,[data-read],[data-action]')) {
      scheduleButtonInstall();
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.matches?.('[data-askmark-input]') &&
      event.key === 'Enter' &&
      !event.shiftKey
    ) {
      window.setTimeout(() => startActiveSync('reader-question'), 0);
    }
  }, true);

  [
    'marksetgo:askmark-legacy-updated',
    'marksetgo:askmark-article-updated',
    'marksetgo:document-available',
    'marksetgo:notebook-saved',
    'marksetgo:workspace-layout-mode'
  ].forEach((name) => {
    document.addEventListener(name, () => {
      scheduleButtonInstall();
      window.setTimeout(() => sendState(name, true), 0);
    });
  });

  window.addEventListener('pageshow', () => {
    scheduleButtonInstall();
    sendState('pageshow', true);
  });

  window.addEventListener('beforeunload', () => {
    try {
      post({ type:'READER_CLOSING', at:Date.now() });
      channel?.close?.();
    } catch {}
  });

  ensureChannel();
  scheduleButtonInstall();

  window.MarkSetGoAskMarkPopout = Object.freeze({
    open:openPopout,
    submit:submitFromPopout,
    hideDocked:hideDockedCompanion,
    snapshot,
    sync:() => sendState('manual', true),
    get connected(){
      try { return Boolean(popupWindow && !popupWindow.closed); } catch { return false; }
    }
  });
})();