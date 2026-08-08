# Right-click menu action delegation fix

Scope: fixes the custom word-menu action buttons after leaving Reader and returning.

- The existing `contextmenu` / menu-open handler is unchanged.
- Menu actions resolve the currently connected `#word-context-menu` at click time.
- One delegated pointer/click bridge lives on `document`, so replacing the Reader/menu DOM cannot orphan the Look up word handler.
- Diagnostic `[RC-DIAG ...]` logging is retained for verification.
- No CSS, Ask Mark UI, companion persona, Notebook, or Reader rendering changes.
