# Reader blank-surface click fix

The reader's protected click contract is now owned by the reading canvas (`#reader-frame`), not only the text article (`#reader`).

Protected behavior:
- Clicking a seekable word moves the reading position to that word/group.
- Clicking blank space anywhere in the reading canvas pauses when running and resumes when paused.
- Viewer controls, links, form controls, Ask Mark UI, overlays, and live text selections do not toggle playback.
- Spacebar behavior is unchanged.
- The four existing core reader modules are unchanged.

`npm run audit:reader` verifies the protected module hashes and these interaction invariants.
