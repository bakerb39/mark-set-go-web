(() => {
  'use strict';

  const app = document.getElementById('app');
  if (!app) return;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const AVATAR = '/assets/ask-mark/ask-mark-avatar.png';
  const transformApi = () => window.MarkSetGoReadAnything;

  let shell;
  let legacyHost;
  let selectionObserver;
  let installCount = 0;
  let stateTimer;
  let currentState = 'reading';

  const ACTIONS = [
    ['explain', '✦', 'Explain'],
    ['summarize', '☰', 'Summarize'],
    ['analyze', '◇', 'Analyze'],
    ['simplify', 'Aa', 'Simplify'],
    ['context', '⌂', 'Context'],
    ['related', '∞', 'Compare']
  ];

  const PAGE_GUIDANCE = {
    library: ['Your library is ready.', 'Choose a book and I’ll meet you in the reader.'],
    browse: ['Looking for your next book?', 'I can help you choose by subject, difficulty, or time available.'],
    progress: ['You’re building momentum.', 'Review your pace, consistency, and comprehension here.'],
    vocabulary: ['Every word becomes part of your toolkit.', 'Review saved words or ask me to quiz you.'],
    home: ['Good to see you.', 'Continue where you left off, or begin something new.'],
    default: ['I’m here when you need me.', 'Open a book and ask me anything about what you’re reading.']
  };

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function getBookContext() {
    const title = $('#reader-title')?.textContent?.trim() || $('.reader-title')?.textContent?.trim() || $('main h1')?.textContent?.trim() || 'Your current reading';
    const chapter = $('.book-page-chapter')?.textContent?.trim() || $('[data-current-chapter]')?.textContent?.trim() || $('.reader-status')?.textContent?.trim() || 'Ready when you are';
    return { title, chapter };
  }

  function legacySelectionPanel() { return $('#mark-selection-panel', legacyHost || shell || document); }
  function selectionText() { return legacySelectionPanel()?.querySelector('.mark-selection-card blockquote')?.textContent?.trim() || ''; }
  function readerFirstName() {
    const account = window.MarkSetGoAuth?.session?.account || {};
    const value = window.MarkSetGoAuth?.getFirstName?.() || account.firstName || account.first_name || account.displayName || account.display_name || '';
    return String(value).trim().split(/\s+/)[0] || '';
  }
  function greeting() {
    const h = new Date().getHours();
    const salutation = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const firstName = readerFirstName();
    return `${salutation}${firstName ? `, ${firstName}` : ''}`;
  }

  function sceneMarkup() {
    const ctx = getBookContext();
    return `
      <div class="mark-study" data-mark-study data-mark-state="reading">
        <header class="mark-study-topbar">
          <div class="mark-study-brand"><span class="mark-study-monogram">M</span><div><small>Welcome to</small><strong>Mark’s Study</strong></div></div>
          <div class="mark-study-top-actions">
            <button data-mark-voice title="Read Mark’s last response aloud" aria-label="Read response aloud">◖</button>
            <button data-mark-view="notebook" title="Mark’s Notebook" aria-label="Open notebook">✎</button>
            <button data-mark-view="tools" title="Reader settings" aria-label="Open reader settings">⚙</button>
            <button data-mark-close title="Close Ask Mark" aria-label="Close Ask Mark">×</button>
          </div>
        </header>

        <main class="mark-study-main">
          <section class="mark-study-view is-active" data-mark-panel="chat">
            <div class="mark-library-scene" aria-label="Mark in his library">
              <div class="study-window"><span></span><i></i></div>
              <div class="study-shelf shelf-left">${'<b></b>'.repeat(12)}</div>
              <div class="study-shelf shelf-right">${'<b></b>'.repeat(10)}</div>
              <div class="study-lamp"><i></i><b></b></div>
              <div class="study-globe"><i></i></div>
              <div class="study-desk"></div>
              <div class="mark-character" data-mark-character>
                <div class="mark-aura"></div>
                <img src="${AVATAR}" alt="Mark, your reading companion">
                <span class="mark-blink"></span>
                <span class="mark-speaking-ring"></span>
                <div class="mark-book"><i></i><b></b></div>
              </div>
              <div class="mark-scene-copy">
                <span class="mark-scene-eyebrow">Your reading companion</span>
                <h2>Ask Mark</h2>
                <p data-mark-scene-line data-mark-personal-greeting>${greeting()}. I was just reading. What shall we explore?</p>
              </div>
              <button class="mark-enter-chat" data-mark-focus-input>Start a conversation <span>→</span></button>
            </div>

            <div class="mark-reading-context">
              <span class="context-icon">▤</span>
              <div><small>Now reading</small><strong data-mark-title>${escapeHtml(ctx.title)}</strong><span data-mark-chapter>${escapeHtml(ctx.chapter)}</span></div>
              <button data-mark-refresh title="Refresh reading context">↻</button>
            </div>

            <div class="mark-conversation" data-mark-conversation aria-live="polite">
              <article class="mark-chat-row is-mark">
                <img src="${AVATAR}" alt="">
                <div><small>Mark</small><p><strong data-mark-personal-greeting>${greeting()}.</strong> Highlight a passage or ask me about the book. I can explain, summarize, compare ideas, quiz you, or help save an insight.</p></div>
              </article>
            </div>

            <section class="mark-selection-preview" data-mark-selection hidden>
              <div><small>Selected passage</small><button data-mark-clear-selection>×</button></div>
              <blockquote data-mark-selection-text></blockquote>
            </section>

            <div class="mark-action-ribbon" aria-label="Quick actions">
              ${ACTIONS.map(([a,i,l]) => `<button data-mark-action="${a}"><span>${i}</span>${l}</button>`).join('')}
            </div>
          </section>

          <section class="mark-study-view" data-mark-panel="notebook">
            <div class="mark-subview-head"><button data-mark-back>←</button><div><small>Your saved thinking</small><h3>Mark’s Notebook</h3></div></div>
            <div class="mark-legacy-slot" data-mark-notebook-slot></div>
          </section>

          <section class="mark-study-view" data-mark-panel="tools">
            <div class="mark-subview-head"><button data-mark-back>←</button><div><small>Reading preferences</small><h3>Reader Settings</h3></div></div>
            <div class="mark-legacy-slot" data-mark-tools-slot></div>
          </section>
        </main>

        <footer class="mark-composer">
          <button class="mark-plus" data-mark-more aria-label="More actions">＋</button>
          <label><textarea data-mark-input rows="1" placeholder=""></textarea></label>
          <button class="mark-send" data-mark-send aria-label="Send question">➜</button>
          <div class="mark-more-menu" data-mark-more-menu hidden>
            <button data-mark-action="translate">Translate selected passage</button>
            <button data-mark-action="save">Save selected passage</button>
            <button data-document-action="summary">Summarize this document</button>
            <button data-document-action="readable">Make this document easier to read</button>
          </div>
        </footer>
      </div>`;
  }

  function setMarkState(next, duration = 0) {
    if (!shell) return;
    clearTimeout(stateTimer);
    currentState = next;
    const study = $('[data-mark-study]', shell);
    if (study) study.dataset.markState = next;
    if (duration) stateTimer = setTimeout(() => setMarkState('attentive'), duration);
  }

  function lookUpSequence() {
    setMarkState('reading');
    setTimeout(() => setMarkState('looking'), 260);
    setTimeout(() => setMarkState('attentive'), 1050);
  }

  function addUser(text) {
    const c = $('[data-mark-conversation]', shell);
    if (!c || !text) return;
    c.insertAdjacentHTML('beforeend', `<article class="mark-chat-row is-user"><div><small>You</small><p>${escapeHtml(text)}</p></div></article>`);
    c.scrollTop = c.scrollHeight;
  }

  function addThinking() {
    const c = $('[data-mark-conversation]', shell);
    if (!c) return null;
    const id = `mark-thinking-${Date.now()}`;
    c.insertAdjacentHTML('beforeend', `<article id="${id}" class="mark-chat-row is-mark is-thinking"><img src="${AVATAR}" alt=""><div><small>Mark</small><p><i></i><i></i><i></i></p></div></article>`);
    c.scrollTop = c.scrollHeight;
    setMarkState('thinking');
    return document.getElementById(id);
  }

  function syncResponse() {
    const response = legacySelectionPanel()?.querySelector('#mark-response');
    if (!response || response.hidden || !response.textContent.trim()) return;
    const thinking = $('.mark-chat-row.is-thinking', shell);
    const clone = response.cloneNode(true);
    clone.querySelectorAll('button').forEach(b => b.classList.add('mark-inline-action'));
    const html = `<article class="mark-chat-row is-mark"><img src="${AVATAR}" alt=""><div><small>Mark</small><div class="mark-rich-response">${clone.innerHTML}</div></div></article>`;
    if (thinking) thinking.outerHTML = html; else $('[data-mark-conversation]', shell)?.insertAdjacentHTML('beforeend', html);
    response.hidden = true;
    setMarkState('speaking', 2400);
    const c = $('[data-mark-conversation]', shell); if (c) c.scrollTop = c.scrollHeight;
  }

  function syncSelection() {
    if (!shell) return;
    const text = selectionText();
    const card = $('[data-mark-selection]', shell);
    const out = $('[data-mark-selection-text]', shell);
    if (!card || !out) return;
    card.hidden = !text;
    out.textContent = text.length > 360 ? `${text.slice(0,360)}…` : text;
  }

  function syncContext() {
    if (!shell) return;
    const c = getBookContext();
    $('[data-mark-title]', shell).textContent = c.title;
    $('[data-mark-chapter]', shell).textContent = c.chapter;
  }

  function showView(name = 'chat') {
    $$('[data-mark-panel]', shell).forEach(p => p.classList.toggle('is-active', p.dataset.markPanel === name));
    if (name === 'notebook') {
      legacyHost?.querySelector('[data-mark-tab="notebook"]')?.click();
      const panel = $('#mark-notebook-panel', legacyHost); if (panel) $('[data-mark-notebook-slot]', shell)?.appendChild(panel);
    }
    if (name === 'tools') {
      legacyHost?.querySelector('[data-mark-tab="tools"]')?.click();
      const panel = $('#mark-tools-panel', legacyHost); if (panel) $('[data-mark-tools-slot]', shell)?.appendChild(panel);
    }
  }

  function runAction(action, question='') {
    const panel = legacySelectionPanel();
    const text = selectionText();
    addUser(question || `${action[0].toUpperCase()}${action.slice(1)} this passage.`);
    if (!text && action !== 'ask') {
      const t = addThinking(); if (t) t.querySelector('p').textContent = 'Highlight a passage first, then choose this action.';
      setMarkState('attentive', 1200); return;
    }
    addThinking();
    if (action === 'ask') {
      const input = panel?.querySelector('#mark-question');
      const form = panel?.querySelector('#mark-question-form');
      if (input && form) { input.value = question; form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); }
    } else panel?.querySelector(`[data-mark-action="${action}"]`)?.click();
    setTimeout(syncResponse, 350);
  }

  async function runDocumentAction(action) {
    const api = transformApi();
    addUser(action === 'summary' ? 'Summarize this document.' : 'Make this document easier to read.');
    const t = addThinking();
    if (!api?.hasActiveDocument?.()) { if (t) t.querySelector('p').textContent = 'Open an imported document first.'; setMarkState('attentive',1200); return; }
    try {
      if (action === 'summary') await api.requestSummary('quick'); else await api.makeReadable();
      if (t) t.querySelector('p').textContent = action === 'summary' ? 'I created a concise summary view.' : 'I created a cleaner reading view.';
      setMarkState('speaking',1800);
    } catch (e) { if (t) t.querySelector('p').textContent = e?.message || 'I could not complete that request.'; setMarkState('attentive'); }
  }

  function speakLast() {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const messages = $$('.mark-chat-row.is-mark p, .mark-rich-response', shell);
    const text = messages.at(-1)?.textContent?.trim();
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text); u.rate = .95; u.pitch = .95;
    u.onstart = () => setMarkState('speaking');
    u.onend = () => setMarkState('attentive');
    window.speechSynthesis.speak(u);
  }

  function bind() {
    $('[data-mark-close]', shell)?.addEventListener('click', () => $('#toggle-mark-panel')?.click());
    $('[data-mark-refresh]', shell)?.addEventListener('click', syncContext);
    $('[data-mark-voice]', shell)?.addEventListener('click', speakLast);
    $$('[data-mark-view]', shell).forEach(b => b.addEventListener('click', () => showView(b.dataset.markView)));
    $$('[data-mark-back]', shell).forEach(b => b.addEventListener('click', () => showView('chat')));
    $$('[data-mark-action]', shell).forEach(b => b.addEventListener('click', () => { $('[data-mark-more-menu]',shell).hidden=true; runAction(b.dataset.markAction); }));
    $$('[data-document-action]', shell).forEach(b => b.addEventListener('click', () => { $('[data-mark-more-menu]',shell).hidden=true; runDocumentAction(b.dataset.documentAction); }));
    $('[data-mark-focus-input]', shell)?.addEventListener('click', () => { $('[data-mark-input]',shell)?.focus(); setMarkState('attentive'); });
    $('[data-mark-clear-selection]', shell)?.addEventListener('click', () => $('[data-mark-selection]',shell).hidden=true);
    $('[data-mark-more]', shell)?.addEventListener('click', () => { const m=$('[data-mark-more-menu]',shell); m.hidden=!m.hidden; });
    const input = $('[data-mark-input]', shell);
    const send = () => { const v=input?.value.trim(); if (!v) return; input.value=''; input.style.height=''; runAction('ask',v); };
    $('[data-mark-send]', shell)?.addEventListener('click', send);
    input?.addEventListener('focus', () => setMarkState('listening'));
    input?.addEventListener('blur', () => { if (currentState==='listening') setMarkState('attentive'); });
    input?.addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();} });
    input?.addEventListener('input', () => { input.style.height='auto'; input.style.height=`${Math.min(input.scrollHeight,140)}px`; });
  }

  function configureToolbar() {
    const controls = $('.reader-pane-controls'); if (!controls) return false;
    controls.classList.add('mark-study-toolbar');
    const ask = $('#toggle-mark-panel', controls);
    if (ask) { ask.hidden=false; ask.innerHTML=`<img src="${AVATAR}" alt=""><span>Ask Mark</span>`; ask.classList.add('mark-study-toggle'); }
    return Boolean(ask);
  }

  function configureShell() {
    const candidate = $('.reader-control-shell.mark-shell'); if (!candidate) return false;
    if (candidate.dataset.studyConfigured==='1') { shell=candidate; return true; }
    shell=candidate; shell.dataset.studyConfigured='1';
    legacyHost=document.createElement('div'); legacyHost.className='mark-study-legacy-host'; legacyHost.hidden=true;
    while(shell.firstChild) legacyHost.appendChild(shell.firstChild);
    shell.appendChild(legacyHost); shell.insertAdjacentHTML('beforeend',sceneMarkup()); bind();
    const legacy = legacySelectionPanel();
    if (legacy) { selectionObserver?.disconnect(); selectionObserver=new MutationObserver(()=>{syncSelection();syncResponse();}); selectionObserver.observe(legacy,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']}); }
    syncSelection(); syncContext(); lookUpSequence();
    return true;
  }

  function detectPageKind() {
    const text = `${app.className} ${app.textContent.slice(0,500)}`.toLowerCase();
    if (text.includes('my library') || text.includes('your library')) return 'library';
    if (text.includes('browse libraries') || text.includes('discover')) return 'browse';
    if (text.includes('reading progress') || text.includes('insights')) return 'progress';
    if (text.includes('vocabulary')) return 'vocabulary';
    if (text.includes('continue reading') || text.includes('quick actions')) return 'home';
    return 'default';
  }

  function installPageGuide() {
    if ($('#reader-layout')) { $('.mark-page-guide')?.remove(); return; }
    const kind=detectPageKind(); const [title,copy]=PAGE_GUIDANCE[kind]||PAGE_GUIDANCE.default;
    let guide=$('.mark-page-guide');
    if (!guide) {
      guide=document.createElement('aside'); guide.className='mark-page-guide';
      guide.innerHTML=`<button class="mark-page-guide-close" aria-label="Dismiss">×</button><img src="${AVATAR}" alt="Mark"><div><small>Mark says</small><strong></strong><p></p><button data-page-guide-open>Ask Mark <span>→</span></button></div>`;
      document.body.appendChild(guide);
      guide.querySelector('.mark-page-guide-close').addEventListener('click',()=>guide.classList.add('is-dismissed'));
      guide.querySelector('[data-page-guide-open]').addEventListener('click',()=>document.querySelector('[data-action="ai-center"]')?.click());
    }
    guide.dataset.kind=kind; guide.querySelector('strong').textContent=title; guide.querySelector('p').textContent=copy;
    guide.classList.remove('is-dismissed');
  }

  function install() { const ready=configureToolbar()&&configureShell(); installPageGuide(); return ready; }
  function retry() { installCount++; if(!install()&&installCount<240) requestAnimationFrame(retry); }

  const appObserver=new MutationObserver(()=>{ clearTimeout(appObserver._t); appObserver._t=setTimeout(installPageGuide,120); });
  appObserver.observe(app,{childList:true,subtree:false});
  document.addEventListener('selectionchange',()=>setTimeout(syncSelection,60));
  document.addEventListener('marksetgo:document-available',()=>{installCount=0;requestAnimationFrame(retry);});
  document.addEventListener('marksetgo:transform-state',syncContext);
  requestAnimationFrame(retry); [400,900,1800,3200].forEach(d=>setTimeout(install,d));

  document.addEventListener('marksetgo:auth-changed', () => {
    document.querySelectorAll('[data-mark-personal-greeting]').forEach((node) => {
      if (node.matches('strong')) node.textContent = `${greeting()}.`;
      else node.textContent = `${greeting()}. I was just reading. What shall we explore?`;
    });
  });
})();