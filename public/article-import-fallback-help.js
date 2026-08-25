(() => {
  'use strict';

  const FALLBACK_TEXT = 'Full article text could not be imported from the publisher.';
  const NOTICE_ID = 'article-import-fallback-help';

  function ensureStyles() {
    if (document.getElementById('article-import-fallback-help-styles')) return;

    const style = document.createElement('style');
    style.id = 'article-import-fallback-help-styles';
    style.textContent = `
      #${NOTICE_ID} {
        margin: 14px 0 8px;
        padding: 13px 15px;
        border: 1px solid rgba(148, 163, 184, .42);
        border-radius: 12px;
        background: rgba(15, 23, 42, .055);
        font-size: 14px;
        line-height: 1.55;
      }

      #${NOTICE_ID} p {
        margin: 0;
      }

      #${NOTICE_ID} a {
        font-weight: 700;
        text-decoration: underline;
        text-underline-offset: 2px;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  function openReadAnything(event) {
    event?.preventDefault?.();

    if (window.MarkSetGoReadAnything?.render) {
      window.MarkSetGoReadAnything.render();

      requestAnimationFrame(() => requestAnimationFrame(() => {
        const bookmarkletButton = document.querySelector('#read-anything-bookmarklet');
        bookmarkletButton?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      }));
      return;
    }

    const trigger = document.querySelector(
      '[data-read="upload"], [data-action="read-anything"]'
    );
    trigger?.click?.();
  }

  function addFallbackNotice() {
    document.getElementById(NOTICE_ID)?.remove();

    const app = document.getElementById('app');
    if (!app) return;

    // Topic Feed / regular reader builds use #reader. Some reader wrappers place
    // it inside a center column, so attach immediately after the actual text area.
    const reader = app.querySelector('#reader');
    if (!reader) return;

    ensureStyles();

    const notice = document.createElement('aside');
    notice.id = NOTICE_ID;
    notice.setAttribute('role', 'note');
    notice.innerHTML = `
      <p>
        <strong>Want the full article?</strong>
        Click <strong>View Original</strong>, then use the
        <strong>Read with Mark</strong> bookmarklet to import the publisher page.
        You can find the bookmarklet in the
        <a href="#read-anything" data-open-read-anything>Read Anything section</a>.
      </p>
    `;

    notice.querySelector('[data-open-read-anything]')
      ?.addEventListener('click', openReadAnything);

    reader.insertAdjacentElement('afterend', notice);
  }

  function install() {
    const original = window.renderReaderWithText;

    if (
      typeof original !== 'function' ||
      original.__msgArticleFallbackHelpInstalled
    ) return;

    function wrappedRenderReaderWithText(title, text, source) {
      const result = original.apply(this, arguments);

      if (String(text || '').includes(FALLBACK_TEXT)) {
        requestAnimationFrame(() => requestAnimationFrame(addFallbackNotice));
      }

      return result;
    }

    wrappedRenderReaderWithText.__msgArticleFallbackHelpInstalled = true;
    wrappedRenderReaderWithText.__msgArticleFallbackHelpOriginal = original;
    window.renderReaderWithText = wrappedRenderReaderWithText;
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
