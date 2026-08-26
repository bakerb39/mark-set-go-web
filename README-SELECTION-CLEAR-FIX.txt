ASK BETH — RETURN TO WHOLE ARTICLE WHEN SELECTION CLEARS
========================================================

ROOT CAUSE
Ask Beth's older selection card can keep the previous quote after the Reader
selection has been cleared. The Hub sees that stale quote and continues treating
the conversation as Selected passage.

FIX
The article-mode bridge now treats:
  MarkSetGoCurrentReaderDocument.getSelectionRange()
as the authoritative selection state.

If that API exists and returns no selected text:
- the stale legacy passage quote is cleared;
- the stale passage card is hidden;
- the scope chip changes back to Whole article;
- the existing Ask Beth send handler therefore falls back to whole-article mode.

No competing chat owner is added.

IF YOU ALREADY HAVE THE v1.5.2 SCROLL FIX:
Replace only:
  repo root: apply-ui-cache-busters.js
  public/ask-mark-article-mode.js

TEST
1. Open a full article with nothing selected -> Whole article.
2. Highlight a passage -> Selected passage.
3. Click/deselect so the Reader highlight is gone -> should return to Whole article.
4. Ask a question -> should use the whole article.
5. Highlight again -> should immediately return to Selected passage.

Hard-refresh after deployment: Ctrl+Shift+R.
