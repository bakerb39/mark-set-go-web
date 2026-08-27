READ ANYTHING — FINAL CACHE FIX
================================

This removes the duplicate Read Anything patcher that caused the Render crash.

UPLOAD TO REPO ROOT:
  package.json
  apply-read-anything-cache-finalizer.js   NEW

IMPORTANT:
Do NOT run apply-read-anything-extension-ui.js anymore.
It may remain in the repo, but package.json no longer calls it.

STARTUP ORDER
-------------
1. apply-beta-feedback.js
2. apply-ui-cache-busters.js
   - this remains the ONE script that patches the native Read Anything UI
3. apply-read-anything-cache-finalizer.js
   - does NOT patch UI
   - only forces a fresh browser URL
4. apply-topic-feed-performance.js

FINAL URL
---------
/read-anything.js?v=20260827-v2.5.10-rwm-native-final

EXPECTED RENDER LOG
-------------------
No:
  Read Anything installer could not find the current native Read with Mark card

You should see:
  read anything: final browser cache key -> 20260827-v2.5.10-rwm-native-final

After deploy:
  Ctrl+Shift+R

Verify:
  [...document.scripts].find(s => s.src.includes('/read-anything.js'))?.src
