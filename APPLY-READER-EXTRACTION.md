# Apply this patch

Copy these files into the matching paths in the project.

`ReaderInteractions.js` from the abandoned experiment may remain on disk, but it must NOT be referenced by `index.html`; this patch removes that script reference. The full build removes the unused file entirely.

After applying, run:

```bash
npm run audit:reader
```

Expected result:

`Protected reader exact-extraction audit passed.`
