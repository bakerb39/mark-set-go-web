# Verification — Classic Guides 21–40 + section quizzes

Baseline: exact user-uploaded `mark-set-go-web-feature-ask-mark-premium-phase-1 (7).zip`.

## Requested behavior

- Classic Guides 21–40 added in Great Books order after Herodotus.
- All 40 Classic Guides now contain one or more `Quiz me` checkpoints.
- A section-level `Quiz me` submits only the preceding substantive guide section to the existing `/api/comprehension` flow.
- The existing `Quiz me on the whole guide` action remains unchanged in purpose.
- Existing approved bottom action-toolbar CSS was not modified; horizontal/wrapping behavior is preserved from the current baseline.
- Root and `public/` copies are both included and matched.

## Checks actually run

- `node --check app.js`: PASS
- `node --check public/app.js`: PASS
- `app.js` / `public/app.js` parity: PASS
- `index.html` / `public/index.html` parity: PASS
- `styles.css` / `public/styles.css` parity: PASS
- Canonical Classic Guide count in root: 40
- All 40 canonical Classic Guide text files mirrored byte-for-byte to `public/`: PASS
- Guide word-count range: 8,836–9,398 words
- New 20 all within Modern Guide target range: PASS
- All 40 have section-level quiz checkpoints: PASS
- Total section quiz checkpoints: 1,027
- Every section quiz passage is 120–1,200 words, matching the existing comprehension endpoint limits: PASS
- First 20 existing guide texts preserved exactly after removing only newly inserted section-quiz markers: PASS
- Next 20 registry entries present: PASS
- New 20 metadata root/public parity + JSON validation: PASS
- Existing approved horizontal toolbar CSS byte-for-byte unchanged from uploaded baseline: PASS
- No new `MutationObserver` in app diff: PASS
- No right-click/context-menu code changed in app diff: PASS
- `public/reader/` directory unchanged from uploaded baseline: PASS
- `modules/reading/` directory unchanged from uploaded baseline: PASS
- `PROTECTED-READER-SHA256.txt` unchanged: PASS
- `READER-CORE-SHA256SUMS.txt` unchanged: PASS
- Runtime unit test of section boundaries, API payload, `guide_section` scope, render handoff, and button dispatch: PASS
- Root and public app cache-bust key updated: PASS
- Chromium regression: **SKIPPED BY USER FOR THIS REQUEST**
