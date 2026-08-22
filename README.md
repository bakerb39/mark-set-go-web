# Mark, Set, Go! Chat display-name fix v1.6

This fixes the case where entering a display name and clicking Continue appears
to do nothing.

## Cause

The Continue button depended on the <dialog> form submit path. In the workspace
environment that path was not behaving reliably.

## Fix

Continue is now an explicit type="button" with its own click handler.

Clicking Continue now directly:
- reads and trims the display name
- saves it to msgchat.displayName
- updates the visible "Chatting as" label
- closes the dialog
- returns focus to the message composer when available

Pressing Enter in the display-name field also uses the same function.

## Replace

Only this file is required if v1.5 is already deployed:

- public/msg-chat.js

Other files are included only for convenience.

No MutationObserver is used.
