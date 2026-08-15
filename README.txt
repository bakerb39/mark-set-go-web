MARK, SET, GO! — COMPANION PROFILE REPAIR

Replace:
  /public/companion-persona-safe.js
  /public/companion-persona-safe.css
  /public/companion-chad.js
  /public/companion-copy-sync.js
  /public/index.html

WHAT WAS WRONG

Two different scripts owned the Profile companion selector:

1. companion-persona-safe.js still supported only Mark and Beth.
2. companion-chad.js waited for a selector with a different class name, did not
   recognize the safe selector, and created an emergency Mark/Beth/Chad fallback.

That produced TWO "Choose your companion" panels.

Then companion-copy-sync.js treated the old Mark/Beth cards as ordinary text and
rewrote their standalone names to the active persona, which is why both lower
cards appeared to say "Chad" while retaining Mark/Beth portraits.

FIX

There is now one canonical selector:
  Mark | Beth | Chad

companion-persona-safe.js owns all three personas.
companion-chad.js no longer creates any fallback profile UI.
companion-copy-sync.js explicitly excludes the profile choice cards from active
persona text replacement.

This repair is intentionally isolated to companion/profile UI. It does not
replace app.js, Reader annotations, Analyze, article resume logic, or chat code.
