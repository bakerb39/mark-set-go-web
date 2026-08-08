UPLOAD THESE TO public/

index.html
app.js
classic-guides/  (entire folder)

IMPORTANT:
index.html now requests:
  /app.js?v=9.6.8-classic-guides-first-10

This forces the browser/CDN to request the new app.js instead of the old
cached v9.6.4-browser-e2e file.

Expected first rows:
The Iliad   ... Study / Great Ideas | Classic Guide | Grokipedia
The Odyssey ... Study / Great Ideas | Classic Guide | Grokipedia
Agamemnon   ... Study / Great Ideas | Classic Guide | Grokipedia
... through the first 10 non-Bible Great Books.
