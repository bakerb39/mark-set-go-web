Mark, Set, Go! — v4.7 Learning Side-Frame Comparison + Crypto Throttle

WHAT THIS ADDS
==============
1. Learn > Training Lab
   - Existing embedded-in-Ask-Beth behavior remains available.

2. Learn > Training Lab — Side Frame
   - Opens Training Lab in a 760px / max-52vw page-style right frame.
   - Reader remains visible.
   - Existing current Reader/highlighted-text exercise integration is preserved.
   - Active theme variables are inherited.

3. Learn > Ask Beth — Side Frame
   - Moves the LIVE existing Ask Beth/Beth/Mark shell into the same frame.
   - Existing handlers/conversation remain intact because the shell DOM node is
     moved, not cloned.
   - Closing the frame restores the shell to its original Reader panel.

4. Crypto ticker request protection
   - One immediate request when needed.
   - 5-minute client cache.
   - Dedupe overlapping requests.
   - Hidden tabs/workspace panes reuse cache rather than requesting fresh data.
   - HTTP 429 triggers a 15-minute cooling-off period.
   - Last successful ticker data stays visible during backoff when available.
   - Existing crypto-ticker.js itself is NOT replaced.

FILES TO REPLACE / ADD
======================
Replace:
- public/index.html
- public/modules/training/training-lab.js
- public/modules/training/training-lab.css

Add:
- public/learning-side-frame.js
- public/learning-side-frame.css
- public/crypto-ticker-throttle.js

NOT MODIFIED
============
- app.js
- server.js
- responsive-shell.js
- desktop-workspace.js
- workspace-experiment.js
- topic-feeds.js
- Reader engine files
- Profile/theme definitions
- permanent top band/header

NOTES
=====
The side-frame experiment deliberately does not alter the existing desktop
workspace/window code. It occupies the Reader's right-side grid slot only while
one of the two comparison frames is open, making rollback simple and avoiding
another workspace geometry regression.
