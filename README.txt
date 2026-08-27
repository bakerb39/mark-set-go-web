CENTER OF THE UNIVERSE FIX

Replace BOTH:
  public/topic-feeds.js
  public/explorer-reader-shell.css

Hard invariant now encoded in code:
- Topic Feed top band is locked after creation.
- No scroll listener or scroll-state class changes the band.
- Source/date/View original/share never hides.
- Band background never changes.
- Band does not move/resize because of scrolling/app state.
- Legacy yellow/cream action-row backgrounds and pseudo-elements are neutralized.
- A separate .topic-feed-story-content-mask sits beneath the band and above the
  Reader article text. That mask hides text as it scrolls underneath.
- The mask may adapt. The band may not.

No MutationObserver.
No fallback/recovery changes.
No app.js/read-anything.js/Ask Beth/Media changes.
