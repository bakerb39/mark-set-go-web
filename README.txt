CACHE-BUSTER MEDIA ANCHOR FIX

The deploy error was caused by insertion order.

Broken order:
  1. Try to insert media-toolbar-simplify.css AFTER media-toolbar-responsive.css
  2. media-toolbar-responsive.css had not been inserted into index.html yet
  3. ensureAfterAsset() threw and Render stopped startup

Corrected order:
  1. Insert media-toolbar-responsive.css after the existing media-panel.css
  2. Insert media-toolbar-simplify.css after media-toolbar-responsive.css
  3. Insert media-toolbar-simplify.js after the existing media-panel.js

REPLACE ONLY:
  repo root/apply-ui-cache-busters.js

Do not replace the extension or other public files again for this error.
Once the deploy succeeds, continue testing the same article with extension v0.1.1.
