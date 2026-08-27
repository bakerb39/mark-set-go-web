CORRECTED — TOPIC FEED + ASK BETH ACTIONS ONLY

Upload into public/:
- topic-feeds.js
- ask-mark-article-mode.js
- ask-mark-article-mode.css

Topic Feed:
- restores the newer stable external-header implementation
- Source/date/View original/share stays at the top before scrolling
- header is transparent at rest (no cream/card block)
- when article text scrolls, Source/share leaves and the compact actions remain
  as the first-page text ceiling using the Reader page color
- strips duplicate trailing Source/URL provenance from article text
- no MutationObserver added

Ask Beth Actions:
- Send to Chat
- Send to Symposium
- uses existing MSGContentShare APIs

This intentionally does NOT include:
- app.js
- read-anything.js
- media files
- old direct-owner topic-feeds.js
