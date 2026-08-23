Mark, Set, Go! — Reader menu-only cleanup v1.1.1

Purpose
- Removes the old Reader 1 / Reader 2 tab strip from the Reader page.
- Reader switching stays in the top navigation/menu.
- Uses NEW asset names reader-menu.js / reader-menu.css to avoid stale reader-switcher.js caching.

Deploy
1. Replace index.html with the included index.html (or make the two equivalent asset-reference changes).
2. Add reader-menu.js and reader-menu.css.
3. Remove any old HTML references to reader-switcher.js or reader-switcher.v1.0.x.js/css.
4. Old reader-switcher files may remain on disk if nothing references them, but deleting them avoids confusion.

Defensive cleanup
- reader-menu.js removes any .reader-session-switcher markup left by v1.0.x.
- reader-menu.css hides legacy Reader-page switcher classes even if an old script tries to inject them.

Untouched
- app.js
- protected Reader engine modules
- workspace pane/runtime files
