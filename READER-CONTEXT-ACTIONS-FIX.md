# Reader context actions + bookmark visual fix

Scoped fixes only:
- Correct normal-scroll bookmark page calculation so scroll position is not counted twice.
- Capture bookmark page at right-click time before Ask Mark highlighting can redraw the word DOM.
- Make Look Up Word, Save Definition, Add Note, and Add Bookmark use the captured right-click context.
- Keep Save Definition result in the initiating Ask Mark panel.
- Repaint the bookmark ribbon after the context-menu action.
- Normalize remaining legacy green/teal stylesheet literals to the application blue family.

Protected reader engine modules are unchanged.
