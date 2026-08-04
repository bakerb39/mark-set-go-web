# v8.3.2 Reading-Level Reliability Fix

Replace the included files on `feature/read-anything-import-system`.

Changes:
- Adapts article sections with bounded concurrency instead of serially.
- Adds upstream and browser request timeouts.
- Retries interrupted browser requests once.
- Replaces generic `Failed to fetch` with actionable messages.
- Limits oversized one-request adaptations to improve reliability.
- Does not modify protected reader files or Book Pages.
