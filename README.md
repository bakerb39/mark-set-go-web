# Mark, Set, Go! Chat — GitHub web upload package

This version is intended for the existing:

    bakerb39/mark-set-go-web

It is NOT a separate repo or Render project.

## Upload these NEW files

At the repository root:
- msg-chat-routes.js

Inside public/:
- msg-chat.js
- msg-chat.css

Then follow:
- SERVER-EDIT.txt
- INDEX-EDIT.txt

Those edits are deliberately tiny so you do not overwrite current versions of
server.js or public/index.html.

## Isolation from BB Chat

Mark, Set, Go! Chat uses:
- msgchat_conversations
- msgchat_messages
- msgchat.* browser storage

It does not use or alter the standalone BB Chat repository or bbchat_* tables.

## Theme behavior

The chat lives directly in Mark, Set, Go!, so its CSS consumes the active app
theme variables. Explorer / Antique / custom theme colors are inherited without
an iframe or a separate theme picker.

## No MutationObserver

This feature does not use MutationObserver.
