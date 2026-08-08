# Right-click navigation fix

Fixes a stale document-level pointerdown listener left behind after navigating away from Reader and returning.

The old listener captured the previous `#word-context-menu` element. A click on the newly rendered menu was therefore misclassified as an outside click, which hid the live menu before its Lookup action could receive pointerup/click.

The outside-click closer is now installed once and resolves the currently connected context menu at event time.

The `contextmenu` / right-click-open handler itself was not changed.
