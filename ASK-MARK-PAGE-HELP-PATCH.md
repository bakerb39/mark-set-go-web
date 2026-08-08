# Ask Mark page-help patch

Adds a separate Ask Mark help button to non-Reader app pages.

Behavior:
- Uses current page key/title plus curated help topics.
- Answers only questions about how to use the current page/app feature.
- Refuses unrelated/general-knowledge questions in this mode.
- Hidden on the Reader so the existing Reader Ask Mark remains unchanged.
- No text selection/highlighting integration.
- No MutationObserver.
- No companion-persona layer.
- No right-click/contextmenu changes.

Files changed/added:
- index.html
- server.js
- app-help-mark.js
- app-help-mark.css
- public/index.html
- public/app-help-mark.js
- public/app-help-mark.css
