# Reader lifecycle stale-reference cleanup

This patch is based on the proven working right-click stale-outside-listener build.

## What changed
- Adds one idempotent `teardownReaderViewBindings()` cleanup path.
- Removes Reader-owned document-level keyboard/fullscreen listeners when leaving Reader.
- Disconnects the Reader fullscreen MutationObserver.
- Releases the old book-page ResizeObserver target.
- Clears the delegated dictionary action runner closure when leaving Reader, while preserving the proven singleton outside-click/right-click fix.
- Removes fallback fullscreen body state when leaving Reader.
- Calls teardown on normal navigation away from Reader, Help navigation, direct Prepare Book -> AI Center navigation, Home, and Global Notebook.

## What did NOT change
- The working `contextmenu` handler.
- The proven stale outside-click right-click fix.
- Reader rendering/playback algorithms.
- Notebook CSS or wheel behavior.
- Reader control CSS.

This is intended to eliminate detached Reader listeners/references as a class of navigation bug. It does not assume that the Notebook mouse-wheel issue is caused by a stale Reader listener; that can now be tested against a cleaner lifecycle.
