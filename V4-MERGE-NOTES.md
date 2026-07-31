# Mark, Set, Go! v4.0 merge

This build deliberately uses the uploaded `mark-set-go-web-main.zip` as the server/API baseline because that is the source corresponding to the Render deployment where fetch-based features work.

Preserved from the known-good baseline:
- `server.js` unchanged
- API proxy/fetch routes for YouTube search, dictionary, news, weather, library search, translation, illustrations, and related services
- package scripts/dependencies

Merged from the newer reader build:
- ReaderEngine / BookModel / SessionManager / VirtualRenderer modules
- draggable Center Focus Anchor and stored anchor position
- focus-anchor font-size behavior
- combined focus-anchor overlays with supported reading modes
- reader position preservation
- smaller incremental render batches/performance improvements
- TOC cleanup changes
- Book Pages fixes from the latest reader build

The server-side fetch implementation was not rewritten or substituted. It is copied from the uploaded known-good web version.
