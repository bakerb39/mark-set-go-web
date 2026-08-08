# v9.3.9 target-aware Mark pointing

Built directly on `v9.3.8-right-click-regression-fix`.

- Preserves the v9.3.8 right-click regression fix.
- Removes the duplicate-arm approach.
- Uses the existing single Mark illustration only.
- Repositions Mark continuously so the actual fingertip lands on the active walkthrough highlight.
- Mirrors the illustration for left-side targets, so Mark can point to controls on either side of the screen.
- Uses `!important` inline presenter coordinates because earlier walkthrough CSS has `!important` default positioning.
- Does not modify protected reader/right-click runtime code.
