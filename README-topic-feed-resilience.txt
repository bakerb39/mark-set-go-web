Mark, Set, Go! — Topic Feed Importer Resilience Fix

Replace:
  server.js
  public/topic-feeds.js

What changed:
1. Topic Feed open requests now pass publisher-supplied feed text when available.
2. RSS/Atom parsing preserves complete content:encoded/content when the feed supplies it.
3. The article importer checks JSON-LD NewsArticle/Article articleBody before relying on page CSS/HTML structure.
4. Existing semantic HTML extraction remains as the next fallback and includes several broader article-body selectors.
5. HTTP 401/403/429/451 and common CAPTCHA/browser-verification pages are classified as publisher restrictions.
6. If a publisher blocks automated access, the Reader keeps the headline/summary and gives a clear message to use the original-source link instead of reporting a generic import failure.
7. Import results record how the article was obtained: feed-content, publisher-page, publisher-restricted-summary, or summary-fallback.

Why this is more future-resistant:
No single publisher-specific scraper is required. The importer uses layered standards-based paths first and degrades per article/source when a publisher changes its site or blocks automated retrieval.

This update does not modify Reader architecture and adds no MutationObserver.
