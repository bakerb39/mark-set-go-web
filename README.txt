MARK, SET, GO! — TOP-RIGHT MUSIC ONLY

Replace all three:
  /public/reader-music-quick.js
  /public/reader-music-quick.css
  /public/index.html

WHY THE OLD MUSIC BUTTON WAS STILL UNDER WPM

Some later Topic Feed packages carried forward the NEW v1.3 music asset URL in
index.html, but did not themselves include reader-music-quick.js/css.

If the actual music files on the server were still from v1.2, the old
under-WPM button continued to be created even though the index referenced v1.3.

This package includes the actual music JS and CSS again and makes the cleanup
defensive.

NEW RULE

There is exactly ONE Reader music launcher:

      ♫
  [ Full screen ]

at the top-right of the Reader.

On EVERY Reader render the script now removes:
- the old button below the visible WPM stepper;
- the old .reader-viewer-music-stack wrapper;
- the even older button beneath the hidden #speed field.

CSS also forcibly hides those legacy placements if stale DOM somehow survives.

MY PLAYLISTS

The top-right ♫ still opens:
- My saved playlists / preferred music first;
- music attached to the current reading;
- Quick Focus choices;
- Manage Music & Focus.

The existing Full screen DOM node and handler are preserved.

This package uses the latest current index shell, so the existing Topic Feed
editor lock, compact My Topics header, Book Pages fixes, sharing, source
metadata, and other current references remain intact.

No app.js, styles.css, Reader core, or Topic Feed JS is changed.
