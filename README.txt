MARK, SET, GO! — ANALYZE LINK + ANALYSIS RELIABILITY FIX

Replace:
  /server.js
  /public/read-anything.js
  /public/companion-chad.js
  /public/index.html

WHAT WAS ACTUALLY WRONG

1. "ASK CHAD" KEPT COMING BACK
   companion-chad.js still had explicit code that changed the article's
   [data-action="investor-analysis"] link to "Ask Chad" every time the companion
   UI synchronized.

   That override is removed. The article action is now always:
     Summarize · Analyze

2. ANALYSIS COULD STAY ON "CHAD IS ANALYZING..."
   The initial investor-analysis route used a strict structured-output schema
   with medium reasoning. It has been replaced with the same simpler/reliable
   request pattern used by the working whole-article summarizer:
   - low reasoning effort
   - plain text response
   - deterministic section parser on the server
   - same structured object returned to the existing UI
   - 80-second server timeout
   - 90-second client timeout with a visible error instead of endless loading

3. WHOLE-ARTICLE CONTEXT BUG
   primeInvestorFollowupContext() referenced originalText outside its scope.
   That is fixed. The complete original article is now correctly stored in the
   active Analyze conversation context.

4. COMPANION IDENTITY
   The initial Analyze request now explicitly sends the active companion id
   instead of depending on a later fetch wrapper to inject it.

SCOPE
- Analyze = whole original article.
- Follow-up with no real highlight = whole article.
- If the user highlights a passage, that real highlight still wins and Ask
  companion answers from the highlighted passage.

No Reader playback, Book Pages, pagination, or reading-mode logic changed.
