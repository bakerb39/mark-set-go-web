MARK, SET, GO! — TOPIC FEED HEADER + BOOK PAGES PAGINATION FIX

Replace only:
  /public/topic-feeds.js
  /public/topic-feeds.css
  /public/index.html

THIS FIX DOES TWO THINGS TOGETHER

1. AGREED HEADER ORDER

Topic Feed stories now begin visually as:

  SOURCE · Publisher · Date · View original          [share icons]
  ---------------------------------------------------------------
  Summarize · Analyze

  [one clean line]

  Article text...

2. FIXES THE OCCASIONAL BLANK LEFT PAGE

The earlier implementation placed the source/share row and the
Summarize/Analyze action row directly in #reader.

In Book Pages, #reader is the multicolumn pagination surface. Even though those
controls are not article text, they were still participating in column layout.
On some articles the first real paragraph could therefore begin in the right
column, leaving page 1 almost empty.

NEW APPROACH

- Source/share and Summarize/Analyze are rendered in an absolute story-header
  layer visually at the top of page 1.
- The EXISTING Summarize/Analyze DOM node is moved into that layer, so its
  established event handlers remain intact.
- A tiny measured spacer is the only thing left in article flow.
- The spacer reserves exactly the header height plus one reader-font line.
- When the header size or Reader width changes, the existing Book Pages reflow
  path is triggered so pagination/page counts stay canonical.

This keeps metadata/actions OUT of the article pagination calculation while
still making them look like part of page 1.

PRESERVED

- social sharing
- source credit
- small professional source/URL footer
- My Topics sticky panel
- close-race fix
- My Topics exact scroll-position restoration
- Bookmark preservation
- centered Book Pages divider
- music-under-WPM references

No app.js is replaced.
No protected Reader file is changed.
No Book Pages formula is duplicated or rewritten.
