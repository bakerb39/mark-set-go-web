(() => {
  'use strict';

  const ARTICLE_TYPES = new Set(['topic-feed','bookmarklet','website']);

  const ACTIONS = Object.freeze({
    explain:{
      label:'Explain',
      whole:'Explain the whole article.',
      selected:'Explain this selected passage.'
    },
    summarize:{
      label:'Summarize',
      whole:'Summarize the whole article.',
      selected:'Summarize this selected passage.'
    },
    analyze:{
      label:'Analyze',
      whole:'Analyze the whole article.',
      selected:'Analyze this selected passage.'
    },
    simplify:{
      label:'Simplify',
      whole:'Simplify the whole article.',
      selected:'Simplify this selected passage.'
    },
    context:{
      label:'Context',
      whole:'Give me the broader context for the whole article.',
      selected:'Give me the broader context for this selected passage.'
    },
    related:{
      label:'Compare',
      whole:'Compare and connect the major ideas or viewpoints in the whole article.',
      selected:'Compare this selected passage with relevant ideas or competing viewpoints.'
    }
  });

  const $ = (selector, root = document) => root.querySelector(selector);

  function currentArticle() {
    const current = window.MarkSetGoCurrentReaderDocument?.get?.() || {};
    const source = current.source && typeof current.source === 'object'
      ? current.source
      : {};
    const type = String(source.type || '').toLowerCase();

    if (!ARTICLE_TYPES.has(type)) return null;
    if (source.fullArticle === false || source.captureType === 'selection') return null;

    const text = String(current.text || '').trim();
    if (text.length < 40) return null;

    return {
      current,
      source,
      type,
      title:String(current.title || 'Current article'),
      text
    };
  }

  function articleAvailable() {
    return Boolean(currentArticle());
  }

  function selectionPanel() {
    return (
      $('.mark-companion-panel #mark-selection-panel') ||
      $('#mark-selection-panel')
    );
  }

  function canonicalSelection() {
    const api = window.MarkSetGoCurrentReaderDocument;
    if (typeof api?.getSelectionRange !== 'function') {
      return { available:false, range:null, text:'' };
    }

    try {
      const range = api.getSelectionRange();
      return {
        available:true,
        range:range || null,
        text:String(range?.text || '').trim()
      };
    } catch {
      return { available:false, range:null, text:'' };
    }
  }

  function legacySelectionText() {
    return selectionPanel()
      ?.querySelector('.mark-selection-card blockquote')
      ?.textContent
      ?.trim() || '';
  }

  function clearStaleLegacySelection() {
    const canonical = canonicalSelection();

    // If the Reader exposes its canonical selection API, it is authoritative.
    // An empty canonical range means the passage has been deselected, even if
    // the older Ask Beth selection card still contains the previous quote.
    if (!canonical.available || canonical.text) return false;

    const panel = selectionPanel();
    const quote = panel?.querySelector('.mark-selection-card blockquote');
    const card = quote?.closest('.mark-selection-card');

    if (quote && String(quote.textContent || '').trim()) {
      quote.textContent = '';
    }
    if (card) card.hidden = true;

    return true;
  }

  function selectionText() {
    const canonical = canonicalSelection();

    // Never fall back to stale legacy text when the canonical API exists.
    if (canonical.available) return canonical.text;

    // Compatibility only for older Reader builds that do not expose
    // getSelectionRange().
    return legacySelectionText();
  }

  function scopeInfo() {
    const selected = Boolean(selectionText());
    return {
      selected,
      key:selected ? 'selection' : 'article',
      label:selected ? 'Selected passage' : 'Whole article'
    };
  }

  function composer() {
    return $('.mark-companion-panel [data-askmark-composer]');
  }

  function input() {
    return $('.mark-companion-panel [data-askmark-input]');
  }

  function sendButton() {
    return $('.mark-companion-panel [data-askmark-send]');
  }

  function premium() {
    return $('.mark-companion-panel [data-askmark-premium]');
  }

  function panelVisible() {
    const layout = document.getElementById('reader-layout');
    return Boolean(layout && !layout.classList.contains('word-panel-hidden'));
  }

  function markConversationStarted() {
    premium()?.classList.add('askmark-conversation-started');
  }

  function syncConversationStartedFromDom() {
    const conversation = $('.mark-companion-panel [data-askmark-conversation]');
    if ((conversation?.children?.length || 0) > 1) {
      markConversationStarted();
    }
  }

  function actionMarkup() {
    return `
      <div class="askmark-article-mode" data-askmark-article-mode>
        <span class="askmark-article-scope" data-askmark-article-scope>Whole article</span>
        <div class="askmark-article-actions-wrap">
          <button
            type="button"
            class="askmark-article-actions-toggle"
            data-askmark-article-actions-toggle
            aria-haspopup="menu"
            aria-expanded="false"
          >Actions <span aria-hidden="true">▾</span></button>
          <div
            class="askmark-article-actions-menu"
            data-askmark-article-actions-menu
            role="menu"
            hidden
          >
            ${Object.entries(ACTIONS).map(([key,item]) => `
              <button
                type="button"
                role="menuitem"
                data-askmark-article-action="${key}"
              >${item.label}</button>
            `).join('')}
          </div>
        </div>
      </div>`;
  }

  function makeInputReady(field, { focus = false } = {}) {
    if (!field) return false;

    field.disabled = false;
    field.readOnly = false;
    field.removeAttribute('disabled');
    field.removeAttribute('readonly');
    field.tabIndex = 0;
    field.style.pointerEvents = 'auto';

    if (focus && panelVisible()) {
      window.setTimeout(() => {
        try { field.focus({ preventScroll:true }); }
        catch { try { field.focus(); } catch {} }
      }, 40);
    }
    return true;
  }

  function closeActionsMenu() {
    const menu = $('[data-askmark-article-actions-menu]');
    const toggle = $('[data-askmark-article-actions-toggle]');
    if (menu) menu.hidden = true;
    if (toggle) toggle.setAttribute('aria-expanded','false');
  }

  function toggleActionsMenu() {
    const menu = $('[data-askmark-article-actions-menu]');
    const toggle = $('[data-askmark-article-actions-toggle]');
    if (!menu || !toggle) return false;

    const nextOpen = menu.hidden;
    menu.hidden = !nextOpen;
    toggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    return nextOpen;
  }

  function submitThroughComposer(question) {
    clearStaleLegacySelection();

    const field = input();
    const send = sendButton();
    const clean = String(question || '').trim();

    if (!field || !send || !clean) return false;

    makeInputReady(field);
    markConversationStarted();

    field.value = clean;
    field.dispatchEvent(new Event('input', { bubbles:true }));
    send.click();
    return true;
  }

  function runAction(action) {
    const item = ACTIONS[String(action || '').toLowerCase()];
    if (!item || !articleAvailable()) return false;

    const scope = scopeInfo();
    closeActionsMenu();

    // IMPORTANT: use the same composer as a normal reader question.
    // ask-mark-hub.js already owns the routing rule:
    // selection present -> selected passage
    // no selection     -> whole article
    return submitThroughComposer(scope.selected ? item.selected : item.whole);
  }

  function bindArticleControls(root) {
    if (!root) return;

    const toggle = root.querySelector('[data-askmark-article-actions-toggle]');
    if (toggle && toggle.dataset.askmarkCompactBound !== '1') {
      toggle.dataset.askmarkCompactBound = '1';
      toggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleActionsMenu();
      });
    }

    root.querySelectorAll('[data-askmark-article-action]').forEach((button) => {
      if (button.dataset.askmarkCompactBound === '1') return;
      button.dataset.askmarkCompactBound = '1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        runAction(button.dataset.askmarkArticleAction);
      });
    });
  }

  function syncScope() {
    if (!articleAvailable()) return false;

    clearStaleLegacySelection();
    const scope = scopeInfo();
    const chip = $('[data-askmark-article-scope]');
    const field = input();
    const toggle = $('[data-askmark-article-actions-toggle]');

    if (chip) {
      chip.textContent = scope.label;
      chip.dataset.scope = scope.key;
      chip.title = scope.selected
        ? 'Ask Beth will use only the highlighted passage.'
        : 'Ask Beth will use the whole article because nothing is highlighted.';
    }

    if (field) {
      field.placeholder = scope.selected
        ? 'Ask about the selected passage…'
        : 'Ask anything about this article…';
      field.setAttribute(
        'aria-label',
        scope.selected
          ? 'Ask about the selected passage'
          : 'Ask about the whole article'
      );
    }

    if (toggle) {
      toggle.setAttribute(
        'aria-label',
        scope.selected
          ? 'Actions for selected passage'
          : 'Actions for whole article'
      );
    }

    return true;
  }

  function syncArticleUi({ focus = false } = {}) {
    const targetComposer = composer();
    const field = input();

    if (!targetComposer || !field) return false;

    let tools = targetComposer.querySelector('[data-askmark-article-mode]');
    const article = articleAvailable();

    if (!article) {
      tools?.remove();
      targetComposer.classList.remove('askmark-article-composer');
      field.placeholder = '';
      field.removeAttribute('aria-label');
      return false;
    }

    targetComposer.classList.add('askmark-article-composer');

    if (!tools) {
      targetComposer.insertAdjacentHTML('afterbegin', actionMarkup());
      tools = targetComposer.querySelector('[data-askmark-article-mode]');
    }

    bindArticleControls(tools);
    syncScope();
    syncConversationStartedFromDom();
    makeInputReady(field, { focus });
    return true;
  }

  function scheduleSync(options = {}) {
    [0,80,220,520].forEach((delay) => {
      window.setTimeout(() => syncArticleUi(options), delay);
    });
  }

  // Hide the introductory greeting as soon as the reader actually begins
  // composing. Capture phase means this does not interfere with the Hub owner.
  document.addEventListener('input', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (
      articleAvailable() &&
      target?.matches?.('[data-askmark-input]') &&
      String(target.value || '').trim()
    ) {
      markConversationStarted();
    }
  }, true);

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (
      target.closest('#toggle-mark-panel') ||
      target.closest('[data-action="reader"]') ||
      target.closest('[data-mark-tab="selection"]')
    ) {
      scheduleSync({ focus:true });
    }

    if (target.closest('[data-askmark-send]') && articleAvailable()) {
      const value = String(input()?.value || '').trim();
      if (value) markConversationStarted();
    }

    const menu = $('[data-askmark-article-actions-menu]');
    if (
      menu &&
      !menu.hidden &&
      !target.closest('[data-askmark-article-actions-wrap]') &&
      !target.closest('.askmark-article-actions-wrap')
    ) {
      closeActionsMenu();
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    const target = event.target instanceof Element ? event.target : null;

    if (
      articleAvailable() &&
      target?.matches?.('[data-askmark-input]') &&
      event.key === 'Enter' &&
      !event.shiftKey &&
      String(target.value || '').trim()
    ) {
      markConversationStarted();
    }

    if (event.key === 'Escape') closeActionsMenu();
  }, true);

  function scheduleSelectionScopeSync() {
    [0,60,180].forEach((delay) => {
      window.setTimeout(() => {
        clearStaleLegacySelection();
        syncScope();
      }, delay);
    });
  }

  document.addEventListener('selectionchange', scheduleSelectionScopeSync);
  document.addEventListener('pointerup', scheduleSelectionScopeSync, true);
  window.addEventListener('focus', scheduleSelectionScopeSync);

  [
    'marksetgo:askmark-legacy-updated',
    'marksetgo:document-available',
    'marksetgo:workspace-layout-mode'
  ].forEach((name) => {
    document.addEventListener(name, () => {
      scheduleSync({ focus:name === 'marksetgo:document-available' && panelVisible() });
    });
  });

  window.addEventListener('pageshow', () => scheduleSync());

  // Pop-out compatibility. These calls deliberately go through the normal
  // composer, preserving the exact same selection-first routing rule.
  window.MarkSetGoArticleCompanion = Object.freeze({
    available:articleAvailable,
    scope:() => scopeInfo().key,
    scopeLabel:() => scopeInfo().label,
    ask:(question) => submitThroughComposer(question),
    action:runAction,
    sync:syncArticleUi,
    actions:Object.fromEntries(
      Object.entries(ACTIONS).map(([key,value]) => [key,value.label])
    )
  });

  scheduleSync();
})();