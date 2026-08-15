MARK, SET, GO! — MY TOPICS BOOK-PAGES + BOOKMARK FIX

Replace only:
  /public/topic-feeds.js
  /public/topic-feeds.css
  /public/index.html

FIX 1 — FIRST BOOK PAGES SPREAD / DIVIDER GEOMETRY

The Topic Feed Reader starts with the normal Reader side panes closed.
My Topics then restores the reader's preferred open state.

In Book Pages, that could happen before the saved Book Pages state had finished
applying. The initial two-page column geometry was therefore calculated at the
old center width. The next story/page caused a later reflow, which is why the
divider suddenly corrected itself.

The fix waits until:
  - My Topics is visibly open, AND
  - Book Pages is actually active,

then causes the EXISTING app.js #reader ResizeObserver to perform its canonical
Book Pages reflow at the final panel width.

It does NOT replace or duplicate Book Pages calculations.


FIX 2 — BOOKMARK BUTTON

The original Reader Contents view owns:
  #add-bookmark

and app.js binds the established addBookmark() handler directly to that button.

The previous My Topics implementation replaced Contents with innerHTML, which
destroyed that already-bound button.

The fix now:
  - captures the original #add-bookmark DOM node;
  - builds My Topics;
  - moves that SAME button into the My Topics header next to Manage.

Because it is the same DOM node, the original app.js bookmark listener remains
attached. Bookmark storage, positions, bookmark tab counts, and restore logic
continue through the existing Reader implementation.


SCOPE

No app.js is replaced.
No protected Reader files are changed.
No Book Pages formulas are changed.
No bookmark storage code is rewritten.
No Read Anything, Analyze, playback, annotation, companion, database, or music
code is changed.

The latest Reader Quick Music script/css referenced by index.html are preserved.
