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
      'button[data-read="upload"], [data-read="upload"], [data-action="read-anything"]'
    );

    trigger?.click?.();
  }

  function showFallbackHelp() {
    document.getElementById(NOTICE_ID)?.remove();

    const reader = document.querySelector('#app #reader');
    if (!reader) return;

    addStyles();

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

    // Put the guidance immediately after the reader text rather than above it.
    reader.insertAdjacentElement('afterend', notice);
  }

  function install() {
    const original = window.renderReaderWithText;

    if (
      typeof original !== 'function' ||
      original.__articleImportFallbackHelpInstalled
    ) return;

    function wrappedRenderReaderWithText(title, text, source) {
      const result = original.apply(this, arguments);

      if (String(text || '').includes(FALLBACK_TEXT)) {
        requestAnimationFrame(() => requestAnimationFrame(showFallbackHelp));
      }

      return result;
    }

    wrappedRenderReaderWithText.__articleImportFallbackHelpInstalled = true;
    wrappedRenderReaderWithText.__articleImportFallbackHelpOriginal = original;

    window.renderReaderWithText = wrappedRenderReaderWithText;
  }

  // All scripts here are deferred. Waiting for DOMContentLoaded ensures that
  // app.js, read-anything.js, and the other reader integrations have finished
  // assigning their final renderReaderWithText implementation before wrapping it.
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
