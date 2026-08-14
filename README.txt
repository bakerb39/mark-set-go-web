MARK, SET, GO! — TOPIC FEED READ-IN-READER FIX

This package is cumulative with the current Ask Chad + Topic Feeds build.

For this fix, replace:
  /public/topic-feeds.js
  /public/index.html

WHAT WAS HAPPENING
Topic Feeds saved the refreshed edition to localStorage. The app already stores
other Reader/import records there too. If browser storage was full or nearly full,
clicking "Read in Reader" could fail while trying to save the article's read state
BEFORE openDocument() was called. The click therefore looked like it did nothing.

FIX
1. The Reader now opens FIRST.
2. Marking the article as read and saving Topic Feed state happens afterward.
3. Topic Feed saveState() can no longer throw into the Reader-open path.
4. If storage is tight, Topic Feeds automatically try a compact saved form.
5. If even compact storage cannot be saved, the in-memory feed still works.
6. The clicked button temporarily shows "Opening…" so the user gets immediate feedback.

No Reader-core architecture was changed.
