# v9.6.6 Reader companion button avatar fix

## Exact bug
The Reader `#toggle-mark-panel` text was updated by `companion-persona-safe.js`, but the image inside the same button was not. This produced Mark's avatar next to `Ask Beth`.

## Exact fix
File: `companion-persona-safe.js` (and `public/companion-persona-safe.js`)

Before:
```js
setButtonLabel(root.querySelector('#toggle-mark-panel'), 'Ask Mark', 'Ask Beth');
```

After:
```js
const readerCompanionButton = root.querySelector('#toggle-mark-panel');
setButtonLabel(readerCompanionButton, 'Ask Mark', 'Ask Beth');
applyAvatar(readerCompanionButton?.querySelector(':scope > img'));
```

`applyAvatar()` already contains the canonical persona mapping:
```js
img.src = id === 'beth' ? CONFIG.beth.avatar : img.dataset.msgMarkSrc;
img.alt = cfg().name;
```

Beth maps to `/assets/companions/beth/beth-avatar.png`; Mark maps back to `/assets/ask-mark/ask-mark-avatar.png`.

No MutationObserver was added or used by `companion-persona-safe.js`.

## Chromium component test
The exact `companion-persona-safe.js` from this build was executed in Chromium against a rendered `#toggle-mark-panel` DOM.

Assertions passed:
- Beth: text `Ask Beth`, src `/assets/companions/beth/beth-avatar.png`, alt `Beth`.
- Mark: text `Ask Mark`, src `/assets/ask-mark/ask-mark-avatar.png`, alt `Mark`.

The environment blocks Chromium navigation to localhost, so this was an isolated Chromium DOM/component test of the exact production module rather than a full app navigation test.
