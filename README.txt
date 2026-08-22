Mark, Set, Go! v7.18 — Topic Feed action occlusion band

Baseline: v7.17.

Only the Topic Feed header/action presentation changed:
- Keeps the v7.17 Source/share and action-row positioning.
- Restores the opaque compact band behind Summarize / Analyze / Create Post.
- Updates the band selector to the current DOM: the action row is a direct child of #reader.
- Keeps the band only as wide as the action labels plus a small buffer; it does not span the page.
- Cache-busts topic-feeds.js and experience-theme-layout.css in both the main app and workspace pane.

No changes to feed fetching/extraction, themes, workspace ownership, bookmarks, Reader timing, or pagination.
