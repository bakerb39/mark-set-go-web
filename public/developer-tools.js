(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const mode = params.has('debug') ? 'debug' : params.has('features') ? 'features' : '';
  if (!mode) return;

  const D = window.MSGDeveloperData || { build:{}, bugs:[], features:[] };
  const app = document.getElementById('app');
  if (!app) return;

  const boot = window.__MSG_BOOT_DEBUG || { errors:[], rejections:[], navigation:[] };
  const store = {
    logs: [], errors: [...(boot.errors || []), ...(boot.rejections || [])], testResults: [],
    sessionId: `dbg-${Date.now().toString(36)}`,
    startedAt: boot.startedAt || new Date().toISOString(),
    navigation: [...(boot.navigation || [])]
  };
  window.MSGDebug = window.MSGDebug || {};
  Object.assign(window.MSGDebug, {
    store,
    log(type, message, detail = null) {
      store.logs.push({ at:new Date().toISOString(), type, message, detail });
      if (store.logs.length > 250) store.logs.splice(0, store.logs.length - 250);
      renderLiveLog();
    },
    snapshot: buildSnapshot
  });

  window.addEventListener('error', (event) => {
    store.errors.push({ type:'error', message:event.message, source:event.filename, line:event.lineno, col:event.colno, at:new Date().toISOString() });
  });
  window.addEventListener('unhandledrejection', (event) => {
    store.errors.push({ type:'unhandledrejection', message:String(event.reason?.message || event.reason || 'Unhandled rejection'), at:new Date().toISOString() });
  });
  ['click','pointerdown','contextmenu','wheel','keydown'].forEach((type) => {
    document.addEventListener(type, (event) => {
      if (!window.MSGDebug?.eventProbe) return;
      const target = event.target instanceof Element ? describeNode(event.target) : String(event.target);
      window.MSGDebug.log('event', `${type} @ ${target}`, { defaultPrevented:event.defaultPrevented, button:event.button, key:event.key, deltaY:event.deltaY });
    }, { capture:true, passive:true });
  });

  function esc(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function describeNode(el) {
    if (!(el instanceof Element)) return String(el);
    const id = el.id ? `#${el.id}` : '';
    const cls = el.classList?.length ? `.${Array.from(el.classList).slice(0,3).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  }
  function statusClass(status='') {
    if (/verified|fixed|pass|protected|complete/i.test(status)) return 'ok';
    if (/open|fail|regression/i.test(status)) return 'bad';
    return 'warn';
  }
  function badge(status) { return `<span class="dev-badge ${statusClass(status)}">${esc(status)}</span>`; }

  function chrome(active) {
    return `<header class="dev-hero"><div><span class="dev-kicker">Mark, Set, Go! developer workspace</span><h1>${active === 'debug' ? 'Debug Center' : 'Features Roadmap'}</h1><p>${active === 'debug' ? 'Runtime diagnostics, bugs, protected baselines, regression testing, and stable-build tracking.' : 'Ongoing work, planned improvements, and future product ideas kept separate from the bug catalog.'}</p></div><nav class="dev-links"><a class="${active==='debug'?'active':''}" href="/?debug">Debug</a><a class="${active==='features'?'active':''}" href="/?features">Features</a><a href="/">App</a></nav></header>`;
  }

  function renderDebug() {
    app.innerHTML = `<section class="dev-center"><div class="dev-shell">${chrome('debug')}
      <div class="dev-grid">
        <section class="dev-card half"><h2>Build Manifest</h2><div id="dev-build"></div></section>
        <section class="dev-card half"><h2>Regression Summary</h2><div id="dev-regression-summary">Not run yet.</div><div class="dev-actions"><button class="dev-btn primary" data-run-regression>Run Regression Suite</button><button class="dev-btn" data-copy-report>Copy Debug Report</button><button class="dev-btn" data-toggle-probe>Start Event Probe</button></div></section>
        <section class="dev-card"><h2>Automated Regression Tests</h2><div class="dev-tests" id="dev-tests"></div></section>
        <section class="dev-card"><h2>Bug Catalog</h2><div class="dev-table-wrap"><table class="dev-table"><thead><tr><th>ID</th><th>Bug</th><th>Area</th><th>Severity</th><th>Status</th><th>Notes</th></tr></thead><tbody id="dev-bugs"></tbody></table></div><div class="dev-input-row" style="margin-top:12px"><input data-new-bug-title placeholder="Add a local bug note"><select data-new-bug-area><option>General</option><option>Reader</option><option>Notebook</option><option>Companion</option><option>Formatter</option><option>Cloud</option></select><select data-new-bug-severity><option>low</option><option selected>medium</option><option>high</option></select><button class="dev-btn" data-add-bug>Add Bug</button></div></section>
        <section class="dev-card half"><h2>Runtime Snapshot</h2><div id="dev-snapshot"></div><div class="dev-actions"><button class="dev-btn" data-refresh-snapshot>Refresh Snapshot</button></div></section>
        <section class="dev-card half"><h2>Live Diagnostic Log</h2><div class="dev-log" id="dev-log"></div></section>
        <section class="dev-card"><h2>Exportable Debug Report</h2><textarea class="dev-report" id="dev-report" readonly></textarea></section>
      </div><div class="dev-footer">Debug route is read-only by default. Local bug notes are stored only in this browser unless promoted into the source catalog.</div>
    </div></section>`;
    renderBuild(); renderBugs(); refreshSnapshot(); renderLiveLog(); updateReport(); bindDebug();
    setTimeout(runRegressionSuite, 80);
  }

  function renderBuild() {
    const b = D.build || {};
    const rows = [
      ['Current build', `${esc(b.current || 'unknown')} ${badge(b.channel || 'unknown')}`],
      ['Latest stable', `<strong>${esc(b.latestStable || 'unknown')}</strong>`],
      ['Stable basis', esc(b.stableBasis || '')],
      ['Debug session', esc(store.sessionId)]
    ];
    const baselines = (b.protectedBaselines || []).map(x => `<div class="dev-build-row"><span class="dev-label">${esc(x.area)}</span><span class="dev-value">${badge(x.status)} ${esc(x.baseline)}</span></div>`).join('');
    document.getElementById('dev-build').innerHTML = rows.map(([k,v]) => `<div class="dev-build-row"><span class="dev-label">${k}</span><span class="dev-value">${v}</span></div>`).join('') + baselines;
  }

  function localBugs() { try { return JSON.parse(localStorage.getItem('msg_debug_local_bugs_v1') || '[]'); } catch { return []; } }
  function renderBugs() {
    const all = [...(D.bugs || []), ...localBugs()];
    document.getElementById('dev-bugs').innerHTML = all.map(b => `<tr><td><strong>${esc(b.id)}</strong></td><td>${esc(b.title)}</td><td>${esc(b.area)}</td><td>${esc(b.severity)}</td><td>${badge(b.status)}</td><td>${esc(b.notes || '')}</td></tr>`).join('');
  }

  function duplicateIds() {
    const seen = new Map(), dup = [];
    document.querySelectorAll('[id]').forEach(el => { const id=el.id; if(seen.has(id)) dup.push(id); else seen.set(id,el); });
    return Array.from(new Set(dup));
  }
  function buildSnapshot() {
    const reader = document.querySelector('#reader');
    const menu = document.querySelector('#word-context-menu');
    let storage = 'available'; try { localStorage.setItem('__msg_debug_test','1'); localStorage.removeItem('__msg_debug_test'); } catch { storage='blocked'; }
    return {
      at: new Date().toISOString(), url: location.href, title:document.title,
      appConnected: !!app.isConnected,
      reader: { present:!!reader, connected:!!reader?.isConnected, words:reader?.querySelectorAll?.('[data-index],.reader-word')?.length || 0 },
      contextMenu: { present:!!menu, connected:!!menu?.isConnected, hidden:menu?.hidden ?? null },
      companion: window.MSGCompanion ? { id:window.MSGCompanion.id, name:window.MSGCompanion.name } : null,
      storage, duplicateIds: duplicateIds(), errors: store.errors.slice(-20), navigation: store.navigation.slice(-30),
      viewport: { width:innerWidth, height:innerHeight },
      memory: performance.memory ? { used:performance.memory.usedJSHeapSize, total:performance.memory.totalJSHeapSize, limit:performance.memory.jsHeapSizeLimit } : null
    };
  }
  function refreshSnapshot() {
    const s = buildSnapshot();
    const node = document.getElementById('dev-snapshot'); if (!node) return;
    node.innerHTML = Object.entries({
      'App connected':s.appConnected,'Reader present':s.reader.present,'Reader connected':s.reader.connected,
      'Context menu present':s.contextMenu.present,'Companion':s.companion ? `${s.companion.name} (${s.companion.id})` : 'not loaded',
      'Storage':s.storage,'Duplicate IDs':s.duplicateIds.length ? s.duplicateIds.join(', ') : 'none','Captured JS errors':s.errors.length
    }).map(([k,v]) => `<div class="dev-build-row"><span class="dev-label">${esc(k)}</span><span class="dev-value">${esc(v)}</span></div>`).join('');
    updateReport();
  }
  function renderLiveLog() {
    const node = document.getElementById('dev-log'); if (!node) return;
    node.textContent = store.logs.slice(-120).map(x => `[${x.at.slice(11,19)}] ${x.type.toUpperCase()} ${x.message}${x.detail ? ' '+JSON.stringify(x.detail) : ''}`).join('\n') || 'Event probe is off. Runtime errors and regression activity will appear here.';
    node.scrollTop = node.scrollHeight;
  }

  async function getText(url) { const r = await fetch(url, { cache:'no-store' }); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.text(); }
  async function runRegressionSuite() {
    const tests = [];
    const add=(name,status,detail)=>tests.push({name,status,detail});
    window.MSGDebug.log('test','Regression suite started');
    try {
      const [appSrc, companionSrc, helpSrc, hubSrc, formatCss, devSrc] = await Promise.all([
        getText('/app.js'), getText('/companion-persona-safe.js'), getText('/app-help-mark.js'), getText('/ask-mark-hub.js'), getText('/read-anything.css'), getText('/developer-tools.js')
      ]);
      add('Core app source loads','pass',`${appSrc.length.toLocaleString()} bytes`);
      add('Right-click live-menu stale-listener guard','pass', appSrc.includes('__msgDictionaryOutsideCloseInstalled') && appSrc.includes("app.querySelector('#word-context-menu')") ? 'Confirmed live-menu pointerdown guard.' : 'Missing expected right-click guard.');
      if (!(appSrc.includes('__msgDictionaryOutsideCloseInstalled') && appSrc.includes("app.querySelector('#word-context-menu')"))) tests[tests.length-1].status='fail';
      add('Right-click contextmenu handler exists', appSrc.includes("addEventListener('contextmenu'") ? 'pass':'fail', 'Protected Reader right-click contract.');
      add('First-person reading status', appSrc.includes('I’m reading this…') && !appSrc.includes('Ask Mark is reading the selection…') ? 'pass':'fail', 'Expected “I’m reading this…” wording.');
      add('Companion module avoids MutationObserver', !companionSrc.includes('MutationObserver') ? 'pass':'fail', 'Targeted event-driven companion updates only.');
      add('Companion profile selector present', companionSrc.includes('data-companion-choice') ? 'pass':'fail', 'Mark/Beth profile controls available.');
      add('Companion help button has one label target', companionSrc.includes("querySelector(':scope > span')") ? 'pass':'fail', 'Prevents duplicate Ask Mark / Ask Beth text.');
      add('Reader companion shell renders selected identity', hubSrc.includes('companionAsk()') && hubSrc.includes('companionAvatar()') && hubSrc.includes('companionName()') ? 'pass':'fail', 'Header, avatar, and messages are created from selected companion state.');
      add('Dictionary response uses selected companion', appSrc.includes('currentCompanionIdentity().ask') ? 'pass':'fail', 'Word lookup badge follows Mark/Beth selection.');
      add('Features workflow order', devSrc.includes("['idea','Ideas'],['planned','Planned'],['testing','Testing'],['in-progress','In Progress'],['complete','Completed']") ? 'pass':'fail', 'Ideas → Planned → Testing → In Progress → Completed.');
      add('Global page-help module loads', helpSrc.includes('MarkSetGoPageHelpKnowledge') ? 'pass':'fail', 'Page-aware non-Reader help restored.');
      add('Formatter layout CSS exists', formatCss.includes('.smart-format-heading') && formatCss.includes('.smart-format-actions') ? 'pass':'fail', 'Professional Format control styling present.');
      add('Debug and features routes supported', devSrc.includes("params.has('debug')") && devSrc.includes("params.has('features')") ? 'pass':'fail', 'Developer routes detected in source.');
    } catch (error) { add('Static asset/source checks','fail',error.message); }
    let storageOk=true; try { localStorage.setItem('__msg_reg','1'); localStorage.removeItem('__msg_reg'); } catch { storageOk=false; }
    add('localStorage writable',storageOk?'pass':'warn',storageOk?'Storage write/read path available.':'Storage is blocked or full.');
    const dups = duplicateIds(); add('No duplicate live DOM IDs',dups.length?'warn':'pass',dups.length?`Duplicates: ${dups.join(', ')}`:'No duplicate IDs detected in current debug DOM.');
    add('No captured runtime errors',store.errors.length?'warn':'pass',store.errors.length?`${store.errors.length} error(s) captured this session.`:'No runtime errors captured.');
    store.testResults = tests;
    renderTests(); updateReport();
    const fail=tests.filter(t=>t.status==='fail').length, warn=tests.filter(t=>t.status==='warn').length;
    document.getElementById('dev-regression-summary').innerHTML = `${badge(fail?'FAIL':warn?'PASS WITH WARNINGS':'PASS')} <strong>${tests.length-fail}/${tests.length}</strong> checks without failure${warn?` · ${warn} warning(s)`:''}`;
    window.MSGDebug.log('test','Regression suite finished',{tests:tests.length,fail,warn});
  }
  function renderTests() {
    const node=document.getElementById('dev-tests'); if(!node)return;
    node.innerHTML=store.testResults.map(t=>`<div class="dev-test ${t.status}"><div class="icon">${t.status==='pass'?'✓':t.status==='fail'?'✕':'!'}</div><div><strong>${esc(t.name)}</strong><small>${esc(t.detail)}</small></div>${badge(t.status)}</div>`).join('') || '<div class="dev-empty">Regression suite has not run yet.</div>';
  }
  function buildReport() {
    return JSON.stringify({ build:D.build, snapshot:buildSnapshot(), regression:store.testResults, bugs:D.bugs, recentLogs:store.logs.slice(-80) }, null, 2);
  }
  function updateReport() { const n=document.getElementById('dev-report'); if(n)n.value=buildReport(); }
  async function copyReport() { const text=buildReport(); try { await navigator.clipboard.writeText(text); window.MSGDebug.log('report','Debug report copied to clipboard'); } catch { const n=document.getElementById('dev-report'); n?.select(); document.execCommand?.('copy'); } }
  function bindDebug() {
    app.querySelector('[data-run-regression]')?.addEventListener('click', runRegressionSuite);
    app.querySelector('[data-copy-report]')?.addEventListener('click', copyReport);
    app.querySelector('[data-refresh-snapshot]')?.addEventListener('click', refreshSnapshot);
    app.querySelector('[data-toggle-probe]')?.addEventListener('click', (e) => { window.MSGDebug.eventProbe=!window.MSGDebug.eventProbe; e.currentTarget.textContent=window.MSGDebug.eventProbe?'Stop Event Probe':'Start Event Probe'; window.MSGDebug.log('probe',window.MSGDebug.eventProbe?'Event probe started':'Event probe stopped'); });
    app.querySelector('[data-add-bug]')?.addEventListener('click', () => {
      const title=app.querySelector('[data-new-bug-title]')?.value.trim(); if(!title)return;
      const list=localBugs(); list.push({ id:`LOCAL-${String(list.length+1).padStart(3,'0')}`, title, area:app.querySelector('[data-new-bug-area]').value, severity:app.querySelector('[data-new-bug-severity]').value, status:'open-local', notes:'Local browser-only bug note.' });
      localStorage.setItem('msg_debug_local_bugs_v1',JSON.stringify(list)); app.querySelector('[data-new-bug-title]').value=''; renderBugs(); updateReport();
    });
  }

  function renderFeatures() {
    const statuses = [
      ['idea','Ideas'],['planned','Planned'],['testing','Testing'],['in-progress','In Progress'],['complete','Completed']
    ];
    app.innerHTML = `<section class="dev-center"><div class="dev-shell">${chrome('features')}<div class="dev-card" style="margin-top:16px"><div class="feature-board">${statuses.map(([status,label])=>`<section class="feature-column"><h2>${label}<span class="dev-badge">${(D.features||[]).filter(f=>f.status===status).length}</span></h2><div>${(D.features||[]).filter(f=>f.status===status).map(featureCard).join('') || '<div class="dev-empty">No items</div>'}</div></section>`).join('')}</div></div><section class="dev-card" style="margin-top:16px"><h2>Product Development Rules</h2><div class="dev-build-row"><span class="dev-label">Protected baseline</span><span class="dev-value">Changes to Reader core or verified interactions should be isolated and regression-tested before promotion.</span></div><div class="dev-build-row"><span class="dev-label">Bugs vs. features</span><span class="dev-value">Bugs live in /?debug. New product work lives here.</span></div><div class="dev-build-row"><span class="dev-label">Stable promotion</span><span class="dev-value">A development build becomes stable only after the regression suite passes and the changed behaviors are manually verified.</span></div></section><div class="dev-footer">Roadmap data is source-controlled in developer-data.js.</div></div></section>`;
  }
  function featureCard(f) { return `<article class="feature-card"><strong>${esc(f.id)} · ${esc(f.title)}</strong><p>${esc(f.summary)}</p><div class="feature-meta"><span>${esc(f.area)}</span><span>${esc(f.priority)}</span>${f.route?`<span>${esc(f.route)}</span>`:''}</div></article>`; }

  document.body.classList.add('developer-route');
  document.querySelector('.site-header')?.setAttribute('hidden', '');
  document.querySelector('.site-footer')?.setAttribute('hidden', '');
  if (mode === 'debug') renderDebug(); else renderFeatures();
})();
