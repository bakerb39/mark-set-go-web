# v8.4.2 My Library responsiveness fix

Replace only:

- `app.js`
- `public/app.js`

The change is limited to `renderMyLibraryHub()`.

## Cause

My Library synchronously parsed the complete stored text for the primary item and up to six recent items, then ran reading-difficulty analysis before the page's click handlers were attached. Large EPUB/PDF books and multiple web imports could block the browser main thread.

## Fix

My Library now displays only reading-profile badges already present in the profile cache. It no longer parses or analyzes complete documents while opening the library. Missing profiles can still be generated through the existing Reading Profile feature.

## Reader protection

No pagination, playback, cursor, viewport, pause/resume, Book Pages, or renderer function was modified.
