# Mark, Set, Go! v9.6.2 patch-only

Apply these files over the matching paths in the full application.

## Included
- Confirmed right-click stale outside-listener fix (preserved in app.js).
- `/?debug` Debug Center with automated regression suite, bug catalog, stable-build manifest, runtime snapshot, event probe, and copyable report.
- `/?features` roadmap for ongoing and future feature work.
- Detailed non-Reader Ask Mark / Ask Beth page help, avatar, and slightly higher floating button.
- Safe Mark/Beth Profile companion choice with no MutationObserver.
- Reading status changed to `I’m reading this…`.
- Read Anything Format control layout cleanup.

## Known unresolved issue
Notebook mouse-wheel scrolling remains cataloged as open; this patch does not claim to fix it.

## Protected behavior
Reader module files are not included and were byte-compared against the supplied source. Do not overwrite the confirmed right-click behavior with older app.js copies after applying this patch.
