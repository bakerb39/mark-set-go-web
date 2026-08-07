(() => {
  'use strict';

  const GOALS_KEY = 'markSetGoReadingGoalsV1';
  const PROGRESS_KEY = 'markSetGoReadingProgressV1';
  const ACTIVITY_KEY = 'markSetGoReadingActivityV1';
  const COMPREHENSION_KEY = 'markSetGoComprehensionV1';
  const LIST_KEY = 'markSetGoReadingListV1';
  const EMAIL_KEY = 'markSetGoEmailPreferencesV1';
  let lastEncouragedSession = '';

  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch (_) { return fallback; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const sameBook = (a, b) => normalize(a) && normalize(a) === normalize(b);
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const yearEnd = () => `${new Date().getFullYear()}-12-31`;

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
    const year = new Date().getFullYear();
    const completedIds = new Set();
    list.filter(item => item.status === 'finished').forEach(item => completedIds.add(item.documentId || item.id || item.title));
    progress.filter(item => Number(item.percent || item.progressPercent || 0) >= 99).forEach(item => completedIds.add(item.documentId || item.title));
    const completedBooks = completedIds.size;

    // Reading sessions store wordsRead + seconds, not a precomputed `wpm`.
    // Use the same measured-speed calculation as Progress & Awards.
    const recentActivity = activity.slice(0, 20);
    const recentWords = recentActivity.reduce((sum, item) => sum + (Number(item.wordsRead) || 0), 0);
    const recentSeconds = recentActivity.reduce((sum, item) => sum + (Number(item.seconds) || 0), 0);
    const avgWpm = recentSeconds > 0
      ? Math.round(recentWords / (recentSeconds / 60))
      : 0;

    // Current comprehension results are stored as `scorePercent`.
    // Keep older field names as fallbacks for legacy records.
    const scores = comprehension.slice(0, 20)
      .map(item => Number(item.scorePercent ?? item.score ?? item.percent ?? item.percentage))
      .filter(Number.isFinite);
    const avgComprehension = scores.length
      ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length)
      : 0;
    const now = Date.now();
    const weekAgo = now - 7*86400000;
    const weeklyMinutes = Math.round(activity.filter(item => Date.parse(item.createdAt || item.startedAt || item.endedAt || 0) >= weekAgo).reduce((sum,item)=>sum + Number(item.seconds || item.durationSeconds || 0),0)/60);
    const bookGoals = goals.books.map(goal => {
      const match = progress.find(item => (goal.documentId && item.documentId === goal.documentId) || sameBook(item.title, goal.title));
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
        <section class="goals-card goal-books-card"><div class="goals-card-heading"><span>▤</span><div><h2>Books to finish</h2><p>Choose books from My Reading and give each one a target date.</p></div></div>
          <div class="goal-book-adder"><select id="goal-book-select"><option value="">Choose a book…</option>${list.filter(item=>item.title).map(item=>`<option value="${esc(item.id||item.documentId||item.title)}">${esc(item.title)}</option>`).join('')}</select><input id="goal-book-deadline" type="date" min="${todayIso()}" value="${goals.annualDeadline||yearEnd()}"><button id="add-goal-book" class="secondary" type="button">Add book goal</button></div>
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
      const chosen = list.find(item => String(item.id||item.documentId||item.title) === select.value);
      if (!chosen) return;
      const current = getGoals();
      if (!current.books.some(item => sameBook(item.title, chosen.title))) current.books.push({ id:`goal-book-${Date.now()}`, documentId:chosen.documentId||'', title:chosen.title, deadline:app.querySelector('#goal-book-deadline').value, createdAt:new Date().toISOString() });
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

  function getCompanionProgress(context={}) {
    const goals=getGoals();
    if(!goals.enabled) return null;

    const m=getMetrics(goals);
    const title=String(context.title||'').trim();
    const documentId=String(context.documentId||'').trim();
    const progress=Object.values(read(PROGRESS_KEY,{}));
    const currentProgress=title || documentId
      ? progress.find(item => (documentId && item.documentId===documentId) || (title && sameBook(item.title,title)))
      : null;
    const currentPercent=Math.max(0,Math.min(100,Math.round(Number(currentProgress?.percent ?? currentProgress?.progressPercent ?? 0))));

    const speedTarget=Math.max(1,Number(goals.targetWpm)||350);
    const compTarget=Math.max(1,Number(goals.targetComprehension)||80);
    const weeklyTarget=Math.max(1,Number(goals.weeklyMinutes)||150);
    const annualTarget=Math.max(1,Number(goals.annualBooks)||12);

    const parts=[];
    if(m.avgWpm>0){
      const delta=m.avgWpm-speedTarget;
      parts.push(delta>=0
        ? `Your recent reading pace is ${m.avgWpm} WPM, ${delta===0?'right on':`${delta} above`} your ${speedTarget} WPM target.`
        : `Your recent reading pace is ${m.avgWpm} WPM; you’re ${Math.abs(delta)} WPM from your ${speedTarget} WPM target.`);
    }
    if(m.avgComprehension>0){
      const delta=m.avgComprehension-compTarget;
      parts.push(delta>=0
        ? `Comprehension is ${m.avgComprehension}%, meeting your ${compTarget}% goal.`
        : `Comprehension is ${m.avgComprehension}%, ${Math.abs(delta)} points from your ${compTarget}% goal.`);
    }
    if(title && currentPercent>0){
      parts.push(`You’re ${currentPercent}% through ${title}.`);
    }
    if(m.completedBooks>0 || m.annualPercent>0){
      parts.push(`You’ve completed ${m.completedBooks} of ${annualTarget} books this year (${m.annualPercent}%).`);
    }
    if(m.weeklyMinutes>0){
      const weeklyPercent=Math.min(100,Math.round(m.weeklyMinutes/weeklyTarget*100));
      parts.push(`This week you’ve logged ${m.weeklyMinutes} of ${weeklyTarget} reading minutes (${weeklyPercent}%).`);
    }

    if(!parts.length) return null;

    // Keep Mark conversational: prioritize current performance, current book,
    // and one broader goal rather than dumping the entire dashboard every time.
    const selected=[];
    const speed=parts.find(p=>/WPM/.test(p)); if(speed) selected.push(speed);
    const comprehension=parts.find(p=>/Comprehension/.test(p)); if(comprehension) selected.push(comprehension);
    const book=parts.find(p=>/^You’re \d+% through/.test(p)); if(book) selected.push(book);
    const annual=parts.find(p=>/completed .* books this year/.test(p));
    const weekly=parts.find(p=>/This week/.test(p));
    if(selected.length<4 && annual) selected.push(annual);
    if(selected.length<4 && weekly) selected.push(weekly);

    const encouragement =
      m.avgWpm>=speedTarget && m.avgComprehension>=compTarget
        ? 'You’re balancing speed and understanding very well—keep that combination.'
        : m.avgComprehension>=compTarget
          ? 'Your understanding is holding up well. Keep building pace gradually rather than sacrificing comprehension.'
          : m.avgWpm>=speedTarget && m.avgComprehension>0
            ? 'Your pace is strong. Give comprehension a little more attention before pushing the speed higher.'
            : 'Keep the progress steady; consistency matters more than forcing the numbers upward all at once.';

    const signature=[
      new Date().toISOString().slice(0,10),
      Math.round((m.avgWpm||0)/10)*10,
      Math.round((m.avgComprehension||0)/5)*5,
      Math.round((m.annualPercent||0)/5)*5,
      Math.round((m.weeklyMinutes||0)/15)*15,
      Math.round(currentPercent/5)*5,
      documentId||title
    ].join('|');

    return {
      message:`${selected.join(' ')} ${encouragement}`.trim(),
      signature,
      metrics:m,
      goals,
      currentPercent,
      title
    };
  }

  function onSessionStart(context={}) {
    const update=getCompanionProgress(context);
    if(!update) return;
    const key=`${context.documentId||context.title||'reader'}|${new Date().toISOString().slice(0,10)}`;
    if(lastEncouragedSession===key) return;
    lastEncouragedSession=key;
    showEncouragement(update.message);
    document.dispatchEvent(new CustomEvent('marksetgo:mark-progress-update',{detail:update}));
  }

  function showEncouragement(message) {
    document.querySelector('.reading-goal-toast')?.remove();
    const toast=document.createElement('aside'); toast.className='reading-goal-toast'; toast.setAttribute('role','status'); toast.innerHTML=`<span class="goal-mark-avatar">M</span><div><strong>Mark</strong><p>${esc(message)}</p></div><button type="button" aria-label="Dismiss">×</button>`;
    document.body.appendChild(toast); toast.querySelector('button').addEventListener('click',()=>toast.remove()); setTimeout(()=>toast.remove(),10000);
  }

  async function syncGoals(goals=getGoals()) {
    if(!goals.emailProgress) return;
    const prefs=read(EMAIL_KEY,{}); const clientId=localStorage.getItem('markSetGoEmailClientId') || localStorage.getItem('markSetGoClientId') || '';
    if(!prefs.email || !clientId) return;
    try { await fetch('/api/email/sync-goals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId,goals,metrics:getMetrics(goals)})}); } catch (_) {}
  }

  document.addEventListener('click', event => { const button=event.target.closest?.('[data-action="reading-goals"]'); if(!button) return; event.preventDefault(); event.stopImmediatePropagation(); render(); }, true);
  const observer=new MutationObserver(()=>{ injectProgress(); injectActionCenter(); });
  window.addEventListener('DOMContentLoaded',()=>{ const app=document.querySelector('#app'); if(app) observer.observe(app,{childList:true,subtree:true}); injectProgress(); injectActionCenter(); });
  window.ReadingGoals={render,getGoals,saveGoals,getMetrics,getCompanionProgress,onSessionStart,injectProgress,injectActionCenter,syncGoals};
})();
