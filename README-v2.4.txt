MSG Reader Standard Mode Guard v2.4

FIX
---
Selecting Reader 2/3 in Standard mode could unexpectedly activate Desktop
Workspace because desktop-workspace.js re-checks the persisted
msg-workspace-layout-mode-v1 value after every Reader/menu click.

If an old/stale value was "desktop", the scheduled sync converted the current
Standard workspace into Desktop.

This package updates the existing desktop-workspace-resize-guard.js so:

- Reader selection/return while Desktop is NOT actually active normalizes the
  persisted mode back to "standard" before desktop-workspace sync runs.
- If Desktop Workspace IS actually active, Reader selection leaves it active.
- Existing synthetic-resize recursion protection is preserved.
- Reader 2/3 session isolation from v2.3 is preserved.
- No Reader resizing geometry is changed.
- No ReaderEngine, pagination, WPM, Topic Feed, or workspace divider changes.
- No MutationObserver.

UPLOAD
------
public/desktop-workspace-resize-guard.js
public/reader/SessionManager.js

TEST
----
1. Start in normal Standard mode.
2. Reader 1 -> Reader 2 -> Reader 3.
3. Confirm it stays Standard (no floating Desktop windows).
4. Load separate content into Reader 2 and Reader 3.
5. Open another normal page.
6. Return to Reader 2/3 and confirm their content remains.
7. Explicitly choose Desktop Workspace and confirm Reader selection remains in
   Desktop when Desktop was intentionally activated.
