SECTIONQUIZ RUNTIME FIX

This patch targets the ACTUAL files served by server.js: public/app.js and public/index.html.

Fix:
- [[MSG:SECTIONQUIZ]] is recognized as a guide action token.
- It renders as a "Quiz me" button instead of literal text.
- The button launches a section-level comprehension check.
- public/index.html cache-busts app.js so the browser loads the corrected runtime.

Install: copy the public folder over the app's public folder, preserving paths.
