(() => {
  'use strict';

  const CHANNEL_NAME = 'mark-set-go-askmark-popout-v1';
  const WINDOW_NAME = 'markSetGoAskCompanion';
  const POPUP_URL = '/ask-mark-popout.html';
  const BUTTON_SELECTOR = '[data-askmark-popout]';
  const MAX_SYNC_MS = 95000;
  const ARTICLE_TYPES = new Set(['topic-feed','bookmarklet','website']);

  let channel = null;
  let popupWindow = null;
  let activeSyncTimer = 0;
  let activeSyncStartedAt = 0;
  let lastSentSignature = '';
  let pendingQuestionId = '';
  let selectionSyncTimer = 0;

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

  function currentReaderRecord() {
    const current = window.MarkSetGoCurrentReaderDocument?.get?.() || {};
    const source = current.source && typeof current.source === 'object'
      ? current.source
      : {};
    return { current, source };
  }

  function currentReading() {
    const { current, source } = currentReaderRecord();
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

  function canonicalSelectionText() {
    const api = window.MarkSetGoCurrentReaderDocument;
    if (typeof api?.getSelectionRange === 'function') {
      try {
        return String(api.getSelectionRange()?.text || '').trim();
      } catch {}
    }

    return document
      .querySelector('.mark-companion-panel #mark-selection-panel .mark-selection-card blockquote')
      ?.textContent
      ?.trim() || '';
  }

  function isFullArticleSource() {
    // Attached Ask Beth's article bridge is the preferred authority.
    if (typeof window.MarkSetGoArticleCompanion?.available === 'function') {
      try { return Boolean(window.MarkSetGoArticleCompanion.available()); }
      catch {}
    }

    // Exact compatibility fallback mirrors ask-mark-article-mode.js.
    const { current, source } = currentReaderRecord();
    const type = String(source.type || '').toLowerCase();
    const text = String(current.text || '').trim();

    if (!ARTICLE_TYPES.has(type)) return false;
    if (source.fullArticle === false || source.captureType === 'selection') return false;
    return text.length >= 40;
  }

  function currentScope() {
    const selectionText = canonicalSelectionText();
    const articleMode = isFullArticleSource();

    if (selectionText) {
      return {
        key:'selection',
        label:'Selected passage',
        selected:true,
        articleMode,
        selectionLength:selectionText.length
      };
    }

    if (articleMode) {
      return {
        key:'article',
        label:'Whole article',
        selected:false,
        articleMode:true,
        selectionLength:0
      };
    }

    return {
      key:'reading',
      label:'Current reading',
      selected:false,
      articleMode:false,
      selectionLength:0
    };
  }

  function conversationNode() {
    return document.querySelector('.mark-companion-panel [data-askmark-conversation]');
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
    const scope = currentScope();

    return {
      type:'STATE',
      reason,
      at:Date.now(),
      companion,
      reading,
      scopeKey:scope.key,
      scopeLabel:scope.label,
      hasSelection:scope.selected,
      selectionLength:scope.selectionLength,
      articleMode:scope.articleMode,
      conversationHtml:conversation?.innerHTML || '',
      conversationText:conversation?.textContent || '',
      busy:Boolean(
        conversation?.querySelector('.is-thinking') ||
        conversation?.querySelector('[data-askmark-legacy-pending="1"]')
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
        sendState(message.type.toLowerCase(), true);
        return;
      }

      if (message.type === 'ASK') {
        submitFromPopout(
          String(message.question || ''),
          String(message.requestId || '')
        );
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
      state.scopeKey,
      state.selectionLength,
      state.conversationHtml,
      state.busy,
      state.panelVisible
    ].join('|');

    if (!force && signature === lastSentSignature) return false;
    lastSentSignature = signature;
    post(state);
    return true;
  }

  function scheduleScopeSync(reason = 'selection') {
    if (selectionSyncTimer) window.clearTimeout(selectionSyncTimer);

    // The Reader can finish updating its canonical selection just after the
    // browser selection event, so sync immediately and once more shortly after.
    sendState(`${reason}:0`, true);

    selectionSyncTimer = window.setTimeout(() => {
      selectionSyncTimer = 0;
      sendState(`${reason}:settled`, true);
    }, 120);
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
          now - activeSyncStartedAt >= MAX_SYNC_MS
            ? `${reason}:timeout`
            : `${reason}:complete`
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

    // Keep the actual Companion/session mounted. The pop-out is only another
    // view/controller of that same live Reader conversation.
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
      input.disabled = false;
      input.readOnly = false;
      input.removeAttribute('disabled');
      input.removeAttribute('readonly');
      input.value = question;
      input.dispatchEvent(new Event('input', { bubbles:true }));
      send.click();

      pendingQuestionId = requestId || makeId('question');
      post({
        type:'ASK_ACCEPTED',
        requestId:pendingQuestionId,
        scopeKey:currentScope().key,
        at:Date.now()
      });
      startActiveSync('popout-question');
      return true;
    }

    if (attempt === 0) {
      const toggle = document.getElementById('toggle-mark-panel');
      if (toggle) {
        try {
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

    /*
      IMPORTANT:
      Never call AskMarkHub.askWholeArticle() from the pop-out.

      For a full article, use the SAME ArticleCompanion bridge as attached
      Ask Beth. That bridge sends through the normal composer, where:
        selection present -> selected passage
        no selection      -> whole article
    */
    if (
      isFullArticleSource() &&
      typeof window.MarkSetGoArticleCompanion?.ask === 'function'
    ) {
      pendingQuestionId = id;
      const scope = currentScope();

      post({
        type:'ASK_ACCEPTED',
        requestId:id,
        scopeKey:scope.key,
        at:Date.now()
      });
      startActiveSync('popout-article-question');

      try {
        const submitted = window.MarkSetGoArticleCompanion.ask(clean);
        if (!submitted) {
          throw new Error('The article question could not be sent.');
        }
        return true;
      } catch (error) {
        post({
          type:'ASK_ERROR',
          requestId:id,
          error:error?.message || 'The article question could not be sent.',
          at:Date.now()
        });
        stopActiveSync('popout-article-question:error');
        return false;
      }
    }

    // Books and other sources use the normal selection owner. There is no
    // whole-document fallback here.
    return trySubmitQuestion(clean, id, 0);
  }

  function runArticleActionFromPopout(action, requestId = '') {
    const id = requestId || makeId('article-action');

    if (
      !isFullArticleSource() ||
      typeof window.MarkSetGoArticleCompanion?.action !== 'function'
    ) {
      post({
        type:'ASK_ERROR',
        requestId:id,
        error:'Article actions are available only for a full article in the Reader.',
        at:Date.now()
      });
      return false;
    }

    hideDockedCompanion();
    pendingQuestionId = id;
    const scope = currentScope();

    post({
      type:'ASK_ACCEPTED',
      requestId:id,
      scopeKey:scope.key,
      at:Date.now()
    });
    startActiveSync('popout-article-action');

    try {
      const submitted = window.MarkSetGoArticleCompanion.action(action);
      if (!submitted) {
        throw new Error('The article action could not be completed.');
      }
      return true;
    } catch (error) {
      post({
        type:'ASK_ERROR',
        requestId:id,
        error:error?.message || 'The article action could not be completed.',
        at:Date.now()
      });
      stopActiveSync('popout-article-action:error');
      return false;
    }
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
      window.alert(
        'The browser blocked the Companion pop-out. Allow pop-ups for this site, then try again.'
      );
      return null;
    }

    hideDockedCompanion();
    try { popupWindow.focus(); } catch {}

    [80,220,550,1100].forEach((delay) => {
      window.setTimeout(() => sendState('popup-open', true), delay);
    });

    return popupWindow;
  }

  function ensurePopoutButton() {
    const actions = document.querySelector(
      '.mark-companion-panel .askmark-header-actions'
    );
    if (!actions) return null;

    let button = actions.querySelector(BUTTON_SELECTOR);
    const windowActions =
      actions.querySelector('.askmark-header-window-actions') ||
      actions;

    if (button) {
      if (button.parentElement !== windowActions) {
        windowActions.appendChild(button);
      }
      return button;
    }

    button = document.createElement('button');
    button.type = 'button';
    button.className = 'askmark-popout-button';
    button.dataset.askmarkPopout = '1';
    button.textContent = '↗';
    button.title = 'Pop out Reading Companion to another screen';
    button.setAttribute(
      'aria-label',
      'Pop out Reading Companion to another screen'
    );
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

  // Main-window conversation changes.
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

  // Live Reader selection -> pop-out scope synchronization.
  document.addEventListener('selectionchange', () => {
    scheduleScopeSync('selectionchange');
  });

  document.addEventListener('pointerup', () => {
    scheduleScopeSync('pointerup');
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

  window.addEventListener('focus', () => {
    scheduleScopeSync('reader-focus');
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
    version:'1.4.0-live-scope',
    open:openPopout,
    submit:submitFromPopout,
    hideDocked:hideDockedCompanion,
    snapshot,
    scope:currentScope,
    sync:() => sendState('manual', true),
    get connected(){
      try { return Boolean(popupWindow && !popupWindow.closed); }
      catch { return false; }
    }
  });
})();