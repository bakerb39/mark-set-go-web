# v9.4.6 right-click restore

- Restores app-walkthrough.js and public/app-walkthrough.js byte-for-byte from the known-good v9.3.8 right-click regression-fix build.
- Restores styles.css/public/styles.css from the v9.3.8 baseline, then appends companion-only visual/profile CSS.
- Removes the later v9.4.1 CSS rules that targeted .word-context-menu and other right-click surfaces.
- Companion code remains separate and does not install a contextmenu handler.
- Beth/Mark assets and profile selection remain present.
