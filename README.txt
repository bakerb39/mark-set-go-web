MARK, SET, GO! — ASK CHAD READER AVATAR SYNC FIX

The latest screenshot showed the identity text changing to Chad while both
Reader-drawer portraits were still Mark.

Replace:
  /public/companion-chad.js
  /public/companion-chad.css
  /public/index.html

Fixes:
- Chad now replaces every known Mark/Beth companion portrait inside the Reader
  side panel and fullscreen companion drawer.
- Covers both <img> portraits and inline background-image portraits.
- The Chad proxy is now reinstalled if the older Mark/Beth script replaces
  window.MSGCompanion after Chad loads.
- The fallback avatar CSS variable also follows Chad.
- MutationObserver synchronization remains active, so portraits recreated by
  Reader rerenders are corrected again automatically.
- No Reader engine/core architecture changed.

The previous shorter "Summarize" article link and single-profile-selector fixes
remain included in this cumulative package.
