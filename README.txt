MARK, SET, GO! — VERIFIED PUBLISHER RSS PRIORITY

Replace only the ROOT server.js.

Verified official RSS feeds now take priority before any page crawling or Google News fallback:

CoinDesk
https://www.coindesk.com/arc/outboundfeeds/rss/

U.S. SEC press releases
https://www.sec.gov/news/pressreleases.rss

For other websites:
1. Try advertised RSS/Atom feeds.
2. Try common RSS/Atom paths.
3. Try the publisher's own latest/news/article pages.
4. Use Google News only as the final fallback.

Bitcoin Magazine is NOT hardcoded because an official RSS URL was not verified.
Its own article/news pages remain the preferred fallback before Google News.

After deploy, refresh the Topic Feed so CoinDesk and SEC items are rebuilt from
their official feeds rather than old cached Google News items.
