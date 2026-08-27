READ WITH MARK — EXTENSION-FIRST COPY UPDATE
=============================================

This updates the reader-facing language now that the extension works.

PRODUCT HIERARCHY
-----------------
Read with Mark Extension
  RECOMMENDED / automatic recovery

Read with Mark Bookmarklet
  MANUAL FALLBACK

READ ANYTHING
-------------
The extension card now explicitly says Recommended.

The existing bookmarklet card is relabeled:
  Read with Mark Bookmarklet
  Manual fallback.

The bookmarklet setup screen also explains that it is for pages where:
- the extension is not installed, or
- automatic recovery cannot retrieve the page.

INCOMPLETE ARTICLES
-------------------
Instead of leaving the reader with only:
  "Full article text could not be imported..."

the Reader now displays a persistent recovery notice.

If extension is NOT installed:
  Full article unavailable.
  Recommended: install Read with Mark Extension...
  Manual fallback: View original + Read with Mark Bookmarklet.

If extension IS installed but automatic recovery fails:
  Automatic Read with Mark recovery could not retrieve this page.
  Manual fallback: View original + Read with Mark Bookmarklet.

Actions in the notice:
  Install extension
  View original
  Bookmarklet fallback

If automatic recovery succeeds, the notice disappears.

UPLOAD
------
REPO ROOT
  apply-ui-cache-busters.js

PUBLIC
  read-with-mark-extension-fallback.js
  read-with-mark-extension-install-ui.js
  read-with-mark-extension-install-ui.css

No extension update is required for this copy change.
The existing v0.1.1 extension remains current.

After deploy:
  Ctrl+Shift+R
