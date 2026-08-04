# Mark, Set, Go! v8.4.3 — My Library Freeze Fix

Replace only:

- `read-anything.js`
- `public/read-anything.js`

## Root cause
The Format-control fix created a `MutationObserver` on the entire document and left it active after navigating away from an imported reader. My Library performs many DOM updates, so the observer repeatedly queued format-control work and could saturate the browser main thread indefinitely.

## Fix
- Removes the global document observer.
- Uses a small, bounded set of attachment attempts only after an imported document renders.
- Performs no ongoing monitoring on My Library or other pages.
- Does not change the reader engine, pagination, playback, resume, viewport, or Book Pages.
