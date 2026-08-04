# v8.5.0 — Simplified Mobile Reader

## Scope

Phone-only presentation layer for widths up to 700px. Desktop remains unchanged.

### Mobile navigation
- My Library
- Browse
- Reader

### Reader defaults
- Highlight mode
- One word at a time
- Adjustable WPM in 25-WPM steps
- 14px reader text
- Center focus anchor enabled
- 36px anchor size
- Red anchor color
- Light/dark toggle
- Book Pages disabled on mobile

### Mobile behavior
- The browser page does not scroll.
- The reader remains within one fixed viewport.
- Library/Browse use contained native-style scrolling when their content exceeds the screen.
- Ask Mark, notebook, music, translation, advanced modes, side panels, and other tools are hidden on phones.

## Architecture protection

This release adds only:
- `mobile-simple.css`
- `mobile-simple.js`
- script/stylesheet references in the two HTML entry files

No reader engine, pagination, playback cursor, viewport anchor, resume, or Book Pages implementation was edited.
