BIBLE GUIDE BUTTONS ON GREAT BOOKS CARDS — FIX

Problem shown in screenshot:
Volume 0 Bible entries on the Great Books page displayed:
- Find & Import Edition
- Study / Great Ideas
- Grokipedia

but completed Bible Guides were not represented on those cards at all.

Fix:
- Adds bibleGuideForGreatBook(book)
- Adds a Bible Guide button directly to Great Books cards when that Bible book's guide is ready
- Adds click binding that opens the Bible Guide in the Reader
- Includes alias support for Great Books title variants:
  The Acts of the Apostles -> Acts
  The Epistle to the Romans -> Romans
  The Gospel According to Matthew -> Matthew
  The Gospel According to John -> John
  etc.

With the currently completed 22 Bible Guides, Volume 0 cards such as:
- Genesis
- Exodus
- Proverbs
- Psalms
will now display Bible Guide.

Isaiah, Revelation, Acts, Romans, Matthew, John, etc. will begin showing the
button automatically once their corresponding Bible Guides are created in later batches.

Carries forward:
- Study / Great Ideas fix
- robust Classic Guide lookup
- Bible Guide navigation
- completed Bible Guides through Song of Solomon
- Bergson / Barth / Heidegger guide updates

No Reader renderer, Manual Pace, pagination, or right-click code changed.
