MARK, SET, GO! — TOPIC FEED FORCED-COLUMN FIX

Replace only:
  /public/topic-feeds.css
  /public/index.html

ACTUAL ROOT CAUSE

The Reader's normal Book Pages CSS contains a rule for structured books:

  .reader.book-pages-layout .reader-group.document-structure {
    break-before: column;
  }

That is useful for book chapters and major structural headings.

But some Topic Feed stories are automatically detected as structured content.
When the FIRST article line/headline receives .document-structure, Book Pages
forces it to begin on the NEXT column.

Result:
- Source/share header appears on the left page.
- Summarize / Analyze appears on the left page.
- The article is forcibly moved to the right page.
- The rest of the left page looks blank.

FIX

For Topic Feed Book Pages ONLY:

  break-before: auto !important;

Detected article headings can now begin naturally beneath the Topic Feed header
instead of being forced to the right page.

NORMAL BOOKS KEEP THEIR EXISTING CHAPTER/PAGE-BREAK BEHAVIOR.

PRESERVED

- Topic Feed editor lock
- source/share header order
- social sharing
- professional source footer
- My Topics panel behavior and scroll restoration
- bookmarks
- centered Book Pages divider
- top-right Music / My Playlists references

No app.js or protected Reader file is changed.
No JavaScript is changed by this fix.
