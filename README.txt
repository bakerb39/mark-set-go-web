Mark, Set, Go! v7.33.2 Reader stability restore

Purpose
- Restores the actual v7.33.1 multi-Reader architecture after the later reader-menu overlay accidentally downgraded index.html to the v7.29 stack.
- Reader remains a normal direct navigation button.
- + remains the add-Reader control.
- Readers remains the separate Reader switching dropdown.
- New auxiliary Readers use the established v7.33.1 fresh/empty Reader boot path.
- Restores the richer Read Anything / article-actions file that was overwritten by the v1.2 reader-menu package.

Files intentionally NOT included or modified
- app.js
- protected Reader modules under public/reader/
- workspace-pane.html
- Reader engine/session internals

Legacy files reader-menu.js and reader-menu.css may remain in public/ but this index.html does not load them. They are inert.

Expected build marker after deployment:
20260823-v7.33.2-reader-stability-restore
