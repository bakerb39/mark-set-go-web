MARK, SET, GO! — CAPTURE OPEN FIX

Replace:
ROOT:
  server.js

PUBLIC:
  public/read-anything.js
  public/index.html

What was wrong:
The new bookmarklet/capture flow fetched the capture token immediately, but
read-anything.js intentionally waited through several startup retries before
opening the Reader. The server deleted the capture on the first GET, so by the
time the Reader was ready the token no longer had content.

Fix:
- The client now waits until window.renderReaderWithText exists BEFORE fetching
  the token.
- The server keeps the short-lived capture available for retry until its 10-minute TTL.
- The capture hash is removed immediately after a successful Reader open.
- Retry window increased to 10 seconds for slower Render/browser startup.

This package is cumulative with the previous whole-article summary + Reader-ready
Topic Feeds changes.
