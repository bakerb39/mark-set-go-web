MARK, SET, GO! — TOPIC FEED SOCIAL SHARING

Replace only:
  /public/topic-feeds.js
  /public/topic-feeds.css
  /public/index.html

WHAT IT ADDS

Every Topic Feed story now gets a small professional share cluster at the
top-right of the story header.

Icons:
  X
  Facebook
  LinkedIn
  Reddit
  Email

Each share action uses:
  - the original article URL
  - the article headline

The email action opens a pre-addressed email draft with the headline and link.

The share controls are UI metadata only. They are NOT inserted into article
currentText, so they do not affect:
  - Reader word count
  - playback
  - highlighting / annotations
  - summaries
  - Analyze
  - reading position

The controls are added only to Topic Feed articles.

PRESERVED

- My Topics sticky panel
- close-race fix
- exact left-panel scroll position
- Bookmark button preservation
- centered Book Pages divider
- source credit
- music-under-WPM references

No app.js or protected Reader file is changed.
