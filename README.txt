MARK, SET, GO! — ASK CHAD COMPANION CODE

This package is cumulative with the latest Topic Feeds / investor analysis /
crypto ticker / stock-index work.

REPLACE:
  /server.js
  /public/index.html

ADD:
  /public/companion-chad.js
  /public/companion-chad.css
  /public/assets/companions/chad/chad-avatar.png

The other current public files are included for completeness.

WHAT ASK CHAD DOES

1. Profile / Customize My Experience
   - Adds Chad as a third selectable reading companion next to Mark and Beth.
   - Description: Financial analysis, investing, markets & economics.
   - Uses the same msg_companion_persona_v2 preference key.

2. Front page
   - Chad's approved finance badge replaces the companion artwork when selected.
   - "Meet Mark/Beth" becomes "Meet Chad."

3. Reader buttons / Ask companion controls
   - Ask Mark/Beth becomes Ask Chad.
   - Chad's avatar appears on companion buttons.
   - Fullscreen Ask companion controls follow the selection too.

4. Chat / response area
   - Ask companion labels and response headings display Ask Chad.
   - The article Investor analysis action displays "Ask Chad" when Chad is selected.

5. Backend behavior
   - /api/mark-selection now accepts companion=mark|beth|chad.
   - When Chad is selected, the AI is explicitly instructed to specialize in
     finance, markets, economics, business, and investing while remaining grounded
     in the selected text.
   - Non-financial passages are still answered normally instead of forcing a
     finance angle.
   - The whole-article investor-analysis endpoint identifies the selected analyst.
   - App-help keeps the same narrow app-help scope but uses the selected companion name.

6. Existing Mark and Beth
   - They remain selectable.
   - The Chad layer is additive and does not replace the existing companion system.

No Reader architecture was changed.
