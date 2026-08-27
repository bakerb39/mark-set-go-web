READ ANYTHING — CACHE ORDER ROOT FIX
===================================

ROOT CAUSE CONFIRMED BY LIVE DIAGNOSTIC

The live server DOES contain the patched Read Anything source:
  servedFileHasExtension: true
  servedFileHasMarker: true

But the live page was loading:
  /read-anything.js?v=20260827-v2.5.7-native-extension-ui

That URL had already been used by an earlier deployment, so the browser could
continue using the old cached JS.

WHY IT HAPPENED

prestart previously ran:
  apply-read-anything-extension-ui.js
  THEN apply-ui-cache-busters.js

The dedicated installer correctly bumped read-anything.js, but the general
cache-buster ran afterward and changed its version BACK to:
  20260827-v2.5.7-native-extension-ui

FIX

prestart now runs:
  1. apply-beta-feedback.js
  2. apply-ui-cache-busters.js
  3. apply-read-anything-extension-ui.js   <-- LAST owner of read-anything.js
  4. apply-topic-feed-performance.js

The dedicated installer now uses a brand-new cache key:
  /read-anything.js?v=20260827-v2.5.8-native-rwm-extension-final

UPLOAD TO REPO ROOT
  package.json
  apply-read-anything-extension-ui.js

EXPECTED RENDER LOG
  read anything: native Read with Mark Extension UI already installed
  OR
  read anything: installed native Read with Mark Extension + Bookmarklet UI

AND:
  read anything: browser asset bumped to 20260827-v2.5.8-native-rwm-extension-final

AFTER DEPLOY

Do Ctrl+Shift+R once.

Optional console verification:
  [...document.scripts].find(s => s.src.includes('/read-anything.js'))?.src

It MUST end in:
  ?v=20260827-v2.5.8-native-rwm-extension-final

This is the root-cause fix; it does not add another runtime UI owner.
