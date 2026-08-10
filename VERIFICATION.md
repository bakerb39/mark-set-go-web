# Classic Guides 40 — horizontal section quizzes / toolbar verification

Built from the user-supplied full ZIP `mark-set-go-web-feature-ask-mark-premium-phase-1 (7).zip`, with the prior 40-guide content overlaid, then corrected in the executing `public/` runtime only.

## Required implementation

- Classic Guide action renderer uses the same Modern Guide JavaScript structure; only the CSS class prefix changes from `modern-guide-*` to `classic-guide-*` when `source.classicGuide` is true.
- Classic Guide CSS is a direct copy of the final Modern Guide horizontal action contract with only the class prefix changed.
- Both Modern and Classic visible discussion labels read `Discuss with reading companion`.
- Section source markers are on one source line: `[[MSG:DISCUSS]] [[MSG:SECTIONQUIZ]]`.
- Bottom source markers exactly replicate the Modern Guide generator pattern: `[[MSG:IDEAS]] [[MSG:ACTION]] [[MSG:QUIZ]] [[MSG:BUY]]`.

## Checks performed

- 40 canonical Classic Guide text files: PASS
- Section quiz checkpoints across 40 guides: 1027 total; 14–33 per guide: PASS
- Exactly one whole-guide quiz marker per guide: PASS
- Bottom action marker row on one source line for all 40: PASS
- Public app.js Node syntax check: PASS
- Classic Guide renderer class-prefix logic: PASS
- Visible `Discuss with reading companion` label: PASS
- Classic CSS primary layout properties exact-copy Modern Guide: PASS
- Root app.js/styles.css/index.html left unchanged: PASS
- Protected `public/reader` and `modules/reading` directories unchanged from supplied baseline: PASS
- MutationObserver occurrence count in public/app.js unchanged from supplied baseline: PASS (none added)
- Chromium computed geometry: PASS
  - Section Discuss + Quiz me: same Y coordinate
  - Bottom first three actions: same Y coordinate
  - Buy wraps to next row at the tested width because the four-button total does not fit
  - Modern Guide reference produces the same horizontal/wrapping pattern
- Chromium screenshot visually inspected: PASS
- ZIP integrity: performed after packaging

Chromium navigation to localhost/file URLs is blocked by the environment's administrator policy. To still execute the real Chromium layout engine, the executing `public/styles.css` and exact runtime action markup were injected into a Chromium page through DevTools `Page.setDocumentContent`; computed bounding boxes and a screenshot were then captured from Chromium itself.
