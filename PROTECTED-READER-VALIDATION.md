# Protected reader validation

The four protected reader files were compared byte-for-byte with the uploaded repository archive after the Read Anything work:

- `app.js` — unchanged from uploaded archive
- `public/app.js` — unchanged from uploaded archive
- `public/reader/ReaderEngine.js` — unchanged from uploaded archive
- `public/reader/VirtualRenderer.js` — unchanged from uploaded archive

Note: `PROTECTED-READER-SHA256.txt` in the uploaded repository contains older hashes for the two `app.js` copies. The current uploaded files already differed from those recorded hashes before this work began. This release therefore validates against the actual uploaded archive, not the stale manifest.
