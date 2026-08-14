MARK, SET, GO! — ASK MARK INVESTOR ANALYSIS LINK

This package is cumulative with:
- Topic Feeds + Reader-ready article prefetch
- automatic Format All
- default Book Pages for articles
- bookmarklet capture fixes
- inline professional Summary link
- Cryptocurrency Ticker setting
- Major Stock Indexes setting

Replace:
ROOT:
  server.js

PUBLIC:
  public/read-anything.js
  public/index.html

NEW ARTICLE ACTION
The first Reader page now shows:
  Summarize article · Investor analysis

"Investor analysis":
- opens the existing Ask Mark side panel;
- analyzes the WHOLE preserved original article, not a highlighted passage;
- gives Mark's article-grounded investor analysis;
- identifies key investor takeaways, catalysts, risks, and what to watch;
- ends with a GENERAL investor posture/recommendation;
- does not silently use later/current market facts outside the article;
- does not give personalized buy/sell/allocation instructions;
- caches the generated analysis with the saved Read Anything record so reopening
  it does not need another AI request when that record is restored.

If an article has little or no investment relevance, Mark is instructed to say so
rather than inventing an investment thesis.
