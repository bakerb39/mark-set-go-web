# v9.5.0 live reading-status wording fix

Single-scope correction on top of v9.4.9.

- Newly rendered companion status `Ask Mark is reading ...` becomes `Mark is reading ...` in Mark mode.
- Newly rendered companion status `Ask Mark is reading ...` / `Ask Beth is reading ...` becomes `Beth is reading ...` in Beth mode.
- The existing companion-panel-only MutationObserver now runs the existing status normalizer after async chat/status DOM insertion.
- No reader, selection, walkthrough, context-menu, right-click handler, or right-click CSS changes.
