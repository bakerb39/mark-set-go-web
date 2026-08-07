# Protected Reader Interactions

This release moves the reader's click/spacebar behavior contract out of general app integration code and into `public/reader/ReaderInteractions.js`.

Protected behavior now includes blank-space pause/resume, word-click seek semantics, translated-word precedence, and the spacebar playback contract. The broader reader behavior contract is documented in `READER-BEHAVIOR-CONTRACT.md`.

Run before reader-adjacent releases:

```bash
npm run audit:reader
```

The audit validates approved SHA-256 hashes for all five protected reader modules and runs contract assertions for click and keyboard behavior. Feature work outside the reader should not change these files or update the approved hashes.

The four previously existing reader-core modules were not modified in this release.
