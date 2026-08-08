# Ask Mark Reader-return stale-reference fix

Fixes the case where right-click lookup works after returning to Reader but Ask Mark does not display the lookup result.

Cause: Ask Mark hub could retain detached `legacyHost` / `shell` references from the previous Reader DOM.

Changes only:
- `ask-mark-hub.js`
- `public/ask-mark-hub.js`
- cache-buster in `index.html`
- cache-buster in `public/index.html`

No Reader context-menu/right-click code, app.js, or CSS changed.
