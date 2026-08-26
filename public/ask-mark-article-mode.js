(() => {
  'use strict';

  const ARTICLE_TYPES = new Set(['topic-feed','bookmarklet','website']);
  const ACTIONS = Object.freeze({
    explain:'Explain the entire article clearly. Walk through the main idea, important facts, and why they matter.',
    summarize:'Summarize the entire article. Cover the main point, the most important facts, and the key takeaway.',
    analyze:'Analyze the entire article. Identify its main claims, evidence, assumptions, implications, and important uncertainties or limitations.',
    simplify:'Simplify the entire article without losing important meaning. Explain it in plain language and define any important technical ideas.',
    context:'Give me the broader context for the entire article. Explain what led to this, why it matters, and the important background a reader should understand.',
    related:'Compare and connect the major ideas or viewpoints in the entire article. Point out tensions, alternatives, or competing interpretations that help me understand it better.'
  });

  const $ = (selector, root = document) => root.querySelector(selector);

  function currentArticle() {
    const current = window.MarkSetGoCurrentReaderDocument?.get?.() || {};
    const source = current.source && typeof current.source === 'object' ? current.source : {};
    const type = String(source.type || '').toLowerCase();

    if (!ARTICLE_TYPES.has(type)) return null;
    if (source.fullArticle === false || source.captureType === 'selection') return null;

    const articleText = String(current.text || '').trim();
    if (articleText.length < 40) return null;

    return {
      current,
      source,
      type,
      articleText,
      title:String(
        current.title ||
        document.querySelector('.reader-title-copy h1')?.textContent?.trim() ||
        'Current article'
      ),
      sourceUrl:String(source.url || '')
    };
  }

  function companionConfig() {
    const live = window.MSGCompanion?.config;
    if (live?.name) {
      return {
        id:String(live.id || ''),
        name:String(live.name || 'Reading Companion'),
        ask:String(live.ask || `Ask ${live.name || 'Companion'}`),
        avatar:String(live.avatar || '')
      };
    }

    const shell = $('.mark-companion-panel');
    const ask = shell?.querySelector('.askmark-brand-copy h2')?.textContent?.trim() || 'Ask Mark';
    const name = ask.replace(/^Ask\s+/i,'').trim() || 'Mark';
    const avatar = shell?.querySelector('.askmark-avatar')?.getAttribute('src') || '';
    return { id:'', name, ask, avatar };
  }

  function ensureArticleContext() {
    const live = currentArticle();
    if (!live) return null;

    const existing = window.MSGInvestorArticleContext;
    const sameArticle = Boolean(
      existing?.articleText &&
      String(existing.title || '') === live.title &&
      String(existing.sourceUrl || '') === live.sourceUrl
    );

    if (sameArticle) {
      existing.autoWholeArticleContext = true;
      return existing;
    }

    const wordCount = Math.max(1, live.articleText.split(/\s+/).filter(Boolean).length);
    const context = {
      companion:companionConfig(),
      selection:{
        text:'Whole article',
        selection:'Whole article',
        before:'',
        after:'',
        title:live.title,
        chapter:'Whole article',
        documentId:String(live.current.documentId || ''),
        startIndex:0,
        endIndex:wordCount,
        syntheticWholeArticle:true
      },
      articleText:live.articleText,
      title:live.title,
      sourceUrl:live.sourceUrl,
      history:[],
      autoWholeArticleContext:true,
      updatedAt:new Date().toISOString()
    };

    window.MSGInvestorArticleContext = context;
    return context;
  }

  function conversation() {
    return $('.mark-companion-panel [data-askmark-conversation]');
  }

  function input() {
    return $('.mark-companion-panel [data-askmark-input]');
  }

  function panelVisible() {
    const layout = document.getElementById('reader-layout');
    return Boolean(layout && !layout.classList.contains('word-panel-hidden'));
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      "'":'&#39;',
      '"':'&quot;'
    })[character]);
  }

  function responseParagraphs(value = '') {
    return String(value || '')
      .trim()
      .split(/\n{2,}/)
      .filter(Boolean)
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join('');
  }

  function dispatchUpdate(detail = {}) {
    document.dispatchEvent(new CustomEvent('marksetgo:askmark-article-updated', {
      detail:{ ...detail, at:Date.now() }
    }));
  }

  function appendUserMessage(text) {
    const target = conversation();
    if (!target || !text) return null;

    const node = document.createElement('article');
    node.className = 'askmark-message user-message';
    node.innerHTML = `<div><span>You</span><p>${escapeHtml(text)}</p></div>`;
    target.appendChild(node);
    target.scrollTop = target.scrollHeight;
    dispatchUpdate({ stage:'question' });
    return node;
  }

  function appendThinking() {
    const target = conversation();
    if (!target) return null;

    const companion = companionConfig();
    const node = document.createElement('article');
    node.className = 'askmark-message mark-message is-thinking';
    node.innerHTML = `
      <img src="${escapeHtml(companion.avatar)}" alt="${escapeHtml(companion.name)}">
      <div><span>${escapeHtml(companion.name)}</span><p><i></i><i></i><i></i></p></div>`;
    target.appendChild(node);
    target.scrollTop = target.scrollHeight;
    dispatchUpdate({ stage:'thinking' });
    return node;
  }

  function renderResult(thinking, result = {}) {
    if (!thinking?.isConnected) return;

    const companion = companionConfig();
    const keyPoints = Array.isArray(result.keyPoints) ? result.keyPoints : [];
    const cautions = Array.isArray(result.cautions) ? result.cautions : [];

    thinking.classList.remove('is-thinking');
    thinking.innerHTML = `
      <img src="${escapeHtml(companion.avatar)}" alt="${escapeHtml(companion.name)}">
      <div>
        <span>${escapeHtml(companion.name)}</span>
        <div class="askmark-rich-response">
          <div class="mark-response-heading">
            <span>${escapeHtml(companion.ask)}</span>
            <strong>${escapeHtml(result.heading || 'Whole-article answer')}</strong>
          </div>
          ${responseParagraphs(result.response || '')}
          ${keyPoints.length ? `
            <h4>Key points</h4>
            <ul>${keyPoints.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
          ${cautions.length ? `
            <div class="mark-cautions">
              ${cautions.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}
            </div>` : ''}
        </div>
      </div>`;

    const target = conversation();
    if (target) target.scrollTop = target.scrollHeight;
    dispatchUpdate({ stage:'complete' });
  }

  function renderError(thinking, error) {
    if (!thinking?.isConnected) return;
    const companion = companionConfig();

    thinking.classList.remove('is-thinking');
    thinking.innerHTML = `
      <img src="${escapeHtml(companion.avatar)}" alt="${escapeHtml(companion.name)}">
      <div>
        <span>${escapeHtml(companion.name)}</span>
        <p class="status error">${escapeHtml(error?.message || `${companion.name} could not answer that question.`)}</p>
      </div>`;
    dispatchUpdate({ stage:'error' });
  }

  async function askWholeArticle(question, { displayQuestion = '' } = {}) {
    const clean = String(question || '').trim();
    if (!clean) return false;

    const context = ensureArticleContext();
    if (!context) return false;

    const shown = String(displayQuestion || clean).trim();
    appendUserMessage(shown);
    const thinking = appendThinking();
    const companion = companionConfig();

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90000);

    try {
      const history = Array.isArray(context.history) ? context.history.slice(-8) : [];

      const response = await fetch('/api/read-anything/article-followup', {
        method:'POST',
        signal:controller.signal,
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({
          companion:companion.id,
          title:context.title || 'Current article',
          sourceUrl:context.sourceUrl || '',
          articleText:context.articleText,
          analysis:context.analysis || {},
          history,
          question:clean
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.detail ||
          payload.error ||
          `Request failed with HTTP ${response.status}.`
        );
      }

      const result = payload.result || {};
      context.history = Array.isArray(context.history) ? context.history : [];
      context.history.push(
        { role:'user', text:shown },
        { role:'assistant', text:String(result.response || '').trim() }
      );
      context.history = context.history.slice(-12);
      context.updatedAt = new Date().toISOString();

      renderResult(thinking, result);
      return true;
    } catch (error) {
      const normalized = error?.name === 'AbortError'
        ? new Error(`${companion.name} took too long to answer. Please try again.`)
        : error;
      renderError(thinking, normalized);
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function runAction(action) {
    const key = String(action || '').toLowerCase();
    const prompt = ACTIONS[key];
    if (!prompt || !currentArticle()) return false;

    const label = {
      explain:'Explain the whole article.',
      summarize:'Summarize the whole article.',
      analyze:'Analyze the whole article.',
      simplify:'Simplify the whole article.',
      context:'Give me context for the whole article.',
      related:'Compare the ideas in the whole article.'
    }[key] || prompt;

    return askWholeArticle(prompt, { displayQuestion:label });
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

  function syncArticleUi({ focus = false } = {}) {
    const composer = $('.mark-companion-panel [data-askmark-composer]');
    const field = input();
    const article = currentArticle();

    if (!composer || !field) return false;

    let tools = composer.querySelector('[data-askmark-article-mode]');

    if (!article) {
      tools?.remove();
      field.placeholder = '';
      composer.classList.remove('askmark-article-composer');
      return false;
    }

    ensureArticleContext();
    composer.classList.add('askmark-article-composer');

    if (!tools) {
      composer.insertAdjacentHTML('afterbegin', actionMarkup());
      tools = composer.querySelector('[data-askmark-article-mode]');
    }

    field.placeholder = 'Ask anything about the whole article…';
    field.setAttribute('aria-label','Ask about the whole article');

    if (focus && panelVisible()) {
      window.setTimeout(() => {
        try { field.focus({ preventScroll:true }); } catch { field.focus(); }
      }, 40);
    }

    return true;
  }

  function scheduleSync(options = {}) {
    [0,80,220,520].forEach((delay) => {
      window.setTimeout(() => syncArticleUi(options), delay);
    });
  }

  // Whole-article action buttons always ignore any incidental/stale selection.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const actionButton = target.closest('[data-askmark-article-action]');
    if (actionButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void runAction(actionButton.dataset.askmarkArticleAction);
      return;
    }

    // For ARTICLE mode, free-form composer questions are whole-article-first.
    const send = target.closest('[data-askmark-send]');
    if (send && currentArticle()) {
      const field = input();
      const question = String(field?.value || '').trim();
      if (!question) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      field.value = '';
      field.style.height = '';
      void askWholeArticle(question);
      return;
    }

    if (target.closest('#toggle-mark-panel,[data-mark-tab="selection"]')) {
      const willOpen = document.getElementById('toggle-mark-panel')?.getAttribute('aria-pressed') !== 'true';
      scheduleSync({ focus:willOpen || panelVisible() });
    }
  }, true);

  // Capture Enter before ask-mark-hub's target keydown handler.
  document.addEventListener('keydown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (
      !currentArticle() ||
      !target?.matches?.('[data-askmark-input]') ||
      event.key !== 'Enter' ||
      event.shiftKey
    ) return;

    const question = String(target.value || '').trim();
    if (!question) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    target.value = '';
    target.style.height = '';
    void askWholeArticle(question);
  }, true);

  document.addEventListener('marksetgo:document-available', () => {
    window.setTimeout(() => {
      scheduleSync({ focus:panelVisible() });
      dispatchUpdate({ stage:'document' });
    }, 0);
  });

  window.addEventListener('pageshow', () => scheduleSync());

  window.MarkSetGoArticleCompanion = Object.freeze({
    available:() => Boolean(currentArticle()),
    current:currentArticle,
    ask:(question) => askWholeArticle(question),
    action:runAction,
    sync:syncArticleUi,
    actions:{ ...ACTIONS }
  });

  scheduleSync();
})();