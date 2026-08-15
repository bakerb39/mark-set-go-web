MARK, SET, GO! — TOPIC FEED BOOK PAGES DIVIDER FIX

Replace only:
  /public/topic-feeds.js
  /public/topic-feeds.css
  /public/index.html

The text columns were already in the correct places. The stale line was the
decorative Book Pages divider painted on the horizontally scrolling Reader
surface.

For Topic Feed articles only, this fix:
- hides that scrolling decorative divider;
- places a non-interactive divider on #reader-frame;
- centers it from the actual visible #reader rectangle;
- keeps it centered when My Topics opens/closes/resizes;
- updates it when Book Pages toggles and when the window/fullscreen size changes.

No Book Pages pagination or column-width calculations are replaced.
No app.js or protected Reader file is changed.

The My Topics close-race fix, bookmark preservation, and music-under-WPM
references remain in place.
