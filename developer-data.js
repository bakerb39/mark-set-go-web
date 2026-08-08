(() => {
  'use strict';
  window.MSGDeveloperData = {
    build: {
      current: 'v9.6.4-companion-dedup-event-sync',
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
      { id:'BUG-004', title:'Companion profile state can fail to reflect Mark/Beth consistently', area:'Profile / Companion', severity:'medium', status:'fixed-chromium-verified', discovered:'2026-08-08', fixed:'2026-08-08', stableImpact:false, notes:'Companion-specific logic uses explicit targeted updates with no MutationObserver. Chromium verification confirms Beth/Mark Reader header, avatar, message author, and lookup badge stay consistent.' },
      { id:'BUG-005', title:'Global Ask Mark help restoration', area:'App Help', severity:'medium', status:'fixed-chromium-verified', discovered:'2026-08-08', fixed:'2026-08-08', stableImpact:false, notes:'Restored detailed page-aware help and companion avatar; Chromium behavior test confirms a single companion label target.' },
      { id:'BUG-006', title:'Duplicate Ask Mark/Ask Beth labels and mixed companion identity', area:'Companion UI', severity:'high', status:'fixed-chromium-verified', discovered:'2026-08-08', fixed:'2026-08-08', stableImpact:false, notes:'Button label now reuses its existing span; Reader companion markup and dictionary/legacy responses render from the selected companion at creation time. Verified in Chromium with Beth selected.' },
      { id:'BUG-007', title:'Word lookup produces duplicate companion responses', area:'Reader / Companion', severity:'high', status:'fixed-chromium-verified', discovered:'2026-08-08', fixed:'2026-08-08', stableImpact:false, notes:'Removed the duplicate rendered-menu action path and made the Ask Mark/Beth hub update one pending response in place. Chromium test verifies exactly one Word lookup companion message.' },
      { id:'BUG-008', title:'Beth home hero repeats embedded companion tagline', area:'Home / Companion', severity:'medium', status:'fixed-chromium-verified', discovered:'2026-08-08', fixed:'2026-08-08', stableImpact:false, notes:'Beth badge mode hides the separate HTML stage caption because the Beth artwork already contains the companion tagline. Chromium computed-style test verifies it is hidden.' },
      { id:'BUG-009', title:'Ask Mark hub used MutationObserver for legacy response synchronization', area:'Companion architecture', severity:'medium', status:'fixed-chromium-verified', discovered:'2026-08-08', fixed:'2026-08-08', stableImpact:false, notes:'Replaced the observer with explicit marksetgo:askmark-legacy-updated events dispatched by the Reader response lifecycle.' }
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
