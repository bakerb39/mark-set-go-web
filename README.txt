MARK, SET, GO! — FINAL READER MUSIC / FULL SCREEN ORDER FIX

Replace all three:
  /public/reader-music-quick.js
  /public/reader-music-quick.css
  /public/index.html

ACTUAL BUG

The earlier script only placed Music before Full screen when the Music button
was first created.

If an older Reader render had already produced the controls in this order:

  Full screen
  Music

then subsequent versions found the existing Music button and did not reorder
the DOM. The later flex-column CSS correctly stacked the controls — but in the
stale, wrong child order.

FIX

On EVERY Reader render, JavaScript now explicitly enforces:

  1. Music
  2. Full screen

CSS also independently enforces:
  Music order: 1
  Full screen order: 2

There is now an 18px vertical gap for clear breathing room.

EXPECTED RESULT

        ♫


  [ Full screen ]

Both controls remain right-aligned.

PRESERVED

- IndexedDB My Music storage / quota fix
- compact playlist selector
- current Library menu click fix
- Topic Feed fixes
- fullscreen button's original app.js handler

No app.js or Reader core files are changed.
