MARK, SET, GO! — TOPIC FEED ARTICLE SPACING + FOOTER POLISH

Replace only:
  /public/topic-feeds.js
  /public/topic-feeds.css
  /public/index.html

CHANGES

1. ARTICLE START SPACING
   Adds one clean reading-line of space between the top source/share header and
   the first article paragraph.

2. END-OF-ARTICLE SOURCE + URL
   Keeps the imported provenance in the Reader text, but styles it as compact
   metadata:
   - subtle separator
   - smaller muted source line
   - slightly smaller/lighter raw URL
   - long URLs wrap cleanly

The footer remains part of the imported article text, so no content is silently
removed. The styling is reapplied when Reader mode/word-count changes rebuild
reader groups.

PRESERVED
- social share icons
- top source credit / View original
- Topic Feed Book Pages flow fix
- centered divider
- My Topics sticky/open-close behavior
- My Topics scroll-position restoration
- Bookmark preservation
- music-under-WPM references

No app.js or protected Reader file is changed.
