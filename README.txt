MARK, SET, GO! — TOPIC FEEDS ARTICLE FIX

Replace these three files on feature/ask-mark-premium-phase-1:

public/index.html
public/topic-feeds.js
public/read-anything.js

Fixes:
1. Topic Feed articles now use /api/current/article, the existing article-aware
   extraction endpoint, instead of generic /api/fetch-text. This avoids opening
   the Google News wrapper as the article text and falls back to the feed summary
   when a publisher blocks extraction.
2. Import-history localStorage writes are now non-blocking. If browser storage
   is full, the app compacts/retries the tiny metadata history and, if necessary,
   skips history rather than preventing the Reader from opening.
3. public/index.html cache-busts both changed JS files.

server.js does NOT need to be replaced for this fix because the required
/api/current/article endpoint already exists in the current server.js.
