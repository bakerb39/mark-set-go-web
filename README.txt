MARK, SET, GO! — READER-READY TOPIC FEEDS + BOOKMARKLET FIX

Replace:
ROOT:
  server.js

PUBLIC:
  public/index.html
  public/topic-feeds.js
  public/read-anything.js

Changes:
1. Article formatting
   - Publisher H2/H3/H4 section headings are preserved as Reader structure.
   - The existing Reader receives a documentToc so headings use native heading/section formatting.
   - Lists remain bullet items and paragraphs retain spacing.

2. Faster "Read in Reader"
   - Article bodies are cached server-side for 18 hours.
   - When a Topic Feed refreshes, recommended articles are prefetched before the
     edition is marked Reader-ready.
   - The remainder of the edition is warmed in the background.
   - Clicking an already prepared article uses the cache instead of crawling the
     publisher at click time.

3. Bookmarklet fix
   - /capture no longer tries to store the complete captured webpage in localStorage.
   - The server holds the capture briefly and redirects the new tab into the app
     with a one-time token.
   - This prevents the "Opening the captured content in Mark, Set, Go!…" page from
     getting stuck because localStorage is full.
   - New bookmarklet installs also preserve page headings as Reader sections.

Important:
- Existing bookmarklets should import again because the server-side handoff changed.
- To preserve heading structure from bookmarklet captures, reinstall/copy the
  latest "Read with Mark" bookmarklet from Read Anything after deploying.

Morning-edition note:
This build prepares articles when the Topic Feed refreshes. Because topic
definitions are still stored in browser localStorage, the server cannot prepare a
daily edition while the user is completely offline/away from the app. Fully
automatic pre-morning preparation requires moving Topic Feed configuration to the
account/database and adding a scheduled server job. That should be the next phase
if unattended morning editions are required.
