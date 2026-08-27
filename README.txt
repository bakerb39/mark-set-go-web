RESTORE TO LAST KNOWN-GOOD TOPIC FEED BASELINE

Replace only:
  public/topic-feeds.js

This restores the external #reader-frame Topic Feed header implementation that:
- keeps Source / date / View original / share at the top;
- keeps the article actions with that external header;
- strips trailing Source + URL provenance from the article body;
- uses no MutationObserver;
- does not touch app.js, read-anything.js, Ask Beth, Media, or theme CSS.

This is a rollback/restoration only. No new fallback-card behavior is included yet.
