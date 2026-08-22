# Mark, Set, Go! workspace theme parent-sync v1.5

This fixes the problem where choosing a theme from Profile while Profile is open
in the workspace changed only the right-side frame.

## Cause

Profile is rendered inside a same-origin workspace iframe. The theme control was
saving/applying the profile inside that iframe only. The Reader is in the parent
window, so its document never received the change.

## Fix

`profile-theme-fix.js` now:
1. Detects when it is running in a workspace pane.
2. Applies the selected theme to `window.parent` first.
3. Mirrors the theme to the iframe.
4. Has a postMessage fallback handled by the outer app.

`workspace-pane.html` now actually loads `profile-theme-fix.js`.

`workspace-pane-cache-refresh.js` is bumped so the new pane is not hidden by the
old iframe cache.

## Replace/upload

Inside public/:
- profile-theme-fix.js
- workspace-pane.html
- workspace-pane-cache-refresh.js
- button-feedback.js

The other files are included for completeness but do not need replacing if v1.4
is already deployed.

No MutationObserver is used.
