# Chromium verification — v9.6.5

Actual Chromium was launched in headless DevTools-protocol mode and the exact `companion-persona-safe.js` and `app-help-mark.js` from this build were executed in the page DOM.

Verified transition sequence:

1. Mark -> Beth
   - exactly one floating help button
   - exactly one label span
   - label: `Ask Beth`
   - avatar src: `/assets/companions/beth/beth-avatar.png`
   - avatar alt: `Beth`
   - button/avatar companion id: `beth`
2. Beth -> Mark
   - label: `Ask Mark`
   - avatar src: `/assets/ask-mark/ask-mark-avatar.png`
   - avatar alt: `Mark`
   - button/avatar companion id: `mark`
3. Mark -> Beth again
   - label and avatar both return to Beth together.

Result: PASS.

Implementation note: `app-help-mark.js` is now the exclusive owner of the floating app-help button label and avatar. `companion-persona-safe.js` no longer rewrites that button. No MutationObserver is used for this synchronization.
