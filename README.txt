MARK, SET, GO! — READER MUSIC UNDER WPM FIX

Replace only:
  /public/reader-music-quick.js
  /public/reader-music-quick.css
  /public/index.html

The floating music launcher is removed.

A small ♫ button now appears directly beneath the Speed/WPM input.

The interaction layer has also been replaced. It now controls the app's
existing #music-dock / #music-player directly, so selecting a saved playlist
or Quick Focus choice immediately loads the existing Spotify/YouTube player.

The chooser includes:
  - music attached to the current reading
  - saved/preferred music
  - the existing Quick Focus choices
  - Manage Music & Focus

No app.js, styles.css, Reader core, Book Pages, playback, annotation, Topic
Feeds, or companion files are changed.
