# Whole-guide quiz configuration patch verification

Runtime files changed:
- `server.js`
- `public/app.js`
- `public/index.html` (app cache key only)

Behavior contract:
- Whole-guide quiz defaults to 10 questions.
- User may choose any integer from 5 through 25.
- Mixed mode randomly combines prior questions with newly generated questions when prior history exists.
- New-only mode requests fresh questions and sends prior question stems as an avoidance list.
- Review-previous mode randomly samples stored whole-guide questions for that book and does not call the API.
- Section-level guide quizzes remain exactly 4 questions.
- Whole-guide question history is stored per document in browser localStorage, capped at 200 unique questions per document.
- `Randomize another quiz` returns the user to the whole-guide setup screen.

Checks run:
- `node --check server.js`: PASS
- `node --check public/app.js`: PASS
- Static count/limit contract: PASS
- Section quiz 4-question contract present: PASS
- Chromium 144 functional test using the actual modified whole-guide functions: PASS
  - default: 10 / Mixed
  - New only 25: request 25, render 25
  - Mixed 10 with history: request 5 new + sample 5 old, render 10
  - Review previous 5: zero network request, render 5 prior questions
- Chromium visual rendering with the production app stylesheet: PASS
- No guide text files changed.
- No CSS files changed.
- No Reader module files changed.
- No new MutationObserver introduced by this patch.
- ZIP integrity: PASS

Chromium environment note:
Direct navigation to localhost is blocked by the execution environment's organization policy. Chromium verification therefore loaded the production stylesheet and the exact modified quiz functions through the Chrome DevTools Protocol into a browser document and exercised the actual controls and generation logic there. This is a real Chromium execution, but not a localhost end-to-end server navigation.
