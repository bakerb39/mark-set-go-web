MARK, SET, GO! — SUMMARIZE / ANALYZE ON CONTINUE READING

Replace:
  /public/read-anything.js
  /public/index.html

ROOT CAUSE

The article action installer explicitly checked the first rendered Reader word.

If the first rendered word had an index greater than 0, it removed the
Summarize / Analyze row.

That meant:
- opening a new article at the beginning -> controls appeared;
- going Home and choosing Continue Reading -> Reader resumed later in the article;
- refreshing and restoring a later reading position -> first visible index > 0;
- the code deliberately removed the controls.

FIX

Summarize and Analyze are now treated as ARTICLE-LEVEL controls rather than
"first page only" controls.

They remain above the first visible line whenever a supported article is:
- opened normally;
- resumed through Continue Reading;
- restored after refresh;
- rerendered in Book Pages.

The document-restoration event also explicitly reinstalls the article controls
after Read Anything restores the article metadata.

No Reader playback, pagination, Book Pages, or reading-mode logic was changed.
