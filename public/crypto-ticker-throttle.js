(() => {
  'use strict';
  if (window.__MSG_CRYPTO_TICKER_THROTTLE__) return;
  window.__MSG_CRYPTO_TICKER_THROTTLE__ = true;

  const nativeFetch = window.fetch.bind(window);
  const NORMAL_TTL = 5 * 60 * 1000;      // 5 minutes
  const BACKOFF_429 = 15 * 60 * 1000;    // 15 minutes
  const CACHE_KEY = 'msg_crypto_ticker_cache_v2';
  const BACKOFF_KEY = 'msg_crypto_ticker_backoff_v2';

  let inFlight = null;

  function isCryptoTickerRequest(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url || '';
      const url = new URL(raw, location.href);
      return url.origin === location.origin && url.pathname === '/api/crypto-ticker';
    } catch {
      return false;
    }
  }

  function readJson(key, fallback=null) {
    try { return JSON.parse(sessionStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  }

  function writeJson(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function cachedResponse(cache, extra={}) {
    const payload = {...(cache?.data || {}), ...extra, cached:true};
    return new Response(JSON.stringify(payload), {
      status:200,
      headers:{'Content-Type':'application/json','X-MSG-Crypto-Cache':'client'}
    });
  }

  window.fetch = function(input, init) {
    if (!isCryptoTickerRequest(input)) return nativeFetch(input, init);

    const now = Date.now();
    const cache = readJson(CACHE_KEY);
    const backoffUntil = Number(readJson(BACKOFF_KEY, 0)) || 0;

    // Hidden workspace/Reader panes should never generate a fresh ticker call.
    if (document.hidden && cache?.data) {
      return Promise.resolve(cachedResponse(cache, {stale:true}));
    }

    // Respect a provider-rate-limit cooling-off period.
    if (backoffUntil > now) {
      if (cache?.data) {
        return Promise.resolve(cachedResponse(cache, {
          stale:true,
          rateLimited:true,
          retryAfterMs:backoffUntil-now
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        error:'Cryptocurrency prices are cooling down after a provider rate limit.',
        retryAfterMs:backoffUntil-now
      }), {status:429, headers:{'Content-Type':'application/json'}}));
    }

    // Normal five-minute client cache.
    if (cache?.data && now - Number(cache.savedAt || 0) < NORMAL_TTL) {
      return Promise.resolve(cachedResponse(cache));
    }

    // Multiple app/workspace consumers share one request per browsing context.
    if (inFlight) {
      return inFlight.then(response => response.clone());
    }

    inFlight = nativeFetch(input, init).then(async response => {
      if (response.status === 429) {
        const until = Date.now() + BACKOFF_429;
        writeJson(BACKOFF_KEY, until);

        if (cache?.data) {
          return cachedResponse(cache, {
            stale:true,
            rateLimited:true,
            retryAfterMs:BACKOFF_429
          });
        }
        return response;
      }

      if (response.ok) {
        try {
          const data = await response.clone().json();
          if (data && typeof data === 'object') {
            writeJson(CACHE_KEY, {savedAt:Date.now(), data});
            writeJson(BACKOFF_KEY, 0);
          }
        } catch {}
      }
      return response;
    }).finally(() => {
      window.setTimeout(() => { inFlight = null; }, 0);
    });

    return inFlight.then(response => response.clone());
  };
})();
