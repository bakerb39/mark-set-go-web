# Mark, Set, Go! Architecture

## v7.2.0 staged modular refactor

The browser application previously concentrated nearly all behavior in one
`app.js` file of about 12,800 lines. Version 7.2.0 establishes feature
boundaries without changing the visible application design.

### Extracted modules

- `modules/reading/digital-sign-mode.js`
- `modules/reading/pacman-mode.js`
- `modules/pages/help-page.js`
- `modules/pages/business-pages.js`

The same files exist under `public/modules` for the production static server and
under `/modules` at the project root for alternate deployment layouts.

### Core retained in app.js

- Shared application and reader state
- Startup and routing
- Reader rendering and continuity
- Ask Mark and notebook
- Library, import, study, and progress features
- General control binding

### Why this is staged

The extracted feature files remain classic browser scripts so they can use the
existing shared state safely. A later stage can introduce explicit services and
native ES module imports after browser validation proves these boundaries.
