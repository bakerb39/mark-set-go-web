MARK, SET, GO! — EMBEDDED PUBLISHER URL FIX

Replace only the ROOT server.js.

This version follows the approach Brian identified:

1. BEFORE stripping the RSS item description to plain text, inspect its embedded
   links/serialized URLs.
2. If a direct non-Google publisher URL is present, use that as the article URL.
3. If an existing item still has a news.google.com URL, fetch the Google wrapper
   page and inspect its HTML/serialized page data for the embedded publisher URL.
4. Only if that fails, fall back to the headline-matching publisher-page resolver.

No public files and no Reader core files are changed.
