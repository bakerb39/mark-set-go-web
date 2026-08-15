MARK, SET, GO! — INLINE TOPIC FEED SOURCE CREDIT FIX

Replace only:
  /public/topic-feeds.js
  /public/topic-feeds.css
  /public/index.html

WHY THE PREVIOUS CREDIT WAS NOT VISIBLE

The previous version inserted the publisher/source credit under the Reader's
page title header (.reader-title-copy).

Book Pages and other immersive Reader views can show the article reading
surface without that title header being visible. That is exactly what the
screenshot exposed.

NEW PLACEMENT

The source credit is now inserted in the visible article Reader surface:

  Summarize · Analyze
  SOURCE  CoinDesk · Aug 14, 2026 · View original ↗
  [first article paragraph]

It is placed immediately after:
  #read-anything-article-summary-action

That is the same visible surface already used by the Summarize / Analyze links.

IMPORTANT

The source credit remains UI metadata. It is NOT inserted into currentText, so
it does not affect:
- Reader word count
- reading position
- playback
- highlights/annotations
- summaries
- Analyze article grounding

Normal books remain unchanged.
No app.js or protected Reader files are changed.
