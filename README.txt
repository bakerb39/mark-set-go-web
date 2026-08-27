READ WITH MARK ARTICLE RECOVERY — RESTORED ON YESTERDAY'S TOPIC FEED

IMPORTANT
---------
public/topic-feeds.js is copied BYTE-FOR-BYTE from yesterday's working
topic-feed-boundary-gap-1px restore.

SHA-256:
07ce0350b1ab1ed534f6409bc2c830f7ff74c79a07985f97a99a8eee04fcef21

WEB APP — upload:
  repo root:
    apply-ui-cache-busters.js

  public:
    index.html
    topic-feeds.js
    read-with-mark-extension-fallback.js

CHROME EXTENSION:
  extension/read-with-mark-auto-import-extension-v0.1.1.zip

HOW IT WORKS
------------
1. Topic Feed opens normally using yesterday's working band/layout.
2. If the server returns an incomplete article with:
     "Full article text could not be imported from the publisher."
   the existing source.url is retained.
3. read-with-mark-extension-fallback.js detects that incomplete Reader document.
4. If Read with Mark Auto Import is installed, the app asks the extension to
   open the publisher URL in an inactive Chrome tab.
5. The extension extracts readable article text and returns it to the app.
6. The bridge reopens the recovered article as the SAME topic-feed document
   identity with fullArticle:true.
7. Subscription/sign-in walls are not bypassed.

TOP BAND
--------
No Topic Feed band/layout logic was added to topic-feeds.js.
No scrolling behavior was added.
No CSS was changed.
No Reader geometry was changed.

The only app-side addition is the separate recovery bridge script and its
script include.

EXTENSION UPDATE
----------------
Unzip v0.1.1, then chrome://extensions -> Reload the unpacked extension
(or Load unpacked from the new v0.1.1 folder).
