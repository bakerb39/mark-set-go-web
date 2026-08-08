# v9.4.1 Right-click-safe companion fix

## Regression in v9.4.0
The first Ask Beth persona layer observed `#app` and the entire `document.body` for all child/character changes. That was unnecessarily invasive for a reader with a custom context-menu lifecycle.

## Fix
- Removed both global MutationObservers completely.
- Companion updates are now event-driven after normal left-click/navigation UI actions.
- Reader text, reader words, and `.word-context-menu` are excluded from broad companion text rewriting.
- Known Ask Mark/Beth labels inside reader UI are updated only through targeted selectors.
- Walkthrough masks/highlight/connector layers are explicitly `pointer-events:none`.
- `.word-context-menu` and its controls are explicitly `pointer-events:auto`.
- No `contextmenu` handler is added and no companion listener calls `preventDefault()` or `stopPropagation()`.

## Protected reader
No ReaderEngine, VirtualRenderer, ReaderLegacyRuntime, or other protected reader runtime file was modified.
