# Classic Guide / Modern Guide shared layout correction

This patch changes only the shared guide-action CSS.

Classic Guides already run through the existing Modern Guide Reader action renderer (`source.type = "modern-guide"` with `classicGuide: true`). The layout regression came from the responsive Modern Guide CSS forcing every `.modern-guide-inline-action` and `.modern-guide-action-word` to `width:100%` below 720px.

That rule is removed. Modern and Classic Guide actions now remain inline-flex and wrap naturally as a toolbar at narrow widths.

No Classic Guide content is removed or shortened. No Reader JavaScript, right-click behavior, Beth/Mark behavior, or MutationObserver code is changed.
