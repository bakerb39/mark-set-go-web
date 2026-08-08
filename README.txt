CLASSIC GUIDES -> READER UPDATE (patched onto your latest Beth-universal files)

This package was built from the exact app.js and index.html you uploaded in this turn.
It preserves your latest Beth/universal changes and only adds Classic Guide Reader integration.

UPLOAD PRESERVING PATHS:
  public/app.js
  public/index.html
  public/texts/classic-guides/*.txt

WHAT CHANGED:
- Great Books > Classic Guide is a button, not a standalone HTML link.
- The guide loads directly into the existing Reader using the proven Modern Guide action system.
- Classic Guide Reader header shows: Original Work | Great Ideas | Great Books Library | Grokipedia.
- [[MSG:DISCUSS]], [[MSG:IDEAS]], [[MSG:ACTION]], and [[MSG:QUIZ]] use the existing guide/Ask Mark machinery.
- Classic Guides are labeled Classic Guide in My Library/learning surfaces.
- Bundled Classic Guide text can be reconstructed for resume if needed.
- public/index.html cache-bust is now /app.js?v=9.6.10-classic-guides-reader.

NOT TOUCHED:
- reader engine modules
- right-click handlers
- highlighting
- bookmarks
- pagination/book pages
- playback cursor logic
- Beth companion scripts/config

The old public/classic-guides/*.html pages can remain on the server; the Great Books buttons no longer use them.
