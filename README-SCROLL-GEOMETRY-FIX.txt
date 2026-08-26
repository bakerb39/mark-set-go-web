ASK BETH — SCROLL GEOMETRY FIX v1.5.2

This fixes the actual clipping shown in the screenshot.

ROOT CAUSE
The chat view was height:auto inside an overflow:hidden stage. Long responses
therefore enlarged the child behind the composer instead of overflowing inside
the conversation. A scrollbar could be styled perfectly and still never appear.

FIX
- Stage is a constrained 1-row grid.
- Active chat view is height:100% / max-height:100%.
- Conversation uses flex:1 1 0 and height:0 so it MUST take only the remaining
  space.
- Conversation is overflow-y:scroll.
- Chrome/WebKit scrollbar is explicitly display:block and 11px wide.
- Composer stays fixed in the bottom grid row.

If you already uploaded the v1.5.1 package, replace ONLY:
  repo root: apply-ui-cache-busters.js
  public/ask-mark-window.css

Then deploy and Ctrl+Shift+R.

No Ask Beth routing, selection behavior, article actions, or popup code changed.
