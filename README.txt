MARK, SET, GO! — MY MUSIC SAVE RELIABILITY FIX

Replace/add:
  /public/music-save-reliability.js
  /public/reader-music-quick.js
  /public/index.html

BUG

"Save to My Music" is rendered inside the Music & Focus page. That page is
frequently rebuilt with innerHTML. The original app binds a click listener
directly to #save-music-preferred after each render and silently swallows
localStorage write failures.

FIX

A delegated document-level capture handler now owns "Save to My Music."

It:
- survives every Music-page re-render;
- accepts Spotify and YouTube playlist/video links;
- honors the optional custom playlist name;
- writes directly to markSetGoPreferredMusic;
- detects duplicates;
- verifies the localStorage write actually succeeded;
- shows a clear Saved / Already saved / Error status;
- refreshes the Music page's "Your saved music" list after success;
- dispatches marksetgo:preferred-music-changed after a verified save.

The compact Reader "My saved playlists" menu listens for that event and
refreshes immediately in the same browser tab.

No app.js replacement.
No styles.css replacement.
No Reader core / Book Pages / Topic Feed JS changes.
