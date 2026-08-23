Mark, Set, Go! v7.33.4 — Reader blank + half split

Updated from v7.33.3 only.

Fixes:
- Reader 2+ cannot read or overwrite Reader 1 persistent SessionManager checkpoint.
- Synthetic startup events cannot unlock Reader 2+ document loading; only trusted user interaction can.
- Reader 2+ still boots to renderEmptyReader().
- Selecting Reader 2+ in frame mode forces an initial split of at least half the usable workspace width.
- Dragging the divider immediately releases the forced initial split and restores normal resizing.
- Retains v7.33.3 tooltip, theme/button, Reader navigation, and article-action stability fixes.
- Protected Reader engine modules are untouched.
