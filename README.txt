MARK, SET, GO! — HIGHLIGHT VS WHOLE-ARTICLE SCOPE FIX

Replace:
  /public/app.js
  /public/read-anything.js
  /public/index.html

INTENDED BEHAVIOR

If the reader HIGHLIGHTS text:
  Ask companion questions are based on the highlighted passage.

If there is NO real highlighted passage and the reader previously clicked Analyze:
  Follow-up questions are based on the COMPLETE original article.

Priority:
  1. Real highlighted passage
  2. Whole article Analyze context
  3. Existing normal Ask-companion behavior

The synthetic context created by Analyze is now explicitly marked
syntheticWholeArticle=true so it can never be mistaken for a real user highlight.

No Reader playback, pagination, Book Pages, or rendering logic changed.
