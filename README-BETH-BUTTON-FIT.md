# Beth compact avatar fit patch

Scope: fixes Beth's compact UI images only. The homepage continues to use the existing `beth-frontpage-badge.png`.

## Canonical mapping
- Homepage: `/assets/companions/beth/beth-frontpage-badge.png`
- Reader/help/profile/chat/lookup: `/assets/companions/beth/beth-ui-avatar.png?v=9.6.9`

`beth-ui-avatar.png` is a tight crop made from the app's existing Beth portrait (`beth-avatar.png`). It is not generated artwork.

## Render verification
Rendered in Chromium using the exact updated `styles.css` and `app-help-mark.css` from this patch.
- Reader image: 30x30, object-fit cover, centered.
- Floating help image: 34x34, object-fit cover, centered.
- Both render Beth's face filling the circle rather than the full ASK BETH badge.

No right-click/context-menu behavior was changed. No MutationObserver code was added or modified.
