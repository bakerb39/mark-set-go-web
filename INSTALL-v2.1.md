# Classic Guides v2.1 — Great Books Library integration

Classic Guides is NOT a Browse-menu item.

## Only index.html change

Make sure this module is loaded directly after app.js:

```html
<script defer src="/app.js?v=9.2.1-reader-surface-click"></script>
<script defer src="/modules/guides/classic-guides.js?v=2.1.0"></script>
```

Do NOT add a Classic Guides button to the Browse menu.

## Result inside Great Books Library

The `Great Books of the Western World` page gets an internal section switcher:

- Great Books Library
- Classic Guides

For any work with a completed guide, its row also receives a `Classic Guide` action.
Currently that is The Iliad.

This keeps the feature conceptually and visually inside Great Books Library.

## Protected code
No reader, playback, bookmark, highlight, or right-click code is changed.
