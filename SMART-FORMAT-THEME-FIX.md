# Smart Format + visual consistency pass

Changes are based on the last working themed build.

## Smart Format
- Adds a Format subsection inside Reader > Display for Read Anything/imported text.
- Actions: Clean spacing, Paragraphs, Sections, Format all, Original.
- The preserved original is always the source for a formatting pass.
- No paraphrasing or simplification is performed by Smart Format.

## Visual corrections
- Normalizes remaining legacy green accents to the application blue family.
- Reader title is smaller and more professional.
- Ask Mark control/header uses navy with bright-gold text.
- Ask Mark panel scrollbar is widened and given an explicit interactive stacking context.

## Protected reader verification
- app.js and public/app.js are byte-for-byte unchanged from the source build.
- public/reader/* is byte-for-byte unchanged from the source build.
- read-anything.js passes node --check.

Note: scripts/audit-reader-contract.js in the source build cannot complete because its protected checksum manifest does not contain the current reader hashes. This was already true of the source package; direct byte comparison was used for this patch.
