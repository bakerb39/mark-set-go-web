MARK, SET, GO! — TOPIC FEEDS EDITOR LOCK

Replace only:
  /public/topic-feeds.js
  /public/index.html

BUG

While New Topic / Edit Topic was open, a background cloud/auth hydration could
finish and run:

  if (document.querySelector('.topic-feeds-page')) render();

The editor itself also uses .topic-feeds-page, so that background render
replaced the unsaved form with the normal My Topics list.

An in-flight feed refresh could also call render() when it completed.

FIX

New/Edit Topic is now a transactional screen.

While the editor is open:
- cloud hydration may finish, but its state is held temporarily;
- background feed refreshes may finish, but render() cannot replace the form;
- auth/session refreshes cannot navigate away from the form.

Only explicit user actions can leave the editor:

SAVE TOPIC
- form values win;
- any deferred cloud snapshot is discarded;
- settings are merged into the CURRENT live topic record so refreshed articles
  are preserved;
- saved state syncs back to cloud;
- then the topic refresh runs.

CANCEL
- unsaved form changes are discarded;
- any newer cloud snapshot received during editing is applied;
- returns to My Topics.

DELETE TOPIC
- deletion wins;
- deferred cloud state is discarded;
- deletion syncs normally.

Explicitly clicking Topic Feeds in the top navigation also acts like Cancel.

PRESERVED

- recommended feeds while editing
- manual feed rows
- Daily start choice
- refresh/download behavior
- PostgreSQL sync
- My Topics Reader navigation
- source/share/header fixes
- bookmarks
- Book Pages fixes
- top-right Reader music + My Playlists references

No server.js, app.js, Reader core, CSS, database schema, or music JS is changed.
