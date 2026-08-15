MARK, SET, GO! — ASK CHAD INVESTOR FOLLOW-UP CHAT FIX

This package is cumulative with the current Topic Feeds / Ask Chad /
active-companion text-sync build.

Replace:
  /public/read-anything.js
  /public/index.html

WHAT THE SCREENSHOT REVEALED

The article Investor Analysis was being inserted into the Ask-companion panel,
but it did NOT create the Reader selection/context that the existing text-chat
path requires.

The app's normal runMarkAction() returns immediately when state.markSelection
is empty. The Ask companion chat could therefore add the user's message and
typing dots, but there was no article context for the legacy action to send.

FIX

1. After Investor Analysis completes, Read Anything now builds a compact
   whole-article context containing:
   - article title
   - initial investor analysis
   - key investor takeaways
   - catalysts / what to watch
   - risks
   - general investor posture
   - as much original article text as safely fits

2. That context is attached to the Reader's existing state.markSelection.
   This deliberately reuses the app's EXISTING text-chat / runMarkAction flow
   instead of creating a second chat system.

3. The context stays below the existing /api/mark-selection limits
   (1,800 words / 12,000 characters).

4. Cached investor analyses also restore this follow-up context.

5. The Investor Analysis loading/status copy now uses the ACTIVE companion at
   the source:
       Chad is analyzing...
       Beth is analyzing...
       Mark is analyzing...
   instead of hard-coding "Mark" and relying on a later DOM replacement.

6. The existing active-companion server/chat identity protections remain in
   the package, so follow-up answers identify themselves as Chad when Chad is
   selected.

No Reader engine, playback, pagination, virtual renderer, or Book Pages
architecture was changed.
