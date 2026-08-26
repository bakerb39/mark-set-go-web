ASK BETH — VISIBLE CHAT SCROLLBAR FIX

This is the conversation-first sidebar package plus one correction:

- Restores an always-visible vertical scrollbar on the Ask Beth conversation.
- The conversation remains the scroll owner.
- The composer remains fixed at the bottom.
- The old horizontal composer resize/drag handle stays removed intentionally.
- No article context, selection, popup, or send logic changed.

Upload:
  repo root/apply-ui-cache-busters.js
  public/ask-mark-window.css

If you have NOT uploaded the prior conversation-first package yet, you may simply
upload the complete contents of this ZIP instead.

Hard-refresh after deploy: Ctrl+Shift+R.
