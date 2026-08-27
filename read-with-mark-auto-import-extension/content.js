(() => {
  'use strict';

  const PING = 'MSG_RWM_EXTENSION_PING';
  const READY = 'MSG_RWM_EXTENSION_READY';
  const REQUEST = 'MSG_RWM_EXTENSION_IMPORT_REQUEST';
  const RESULT = 'MSG_RWM_EXTENSION_IMPORT_RESULT';

  const ALLOWED_APP_HOSTS = new Set([
    'mark-set-go-cloud-test2.onrender.com',
    'mark-set-go-cloud-test.onrender.com',
    'localhost',
    '127.0.0.1',
    'b2curious.com',
    'www.b2curious.com',
    'reader-symposium.com',
    'www.reader-symposium.com'
  ]);

  function clean(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function wordCount(value = '') {
    return clean(value).split(/\s+/).filter(Boolean).length;
  }

  function htmlPayloadToText(value = '') {
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
      return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  function isVisible(node) {
    if (!(node instanceof Element)) return true;

    try {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0 &&
        rect.width > 1 &&
        rect.height > 1
      );
    } catch {
      return true;
    }
  }

  function appPage() {
    return ALLOWED_APP_HOSTS.has(location.hostname);
  }

  function announceReady() {
    if (!appPage()) return;
    window.postMessage({
      type:READY,
      extensionVersion:chrome.runtime.getManifest().version,
      at:Date.now()
    }, location.origin);
  }

  function visiblePaywallDetected() {
    const bodyText = clean(document.body?.innerText || '').slice(0, 9000);
    const signal = /(?:subscribe\s+(?:to|now|for)\s+(?:continue|read|access)|sign\s+in\s+to\s+continue|already\s+(?:a\s+)?subscriber|subscription\s+required|purchase\s+(?:a\s+)?subscription|metered\s+paywall)/i.test(bodyText);

    const candidates = Array.from(document.querySelectorAll(
      '[class*="paywall" i],[id*="paywall" i],[class*="subscription-wall" i],[id*="subscription-wall" i]'
    ));

    const visibleWall = candidates.some((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0 &&
        rect.width > 80 &&
        rect.height > 40
      );
    });

    return signal && visibleWall;
  }

  function chooseRoot() {
    const candidates = Array.from(document.querySelectorAll(
      'article,[itemprop="articleBody"],main,[role="main"]'
    ));

    let best = null;
    let bestScore = -1;

    for (const node of candidates) {
      if (!isVisible(node)) continue;
      const text = htmlPayloadToText(node.innerText || node.textContent || '');
      if (!text) continue;
      const paragraphs = node.querySelectorAll('p').length;
      const score = text.length + paragraphs * 180;
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }

    return best || document.body;
  }

  function extractPage() {
    if (visiblePaywallDetected()) {
      return {
        ok:false,
        error:'The publisher page appears to require subscription or sign-in. Read with Mark will not bypass that access control.'
      };
    }

    const root = chooseRoot();
    if (!root) {
      return { ok:false, error:'No readable page body was found.' };
    }

    // Work from a clone so extraction never changes the publisher page.
    const clone = root.cloneNode(true);
    clone.querySelectorAll(
      'script,style,noscript,nav,aside,footer,form,button,input,select,textarea,svg,canvas,[aria-hidden="true"]'
    ).forEach((node) => node.remove());

    const seen = new Set();
    const blocks = [];
    const structure = [];
    let runningWords = 0;

    const nodes = clone.querySelectorAll('h1,h2,h3,p,blockquote,li');

    nodes.forEach((node) => {
      let text = htmlPayloadToText(node.innerText || node.textContent || '');
      text = clean(text);
      if (text.length <= 20 || seen.has(text)) return;
      seen.add(text);

      const isHeading = /^H[1-3]$/.test(node.tagName);
      if (isHeading) {
        structure.push({
          title:text,
          index:runningWords,
          type:'section'
        });
      }

      if (node.tagName === 'LI') text = `• ${text}`;
      blocks.push(text);
      runningWords += wordCount(text);
    });

    // If the page uses a text-heavy container without standard paragraph tags,
    // fall back to its visible text rather than returning an empty capture.
    let text = htmlPayloadToText(blocks.join('\n\n').trim());

    if (text.length < 700) {
      text = htmlPayloadToText(clone.innerText || clone.textContent || '');
    }

    // Final extension-side guard: raw markup must never leave the extension.
    text = htmlPayloadToText(text);

    const words = wordCount(text);
    if (text.length < 700 || words < 100) {
      return {
        ok:false,
        error:'The publisher page loaded, but it did not expose enough readable article text.'
      };
    }

    const title = clean(
      document.querySelector('meta[property="og:title"]')?.content ||
      document.querySelector('h1')?.innerText ||
      document.title
    );

    const author = clean(
      document.querySelector('meta[name="author"]')?.content ||
      document.querySelector('[rel="author"]')?.innerText ||
      document.querySelector('[itemprop="author"]')?.innerText
    );

    return {
      ok:true,
      title,
      author,
      url:location.href,
      text,
      structure,
      wordCount:words
    };
  }

  async function stabilizedCapture() {
    // Give client-rendered articles a short chance to populate without requiring
    // any user action. Keep the best visible capture observed.
    const delays = [0, 450, 900, 1600];
    let best = null;
    let lastError = '';

    for (const delay of delays) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));

      const capture = extractPage();
      if (!capture.ok) {
        lastError = capture.error || lastError;
        if (/subscription|sign-in|access control/i.test(lastError)) return capture;
        continue;
      }

      if (!best || Number(capture.wordCount) > Number(best.wordCount)) {
        best = capture;
      }

      if (capture.wordCount >= 300) break;
    }

    return best || {
      ok:false,
      error:lastError || 'Read with Mark could not find readable article text.'
    };
  }

  if (appPage()) {
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const message = event.data || {};
      if (!message || typeof message !== 'object') return;

      if (message.type === PING) {
        announceReady();
        return;
      }

      if (message.type === REQUEST) {
        const requestId = String(message.requestId || '');
        chrome.runtime.sendMessage({
          type:'RWM_APP_IMPORT_REQUEST',
          requestId,
          url:String(message.url || ''),
          title:String(message.title || ''),
          at:Date.now()
        }).then((response) => {
          window.postMessage({
            type:RESULT,
            requestId,
            ...(response || { ok:false, error:'No response from Read with Mark.' })
          }, location.origin);
        }).catch((error) => {
          window.postMessage({
            type:RESULT,
            requestId,
            ok:false,
            error:error?.message || 'Read with Mark extension could not start.'
          }, location.origin);
        });
      }
    });

    announceReady();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'RWM_CAPTURE_FULL_PAGE') return false;

    stabilizedCapture()
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          ok:false,
          error:error?.message || 'Read with Mark could not capture this page.'
        });
      });

    return true;
  });
})();