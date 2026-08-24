(() => {
  'use strict';

  // Read with Mark v4
  // Existing app tabs receive captures directly with postMessage. The bookmarklet
  // no longer navigates/reloads an already-open Mark, Set, Go! tab.
  const PROTOCOL = 'mark-set-go-read-with-mark-v4';
  const APP_WINDOW_NAME = 'markSetGoApp';
  const RECEIVE_HASH = 'read-with-mark-receive=';
  const isTopLevelApp = window.parent === window;
  const handledRequests = new Set();
  const inFlightRequests = new Set();
  const handshakes = new Map();

  if (isTopLevelApp) {
    try { window.name = APP_WINDOW_NAME; } catch {}
  }

  const startupReceiveMatch = location.hash.match(/read-with-mark-receive=([^&]+)/);
  if (isTopLevelApp && startupReceiveMatch) {
    document.documentElement.classList.add('msg-read-with-mark-receiving');
    const style = document.createElement('style');
    style.id = 'msg-read-with-mark-receiving-style';
    style.textContent = `
      html.msg-read-with-mark-receiving #app,
      html.msg-read-with-mark-receiving .site-footer {
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

  function clearStartupReceivingState() {
    document.documentElement.classList.remove('msg-read-with-mark-receiving');
    document.getElementById('msg-read-with-mark-receiving-style')?.remove();
    if (location.hash.includes(RECEIVE_HASH)) {
      try { history.replaceState({}, '', `${location.pathname}${location.search}`); } catch {}
    }
  }

  function captureDocumentTitle(payload) {
    return payload?.captureType === 'selection'
      ? `Selected passage — ${payload.title || 'Web Page'}`
      : (payload?.title || 'Web Article');
  }

  async function waitForReadAnythingApi(timeoutMs = 10000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (typeof window.MarkSetGoReadAnything?.openDocument === 'function') {
        return window.MarkSetGoReadAnything;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 60));
    }
    return null;
  }

  function reply(target, origin, message) {
    try { target?.postMessage?.(message, origin); } catch {}
  }

  async function openCapturePayload(payload, requestId = '', responseTarget = null, responseOrigin = '*') {
    const id = String(requestId || '').trim();
    if (!id || handledRequests.has(id) || inFlightRequests.has(id)) return;
    const text = String(payload?.text || '').trim();
    if (!text) {
      reply(responseTarget, responseOrigin, {
        protocol: PROTOCOL,
        type: 'marksetgo:rwm-error',
        requestId: id,
        message: 'The captured page was empty.'
      });
      clearStartupReceivingState();
      return;
    }

    inFlightRequests.add(id);
    try {
      const api = await waitForReadAnythingApi();
      if (!api) throw new Error('Read Anything is not ready.');

      api.openDocument({
        title: captureDocumentTitle(payload),
        author: payload.author || '',
        text,
        source: {
          type: payload.captureType === 'selection' ? 'web-passage' : 'bookmarklet',
          url: payload.url || '',
          context: payload.context || '',
          captureType: payload.captureType || 'page',
          documentToc: Array.isArray(payload.documentToc) ? payload.documentToc : [],
          importedAt: new Date().toISOString()
        }
      });

      handledRequests.add(id);
      handshakes.delete(id);
      // Let the Reader's synchronous render land before revealing a newly-created app.
      window.requestAnimationFrame(() => window.requestAnimationFrame(clearStartupReceivingState));
      reply(responseTarget, responseOrigin, {
        protocol: PROTOCOL,
        type: 'marksetgo:rwm-ack',
        requestId: id
      });
      try { window.focus(); } catch {}
    } catch (error) {
      clearStartupReceivingState();
      const message = String(error?.message || error || 'Capture failed.');
      reply(responseTarget, responseOrigin, {
        protocol: PROTOCOL,
        type: 'marksetgo:rwm-error',
        requestId: id,
        message
      });
      try { window.alert(`Read with Mark could not import this page: ${message}`); } catch {}
    } finally {
      inFlightRequests.delete(id);
    }
  }

  // Backward compatibility for older token-based bookmarklets/server routes.
  async function openCaptureToken(token, requestId = '') {
    const captureToken = String(token || '').trim();
    const id = String(requestId || `token-${captureToken}`).trim();
    if (!captureToken || handledRequests.has(id) || inFlightRequests.has(id)) return;
    try {
      const response = await fetch(`/api/capture/${encodeURIComponent(captureToken)}`, { cache: 'no-store' });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || `Capture returned HTTP ${response.status}.`);
      }
      const payload = await response.json();
      await openCapturePayload(payload, id);
    } catch (error) {
      clearStartupReceivingState();
      console.warn('Read with Mark token capture failed:', error);
    }
  }

  if (isTopLevelApp) {
    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.protocol !== PROTOCOL) return;
      const requestId = String(message.requestId || '').trim();
      if (!requestId || !event.source) return;

      if (message.type === 'marksetgo:rwm-probe') {
        handshakes.set(requestId, {
          source: event.source,
          origin: event.origin,
          expiresAt: Date.now() + 15000
        });
        reply(event.source, event.origin, {
          protocol: PROTOCOL,
          type: 'marksetgo:rwm-ready',
          requestId
        });
        return;
      }

      if (message.type !== 'marksetgo:rwm-capture') return;
      const handshake = handshakes.get(requestId);
      if (!handshake
          || handshake.expiresAt < Date.now()
          || handshake.source !== event.source
          || handshake.origin !== event.origin) {
        return;
      }

      reply(event.source, event.origin, {
        protocol: PROTOCOL,
        type: 'marksetgo:rwm-accepted',
        requestId
      });
      openCapturePayload(message.payload || {}, requestId, event.source, event.origin);
    });
  }

  // If an older token URL opened this build, keep supporting it.
  const oldTokenMatch = location.hash.match(/read-anything-capture=([^&]+)/);
  if (isTopLevelApp && oldTokenMatch?.[1]) {
    window.setTimeout(() => openCaptureToken(decodeURIComponent(oldTokenMatch[1])), 0);
  }

  function upgradedBookmarkletCode() {
    const origin = JSON.stringify(location.origin);
    return `javascript:(()=>{const O=${origin},N='${APP_WINDOW_NAME}',P='${PROTOCOL}',e=s=>String(s||'').replace(/\\s+/g,' ').trim(),s=e(window.getSelection?.().toString()),r=document.querySelector('article,main,[role=main]')||document.body,t=e(document.querySelector('meta[property="og:title"]')?.content||document.querySelector('h1')?.innerText||document.title),a=e(document.querySelector('meta[name="author"]')?.content||document.querySelector('[rel=author]')?.innerText),B=[],H=[],S=new Set(),wc=v=>e(v).split(/\\s+/).filter(Boolean).length;let w=0;if(!s){[...r.querySelectorAll('h1,h2,h3,p,blockquote,li')].forEach(n=>{let v=e(n.innerText);if(v.length<=20||S.has(v))return;S.add(v);const h=/^H[1-3]$/.test(n.tagName),o=n.tagName==='LI'?'• '+v:v;if(h)H.push({title:v,index:w,type:'section'});B.push(o);w+=wc(o)})}const x=s||B.join('\\n\\n');if(!x){alert('Read with Mark could not find readable text on this page.');return}const q='rwm-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),p={title:t,author:a,url:location.href,text:x,captureType:s?'selection':'page',context:s?e(window.getSelection()?.anchorNode?.parentElement?.closest('p,blockquote,li')?.innerText||''):'',documentToc:s?[]:H};let W=window.open('',N);if(!W){alert('Read with Mark could not open Mark, Set, Go!. Please allow pop-ups for this site.');return}let fresh=false;try{fresh=W.location.href==='about:blank'}catch{}const done=()=>{clearInterval(I);clearTimeout(T);window.removeEventListener('message',M)},M=v=>{if(v.origin!==O)return;const m=v.data||{};if(m.protocol!==P||m.requestId!==q)return;if(m.type==='marksetgo:rwm-ready'){try{W.postMessage({protocol:P,type:'marksetgo:rwm-capture',requestId:q,payload:p},O)}catch{}}else if(m.type==='marksetgo:rwm-ack'){done();try{W.focus()}catch{}}else if(m.type==='marksetgo:rwm-error'){done();alert('Read with Mark could not import this page: '+(m.message||'Unknown error'))}};window.addEventListener('message',M);if(fresh){try{W.location.replace(O+'/#read-with-mark-receive='+encodeURIComponent(q))}catch{W.location=O+'/#read-with-mark-receive='+encodeURIComponent(q)}}const ping=()=>{try{W.postMessage({protocol:P,type:'marksetgo:rwm-probe',requestId:q},O)}catch{}};ping();const I=setInterval(ping,120),T=setTimeout(()=>{done();alert('Read with Mark could not connect to Mark, Set, Go!. Please try again.')},10000)})()`;
  }

  function showUpgradedBookmarklet() {
    const workspace = document.querySelector('#read-anything-workspace');
    if (!workspace) return false;
    const code = upgradedBookmarkletCode();
    workspace.hidden = false;
    workspace.replaceChildren();

    const heading = document.createElement('h2');
    heading.textContent = 'Install “Read with Mark”';
    const intro = document.createElement('p');
    intro.textContent = 'Replace your existing Read with Mark bookmarklet with this version. If Mark, Set, Go! is already open, the captured page is sent directly into that live tab without reloading it.';
    const linkWrap = document.createElement('p');
    const link = document.createElement('a');
    link.className = 'primary button-link';
    link.textContent = 'Read with Mark';
    link.href = code;
    linkWrap.appendChild(link);
    const label = document.createElement('label');
    label.append('Bookmark address');
    const textarea = document.createElement('textarea');
    textarea.id = 'bookmarklet-code';
    textarea.rows = 8;
    textarea.readOnly = true;
    textarea.value = code;
    label.appendChild(textarea);
    const note = document.createElement('p');
    note.innerHTML = '<small>Highlight text first to send only that passage; otherwise the full readable page is imported.</small>';
    workspace.append(heading, intro, linkWrap, label, note);
    textarea.addEventListener('focus', () => textarea.select());
    return true;
  }

  // Override only the installer UI. The Read Anything module itself stays intact.
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#read-anything-bookmarklet');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showUpgradedBookmarklet();
  }, true);

  window.MarkSetGoReadWithMarkBridge = Object.freeze({
    protocol: PROTOCOL,
    openCaptureToken,
    openCapturePayload,
    bookmarkletCode: upgradedBookmarkletCode
  });
})();
