# Beth universal-image patch

This patch is rooted exactly at the application root (no wrapper directory).

Changes:
- Uses the user's exact supplied Beth image as `/assets/companions/beth/beth-universal-v1.png`.
- Active Beth references in app/companion/help code now use that one canonical URL.
- The four legacy Beth image files are also replaced byte-for-byte with the same supplied image, so older/static paths cannot show a different Beth.
- Root and `public/` copies are both included.
- `index.html` and `public/index.html` bump cache-busting versions for the affected active scripts.
- No Reader interaction/right-click behavior was changed.
- No MutationObserver code was added or modified.
