READ ANYTHING — NATIVE EXTENSION UI FIX
=======================================

This is the definitive fix for the unchanged Read with Mark card.

WHY THE PRIOR FIXES DID NOT SHOW
--------------------------------
They were browser-side enhancement scripts attempting to alter a page after
public/read-anything.js had already rendered its original markup.

This version patches public/read-anything.js itself DURING THE RENDER BUILD.
That means the deployed source that renders Read Anything now directly contains:

  Read with Mark Extension
  Recommended...
  Installed / Not installed
  Install Extension

followed by:

  Read with Mark Bookmarklet
  Manual fallback...
  Show Bookmarklet

It also directly changes the bookmarklet setup text and owns the extension
setup/check-installation UI inside Read Anything.

UPLOAD ONLY
-----------
REPO ROOT:
  apply-ui-cache-busters.js

No new public file is required for this fix.

The build script:
- patches public/read-anything.js;
- bumps the read-anything.js browser version;
- removes the superseded runtime card-owner script from the built index;
- leaves the working extension recovery fallback intact.

EXPECTED RENDER LOG
-------------------
ui cache: patched native Read Anything extension/bookmarklet UI

Then:
  Ctrl+Shift+R
  close/reopen Read Anything

If the source was already patched on a later deploy, the log says:
ui cache: native Read Anything extension/bookmarklet UI already current
