# Mark, Set, Go! Chat — workspace/theme correction v1.1

This corrects the four issues in the feature/ask-mark-premium-phase-1 branch:

1. Removes the old standalone BB Chat iframe integration from button-feedback.js.
2. Uses the name Mark, Set, Go! Chat.
3. Lets the existing workspace-experiment.js open Chat in the right-side frame.
4. Uses the actual --msg-theme-* variables defined by experience-themes.css.
5. Removes the dynamically generated top-level Themes button, while leaving the
   Profile theme controls intact.

## Replace / upload

At repo root:
- msg-chat-routes.js (if not already present)

Under public/:
- msg-chat.js
- msg-chat.css
- msg-chat-integration.js
- button-feedback.js  <-- replace the current file; this removes the old BB Chat iframe hook

Then follow INDEX-EDIT.txt and SERVER-EDIT.txt.

## Why workspace now works

The old button-feedback.js attached its own click handler to BB Chat and called
stopPropagation, so workspace-experiment.js never got to route it.

The corrected implementation uses an ordinary:
data-action="msg-chat"

The existing workspace layer already handles top-level data-action pages. Inside
the workspace iframe, msg-chat.js renders into that pane.

No MutationObserver is used.
