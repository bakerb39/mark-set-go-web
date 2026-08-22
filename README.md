# Mark, Set, Go! Chat + Profile Theme fix v1.4

This fixes two separate problems at their actual source.

## 1. Chat showed Home/front page inside the workspace

The right-side workspace does NOT load public/index.html. It loads:

- public/workspace-pane.html
- public/workspace-pane-runtime.js

Those files did not load or route msg-chat.

v1.4 fixes that directly:
- workspace-pane.html now loads msg-chat.css and msg-chat.js
- workspace-pane-runtime.js directly calls MarkSetGoChat.open() for msg-chat
- workspace-pane-cache-refresh.js bumps the workspace pane build so the browser
  does not keep serving the old pane

## 2. Profile theme choices did nothing

public/profile-theme-fix.js delegates Profile theme clicks/change events to the
existing MarkSetGoExperienceThemes.apply() API.

It supports:
- Classic
- Explorer
- Patriotic
- Scholar
- Artistic
- Modern
- Galactic
- Expedition

The top-level Themes menu remains removed.

## Upload / replace

Repository root:
- msg-chat-routes.js (keep/replace with packaged version if convenient)

Inside public/ REPLACE:
- button-feedback.js
- msg-chat.js
- msg-chat.css
- workspace-pane.html
- workspace-pane-runtime.js
- workspace-pane-cache-refresh.js

Inside public/ ADD:
- profile-theme-fix.js

If server.js has not yet been wired to msg-chat-routes.js, follow SERVER-EDIT.txt.

No MutationObserver is used.
