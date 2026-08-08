# Right-click → Ask Mark diagnostic patch

Logging only. No intended behavior changes.

Reproduce: Reader → another page → Reader → right-click a word → Look up word.
Open DevTools Console and report the last RC-DIAG marker you see:

1. `[RC-DIAG 1] menu opened`
2. `[RC-DIAG 2] lookup clicked`
3. `[RC-DIAG 3] Ask Mark lookup dispatched`
4. `[RC-DIAG 3R] dictionary result written`
5. `[RC-DIAG 4] response rendered in Ask Mark`

The extra 3R marker distinguishes the dictionary/API result from the Ask Mark bridge/render step.
