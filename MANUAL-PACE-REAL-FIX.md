MANUAL PACE REAL FIX

Root causes corrected:

1. Manual Pace was passed into the virtual renderer as a brand-new rendering
   mode. The virtual renderer only understands its established modes, so the
   reader could render blank.
   FIX: Manual Pace is now normalized to Highlight at the rendering layer only.

2. The Mode <select> retained keyboard focus after choosing Manual Pace.
   Arrow Left/Right therefore changed the selected reader mode.
   FIX: selecting Manual Pace blurs the selector and focuses the reader.
   The capture handler also intercepts arrows from the mode selector itself.

3. The first manual highlighter tried to add active CSS classes to state.words,
   which contains word text rather than rendered DOM elements.
   FIX: Manual Pace now highlights actual .reader-group/.reader-word elements.

4. Start/Resume could invoke the timed playback engine in Manual Pace.
   FIX: Manual Pace never starts an interval/timer; Start simply activates the
   current manual highlight.

5. Clicking text in Manual Pace now repositions the manual cursor without
   starting timed playback.

Controls:
- Right Arrow: next chunk
- Left Arrow: previous chunk
- Shift + Arrow: five chunks

No pagination engine, right-click code, or core virtual renderer implementation
was modified.
