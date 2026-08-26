(() => {
  'use strict';

  const CLASS_NAME = 'msg-topic-feed-reader-document';
  let installed = false;

  function install() {
    if (installed) return true;

    const original = window.renderReaderWithText;
    if (typeof original !== 'function') return false;
    if (original.__msgTopicFeedTitleStable) {
      installed = true;
      return true;
    }

    function stableTopicFeedRender(title, text, source = { type:'text' }) {
      const app = document.getElementById('app');
      const isTopicFeed = String(source?.type || '').toLowerCase() === 'topic-feed';

      // Critical ordering: set the Topic Feed presentation state BEFORE the
      // Reader inserts .reader-title-copy <h1>. The very first browser paint
      // therefore uses the final compact Topic Feed/Reader title size.
      app?.classList.toggle(CLASS_NAME, isTopicFeed);

      return original.apply(this, arguments);
    }

    stableTopicFeedRender.__msgTopicFeedTitleStable = true;
    stableTopicFeedRender.__msgTopicFeedTitleStableOriginal = original;
    window.renderReaderWithText = stableTopicFeedRender;
    installed = true;
    return true;
  }

  // Usually available immediately because this script is deferred after the
  // Reader/import scripts. Bounded retries only cover script-order variance.
  if (!install()) {
    [0, 60, 180, 450, 900].forEach((delay) => {
      window.setTimeout(install, delay);
    });
  }

  window.MarkSetGoTopicFeedTitleStability = Object.freeze({
    install,
    get installed(){ return installed; }
  });
})();