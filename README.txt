Mark, Set, Go! v7.33.5 — Reader 2 layout polish

Updated files only. Copy the contents of public/ over the existing public/ folder.

Changes:
- Reader 2+ keeps the desktop Reader grid inside its iframe at half-pane widths,
  so Ask Beth/Mark opens beside the reading text instead of below it.
- Reader 2+ uses the same 320px companion-panel width as the primary desktop Reader.
- The companion panel keeps the normal desktop height behavior instead of the
  narrow-viewport stacked-panel height.
- Reader 2+ font-size stepper keeps its preferred themed styling but removes the
  dark seam between the minus and plus buttons.

Not changed:
- Multi-Reader state/session code
- Reader 2 blank-start behavior
- Half-screen workspace split logic
- app.js
- protected Reader engine modules
- Read Anything/storage

Expected build marker:
20260823-v7.33.5-reader2-layout-polish
