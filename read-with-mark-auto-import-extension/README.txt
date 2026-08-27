READ WITH MARK AUTO IMPORT — TEST EXTENSION v0.1.0

PURPOSE
When Mark, Set, Go! opens a topic/news article whose server-side import is
incomplete, the web app can ask this extension to recover the original publisher
page automatically.

HOW IT WORKS
1. The normal Mark, Set, Go! article import runs first.
2. Only if the Reader contains the existing "full article could not be imported"
   message does the fallback run.
3. The extension opens the publisher URL in an INACTIVE temporary Chrome tab.
4. It reads the visible article/page text using Read with Mark-style extraction.
5. It closes that temporary tab.
6. It sends the text back to the already-open Reader.
7. The Reader replaces the incomplete article with the recovered full article.

ACCESS CONTROLS
This test extension does not attempt to bypass a subscription, sign-in wall,
paywall, CAPTCHA, or other access control. If it detects a visible paywall/sign-in
wall, it returns failure and leaves the existing manual fallback in place.

INSTALL
1. Unzip this extension folder.
2. Open chrome://extensions
3. Turn on Developer mode.
4. Click Load unpacked.
5. Select the unzipped read-with-mark-auto-import-extension folder.
6. Refresh Mark, Set, Go!.

For this test build, the bridge accepts these app hosts:
- mark-set-go-cloud-test2.onrender.com
- mark-set-go-cloud-test.onrender.com
- localhost / 127.0.0.1
- b2curious.com
- reader-symposium.com
