CONSOLIDATED GREAT IDEAS + GUIDE FIX

This patch is built from the latest Bible Guides navigation fix and carries
forward the robust Classic Guide lookup.

FIXED: Study / Great Ideas
The Great Books card button had a click listener that called:
  renderGreatBookStudy(item, button)
but renderGreatBookStudy did not exist anywhere in the app.

The new function:
- opens the Syntopicon / Great Ideas workspace;
- chooses a relevant Great Idea for the selected book;
- checks the selected Great Book automatically;
- tells the reader to choose at least one additional source;
- preserves the existing Syntopicon comparison workflow;
- shows an error on the source card instead of silently doing nothing if opening fails.

ALSO INCLUDED
- robust Classic Guide lookup by exact query, then normalized title + author;
- 22 completed Bible Guide files through Song of Solomon;
- Bible Guides navigation fix;
- Bergson, Barth, and Heidegger Classic Guide files and catalog changes.

No Reader renderer, Manual Pace, pagination, or right-click code changed.
