# v9.5.2 profile label hard lock

Only fixes the companion selector regression.

- Mark option always renders `Ask Mark`.
- Beth option always renders `Ask Beth`.
- Labels are rendered by choice-specific CSS rather than the global persona text substitution, so selecting Beth cannot rewrite the Mark option.
- No reader, right-click, context-menu, selection, walkthrough, Notebook, or global companion behavior was changed.
