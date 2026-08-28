MSG Reader Session Isolation v2.3

WHAT THIS FIXES
---------------
Reader 1, Reader 2, Reader 3, etc. previously used the same Reader session
storage key: "current". Auxiliary Readers are separate same-origin iframe app
instances, so their snapshots could overwrite each other. When a secondary
Reader iframe was destroyed by opening another page and later recreated from
the Readers menu, its own document could therefore be missing.

This patch namespaces session storage for Reader 2+:
  Reader 1 -> current                       (unchanged)
  Reader 2 -> current:reader-2
  Reader 3 -> current:reader-3
  etc.

The localStorage fallback and has-session marker are namespaced the same way.

PRESERVED
---------
- Reader 1's existing session key and stored session
- Existing Reader resizing code
- Standard/Desktop workspace behavior
- Desktop resize recursion guard
- ReaderEngine
- Pagination / playback / WPM
- Topic Feed structure
- No MutationObserver

IMPORTANT FIRST TEST
--------------------
Because older Reader 2/3 sessions were written into the shared legacy slot,
load text into Reader 2 and Reader 3 once after installing this patch. From
then on each Reader gets its own independent session slot.

Test:
1. Reader 1 -> load document A
2. Reader 2 -> load document B
3. Reader 3 -> load document C
4. Open Notebook or another normal page
5. Readers -> Reader 2 (B should return)
6. Readers -> Reader 3 (C should return)
7. Readers -> Reader 1 (A should return)

Upload:
  public/reader/SessionManager.js

If your browser/CDN retains the old JS at the existing cache-token URL, perform
a hard refresh after deployment.
