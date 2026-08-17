MARK, SET, GO! — SCOTT COMPANION INTEGRATION

Drop the included public/ files into the matching public/ locations.

This is an additive fourth-companion update. It does not replace or change Chad.
It uses the same live companion configuration already consumed by the Reader,
article Analyze flow, and Ask companion hub.

FILES
- public/index.html
  Loads Scott CSS/JS after the existing Chad/copy-sync companion files and
  cache-busts the Ask companion hub update.
- public/ask-mark-hub.js
  Adds Scott as a storage fallback and recognizes Scott when companion copy is
  synchronized.
- public/companion-scott.js
  Adds Scott to the existing Profile companion chooser, persists the selection,
  sets window.MSGCompanion.config, and broadcasts msg:companion-changed so the
  existing Ask/Notebook/Reader/fullscreen code follows Scott.
- public/companion-scott.css
  Styles Scott's companion card and front-page badge.
- public/assets/companions/scott/scott-avatar.png
  Scott's approved companion badge image.

SCOTT
- Ask Scott
- Scott’s Notebook
- CEO & Co-Founder · SK Global Software
- Focus: software/product strategy, entrepreneurship, executive leadership,
  technology decisions, and business problem solving.

IMPORTANT
- No MutationObserver is used anywhere in the Scott integration files.
- Chad's existing companion files and behavior are left intact.
