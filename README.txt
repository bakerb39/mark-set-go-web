MARK, SET, GO! — CLEAN TOP-RIGHT READER CONTROLS

Replace only:
  /public/reader-music-quick.css
  /public/index.html

FIX

The previous version positioned the music icon absolutely above Full screen.
That meant the two controls were not actually in the same layout and could
overlap each other or the Reader.

This version removes the floating/absolute positioning entirely.

Music and Full screen now share one real vertical utility stack:

        ♫

  [ Full screen ]

- both are right-aligned;
- there is a consistent 10px gap;
- both stay in normal layout flow;
- neither can float over article text;
- the existing Full screen button/handler is unchanged;
- the existing music button/player behavior is unchanged.

No JavaScript is changed.
No app.js, Reader core, Topic Feed logic, Book Pages, or saved-playlist logic is changed.
