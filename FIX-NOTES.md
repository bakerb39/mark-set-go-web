# Current-baseline fixes

Applied to the exact uploaded `mark-set-go-web-feature-ask-mark-premium-phase-1 (2).zip` baseline.

## Corrected
- Reader title is capped at 21.6 px on a 1920 px desktop viewport and uses a compact professional serif treatment.
- Right-click no longer crashes on the undefined `chapterForWordIndex` reference.
- Right-click resolves indexed reader words and plain-text words used by the two-column renderer.
- `Look up word` opens the definition in Ask Mark.
- Personalization reads the actual `/api/auth/session` payload (`session.user`) while retaining compatibility with older `session.account` data.
- My Library's personalization scheduler no longer recursively calls itself.
- Changed assets use new cache-busting versions in `public/index.html`.

## Browser verification
Tested with headless Chromium against the real rendered DOM and mocked authentication/dictionary API responses:
- Reader title computed size: 21.6 px
- Right-click menu opened on a normal reader word
- Right-click menu opened on a plain-text two-column word
- Dictionary result appeared in Ask Mark
- Ask Mark greeting included `Brian`
- My Library displayed `Welcome back, Brian.`
- No page errors were reported during the test
