# Symposium workspace v4.2

No manual editing required.

Upload/replace in public/:
- button-feedback.js
- symposium-workspace-fix.css

What changes:
- Symposium opens at 680–860px on wide desktop screens, comparable to Chat.
- At medium desktop widths it uses a 600px secondary pane.
- The entire Symposium workspace can scroll vertically.
- The transcript has its own scroll for long discussions.
- On wide screens, Symposium keeps a two-column setup + discussion stage rather
  than being unnecessarily crushed into one narrow column.
- The workspace remains fixed to the viewport instead of growing downward.
- Existing Reader height, rounded corners, full backgrounds and Chat behavior
  are untouched.

No MutationObserver.
