# Chat workspace fix v1.3

This revision fixes the symptom where clicking Chat opened the Mark, Set, Go!
front page inside the workspace frame.

## Replace these files

- public/button-feedback.js
- public/msg-chat.js
- public/msg-chat.css

Keep:
- msg-chat-routes.js

If server.js has not yet been wired to msg-chat-routes.js, follow SERVER-EDIT.txt.

## Behavior

Top menu:
- shows simply **Chat**

Page title:
- remains **Mark, Set, Go! Chat**

Workspace:
- when the right pane is opened with:
  msgWorkspacePane=1
  msgWorkspaceMode=action
  msgWorkspaceValue=msg-chat

  button-feedback.js explicitly waits for msg-chat.js and calls:
  window.MarkSetGoChat.open()

This prevents the generic workspace startup from leaving the Home/front page
visible in the frame.

No MutationObserver is used.
