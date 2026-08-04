# Mark, Set, Go! v8.4.0 — Selected Web Passage Capture

This incremental update extends the existing **Read with Mark** bookmarklet.

## Behavior

- Highlight text on a webpage and click **Read with Mark** to send only the selected passage.
- Click the bookmarklet with no selection to import the full page as before.
- Selected captures retain the source title, URL, author when available, and nearby paragraph context.
- Selected captures open as `Selected passage — <page title>` and use source type `web-passage`.

## Files to replace

- `server.js`
- `read-anything.js`
- `public/read-anything.js`
- `index.html`
- `public/index.html`

## Required test steps

1. Commit and deploy this update.
2. Clear the Render build cache and hard-refresh the app.
3. Delete the old bookmarklet and reinstall it from **Read Anything**.
4. Highlight a passage on another webpage and click the bookmarklet.
5. Confirm only the selected passage opens.
6. Repeat without highlighting text and confirm the full page still imports.

No protected reader files are included or modified.
