# Mark, Set, Go! — Constraints

## BEFORE MAKING ANY CHANGE
Check these first:

- [ ] Am I working from the current source/baseline?
- [ ] Do I know which file/component actually owns the behavior?
- [ ] Can this be solved without touching protected architecture?
- [ ] Is this cosmetic? If so, try `msg-ui-overrides.css` and live tuning first.
- [ ] Am I changing only the minimum necessary files?
- [ ] Have I avoided MutationObserver?
- [ ] Am I preserving the permanent top band?
- [ ] Am I preserving Reader/workspace geometry unless explicitly asked to change it?
- [ ] Have I avoided guessing?
- [ ] Will I regression-check the protected behaviors afterward?

If any answer is uncertain, inspect the source/runtime before patching.

## 1. Permanent Top Band — Immutable
The permanent application top band/header is the **center of the universe**.

It must not move, resize, disappear, reflow, blink, be replaced, or otherwise change unless explicitly requested.

Do not allow unrelated feature work to affect it.

## 2. Protect the Reader
Do not casually change:
- Reader engine/state architecture
- Reader dimensions
- Reader panel geometry
- borders/radius/overflow/positioning
- pagination behavior
- playback controls
- resizing behavior
- Reader initialization
- Reader 2/secondary Reader behavior

Core Reader changes require an actual functional need and source inspection.

## 3. Protect Workspace Architecture
Use the established workspace system rather than recreating it.

Do not invent parallel side-frame/split-pane systems when the existing workspace can provide the behavior.

Preserve:
- workspace primary/secondary structure
- tabs
- splitter/resizing
- close behavior
- mounted panel behavior
- existing workspace routes

## 4. No MutationObserver
Do not introduce `MutationObserver` in MSG patches.

Use explicit lifecycle hooks, existing events, bounded retries, ResizeObserver when appropriate, or direct state transitions instead.

## 5. Source Inspection Before Modification
Never guess which source owns a behavior.

Inspect:
- current source
- live DOM/runtime when necessary
- existing event/state ownership
- current asset version

Do not replace core files with unverified candidates or historical copies.

## 6. Preserve Working Baselines
Once the user confirms a subsystem works, treat it as protected.

Current important principle:
**do not regress a working subsystem while adding an unrelated feature.**

If a change requires touching a protected baseline, explain why before making the patch.

## 7. Surgical Changes Only
Do not package unrelated files.

A CSS change should not include `app.js`.
A Training Lab change should not replace Reader/workspace files unless the feature genuinely requires it.
A workspace change should not alter Topic Feed, themes, or the permanent header without necessity.

Every package must identify exactly what changed.

## 8. UI Changes Use the Overlay First
For non-structural visual corrections, first use:

`public/msg-ui-overrides.css`

Prefer live browser tuning before deployment when values are uncertain.

Do not repeatedly modify core layout code to chase spacing, font, color, hover, or alignment issues.

## 9. Do Not Hide Functional Problems With CSS
CSS may solve presentation.
It must not mask broken state, missing initialization, failed handlers, incorrect routing, or architecture problems.

Fix functional defects at their actual owner.

## 10. Training Lab Integration
Training Lab should use the existing Reader whenever that makes sense.

Exercises should preferentially use:
- current Reader material
- user-highlighted material when appropriate
- current reading context

Training Lab chooses/coaches the exercise; the existing Reader performs reading behavior where possible.

Avoid building a separate miniature Reader unless the exercise genuinely requires a standalone drill.

## 11. Ask Beth Context Rule
When text is highlighted, passage-specific Ask Beth actions should use the highlighted text.

When nothing is highlighted, article-level actions may use the whole article.

Ask Beth is a component of the reading system, not the primary product differentiation.

## 12. Workspace Side Pages
When a feature is intended to behave like Notebook/other workspace pages, use the real workspace mechanism.

Do not imitate the appearance with a custom `<aside>` or custom Reader grid.

## 13. Secondary Reader
Minor accepted startup blink in Reader 2 is not currently a blocking issue.

Do not reopen or redesign secondary Reader initialization merely to chase that accepted cosmetic behavior.

## 14. Avoid Known Failed Patterns
Do not revive:
- white shielding that blanks the Reader
- parser-order/document.write conditional loading
- unverified core `app.js` replacements
- custom learning side-frame grids that compete with workspace
- external scroll corrections that fight Reader scroll state
- Training Lab launch using the generic `data-action` router
- overpackaged feature ZIPs

## 15. Training Lab Menu Routing
Training Lab-specific launch controls must not accidentally enter the application's generic navigation router.

Use isolated, intentional routing/hooks.

## 16. Deployment / Asset Verification
When a change appears to have no effect:
1. verify the browser-loaded asset URL/version;
2. verify the expected DOM/runtime state;
3. only then change code.

Do not create another patch merely because a previous one appears unchanged.

## 17. ZIPs Preferred
Provide deployment changes as ZIP packages rather than loose `.js` files unless specifically requested otherwise.

## 18. Core Priority
Do not allow non-blocking polish to repeatedly displace:
1. Reading Training
2. Chat
3. Symposium

UI defects that prevent use remain blocking. Cosmetic imperfections should be time-boxed and logged.

## 19. Regression Guard
Before declaring a change successful, protect:
- permanent header
- Reader
- workspace
- Ask Beth
- Topic Feed header
- themes/Profile
- resizing
- current feature behavior

## 20. Stop When Evidence Contradicts the Assumption
If runtime diagnostics show the architecture differs from the assumption, stop patching and update the model from the evidence.

Diagnostics beat guesses.
