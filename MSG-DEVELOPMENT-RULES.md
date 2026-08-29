# Mark, Set, Go! — Development Rules

## Purpose
Build and validate the differentiated reading product quickly. Protect working architecture and prevent UI refinement from consuming time needed for core capability.

## Current Product Priority
1. Reading Training / Training Lab
2. Chat
3. Symposium
4. Non-blocking UI polish

The immediate Training Lab goal is a convincing coaching loop:
**baseline → identify weakness → targeted exercise using Reader material → progressive challenge → comprehension check → measurable result → saved progress.**

## Productivity-First UI Rule
UI matters, but cosmetic work must not repeatedly interrupt feature development.

### Default UI workflow
1. Preserve the working structure.
2. Try visual changes in `public/msg-ui-overrides.css` first.
3. Tune uncertain CSS live in the browser before packaging.
4. Once approved, copy the exact tested values into the override file.
5. Do not modify core JS/layout architecture merely to solve a cosmetic problem.
6. Time-box non-blocking UI work to roughly 10–15 minutes.
7. If it is still unresolved and does not block use, log it as polish debt and continue.
8. Structural/usability-breaking defects remain blocking and must be fixed.

## CSS Overlay Policy
`public/msg-ui-overrides.css` should be the first destination for:
- spacing
- margins and padding
- typography
- colors/backgrounds
- hover/focus appearance
- alignment
- minor width/height presentation
- visibility/presentation corrections that do not change application state

Do not use the overlay to conceal an underlying functional defect.

## Source-First Development
Before modifying behavior:
1. Identify the actual source owner.
2. Inspect the current deployed/source version.
3. Understand existing event handlers/state/layout ownership.
4. Make the smallest change at the owning layer.
5. Never replace a core file with an unverified older/candidate copy.

Do not guess at DOM structure, selectors, routes, or state ownership when they can be inspected.

## Surgical Packaging
Every patch should:
- contain only files required for the change;
- state exactly which files to replace/add;
- identify files deliberately not touched;
- use a fresh asset/cache version when needed;
- avoid bundling unrelated working files.

Prefer ZIP packages for deployment.

## Functional Development Rule
A new feature is not complete because its UI appears. Validate the actual workflow end-to-end.

For Training Lab, test:
- launch
- Reader/highlight text acquisition
- exercise execution
- Reader interaction
- scoring
- comprehension
- progression
- persistence/history
- close/reopen behavior
- workspace behavior

## Regression Check After Changes
At minimum verify:
- permanent top band unchanged
- Reader opens and reads normally
- Reader controls still work
- workspace opens/closes/resizes
- Ask Beth works on first open
- Topic Feed header remains correct
- Profile/themes remain available
- Reader sizing/resizing remains correct
- no new blinking/reflow loop
- changed feature works end-to-end

Automate this checklist with Playwright or equivalent as the product stabilizes.

## Decision Test for New Features
Ask:

**Could a reader get essentially the same value by opening a generic browser AI beside the page?**

If yes, treat the feature as convenience rather than core differentiation.

Prioritize capabilities based on persistent reading state, training, comprehension, retention, personalization, measurable improvement, and cross-reading knowledge.

## Working Baselines
When a version is confirmed working, explicitly record it as the baseline for that subsystem. Subsequent work must preserve it unless the task specifically requires changing it.

## Definition of Done
A change is done when:
- the intended behavior works;
- important regressions are checked;
- no unnecessary architecture was disturbed;
- the patch is deployable and documented;
- remaining cosmetic issues are either resolved quickly or logged.
