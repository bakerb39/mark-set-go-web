MARK, SET, GO! — TOPIC FEED URL REPAIR

Replace all three files:

ROOT:
server.js

PUBLIC:
public/topic-feeds.js
public/index.html

Why this package is different:
- It does not depend on a successful feed refresh to repair old bad URLs.
- When Read in Reader receives a Google News, Google Tag Manager, W3/XML,
  analytics, metadata, or unrelated third-party URL, the server repairs it.
- The server first searches the publisher's own RSS/Atom feed for the matching
  headline and takes that feed item's canonical article <link>.
- Only if that fails does it try the publisher's own listing pages.
- CoinDesk is recognized even if the browser fails to send publisherUrl.
- Analytics/metadata URLs are never accepted as article URLs.
- The browser JS is cache-busted and explicitly sends the configured publisher URL.

This means existing cached CoinDesk entries containing googletagmanager.com can
be repaired when clicked; you do not have to recreate the Topic Feed first.
