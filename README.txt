Mark, Set, Go! — Non-workspace Reader Switching v1.0
2026-08-23

FILES
- public/index.html              Updated from the latest Mark, Set, Go! index baseline.
- public/reader-switcher.js     New outer-app Reader session manager.
- public/reader-switcher.css    New compact Reader tab strip styles.

NO CHANGES
- public/app.js is intentionally unchanged.
- public/reader/BookModel.js is unchanged.
- public/reader/SessionManager.js is unchanged.
- public/reader/ReaderEngine.js is unchanged.
- public/reader/VirtualRenderer.js is unchanged.
- public/reader/ReaderLegacyRuntime.js is unchanged.
- workspace-pane.html is unchanged; workspace panes do not load this feature.

BEHAVIOR
1. The first Reader is labeled Reader 1.
2. Click “+ Reader” to open an empty Reader slot without replacing the current Reader.
3. Open/import a document normally; it loads into the active Reader slot.
4. Click another Reader tab to checkpoint the current Reader and restore the selected Reader's document, position, and controls.
5. Close Readers with ×. Reader numbers are stable and never renumbered; e.g. closing Reader 2 leaves Reader 1 and Reader 3.
6. The final remaining Reader is kept available; closing it clears it to an empty Reader rather than inventing a replacement number.
7. Reader sessions are in-memory for this phase. The existing single active Reader resume checkpoint continues to work as before. Persisting the whole open-Reader list across a browser refresh is intentionally reserved for the next persistence phase.

PUBLIC BRIDGE FOR NEXT PHASES
window.MarkSetGoReaderSessions.getActiveContext()
window.MarkSetGoReaderSessions.list()
window.MarkSetGoReaderSessions.switchTo(readerId)
window.MarkSetGoReaderSessions.newReader()
window.MarkSetGoReaderSessions.close(readerId)
window.MarkSetGoReaderSessions.openTextInNewReader(title, text, source)
window.MarkSetGoReaderSessions.checkpoint()

The active context includes readerId, readerLabel, readerOrdinal, documentId, title, and index so Ask Mark / Notebook / comparison / Symposium provenance can be added without another Reader-state redesign.

TESTED
- JavaScript syntax: node --check reader-switcher.js
- State harness:
  PASS Reader 1 created
  PASS Book A in Reader 1
  PASS Reader 2 created
  PASS two Readers retained
  PASS Reader 1 restores document/index
  PASS Reader 3 created
  PASS Reader 2 close preserves 1 and 3 labels
  PASS Reader 1 remains independent
  PASS Reader 3 remains independent
- New implementation contains no MutationObserver.
