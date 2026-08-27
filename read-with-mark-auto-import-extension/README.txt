READ WITH MARK AUTO IMPORT — v0.1.1

This is the HTML-cleanup update.

NEW IN 0.1.1
- Detects when a publisher exposes article content as HTML-formatted payload text.
- Converts <p>, headings, list items, links, and blockquote paragraphs to clean prose.
- Removes figures/figcaptions, scripts, navigation, social/share/promo material.
- Decodes HTML entities such as &#8212;.
- Ignores hidden article/main candidates when choosing the readable root.
- Performs a final no-raw-markup guard before sending text to the Reader.

INSTALL/UPDATE
1. Unzip this folder.
2. Open chrome://extensions
3. If v0.1.0 is already loaded unpacked, either:
   - replace that folder's files and click Reload, or
   - remove it and Load unpacked using this v0.1.1 folder.
4. Hard-refresh Mark, Set, Go!.

The extension still does not attempt to bypass login, subscription, paywall,
CAPTCHA, or other access controls.
