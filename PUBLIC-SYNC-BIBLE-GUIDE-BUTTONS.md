PUBLIC SYNC — BIBLE GUIDE BUTTONS

Purpose
-------
Deployment-safe patch with public/ treated as the authoritative runtime.

Included deployment files
-------------------------
- public/app.js
- public/index.html
- public/texts/bible-guides/* (all 22 completed Bible Guides)
- public/texts/classic-guides/* carried from the current fix branch
- public/data/classic-guides-catalog.json when present

Source parity
-------------
- app.js is synchronized byte-for-byte with public/app.js
- texts/bible-guides/* also included
- texts/classic-guides/* also included

Verified in public/app.js
-------------------------
- bibleGuideForGreatBook(book) exists
- Great Books card includes data-open-bible-guide-book
- click handler for Bible Guide exists
- Genesis registry exists
- Exodus registry exists
- Psalms registry exists
- Proverbs registry exists

Expected Volume 0 behavior after this public runtime is deployed
---------------------------------------------------------------
Genesis:
Find & Import Edition | Study / Great Ideas | Bible Guide | Grokipedia

Exodus:
Find & Import Edition | Study / Great Ideas | Bible Guide | Grokipedia

Psalms:
Find & Import Edition | Study / Great Ideas | Bible Guide | Grokipedia

Proverbs:
Find & Import Edition | Study / Great Ideas | Bible Guide | Grokipedia

Isaiah, Revelation, Acts, Romans, Matthew, and John will show Bible Guide once
their corresponding Bible Guide has been created and registered.

Cache bust
----------
public/index.html loads:
/app.js?v=public-sync-bible-guides-20260813-0133

No Reader renderer, Manual Pace, pagination, or right-click behavior changed.
