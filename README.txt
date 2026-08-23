Mark, Set, Go! — Reader menu v1.2.0 + Read Anything storage fix
2026-08-23

Replace these files in public/:
  index.html
  reader-menu.js
  reader-menu.css
  read-anything.js

Reader width fix
----------------
- Reader 1 is now the canonical visual width.
- Its actual rendered #app width is measured, not guessed.
- Reader 2/3/etc use the same measured width.
- The global 1400px .app-shell rule can no longer make additional Readers wider.
- Workspace panes remain excluded.
- No protected Reader engine files are changed.

Read Anything quota fix
-----------------------
- Full formatting records (original + transformed versions) are no longer written to localStorage.
- They are stored in IndexedDB: markSetGoReadAnythingFormatsV1 / records.
- Existing markSetGoReadAnythingFormatV1:* localStorage records are migrated asynchronously to IndexedDB and removed only after a successful IndexedDB write.
- The small document-to-format-key index remains in localStorage.
- Existing Reader rendering is not blocked while migration runs.

Build marker
------------
20260823-v7.29.5-reader-menu-storage

Expected asset versions
-----------------------
/reader-menu.css?v=20260823-v1.2.0
/reader-menu.js?v=20260823-v1.2.0
/read-anything.js?v=20260823-indexeddb-format-storage
