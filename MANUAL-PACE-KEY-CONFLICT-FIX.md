MANUAL PACE KEY-HANDLER CONFLICT FIX

Concrete bugs fixed:

1. DUPLICATE MANUAL PACE KEY HANDLERS
The Manual Pace keydown listener was anonymous. Every Reader rebuild added
another copy, so one Right Arrow could start movement and the next accumulated
handler could immediately toggle it off.
FIX:
- store handler as state.manualPaceKeyHandler
- remove the old handler before adding the current Reader's handler

2. UP/DOWN CONFLICTED WITH THE EXISTING WPM HOTKEY
The Reader already has a document-level ArrowUp/ArrowDown handler that adjusts
WPM by 25.
FIX:
- Manual Pace calls stopImmediatePropagation()
- existing viewerWpmKeyHandler explicitly does nothing when Manual Pace is active

3. WPM=0 WAS IMPOSSIBLE THROUGH THE EXISTING HELPER
adjustReaderWpm used:
  Number(speedInput.min) || 30
Since Number("0") is 0/falsy, a min of 0 became 30.
FIX:
- use Number.isFinite so min=0 remains valid

4. THE WPM BADGE COULD NOT DISPLAY 0
The badge treated 0 as missing and fell back to state.wpm.
FIX:
- 0 is now treated as a real value

5. DIRECT WPM INPUT NOW SYNCS MANUAL MOTION
Typing 0 or another WPM updates state.wpm, the badge, persistence, and the
Manual Pace scheduler immediately.

No renderer, pagination, right-click, or protected reader architecture changed.
