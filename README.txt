MARK, SET, GO! — COMPACT TOP-RIGHT READER MUSIC

Replace only:
  /public/reader-music-quick.js
  /public/reader-music-quick.css
  /public/index.html

WHAT CHANGED

1. MUSIC ICON PLACEMENT
   The music button is anchored directly to the existing Full screen control.

   It is:
   - right-aligned with Full screen;
   - 10px above Full screen;
   - z-indexed above the Reader so it cannot disappear behind the reading area.

2. MUCH SMALLER MUSIC SELECTOR
   The existing music-dock header is now the only header.

   The bulky second "Reader / My Playlists" header and large chip/list layout
   are removed.

   The selector is a compact utility menu with dropdowns:

     My saved playlists   [ dropdown ]
     For this reading     [ dropdown ]  (only when applicable)
     Quick focus          [ dropdown ]

     Manage Music & Focus

3. PERSONAL PLAYLISTS
   My saved playlists still comes from the app's existing
   markSetGoPreferredMusic collection, including saved Spotify/YouTube items.

4. PLAYBACK
   Selecting an item immediately loads it into the existing #music-dock /
   #music-player. No second playback system is created.

PRESERVED

- existing Full screen DOM node and handler
- current Topic Feed editor lock
- compact My Topics header
- Book Pages fixes
- sharing/source metadata
- Reader core

No app.js, styles.css, or Topic Feed JS is changed.
