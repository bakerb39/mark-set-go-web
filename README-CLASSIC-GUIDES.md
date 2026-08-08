# Mark, Set, Go! — Classic Guides v1

This patch adds Classic Guides as a self-contained feature and deliberately does NOT edit:
- app.js
- reader/ReaderLegacyRuntime.js
- reader/ReaderEngine.js
- reader/VirtualRenderer.js
- right-click handlers

## Files to add
Copy these into the matching paths under `public/`:
- `classic-guides.css`
- `modules/guides/classic-guides.js`
- `data/classic-guides-catalog.json`
- `data/classic-guide-iliad.json`

## One index.html change
Add this script tag AFTER `/app.js` (or near the other page modules):

```html
<script defer src="/modules/guides/classic-guides.js?v=1.0.0"></script>
```

No CSS link is required; the module loads `/classic-guides.css` itself.

## What v1 does
- Adds `Classic Guides` to the Browse dropdown automatically.
- Renders a searchable/filterable Classic Guides library into `#app`.
- Includes a catalog scaffold representing the Great Books list.
- Provides a complete first reference guide for Homer's `The Iliad`.
- Tabs: Guide, Key Ideas, Images, Notebook, Ask Mark Chats, Quiz, Action Plan.
- Includes Great Ideas tags.
- Leaves existing Reader and right-click code untouched.

## Important catalog note
Some Britannica entries are collections (`Plato, Dialogues`, `Aristotle, Works`, `Shakespeare, Plays`, etc.).
The scaffold keeps a collection entry where the source does not enumerate every component work.
As we create guides, those collection records should be split into individual-work records.
