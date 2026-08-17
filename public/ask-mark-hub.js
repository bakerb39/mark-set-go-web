(() => {
  'use strict';

  const app = document.getElementById('app');
  if (!app) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const transformApi = () => window.MarkSetGoReadAnything;

  const COMPANION_STORAGE_KEY = 'msg_companion_persona_v2';
  const companionConfig = () => {
    const live = window.MSGCompanion?.config;
    if (live?.id) return live;
    const selected = localStorage.getItem(COMPANION_STORAGE_KEY) || localStorage.getItem('msg_companion_persona_v1') || 'mark';

    if (selected === 'scott') {
      return {
        id:'scott',
        name:'Scott',
        ask:'Ask Scott',
        notebook:'Scott’s Notebook',
        avatar:'/assets/companions/scott/scott-avatar.png'
      };
    }

    if (selected === 'chad') {
      return {
        id:'chad',
        name:'Chad',
        ask:'Ask Chad',
        notebook:"Chad's Notebook",
        avatar:'/assets/companions/chad/chad-avatar.png'
      };
    }

    if (selected === 'beth') {
      return {
        id:'beth',
        name:'Beth',
        ask:'Ask Beth',
        notebook:"Beth's Notebook",
        avatar:'/assets/companions/beth/beth-ui-avatar.png?v=9.6.9'
      };
    }

    return {
      id:'mark',
      name:'Mark',
      ask:'Ask Mark',
      notebook:"Mark's Notebook",
      avatar:'/assets/ask-mark/ask-mark-avatar.png'
    };
  };
  const companionName = () => companionConfig().name;
  const companionAsk = () => companionConfig().ask;
  const companionAvatar = () => companionConfig().avatar;
  const companionNotebook = () => {
    const config = companionConfig();
    return config.notebook || `${config.name}’s Notebook`;
  };

  let shell = null;
  let legacyHost = null;
  let installAttempts = 0;

  const QUICK_ACTIONS = [
    ['explain', '✦', 'Explain'],
    ['summarize', '≡', 'Summarize'],
    ['analyze', '◇', 'Analyze'],
    ['simplify', 'Aa', 'Simplify'],
    ['context', '⌂', 'Context'],
    ['related', '∞', 'Compare']
  ];

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }

  function getBookContext() {
    const title =
      $('#reader-title')?.textContent?.trim() ||
      $('.reader-title')?.textContent?.trim() ||
      $('main h1')?.textContent?.trim() ||
      document.title.replace(/\s*[|–-].*$/, '').trim() ||
      'Your current reading';

    const chapter =
      $('.book-page-chapter')?.textContent?.trim() ||
      $('[data-current-chapter]')?.textContent?.trim() ||
      $('.reader-status')?.textContent?.trim() ||
      'Ready when you are';

    const progress =
      $('#reader-progress')?.value ||
      $('[data-reading-progress]')?.textContent?.trim() ||
      '';

    return { title, chapter, progress };
  }

  function getLegacySelectionPanel() {
    return $('#mark-selection-panel', legacyHost || shell || document);
  }

  function getSelectionText() {
    const panel = getLegacySelectionPanel();
    return panel?.querySelector('.mark-selection-card blockquote')?.textContent?.trim() || '';
  }

  function readerFirstName() {
    return window.MarkSetGoAuth?.getFirstName?.() ||
      String(window.MarkSetGoAuth?.session?.account?.displayName || '').trim().split(/\s+/)[0] || '';
  }

  function greeting() {
    const hour = new Date().getHours();
    const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const firstName = readerFirstName();
    return `${salutation}${firstName ? `, ${firstName}` : ''}.`;
  }


  function refreshPersonalGreeting() {
    const node = $('[data-askmark-personal-greeting]', shell || document);
    if (node) node.textContent = greeting();
  }

  function premiumMarkup() {
    const context = getBookContext();
    return `
      <div class="askmark-premium" data-askmark-premium>
        <header class="askmark-hero">
          <button class="askmark-close" type="button" data-askmark-close aria-label="Close ${companionAsk()}">×</button>
          <div class="askmark-avatar-wrap" aria-hidden="true">
            <span class="askmark-avatar-glow"></span>
            <img class="askmark-avatar" src="${companionAvatar()}" alt="${companionName()}">
            <span class="askmark-presence"></span>
          </div>
          <div class="askmark-brand-copy">
            <span class="askmark-eyebrow">Your reading companion</span>
            <h2>${companionAsk()}</h2>
          </div>
          <div class="askmark-header-actions">
            <button type="button" data-askmark-view="notebook" aria-label="Open notebook" title="Notebook">✎</button>
            <button type="button" data-askmark-view="format" aria-label="Format text" title="Format">Aa</button>
            <button type="button" data-askmark-view="tools" aria-label="Open reader settings" title="Reader settings">⚙</button>
          </div>
        </header>

        <main class="askmark-stage">
          <section class="askmark-view is-active" data-askmark-view-panel="chat">
            <div class="askmark-conversation" data-askmark-conversation aria-live="polite">
              <article class="askmark-message mark-message">
                <img src="${companionAvatar()}" alt="${companionName()}">
                <div>
                  <span>${companionName()}</span>
                  <p><strong data-askmark-personal-greeting>${greeting()}</strong> Highlight a passage or ask me about the book. I can explain ideas, summarize, compare viewpoints, quiz you, or save an insight.</p>
                </div>
              </article>
            </div>


          </section>

          <section class="askmark-view" data-askmark-view-panel="notebook">
            <div class="askmark-subhead"><button type="button" data-askmark-back>←</button><div><span>Your saved thinking</span><h3>${companionNotebook()}</h3></div></div>
            <div class="askmark-legacy-slot" data-notebook-slot></div>
          </section>

          <section class="askmark-view" data-askmark-view-panel="format">
            <div class="askmark-subhead"><button type="button" data-askmark-back>←</button><div><span>Text cleanup</span><h3>Format</h3></div></div>
            <div class="askmark-format-stack">
              <details class="askmark-format-group" open>
                <summary>Cleanup level</summary>
                <div class="askmark-format-body askmark-format-levels">
                  <button type="button" data-format-level="light"><strong>Light</strong><small>Characters, spacing, punctuation</small></button>
                  <button type="button" data-format-level="standard"><strong>Standard</strong><small>Fast local OCR cleanup, paragraphs, page artifacts</small></button>
                  <button type="button" class="is-selected" data-format-level="deep"><strong>AI Deep Clean</strong><small>Context-aware OCR repair and document structure</small></button>
                </div>
              </details>
              <details class="askmark-format-group" open>
                <summary>Apply to</summary>
                <div class="askmark-format-body askmark-format-scope">
                  <label><input type="radio" name="askmark-format-scope" value="document" checked> Entire document</label>
                  <label><input type="radio" name="askmark-format-scope" value="selection"> Highlighted passage</label>
                </div>
              </details>
              <details class="askmark-format-group" open>
                <summary>What gets cleaned</summary>
                <div class="askmark-format-checks">
                  <span>✓ Bad / control characters</span><span>✓ Broken line-end words</span><span>✓ Repeated headers &amp; titles</span><span>✓ Page numbers &amp; scan artifacts</span><span>✓ Paragraphs &amp; spacing</span><span>✓ Chapter / section structure</span><span>✓ Punctuation normalization</span>
                </div>
              </details>
              <div class="askmark-format-actions">
                <button class="primary" type="button" data-askmark-format-apply>Format Text</button>
                <button class="secondary" type="button" data-askmark-format-original>Restore Original</button>
              </div>
              <p class="askmark-format-note">The original text is always preserved. Formatting changes structure and scan artifacts; it does not intentionally rewrite the author's prose.</p>
              <div class="status askmark-format-status" data-askmark-format-status aria-live="polite"></div>
            </div>
          </section>

          <section class="askmark-view" data-askmark-view-panel="tools">
            <div class="askmark-subhead"><button type="button" data-askmark-back>←</button><div><span>Reading preferences</span><h3>Reader Settings</h3></div></div>
            <div class="askmark-legacy-slot" data-tools-slot></div>
          </section>
        </main>

        <footer class="askmark-composer" data-askmark-composer>
          <div class="askmark-composer-resize" data-askmark-composer-resize role="separator" aria-label="Resize Ask Mark input" aria-orientation="horizontal" title="Drag upward to enlarge"></div>
          <button type="button" class="askmark-plus" data-askmark-more aria-label="More actions">＋</button>
          <label>
            <span class="sr-only">Ask Mark anything</span>
            <textarea data-askmark-input rows="1" placeholder=""></textarea>
          </label>
          <button type="button" class="askmark-send" data-askmark-send aria-label="Send to Ask Mark">➜</button>
          <div class="askmark-more-menu" data-askmark-more-menu hidden>
            <button type="button" data-askmark-prompt="Create a study guide for this passage."><span>▤</span><span class="askmark-more-copy"><strong>Study guide</strong><small>Use current reading</small></span></button>
            <button type="button" data-askmark-tool="flashcards"><span>▱</span><span class="askmark-more-copy"><strong>Flash cards</strong><small>Flip through review cards</small></span></button>
            <button type="button" data-premium-mark-action="context"><span>⌛</span><span class="askmark-more-copy"><strong>Historical context</strong><small>Use current reading</small></span></button>
            <button type="button" data-askmark-prompt="Identify the key ideas in this passage."><span>✦</span><span class="askmark-more-copy"><strong>Key ideas</strong><small>Use current reading</small></span></button>
            <button type="button" data-askmark-tool="memory"><span>◇</span><span class="askmark-more-copy"><strong>Memory tools</strong><small>Build clear recall anchors</small></span></button>
            <button type="button" data-askmark-comprehension><span>🧠</span><span class="askmark-more-copy"><strong>Comprehension</strong><small>Check your understanding</small></span></button>
          </div>
        </footer>
      </div>`;
  }

  function scrollConversationToMessage(message, { smooth = true } = {}) {
    const conversation = $('[data-askmark-conversation]', shell);
    if (!conversation || !message) return;

    const top = Math.max(0, message.offsetTop - 12);

    // Place the reader's question at the top of the chat viewport so the
    // response grows beneath it instead of forcing the reader to scroll down.
    conversation.scrollTo({
      top,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }

  function latestUserMessage() {
    const messages = $$('[data-askmark-conversation] .askmark-message.user-message', shell);
    return messages[messages.length - 1] || null;
  }

  function addUserMessage(text) {
    const conversation = $('[data-askmark-conversation]', shell);
    if (!conversation || !text) return null;

    const id = `askmark-user-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    conversation.insertAdjacentHTML('beforeend', `
      <article class="askmark-message user-message" id="${id}"><div><span>You</span><p>${escapeHtml(text)}</p></div></article>`);

    const message = document.getElementById(id);
    scrollConversationToMessage(message, { smooth: true });
    return message;
  }

  const MARK_PROGRESS_SEEN_KEY='markSetGoMarkProgressSeenV1';

  function currentReaderProgressContext(){
    const current=window.MarkSetGoCurrentReaderDocument?.get?.() || {};
    return {
      documentId:String(current.documentId||''),
      title:String(current.title||'')
    };
  }

  function addMarkProgressMessage(update,{force=false}={}){
    if(!shell || !update?.message) return false;
    const conversation=$('[data-askmark-conversation]',shell);
    if(!conversation) return false;

    let seen={};
    try{seen=JSON.parse(localStorage.getItem(MARK_PROGRESS_SEEN_KEY)||'{}')||{};}catch(_){}

    const documentKey=currentReaderProgressContext().documentId || currentReaderProgressContext().title || 'general';
    const previous=seen[documentKey]||{};
    const now=Date.now();
    const recent=Number(previous.at||0) && now-Number(previous.at)<6*60*60*1000;

    if(!force && previous.signature===update.signature && recent) return false;

    conversation.insertAdjacentHTML('beforeend',`
      <article class="askmark-message mark-message askmark-progress-message" data-mark-progress-message>
        <img src="${companionAvatar()}" alt="${companionName()}">
        <div>
          <span>${companionName()} · Your progress</span>
          <p>${escapeHtml(update.message)}</p>
        </div>
      </article>`);
    conversation.scrollTop=conversation.scrollHeight;

    seen[documentKey]={signature:update.signature,at:now};
    try{localStorage.setItem(MARK_PROGRESS_SEEN_KEY,JSON.stringify(seen));}catch(_){}
    return true;
  }

  function refreshMarkProgress({force=false}={}){
    const api=window.ReadingGoals;
    if(!api?.getCompanionProgress) return false;
    const update=api.getCompanionProgress(currentReaderProgressContext());
    return addMarkProgressMessage(update,{force});
  }

  window.MarkSetGoGuideSectionWelcome = ({ title = '', text = '' } = {}) => {
    if (!shell) configureShell();
    const conversation = $('[data-askmark-conversation]', shell);
    if (!conversation) return false;

    conversation.querySelectorAll('[data-guide-section-welcome]').forEach((item) => item.remove());
    conversation.insertAdjacentHTML('beforeend', `
      <article class="askmark-message mark-message" data-guide-section-welcome>
        <img src="${companionAvatar()}" alt="${companionName()}">
        <div>
          <span>${companionName()}</span>
          <p>Happy to discuss this section with you. I’ve highlighted the entire section so we can explore any part of it together.</p>
        </div>
      </article>`);
    conversation.scrollTop = conversation.scrollHeight;
    syncSelection();
    return true;
  };

  function addThinkingMessage() {
    const conversation = $('[data-askmark-conversation]', shell);
    if (!conversation) return null;
    const id = `askmark-thinking-${Date.now()}`;
    conversation.insertAdjacentHTML('beforeend', `
      <article class="askmark-message mark-message is-thinking" id="${id}">
        <img src="${companionAvatar()}" alt="${companionName()}">
        <div><span>${companionName()}</span><p><i></i><i></i><i></i></p></div>
      </article>`);
    const thinking = document.getElementById(id);

    // Keep the user's question anchored near the top while the answer is
    // being prepared. Do not jump the chat to the bottom just because the
    // typing indicator was appended.
    const userMessage = latestUserMessage();
    if (userMessage) {
      window.requestAnimationFrame(() => scrollConversationToMessage(userMessage, { smooth: false }));
    }

    return thinking;
  }

  function syncLegacyResponse() {
    const response = getLegacySelectionPanel()?.querySelector('#mark-response');
    if (!response || response.hidden || !response.textContent.trim()) return;
    const thinking = $('.askmark-message.is-thinking', shell);
    const body = response.cloneNode(true);
    body.querySelectorAll('button').forEach((button) => button.classList.add('askmark-inline-action'));
    body.querySelectorAll('.mark-response-heading span').forEach((node) => { node.textContent = companionAsk(); });
    const isPending = Boolean(body.querySelector('.status:not(.error)'));
    const pending = $('[data-askmark-legacy-pending="1"]', shell);
    const markup = `<article class="askmark-message mark-message"${isPending ? ' data-askmark-legacy-pending="1"' : ''}>
      <img src="${companionAvatar()}" alt="${companionName()}">
      <div><span>${companionName()}</span><div class="askmark-rich-response">${body.innerHTML}</div></div>
    </article>`;
    if (thinking) thinking.outerHTML = markup;
    else if (pending) pending.outerHTML = markup;
    else $('[data-askmark-conversation]', shell)?.insertAdjacentHTML('beforeend', markup);

    const messages = $$('[data-askmark-conversation] .askmark-message', shell);
    const latestMessage = messages[messages.length - 1];
    const premiumSaveButton = latestMessage?.querySelector('[data-save-mark-response]');
    if (premiumSaveButton) {
      premiumSaveButton.addEventListener('click', () => {
        const saveId=premiumSaveButton.dataset.markSaveId;
        const saved=window.MarkSetGoNotebook?.saveInsight?.(saveId);
        if(saved?.ok){
          premiumSaveButton.disabled=true;
          premiumSaveButton.textContent='Saved to notebook';
        }else{
          premiumSaveButton.textContent='Save failed — try again';
          window.setTimeout(()=>{
            if(!premiumSaveButton.disabled) premiumSaveButton.textContent='Save to notebook';
          },2200);
        }
      });
    }

    response.hidden = true;

    // Keep the reader's latest question at the top after a normal highlighted-
    // passage answer is converted into the premium threaded chat.
    const userMessage = latestUserMessage();
    if (userMessage) {
      window.requestAnimationFrame(() => {
        scrollConversationToMessage(userMessage, { smooth: true });
      });
    }
  }


  document.addEventListener('marksetgo:askmark-legacy-updated',()=>{
    if(!shell) return;
    syncSelection();
    syncLegacyResponse();
  });

  document.addEventListener('marksetgo:notebook-saved',()=>{
    if(!shell) return;
    const notebookPanel=$('[data-askmark-view-panel="notebook"]',shell);
    if(notebookPanel?.classList.contains('is-active')){
      const legacyNotebook=$('#mark-notebook-panel',legacyHost || document);
      if(legacyNotebook) $('[data-notebook-slot]',shell)?.appendChild(legacyNotebook);
    }
  });

  function syncSelection() {
    if (!shell) return;
    const text = getSelectionText();
    const card = $('[data-askmark-selection]', shell);
    const output = $('[data-askmark-selection-text]', shell);
    if (!card || !output) return;
    card.hidden = !text;
    output.textContent = text.length > 420 ? `${text.slice(0, 420)}…` : text;
  }

  function syncContext() {
    if (!shell) return;
    const context = getBookContext();
    const title = $('[data-askmark-title]', shell);
    const chapter = $('[data-askmark-chapter]', shell);
    if (title) title.textContent = context.title;
    if (chapter) chapter.textContent = context.chapter;
  }

  function activatePremiumView(view = 'chat') {
    $$('[data-askmark-view-panel]', shell).forEach((panel) => panel.classList.toggle('is-active', panel.dataset.askmarkViewPanel === view));
    shell.classList.toggle('askmark-secondary-open', view !== 'chat');

    if (view === 'notebook') {
      const legacyNotebook = $('#mark-notebook-panel', legacyHost);
      legacyHost?.querySelector('[data-mark-tab="notebook"]')?.click();
      if (legacyNotebook) $('[data-notebook-slot]', shell)?.appendChild(legacyNotebook);
    }
    if (view === 'tools') {
      const legacyTools = $('#mark-tools-panel', legacyHost);
      legacyHost?.querySelector('[data-mark-tab="tools"]')?.click();
      if (legacyTools) $('[data-tools-slot]', shell)?.appendChild(legacyTools);
    }
  }

  function activeWholeArticleConversation() {
    const context = window.MSGInvestorArticleContext;
    if (!context?.articleText) return null;
    if (String(context.articleText).trim().length < 40) return null;

    // A real user highlight deliberately takes priority over Analyze mode.
    if (context.highlightOverride) return null;

    return context;
  }

  function responseParagraphsHtml(value = '') {
    return String(value || '')
      .trim()
      .split(/\n{2,}/)
      .filter(Boolean)
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join('');
  }

  function renderWholeArticleFollowup(thinking, result = {}) {
    if (!thinking?.isConnected) return;

    const companion = companionConfig();
    const keyPoints = Array.isArray(result?.keyPoints) ? result.keyPoints : [];
    const cautions = Array.isArray(result?.cautions) ? result.cautions : [];

    thinking.classList.remove('is-thinking');
    thinking.innerHTML = `
      <img src="${escapeHtml(companion.avatar)}" alt="${escapeHtml(companion.name)}">
      <div>
        <span>${escapeHtml(companion.name)}</span>
        <div class="askmark-rich-response">
          <div class="mark-response-heading">
            <span>${escapeHtml(companion.ask)}</span>
            <strong>${escapeHtml(result?.heading || 'Whole-article answer')}</strong>
          </div>
          ${responseParagraphsHtml(result?.response || '')}
          ${keyPoints.length ? `
            <h4>Key points</h4>
            <ul>${keyPoints.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          ` : ''}
          ${cautions.length ? `
            <div class="mark-cautions">
              ${cautions.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>`;

    const userMessage = latestUserMessage();
    if (userMessage) {
      // Re-anchor after the response bubble expands. This keeps the question
      // visible at the top and lets the answer continue directly underneath.
      window.requestAnimationFrame(() => {
        scrollConversationToMessage(userMessage, { smooth: true });
      });
    }
  }

  async function runWholeArticleFollowup(question) {
    const context = activeWholeArticleConversation();
    if (!context || !question) return false;

    addUserMessage(question);
    const thinking = addThinkingMessage();
    const companion = companionConfig();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90000);

    try {
      const history = Array.isArray(context.history)
        ? context.history.slice(-8)
        : [];

      const response = await fetch('/api/read-anything/article-followup', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companion: companion.id,
          title: context.title || getBookContext().title || 'Current article',
          sourceUrl: context.sourceUrl || '',
          articleText: context.articleText,
          analysis: context.analysis || {},
          history,
          question
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
        { role: 'user', text: question },
        { role: 'assistant', text: String(result.response || '').trim() }
      );
      context.history = context.history.slice(-12);
      context.updatedAt = new Date().toISOString();

      renderWholeArticleFollowup(thinking, result);
      return true;
    } catch (error) {
      if (thinking?.isConnected) {
        thinking.classList.remove('is-thinking');
        const message = error?.name === 'AbortError'
          ? `${companion.name} took too long to answer. Please try again.`
          : error?.message || `${companion.name} could not answer that follow-up.`;

        const paragraph = thinking.querySelector('p');
        if (paragraph) {
          paragraph.className = 'status error';
          paragraph.textContent = message;
        }
      }
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }


  function runSelectionAction(action, question = '') {
    const panel = getLegacySelectionPanel();
    const text = getSelectionText();
    if (!text) {
      addUserMessage(question || `${action[0].toUpperCase()}${action.slice(1)} this passage.`);
      const thinking = addThinkingMessage();
      if (thinking) thinking.querySelector('p').textContent = 'Highlight a passage first, then choose an action or ask a question about it.';
      return;
    }

    addUserMessage(question || `${action[0].toUpperCase()}${action.slice(1)} this passage.`);
    addThinkingMessage();

    if (action === 'ask') {
      const input = panel?.querySelector('#mark-question');
      const form = panel?.querySelector('#mark-question-form');
      if (input && form) {
        input.value = question;
        form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    } else {
      panel?.querySelector(`[data-mark-action="${action}"]`)?.click();
    }
    setTimeout(syncLegacyResponse, 300);
  }

  async function runDocumentAction(action) {
    const api = transformApi();
    if (!api?.hasActiveDocument?.()) {
      addUserMessage(action === 'summary' ? 'Summarize this document.' : 'Make this document easier to read.');
      const thinking = addThinkingMessage();
      if (thinking) thinking.querySelector('p').textContent = 'Open an imported document first to use whole-document actions.';
      return;
    }
    addUserMessage(action === 'summary' ? 'Summarize this document.' : 'Make this document easier to read.');
    const thinking = addThinkingMessage();
    try {
      if (action === 'summary') await api.requestSummary('quick');
      else await api.makeReadable();
      if (thinking) thinking.querySelector('p').textContent = action === 'summary' ? 'I created a concise summary view for the document.' : 'I created a cleaner, more readable version of the document.';
      syncContext();
    } catch (error) {
      if (thinking) thinking.querySelector('p').textContent = error?.message || 'I could not complete that request.';
    }
  }


  function currentStudyPassage({ maxChars = 14000 } = {}) {
    const selected = getSelectionText();
    if (selected) return {
      title:getBookContext().title,
      passage:selected.slice(0, maxChars),
      source:'selection'
    };

    const current = window.MarkSetGoCurrentReaderDocument?.get?.();
    const text = String(current?.text || '').replace(/\s+/g,' ').trim();
    if (!text) return null;

    // No selection: use a bounded excerpt from the active document rather than
    // sending an entire large book to a study-tool request.
    return {
      title:String(current?.title || getBookContext().title || 'Current reading'),
      passage:text.slice(0, maxChars),
      source:'current-reading'
    };
  }

  function addStructuredMarkMessage(title, bodyHtml, className = '') {
    const conversation = $('[data-askmark-conversation]', shell);
    if (!conversation) return null;
    const id = `askmark-structured-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    conversation.insertAdjacentHTML('beforeend', `
      <article class="askmark-message mark-message ${className}" id="${id}">
        <img src="${companionAvatar()}" alt="${companionName()}">
        <div>
          <span>${escapeHtml(companionName())} · ${escapeHtml(title)}</span>
          <div class="askmark-rich-response askmark-study-output">${bodyHtml}</div>
        </div>
      </article>`);
    conversation.scrollTop = conversation.scrollHeight;
    return document.getElementById(id);
  }

  function renderFlashcardDeck(cards = [], title = '') {
    if (!cards.length) return addStructuredMarkMessage('Flash cards', '<p>I could not create useful cards from this reading.</p>');

    const message = addStructuredMarkMessage('Flash cards', `
      <div class="askmark-deck" data-flashcard-deck>
        <div class="askmark-deck-heading">
          <div><strong>${escapeHtml(title || 'Current reading')}</strong><small>Tap the card or use Flip to reveal the answer.</small></div>
          <span data-flashcard-count>1 / ${cards.length}</span>
        </div>
        <button class="askmark-flashcard" type="button" data-flashcard-card aria-label="Flip flash card">
          <span class="askmark-flashcard-inner">
            <span class="askmark-flashcard-face askmark-flashcard-front">
              <small data-flashcard-category></small>
              <strong data-flashcard-question></strong>
              <em>Tap to flip</em>
            </span>
            <span class="askmark-flashcard-face askmark-flashcard-back">
              <small>Answer</small>
              <strong data-flashcard-answer></strong>
              <em data-flashcard-hint></em>
            </span>
          </span>
        </button>
        <div class="askmark-deck-controls">
          <button type="button" class="secondary" data-flashcard-prev>← Previous</button>
          <button type="button" class="primary" data-flashcard-flip>Flip</button>
          <button type="button" class="secondary" data-flashcard-next>Next →</button>
        </div>
      </div>
    `, 'askmark-flashcard-message');

    if (!message) return;
    const deck=message.querySelector('[data-flashcard-deck]');
    const card=message.querySelector('[data-flashcard-card]');
    let index=0;

    const draw=()=>{
      const item=cards[index] || {};
      card.classList.remove('is-flipped');
      message.querySelector('[data-flashcard-count]').textContent=`${index+1} / ${cards.length}`;
      message.querySelector('[data-flashcard-category]').textContent=item.category || 'Review';
      message.querySelector('[data-flashcard-question]').textContent=item.front || '';
      message.querySelector('[data-flashcard-answer]').textContent=item.back || '';
      message.querySelector('[data-flashcard-hint]').textContent=item.hint || '';
      message.querySelector('[data-flashcard-prev]').disabled=index===0;
      message.querySelector('[data-flashcard-next]').disabled=index===cards.length-1;
    };
    const flip=()=>card.classList.toggle('is-flipped');
    card.addEventListener('click',flip);
    message.querySelector('[data-flashcard-flip]').addEventListener('click',flip);
    message.querySelector('[data-flashcard-prev]').addEventListener('click',()=>{ if(index>0){index-=1;draw();} });
    message.querySelector('[data-flashcard-next]').addEventListener('click',()=>{ if(index<cards.length-1){index+=1;draw();} });
    draw();
  }

  function renderMemoryTools(tools = [], title = '') {
    if (!tools.length) return addStructuredMarkMessage('Memory tools', '<p>I could not create useful memory anchors from this reading.</p>');
    addStructuredMarkMessage('Memory tools', `
      <div class="askmark-memory-tools">
        <div class="askmark-memory-heading">
          <strong>${escapeHtml(title || 'Current reading')}</strong>
          <small>Use these as recall anchors—not as substitutes for understanding the text.</small>
        </div>
        ${tools.map((item,index)=>`
          <details class="askmark-memory-card" ${index===0?'open':''}>
            <summary>
              <span class="askmark-memory-number">${index+1}</span>
              <span><strong>${escapeHtml(item.label || 'Memory anchor')}</strong><small>${escapeHtml(item.target || '')}</small></span>
              <span aria-hidden="true">›</span>
            </summary>
            <div class="askmark-memory-body">
              <div><small>Remember</small><p>${escapeHtml(item.remember || '')}</p></div>
              <div><small>Anchor</small><p>${escapeHtml(item.anchor || '')}</p></div>
              <div><small>Why it helps</small><p>${escapeHtml(item.why || '')}</p></div>
              <div class="askmark-memory-test"><small>Self-test</small><p>${escapeHtml(item.test || '')}</p></div>
            </div>
          </details>`).join('')}
      </div>
    `, 'askmark-memory-message');
  }

  async function runStudyTool(tool) {
    const menu=$('[data-askmark-more-menu]',shell);
    if(menu) menu.hidden=true;

    const context=currentStudyPassage();
    const label=tool==='flashcards' ? 'Create visual flash cards.' : 'Create memory tools.';
    addUserMessage(label);

    if(!context?.passage){
      const thinking=addThinkingMessage();
      if(thinking) thinking.querySelector('p').textContent='Open a book or highlight a passage first.';
      return;
    }

    const thinking=addThinkingMessage();
    try {
      const endpoint=tool==='flashcards' ? '/api/flashcards' : '/api/memory-tools';
      const response=await fetch(endpoint,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({title:context.title,passage:context.passage})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(payload.error || payload.detail || `HTTP ${response.status}`);

      thinking?.remove();
      if(tool==='flashcards') renderFlashcardDeck(payload.cards || [],context.title);
      else renderMemoryTools(payload.tools || [],context.title);
    } catch(error) {
      if(thinking) {
        thinking.classList.remove('is-thinking');
        thinking.querySelector('p').textContent=error?.message || 'I could not create that study tool.';
      }
    }
  }


  function installAskMarkScrollIsolation() {
    if (!shell || shell.dataset.askmarkScrollIsolation === '1') return;
    shell.dataset.askmarkScrollIsolation='1';

    // Do not preventDefault: allow the browser to scroll .askmark-view normally,
    // including native middle-button auto-scroll. Only stop the Reader/page
    // from receiving the same wheel gesture.
    shell.addEventListener('wheel',(event)=>{
      // Native scrolling happens on the actual Ask Mark / Reader Tools
      // scroller first. We only stop the same gesture from bubbling into
      // Reader-level wheel/page navigation handlers.
      event.stopPropagation();
    },{passive:true});

    shell.addEventListener('mousedown',(event)=>{
      // Preserve the browser's native middle-button auto-scroll while keeping
      // the Reader beneath Ask Mark from seeing the middle click.
      if(event.button===1) event.stopPropagation();
    });
  }

  function bindPremiumEvents() {
    installAskMarkScrollIsolation();
    $('[data-askmark-close]', shell)?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const layout = document.getElementById('reader-layout');
      if (!layout) return;

      // Close Ask Mark directly instead of routing through the toolbar toggle.
      // This avoids toggle-state mismatches that can make the X appear unresponsive.
      layout.classList.add('word-panel-hidden');

      const markButton = document.getElementById('toggle-mark-panel');
      const toolsButton = document.getElementById('toggle-word-panel');

      markButton?.setAttribute('aria-pressed', 'false');
      toolsButton?.setAttribute('aria-pressed', 'false');
      markButton?.classList.add('pane-closed');
      toolsButton?.classList.add('pane-closed');
    });
    $('[data-askmark-refresh]', shell)?.addEventListener('click', syncContext);
    $$('[data-askmark-view]', shell).forEach((button) => button.addEventListener('click', () => activatePremiumView(button.dataset.askmarkView)));
    $$('[data-askmark-back]', shell).forEach((button) => button.addEventListener('click', () => activatePremiumView('chat')));

    $$('[data-premium-mark-action]', shell).forEach((button) => button.addEventListener('click', () => {
      $('[data-askmark-more-menu]', shell).hidden = true;
      runSelectionAction(button.dataset.premiumMarkAction);
    }));
    $$('[data-document-action]', shell).forEach((button) => button.addEventListener('click', () => {
      $('[data-askmark-more-menu]', shell).hidden = true;
      runDocumentAction(button.dataset.documentAction);
    }));
    $$('[data-format-level]', shell).forEach((button) => button.addEventListener('click', () => {
      $$('[data-format-level]', shell).forEach((item) => item.classList.toggle('is-selected', item === button));
    }));
    $('[data-askmark-format-apply]', shell)?.addEventListener('click', async () => {
      const status = $('[data-askmark-format-status]', shell);
      try {
        const api = transformApi();
        if (!api?.applyCleanup) throw new Error('The formatter is not available.');
        const level = $('[data-format-level].is-selected', shell)?.dataset.formatLevel || 'standard';
        const scope = shell.querySelector('input[name="askmark-format-scope"]:checked')?.value || 'document';
        const selected = scope === 'selection' ? getSelectionText() : '';
        const selectionRange = scope === 'selection'
          ? window.MarkSetGoCurrentReaderDocument?.getSelectionRange?.()
          : null;

        if (scope === 'selection') {
          if (!selected && !selectionRange?.text) throw new Error('Highlight a passage first, or choose Entire document.');
          // The Reader's canonical word-index range is the primary locator.
          // Displayed selection text is retained only as a compatibility fallback.
        } else if (!api.hasActiveDocument?.()) {
          throw new Error('The current Reader text could not be accessed for whole-document formatting.');
        }

        if (status) status.textContent = level === 'deep' ? 'AI Deep Clean is reviewing the text…' : 'Formatting text…';
        const report = await api.applyCleanup(level, scope, selected, selectionRange);
        const fixes = Object.entries(report || {}).filter(([key, value]) => key !== 'level' && Number(value) > 0).reduce((sum, [, value]) => sum + Number(value), 0);
        if (status) status.textContent = `${level === 'deep' ? 'AI Deep Clean' : level[0].toUpperCase() + level.slice(1)} applied${fixes ? ` · ${fixes} cleanup actions` : ''}. Original preserved.`;
        syncContext();
      } catch (error) { if (status) status.textContent = error?.message || 'Formatting could not be completed.'; }
    });
    $('[data-askmark-format-original]', shell)?.addEventListener('click', () => {
      const status = $('[data-askmark-format-status]', shell);
      try { transformApi()?.restoreOriginal?.(); if (status) status.textContent = 'Original text restored.'; }
      catch (error) { if (status) status.textContent = error?.message || 'Original text could not be restored.'; }
    });

    $('[data-askmark-comprehension]', shell)?.addEventListener('click', () => {
      $('[data-askmark-more-menu]', shell)?.setAttribute('hidden', '');
      window.MarkSetGoStartComprehension?.();
    });

    $$('[data-askmark-tool]', shell).forEach((button) => button.addEventListener('click', () => {
      runStudyTool(button.dataset.askmarkTool);
    }));

    $$('[data-askmark-prompt]', shell).forEach((button) => button.addEventListener('click', () => {
      $('[data-askmark-more-menu]', shell).hidden = true;
      runSelectionAction('ask', button.dataset.askmarkPrompt);
    }));

    const input = $('[data-askmark-input]', shell);
    const send = () => {
      const value = input?.value.trim();
      if (!value) return;
      input.value = '';
      input.style.height = '';

      // Analyze owns a whole-article conversation. Route follow-up questions
      // directly from THIS threaded chat handler to the whole-article endpoint.
      // If the reader highlighted a real passage, highlightOverride is true and
      // the normal passage-selection Ask flow remains in control.
      if (activeWholeArticleConversation()) {
        void runWholeArticleFollowup(value);
        return;
      }

      runSelectionAction('ask', value);
    };
    $('[data-askmark-send]', shell)?.addEventListener('click', send);
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send();
      }
    });
    input?.addEventListener('input', () => {
      const composer = $('[data-askmark-composer]', shell);
      if (composer?.dataset.userResized === '1') return;
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
    });

    const composer = $('[data-askmark-composer]', shell);
    const resizeHandle = $('[data-askmark-composer-resize]', shell);
    resizeHandle?.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = input.getBoundingClientRect().height;
      const panelHeight = shell.getBoundingClientRect().height;
      const minHeight = 43;
      const maxHeight = Math.max(140, Math.floor(panelHeight * 0.45));
      composer.dataset.userResized = '1';
      resizeHandle.setPointerCapture?.(event.pointerId);

      const move = (moveEvent) => {
        const nextHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + (startY - moveEvent.clientY)));
        input.style.height = `${nextHeight}px`;
      };
      const stop = () => {
        resizeHandle.removeEventListener('pointermove', move);
        resizeHandle.removeEventListener('pointerup', stop);
        resizeHandle.removeEventListener('pointercancel', stop);
      };
      resizeHandle.addEventListener('pointermove', move);
      resizeHandle.addEventListener('pointerup', stop);
      resizeHandle.addEventListener('pointercancel', stop);
    });

    $('[data-askmark-more]', shell)?.addEventListener('click', () => {
      const menu = $('[data-askmark-more-menu]', shell);
      menu.hidden = !menu.hidden;
    });
    $('[data-clear-selection]', shell)?.addEventListener('click', () => {
      $('[data-askmark-selection]', shell).hidden = true;
    });
  }

  function configureTopToolbar() {
    const controls = $('.reader-pane-controls');
    if (!controls) return false;
    controls.classList.add('ask-mark-toolbar');
    const contents = $('#toggle-navigation-pane', controls);
    const readerTools = $('#toggle-word-panel', controls);
    const ask = $('#toggle-mark-panel', controls);
    if (contents) contents.innerHTML = '<span aria-hidden="true">☰</span> Contents';
    if (readerTools) {
      readerTools.hidden = false;
      readerTools.innerHTML = '<span aria-hidden="true">⚙</span> Reader';
    }
    if (ask) {
      const companion = companionConfig();
      ask.hidden = false;
      ask.innerHTML = `<img src="${escapeHtml(companion.avatar)}" alt=""> <span>${escapeHtml(companion.ask)}</span>`;
      ask.classList.add('ask-mark-primary-toggle');
    }
    $('#read-anything-format-control')?.remove();
    return Boolean(ask);
  }

  function configureShell() {
    const candidate = $('.reader-control-shell.mark-shell');
    if (!candidate) return false;
    if (candidate.dataset.premiumConfigured === '1' && candidate.querySelector('[data-askmark-premium]') && candidate.querySelector('[data-askmark-view="format"]')) {
      shell = candidate;
      syncSelection();
      return true;
    }
    // The reader can rebuild the contents of the same shell when a different document loads.
    // In that case the dataset flag survives even though Ask Mark's premium/Format UI was removed.
    if (candidate.dataset.premiumConfigured === '1') delete candidate.dataset.premiumConfigured;

    shell = candidate;
    shell.dataset.premiumConfigured = '1';
    legacyHost = document.createElement('div');
    legacyHost.className = 'askmark-legacy-host';
    legacyHost.hidden = true;
    while (shell.firstChild) legacyHost.appendChild(shell.firstChild);
    shell.appendChild(legacyHost);
    shell.insertAdjacentHTML('beforeend', premiumMarkup());
    bindPremiumEvents();

    syncSelection();
    syncContext();
    window.setTimeout(()=>refreshMarkProgress(),80);
    return true;
  }

  function install() {
    const toolbarReady = configureTopToolbar();
    const shellReady = configureShell();
    return toolbarReady && shellReady;
  }

  function retryInstall() {
    installAttempts += 1;
    if (!install() && installAttempts < 180) requestAnimationFrame(retryInstall);
  }

  document.addEventListener('marksetgo:document-available', () => {
    installAttempts = 0;
    requestAnimationFrame(retryInstall);
    window.setTimeout(()=>refreshMarkProgress(),220);
  });
  document.addEventListener('marksetgo:goals-updated',()=>window.setTimeout(()=>refreshMarkProgress({force:true}),80));
  document.addEventListener('marksetgo:mark-progress-update',(event)=>{
    if(event?.detail?.message) addMarkProgressMessage(event.detail,{force:true});
    else refreshMarkProgress({force:true});
  });
  document.addEventListener('selectionchange', () => setTimeout(syncSelection, 60));
  document.addEventListener('marksetgo:transform-state', syncContext);

  requestAnimationFrame(retryInstall);
  [400, 900, 1800, 3200].forEach((delay) => setTimeout(install, delay));

  document.addEventListener('marksetgo:auth-changed', refreshPersonalGreeting);
  window.addEventListener('msg:companion-changed', () => {
    if (!shell?.isConnected) return;
    const c = companionConfig();
    const avatar = shell.querySelector('.askmark-avatar');
    if (avatar) { avatar.src = c.avatar; avatar.alt = c.name; }
    const heading = shell.querySelector('.askmark-brand-copy h2');
    if (heading) heading.textContent = c.ask;
    shell.querySelectorAll('.askmark-message.mark-message').forEach((message) => {
      const img = message.querySelector(':scope > img');
      if (img) { img.src = c.avatar; img.alt = c.name; }
      const name = message.querySelector(':scope > div > span');
      if (name && /^(Mark|Beth|Chad|Scott)(\s*·.*)?$/.test(name.textContent.trim())) {
        name.textContent = name.textContent.includes('·') ? `${c.name} · ${name.textContent.split('·').slice(1).join('·').trim()}` : c.name;
      }
      message.querySelectorAll('.mark-response-heading span').forEach((node) => { node.textContent = c.ask; });
    });
    const notebook = shell.querySelector('.askmark-subhead h3');
    if (notebook && /Notebook/.test(notebook.textContent)) notebook.textContent = companionNotebook();
  });

})();
