# v9.5.4 emergency companion stability rollback

Changed only the companion presentation module and its cache reference.

Removed:
- companion MutationObserver
- full companion refresh after ordinary document clicks
- hashchange/popstate companion refreshes
- delayed 90ms/260ms full-page refresh passes

Kept:
- explicit companion update when Mark/Beth selection changes
- one initialization pass on DOMContentLoaded
- profile control insertion when Profile is opened

Reader/right-click/walkthrough files are unchanged from v9.5.3.
