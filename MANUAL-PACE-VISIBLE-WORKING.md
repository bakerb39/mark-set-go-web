MANUAL PACE VISIBLE + WORKING FIX

The first Manual Pace patch added keyboard logic but missed the actual
#mode-select used by the reader shown in the user's screenshot.

This repair:
- adds Manual Pace directly after Pointing Guide in the real reader dropdown
- uses #mode-select / state.renderedMode for arrow-key activation
- renders Manual Pace using the existing Highlight visual path
- immediately highlights the current chunk when Manual Pace is selected
- supports existing chunk size and Book Pages capability
- labels Manual Pace correctly in Progress mode analytics

Controls:
Right Arrow = next chunk
Left Arrow = previous chunk
Shift + Arrow = 5 chunks

No playback engine, pagination engine, or right-click code changed.
