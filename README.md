# Mark, Set, Go! Chat — integrated build

This is NOT a separate app or repository.

It is designed to be copied into the existing `mark-set-go-web` repository.

## What it adds

- Top-level **Chat** option in Mark, Set, Go!
- In-app **Mark, Set, Go! Chat** page
- Multiple conversations
- 2-second polling / auto-refresh
- Message edit/delete
- Emoji reactions
- Photo paste/upload up to 5 MB
- Separate database tables:
  - `msgchat_conversations`
  - `msgchat_messages`
- Separate browser storage namespace: `msgchat.*`
- Theme-aware colors that automatically use the active Mark, Set, Go! CSS theme variables
- No MutationObserver
- No iframe
- No second Render service
- No changes to the existing `bbchat` repo or `bbchat_*` tables

## Files

Copy these three implementation files into the existing reading-app repository:

- `msg-chat-routes.js` → repository root
- `public/msg-chat.js`
- `public/msg-chat.css`

Then copy `apply-msg-chat.js` to the repository root and run:

```bash
node apply-msg-chat.js
```

The installer makes timestamped backups of `server.js` and `public/index.html`, then performs four small edits:

1. imports `msg-chat-routes.js`
2. installs its API routes before the existing catch-all route
3. loads `msg-chat.css` and `msg-chat.js`
4. inserts **Chat** immediately before **Profile**

It does not modify the reader engine.

## Database

The chat reuses the Mark, Set, Go! app's existing PostgreSQL connection. The tables are created on first chat API request.

Because the names begin with `msgchat_`, they are independent of the standalone BB Chat tables.

## Theme inheritance

No separate theme configuration is required. The chat CSS reads the active variables already applied to the Mark, Set, Go! document, including the Explorer/Antique/custom palette variables. Changing the app theme therefore changes the chat colors automatically.
