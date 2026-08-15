MARK, SET, GO! — ASK CHAD UNIFIED COMPANION FIX

The screenshots exposed three separate integration bugs:

1. DUPLICATE PROFILE SELECTORS
   The existing Mark/Beth selector is rendered OUTSIDE the Profile page wrapper.
   The prior Chad code searched only inside that wrapper, failed to see it, and
   created a second Mark/Beth/Chad selector.

   FIX:
   - Search the entire #app for the canonical companion selector.
   - Add Chad directly to that selector.
   - Remove the emergency fallback if the canonical selector appears.
   - The Profile should show ONE selector: Mark | Beth | Chad.

2. TWO AVATARS ON ASK BETH / ASK CHAD BUTTONS
   The button had both a real <img> portrait and the old CSS ::before fallback
   portrait at the same time.

   FIX:
   - If a real <img> exists, remove/suppress the fallback portrait.
   - If no <img> exists, use the fallback portrait.
   - Never render both.

3. CHAD SELECTED BUT BETH STILL ACTIVE IN THE DRAWER
   The app's own currentCompanionIdentity() checks window.MSGCompanion.config
   before localStorage. The old Mark/Beth companion API still reported Beth,
   so the Reader continued to identify Beth even after Chad was selected.

   FIX:
   - Chad now plugs into the EXISTING window.MSGCompanion.config contract via a
     proxy instead of creating a competing identity system.
   - When Chad is selected, the app's normal companion lookups receive Chad.
   - Reader button text, drawer labels, companion images, and AI requests all
     synchronize to the same selected identity.

REPLACE:
  /public/companion-chad.js
  /public/companion-chad.css
  /public/index.html

No Reader engine/core architecture was changed.
