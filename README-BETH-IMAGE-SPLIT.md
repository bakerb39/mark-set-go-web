# Beth image split patch

- Homepage Beth image: `/assets/companions/beth/beth-frontpage-badge.png?v=9.6.8`
- All compact Beth avatars: `/assets/companions/beth/beth-avatar.png?v=9.6.8`
- `beth-reading.png` and `beth-pointing.png` are also restored to the fitted avatar portrait as a legacy safety net.
- Both root and `public/` assets are included.
- Query-string cache busting prevents a browser from reusing the previously overwritten Beth images.
- No Reader behavior, right-click behavior, or MutationObserver code was added or altered beyond Beth image path constants in the legacy companion file.
