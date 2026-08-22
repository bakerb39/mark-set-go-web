Mark, Set, Go! v7.27 — storage quota repair

Overlay on the current v7.26 state. No server, theme, Chat, bookmark, Reader-layout, or Topic Feed header CSS changes.

Changed files only:
- public/app.js
- public/topic-feeds.js
- public/index.html (cache-key/build marker only)
- public/workspace-pane.html (cache-key only)

Fixes:
1. Topic Feed Reader documents are no longer duplicated as full article text in localStorage under markSetGoDocumentV1:*.
   They are cached in the app's existing IndexedDB reading-library store instead.
2. The Topic Feed localStorage cache is now a hard-bounded metadata cache (~220 KB target), not an unbounded copy of up to 180 large article records per topic.
3. If an older markSetGoTopicFeedsV1 value has already filled quota, saveLocalState retries with a much smaller metadata-only snapshot (~70 KB target), replacing the oversized cache.
4. A delayed startup rewrite shrinks legacy Topic Feed cache data without waiting for a manual refresh.

The cloud/server Topic Feed state remains authoritative and is unchanged.
