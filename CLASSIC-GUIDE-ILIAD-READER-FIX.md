# Classic Guide Iliad Reader Fix

- The Iliad Classic Guide now opens directly in the existing Reader from the Great Books row.
- No separate Classic Guide page is introduced in this flow.
- Opening the guide immediately registers it in My Library as a `classic-guide`.
- My Library can reconstruct the bundled Iliad guide if an old local text payload is missing.
- All 24 books now include a detailed summary, key events, characters in focus, why the book matters, watch-for themes, and two questions.
- Reader text is deliberately structured with whitespace and section hierarchy for readable pagination.
- No MutationObserver was added or modified by this patch.
