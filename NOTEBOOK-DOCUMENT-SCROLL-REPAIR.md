# Notebook document scroll repair

Scope: Notebook scrolling only.

The earlier Notebook patch created a nested scroll container with a viewport max-height. This revision removes that nested-scroller behavior and restores normal document scrolling while the standalone `.global-notebook-page` is present.

Changed files:
- `styles.css`
- `public/styles.css`
- `index.html` (stylesheet cache-buster only)
- `public/index.html` (stylesheet cache-buster only)

Reader/right-click/walkthrough/companion JavaScript is unchanged.
