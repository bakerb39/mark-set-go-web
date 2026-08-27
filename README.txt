READ WITH MARK INSTALL UI — LOADER ORDER FIX

You did not miss an upload.

The public install UI JS/CSS files are already in the branch.
The problem was the root cache-buster ordering:

BROKEN:
  install UI JS after fallback JS
  BEFORE fallback JS had been inserted into clean index.html

FIXED:
  1. install UI CSS after read-anything.css
  2. extension fallback JS after read-anything.js
  3. install UI JS after extension fallback JS

REPLACE ONLY:
  repo root/apply-ui-cache-busters.js

Then deploy and hard-refresh with Ctrl+Shift+R.

Afterward, Read Anything should show:
  Read with Mark Extension
  Recommended...
  ✓ Installed and connected

and the old card should read:
  Read with Mark Bookmarklet
  Manual fallback...
