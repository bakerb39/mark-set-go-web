# Mark, Set, Go! v7.21 — stability consolidation

This is an overlay for the current app; it is **not** a rollback.

It preserves the v7.14 theme/workspace ownership model and the v7.15+ nonblocking Topic Feed behavior, while repairing the regressions introduced afterward.

## Repairs
- Restores Mark, Set, Go! Chat in both the main app and workspace pane.
- Restores the Chat backend routes and existing `msgchat_*` database tables.
- Restores the Topic Feed action occlusion band for the current direct-child action-row DOM.
- Keeps Source/date/share at the top and retains publisher fallback text.
- Removes all `MutationObserver` usage from `public/topic-feeds.js`; synchronization now uses explicit document events, user interactions, ResizeObserver, timers, and resize events.
- Bumps the workspace pane cache token so existing panes reload the corrected loader stack.

## Deliberately untouched
- `public/app.js`
- Reader engine modules
- bookmarks
- v7.14 theme engine/CSS/background ownership
- workspace experiment layout
- music/ticker/companion code

Build marker: `20260822-v7.21-stability-consolidation`
