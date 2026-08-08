# Chromium Verification — v9.6.4

Date: 2026-08-08
Browser: Chromium 144.0.7559.96 (headless)

The environment blocks navigation to localhost/file URLs by enterprise policy, so the exact local HTML, CSS and JavaScript build files were injected into an `about:blank` Chromium page through the Chrome DevTools Protocol. The application code executed in Chromium; local image URLs cannot render in that harness, so image *selection paths* were asserted in the DOM rather than visually validated from pixels.

Behavior checks run in Chromium:

- Beth home state: one `Meet Beth.` caption; redundant HTML companion tagline hidden; Beth hero asset path selected.
- Global help button: exactly one label span and text `Ask Beth`.
- Reader walkthrough sample opened, a real `contextmenu` event opened Word Actions, and Lookup was activated using pointerdown → pointerup → click.
- Exactly one companion Word lookup message was produced.
- Reader companion header and lookup author remained Beth; no Mark author leaked into Beth messages.
- Explain action displayed `I’m reading this…`.
- Features board order rendered as Ideas → Planned → Testing → In Progress → Completed.
- Companion safe module and Ask Mark hub contain no MutationObserver.

All listed behavior assertions passed.
