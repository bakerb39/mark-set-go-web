MARK, SET, GO! — MY TOPICS CLOSE FLICKER FIX

Replace only:
  /public/topic-feeds.js
  /public/index.html

ROOT CAUSE

Closing My Topics changes the Reader DOM. The Topic Feeds MutationObserver sees
that change and immediately runs the sticky-panel restore logic. Previously the
open/closed preference was saved on a later timer, so the observer could still
see "open" and reopen the panel before the close click had finished.

FIX

- Capture My Topics toggle / × clicks before app.js changes the layout.
- Save the user's desired open/closed state synchronously.
- Suppress automatic sticky restoration for 220ms while that user interaction
  settles.
- A user close/open always wins over the automatic default-open behavior.
- Book Pages geometry resync only runs after an explicit open, never while the
  user is closing the panel.

PRESERVED

- My Topics still defaults open for a reader who has never chosen otherwise.
- Explicit close remains remembered.
- Explicit reopen remains remembered.
- Bookmark preservation remains intact.
- First-spread Book Pages geometry fix remains intact.
- Reader Music under WPM references in index.html remain intact.

No app.js or Reader-core files are changed.
