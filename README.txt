MARK, SET, GO! — ARTICLES DEFAULT TO BOOK PAGES

This package is cumulative with:
- Reader-ready Topic Feeds
- article prefetch/cache
- bookmarklet capture fix
- inline "Summarize this article"
- automatic Format All for articles

Replace:
PUBLIC:
  public/read-anything.js
  public/index.html

The ZIP also contains the current server.js and topic-feeds.js for completeness;
they are unchanged by this specific adjustment.

NEW:
- Topic Feed articles, bookmarklet articles, and normal website imports now
  default to Book Pages mode when the active Reader mode supports Book Pages.
- The implementation uses the Reader's existing #book-pages checkbox/change
  handler, so normal pagination, position restoration, and saved Reader state
  continue to work through the existing Reader architecture.
- It does not force Book Pages if the current reading mode does not support it.
