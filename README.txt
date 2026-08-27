READ WITH MARK EXTENSION — READER INSTALL UI
============================================

This makes the working extension a visible, first-class feature inside Read Anything.

UPLOAD

REPO ROOT
  apply-ui-cache-busters.js

PUBLIC
  read-with-mark-extension-fallback.js
  read-with-mark-extension-install-ui.js      NEW
  read-with-mark-extension-install-ui.css     NEW
  downloads/read-with-mark-auto-import-extension-v0.1.1.zip  NEW

WHAT THE READER SEES
--------------------
Read Anything now includes:
  Read with Mark Extension
  [Installed and connected] or [Not installed]
  Set up extension

The setup panel provides:
- Download extension
- Copy chrome://extensions
- Check installation
- concise Chrome Developer Mode / Load unpacked instructions

IF AN ARTICLE FAILS AND THE EXTENSION IS NOT INSTALLED
------------------------------------------------------
The existing article stays intact, but the Reader briefly says:
  "Read with Mark can recover more full articles automatically.
   Set up the extension in Read Anything."

IF INSTALLED
------------
The card automatically changes to:
  ✓ Installed and connected

Chrome cannot silently install an unpacked extension from the website. This is
the correct test/development flow. Once the extension is published to the Chrome
Web Store, replace the download/setup flow with a normal Web Store install link.

The included extension ZIP is the working v0.1.1 HTML-cleanup build.

After deploy:
  Ctrl+Shift+R
Then open:
  My Library -> Browse -> Read Anything
(or your normal Read Anything route)
