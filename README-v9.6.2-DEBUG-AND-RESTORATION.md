# v9.6.2 Debug + Restoration Build

This build intentionally preserves the confirmed right-click stale-listener fix and adds/restores:

- `/?debug` Debug Center with build manifest, bug catalog, runtime snapshot, event probe, exportable debug report, and automated regression suite.
- `/?features` roadmap for ongoing and future feature work.
- Global page-aware Ask Mark / Ask Beth help on non-Reader pages with avatar and a slightly higher floating button.
- Safe Mark/Beth profile selector using targeted event-driven updates only (no MutationObserver).
- First-person reading status: “I’m reading this…”
- Professional Read Anything smart-format layout.

Known unresolved issue retained in the bug catalog: Notebook mouse-wheel scrolling.

The right-click contextmenu behavior should be treated as protected. The confirmed fix resolves the live context menu at event time so stale listeners from previous Reader instances cannot close the new menu before its action fires.
