MARK, SET, GO! — LIBRARY MENU CLICK FIX

Replace only:
  /public/topic-feeds.js
  /public/index.html

SCOPE

My Reading was confirmed to still work, so this patch does NOT touch it.

TOPIC FEEDS

The Topic Feeds navigation hook previously ran in capture phase and called:

  event.stopImmediatePropagation()

That was unnecessarily aggressive inside the shared My Library menu.

It now runs as a normal click handler:
- app.js still performs its normal navigation/menu cleanup;
- Topic Feeds renders its own page afterward;
- no other Library navigation handler is suppressed.

BROWSE

Browse is a nested <details> submenu.

This patch explicitly toggles only:
  .library-browse-submenu > summary

so clicking Browse reliably opens/closes the nested choices even with the
surrounding document-level Library navigation handlers.

PRESERVED

- My Reading navigation
- Topic Feeds editor lock
- all current Topic Feed Reader fixes
- IndexedDB My Music storage
- compact music selector
- current music/fullscreen control references

No app.js, styles.css, Reader core, or database files are changed.
