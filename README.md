# v8.2.2 Bookmarklet handoff fix
Replace `server.js`, `read-anything.js`, `index.html`, `public/read-anything.js`, and `public/index.html` on the feature branch.

This removes the fragile query-string dependency. `/capture` now stores the captured article in same-origin localStorage; the import module consumes and clears it after app startup.
