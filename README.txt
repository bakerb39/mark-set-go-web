TOPIC FEED HEADER GEOMETRY FIX

Replace BOTH matched files:
  public/topic-feeds.js
  public/explorer-reader-shell.css

Why both:
The bug was a JS/CSS generation mismatch plus a geometry gap.

Corrected behavior:
- external Topic Feed header starts at the physical top edge of #reader;
- Reader top padding is inside the header instead of being an uncovered strip;
- scrolling text cannot bleed above the actions;
- Source/date/View original/share hides after scrolling;
- the occlusion surface uses the Reader's actual computed background color;
- no cream/yellow theme-variable band;
- no full-width ::before strip behind the action row;
- no MutationObserver.

No fallback/recovery changes.
No app.js.
No read-anything.js.
No Ask Beth or Media changes.
