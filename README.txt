MARK, SET, GO! — OPTIONAL CRYPTOCURRENCY TICKER

This package is cumulative with the current Topic Feeds / Reader article work.

Replace / add:

ROOT
  server.js

PUBLIC
  public/index.html
  public/crypto-ticker.js        (new)
  public/crypto-ticker.css       (new)

The ZIP also includes the current read-anything.js and topic-feeds.js for
completeness; those are unchanged by this specific ticker addition.

WHAT IT DOES
- Adds "Cryptocurrency Ticker" to Profile > Customize My Experience.
- The option is OFF by default until the user enables it.
- When enabled, a compact market ticker appears immediately below the top
  navigation across the app.
- Shows BTC, ETH, SOL, XRP, and DOGE prices plus 24-hour percentage change.
- Refreshes once per minute while visible.
- Pauses the scrolling animation on hover.
- Honors prefers-reduced-motion.
- The server caches price data for 60 seconds so multiple browser refreshes do
  not repeatedly hit the upstream provider.
- If the upstream service is temporarily unavailable or rate-limited, the last
  successful prices remain available when possible.

DATA
- Uses CoinGecko's keyless public /api/v3/simple/price endpoint.
- No API key or new Render environment variable is required for this beta.
