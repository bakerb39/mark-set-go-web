# Mark, Set, Go! — Training Lab v0.1.0

This is a deliberately additive first implementation of the Reading Training Lab. It is meant for a feature branch so the training experience can be evaluated without changing the protected Reader engine.

## What is implemented now

- Training Lab modal/dashboard and a **Start today's training** workflow.
- Eye training: **Fixation Trainer**, **Peripheral Span**, **Regression Control**, and **Edge Avoidance**.
- Speed training: **Speed Bursts**, **Phrase RSVP**, **Focus Tunnel**, and comprehension-controlled **Adaptive Pace**.
- Comprehension training: **Preview/Map**, **Active Recall**, and **Prediction**.
- Advanced training: uses the reader's existing **Meaningful Chunks** immediately and exposes an AI/NLP extension hook for later semantic phrase boundaries.
- Persistent local progress: baseline WPM, training/stretch WPM, comprehension, verified reading rate, visual span, assessments, and session history.
- A 15-minute guided training sequence.
- No `MutationObserver`; runtime tracking uses existing Reader DOM/state plus `requestAnimationFrame`.

## Integration philosophy

The current reader switching code already operates as a layer above the core Reader runtime. Training Lab follows the same pattern: it reads the active Reader, changes ordinary Reader controls through their existing DOM events, and adds temporary overlays. It does **not** replace `ReaderEngine`, `ReaderContinuity`, pagination, workspace, or the Reader's core start/pause implementation.

## Add these files

Copy:

- `public/modules/training/training-lab.js`
- `public/modules/training/training-lab.css`

Then add these two references to `public/index.html`:

```html
<link rel="stylesheet" href="/modules/training/training-lab.css?v=0.1.0">
```

Load the script **after `app.js` and after the Reader switching/menu layer**:

```html
<script defer src="/modules/training/training-lab.js?v=0.1.0"></script>
```

The module automatically adds a `Training Lab` button next to the Reader pane controls whenever a document is open.

## AI integration hook

The first version intentionally does not assume a specific Ask Mark endpoint. It emits:

```js
document.addEventListener('marksetgo:training-ai-request', (event) => {
  console.log(event.detail.task, event.detail);
});
```

Current tasks include `preview` and `score-recall`. Your Ask Mark layer can listen for these and return a richer experience in a later refinement. The Training Lab remains usable without AI.

## Verified Reading Rate

The lab uses:

`verified WPM = raw WPM × comprehension percentage`

Example: 600 WPM × 60% = 360 verified WPM, while 475 WPM × 90% = 428 verified WPM. This makes comprehension govern advancement.

Adaptive pace currently uses a transparent rule:

- comprehension ≥ 92% → +10%
- comprehension ≥ configured floor (default 85%) → +5%
- 75–84% → -4%
- below 75% → -12%

This is intentionally simple for v0.1.0 so you can observe and refine it before introducing a more sophisticated model.

## Known refinement areas

1. The daily session should eventually use real comprehension questions from the current passage instead of manual score entry.
2. Semantic Chunking currently delegates to the existing Meaningful Chunks implementation; true syntactic/semantic boundaries should be supplied through an NLP/AI adapter.
3. Difficulty-aware adaptive pacing is not enabled yet because it needs a reliable paragraph-difficulty scoring contract.
4. Fixation targets are inferred from rendered word geometry. That is appropriate for browser training but is not equivalent to actual eye tracking.
5. Peripheral-span scoring is self-reported in v0.1.0. A later version can briefly display phrases and then test recognition.
6. The daily-training timing is intentionally easy to change after usability testing.
7. Database/cloud persistence should be added only after the Training Lab metrics contract stabilizes; v0.1.0 uses localStorage.

## Console API

```js
MarkSetGoTrainingLab.open();
MarkSetGoTrainingLab.run('fixation');
MarkSetGoTrainingLab.run('peripheral');
MarkSetGoTrainingLab.run('regression');
MarkSetGoTrainingLab.run('burst');
MarkSetGoTrainingLab.run('phrase');
MarkSetGoTrainingLab.run('tunnel');
MarkSetGoTrainingLab.stop();
MarkSetGoTrainingLab.getProgress();
MarkSetGoTrainingLab.recordAssessment(450, 90);
```

## First QA pass

Test on your branch in this order:

1. Open an ordinary article/book and verify the Training Lab button appears.
2. Open/close the lab; verify the top band/reader layout does not move.
3. Run Fixation Trainer in normal Reader and Book Pages.
4. Run Regression Control and confirm already-read words fade without changing layout.
5. Run Focus Tunnel while scrolling/paging.
6. Run Phrase RSVP and verify it selects Flash + Meaningful Chunks using existing controls.
7. Run Speed Bursts and confirm the visible WPM control follows the phase changes.
8. Complete an assessment and reload the page; confirm progress remains.
9. Switch Reader slots and ensure the Training Lab button follows the active Reader.
10. Verify all existing Reader modes still behave identically when Training Lab is stopped.
