# Mark, Set, Go! — Classic Guides v1.4

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


## v1.1 fix
The v1 script tried to insert the Browse entry only once at initial page load.
Because Mark, Set, Go! dynamically renders/re-renders its navigation, the Browse
control may not exist yet or can later be replaced.

v1.1 adds a MutationObserver that safely restores the Classic Guides entry
whenever the navigation is rendered. No app.js or reader/right-click code is changed.


## v1.2 navigation change
Classic Guides is no longer injected next to Browse.

It is now attached to the existing Great Books navigation area:
- Great Books
- Classic Guides

The module looks first for `[data-action="great-books"]`, then
`[data-action="greatbooks"]`, and finally an exact visible `Great Books`
navigation label. It also watches for navigation re-renders.

No reader, playback, bookmark, highlight, or right-click code is modified.


## v1.3 — Great Books page integration
Classic Guides is now integrated into the actual Great Books screen.

When the page headed `Great Books of the Western World` is rendered:
- a `Classic Guides` button is inserted in the page-header actions;
- every work whose catalog status is `ready` receives a `Classic Guide` button
  beside its existing `Study / Great Ideas` and `Grokipedia` actions;
- currently `The Iliad` is the first ready guide;
- future guides appear automatically when their catalog status changes to `ready`.

The module observes only the page DOM. It does not modify `app.js`, the reader
runtime, playback, highlighting, bookmarks, or right-click handlers.


## v1.4 — robust Great Books integration
v1.3 was too dependent on exact navigation/action markup.

v1.4:
- detects the page from the visible `Great Books of the Western World` heading;
- recognizes buttons, links, and `[role=button]` action controls;
- finds each work row from its visible `Find & Import Edition`, `Study / Great Ideas`,
  and `Grokipedia` controls;
- inserts the Iliad's `Classic Guide` immediately before `Grokipedia`;
- inserts a top `Classic Guides` action near `Search Gutenberg`;
- retries after initial render and watches later DOM re-renders.

### Diagnostic
After deploying, open DevTools Console on the Great Books page and run:

`MarkSetGoClassicGuidesDebug()`

Expected:
- `loaded: true`
- `version: "1.4.0"`
- `greatBooksPage: true`
- `libraryButton: true`
- `guideButtons` contains `{ id: "iliad", ... }`

If `MarkSetGoClassicGuidesDebug` itself is undefined, the module script is not loading.
