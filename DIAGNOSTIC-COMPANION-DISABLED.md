# Diagnostic build — companion enhancement disabled

Purpose: isolate browser lockups associated with the newer Mark/Beth companion persona layer.

Changes from v9.4.6 rollback base:
- Removed the `companion-persona.js` script include from root `index.html`.
- Removed the `companion-persona.js` script include from `public/index.html`.

No reader, right-click, walkthrough, Notebook, formatter, app runtime, or CSS files were modified.
The companion-persona JavaScript file remains in the package but is not loaded.
