READ ANYTHING — DEDICATED STARTUP INSTALLER
===========================================

This replaces the unreliable cache-buster-only approach.

UPLOAD TO REPO ROOT:
  package.json
  apply-read-anything-extension-ui.js   NEW

WHAT CHANGES
------------
package.json now explicitly runs:

  node apply-read-anything-extension-ui.js

during both prestart and predev.

The installer directly patches:
  public/read-anything.js
and directly bumps:
  /read-anything.js?v=20260827-v2.5.7-native-rwm-extension
inside public/index.html.

EXPECTED RENDER LOG
-------------------
read anything: installed native Read with Mark Extension + Bookmarklet UI
read anything: browser asset bumped to 20260827-v2.5.7-native-rwm-extension

EXPECTED UI
-----------
Read with Mark Extension
Recommended. Automatically recover readable full articles...
Installed / Not installed
Install Extension / Extension Settings

Read with Mark Bookmarklet
Manual fallback...
Show Bookmarklet

The bookmarklet setup screen is also relabeled as a manual fallback.

WHY THIS SHOULD BE DIFFERENT
----------------------------
This installer is an explicit prestart command. It is no longer buried inside
apply-ui-cache-busters.js. If it cannot find the exact current native card, the
Render deploy fails with a specific Read Anything installer error instead of
silently serving the old UI.

TESTED
------
- installer JavaScript syntax checked
- installer executed against a mock of the current native card
- patched read-anything.js syntax checked
- required new labels verified
