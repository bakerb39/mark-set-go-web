TOPIC FEED HEADER + READ WITH MARK COPY FIX

Upload to repo root:
  package.json
  apply-topic-feed-reader-fixes.js

Fixes:
1. Header overlap: measures actual header.bottom - firstText.top after layout
   and grows the spacer by the real overlap plus a small gap.
2. Fallback copy: Read with Mark Extension is recommended first;
   View original + Bookmarklet is the manual fallback.

Fresh browser key:
  /topic-feeds.js?v=20260827-v2.5.8-header-overlap-and-extension-copy

The patcher changes only those two exact blocks, syntax-checks topic-feeds.js,
and rolls back if validation fails.
