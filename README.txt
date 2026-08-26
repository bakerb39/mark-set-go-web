ASK BETH — CONVERSATION-FIRST SIDEBAR
=====================================

Upload these files:

REPO ROOT
  apply-ui-cache-busters.js

PUBLIC
  public/ask-mark-window.js
  public/ask-mark-window.css
  public/ask-mark-article-mode.js
  public/ask-mark-article-mode.css

WHAT CHANGES
------------
1. Expanded Ask Beth remains removed. Pop out is the large-chat option.
2. Docked Ask Beth becomes conversation-first:
   - compact ~58px header
   - conversation gets almost all remaining height
   - composer is permanently reserved at the bottom
   - textarea grows automatically; the old drag handle is hidden
3. The opening greeting is much smaller and disappears as soon as the reader
   begins typing.
4. The horizontal Explain / Summarize / Analyze / Simplify / Context / Compare
   strip is replaced by one compact Actions dropdown.
5. A dynamic context chip shows:
     Selected passage
   or
     Whole article
6. Typed questions AND Actions use the same existing Ask Beth composer owner.
   That preserves the intended rule:
     highlight exists -> selected passage
     no highlight     -> whole article
7. The startup cache-buster no longer patches ask-mark-hub.js into a
   whole-article-always owner. That competing patch has been removed.
8. The popup files are not replaced. The existing popup continues using the
   live Ask Beth session.

WHY THE ROOT FILE MATTERS
-------------------------
The previous apply-ui-cache-busters.js contained a startup patch that could
force normal article questions to whole-article context. This replacement
removes that patch and also gives the new sidebar files fresh cache versions.

TEST
----
After deployment, hard-refresh once (Ctrl+Shift+R), then:

A. Article with nothing highlighted
   - chip says Whole article
   - type a question
   - answer should use the article
   - Actions should use the article

B. Highlight a sentence/passage
   - chip changes to Selected passage
   - type a question
   - answer should focus on the highlight
   - Actions should focus on the highlight

C. Clear the highlight
   - chip returns to Whole article

D. Long answer
   - header stays compact
   - answer area scrolls
   - composer remains visible at the bottom

E. Pop out
   - popup still opens
   - docked panel hides while popup is active
