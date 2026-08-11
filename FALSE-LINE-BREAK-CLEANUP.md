FALSE LINE BREAK / FALSE HEADING CLEANUP PATCH

Fixes:
- rejoins ordinary PDF hard-wrapped prose before heading detection
- preserves blank paragraph boundaries, lists, TOCs, bibliography, and poetry
- requires stronger evidence before treating all-caps/short lines as headings
- gives AI Deep Clean explicit paragraph-first / heading-second instructions
- runs the false-line-break repair both before and after the AI cleanup

Changed files:
- read-anything.js
- public/read-anything.js
- public/index.html
