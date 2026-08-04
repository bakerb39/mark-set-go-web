# v8.4.1 Selected Passage Letter-S Fix

Fixes bookmarklet whitespace normalization so `\\s` remains a whitespace regex in the generated bookmarklet instead of becoming `/s+/g` and replacing every letter s.

Replace:
- read-anything.js
- public/read-anything.js
- index.html
- public/index.html

After deployment, delete and reinstall the bookmarklet because the defect is embedded in the previously saved bookmark URL.
