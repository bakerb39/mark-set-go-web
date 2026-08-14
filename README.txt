MARK, SET, GO! — CANONICAL RSS LINK FIX

Replace only the ROOT server.js.

This fixes the exact CoinDesk failure where the article source became:
https://www.googletagmanager.com/gtag/js?id=...

Cause:
The verified CoinDesk RSS feed was being used correctly, but the parser then
scanned the article description HTML and replaced CoinDesk's legitimate <link>
with the first embedded URL it found (sometimes Google Tag Manager).

Fix:
- If RSS/Atom supplies a normal article <link>, that link is authoritative.
- Embedded URL extraction is now used ONLY when the primary link itself is a
  Google News wrapper or XML/schema metadata URL.
- Analytics, GTM, ads, schema, and other resources inside descriptions cannot
  replace a valid publisher article link.

After Render deploys, click Refresh in Topic Feeds to replace the existing bad
cached GTM URLs with the canonical URLs from CoinDesk's official RSS feed.
