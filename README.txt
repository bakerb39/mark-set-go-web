MARK, SET, GO! — TOPIC FEEDS PUBLISHER RSS FIX

Replace only:
server.js

Changes:
- Website sources now try to discover the publisher's own RSS/Atom feed first.
- If the site advertises a feed, Topic Feeds uses its direct publisher article URLs.
- Conventional feed paths such as /feed, /rss, /rss.xml, /feed.xml, /atom.xml and /index.xml are also tried.
- Google News remains only as a fallback for sites with no usable publisher feed.

No Reader files changed.
No public JS/CSS files changed.
