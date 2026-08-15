MARK, SET, GO! — CHAT QUESTION ANCHOR SCROLL

Replace:
  /public/ask-mark-hub.js
  /public/index.html

WHAT CHANGED

When a reader sends a question, the premium companion chat now scrolls so the
reader's question sits near the TOP of the chat viewport.

The answer then grows directly beneath the question.

This applies to:
- normal Ask companion questions based on highlighted text;
- whole-article follow-ups after Analyze;
- the typing/thinking state while the response is processing.

The previous behavior always scrolled to the bottom after appending the user
message, typing bubble, and response. That forced the reader to manually scroll
up to find the beginning of a longer answer.

No Reader playback, pagination, Book Pages, or reading-mode logic changed.
