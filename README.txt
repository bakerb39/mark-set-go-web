MARK, SET, GO! — OPTIONAL MAJOR STOCK INDEXES

This package is cumulative with the current Topic Feeds / Reader / crypto ticker work.

Replace/add:
ROOT:
  server.js

PUBLIC:
  public/index.html
  public/market-indexes.js   (new)

The other current files are included for completeness.

NEW SETTING
Profile > Customize My Experience > Major Stock Indexes

OFF by default. When enabled, shows:
- S&P 500
- Dow Jones Industrial Average
- NASDAQ Composite
- Russell 2000

The strip appears below the top navigation. If Cryptocurrency Ticker is also
enabled, both strips can be shown.

The server caches values for 60 seconds and retains the last successful values
if the upstream provider is temporarily unavailable.
