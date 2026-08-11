MANUAL PACE — DIRECTIONAL WPM + LINE STEP

Behavior:
- Right Arrow: starts continuous forward Manual Pace at assigned WPM.
- Left Arrow: starts continuous reverse Manual Pace at assigned WPM.
- Pressing the same active horizontal direction again pauses.
- Pressing the opposite horizontal direction reverses direction.
- Up Arrow: pauses horizontal motion and moves up exactly one rendered line.
- Down Arrow: pauses horizontal motion and moves down exactly one rendered line.
- In Book Pages mode, Up/Down crosses page/spread boundaries.
- Horizontal movement follows the normal reading sequence across pages.

WPM:
- Manual Pace uses the existing WPM control.
- WPM can now go down to 0.
- At 0 WPM horizontal motion is paused even if a direction is selected.
- Up/Down continue to work at 0 WPM.
- Changing WPM while Manual Pace is moving immediately reschedules movement at the new rate.

Architecture:
- Manual Pace remains only a control layer over the stable Highlight renderer.
- No new rendering engine.
- No pagination engine changes.
- No right-click changes.
