MARK, SET, GO! — CHAD PROFILE VISIBILITY FIX

Replace:
  /public/companion-chad.js
  /public/companion-chad.css
  /public/index.html

WHY CHAD WAS MISSING
The app's current renderProfilePreferences() creates Quick Setup, interface
features, and coaching sections, but it does not itself create the companion
selector. The older Mark/Beth companion layer injects that separately.

The first Chad integration assumed .companion-persona-options already existed.
If that older layer had not inserted the selector yet, Chad had nowhere to attach
and therefore did not appear.

FIX
- Chad now looks for the existing Mark/Beth companion selector first.
- If it exists, Chad is added as the third choice.
- If it does not exist, Chad creates the complete Mark / Beth / Chad companion
  selector directly under the Profile hero.
- The fallback disappears automatically if the original companion selector later
  appears, preventing duplicate settings.
- All three options are selectable from the resulting profile selector.
- Chad remains the finance/markets/investing specialist.
- Cache-bust versions were changed so the browser receives the new script/CSS.

No Reader-core code changed.
