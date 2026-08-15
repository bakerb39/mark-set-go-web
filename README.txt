MARK, SET, GO! — TOPIC FEED BOOK PAGES FLOW FIX

Replace only:
  /public/topic-feeds.css
  /public/index.html

WHY A LEFT PAGE COULD LOOK BLANK

The Reader's normal Book Pages CSS uses:

  .reader.book-pages-layout .reader-group {
    break-inside: avoid;
  }

That is useful for some structured Reader content, but Topic Feed articles now
also have the small article controls/source/share header at the top.

For some stories, the first article group no longer fit in the remaining space
on page 1. Because the group was forbidden from splitting, the browser moved
the entire group to page 2, leaving almost all of page 1 blank.

FIX

For Topic Feed articles in Book Pages only:

  break-inside: auto

Article text can now continue naturally from the left page to the right page
instead of moving an entire paragraph/group to the next column.

NORMAL BOOKS ARE UNCHANGED.

PRESERVED:
- social/share icons
- source credit
- centered Book Pages divider
- My Topics sticky/open-close behavior
- My Topics scroll-position restoration
- Bookmark preservation
- music-under-WPM references

No app.js or protected Reader file is changed.
