Ask Mark v8.9.1 focused reader fix

Replace these files in the deployed project:
- public/index.html
- public/ask-mark-hub.css
- public/ask-mark-hub.js

Changes:
- Removed Now Reading card from Ask Mark panel.
- Removed Selected Passage preview from Ask Mark panel.
- Removed six right-panel quick-action buttons.
- Kept passage actions in the reader floating highlight toolbar.
- Enlarged Ask Mark input area.
- Fixed Notebook tab refresh after saving an Ask Mark response or passage.
- Removed empty reader-frame toolbar gap.
- Desktop reader page fits viewport and prevents body/browser scrolling.
- Reader and Ask Mark panel retain their own necessary internal scrolling.
- Core reader engine and app.js were not changed.
