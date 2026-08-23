/* Mark, Set, Go! — clear stale Topic Feed Reader chrome when another document
   replaces a feed article. No MutationObserver. */
(() => {
  'use strict';

  const isTopicFeedDocument = () => {
    try {
      const doc = window.MarkSetGoCurrentReaderDocument?.get?.();
      if (doc?.source) return doc.source.type === 'topic-feed';
    } catch {}
    return Boolean(document.querySelector('#app .reader-page-panel.topic-feed-reader-page'));
  };

  const removeTopicFeedClasses = (reader) => {
    if (!reader) return;
    reader.classList.remove('topic-feed-story-header-managed', 'topic-feed-divider-managed');
    delete reader.dataset.topicFeedGeometrySynced;

    reader.querySelectorAll(
      '.topic-feed-article-footer, .topic-feed-article-footer-source, .topic-feed-article-footer-url'
    ).forEach((node) => {
      node.classList.remove(
        'topic-feed-article-footer',
        'topic-feed-article-footer-source',
        'topic-feed-article-footer-url'
      );
    });
    reader.querySelectorAll('.topic-feed-article-footer-break').forEach((node) => {
      node.classList.remove('topic-feed-article-footer-break');
    });
  };

  const clearStaleTopicFeedChrome = () => {
    if (isTopicFeedDocument()) return false;

    // This global is only a navigation hint. Once a normal book/document owns
    // Reader, keeping it would let Topic Feed fallbacks believe the old article
    // is still relevant.
    try { window.MSGTopicFeedReaderContext = null; } catch {}

    const reader = document.querySelector('#app #reader');
    const frame = reader?.closest?.('#reader-frame') || document.querySelector('#app #reader-frame');

    removeTopicFeedClasses(reader);

    reader?.querySelectorAll(
      '[data-topic-feed-story-header-spacer], [data-topic-feed-source-credit]'
    ).forEach((node) => node.remove());

    frame?.querySelectorAll('[data-topic-feed-book-divider]').forEach((node) => node.remove());

    // Topic Feed temporarily moves the existing Read Anything article-action
    // row into its external header. Return that node to Reader before removing
    // the stale header so Read Anything can keep/remove it using its own normal
    // document lifecycle without losing its handlers.
    frame?.querySelectorAll(':scope > [data-topic-feed-story-header-external]').forEach((header) => {
      const actionRow = header.querySelector('#read-anything-article-summary-action');
      if (actionRow && reader?.isConnected) {
        frame.insertBefore(actionRow, reader);
      }
      header.remove();
    });

    document.querySelectorAll('#app [data-topic-feed-source-credit]').forEach((node) => node.remove());
    return true;
  };

  const scheduleCleanup = () => {
    // topic-feeds.js has delayed header retries for article startup. Recheck
    // through that window so an old article timer cannot resurrect its chrome
    // after a book has already replaced it.
    [0, 50, 160, 420, 900, 1700, 2800, 4300].forEach((delay) => {
      window.setTimeout(clearStaleTopicFeedChrome, delay);
    });
  };

  document.addEventListener('marksetgo:document-available', scheduleCleanup, true);
  window.addEventListener('pageshow', scheduleCleanup);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleCleanup, { once: true });
  } else {
    scheduleCleanup();
  }
})();
