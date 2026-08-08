# Classic Guide Library + Iliad Detail Fix

Changes:
- Classic Guides opened in Reader now register immediately in My Library, like Modern Guides.
- My Library labels Classic Guide records distinctly and can reopen their locally persisted text.
- The standalone Iliad guide now has a Read Guide in Reader action.
- The Reader handoff uses `/?classicGuide=iliad`, loads the bundled Iliad guide JSON, converts it to Reader text, and uses source type `classic-guide`.
- All 24 Iliad books now include key events, characters in focus, why the book matters, watch-for guidance, and two study questions.
- No MutationObserver was added or modified by this patch.
