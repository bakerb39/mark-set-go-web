TARGETED FIX — ONLY THE TWO VISIBLE FAILURES

Replace these files in public/:
- ask-mark-article-mode.js
- ask-mark-article-mode.css
- topic-feeds.js

1) Ask Beth Actions menu
   Adds the missing Send to Chat and Send to Symposium menu items in the actual Actions-menu owner and uses the existing MSGContentShare handoff.

2) Topic Feed header/band
   Uses the newer direct-owner header implementation, keeps source/share/actions inside the Reader page surface, removes separate card styling, reserves body space so text starts below it, and replaces MutationObserver header watching with bounded deterministic retries.

No app.js replacement.
No read-anything.js replacement.
No media files.
No unrelated changes.
