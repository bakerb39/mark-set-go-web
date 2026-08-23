Mark, Set, Go! v7.33.6 — Primary Reader resize + close stability

Updated files:
  public/index.html
  public/workspace-experiment.js
  public/workspace-experiment.css

Changes:
1. Fixes Reader 1 collapsing to a narrow column after the last secondary Reader/workspace pane is closed.
   The inline !important Reader 2 half-split is now explicitly released before the workspace enters its closed state.
2. Adds a standalone Reader 1 resize grip on the right edge. Drag horizontally to resize; double-click the grip to restore the app's normal default Reader width. The selected width is remembered in localStorage.
3. Adds a themed × button to close Reader 1 when Reader 1 is the sole Reader. Closing preserves Reader continuity and returns to Home/background rather than deleting the reading checkpoint.
4. Keeps all v7.33.5 Reader 2 layout/theme polish intact.

Not changed:
- public/app.js
- read-anything.js
- protected Reader engine modules
- workspace-pane.html

No MutationObserver was added.

Expected build marker:
  20260823-v7.33.6-primary-reader-resize-close
