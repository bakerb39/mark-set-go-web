# Format Selector Cache Fix

The format selector already existed in app.js, but the previous patch did not include index.html.
The deployed page could therefore continue loading a cached /app.js?v=9.1.4.

This patch includes both root and public index.html and changes the app.js/styles.css cache-busting version to:

- app.js?v=9.1.5-format-selector
- styles.css?v=9.1.5-format-selector

Expected Search All Libraries controls:
- Search title or author
- Library source
- Best available / Plain text / EPUB / PDF
- Search
