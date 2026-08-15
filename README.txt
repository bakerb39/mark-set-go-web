MARK, SET, GO! — WHOLE-ARTICLE ANALYSIS FOLLOW-UP FIX

This package is cumulative with the current Topic Feeds / Ask Chad /
active-companion build.

Replace:
  /server.js
  /public/app.js
  /public/read-anything.js
  /public/index.html

WHAT CHANGED

1. ARTICLE LINK
   The article action now says:
     Summarize · Analyze
   instead of showing "Ask Chad", "Ask Mark", or "Investor analysis".

   The active companion still performs the analysis; the link itself is neutral.

2. FOLLOW-UP CHAT NOW USES THE WHOLE ARTICLE
   The prior bridge tried to squeeze article context into the Reader's legacy
   passage-selection route. That route was designed for highlighted passages,
   not an ongoing whole-article conversation.

   This fix adds a dedicated:
     POST /api/read-anything/article-followup

   Every follow-up after Analyze sends:
   - the COMPLETE imported original article;
   - the initial investor analysis;
   - the user's new question;
   - the recent follow-up conversation;
   - the active companion identity.

   The prompt explicitly requires the answer to synthesize the WHOLE ARTICLE,
   not the current paragraph, highlighted selection, visible page, or summary.

3. WHY THE TYPING DOTS COULD HANG
   The Reader's actual runMarkAction() previously began with:
     const selected = state.markSelection;
     if (!selected) return;

   So the companion UI could add the user's bubble and its typing animation,
   while the underlying Reader action silently returned before making an API
   request.

   runMarkAction() now recognizes an active whole-article analysis context and
   calls the dedicated follow-up endpoint instead.

4. CONVERSATION CONTINUITY
   Recent article-analysis follow-ups are retained in memory for that article
   so questions such as:
     "What's the bottom line?"
     "What would change your view?"
     "What risk matters most?"
   are understood as part of the same whole-article conversation.

5. CONTEXT SAFETY
   Opening another document clears the previous whole-article conversation,
   preventing a follow-up from accidentally using the wrong article.

No Reader playback, pagination, Book Pages, rendering, or reading-mode logic
was changed. The only core change is the Ask-companion request router.
