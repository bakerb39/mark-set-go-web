# Guide quiz regression fix verification

Baseline: `mark-set-go-web-feature-ask-mark-premium-phase-1 (8).zip`

## Root causes fixed

1. Executing `public/app.js` did not recognize `[[MSG:SECTIONQUIZ]]`, so it rendered as literal text.
2. Executing whole-guide client still required exactly 4 questions while the current server defaults whole-guide quizzes to 10 and supports configurable counts through 25.

## Files changed

- `public/app.js`
- `public/index.html` (app cache key only)

The current `server.js` already contains the configurable whole-guide contract and was not changed.
No Classic Guide content files were changed.
No CSS files were changed.
No protected Reader module files were changed.

## Chromium regression

Chromium executable: `/usr/bin/chromium`

Because direct localhost navigation is blocked by the execution environment, the actual `public/index.html` runtime was loaded into Chromium with the app's local JS/CSS resources inlined. Only `/api/comprehension` was mocked deterministically for behavioral testing.

PASS:
- `[[MSG:SECTIONQUIZ]]` parsed as `sectionquiz`.
- Classic Guide render displayed `Quiz me` instead of the literal token.
- Clicking section `Quiz me` opened 4 questions.
- Whole-guide setup opened with default count 10.
- Whole-guide setup defaulted to Mixed mode.
- Generating the default whole-guide quiz rendered 10 questions.
- `Randomize another quiz` appeared.
- Zero Chromium page errors during the regression scenario.

## Static validation

- `node --check public/app.js`: PASS
- Section quiz parser/handler presence: PASS
- Whole-guide configurable setup presence: PASS
- Stale whole-guide `questions.length !== 4` validation removed: PASS
- Dynamic unanswered-question count: PASS
- Existing server default 10 / max 25 contract confirmed: PASS
- No new `MutationObserver` added by this patch.
