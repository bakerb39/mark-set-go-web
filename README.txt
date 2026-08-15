MARK, SET, GO! — COMPANION LABEL + ICON ROLLBACK

Replace ONLY:
  /public/companion-persona-safe.js
  /public/companion-chad.js
  /public/index.html

THIS FIX DOES NOT CHANGE ANY IMAGE ASSET FILES.

It restores the established companion icon mappings already used before:
  Mark -> /assets/ask-mark/ask-mark-avatar.png
  Beth -> /assets/companions/beth/beth-avatar.png
  Chad -> /assets/companions/chad/chad-avatar.png

Fixes:
- removes the duplicated "Ask Beth Ask Beth" label
- removes the bad temporary data-companion-label span
- restores the previous companion button/icon synchronizer
- keeps exactly one Mark/Beth/Chad Profile selector
- disables Chad's emergency duplicate Profile selector

No app.js, styles.css, Reader, Analyze, annotation, article, or chat-scroll files
are replaced by this package.
