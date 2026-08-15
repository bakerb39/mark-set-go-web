MARK, SET, GO! — DIRECT ANALYZE FOLLOW-UP FIX

Replace:
  /public/ask-mark-hub.js
  /public/index.html

ROOT CAUSE FOUND IN THE ACTUAL CHAT OWNER

The premium threaded chat's send() function always did:
  runSelectionAction('ask', value)

And runSelectionAction() immediately requires highlighted selection text.

That is correct for normal Ask companion questions about highlighted passages,
but it is wrong after the article-level Analyze action. Analyze creates a
whole-article context, not a user-highlighted passage.

FIX

- ask-mark-hub.js now checks window.MSGInvestorArticleContext directly.
- If Analyze is active and there is no real highlight override, the premium
  threaded chat itself calls:
      POST /api/read-anything/article-followup
- It sends the COMPLETE article, initial analysis, recent conversation history,
  active companion, and the follow-up question.
- The answer is rendered directly into the same threaded chat bubble.
- The three-dot thinking bubble is replaced on success or error.
- No external chat interception/bridge is used anymore.
- The old whole-article-chat-bridge script load is removed to prevent duplicate
  requests.

SCOPE PRIORITY

1. Real highlighted passage -> existing passage Ask flow.
2. Analyze active + no real highlight -> whole-article follow-up.
3. Normal Ask companion behavior otherwise.

Also:
- Chad is now supported in ask-mark-hub.js's own fallback companion config.
- The top Reader companion button uses the active companion instead of a
  hard-coded Mark avatar/name.

No Reader playback, Book Pages, pagination, or reading-mode code changed.
