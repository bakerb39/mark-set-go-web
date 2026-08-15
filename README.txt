MARK, SET, GO! — READER TOOLS + ANALYZE RECONCILIATION

This is a cumulative reconciliation package.

Replace these files:
  /public/app.js
  /public/styles.css
  /public/read-anything.js
  /public/ask-mark-hub.js
  /public/index.html
  /server.js

Restored:
- Highlight popup: Highlight, Write, Draw, Space, Erase, Explain, Summarize, Simplify, Context, Compare, Save, Ask companion.
- Persistent writing, drawing, and inserted Space/workspace annotations.
- Workspace move/resize and Book Pages width bounds.
- Reader double-click start/pause behavior from Reader annotations v8.
- Alt+double-click paragraph selection remains intact.

Preserved:
- Analyze follow-ups use the WHOLE ARTICLE when no real passage is highlighted.
- A real highlighted passage overrides whole-article context.
- Latest Summarize / Analyze restoration after refresh + Continue Reading.
- Latest chat question-anchor scrolling.
- Current companion / Chad / Topic Feeds / market functionality from the cumulative Analyze build.

Implementation note:
/public/app.js is the Reader annotations v8 app.js with only the newer Analyze runMarkAction routing merged into it. The later readerFrame dblclick suppression handler that caused the regression is intentionally not included.
