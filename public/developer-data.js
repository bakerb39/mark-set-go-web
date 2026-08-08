(() => {
  'use strict';
  window.MSGDeveloperData = {
    build: {
      current: 'v9.6.3-ui-and-companion-corrections',
      channel: 'development',
      builtAt: '2026-08-08',
      latestStable: '2026-08-08-right-click-stable',
      stableBasis: 'reader-stable-2026-08-07 + confirmed stale-outside-listener right-click fix',
      protectedBaselines: [
        { area:'Reader core', status:'protected', baseline:'reader-stable-2026-08-07' },
        { area:'Right-click word tools', status:'verified', baseline:'2026-08-08 stale outside-listener fix' },
        { area:'Ask companion selection handoff', status:'protected', baseline:'current Reader flow' },
        { area:'Reading-position persistence', status:'protected', baseline:'current stable Reader' }
      ]
    },
    bugs: [
      { id:'BUG-001', title:'Notebook mouse wheel does not scroll', area:'Notebook', severity:'medium', status:'open', discovered:'2026-08-08', stableImpact:false, notes:'Notebook can scroll through other methods; wheel-specific diagnosis remains open. CSS and stale Reader cleanup did not resolve it.' },
      { id:'BUG-002', title:'Right-click actions fail after Reader navigation', area:'Reader', severity:'high', status:'fixed-verified', discovered:'2026-08-08', fixed:'2026-08-08', stableImpact:true, notes:'Root cause: stale document pointerdown listener closed over an old context menu. Fixed by resolving the live menu at event time. User verified.' },
      { id:'BUG-003', title:'Read Anything Format control crowds heading and controls', area:'Formatter', severity:'low', status:'fixed-pending-verification', discovered:'2026-08-08', fixed:'2026-08-08', stableImpact:false, notes:'Added explicit smart-format layout, spacing, button sizing, and mobile wrapping.' },
      { id:'BUG-004', title:'Companion profile state can fail to reflect Mark/Beth consistently', area:'Profile / Companion', severity:'medium', status:'fixed-pending-verification', discovered:'2026-08-08', fixed:'2026-08-08', stableImpact:false, notes:'Replaced broad DOM rewriting with targeted, event-driven companion updates. No MutationObserver.' },
      { id:'BUG-005', title:'Global Ask Mark help restoration', area:'App Help', severity:'medium', status:'fixed-pending-verification', discovered:'2026-08-08', fixed:'2026-08-08', stableImpact:false, notes:'Restored detailed page-aware help and companion avatar; button moved slightly higher.' },
      { id:'BUG-006', title:'Floating companion button renders duplicate label', area:'App Help', severity:'medium', status:'fixed-pending-verification', discovered:'2026-08-08', fixed:'2026-08-08', stableImpact:false, notes:'Persona label updater now reuses the existing label span instead of appending a second Ask Mark/Ask Beth label.' },
      { id:'BUG-007', title:'Global companion help returns duplicate answer', area:'App Help', severity:'high', status:'fixed-pending-verification', discovered:'2026-08-08', fixed:'2026-08-08', stableImpact:false, notes:'Added singleton initialization and in-flight submit guard so one question produces one request and one response.' },
    ],
    features: [
      { id:'FEAT-001', title:'Debug Center', status:'testing', priority:'highest', area:'Platform', summary:'Permanent diagnostics, bug catalog, stable-build manifest, runtime snapshots, event probes, and exportable debug reports.', route:'/?debug' },
      { id:'FEAT-002', title:'Automated regression suite', status:'testing', priority:'highest', area:'Quality', summary:'One-click and auto-run regression checks covering protected Reader contracts, right-click fix, companion safety, help assets, formatter assets, storage, duplicate IDs, and runtime errors.', route:'/?debug' },
      { id:'FEAT-003', title:'Features roadmap', status:'testing', priority:'high', area:'Platform', summary:'Source-controlled catalog of active, planned, and future product work.', route:'/?features' },
      { id:'FEAT-004', title:'Mark / Beth companion profiles', status:'testing', priority:'high', area:'Companion', summary:'Profile choice swaps companion identity using bounded targeted updates instead of global DOM observers.' },
      { id:'FEAT-005', title:'Global page-aware companion help', status:'testing', priority:'high', area:'Help', summary:'Ask Mark/Ask Beth help on non-Reader pages using stored page-specific product knowledge.' },
      { id:'FEAT-006', title:'Formatter refinement', status:'in-progress', priority:'high', area:'Reader / Imports', summary:'Professional formatting controls and intelligent cleanup for books, articles, and pasted text.' },
      { id:'FEAT-007', title:'Notebook wheel diagnosis', status:'planned', priority:'medium', area:'Notebook', summary:'Instrument wheel event path and identify the exact event cancellation or scroll-container mismatch.' },
      { id:'FEAT-008', title:'Language learning module', status:'idea', priority:'future', area:'Learn', summary:'Reading-linked language learning inspired by structured vocabulary, grammar, translation, and lesson workflows.' },
      { id:'FEAT-009', title:'Reader-safe companion architecture', status:'planned', priority:'high', area:'Architecture', summary:'Continue moving companion integrations to explicit APIs and lifecycle boundaries without touching protected Reader behavior.' }
    ]
  };
})();
