CURRENT-OWNER FIX — ONLY TWO VISIBLE TOPIC FEED ISSUES

This was built from the current saved `topic-feeds.js` owner
(file generation matching the UI screenshots), not the newer/older alternate copies.

Replace:
  public/topic-feeds.js

Fix 1:
- Finds the actual yellow recovery card through its "Bookmarklet fallback" control.
- Moves that actual card to the end of #reader, immediately after the fallback
  article text ("Full article text could not be imported from the publisher.").
- Uses bounded retries only.

Fix 2:
- Removes the full-width cream/yellow strip behind
  "Summarize · Analyze · Comprehension".
- Keeps only small Reader-page-colored pads directly behind the action labels.

No app.js.
No read-anything.js.
No Ask Beth files.
No Media files.
No new MutationObserver was added.
