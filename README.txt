MARK, SET, GO! — VISIBLE READER MUSIC ICON

Replace only:
  /public/reader-music-quick.js
  /public/reader-music-quick.css
  /public/index.html

CORRECTION

The previous version inserted ♫ beneath the #speed field inside the Reader
settings toolbar. That control can be inside a collapsed Reader Controls panel,
so the icon was not readily visible.

The music icon now sits beneath the ALWAYS-VISIBLE Reader WPM stepper:

      −   300 WPM   +
              ♫

The existing .viewer-wpm-control DOM node is MOVED into a small wrapper, not
recreated, so the existing WPM − / + event handlers remain attached.

Clicking ♫ opens the existing Music & Focus chooser/player.

Playback still uses the existing:
  #music-dock
  #music-player

directly.

This package includes the JS and CSS again to guarantee the deployment has the
music implementation, and uses the latest Topic Feed index shell so current
Topic Feed fixes remain referenced.

NO app.js replacement.
NO styles.css replacement.
NO Reader core / Book Pages / Topic Feed JS changes.
