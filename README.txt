MARK, SET, GO! — READER QUICK MUSIC

Replace/add only:
  /public/reader-music-quick.js
  /public/reader-music-quick.css
  /public/index.html

WHAT IT DOES

A small floating ♫ button now appears at the bottom-right ONLY while the Reader
is open.

Clicking it opens a compact Reading Music panel with:

  - Now Playing, when music is active
  - Music attached to the current reading
  - Saved / preferred music
  - Quick Focus choices:
      Lofi Study Radio
      Sleepy Lofi
      Classical Reading
      Ambient Reading
      Deep Focus
      Rain & Focus
      Anime Lofi
      Classical Piano
  - Manage Music & Focus, which opens the existing full Music page

IMPORTANT

This does NOT create a second music system.

It calls the existing app.js:
  playMusic()
  playPreferredMusic()
  renderMusicLibrary()

and uses the existing #music-dock Spotify/YouTube player.

When the existing music player is open at bottom-right, the new ♫ launcher moves
above it automatically instead of covering it.

The quick panel is available on normal Reader pages and Topic Feed Reader pages.

NO app.js replacement.
NO styles.css replacement.
NO Reader engine / Book Pages / playback / annotation / Analyze changes.
NO Topic Feed logic changes.
NO companion changes.
