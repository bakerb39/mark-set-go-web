# v8.4.6 Document Manager Loop Fix

Replace only:
- `document-manager.js`
- `public/document-manager.js`

The My Library freeze was caused by a third page-wide MutationObserver feedback loop. `decorateDocumentStates()` wrote badge text and removed/reinserted labels on every observer callback, which generated more child-list mutations indefinitely.

This patch makes decoration idempotent, prevents re-entry, and coalesces observer callbacks into one animation-frame update.
