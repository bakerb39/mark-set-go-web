MARK, SET, GO! — BETH CORRECT COMPACT PHOTO

Replace:
  /public/companion-persona-safe.js
  /public/companion-chad.js
  /public/companion-copy-sync.js
  /public/index.html

CORRECTION

The previous fix accidentally changed Beth's compact UI photo to:
  /assets/companions/beth/beth-avatar.png

The established prior working build used:
  /assets/companions/beth/beth-ui-avatar.png?v=9.6.9

That is the tight-cropped Beth photo specifically prepared for:
- Profile choice
- Reader companion button
- Help/chat avatar
- Other compact companion UI

The homepage/front-page Beth artwork is NOT changed.

NO image files are included or replaced in this package.
NO Mark or Chad image paths are changed.
NO app.js, Reader, Analyze, annotation, article, or chat logic is changed.
