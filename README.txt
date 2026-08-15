MARK, SET, GO! — TOPIC FEED HEADER ORDER + GAP FIX

Replace only:
  /public/topic-feeds.js
  /public/topic-feeds.css
  /public/index.html

ROOT CAUSE

Read Anything's installArticleSummaryButton() intentionally enforces:

  #read-anything-article-summary-action.parentElement === #reader

If another script moves Summarize / Analyze somewhere else, Read Anything puts
it back at the top of #reader.

The prior Topic Feed patch moved that node into a nested header overlay, so
Read Anything later moved it back above the source row. The measured spacer was
then reserving space for a header structure that no longer matched the visible
DOM, which produced the large blank gap.

FIX

Do NOT move the action-row DOM node anymore.

Instead:

1. Source/share metadata stays in a small absolute overlay at the top of page 1.
2. Summarize / Analyze remains a direct child of #reader exactly as Read
   Anything requires.
3. Topic Feeds absolutely positions that existing row immediately beneath the
   source divider.
4. One ordinary spacer reserves ONLY:
     source row height
     + a small source-to-actions gap
     + actions height
     + one article-text line
5. Book Pages uses its existing resize/reflow path after that measured height
   changes.

VISIBLE ORDER

  SOURCE · Publisher · Date · View original          [share icons]
  ---------------------------------------------------------------
  Summarize · Analyze

  [one normal line]

  Article text...

This removes the unexplained large blank area and makes the action order match
the requested layout.

PRESERVED

- social share buttons
- source credit
- professional source/URL footer
- My Topics sticky/open-close behavior
- My Topics exact list scroll restoration
- Bookmark preservation
- centered Book Pages divider
- music icon beneath the visible WPM stepper

No app.js is replaced.
No read-anything.js is replaced.
No protected Reader file is changed.
