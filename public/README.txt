Mark, Set, Go! compact music + Ask Mark X fix

Replace these four files in /public:
- app.js
- index.html
- ask-mark-hub.js
- reader-music-quick.js

Changes:
1. Ask Mark X now uses a canonical app-level close function and a capture-phase fallback.
2. Compact music menu adds:
   - Suggested for this reading
   - Reading mood
   - Other result (cycles YouTube search recommendations)
3. Cache-busting versions were updated in index.html.

After replacing, hard refresh the browser (Ctrl+Shift+R).
