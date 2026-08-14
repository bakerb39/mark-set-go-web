MARK, SET, GO! — GOOGLE NEWS ARTICLE RESOLVER

Replace:
server.js                      (ROOT)
public/topic-feeds.js
public/index.html

Why this is different:
The feed may still come from Google News. Instead of relying on refresh-time feed
discovery, clicking Read in Reader now sends the publisher website plus headline
to the server. If the article URL is a news.google.com wrapper, the server searches
the publisher's own Home/News/Latest/Articles pages for the matching headline,
uses that direct publisher URL, and then imports the article.

This specifically handles the symptom where the Reader still showed:
https://news.google.com/rss/articles/...

No Reader core files are changed.
