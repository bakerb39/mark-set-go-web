# Mark, Set, Go! Chat — definitive branch upload v1.2

Target branch:
`feature/ask-mark-premium-phase-1`

This package is intentionally designed around what is actually on that branch.

## Why the previous result still showed Themes and no Chat

The new msg-chat.js / msg-chat.css files had been uploaded, but public/index.html
never loaded them or created the menu entry.

At the same time, the existing public/button-feedback.js was still the OLD BB Chat
iframe integration, and public/experience-themes.js was still generating a Themes
launcher.

## What to upload/replace

Repository root:
- `msg-chat-routes.js`

Inside `public/`:
- `msg-chat.js`
- `msg-chat.css`
- `button-feedback.js`  **REPLACE the existing file**

You do NOT need to edit public/index.html for this version.

The replacement `button-feedback.js` is already loaded by your app. It now:

- removes the obsolete BB Chat menu/integration
- removes the top-level Themes launcher
- creates **Mark, Set, Go! Chat** before Profile
- loads `/msg-chat.css` and `/msg-chat.js`
- leaves the Chat button as a normal `data-action="msg-chat"` navigation item
  so the existing workspace system can open it in the right-side frame
- uses NO MutationObserver

## One unavoidable server wiring step

Follow `SERVER-EDIT.txt`.

The server cannot discover a new route module merely because the file exists.
`server.js` needs one require line and one install line.

## Expected behavior

When a Reader is open and Profile > Open pages in workspace is enabled:
- click **Mark, Set, Go! Chat**
- Reader remains on the left
- Chat opens in the right-side workspace frame

When workspace is disabled or no Reader is open:
- Chat opens as a normal Mark, Set, Go! page

The chat CSS uses the real `--msg-theme-*` experience-theme variables so its
colors follow Scholar, Patriotic, Artistic, Modern, Galactic, Expedition, etc.
