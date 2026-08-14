MARK, SET, GO! — ARTICLE BODY EXTRACTION FIX

Replace only the ROOT server.js.

This fixes the current CoinDesk symptom where the Reader imported:
- the first few article paragraphs,
- missed the article's bullet/list sections,
- then included unrelated repeated "Latest Research" text.

Cause:
The old extractor only collected <p> elements. CoinDesk's "Derivatives positioning"
and "Token talk" sections are largely list items, so they were skipped. A broader
container then contributed unrelated research-card paragraphs.

Fix:
- Preserve article paragraphs, section headings, list items, and blockquotes.
- Keep list items as bullets.
- Deduplicate repeated blocks.
- Remove recommendation/latest/research/sidebar containers.
- Stop extraction at common post-article boundaries such as Related Assets,
  Latest Crypto News, Latest Research, and More From.

No public files and no Reader core files changed.
