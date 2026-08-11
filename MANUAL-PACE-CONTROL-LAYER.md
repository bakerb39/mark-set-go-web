MANUAL PACE CONTROL-LAYER FIX

This rebuild removes Manual Pace from the rendering architecture.

IMPORTANT:
- The visible Mode dropdown can say "Manual Pace".
- Internally the protected reader continues to render as the existing Highlight mode.
- Manual Pace is only a keyboard/control layer over that stable Highlight DOM.
- No "manual" value is sent into the virtual renderer or pagination engine.

Arrow behavior:
- Right Arrow = advance one Words Shown group
- Left Arrow = move back one Words Shown group
- Shift + Arrow = five groups
- The actual #word-count control now determines the manual chunk size.

Rendering:
- Uses the existing Highlight reader DOM.
- Highlights the reader-group already containing state.index.
- Does not rebuild readingGroups on every keypress.
- Only asks the existing virtual renderer for a Highlight window when the cursor
  moves outside the currently rendered long-book window.

Focus:
- Mode selector is blurred synchronously and reader receives focus immediately.
- Capture key handler also prevents native select Left/Right behavior.

No changes were made to VirtualRenderer.js, ReaderEngine.js, pagination engine,
right-click behavior, or the existing timed-mode algorithms.
