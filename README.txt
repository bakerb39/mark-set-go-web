MSG four-issue targeted fix package

Replace these files in public/:
- app.js
- topic-feeds.js
- read-anything.js

Changes:
1. Read Anything: preserves pending-capture race fix; improves Read with Mark install/copy UI.
2. Topic Feeds: strengthens external header spacing without moving it into Reader; adds View Original / Read with Mark fallback copy.
3. Media: right-aligns controls only in Beside mode; accepts multiple YouTube search API result shapes.
4. Ask Beth/Mark: keeps Send to Chat / Discuss in Symposium actions and adds a late-load fallback event instead of silently doing nothing.

No MutationObserver was added.
No reader-core architecture was replaced.
