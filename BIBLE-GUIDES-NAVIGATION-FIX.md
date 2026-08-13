BIBLE GUIDES NAVIGATION FIX

Issue:
Bible Guide catalog, registry, route, and guide files were present, but the dynamically rendered
Bible Guides navigation button was not guaranteed to have a click handler.

Fix:
- Explicitly bind the Bible Guides button inside Bible Study.
- Explicitly bind the Bible Study return button inside Bible Guides.
- Explicitly bind Return to Reader inside Bible Guides.
- Preserve all completed Bible Guide files through Song of Solomon.

Completed Bible Guides included:
Genesis through Esther, plus Job, Psalms, Proverbs, Ecclesiastes, Song of Solomon (22 total).

No Reader renderer, Manual Pace, pagination, or right-click code changed.
