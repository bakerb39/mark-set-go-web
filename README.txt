Mark, Set, Go! v7.3 — CACHE RESET + THEME OWNER + NATIVE BOOKMARK

WHY v7.1/v7.2 COULD LOOK LIKE THEY DID NOTHING
The production server cached every static file for one hour, including index.html.
A browser could therefore keep the old index, which kept requesting the old app.js/CSS URLs even after deployment.

REPLACE THESE FILES
- server.js
- public/index.html
- public/app.js
- public/explorer-theme.css

WHAT v7.3 DOES
1. server.js now sends no-store/no-cache for public assets and SPA fallback HTML.
2. index.html gives every theme-critical asset a new v7.3 URL so existing cached copies cannot win.
3. app.js retains the v7.2 theme-owner fix: app.js does not write data-msg-experience-theme.
4. app.js retains the native addBookmark() path and stable navigation-pane click binding.
5. explorer-theme.css is the restored full Explorer stylesheet.

FIRST LOAD AFTER DEPLOY
The OLD cached index response may still be fresh in the browser. Open the app once with a unique query string (for example ?msgbuild=7.3) or use Ctrl+Shift+R. After v7.3 is loaded, the server no-cache policy prevents this stale-build problem on later deploys.

NOT CHANGED
- Workspace/Reader geometry
- Topic Feed code
- Reader modes/pagination
- Bookmark storage key/path
- No MutationObserver added
