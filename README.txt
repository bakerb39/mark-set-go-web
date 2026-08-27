READ ANYTHING — READ WITH MARK DIRECT UI OWNER
================================================

This fixes the case where Read Anything still showed only the old:

  Read with Mark
  Import a full webpage...
  Show Bookmarklet

The new UI no longer depends on one particular navigation path firing the
install-UI enhancement.

UPLOAD

REPO ROOT
  apply-ui-cache-busters.js

PUBLIC
  read-anything-extension-card-owner.js   NEW

WHAT IT DOES

Whenever Read Anything is rendered, it ensures the page contains:

  Read with Mark Extension
  Recommended. Automatically recover readable full articles...
  ✓ Installed and connected
  Extension settings

followed by:

  Read with Mark Bookmarklet
  Manual fallback. Open any webpage...
  Show Bookmarklet

The extension card is inserted before the bookmarklet card.

The owner also:
- works when Read Anything is opened from a menu;
- works when it is rendered programmatically;
- works after workspace routing;
- updates Installed / Not installed status;
- provides its own extension setup if the existing helper is unavailable;
- rewrites the bookmarklet setup text as Manual fallback;
- uses no MutationObserver.

This does NOT change article extraction/recovery itself.

After deploy:
  Ctrl+Shift+R
  Reopen Read Anything.
