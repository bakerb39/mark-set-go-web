# v8.4.4 My Library infinite-loop fix

Replace `cloud-document.js` and `public/cloud-document.js`.

The previous global MutationObserver watched the entire app while `decorate()` itself removed and inserted DOM nodes. Each decoration therefore scheduled another decoration indefinitely. This update removes the global observer and refreshes cloud-document controls only from bounded application events.

No reader-engine, pagination, resume, or Book Pages files are changed.
