Mark, Set, Go! v7.17 — Topic Feed header positioning fix

Changes from v7.16 only:
- Fixes the actual Source/date/View original/share placement bug.
- topic-feeds.js appends the metadata node to #reader; v7.16 relied on external CSS to make it absolute.
- v7.17 explicitly sets that node to position:absolute !important at the calculated first-page top position.
- This prevents the intended top header from falling into normal Reader flow at the end of the article.
- No changes to article extraction, nonblocking refresh, themes, workspace ownership, bookmarks, Reader timing, or pagination.
