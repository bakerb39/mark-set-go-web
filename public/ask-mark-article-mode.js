(() => {
  'use strict';

  const ARTICLE_TYPES = new Set(['topic-feed','bookmarklet','website']);

  const ACTIONS = Object.freeze({
    explain:{
      label:'Explain the whole article.',
      prompt:'Explain the entire article clearly. Walk through the main idea, important facts, and why they matter.'
    },
    summarize:{
      label:'Summarize the whole article.',
      prompt:'Summarize the entire article. Cover the main point, the most important facts, and the key takeaway.'
    },
    analyze:{
      label:'Analyze the whole article.',
      prompt:'Analyze the entire article. Identify its main claims, evidence, assumptions, implications, and important uncertainties or limitations.'
    },
    simplify:{
      label:'Simplify the whole article.',
      prompt:'Simplify the entire article without losing important meaning. Explain it in plain language and define any important technical ideas.'
    },
    context:{
      label:'Give me context for the whole article.',
      prompt:'Give me the broader context for the entire article. Explain what led to this, why it matters, and the important background a reader should understand.'
    },
    related:{
      label:'Compare the ideas in the whole article.',
      prompt:'Compare and connect the major ideas or viewpoints in the entire article. Point out tensions, alternatives, or competing interpretations that help me understand it better.'
    }
  });

  const $ = (selector, root = document) => root.querySelector(selector);

  function hub() {
    return window.MarkSetGoAskMarkHub;
  }

  function fallbackArticle() {
    const current = window.MarkSetGoCurrentReaderDocument?.get?.() || {};
    const source = current.source && typeof current.source === 'object' ? current.source : {};
    const type = String(source.type || '').toLowerCase();

    if (!ARTICLE_TYPES.has(type)) return null;
    if (source.fullArticle === false || source.captureType === 'selection') return null;

    const text = String(current.text || '').trim();
    if (text.length < 40) return null;

    return {
      title:String(current.title || 'Current article'),
      type,
      text
    };
  }

  function articleAvailable() {
    try {
      if (typeof hub()?.isWholeArticle === 'function') return Boolean(hub().isWholeArticle());
    } catch {}
    return Boolean(fallbackArticle());
  }

  function composer() {
    return $('.mark-companion-panel [data-askmark-composer]');
  }

  function input() {
    return $('.mark-companion-panel [data-askmark-input]');
  }

  function panelVisible() {
    const layout = document.getElementById('reader-layout');
    return Boolean(layout && !layout.classList.contains('word-panel-hidden'));
  }

  function actionMarkup() {
    return `
      <div class="askmark-article-mode" data-askmark-article-mode>
        <span class="askmark-article-scope">Whole article</span>
        <div class="askmark-article-actions" role="group" aria-label="Whole article actions">
          <button type="button" data-askmark-article-action="explain">Explain</button>
          <button type="button" data-askmark-article-action="summarize">Summarize</button>
          <button type="button" data-askmark-article-action="analyze">Analyze</button>
          <button type="button" data-askmark-article-action="simplify">Simplify</button>
          <button type="button" data-askmark-article-action="context">Context</button>
          <button type="button" data-askmark-article-action="related">Compare</button>
        </div>
      </div>`;
  }

  function bindActionButtons(root) {
    root?.querySelectorAll('[data-askmark-article-action]').forEach((button) => {
      if (button.dataset.askmarkArticleBound === '1') return;
      button.dataset.askmarkArticleBound = '1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        const action = String(button.dataset.askmarkArticleAction || '');
        void runAction(action);
      });
    });
  }

  function makeInputReady(field, { focus = false } = {}) {
    if (!field) return false;

    // A full article should never need a selection before the composer can be used.
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

    bindActionButtons(tools);
    field.placeholder = 'Ask anything about the whole article…';
    field.setAttribute('aria-label','Ask about the whole article');
    makeInputReady(field, { focus });
    return true;
  }

  function scheduleSync(options = {}) {
    [0,80,220,520].forEach((delay) => {
      window.setTimeout(() => syncArticleUi(options), delay);
    });
  }

  async function askWholeArticle(question, displayQuestion = '') {
    const api = hub();
    if (!articleAvailable() || typeof api?.askWholeArticle !== 'function') return false;
    return api.askWholeArticle(
      String(question || '').trim(),
      String(displayQuestion || '').trim()
    );
  }

  async function runAction(action) {
    const item = ACTIONS[String(action || '').toLowerCase()];
    if (!item || !articleAvailable()) return false;
    return askWholeArticle(item.prompt, item.label);
  }

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
  }, true);

  document.addEventListener('marksetgo:document-available', () => {
    scheduleSync({ focus:panelVisible() });
  });

  document.addEventListener('marksetgo:workspace-layout-mode', () => {
    scheduleSync({ focus:false });
  });

  window.addEventListener('pageshow', () => scheduleSync());

  // Compatibility API for the pop-out controller. The actual conversation/API
  // owner is ask-mark-hub.js.
  window.MarkSetGoArticleCompanion = Object.freeze({
    available:articleAvailable,
    ask:(question) => askWholeArticle(question, question),
    action:runAction,
    sync:syncArticleUi,
    actions:Object.fromEntries(
      Object.entries(ACTIONS).map(([key,value]) => [key,value.prompt])
    )
  });

  scheduleSync();
})();