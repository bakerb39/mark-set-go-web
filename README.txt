TOPIC FEED SCROLL-STATE FIX ONLY

Replace:
  public/topic-feeds.js

Built directly from the restored known-good external-header baseline.

Only change:
- restores a passive Reader scroll listener that toggles
  .topic-feed-story-header-scrolled when the Reader moves.
- this activates the existing CSS that prevents article text from bleeding
  above/through the Topic Feed header.

No MutationObserver.
No CSS replacement.
No fallback/recovery changes.
No app.js.
No read-anything.js.
No Ask Beth or Media changes.
