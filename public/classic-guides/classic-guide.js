
(() => {
  'use strict';
  const host = document.querySelector('#classic-guide-app');
  if (!host) return;
  const src = host.dataset.guideSrc;

  const esc = (v='') => String(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const storageKey = (id, type) => `msg:classic-guide:${id}:${type}`;

  function sectionAsk(section, guide) {
    return `I'm reading ${guide.title} by ${guide.author}. Help me think more deeply about the section "${section.title}". Focus on the guide's main question: ${section.intro || section.takeaway || 'Explain what matters most here.'} Ask me one question at the end that tests whether I understand the issue rather than just remember facts.`;
  }

  function askBox(section, guide) {
    return `<div class="cg-ask"><strong>Ask Mark About This Section</strong>
      <div class="cg-ask-actions">
        <button class="cg-small-btn" data-ask-section="${esc(section.id)}">Discuss this section</button>
        <button class="cg-small-btn" data-copy-question="${esc(section.id)}">Copy a discussion prompt</button>
      </div>
    </div>`;
  }

  function renderCharacters(guide) {
    return `<div class="cg-card-grid">${guide.characters.map(c => `<article class="cg-card"><small>${esc(c.role)}</small><h3>${esc(c.name)}</h3><p>${esc(c.description)}</p></article>`).join('')}</div>`;
  }

  function renderBookGuide(guide) {
    return `<div class="cg-book-list">${guide.bookGuide.map(b => `<article class="cg-book"><div class="cg-book-num">Book ${b.book}</div><h3>${esc(b.title)}</h3><p>${esc(b.summary)}</p><div class="cg-watch"><strong>Watch for:</strong> ${esc(b.watch)}</div></article>`).join('')}</div>`;
  }

  function renderGreatIdeas(guide) {
    return `<div>${guide.greatIdeas.map(i => `<article class="cg-idea-panel"><h3>${esc(i.name)}</h3><p>${esc(i.summary)}</p><div class="cg-idea-questions">${i.questions.map(q => `<div>• ${esc(q)}</div>`).join('')}</div><div class="cg-idea-connections"><strong>Continue the conversation:</strong> ${i.connections.map(esc).join(' → ')}</div></article>`).join('')}</div>`;
  }

  function renderSectionBody(section, guide) {
    if (section.special === 'characters') return renderCharacters(guide);
    if (section.special === 'bookGuide') return renderBookGuide(guide);
    if (section.special === 'greatIdeas') return renderGreatIdeas(guide);
    if (section.bullets) return `<div class="cg-bullet-list">${section.bullets.map(x => `<article class="cg-info"><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></article>`).join('')}</div>`;
    if (section.questions) return `<div class="cg-question-list">${section.questions.map(q => `<div class="cg-question">${esc(q)}</div>`).join('')}</div>`;
    if (section.connections) return `<div class="cg-connections">${section.connections.map(x => `<article class="cg-info"><h3>${esc(x.work)}</h3><p>${esc(x.link)}</p></article>`).join('')}</div>`;
    if (section.debates) return `<div class="cg-debates">${section.debates.map(x => `<article class="cg-info"><h3>${esc(x.title)}</h3><p>${esc(x.sides)}</p></article>`).join('')}</div>`;
    return (section.paragraphs || []).map(p => `<p>${esc(p)}</p>`).join('');
  }

  function renderGuideTab(guide) {
    return guide.sections.map((s, index) => `<section class="cg-section" id="section-${esc(s.id)}">
      <div class="cg-section-num">${index + 1} of ${guide.sections.length}</div>
      <h2>${esc(s.title)}</h2>
      <p class="cg-section-intro">${esc(s.intro || '')}</p>
      ${renderSectionBody(s, guide)}
      ${s.takeaway ? `<div class="cg-takeaway"><strong>Key idea to remember:</strong> ${esc(s.takeaway)}</div>` : ''}
      ${askBox(s, guide)}
    </section>`).join('');
  }

  function renderKeyIdeas(guide) {
    return `<div class="cg-tab-panel"><h2 class="cg-panel-title">Key Ideas</h2><p class="cg-panel-lead">The Iliad becomes most useful for syntopical reading when each idea is treated as a question rather than a tag.</p>${renderGreatIdeas(guide)}</div>`;
  }

  function renderVisuals(guide) {
    return `<div class="cg-tab-panel"><h2 class="cg-panel-title">Images & Visual Study</h2><p class="cg-panel-lead">These diagrams are study aids—not reconstructions. They help you see the poem’s architecture and relationships at a glance.</p>
      <div class="cg-visual-grid">
        <article class="cg-visual"><h3>The Iliad’s Emotional Arc</h3><p>From wounded honor to shared mortality.</p><div class="cg-arc">
          ${['Rage','Absence','Crisis','Loss','Vengeance','Pity'].map(x => `<div class="cg-arc-step"><div class="cg-arc-bar"></div><strong>${x}</strong></div>`).join('')}
        </div></article>
        <article class="cg-visual"><h3>Character Constellation</h3><p>Achilles sits at the center of competing personal, political, and divine claims.</p>
          <div class="cg-relations">
            <span class="cg-node center" style="left:50%;top:50%">Achilles</span>
            <span class="cg-node" style="left:25%;top:26%">Patroclus</span>
            <span class="cg-node" style="left:75%;top:25%">Agamemnon</span>
            <span class="cg-node" style="left:22%;top:72%">Priam</span>
            <span class="cg-node" style="left:77%;top:72%">Hector</span>
            <span class="cg-node" style="left:50%;top:13%">Thetis</span>
            <span class="cg-node" style="left:50%;top:87%">Zeus</span>
          </div>
        </article>
        <article class="cg-visual"><h3>The War’s Human Geography</h3><p>The poem repeatedly crosses the boundary between combat space and household space.</p>
          <div class="cg-world"><div class="cg-zone camp">Greek camp<br>ships · council · prizes</div><div class="cg-zone field">Battlefield<br>glory · death · bodies</div><div class="cg-zone troy">Troy<br>walls · family · city</div></div>
        </article>
        <article class="cg-visual"><h3>The Shield of Achilles</h3><p>A warrior’s armor contains an image of the whole human world.</p><div class="cg-shield"><span>Cosmos · cities · work · dance · war</span></div></article>
      </div></div>`;
  }

  function renderNotebook(guide) {
    const value = localStorage.getItem(storageKey(guide.id,'notes')) || '';
    return `<div class="cg-tab-panel cg-note-box"><h2 class="cg-panel-title">Notebook</h2><p class="cg-panel-lead">Keep notes tied to this guide. They save automatically in this browser.</p>
      <textarea id="cg-notes" placeholder="Questions, passages to revisit, comparisons, seminar notes…">${esc(value)}</textarea>
      <div class="cg-note-status" id="cg-note-status">${value ? 'Saved locally.' : 'Nothing saved yet.'}</div></div>`;
  }

  function renderAskMark(guide) {
    const history = JSON.parse(localStorage.getItem(storageKey(guide.id,'ask-history')) || '[]');
    return `<div class="cg-tab-panel cg-ask-box"><h2 class="cg-panel-title">Ask Mark Chats</h2><p class="cg-panel-lead">Use section prompts to start deeper discussion. Until this standalone guide is wired directly into the app’s Ask Mark runtime, prompts are saved here and can be copied into Ask Mark.</p>
      <textarea id="cg-custom-prompt" placeholder="Example: Compare Achilles' idea of honor with Aristotle's account of magnanimity."></textarea>
      <div class="cg-top-actions" style="margin-top:9px"><button class="cg-btn primary" id="cg-save-prompt">Save prompt</button><button class="cg-btn" id="cg-copy-prompt">Copy prompt</button></div>
      <div class="cg-prompt-history">${history.length ? history.map(h => `<div class="cg-prompt">${esc(h.text)}<br><small>${esc(h.when)}</small></div>`).join('') : '<div class="cg-prompt"><small>No saved prompts yet. Use any “Ask Mark About This Section” button in the Guide tab.</small></div>'}</div>
    </div>`;
  }

  function renderQuiz(guide) {
    return `<div class="cg-tab-panel"><h2 class="cg-panel-title">Quiz</h2><p class="cg-panel-lead">Twelve questions test structure, interpretation, and the poem’s major ideas.</p>
      ${guide.quiz.map((q,i) => `<fieldset class="cg-quiz-q"><legend>${i+1}. ${esc(q.q)}</legend>${q.choices.map((c,j) => `<label><input type="radio" name="cg-q-${i}" value="${j}"> ${esc(c)}</label>`).join('')}<div class="cg-answer" id="cg-answer-${i}"><strong>Answer:</strong> ${esc(q.choices[q.answer])}<br>${esc(q.explanation)}</div></fieldset>`).join('')}
      <button class="cg-btn primary" id="cg-check-quiz">Check Answers</button><div class="cg-score" id="cg-score"></div></div>`;
  }

  function renderActionPlan(guide) {
    return `<div class="cg-tab-panel"><h2 class="cg-panel-title">Action Plan</h2><p class="cg-panel-lead">Choose a reading path instead of trying to absorb the whole poem at once.</p>
      ${guide.actionPlans.map(p => `<article class="cg-plan"><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><ol>${p.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></article>`).join('')}</div>`;
  }

  function toc(guide) {
    return `<aside class="cg-side"><h3>Contents</h3><div class="cg-toc">${guide.sections.map((s,i) => `<button data-jump="${esc(s.id)}">${i+1}. ${esc(s.title)}</button>`).join('')}</div></aside>`;
  }

  function glance(guide) {
    return `<aside class="cg-side"><h3>Guide at a Glance</h3><ul class="cg-atglance">
      <li><strong>${esc(guide.atGlance.originalStructure)}</strong><span>Original work</span></li>
      <li><strong>${esc(guide.atGlance.guideDepth)}</strong><span>Guide depth</span></li>
      <li><strong>${esc(guide.atGlance.greatIdeas)}</strong><span>Great Ideas</span></li>
      <li><strong>${esc(guide.atGlance.bestFor)}</strong><span>Best for</span></li>
    </ul><h3 style="margin-top:18px">Great Ideas</h3><div class="cg-idea-chips">${guide.greatIdeas.map(i => `<span class="cg-chip">${esc(i.name)}</span>`).join('')}</div><div class="cg-takeaway" style="font-size:12px;margin-top:15px">${esc(guide.atGlance.spoilerNote)}</div></aside>`;
  }

  function modal() {
    return `<div class="cg-modal" id="cg-modal"><div class="cg-modal-card"><h3>Ask Mark About This Section</h3><textarea id="cg-modal-text"></textarea><div class="cg-modal-actions"><button class="cg-btn" id="cg-modal-close">Close</button><button class="cg-btn gold" id="cg-modal-save">Save prompt</button><button class="cg-btn primary" id="cg-modal-copy">Copy prompt</button></div></div></div>`;
  }

  function render(guide) {
    host.innerHTML = `<div class="cg-topbar"><div class="cg-topbar-inner"><div class="cg-brand">Mark, Set, Go! <span>Classic Guides</span></div><div class="cg-top-actions"><button class="cg-btn" id="cg-back">← Back to Great Books</button><button class="cg-btn gold" data-tab-open="Key Ideas">Great Ideas</button></div></div></div>
      <main class="cg-shell"><header class="cg-hero"><div class="cg-hero-main"><div class="cg-kicker">${esc(guide.era)} · ${esc(guide.workType)} · Great Books</div><h1>${esc(guide.title)}</h1><div class="cg-author">${esc(guide.author)} · ${esc(guide.subtitle)}</div><p class="cg-dek">${esc(guide.dek)}</p></div>
      <div class="cg-tabs">${['Guide','Key Ideas','Images','Notebook','Ask Mark Chats','Quiz','Action Plan'].map(t => `<button class="cg-tab ${t==='Guide'?'active':''}" data-tab="${esc(t)}">${esc(t)}</button>`).join('')}</div></header>
      <div class="cg-layout" id="cg-layout">${toc(guide)}<section class="cg-main-panel" id="cg-main">${renderGuideTab(guide)}</section>${glance(guide)}</div></main>${modal()}`;
    bind(guide);
  }

  function setTab(guide, tab) {
    document.querySelectorAll('.cg-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const main = document.querySelector('#cg-main');
    const left = document.querySelector('.cg-layout>.cg-side:first-child');
    if (left) left.style.display = tab === 'Guide' ? '' : 'none';
    if (tab === 'Guide') main.innerHTML = renderGuideTab(guide);
    else if (tab === 'Key Ideas') main.innerHTML = renderKeyIdeas(guide);
    else if (tab === 'Images') main.innerHTML = renderVisuals(guide);
    else if (tab === 'Notebook') main.innerHTML = renderNotebook(guide);
    else if (tab === 'Ask Mark Chats') main.innerHTML = renderAskMark(guide);
    else if (tab === 'Quiz') main.innerHTML = renderQuiz(guide);
    else if (tab === 'Action Plan') main.innerHTML = renderActionPlan(guide);
    bindDynamic(guide);
  }

  function savePrompt(guide, text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    const key = storageKey(guide.id,'ask-history');
    const history = JSON.parse(localStorage.getItem(key) || '[]');
    history.unshift({text:clean, when:new Date().toLocaleString()});
    localStorage.setItem(key, JSON.stringify(history.slice(0,30)));
  }

  function bindDynamic(guide) {
    document.querySelectorAll('[data-ask-section]').forEach(b => b.addEventListener('click', () => {
      const section = guide.sections.find(s => s.id === b.dataset.askSection);
      if (!section) return;
      const text = sectionAsk(section, guide);
      const modal = document.querySelector('#cg-modal');
      document.querySelector('#cg-modal-text').value = text;
      modal.classList.add('open');
    }));
    document.querySelectorAll('[data-copy-question]').forEach(b => b.addEventListener('click', async () => {
      const section = guide.sections.find(s => s.id === b.dataset.copyQuestion);
      if (!section) return;
      await navigator.clipboard?.writeText(sectionAsk(section, guide));
      b.textContent = 'Copied';
      setTimeout(() => b.textContent = 'Copy a discussion prompt', 1100);
    }));
    const notes = document.querySelector('#cg-notes');
    notes?.addEventListener('input', () => {
      localStorage.setItem(storageKey(guide.id,'notes'), notes.value);
      const status = document.querySelector('#cg-note-status');
      if (status) status.textContent = 'Saved locally.';
    });
    document.querySelector('#cg-save-prompt')?.addEventListener('click', () => {
      const t = document.querySelector('#cg-custom-prompt').value;
      savePrompt(guide,t); setTab(guide,'Ask Mark Chats');
    });
    document.querySelector('#cg-copy-prompt')?.addEventListener('click', async () => {
      const t = document.querySelector('#cg-custom-prompt').value;
      if (t.trim()) await navigator.clipboard?.writeText(t);
    });
    document.querySelector('#cg-check-quiz')?.addEventListener('click', () => {
      let score=0;
      guide.quiz.forEach((q,i) => {
        const selected = document.querySelector(`input[name="cg-q-${i}"]:checked`);
        if (selected && Number(selected.value) === q.answer) score++;
        document.querySelector(`#cg-answer-${i}`)?.classList.add('show');
      });
      document.querySelector('#cg-score').textContent = `${score} of ${guide.quiz.length} correct. Review the explanations below each question.`;
    });
  }

  function bind(guide) {
    document.querySelector('#cg-back')?.addEventListener('click', () => history.back());
    document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setTab(guide,b.dataset.tab)));
    document.querySelectorAll('[data-tab-open]').forEach(b => b.addEventListener('click', () => setTab(guide,b.dataset.tabOpen)));
    document.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => document.querySelector(`#section-${b.dataset.jump}`)?.scrollIntoView({behavior:'smooth'})));
    document.querySelector('#cg-modal-close')?.addEventListener('click', () => document.querySelector('#cg-modal').classList.remove('open'));
    document.querySelector('#cg-modal-copy')?.addEventListener('click', async () => {
      const t = document.querySelector('#cg-modal-text').value;
      await navigator.clipboard?.writeText(t);
    });
    document.querySelector('#cg-modal-save')?.addEventListener('click', () => {
      const t = document.querySelector('#cg-modal-text').value;
      savePrompt(guide,t);
      document.querySelector('#cg-modal').classList.remove('open');
    });
    bindDynamic(guide);
  }

  fetch(src,{cache:'no-store'}).then(r => {
    if (!r.ok) throw new Error(`Could not load guide data (${r.status})`);
    return r.json();
  }).then(render).catch(err => {
    host.innerHTML = `<main class="cg-shell"><section class="cg-main-panel"><h1>Classic Guide could not load</h1><p>${esc(err.message)}</p></section></main>`;
  });
})();
