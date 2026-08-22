# Mark, Set, Go! viewport shell fix v1.7

This removes the unnecessary browser-level vertical scrollbar while a Reader or
desktop workspace session is active.

## Root cause

The base app has:
- `.app-shell { min-height:650px; margin:2rem auto; }`
- plus the sticky site header
- plus the footer

The workspace secondary pane also used:
- `height: calc(100vh - 24px)`

That pane was still inside the already-margined app shell below the header, so
the total document was taller than the viewport.

## New behavior

On desktop (width > 900px), when Reader/workspace is active:
- the whole browser document is exactly `100dvh`
- header uses its natural height
- footer becomes compact
- the app gets the remaining height
- the workspace fills that app height, not another 100vh
- Reader, Chat, and side panes use internal scrolling as needed
- no second browser/page scrollbar should appear

Normal pages that genuinely need document scrolling are unchanged.

## Replace/upload if v1.6 is already deployed

Required:
- public/app-viewport-fix.css
- public/button-feedback.js
- public/workspace-pane.html

The remaining files are included for convenience/current state.

No MutationObserver is used.
