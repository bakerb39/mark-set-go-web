Mark, Set, Go! v7.15 — nonblocking Topic Feed refresh

Baseline: v7.14 parent-background-owner. Theme/workspace behavior is otherwise unchanged.

Changes:
- /api/topic-feeds/refresh now refreshes feed/headline data with prepare:false.
- scheduled morning refresh also avoids synchronous article extraction.
- Reader article warming runs fire-and-forget after the refreshed edition renders.
- background prefetch is bounded to 24 articles / 3 workers server-side; client warms up to 16 prioritized stories.
- local refresh no longer awaits article prefetch.
- old preparedAt is cleared when a new edition arrives.
- publisher extraction failures fall back to feed summary/headline/source/link rather than failing the open action.
- local article opens now pass feedText to the article preparation endpoint.
- Topic Feed button now says Refresh latest rather than promising a blocking download.

No bookmark, Reader timing/pagination, theme, ticker, or workspace architecture changes.
