# v9.6.3 corrections

Narrow correction pass over v9.6.2.

- Fixed duplicate `Ask Mark Ask Mark` / `Ask Beth Ask Beth` floating-button labels.
- Added a singleton guard and in-flight submit guard so global app-help produces one answer per question.
- Feature workflow is exactly: Ideas → Planned → Testing → In Progress → Completed.
- Corrected obvious Mark/Beth startup-card copy (`Meet Mark` follows selected companion).
- Raised the floating companion-help control modestly.
- Bumped Read Anything CSS cache key so the formatter layout fix actually loads.
- Updated debug regression checks for the new companion/help and feature-workflow contracts.
- No Reader/right-click source behavior changed in this correction pass.
