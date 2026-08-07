# Browse Recommended Starting Points UI

Baseline: working Browse format-selector build derived from reader-stable-2026-08-07.

Scope:
- CSS-only redesign of Recommended starting points.
- Hide the placeholder-style initial/letter block.
- Tighten card spacing and improve title/author/reason hierarchy.
- Keep existing Find full text actions unchanged.
- Keep existing Browse search and format selector unchanged.
- No app.js changes.
- No reader module changes.

index.html changes only the stylesheet cache key so browsers load the updated CSS.
