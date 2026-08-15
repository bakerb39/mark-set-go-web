MARK, SET, GO! — STICKY MY TOPICS READER PANEL

Replace only:
  /public/topic-feeds.js
  /public/topic-feeds.css
  /public/index.html

CHANGES

1. MY TOPICS STAYS OPEN
   - Topic Feed Reader articles open with the left My Topics panel visible by
     default.
   - Moving from story to story keeps the panel open.
   - If the reader explicitly closes it with the My Topics toggle or × button,
     that choice is remembered.
   - Explicitly opening it again is remembered too.

2. ONLY ONE SCROLLBAR
   - The Reader's existing navigation-pane is the scrolling container.
   - The nested My Topics list no longer creates a second scrollbar.

3. CLEANER LABEL
   - "Marks & My Topics" is removed.
   - The panel header, Reader toggle, and Contents replacement all simply say:
       My Topics

SCOPE

No app.js is replaced.
No Reader engine, Book Pages, playback, annotation, Analyze, server/database,
or companion files are changed.
