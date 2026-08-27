READ WITH MARK — EXTENSION-FIRST ARTICLE FALLBACK TEST
======================================================

This package is based on the current feature/ask-mark-premium-phase-1 branch
after the Ask Beth live-scope, media-toolbar, and white-title fixes.

WHAT THIS TEST DOES
-------------------
Normal topic/article server import remains FIRST.

Only when the Reader sees the existing incomplete-article condition:
  "Full article text could not be imported from the publisher."
or the existing publisher-restricted message,
the Reader checks whether the Read with Mark Auto Import extension is installed.

IF INSTALLED
1. Reader asks extension to recover the original article URL.
2. Extension opens that URL in an inactive temporary Chrome tab.
3. It waits briefly for client-rendered article text.
4. It extracts visible headings/paragraphs/quotes/list text.
5. It closes the temporary tab.
6. It returns the result to the Reader.
7. Reader opens the recovered text as the same topic/full article.

IF NOT INSTALLED OR RECOVERY FAILS
Nothing is removed. The current manual View Original / Read with Mark fallback
remains available.

ACCESS CONTROLS
---------------
This prototype intentionally does NOT attempt to bypass subscription/sign-in
walls, CAPTCHAs, paywalls, or other access controls. A visible subscription or
sign-in wall causes automatic recovery to stop.

WEB APP FILES TO UPLOAD
-----------------------
REPO ROOT:
  apply-ui-cache-busters.js

PUBLIC:
  public/read-with-mark-extension-fallback.js

EXTENSION INSTALL
-----------------
Use the included:
  read-with-mark-auto-import-extension-v0.1.0.zip

1. Download/unzip it.
2. Open chrome://extensions
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the unzipped read-with-mark-auto-import-extension folder.
6. Deploy the two web-app files above.
7. Hard refresh Mark, Set, Go! with Ctrl+Shift+R.

TEST
----
Open a topic/news story that currently produces:
  Full article text could not be imported from the publisher.

Expected:
- a small "Recovering full article with Read with Mark…" message;
- Chrome briefly creates an inactive publisher tab;
- the tab closes automatically;
- if readable text was exposed, the Reader replaces the incomplete story with
  the recovered full article;
- Ask Beth then treats it as a normal full topic article.

If the extension cannot recover it, the incomplete article remains and the
existing manual fallback is still available.

DEVELOPER CONSOLE
-----------------
Check:
  window.MarkSetGoReadWithMarkExtensionFallback.ready

Manual retry for the current incomplete article:
  window.MarkSetGoReadWithMarkExtensionFallback.retry()
