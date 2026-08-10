# Lower-right Reader WPM stepper — verification

Baseline: user-uploaded `mark-set-go-web-feature-ask-mark-premium-phase-1 (8).zip`.

Runtime path verified in `server.js`: Express serves the `public/` directory and `public/index.html`. Root duplicates were intentionally not changed.

## Changed runtime files
- `public/app.js`
- `public/styles.css`
- `public/index.html` (cache key only)

## Behavior
- Lower-right footer: `[ − ] <WPM> [ + ]`
- Minus: -25 WPM
- Plus: +25 WPM
- Up Arrow: +25 WPM
- Down Arrow: -25 WPM
- Existing input min/max remain authoritative: 30–900 WPM.
- Uses existing `state.wpm`, `#speed`, fullscreen speed mirror, WPM badge, and reader-session persistence.
- If playback is running, the current position is retained while playback restarts at the new speed.
- Arrow shortcuts do not fire from form/editable/interactive controls.

## Checks run
- `node --check public/app.js`: PASS
- Executing `public/` path in `server.js`: PASS
- Markup/step/arrow/clamp/persistence/static contract checks: PASS
- All three patch files differ from the uploaded baseline: PASS
- MutationObserver occurrence count unchanged: PASS
- `contextmenu` occurrence count unchanged: PASS
- `word-context-menu` occurrence count unchanged: PASS
- ZIP integrity: PASS

## Chromium
Chromium was invoked against the app, but this sandbox's Chromium process did not complete before timeout. Therefore this patch is **not claimed as Chromium-tested**. No browser PASS is asserted.
