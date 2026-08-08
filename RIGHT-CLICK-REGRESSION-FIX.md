# v9.3.8 Right-click regression fix

## Problem
The walkthrough dimming masks used `pointer-events:auto`, allowing them to intercept pointer/context-menu events above reader content.

## Fix
The four walkthrough masks are now visual-only with `pointer-events:none !important`.

The walkthrough card, dock, mode picker, next/back/exit controls remain interactive through their existing pointer-event rules.

## Protected reader
No reader engine/runtime file was modified. This fix is isolated to walkthrough CSS/cache-busting.

## Regression checks
- Right-click a reader word: custom menu should appear.
- Look Up Word should open the lookup flow.
- Save Definition should work.
- Add Note should work.
- Add Bookmark should work and retain the bookmark visual.
- Run the walkthrough, including reader steps, then exit and repeat all tests.
- Walkthrough highlight remains topmost and does not capture pointer events.
