# Training Lab feature map

| Area | Feature | v0.1.0 implementation | Later refinement |
|---|---|---|---|
| Eyes | Fixation Trainer | DOM geometry targets by visual line | difficulty/width-aware target count |
| Eyes | Peripheral Span | centered widening phrase | timed recognition scoring |
| Eyes | Regression Control | soft/medium/strict post-position fading | adaptive fade based on regressions |
| Eyes | Edge Avoidance | interior fixation targets | explicit edge masks and drills |
| Speed | Phrase RSVP | Flash + Meaningful Chunks | NLP thought-unit boundaries |
| Speed | Speed Bursts | timed WPM intervals | individualized interval prescriptions |
| Speed | Focus Tunnel | active-line spotlight | variable tunnel width and line lead |
| Speed | Adaptive Pace | comprehension-governed WPM | model from long-term user curve |
| Comprehension | Preview | local structural preview + AI event | Ask Mark chapter map |
| Comprehension | Recall | free-response capture | AI concept coverage scoring |
| Comprehension | Prediction | saved prediction at reader index | automatic compare after next section |
| Advanced | Semantic Chunking | existing meaningful chunks | parser/LLM semantic boundaries |
| Advanced | Difficulty-Aware Pace | integration point only | paragraph-level complexity model |
| Metrics | Verified Reading Rate | WPM × comprehension | confidence-weighted score |
| Metrics | Progress | localStorage | PostgreSQL/user profile sync |
| Curriculum | Daily Training | guided sequence | individualized program & spaced plan |
