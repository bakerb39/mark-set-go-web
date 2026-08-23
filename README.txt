Mark, Set, Go! v7.33.3 Reader stability package

Baselines:
- v7.33.1 non-workspace Reader switching for index/workspace files
- v7.32.2 app.js secondary-Reader architecture
- latest fuller Read Anything article-actions implementation from the Library

Fixes in this package:
1. The primary "Reader" navigation item remains a direct Reader button.
2. The "Readers" control owns the Reader-session dropdown, and the standalone + button now sits after Readers rather than beside the primary Reader item.
3. A newly added Reader 2+ starts on the empty Reader chooser instead of inheriting Reader 1. Shared startup/browser-capture content is not auto-consumed by an auxiliary Reader.
4. A secondary Reader initially opens at one-half of the usable reading/workspace width. The divider remains resizable afterward.
5. The native Reader hover/cursor tooltip is removed in auxiliary Readers (and cleanup support is included).
6. Auxiliary Reader controls inherit the current experience theme rather than falling back to generic blue controls.
7. Read Anything article actions (Summarize / Analyze / Create Post / sharing) no longer fight Topic Feed placement via a MutationObserver, eliminating the blink-and-disappear behavior from that path.

Deliberately untouched:
- public/reader/BookModel.js
- public/reader/SessionManager.js
- public/reader/ReaderEngine.js
- public/reader/VirtualRenderer.js
- public/reader/ReaderLegacyRuntime.js

The earlier localStorage formatting-version quota warning is NOT changed in this stability package. It should be handled separately once Reader behavior is stable.
