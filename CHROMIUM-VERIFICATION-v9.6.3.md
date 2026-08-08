# Chromium verification — v9.6.3

Verified in Chromium 144 on 2026-08-08 using the actual companion modules rendered in a browser DOM.

PASS: Global help button renders one label only (Ask Beth with Beth selected).
PASS: Home companion caption changes to Meet Beth.
PASS: Reader companion header renders Ask Beth with Beth avatar.
PASS: Reader companion messages render Beth name + Beth avatar.
PASS: Word lookup badge renders Ask Beth.
PASS: Live switch Beth -> Mark updates help label, Reader header, message names, and avatars back to Mark.
PASS: Features columns render in order: Ideas -> Planned -> Testing -> In Progress -> Completed.
PASS: companion-persona-safe.js contains no MutationObserver.
PASS: app.js diff from v9.6.2 does not modify contextmenu/pointerdown/right-click handler logic; changes are companion response identity only.

Note: Chromium in this environment blocks local/file navigation by enterprise policy, so the browser test injected the actual application modules into a Chromium page DOM and exercised their rendered behavior directly.
