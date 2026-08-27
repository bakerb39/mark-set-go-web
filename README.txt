READ WITH MARK HTML CLEANUP — v0.1.1
===================================

The automatic extension fallback is working, but some publishers expose their
article as an HTML-formatted payload. v0.1.1 cleans that content before it reaches
the Reader.

UPLOAD TO WEB APP

REPO ROOT
  apply-ui-cache-busters.js

PUBLIC
  read-with-mark-extension-fallback.js
  media-toolbar-simplify.css
  media-toolbar-simplify.js

The media files are included only because this root cache-buster is consolidated
with the latest Beside-only media toolbar package. If those files are already
uploaded, replacing them with these identical copies is harmless.

UPDATE THE CHROME EXTENSION

Use:
  read-with-mark-auto-import-extension-v0.1.1.zip

If v0.1.0 is already loaded unpacked:
1. unzip v0.1.1 over/into a new folder;
2. chrome://extensions
3. click Reload for Read with Mark Auto Import, or remove and Load unpacked again.

WHAT IS CLEANED
- <a>, <p>, <div>, headings, list and blockquote markup
- href/target/rel attributes
- HTML entities such as &#8212;
- figures and figcaptions
- scripts/styles/navigation
- obvious social/share/newsletter/promo blocks

Paragraphs/headings/list structure is retained as plain readable text.

A SECOND CLEANUP PASS also runs in the Reader bridge. This means even if an
unusual publisher somehow returns raw markup through the extension, it should
be cleaned before MarkSetGoReadAnything.openDocument() receives it.

TEST
1. Reopen the same article that produced raw <a>, <p>, <blockquote> markup.
2. Automatic recovery should occur as before.
3. The Reader should now contain clean prose, not HTML tags.
4. Quotations and paragraph breaks should remain readable.

No Ask Beth, media playback, article selection, or server import behavior was changed.
