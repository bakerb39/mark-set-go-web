(() => {
  'use strict';

  const VERSION = '0.1.1';
  const PING = 'MSG_RWM_EXTENSION_PING';
  const READY = 'MSG_RWM_EXTENSION_READY';
  const REQUEST = 'MSG_RWM_EXTENSION_IMPORT_REQUEST';
  const RESULT = 'MSG_RWM_EXTENSION_IMPORT_RESULT';

  const FAILURE_PATTERNS = [
    /Full article text could not be imported from the publisher\./i,
    /The publisher blocks automated full-text import for this article\./i
  ];

  const attempted = new Set();
  const pending = new Map();
  let extensionReady = false;
  let lastReadyAt = 0;
  let toastTimer = 0;

  function clean(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function sanitizeRecoveredText(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const looksLikeHtml =
      /<\/?(?:a|p|div|section|article|blockquote|figure|figcaption|h[1-6]|li|ul|ol|br|span)\b/i.test(raw) ||
      /&(?:#\d+|#x[0-9a-f]+|nbsp|amp|lt|gt|quot|apos|hellip|mdash|ndash);/i.test(raw);

    if (!looksLikeHtml) {
      return raw
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<body>${raw}</body>`, 'text/html');

      doc.querySelectorAll(
        'script,style,noscript,nav,aside,footer,form,button,input,select,textarea,' +
        'svg,canvas,iframe,figure,figcaption,[aria-hidden="true"],' +
        '[class*="share" i],[class*="social" i],[class*="newsletter" i],' +
        '[class*="advert" i],[class*="promo" i]'
      ).forEach((node) => node.remove());

      const blocks = [];
      const seen = new Set();

      doc.body.querySelectorAll('h1,h2,h3,h4,p,li').forEach((node) => {
        let text = String(node.textContent || '')
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (!text || seen.has(text)) return;
        seen.add(text);

        if (node.tagName === 'LI') text = `• ${text}`;
        blocks.push(text);
      });

      let text = blocks.join('\n\n').trim();
      if (!text) {
        text = String(doc.body.textContent || '')
          .replace(/\u00a0/g, ' ')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }

      return text;
    } catch {
      return raw
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  function normalizeUrl(value = '') {
    try {
      const url = new URL(String(value || ''), location.href);
      if (!/^https?:$/i.test(url.protocol)) return '';
      url.hash = '';
      return url.href;
    } catch {
      return '';
    }
  }

  function currentDocument() {
    return window.MarkSetGoCurrentReaderDocument?.get?.() || null;
  }

  function isRecoverableIncompleteArticle(current = currentDocument()) {
    if (!current) return false;

    const source = current.source && typeof current.source === 'object'
      ? current.source
      : {};
    const url = normalizeUrl(source.url || '');
    if (!url) return false;

    // This first experiment is intentionally scoped to topic/news article
    // failures rather than making extension recovery a generic document loader.
    const type = String(source.type || '').toLowerCase();
    const looksLikeArticle = (
      type === 'topic-feed' ||
      type === 'website' ||
      source.fullArticle === false
    );
    if (!looksLikeArticle) return false;

    const text = String(current.text || '');
    return FAILURE_PATTERNS.some((pattern) => pattern.test(text));
  }

  function recoveryKey(current = currentDocument()) {
    const source = current?.source || {};
    return [
      String(current?.documentId || ''),
      normalizeUrl(source.url || ''),
      String(current?.title || '')
    ].join('|');
  }

  function showToast(message, kind = 'working', timeout = 0) {
    let node = document.querySelector('[data-rwm-extension-recovery-status]');
    if (!node) {
      node = document.createElement('div');
      node.dataset.rwmExtensionRecoveryStatus = '1';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      node.style.cssText = [
        'position:fixed',
        'z-index:12050',
        'right:18px',
        'top:74px',
        'max-width:min(380px,calc(100vw - 36px))',
        'padding:9px 12px',
        'border:1px solid rgba(17,52,81,.16)',
        'border-radius:10px',
        'background:rgba(255,253,247,.97)',
        'box-shadow:0 10px 28px rgba(7,24,39,.16)',
        'color:#173f60',
        'font:600 12px/1.4 Inter,system-ui,sans-serif',
        'pointer-events:none'
      ].join(';');
      document.body.appendChild(node);
    }

    node.dataset.kind = kind;
    node.textContent = message;
    node.hidden = false;

    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = 0;
    }
    if (timeout > 0) {
      toastTimer = window.setTimeout(() => {
        if (node.isConnected) node.hidden = true;
      }, timeout);
    }
  }

  function hideToast() {
    const node = document.querySelector('[data-rwm-extension-recovery-status]');
    if (node) node.hidden = true;
  }

  function pingExtension() {
    window.postMessage({
      type:PING,
      version:VERSION,
      at:Date.now()
    }, location.origin);
  }

  function waitForExtension(timeoutMs = 1400) {
    if (extensionReady && Date.now() - lastReadyAt < 10000) {
      return Promise.resolve(true);
    }

    pingExtension();

    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        document.removeEventListener('marksetgo:rwm-extension-ready', onReady);
        window.clearTimeout(timer);
        resolve(Boolean(value));
      };
      const onReady = () => finish(true);
      const timer = window.setTimeout(() => finish(extensionReady), timeoutMs);
      document.addEventListener('marksetgo:rwm-extension-ready', onReady, { once:true });
    });
  }

  function requestExtensionImport(current) {
    const source = current?.source || {};
    const url = normalizeUrl(source.url || '');
    if (!url) return Promise.resolve(null);

    const requestId = `rwm-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        pending.delete(requestId);
        resolve({
          ok:false,
          error:'Read with Mark timed out while loading the publisher page.'
        });
      }, 26000);

      pending.set(requestId, {
        resolve:(payload) => {
          window.clearTimeout(timer);
          resolve(payload);
        },
        url,
        documentId:String(current.documentId || '')
      });

      window.postMessage({
        type:REQUEST,
        requestId,
        url,
        title:String(current.title || ''),
        at:Date.now()
      }, location.origin);
    });
  }

  function currentStillMatches(request) {
    const current = currentDocument();
    if (!current) return false;

    const liveUrl = normalizeUrl(current.source?.url || '');
    if (liveUrl && request.url && liveUrl !== request.url) return false;

    // A document id can legitimately change only after successful recovery.
    if (
      request.documentId &&
      current.documentId &&
      String(current.documentId) !== String(request.documentId)
    ) {
      return false;
    }

    return true;
  }

  function importRecoveredArticle(payload, original) {
    const api = window.MarkSetGoReadAnything;
    if (typeof api?.openDocument !== 'function') {
      throw new Error('Read Anything is not ready to open the recovered article.');
    }

    const text = sanitizeRecoveredText(payload?.text || '');
    const words = text.split(/\s+/).filter(Boolean).length;
    if (text.length < 700 || words < 100) {
      throw new Error('The publisher page did not expose enough readable article text.');
    }

    const originalSource =
      original?.source && typeof original.source === 'object'
        ? original.source
        : {};

    api.openDocument({
      title:clean(payload.title) || String(original?.title || 'Web Article'),
      author:clean(payload.author || originalSource.author || ''),
      text,
      source:{
        ...originalSource,
        // Keep topic-feed identity when it was a topic article so the rest of
        // the Reader continues to treat it exactly like a full topic article.
        type:String(originalSource.type || 'topic-feed'),
        url:normalizeUrl(payload.url || originalSource.url || ''),
        fullArticle:true,
        captureType:'page',
        readWithMarkAutoRecovered:true,
        recoveredBy:'read-with-mark-extension',
        recoveredAt:new Date().toISOString(),
        documentToc:Array.isArray(payload.structure) ? payload.structure : []
      }
    });
  }

  async function attemptRecovery(reason = 'document') {
    const current = currentDocument();
    if (!isRecoverableIncompleteArticle(current)) return false;

    const key = recoveryKey(current);
    if (!key || attempted.has(key)) return false;
    attempted.add(key);

    const ready = await waitForExtension();
    if (!ready) {
      // Extension is optional. Keep the existing manual fallback untouched.
      return false;
    }

    showToast('Recovering full article with Read with Mark…');

    const snapshot = {
      documentId:String(current.documentId || ''),
      title:String(current.title || ''),
      source:{ ...(current.source || {}) }
    };

    const result = await requestExtensionImport(current);
    if (!result?.ok) {
      showToast(
        result?.error
          ? `Read with Mark could not recover this article. ${result.error}`
          : 'Read with Mark could not recover this article.',
        'error',
        5200
      );
      return false;
    }

    // If the user navigated to another story while the background tab was
    // loading, do not replace the new reading with the old article.
    const live = currentDocument();
    const liveUrl = normalizeUrl(live?.source?.url || '');
    const expectedUrl = normalizeUrl(snapshot.source?.url || '');
    if (expectedUrl && liveUrl && liveUrl !== expectedUrl) {
      hideToast();
      return false;
    }

    try {
      importRecoveredArticle(result, snapshot);
      showToast('Full article recovered with Read with Mark.', 'success', 2800);
      document.dispatchEvent(new CustomEvent(
        'marksetgo:read-with-mark-auto-recovered',
        { detail:{ url:expectedUrl, reason } }
      ));
      return true;
    } catch (error) {
      showToast(
        error?.message || 'The recovered article could not be opened.',
        'error',
        5200
      );
      return false;
    }
  }

  function scheduleRecovery(reason = 'document') {
    [80, 350, 900].forEach((delay) => {
      window.setTimeout(() => {
        void attemptRecovery(reason);
      }, delay);
    });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data || {};
    if (!message || typeof message !== 'object') return;

    if (message.type === READY) {
      extensionReady = true;
      lastReadyAt = Date.now();
      document.dispatchEvent(new CustomEvent('marksetgo:rwm-extension-ready'));
      scheduleRecovery('extension-ready');
      return;
    }

    if (message.type === RESULT) {
      const requestId = String(message.requestId || '');
      const request = pending.get(requestId);
      if (!request) return;

      pending.delete(requestId);
      request.resolve(message);
    }
  });

  document.addEventListener('marksetgo:document-available', () => {
    scheduleRecovery('document-available');
  });

  window.addEventListener('pageshow', () => {
    pingExtension();
    scheduleRecovery('pageshow');
  });

  window.MarkSetGoReadWithMarkExtensionFallback = Object.freeze({
    version:VERSION,
    ping:pingExtension,
    retry:() => {
      const current = currentDocument();
      if (current) attempted.delete(recoveryKey(current));
      return attemptRecovery('manual-retry');
    },
    get ready(){ return extensionReady; },
    isRecoverable:() => isRecoverableIncompleteArticle(currentDocument())
  });

  pingExtension();
  scheduleRecovery('startup');
})();