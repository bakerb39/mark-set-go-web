Mark, Set, Go! — multi-Reader menu v1.1.0

What changed
- Removed the Reader 1 / Reader 2 / Reader 3 tab strip from the Reader canvas.
- Removed all switcher-specific Reader width handling.
- The existing top Reader button now opens a menu containing every open Reader and its current document title.
- The menu includes + New Reader.
- Selecting a Reader restores that Reader's independent document, position, controls, and viewport snapshot.
- Stable Reader numbering is preserved (for example Reader 1 and Reader 3 remain Reader 1 and Reader 3 if Reader 2 is closed).
- Workspace Reader behavior and protected Reader engine files are untouched.
- No MutationObserver is used.

Files to deploy
- public/index.html
- public/reader-switcher.js
- public/reader-switcher.css
