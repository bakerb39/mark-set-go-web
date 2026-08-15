MARK, SET, GO! — MY MUSIC INDEXEDDB SAVE FIX

Replace all three:
  /public/music-save-reliability.js
  /public/reader-music-quick.js
  /public/index.html

THIS FIX ADDRESSES THE EXACT ERROR:

  Failed to execute 'setItem' on 'Storage':
  Setting the value of 'markSetGoPreferredMusic' exceeded the quota.

ROOT CAUSE

Preferred/My Music playlists were stored as one JSON array in localStorage.

localStorage has a small per-origin quota and Mark, Set, Go! uses that same
bucket for Reader/session/other browser state. Once the bucket filled up, adding
one more playlist caused the entire markSetGoPreferredMusic write to fail.

NEW STORAGE

My Music now uses IndexedDB:

  Database: mark-set-go-music
  Store:    preferred-music

Each playlist is stored as its own record.

MIGRATION

On first load after this update:

1. Existing markSetGoPreferredMusic entries are copied into IndexedDB.
2. The old localStorage key is removed to free quota.
3. The Reader's My saved playlists dropdown reads the IndexedDB-backed cache.
4. The Music & Focus "Your saved music" list is rebuilt from IndexedDB.

SAVE TO MY MUSIC

The save button is captured before app.js's old localStorage handler.

Spotify / YouTube links now save directly into IndexedDB, so a full localStorage
bucket no longer prevents My Music saves.

Also covered:
- built-in focus-music Save buttons;
- duplicate detection;
- Play from Your saved music;
- Delete from Your saved music;
- Reader My saved playlists updates immediately after save/delete.

IMPORTANT

This fixes My Music storage only.

Per-book music associations still use the existing small
markSetGoBookMusicV1 map in localStorage. That can be migrated separately if it
ever becomes large enough to need it.

PRESERVED

- current vertical top-right Music / Full screen styling
- compact Reader music dropdown
- Topic Feed fixes
- Reader core
- Book Pages

No app.js or styles.css replacement.
