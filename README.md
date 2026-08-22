# v7.19 Chat backend hotfix

Backend-only repair for the v7.18 deployment.

Files changed:
- `server.js` — two-line Chat route wiring only, relative to v7.18.
- `msg-chat-routes.js` — restored integrated Chat backend.

No `public/` files are included.
No Topic Feed, Reader, theme, workspace, bookmark, or CSS files are changed.

The route module restores:
- conversations
- messages
- image messages
- edit/delete
- reactions

The module uses the existing `msgchat_conversations` and `msgchat_messages` PostgreSQL tables and creates them only if missing.
