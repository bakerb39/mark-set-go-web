# Medium UI pass

Updated from the uploaded `mark-set-go-web-feature-ask-mark-premium-phase-1.zip` baseline.

- Cleared the Ask Mark textarea placeholder.
- Kept Translation & Word Tools closed by default.
- Removed Comprehension from Reader Tools and added it to the Ask Mark `+` menu.
- Changed open Reading and Display controls to a neutral gray selected state.
- Replaced the top Ask Mark menu with a direct My Notebook button.
- Renamed Insights to Insights & Action.
- Moved Read Anything out of Collections and into My Reading.
- Personalized Ask Mark time-of-day greetings with the signed-in reader's first name when available.
- Personalized My Library with `Welcome back, <first name>.` when available.
- Added an app-wide navy and light-blue consistency layer.
- Made the footer fill the bottom of short pages.

Validation:
- `node --check public/app.js` passed.
- `node --check public/ask-mark-hub.js` passed.
