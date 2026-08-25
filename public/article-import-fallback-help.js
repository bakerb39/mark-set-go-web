(() => {
  'use strict';

  const FALLBACK_TEXT = 'Full article text could not be imported from the publisher.';
  const NOTICE_ID = 'article-import-fallback-help';

  function addStyles() {
    if (document.getElementById('article-import-fallback-help-styles')) return;

    const style = document.createElement('style');
    style.id = 'article-import-fallback-help-styles';
    style.textContent = `
      #${NOTICE_ID} {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        margin: 0 0 12px;
        padding: 12px 14px;
        border: 1px solid rgba(148, 163, 184, .45);
        border-radius: 12px;
        background: rgba(15, 23, 42, .06);
        font-size: 14px;
        line-height: 1.45;
      }

      #${NOTICE_ID} .article-import-fallback-copy {
        min-width: 0;
      }

      #${NOTICE_ID} strong {
        font-weight: 700;
      }

      #${NOTICE_ID} a {
        white-space: nowrap;
      }

      @media (max-width: 700px) {
        #${NOTICE_ID} {
          align-items: flex-start;
          flex-direction: column;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function openReadAnything(event) {
    event?.preventDefault?.();

    const trigger = document.querySelector(
      'button[data-read="upload"], [data-read="upload"]'
    );

    if (trigger) {
      trigger.click();
    }
  }

  function showFallbackHelp() {
    const appRoot = document.getElementById('app');

    if (!appRoot || document.getElementById(NOTICE_ID)) return;

    const reader = appRoot.querySelector('#reader');

    if (!reader?.parentElement) return;

    addStyles();

    const notice = document.createElement('aside');
    notice.id = NOTICE_ID;
    notice.setAttribute('role', 'note');
    notice.innerHTML = `
      <div class="article-import-fallback-copy">
        <strong>Want the full article?</strong>
        Click <strong>View Original</strong>, then use the
        <strong>Read with Mark</strong> bookmarklet to import the publisher page.
        The bookmarklet can be found in the
        <a href="#read-anything" data-open-read-anything>Read Anything section</a>.
      </div>
      <a class="secondary button-link"
         href="#read-anything"
         data-open-read-anything>
        Open Read Anything →
      </a>
    `;

    notice.querySelectorAll('[data-open-read-anything]').forEach((link) => {
      link.addEventListener('click', openReadAnything);
    });

    reader.parentElement.insertBefore(notice, reader);
  }

  function installFallbackHelp() {
    const originalRenderReaderWithText = window.renderReaderWithText;

    if (
      typeof originalRenderReaderWithText !== 'function' ||
      originalRenderReaderWithText.__articleFallbackHelpInstalled
    ) {
      return;
    }

    function renderReaderWithArticleFallbackHelp(title, text, source) {
      const result = originalRenderReaderWithText.apply(this, arguments);

      if (String(text || '').includes(FALLBACK_TEXT)) {
        requestAnimationFrame(() => requestAnimationFrame(showFallbackHelp));
      }

      return result;
    }

    renderReaderWithArticleFallbackHelp.__articleFallbackHelpInstalled = true;
    renderReaderWithArticleFallbackHelp.__articleFallbackHelpOriginal =
      originalRenderReaderWithText;

    window.renderReaderWithText = renderReaderWithArticleFallbackHelp;
  }

  window.addEventListener('DOMContentLoaded', installFallbackHelp, { once: true });
})();
