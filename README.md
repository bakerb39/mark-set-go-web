# Mark, Set, Go! v7.22 — permanent Topic Feed header

Apply this overlay on top of v7.21.

Changed only:
- public/topic-feeds.js
- public/topic-feed-header-stability.css
- public/index.html (Topic Feed cache-bust + build marker only)
- public/workspace-pane.html (Topic Feed cache-bust only)

Behavior restored:
- Source/date/View Original/share and Summarize/Analyze/Create Post live in a permanent external header owned by #reader-frame.
- The article #reader scrolls underneath that header.
- The opaque action band never moves with article text.
- Summarize/Analyze/Create Post remain fully visible on hover/focus; hover only decorates the text.
- No MutationObserver is used.
- Existing Read Anything action nodes are MOVED, not cloned/rebuilt, preserving their click/hover handlers.

No server, Chat, theme engine, workspace runtime, Reader engine, bookmarks, ticker, or feed-refresh code is changed by this overlay.
