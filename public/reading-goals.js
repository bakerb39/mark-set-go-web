(() => {
  'use strict';

  const GOALS_KEY = 'markSetGoReadingGoalsV2';
  const PROGRESS_KEY = 'markSetGoReadingProgressV1';
  const ACTIVITY_KEY = 'markSetGoReadingActivityV1';
  const COMPREHENSION_KEY = 'markSetGoComprehensionV1';
  const LIST_KEY = 'markSetGoReadingListV1';
  const DOCUMENT_PREFIX = 'markSetGoDocumentV1:';
  const EMAIL_KEY = 'markSetGoEmailPreferencesV1';
  let lastEncouragedSession = '';

  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch (_) { return fallback; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const yearEnd = () => `${new Date().getFullYear()}-12-31`;

  function getLibraryDocuments() {
    const documents = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(DOCUMENT_PREFIX)) continue;
      const documentId = key.slice(DOCUMENT_PREFIX.length).trim();
      if (!documentId) continue;
      try {
        const item = JSON.parse(localStorage.getItem(key) || 'null');
        if (!item?.text || !String(item.title || '').trim()) continue;
        documents.push({
          documentId,
          title: String(item.title).trim(),
          source: item.source || null,
          savedAt: item.savedAt || item.updatedAt || item.importedAt || ''
        });
      } catch (_) {}
    }
    return documents
      .sort((a, b) => String(a.title).localeCompare(String(b.title)))
      .filter((item, index, all) => index === 0 || item.documentId !== all[index - 1].documentId);
  }

  function defaults() {
    return {
      enabled: false,
      prominent: true,
      annualBooks: 12,
      annualDeadline: yearEnd(),
      targetWpm: 350,
      targetComprehension: 80,
      weeklyMinutes: 150,
      emailProgress: true,
      books: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function getGoals() { return { ...defaults(), ...read(GOALS_KEY, {}) }; }
  function saveGoals(goals) {
    const next = { ...defaults(), ...goals, updatedAt: new Date().toISOString() };
    write(GOALS_KEY, next);
    syncGoals(next);
    document.dispatchEvent(new CustomEvent('marksetgo:goals-updated', { detail: next }));
    return next;
  }

  function getMetrics(goals = getGoals()) {
    const progress = Object.values(read(PROGRESS_KEY, {}));
    const activity = read(ACTIVITY_KEY, []);
    const comprehension = read(COMPREHENSION_KEY, []);
    const list = read(LIST_KEY, []);
    const libraryDocuments = getLibraryDocuments();
    const year = new Date().getFullYear();
    const completedIds = new Set();
    list.filter(item => item.status === 'finished').forEach(item => completedIds.add(item.documentId || item.id || item.title));
    progress.filter(item => Number(item.percent || item.progressPercent || 0) >= 99).forEach(item => completedIds.add(item.documentId || item.title));
    const completedBooks = completedIds.size;
    const recentWpm = activity.slice(0, 20).map(item => Number(item.wpm)).filter(Boolean);
    const avgWpm = recentWpm.length ? Math.round(recentWpm.reduce((a,b)=>a+b,0)/recentWpm.length) : 0;
    const scores = comprehension.slice(0, 20).map(item => Number(item.score ?? item.percent ?? item.percentage)).filter(Number.isFinite);
    const avgComprehension = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
    const now = Date.now();
    const weekAgo = now - 7*86400000;
    const weeklyMinutes = Math.round(activity.filter(item => Date.parse(item.createdAt || item.startedAt || item.endedAt || 0) >= weekAgo).reduce((sum,item)=>sum + Number(item.seconds || item.durationSeconds || 0),0)/60);
    const bookGoals = goals.books.map(goal => {
      const match = progress.find(item => goal.bookId && item.documentId === goal.bookId);
      const percent = Math.max(0, Math.min(100, Math.round(Number(match?.percent ?? match?.progressPercent ?? 0))));
      return { ...goal, percent, completed: percent >= 99 || goal.completed === true };
    });
    const completedGoalBooks = bookGoals.filter(item => item.completed).length;
    const annualPercent = Math.min(100, Math.round((completedBooks / Math.max(1, Number(goals.annualBooks)||1))*100));
    return { year, completedBooks, avgWpm, avgComprehension, weeklyMinutes, bookGoals, completedGoalBooks, annualPercent };
  }

  function render() {
    const app = document.querySelector('#app');
    if (!app) return;
    const goals = getGoals();
    const metrics = getMetrics(goals);
    const list = read(LIST_KEY, []);
    const libraryDocuments = getLibraryDocuments();
    app.dataset.viewKey = 'reading-goals';
    app.innerHTML = `<section class="panel reading-goals-page">
      <header class="goals-hero">
        <div><span class="source-category">A purposeful reading life</span><h1>Reading Goals</h1><p>Choose what you want to read, how quickly you want to read it, and the level of understanding you want to maintain.</p></div>
        <div class="goals-hero-actions"><button class="secondary" type="button" data-action="progress-awards">View Progress</button><button class="secondary" type="button" data-action="reader">Return to Reader</button></div>
      </header>

      <section class="goal-overview ${goals.enabled ? 'is-enabled' : ''}">
        <div class="goal-ring" style="--goal-progress:${metrics.annualPercent * 3.6}deg"><strong>${metrics.annualPercent}%</strong><span>annual goal</span></div>
        <div><h2>${goals.enabled ? `${metrics.completedBooks} of ${goals.annualBooks} books completed` : 'Goals are optional'}</h2><p>${goals.enabled ? `Your ${metrics.year} reading challenge is active.` : 'Turn goals on when you are ready. The reader will continue to work normally either way.'}</p></div>
        <label class="goal-enable"><input id="goals-enabled" type="checkbox" ${goals.enabled?'checked':''}> <span>Enable Reading Goals</span></label>
      </section>

      <form id="reading-goals-form" class="goals-form">
        <section class="goals-card"><div class="goals-card-heading"><span>◎</span><div><h2>Reading challenge</h2><p>Set an annual target and a weekly reading rhythm.</p></div></div>
          <div class="goal-fields"><label>Books this year<input id="goal-annual-books" type="number" min="1" max="365" value="${Number(goals.annualBooks)||12}"></label><label>Challenge deadline<input id="goal-annual-deadline" type="date" value="${esc(goals.annualDeadline||yearEnd())}"></label><label>Minutes per week<input id="goal-weekly-minutes" type="number" min="10" max="5000" step="10" value="${Number(goals.weeklyMinutes)||150}"></label></div>
        </section>
        <section class="goals-card"><div class="goals-card-heading"><span>↗</span><div><h2>Performance targets</h2><p>Build speed without sacrificing understanding.</p></div></div>
          <div class="goal-fields"><label>Target reading speed<input id="goal-target-wpm" type="number" min="50" max="1500" step="10" value="${Number(goals.targetWpm)||350}"><small>words per minute</small></label><label>Target comprehension<input id="goal-target-comprehension" type="number" min="1" max="100" value="${Number(goals.targetComprehension)||80}"><small>percent</small></label></div>
          <div class="goal-current-metrics"><span>Current WPM <strong>${metrics.avgWpm || '—'}</strong></span><span>Current comprehension <strong>${metrics.avgComprehension ? metrics.avgComprehension+'%' : '—'}</strong></span></div>
        </section>
        <section class="goals-card goal-books-card"><div class="goals-card-heading"><span>▤</span><div><h2>Books to finish</h2><p>Choose books already stored in My Library and give each one a target date.</p></div></div>
          <div class="goal-book-adder"><select id="goal-book-select"><option value="">Choose a book…</option>${libraryDocuments.map(item=>`<option value="${esc(item.documentId)}">${esc(item.title)}</option>`).join('')}</select><input id="goal-book-deadline" type="date" min="${todayIso()}" value="${goals.annualDeadline||yearEnd()}"><button id="add-goal-book" class="secondary" type="button">Add book goal</button></div>
          <div id="goal-book-list" class="goal-book-list">${metrics.bookGoals.length ? metrics.bookGoals.map(book=>`<article><div><strong>${esc(book.title)}</strong><small>Target ${book.deadline ? new Date(book.deadline+'T12:00:00').toLocaleDateString() : 'not set'}</small></div><div class="goal-inline-progress"><span style="width:${book.percent}%"></span></div><b>${book.percent}%</b><button type="button" data-remove-goal-book="${esc(book.id)}" aria-label="Remove ${esc(book.title)}">×</button></article>`).join('') : '<p class="empty-state">No book-specific goals yet.</p>'}</div>
        </section>
        <section class="goals-card"><div class="goals-card-heading"><span>✉</span><div><h2>Visibility & encouragement</h2><p>Keep goal progress prominent and include it in Action Center emails.</p></div></div>
          <div class="goal-checks"><label><input id="goal-prominent" type="checkbox" ${goals.prominent?'checked':''}> Show goals prominently in My Library and Progress</label><label><input id="goal-email-progress" type="checkbox" ${goals.emailProgress?'checked':''}> Include goal progress in progress and reminder emails</label></div>
        </section>
        <div class="goal-save-row"><button class="primary" type="submit">Save Reading Goals</button><span id="goal-save-status" class="status"></span></div>
      </form>
    </section>`;

    const form = app.querySelector('#reading-goals-form');
    const select = app.querySelector('#goal-book-select');
    app.querySelector('#add-goal-book')?.addEventListener('click', () => {
      const chosen = libraryDocuments.find(item => String(item.documentId) === select.value);
      if (!chosen) return;
      const current = getGoals();
      const bookId = String(chosen.documentId || '').trim();
      if (!bookId) return;
      if (!current.books.some(item => item.bookId === bookId)) current.books.push({ id:`goal-book-${Date.now()}`, bookId, title:chosen.title, deadline:app.querySelector('#goal-book-deadline').value, createdAt:new Date().toISOString() });
      saveGoals(current); render();
    });
    app.querySelectorAll('[data-remove-goal-book]').forEach(button => button.addEventListener('click', () => { const current=getGoals(); current.books=current.books.filter(item=>item.id!==button.dataset.removeGoalBook); saveGoals(current); render(); }));
    form?.addEventListener('submit', event => {
      event.preventDefault();
      const current = getGoals();
      saveGoals({ ...current, enabled:app.querySelector('#goals-enabled').checked, prominent:app.querySelector('#goal-prominent').checked, emailProgress:app.querySelector('#goal-email-progress').checked, annualBooks:Number(app.querySelector('#goal-annual-books').value)||12, annualDeadline:app.querySelector('#goal-annual-deadline').value||yearEnd(), weeklyMinutes:Number(app.querySelector('#goal-weekly-minutes').value)||150, targetWpm:Number(app.querySelector('#goal-target-wpm').value)||350, targetComprehension:Number(app.querySelector('#goal-target-comprehension').value)||80 });
      const status=app.querySelector('#goal-save-status'); status.textContent='Goals saved.'; setTimeout(()=>{ if(status) status.textContent=''; },2200);
    });
  }

  function goalAwards(goals, metrics) {
    return [
      {icon:'🎯',title:'Goal Setter',earned:goals.enabled,progress:goals.enabled?100:0},
      {icon:'📖',title:'Goal Book Begun',earned:metrics.bookGoals.some(b=>b.percent>0),progress:metrics.bookGoals.some(b=>b.percent>0)?100:0},
      {icon:'⚡',title:'Pace Builder',earned:metrics.avgWpm>=goals.targetWpm,progress:Math.min(100,Math.round(metrics.avgWpm/Math.max(1,goals.targetWpm)*100))},
      {icon:'🧠',title:'Comprehension Keeper',earned:metrics.avgComprehension>=goals.targetComprehension,progress:Math.min(100,Math.round(metrics.avgComprehension/Math.max(1,goals.targetComprehension)*100))},
      {icon:'🏁',title:'Goal Book Finisher',earned:metrics.completedGoalBooks>0,progress:metrics.bookGoals.length?Math.round(metrics.completedGoalBooks/metrics.bookGoals.length*100):0},
      {icon:'🏆',title:'Reading Challenge Champion',earned:metrics.annualPercent>=100,progress:metrics.annualPercent}
    ];
  }

  function injectProgress() {
    const app=document.querySelector('#app'); if(!app || app.querySelector('.goal-progress-integration')) return;
    const heading=app.querySelector('h1'); if(!heading || !/Progress & Awards/i.test(heading.textContent)) return;
    const goals=getGoals(); if(!goals.enabled) return;
    const m=getMetrics(goals); const awards=goalAwards(goals,m);
    const section=document.createElement('section'); section.className='analytics-card goal-progress-integration';
    section.innerHTML=`<div class="section-heading"><div><span class="source-category">Reading Goals</span><h2>Your goal progress</h2><p>Goals are monitored alongside reading activity and awards.</p></div><button class="secondary" type="button" data-action="reading-goals">Edit goals</button></div>
      <div class="goal-progress-kpis"><article><span>Annual challenge</span><strong>${m.completedBooks}/${goals.annualBooks}</strong><div class="goal-inline-progress"><span style="width:${m.annualPercent}%"></span></div></article><article><span>Weekly reading</span><strong>${m.weeklyMinutes}/${goals.weeklyMinutes} min</strong><div class="goal-inline-progress"><span style="width:${Math.min(100,Math.round(m.weeklyMinutes/goals.weeklyMinutes*100))}%"></span></div></article><article><span>Reading speed</span><strong>${m.avgWpm||'—'} / ${goals.targetWpm} WPM</strong><div class="goal-inline-progress"><span style="width:${Math.min(100,Math.round(m.avgWpm/goals.targetWpm*100))}%"></span></div></article><article><span>Comprehension</span><strong>${m.avgComprehension||'—'} / ${goals.targetComprehension}%</strong><div class="goal-inline-progress"><span style="width:${Math.min(100,Math.round(m.avgComprehension/goals.targetComprehension*100))}%"></span></div></article></div>
      <div class="goal-award-grid">${awards.map(a=>`<article class="${a.earned?'earned':''}"><span>${a.icon}</span><strong>${a.title}</strong><small>${a.earned?'Earned':a.progress+'%'}</small></article>`).join('')}</div>`;
    const hero=app.querySelector('.progress-hero'); hero?.insertAdjacentElement('afterend',section);
  }

  function injectActionCenter() {
    const app=document.querySelector('#app'); if(!app || app.querySelector('.goal-action-integration')) return;
    const heading=app.querySelector('h1'); if(!heading || !/Action Center/i.test(heading.textContent)) return;
    const goals=getGoals(); if(!goals.enabled) return;
    const m=getMetrics(goals); const section=document.createElement('section'); section.className='goal-action-integration app-section-card';
    section.innerHTML=`<div class="section-heading"><div><span class="source-category">Goal accountability</span><h2>Reading goal progress</h2><p>This summary can be included in progress emails and reminder messages.</p></div><button class="secondary" type="button" data-action="reading-goals">Manage goals</button></div><div class="goal-progress-kpis"><article><span>Annual challenge</span><strong>${m.annualPercent}%</strong></article><article><span>Weekly minutes</span><strong>${m.weeklyMinutes}/${goals.weeklyMinutes}</strong></article><article><span>Target WPM</span><strong>${m.avgWpm||'—'}/${goals.targetWpm}</strong></article><article><span>Comprehension</span><strong>${m.avgComprehension||'—'}/${goals.targetComprehension}%</strong></article></div><p class="fine-print">Goal progress in email is ${goals.emailProgress?'enabled':'disabled'}.</p>`;
    app.querySelector('.action-center-hero')?.insertAdjacentElement('afterend',section);
  }

  function encourageGoalBook(context={}) {
    const goals=getGoals(); if(!goals.enabled) return;
    const bookId=String(context.documentId||context.bookId||'').trim(); if(!bookId) return;
    const goal=goals.books.find(item => item.bookId === bookId);
    if(!goal) return;
    const key=`${bookId}|${new Date().toISOString().slice(0,10)}`; if(lastEncouragedSession===key) return; lastEncouragedSession=key;
    const m=getMetrics(goals); const book=m.bookGoals.find(item=>item.id===goal.id)||goal;
    const title=goal.title || context.title || 'this book';
    const deadline=goal.deadline ? new Date(goal.deadline+'T12:00:00').toLocaleDateString(undefined,{month:'long',day:'numeric'}) : '';
    const message=`You’re reading one of your goal books. You’re ${book.percent||0}% through ${title}${deadline?` and working toward your ${deadline} target`:''}. Keep going—you’re building real momentum.`;
    document.dispatchEvent(new CustomEvent('marksetgo:ask-mark-companion-message', {
      detail: {
        id: `goal-update-${goal.id}-${key}`,
        bookId,
        title,
        kind: 'goal-update',
        message
      }
    }));
  }

  function onSessionStart(context={}) { encourageGoalBook(context); }
  function onBookOpened(context={}) { window.setTimeout(() => encourageGoalBook(context), 250); }

  async function syncGoals(goals=getGoals()) {
    if(!goals.emailProgress) return;
    const prefs=read(EMAIL_KEY,{}); const clientId=localStorage.getItem('markSetGoEmailClientId') || localStorage.getItem('markSetGoClientId') || '';
    if(!prefs.email || !clientId) return;
    try { await fetch('/api/email/sync-goals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId,goals,metrics:getMetrics(goals)})}); } catch (_) {}
  }

  document.addEventListener('click', event => { const button=event.target.closest?.('[data-action="reading-goals"]'); if(!button) return; event.preventDefault(); event.stopImmediatePropagation(); render(); }, true);
  const observer=new MutationObserver(()=>{ injectProgress(); injectActionCenter(); });
  document.addEventListener('marksetgo:document-available', event => onBookOpened(event.detail || {}));
  window.addEventListener('DOMContentLoaded',()=>{ const app=document.querySelector('#app'); if(app) observer.observe(app,{childList:true,subtree:true}); injectProgress(); injectActionCenter(); });
  window.ReadingGoals={render,getGoals,saveGoals,getMetrics,getLibraryDocuments,onSessionStart,onBookOpened,injectProgress,injectActionCenter,syncGoals};
})();
