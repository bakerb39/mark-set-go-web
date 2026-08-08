# Beth exact-image patch

This patch uses the exact Beth image supplied by the user as the single canonical Beth image throughout the app.

Canonical asset:
`/assets/companions/beth/beth-avatar.png`

Changed code:
- `companion-persona-safe.js`
- `public/companion-persona-safe.js`
- `companion-persona.js`
- `public/companion-persona.js`

All Beth image roles (avatar, home/frontpage, reading, pointing) now resolve to the same canonical `beth-avatar.png` asset.

Changed asset:
- `assets/companions/beth/beth-avatar.png`
- `public/assets/companions/beth/beth-avatar.png`

No MutationObserver code was added or modified by this patch. No Reader interaction/right-click code was modified.
