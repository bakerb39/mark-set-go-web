MARK, SET, GO! — TOPIC FEEDS METADATA URL FIX

Replace only the ROOT server.js.

What this fixes:
- http://www.w3.org/XML/1998/namespace can no longer be treated as an article URL.
- schema.org, purl.org and xmlns.com metadata URLs are also rejected.
- When the app encounters one of those bad URLs, it uses the article headline
  plus the configured publisher site (CoinDesk, Bitcoin Magazine, etc.) to find
  the actual publisher article.
- Embedded RSS links are accepted only when they match the known publisher host.
- Existing cached Topic Feed items with the bad W3 URL can be retried; no feed
  recreation is required.

No public files and no Reader files changed.
