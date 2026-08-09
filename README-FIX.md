# Classic Guide toolbar + Action Center fix

Changes only:
- Keeps Classic/Modern Guide action buttons horizontal and wrapping at all viewport sizes via the final winning CSS rule.
- Adds a Classic Guide fallback interaction config so `Add to Action Center` saves a real action instead of silently returning when no Modern Guide-specific config exists.
- Makes Action Center source labels say `Classic Guide` for Classic Guides.
- Bumps CSS/JS cache keys in both root and public `index.html` so browsers do not keep the previous cached stylesheet/script.
- Root and public copies are synchronized.

No MutationObserver code was added or changed.
