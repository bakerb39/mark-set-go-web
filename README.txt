MARK, SET, GO! — TOPIC FEEDS PUBLISHER PAGE FIX

Replace only the ROOT server.js.

New source order for website feeds:
1. Publisher RSS/Atom feed
2. Publisher's own latest/news/article listing pages
3. Google News only as a final fallback

This specifically addresses sites such as Bitcoin Magazine where Google News RSS
returns encoded news.google.com wrapper URLs instead of direct publisher links.

After deploy, refresh the Topic Feed so old cached Google News URLs are replaced
by newly discovered direct publisher URLs.

No public files or Reader files are changed by this package.
