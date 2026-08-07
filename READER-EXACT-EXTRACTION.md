# Reader Exact Extraction — v9.2.0

The reader runtime was moved out of `app.js` without rewriting its implementation.

`ReaderLegacyRuntime.js` contains the exact contiguous reader block from the last known working `app.js`, beginning with `renderReaderWithText()` and ending immediately before `splitTranslationChunks()`.

The extracted app + runtime can be mechanically recombined to reproduce the exact SHA-256 hash of the working monolithic baseline.

This is intentionally a conservative extraction. Shared application state remains in `app.js` for now. Future cleanup should not alter the reader runtime unless explicitly authorized.
