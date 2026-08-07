# Protected Reader Behavior Contract

## Source of truth

`public/reader/ReaderLegacyRuntime.js` is a mechanical extraction of the reader runtime from the last known working monolithic `app.js` baseline. The extracted bytes are not rewritten or redesigned.

The original working monolithic `app.js` SHA-256 is:

`fccb0da5923ab16c72bf734ea5bf94a2232ada40d5bc10901f4bad0399412968`

The audit reconstructs that original monolithic file by reinserting `ReaderLegacyRuntime.js` immediately before `splitTranslationChunks()` in the extracted `app.js`. The reconstructed SHA-256 must match the baseline above.

## Protected behavior

The extracted runtime includes the working reader rendering and controls, including:

- blank-space click pause/resume behavior
- word-click seek behavior
- spacebar playback behavior
- reader rendering and mode switching
- Book Pages pagination and navigation
- fullscreen reader behavior
- viewport / cursor preservation logic
- bookmarks and dictionary interactions inside the reader
- reader illustration placement
- WPM/status updates
- start, stop, pause, and reset behavior

These behaviors must not be changed, refactored, relocated again, or rewritten unless the user explicitly requests a reader behavior change.

## Protected files

- `public/reader/BookModel.js`
- `public/reader/SessionManager.js`
- `public/reader/ReaderEngine.js`
- `public/reader/VirtualRenderer.js`
- `public/reader/ReaderLegacyRuntime.js`

Run `npm run audit:reader` before packaging or deploying any future change.
