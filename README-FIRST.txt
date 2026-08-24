MARK, SET, GO! BETA FEEDBACK — UPLOAD-READY v1.0.2

NO MANUAL CODE EDITING AND NO RENDER SHELL ACCESS REQUIRED.

Upload/replace these files preserving the folders:

/package.json
/apply-beta-feedback.js
/beta-feedback-server.js
/public/beta-feedback.js
/db/migrations/005_beta_feedback.sql

WHAT CHANGED IN v1.0.2
----------------------
The app now automatically runs database migrations every time Render starts:

  node apply-beta-feedback.js && node scripts/migrate.js && node server.js

The existing migration runner is idempotent:
- new migrations are applied once
- previously applied migrations are skipped
- no Render Shell is required

AFTER UPLOAD
------------
1. Commit/upload these files to GitHub.
2. In Render > Environment add:
     Key: BETA_ADMIN_EMAILS
     Value: the exact email you use for your Clerk admin account
3. Let Render deploy/restart.

That is it.

On startup Render should log something like:
  applied 005_beta_feedback.sql
or later:
  skip 005_beta_feedback.sql

Then sign in and test:
- "Report issue" beside Mark, Set, Go!
- "Admin" visible only on the configured admin account
