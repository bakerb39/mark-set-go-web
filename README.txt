MEDIA TOOLBAR — BESIDE ONLY
============================

Upload:

REPO ROOT
  apply-ui-cache-busters.js

PUBLIC
  public/media-toolbar-simplify.css   NEW
  public/media-toolbar-simplify.js    NEW

WHAT CHANGED
------------
Top media toolbar is simplified to:
  Media | Beside | existing utility icons / close

Removed:
  Expand
  top-level Save

WHY SAVE WAS REMOVED
--------------------
The old top-level Save button saved the currently playing media item to the
current book/article. That functionality already exists inside Media on each
search result, where Save is much clearer in context. Saved items remain under
"My saved media."

BESIDE BEHAVIOR
---------------
Beside places the player on the RIGHT side of the Reader, using the existing
side layout.

While it is beside the Reader, the button becomes:
  Float

so the reader has one obvious way to return it to a floating window.

Any previously saved "expanded" media mode is automatically migrated to the
normal Beside mode. No media playback/search/save database code was changed.

After deploy:
  Ctrl+Shift+R
