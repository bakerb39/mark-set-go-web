# MSG Product Vision & Roadmap

## Purpose

This document is the authoritative working roadmap for **Mark, Set, Go!** It consolidates the future goals, ideas, product direction, differentiation, and development priorities that have emerged across the project.

The central product thesis is:

> **Mark, Set, Go! is a personal reading intelligence and learning environment — not merely a speed reader or an AI chatbot.**

The long-term system should help readers:

**READ → LEARN → THINK → DISCUSS → CONNECT → APPLY**

It should also develop continuity over time: understanding how a person reads, what they remember, what they struggle with, what ideas recur across their reading, and how their thinking changes.

---

# 1. Core Product Vision

## READ — Read effectively in the moment

### Existing / evolving
- Advanced Reader with multiple reading modes.
- WPM controls and pacing.
- Line Sweep.
- Book Pages / two-page reading.
- Highlighting and selection.
- Chunking.
- Focus tools.
- Bionic / bold-focus reading.
- Pointer / reading guide modes.
- Continuous scroll.
- Marquee / RSVP-style modes.
- Full-screen reading.
- Resume / reading-position persistence.
- Imports from multiple sources.
- Article reading.
- EPUB / PDF / OCR support.
- Public-domain books.
- Kindle capture workflow.

### Future direction
- Adaptive WPM by genre, difficulty, and reader performance.
- Better distinction between:
  - configured WPM,
  - measured WPM,
  - comprehension-adjusted effective WPM.
- Automatic detection of reading difficulty.
- Recommendations for appropriate reading mode based on material.
- Smarter phrase grouping and semantic chunking.
- Reading missions with measurable objectives.
- Better reading-session analytics.
- Reader performance history over time.

---

# 2. Reading Training / Training Lab

## Product goal

The Training Lab should become one of the primary differentiators of Mark, Set, Go!

The core experience should be:

> **baseline → identify weakness → targeted exercise using the reader's actual material → progressive challenge → comprehension check → measurable result → saved progress**

A successful 10–15 minute session should make the reader feel that the system:
1. identified a specific weakness,
2. trained it using text they were already reading,
3. measured whether they improved.

## Training areas

### Speed and pacing
- Baseline reading speed.
- Comfort WPM.
- Training WPM.
- Stretch WPM.
- Ceiling testing.
- Variable-speed reading.
- Speed bursts.
- Controlled pacing.

### Fixation and visual efficiency
- Fewer fixations per line.
- Phrase-level fixation.
- Visual-span expansion.
- Peripheral-span exercises.
- Edge avoidance.
- Fixation placement.
- Rhythm.

### Regression control
- Measure unnecessary regressions.
- Train forward reading.
- Detect over-rereading.
- Differentiate useful rereading from habitual regression.

### Phrase chunking
- Semantic phrase chunking.
- Meaningful chunks rather than arbitrary word groups.
- Exercises using the current Reader material.
- Gradually increase phrase span.

### Comprehension under speed
- Reading-speed vs comprehension curve.
- Effective WPM:
  - **Effective WPM = WPM × comprehension**
- Question-type analysis.
- Identify whether comprehension breaks down on:
  - factual recall,
  - inference,
  - main idea,
  - argument,
  - vocabulary,
  - relationships,
  - details.

### Focus
- Focus sprints.
- Distractibility tracking.
- Sustained-attention sessions.
- Reading-session interruption patterns.

### Vocabulary
- Vocabulary recognition.
- Contextual vocabulary.
- Saved vocabulary.
- Review and recall.

## Important Training Lab design rule

> **Training Lab chooses the exercise; the existing Reader performs it.**

Whenever appropriate, exercises should use:
- the current book/article,
- the current section,
- highlighted text,
- the reader's actual reading material.

Standalone artificial drills should be used only when real text would interfere with the exercise.

---

# 3. Reader Intelligence

## Strategic purpose

Reader Intelligence should become the central shared intelligence layer for:

- Ask Beth / Mark / Chad,
- Training Lab,
- Chat,
- Symposium,
- recommendations,
- progress analysis,
- future coaching.

Recommended shared architecture:

```text
Reader
  ├── live reading state
  ├── performance metrics
  ├── Training Lab history
  ├── comprehension history
  ├── goals
  ├── notes / bookmarks / vocabulary
  ├── reading history
  ├── preferences
  └── interests / recurring concepts
          │
          ▼
  MSGReaderIntelligence
          │
     permission filter
          │
   ┌──────┼─────────────┐
   ▼      ▼             ▼
 Ask AI  Training   Chat / Symposium
```

Recommended API concept:

```js
window.MSGReaderIntelligence.getContext()
```

## Live awareness

The intelligence layer should know, when permitted:
- current Reader WPM setting,
- measured WPM,
- current reading mode,
- document title,
- author,
- source type,
- position in document,
- selected/highlighted text,
- current section,
- session duration,
- Reader settings,
- active exercise,
- active goals.

## Recent performance

- Recent WPM.
- Average WPM over recent sessions.
- Recent comprehension scores.
- Effective WPM.
- Recent Training Lab results.
- Recent quiz results.
- Recent vocabulary.
- Recent books/articles.
- Recent reading difficulties.
- Recent abandoned or unfinished reading.

## Persistent profile

- Reading goals.
- Reading history.
- Reading preferences.
- Strongest skills.
- Weakest skills.
- Long-term WPM trends.
- Long-term comprehension trends.
- Retention trends.
- Vocabulary growth.
- Topics of recurring interest.
- Repeated questions.
- Notes and objections.
- Reading-mode effectiveness.
- Books/authors frequently revisited.
- Personal intellectual history.

## Accuracy rule

AI companions must:
- use metrics only when supplied,
- never invent reader statistics,
- clearly state when information is unavailable,
- respect permission settings.

---

# 4. Personal Data Ownership & Privacy

The reader should own the Reader Intelligence profile.

## Storage options

### Local only
Use IndexedDB for substantial structured profile/history data.

Possible uses:
- reading history,
- training history,
- comprehension,
- vocabulary,
- notes,
- profile inferences,
- Reader Intelligence data.

### Cloud
Use the application database for:
- sync across devices,
- cloud history,
- account continuity.

### Possible future option
- Local + encrypted backup/sync.

## Storage abstraction

Reader Intelligence should use a storage adapter so profile logic is independent of storage location.

## What the reader controls

The reader should be able to:
- inspect their data,
- export their data,
- choose storage location,
- restrict AI access,
- delete specific categories,
- delete all Reader Intelligence data.

## Granular deletion

Examples:
- reading history,
- Training Lab history,
- comprehension results,
- notes/bookmarks,
- vocabulary,
- interests,
- inferred coaching patterns,
- AI conversation history,
- everything.

If both local and cloud data exist, clearly distinguish:
- **This device**
- **Cloud data**
- **Everything**

## Observed vs inferred data

### Observed
- WPM,
- quiz scores,
- reading position,
- session duration,
- notes,
- highlights,
- activity.

### Inferred
- likely weaknesses,
- interests,
- coaching patterns,
- recurring themes,
- likely preferred reading modes.

Users should be able to inspect and delete both.

---

# 5. Ask Beth / Mark / Chad

## Strategic direction

Generic "chat about the current page" is increasingly a commodity feature.

Ask Beth / Mark / Chad should therefore become **reader-aware**, not merely document-aware.

The assistant should know relevant reader context when permission is granted.

Example future response:

> "You're currently set to 210 WPM, but your recent measured rate is closer to 185 WPM with 84% comprehension. Your comprehension drops most on inference questions above 220 WPM. I would train phrase chunking at about 200 WPM before increasing speed."

## Companion awareness

Possible context:
- current Reader state,
- WPM,
- measured performance,
- comprehension,
- goals,
- recent Training Lab results,
- vocabulary,
- notes,
- bookmarks,
- reading history,
- current book,
- previous related books,
- recurring themes,
- enabled coaching tools.

## Permission model

Settings area:

### What Beth / Mark Can Know
- Allow all Reader context.
- Current reading activity.
- Position.
- WPM and Reader settings.
- Comprehension results.
- Training results.
- Reading goals.
- Reading history.
- Notes and bookmarks.
- Vocabulary.
- Interests/topics.
- Saved insights.
- Long-term performance trends.

## Context efficiency

Do not dump the entire user profile into every AI request.

Instead:
- identify the question,
- retrieve only relevant Reader Intelligence context,
- send a compact structured snapshot.

Example:
- "What is my WPM?" → performance fields only.
- "What should I practice?" → WPM + comprehension + training + weaknesses + goals.
- "Have I seen this idea before?" → current passage + notes/books/concepts.

---

# 6. AI Teaching / Coaching Roles

Future companion roles may include:

- Tutor
- Socrates
- Critic
- Examiner
- Coach
- Analyst
- Debate partner
- Author/persona mode

Possible uses:
- comprehension review,
- argument interrogation,
- oral examination,
- Socratic questioning,
- explain-back,
- teach-back,
- counterarguments,
- compare interpretations,
- prepare for discussion.

---

# 7. Chat

Chat should become broader than Ask Beth's immediate passage actions.

## Future possibilities
- persistent reading conversations,
- conversation tied to books/passages,
- multi-book discussion,
- topic threads,
- saved conversations,
- personal reading coach,
- conversations informed by Reader Intelligence,
- transition from Reader → Chat without losing context,
- Notebook / Chat handoff,
- question history,
- discussion summaries.

## Priority

Current agreed product sequence:

1. **Reading Training**
2. **Chat**
3. **Symposium**
4. Non-blocking UI polish

---

# 8. Symposium

## Core concept

A dynamic environment in which multiple perspectives discuss a text, question, or idea.

Potential formats:
- debate,
- interview,
- court / trial,
- panel,
- Socratic dialogue,
- author conversation,
- historical-persona conversation,
- adversarial review.

## Important behavior

Participants should:
- respond directly to the reader,
- react to reader input,
- disagree with one another,
- refer back to the text,
- use the reader's existing context when permitted,
- remember the reader's stated position within the session.

## Future improvements
- better moderation,
- stronger speaker transitions,
- context cards,
- different speaker roles,
- visual stage states,
- direct response to user challenges,
- saved debates,
- compare user's position before/after discussion.

---

# 9. LEARN — Understanding and Retention

Future learning tools include:

- comprehension quizzes,
- active recall,
- delayed recall,
- teach-back,
- flashcards,
- mnemonics,
- vocabulary,
- spaced repetition,
- confidence scoring,
- review scheduling,
- comprehension by question type,
- retention measurement over time.

## Long-term goal

The system should distinguish:
- what the reader understood immediately,
- what they remembered later,
- what they forgot,
- what learning technique worked best.

---

# 10. THINK — Deep / Analytical Reading

Inspired in part by Mortimer J. Adler and analytical reading.

Potential modes:

### Explore
- inspectional reading,
- preview,
- identify structure,
- identify key sections,
- estimate difficulty.

### Study
- main ideas,
- key propositions,
- topic sentences,
- definitions,
- assumptions,
- evidence,
- objections,
- unanswered questions.

### Compare
- compare passages,
- compare authors,
- compare arguments,
- compare interpretations.

## Possible analytical tools
- argument maps,
- claim/evidence maps,
- author's purpose,
- strongest argument,
- weakest argument,
- objections,
- assumptions,
- contradictions,
- unanswered questions,
- key terms,
- Great Ideas.

---

# 11. CONNECT — Syntopical Reading & Knowledge System

## Major long-term differentiator

The system should build intellectual continuity across the reader's library.

Potential capabilities:
- cross-book concept pages,
- syntopical reading,
- Great Questions,
- knowledge graph,
- authors,
- works,
- concepts,
- claims,
- related passages,
- recurring questions,
- repeated disagreements,
- personal intellectual history.

## Example experience

The system could eventually say:

> "You have encountered this distinction in three earlier works. Your notes on Locke emphasized autonomy, while your later notes on Tocqueville introduced a stronger concern for civic virtue. Would you like to compare those passages?"

## "You saw this before" moments

When a concept reappears:
- identify previous appearances,
- surface related highlights,
- surface prior notes,
- surface previous questions,
- offer comparison.

---

# 12. Personal Intellectual History

The long-term system should be capable of understanding:

- what the reader has read,
- what ideas recur,
- what the reader agrees with,
- what they object to,
- which ideas changed their thinking,
- what they forgot,
- what they revisit,
- how their positions evolve.

Potential timeline:
- books read,
- major ideas encountered,
- conclusions,
- recurring themes,
- changes in opinion,
- intellectual milestones.

This is one of the strongest long-term advantages over generic AI chat.

---

# 13. APPLY — Reading to Action

Important ideas should be convertible into action.

Potential outputs:
- Action Center items,
- experiments,
- reminders,
- goals,
- habits,
- writing prompts,
- projects,
- research questions,
- discussion items.

Every action should ideally retain provenance:
- source book/article,
- source passage,
- note or AI insight,
- date created.

## Long-term goal

Close the loop:

> **read → understand → remember → connect → act**

---

# 14. Notebook / Knowledge Capture

Future improvements:
- stronger passage-to-Notebook handoff,
- notes linked to exact text,
- tags,
- concepts,
- questions,
- objections,
- personal conclusions,
- linked books,
- linked actions,
- conversation excerpts,
- Symposium excerpts.

Potential connection to Reader Intelligence:
- identify recurring topics,
- identify unresolved questions,
- identify repeated objections,
- resurface old notes when relevant.

---

# 15. Vocabulary

Potential capabilities:
- click/save word,
- definition,
- sentence context,
- source passage,
- pronunciation,
- personal definition,
- recall confidence,
- spaced review,
- vocabulary quizzes,
- usage examples,
- vocabulary growth metrics.

---

# 16. Reading Goals & Personalized Coaching

Goals may include:
- books per year,
- pages per week,
- reading minutes,
- WPM improvement,
- comprehension target,
- training sessions,
- Great Books progress,
- genre goals,
- vocabulary goals.

Personalized coaching should use enabled features only.

Example:
- if Mnemonics is disabled, do not recommend mnemonic practice,
- if Reading Goals is enabled, coaching can reference goal progress.

This profile functionality should ultimately connect directly into Reader Intelligence.

---

# 17. Progress, Metrics & Motivation

Potential metrics:
- WPM,
- measured WPM,
- effective WPM,
- comprehension,
- retention,
- books completed,
- pages read,
- reading time,
- training streak,
- fixation efficiency,
- regression rate,
- phrase span,
- vocabulary growth,
- quiz performance,
- delayed recall.

Potential motivation:
- progress milestones,
- awards,
- badges,
- trophies,
- personal bests,
- trends,
- reading streaks,
- before/after comparisons.

The emphasis should remain meaningful rather than gamification for its own sake.

---

# 18. Library & Content

## Sources / imports
- EPUB.
- PDF.
- OCR.
- Kindle capture.
- Web articles.
- Bookmarklet import.
- Gutenberg.
- Internet Archive.
- Public-domain libraries.
- DRM-free sources.

## Future possibilities
- cleaner edition creation,
- structured imported text,
- source provenance,
- better metadata,
- duplicate detection,
- edition selection,
- richer library organization,
- topic collections,
- reading lists,
- shared reading lists.

---

# 19. Great Books / Study Guides

Potential direction:
- Great Books reading path,
- Adler-style guides,
- Great Ideas,
- study questions,
- context,
- comparisons,
- Syntopicon-style connections without copying copyrighted commentary,
- discussion prompts,
- end-of-reading quizzes,
- Action Plans,
- Notebook integration.

---

# 20. Bible Study

Potential direction:
- passage-specific study,
- observation vs interpretation,
- theology,
- ethics,
- literary structure,
- historical context,
- questions,
- cross-reference support,
- Great Books connections when appropriate,
- saved study notes.

---

# 21. Mobile

## Core principle

Do not create a separate mobile Reader engine.

Mobile should be a presentation layer over the same underlying:
- Reader state,
- resume logic,
- reading-position storage,
- AI context,
- library,
- annotations.

## Future mobile MVP
- streamlined Reader,
- key reading modes,
- resume,
- Ask companion,
- training basics,
- notes,
- library,
- progress.

---

# 22. Workspace

The existing workspace should remain the standard mechanism for side-by-side content.

Potential workspace pages:
- Notebook,
- MSG Docs,
- Ask Beth / Mark,
- Training Lab,
- Chat,
- Symposium,
- Help,
- Music,
- study tools,
- references.

Do not recreate custom side-frame systems when the existing workspace architecture can handle the use case.

---

# 23. Music / Reading Environment

Existing and future ideas:
- reading music,
- mood-based selections,
- Spotify / YouTube integration,
- persistent player,
- workspace support,
- environment presets.

This remains secondary to core learning features.

---

# 24. Visual / "Wow" Layer

UI polish matters, but it must not derail product development.

"Wow" effects should reveal meaning rather than add decoration.

Possible examples:
- subtle Reader opening animation,
- gold-accent reading guidance,
- animated argument map,
- concepts illuminating when a connection is discovered,
- Symposium speaker transitions,
- progress visualization,
- intellectual-history timeline,
- visual knowledge graph.

## UI development rule

Non-structural UI fixes should first use:

```text
/public/msg-ui-overrides.css
```

Preferred process:
1. preserve working structure,
2. live-tune CSS,
3. move exact values into overlay,
4. time-box minor UI work,
5. log polish debt,
6. return to core features.

---

# 25. QA & Stability

## Immediate productization requirement

Build a reliable QA framework before broader beta.

Potential QA layers:
- smoke tests,
- regression tests,
- visual regression,
- responsive testing,
- import testing,
- Reader-state testing,
- workspace testing,
- AI selection contract testing.

Recommended tooling:
- Playwright,
- GitHub Actions,
- visual baselines.

## Protected Reader invariants
- permanent top band must not move,
- Reader core architecture protected,
- workspace geometry preserved,
- no MutationObserver,
- source-first development,
- surgical packages only,
- restore working baseline before adding features.

---

# 26. Beta

Potential beta plan:
- controlled cohort,
- defined test corpus,
- structured feedback,
- bug reporting,
- feature flags,
- error logging,
- Reader performance telemetry,
- privacy/terms drafts,
- Founding Scholar beta.

The beta should test:
- Reader reliability,
- import reliability,
- resume,
- annotations,
- Ask companion behavior,
- Training Lab effectiveness,
- comprehension measurement,
- mobile basics.

---

# 27. Commercial Model

## Potential tiers

### Free Reader
Possible:
- core reading,
- limited library/imports,
- selected Reader modes,
- basic notes,
- small AI allowance.

### Reader+
Possible:
- full Reader modes,
- cloud sync/resume,
- highlights/notes,
- progress,
- broader imports,
- moderate Ask companion allowance.

### Scholar
Possible:
- active recall,
- mnemonics,
- advanced analytics,
- Adler-style tools,
- Symposium,
- syntopical reading,
- deeper Reader Intelligence,
- larger AI allowance.

### Founding Scholar Beta
Possible:
- early access,
- direct feedback channel,
- special first-year pricing,
- launch recognition,
- early features.

### Future Family / Small Group
Possible:
- multiple profiles,
- shared reading lists,
- book-club discussion,
- individual progress.

### Future Education / Teams
Possible:
- cohorts,
- assignments,
- admin analytics,
- shared content packs,
- SSO / controls.

---

# 28. E-Commerce / Subscription Readiness

Potential stack:
- Clerk authentication,
- Stripe Checkout,
- Stripe Billing,
- Stripe Customer Portal,
- PostgreSQL subscription state,
- Resend transactional email.

Before paid launch:
- stable account identity,
- persistence,
- entitlement handling,
- server-side feature gating,
- cancellation recovery,
- AI usage tracking,
- privacy policy,
- terms,
- refund/cancellation policy,
- copyright/import policy,
- support path.

---

# 29. AI Cost Control

AI should be economically sustainable.

Principles:
- do not promise unlimited expensive AI,
- model routing by task,
- use inexpensive models for routine tasks,
- stronger models for complex analysis/Symposium,
- cache reusable context,
- meter expensive long-context operations,
- monitor cost per user,
- maintain AI cost well below subscription revenue.

---

# 30. Product Differentiation

The strongest differentiation is **not** any individual feature.

It is the combination and continuity of:

- advanced reading behavior,
- adaptive skill training,
- analytical reading,
- memory,
- AI tutoring,
- Symposium,
- syntopical reading,
- cross-book synthesis,
- Action Center,
- Reader Intelligence,
- personal intellectual history.

## Commodity test

For any feature ask:

> **Could the reader get essentially the same value by opening Gemini or ChatGPT beside the browser?**

If yes:
- deprioritize it,
- integrate it into a larger reading workflow,
- or make it use unique Reader Intelligence.

## Positioning

> **Mark, Set, Go! isn't an AI reader. It's a reading performance and comprehension system that happens to have an AI reading companion.**

---

# 31. Long-Term "Wow" Experience

A mature system should eventually be able to make observations such as:

> "You have read 18 works touching political liberty. Your notes repeatedly favor individual autonomy, but your recent reading of Tocqueville and Aristotle introduced a stronger concern for civic virtue. You struggled to recall one distinction from Locke last month. Would you like to revisit it before comparing these authors?"

This experience is difficult for a generic AI chat session to reproduce because its value comes from:
- accumulated reading history,
- behavior,
- annotations,
- comprehension evidence,
- memory history,
- questions,
- conclusions,
- evolving intellectual position.

---

# 32. Current Priority

## NOW

### 1. Perfect Reading Training
- finalize Training Lab integration,
- establish baseline diagnostics,
- meaningful reader-material exercises,
- measurable improvement,
- save performance,
- connect to Reader Intelligence.

### 2. Build Reader Intelligence v1
Initial fields:
- current WPM,
- current Reader mode,
- current document,
- position,
- selection,
- session context,
- permission settings.

Then add:
- comprehension,
- Training Lab performance,
- recent trends.

### 3. Make Ask Beth / Mark Reader-Aware
Test questions:
- "What is my WPM?"
- "What do you know about my reading right now?"
- "What should I practice?"
- "Am I improving?"
- "What reading mode works best for me?"

Every answer should be verifiable against live Reader data.

### 4. Chat
Build on shared Reader Intelligence rather than creating separate context logic.

### 5. Symposium
Build after core reader-aware conversation architecture is reliable.

---

# 33. NEXT

- comprehension history,
- effective WPM,
- training history,
- adaptive coaching,
- active recall,
- vocabulary,
- teach-back,
- spaced review,
- mobile MVP,
- structured beta testing,
- automated QA.

---

# 34. LATER

- Adler-style analytical modes,
- argument maps,
- deep study tools,
- flashcards,
- mnemonics,
- advanced retention,
- improved Symposium,
- cross-book concepts,
- syntopical reading,
- Great Questions,
- Action Center expansion.

---

# 35. LONG-TERM

- personal knowledge graph,
- personal intellectual history,
- long-term adaptive reading model,
- genre/difficulty-specific reading performance,
- memory decay modeling,
- learning-technique effectiveness by user,
- evolving-belief / evolving-question history,
- education/team offerings,
- shared reading environments,
- richer mobile ecosystem.

---

# 36. Parking Lot / Ideas to Revisit

Use this section for ideas that are interesting but should not interrupt current priorities.

- richer animations,
- visual knowledge graph,
- advanced themes,
- additional reading environments,
- social sharing,
- community features,
- collaborative reading,
- group Symposium,
- richer music controls,
- specialized app/domain variants,
- additional reader personas,
- advanced gamification,
- expanded educational administration,
- enterprise/team features.

---

# 37. Development Governance

The project should continue to follow these principles:

1. **Reading Training → Chat → Symposium** is the current feature priority.
2. Minor UI polish should not block core feature development.
3. Preserve working Reader architecture.
4. Preserve the permanent top band.
5. Use the existing workspace architecture.
6. No MutationObserver.
7. Inspect source before modifying.
8. Make surgical changes.
9. Prefer CSS overlay for non-structural UI fixes.
10. Verify the exact loaded asset/version before repatching.
11. Test end-to-end after changes.
12. Maintain a working baseline.
13. Reader Intelligence should be shared by all companion/learning systems.
14. The reader owns Reader Intelligence data.
15. AI must never invent missing metrics.

---

# 38. Definition of Success

Mark, Set, Go! succeeds if it becomes a system that can:

- help a reader read more effectively,
- measurably improve reading performance,
- preserve comprehension,
- strengthen retention,
- help readers analyze difficult texts,
- create intelligent discussion,
- connect ideas across books,
- remember the reader's intellectual journey,
- translate ideas into action,
- remain private and user-controlled,
- provide value that generic browser AI cannot easily reproduce.

The long-term product promise is:

> **Read faster. Understand deeper. Remember longer. Connect ideas. Apply what matters.**
