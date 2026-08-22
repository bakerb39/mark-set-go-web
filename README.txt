Mark, Set, Go! v7.16 — Topic Feed Reader header/fallback cleanup

Changes from v7.15 only:
- Removes trailing Source/URL provenance from article text. Topic Feed header is the sole provenance/share location.
- Re-applies the Topic Feed header after marksetgo:document-available so Reader rebuilds cannot discard Source/date/share or the Summarize/Analyze/Create Post row.
- Extends header re-attachment retries for short/fallback documents.
- Uses short feed text before summary/link-only fallback when publisher full text is blocked.
- Client strips legacy trailing Source/URL blocks before opening the Reader, protecting against stale prepared payloads.
- Preserves v7.15 nonblocking refresh behavior and v7.14 theme/workspace baseline.
