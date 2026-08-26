'use strict';

const fs = require('node:fs');
const path = require('node:path');

const indexPath = path.join(__dirname, 'public', 'index.html');

function replaceAssetVersion(content, asset, version) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`/${escaped}(?:\\?v=[^"'\\s>]+)?`, 'g');
  return content.replace(pattern, `/${asset}?v=${version}`);
}

function ensureAfterAsset(content, anchorAsset, html) {
  if (content.includes(html.match(/\/([^?"']+)/)?.[0] || '__never__')) return content;

  const escaped = anchorAsset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const linkPattern = new RegExp(
    `(<link[^>]+href=["'][^"']*/${escaped}(?:\\?[^"']*)?["'][^>]*>)`,
    'i'
  );
  const scriptPattern = new RegExp(
    `(<script[^>]+src=["'][^"']*/${escaped}(?:\\?[^"']*)?["'][^>]*><\\/script>)`,
    'i'
  );

  if (linkPattern.test(content)) {
    return content.replace(linkPattern, `$1\n${html}`);
  }
  if (scriptPattern.test(content)) {
    return content.replace(scriptPattern, `$1\n${html}`);
  }
  throw new Error(`ui cache: could not locate anchor asset ${anchorAsset}`);
}

function replaceRequired(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) {
    throw new Error(`ui cache: expected ${label} marker was not found`);
  }
  return content.replace(before, after);
}

function patchAskMarkHubArticleOwner() {
  const hubPath = path.join(__dirname, 'public', 'ask-mark-hub.js');
  let hub = fs.readFileSync(hubPath, 'utf8');

  if (hub.includes("version:'1.2-article-composer-owner'")) {
    return false;
  }

  hub = replaceRequired(
    hub,
`  async function runWholeArticleFollowup(question) {
    const context = activeWholeArticleConversation();
    if (!context || !question) return false;
    const requestQuestion=questionWithAddedContext(question);

    addUserMessage(question);`,
`  async function runWholeArticleFollowup(question,{ forceWholeArticle=false, displayQuestion='' }={}) {
    const context = forceWholeArticle
      ? ensureWholeArticleConversationContext()
      : activeWholeArticleConversation();
    if (!context || !question) return false;

    const shownQuestion=String(displayQuestion || question).trim();
    const requestQuestion=questionWithAddedContext(question);

    addUserMessage(shownQuestion);`,
    'whole-article follow-up owner'
  );

  hub = replaceRequired(
    hub,
`      if (activeWholeArticleConversation()) {
        void runWholeArticleFollowup(value);
        return;
      }

      runSelectionAction('ask', value);`,
`      // For a full article, the Companion composer always means WHOLE ARTICLE.
      // A highlighted sentence is used only by explicit passage actions.
      if (currentWholeArticleReader()) {
        void runWholeArticleFollowup(value,{ forceWholeArticle:true });
        return;
      }

      runSelectionAction('ask', value);`,
    'article composer send routing'
  );

  hub = replaceRequired(
    hub,
`    if (!shell?.isConnected) configureShell();
    activatePremiumView('chat');
    return Boolean(shell?.isConnected && $('[data-askmark-conversation]', shell));
  }`,
`    if (!shell?.isConnected) configureShell();
    activatePremiumView('chat');

    // Full articles do not require a selection before the reader can type.
    const composerInput = $('[data-askmark-input]', shell);
    if (currentWholeArticleReader() && composerInput) {
      composerInput.disabled = false;
      composerInput.readOnly = false;
      composerInput.removeAttribute('disabled');
      composerInput.removeAttribute('readonly');
      composerInput.tabIndex = 0;
      composerInput.style.pointerEvents = 'auto';
      window.setTimeout(() => {
        try { composerInput.focus({ preventScroll:true }); }
        catch { try { composerInput.focus(); } catch {} }
      }, 40);
    }

    return Boolean(shell?.isConnected && $('[data-askmark-conversation]', shell));
  }`,
    'article composer ready/focus'
  );

  hub = replaceRequired(
    hub,
`  window.MarkSetGoAskMarkHub = Object.freeze({
    version:'1.1-context-plus-selection-tools',
    open:ensureAskMarkChatVisible,
    comparePassages:compareExternalPassages,
    runStudyTool:(tool)=>runStudyTool(tool),
    contextText:()=>addedContextText(),
    contextItems:()=>addedConversationContext.map((item)=>({...item})),
    clearContext:()=>clearConversationContext()
  });`,
`  window.MarkSetGoAskMarkHub = Object.freeze({
    version:'1.2-article-composer-owner',
    open:ensureAskMarkChatVisible,
    isWholeArticle:()=>Boolean(currentWholeArticleReader()),
    askWholeArticle:(question,displayQuestion='')=>{
      const clean=String(question||'').trim();
      if(!clean) return Promise.resolve(false);
      return runWholeArticleFollowup(clean,{
        forceWholeArticle:true,
        displayQuestion:String(displayQuestion||'').trim()
      });
    },
    comparePassages:compareExternalPassages,
    runStudyTool:(tool)=>runStudyTool(tool),
    contextText:()=>addedContextText(),
    contextItems:()=>addedConversationContext.map((item)=>({...item})),
    clearContext:()=>clearConversationContext()
  });`,
    'Ask Mark Hub public article API'
  );

  fs.writeFileSync(hubPath, hub, 'utf8');
  console.log('ui cache: Ask Mark whole-article composer owner patched');
  return true;
}

patchAskMarkHubArticleOwner();

let index = fs.readFileSync(indexPath, 'utf8');
const before = index;

/* Preserve current direct-owner versions. */
index = replaceAssetVersion(
  index,
  'page-theme-polish.css',
  '20260825-v1.0.8-reader-exact'
);

index = replaceAssetVersion(
  index,
  'app.js',
  '20260825-v2.7.3-home-dismiss-hard'
);

index = replaceAssetVersion(
  index,
  'ask-mark-hub.js',
  '20260826-v9.6.10-article-composer-owner'
);

index = replaceAssetVersion(
  index,
  'user-settings.js',
  '20260826-v1.3.0-reader-workspace'
);

index = replaceAssetVersion(
  index,
  'topic-feeds.js',
  '20260825-v2.5.7-boundary-gap-1px'
);

index = replaceAssetVersion(
  index,
  'media-panel.js',
  '20260826-v1.2.3-reader-launch-owner'
);

index = replaceAssetVersion(
  index,
  'media-player-launch-polish.js',
  '20260826-v1.1.0-label-only'
);


index = replaceAssetVersion(
  index,
  'ask-mark-window.css',
  '20260826-v1.3.0-responsive-window-actions'
);

index = replaceAssetVersion(
  index,
  'ask-mark-window.js',
  '20260826-v1.3.0-responsive-window-actions'
);

index = replaceAssetVersion(
  index,
  'desktop-workspace.js',
  '20260826-v1.0.5-menu-layout-only'
);

index = replaceAssetVersion(
  index,
  'desktop-workspace-compact.css',
  '20260826-v1.1.1-menu-layout-only'
);

index = replaceAssetVersion(
  index,
  'ask-mark-article-mode.css',
  '20260826-v1.1.0-owner-ui'
);

index = replaceAssetVersion(
  index,
  'ask-mark-article-mode.js',
  '20260826-v1.1.0-owner-ui'
);

index = replaceAssetVersion(
  index,
  'ask-mark-popout-controller.js',
  '20260826-v1.3.0-article-owner'
);

index = replaceAssetVersion(
  index,
  'workspace-profile-setting.css',
  '20260826-v1.0.0-reader-workspace'
);

index = replaceAssetVersion(
  index,
  'workspace-profile-setting.js',
  '20260826-v1.0.0-reader-workspace'
);

/* Stability rollback:
   Keep the asset slots so old runtime-injected tags get a NEW cache URL,
   but load a disabled/no-reparent implementation instead of Phase 2. */
index = replaceAssetVersion(
  index,
  'ask-mark-desktop.css',
  '20260826-v2.2.0-disabled-stability'
);

index = replaceAssetVersion(
  index,
  'ask-mark-desktop.js',
  '20260826-v2.2.0-disabled-stability'
);

/* Other additive UI assets remain unchanged. */
index = ensureAfterAsset(
  index,
  'topic-feeds.css',
  '<link href="/topic-feed-title-stability.css?v=20260826-v1.0.0-first-paint" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'read-anything.js',
  '  <script defer src="/topic-feed-title-stability.js?v=20260826-v1.0.0-first-paint"></script>'
);

index = ensureAfterAsset(
  index,
  'desktop-workspace.css',
  '<link href="/desktop-workspace-compact.css?v=20260826-v1.1.1-menu-layout-only" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'user-settings.css',
  '<link href="/workspace-profile-setting.css?v=20260826-v1.0.0-reader-workspace" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-window.css',
  '<link href="/ask-mark-article-mode.css?v=20260826-v1.1.0-owner-ui" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-window.css',
  '<link href="/ask-mark-popout-controller.css?v=20260826-v1.2.1-always-typeable" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-window.css',
  '<link href="/ask-mark-desktop.css?v=20260826-v2.2.0-disabled-stability" rel="stylesheet"/>'
);

index = ensureAfterAsset(
  index,
  'user-settings.js',
  '  <script defer src="/workspace-profile-setting.js?v=20260826-v1.0.0-reader-workspace"></script>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-window.js',
  '  <script defer src="/ask-mark-article-mode.js?v=20260826-v1.1.0-owner-ui"></script>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-article-mode.js',
  '  <script defer src="/ask-mark-popout-controller.js?v=20260826-v1.3.0-article-owner"></script>'
);

index = ensureAfterAsset(
  index,
  'ask-mark-window.js',
  '  <script defer src="/ask-mark-desktop.js?v=20260826-v2.2.0-disabled-stability"></script>'
);

if (index !== before) {
  fs.writeFileSync(indexPath, index, 'utf8');
  console.log('ui cache: Ask Mark Desktop bridge disabled for stability');
} else {
  console.log('ui cache: Ask Mark Desktop stability rollback already current');
}
