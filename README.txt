MARK, SET, GO! — TOPIC FEED SOURCE DELETE / REFRESH RACE FIX

Replace only:
  /public/topic-feeds.js
  /public/index.html

BUG REPRODUCED

1. Open Manage on an existing topic.
2. Remove a source such as Associated Press.
3. Save Topic.
4. The source disappears.
5. A few seconds later it reappears.

ROOT CAUSE

Save Topic used:

  saveState();
  render();
  refreshTopic();

saveState() intentionally debounces the database write by ~450ms.

But authenticated refreshTopic() immediately calls:

  POST /api/topic-feeds/refresh { topicId }

The server refreshes from the source list already stored in PostgreSQL.

So Refresh could run BEFORE the source deletion reached the database. The
server still saw Associated Press, refreshed it, and returned a topic containing
Associated Press. The client then replaced the newly edited topic with that
stale server topic.

FIX

SAVE TOPIC NOW DOES THIS IN ORDER:

  1. Save edited source list locally.
  2. Immediately PUT the new topic configuration to the database.
  3. Wait for that PUT to finish.
  4. Only then refresh the topic feeds.

If the immediate database write cannot complete, the app does NOT ask the
server to refresh its stale source list. It uses the newly edited client source
list for that refresh and keeps the normal database retry scheduled.

SECOND SAFETY LAYER

A cloud refresh response is no longer allowed to overwrite:
  - topic name
  - cadence
  - recommended count
  - topic preferences
  - SOURCE LIST

Refresh owns downloaded article data only.

Even a stale refresh response therefore cannot resurrect a deleted feed.

REMOVED FEED ARTICLES

When a source is removed and Save Topic is clicked, old downloaded articles
belonging to that source are removed from the topic as well.

PRESERVED

- Topic Feeds editor lock
- Library menu click fix
- all Reader / Book Pages / sharing fixes
- compact My Topics header
- IndexedDB My Music quota fix
- final Music -> Full screen control ordering

No server.js, app.js, Reader core, or database schema changes.
