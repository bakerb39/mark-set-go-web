(() => {
  'use strict';

  // Read with Mark v3: reuse a stable named top-level app window.
  // The bookmarklet posts directly to that browsing context; no hidden iframe,
  // cross-site frame handshake, or response timeout is involved.
  const isTopLevelApp = window.parent === window;

  const CHANNEL_NAME = 'mark-set-go-read-with-mark-v2';
  const TAB_KEY = 'markSetGoReadWithMarkTabV2';
  const handledTokens = new Set();
  const inFlightTokens = new Set();

  const tabId = (() => {
    try {
      const existing = sessionStorage.getItem(TAB_KEY);
      if (existing) return existing;
      const value = globalThis.crypto?.randomUUID?.()
        || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(TAB_KEY, value);
      return value;
    } catch {
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }
  })();

  // Give the top-level app a stable target name so the bookmarklet can reuse it.
  if (isTopLevelApp) {
    try { window.name = 'markSetGoApp'; } catch {}
  }

  function companionDocumentTitle(payload) {
    return payload?.captureType === 'selection'
      ? `Selected passage — ${payload.title || 'Web Page'}`
      : (payload?.title || 'Web Article');
  }

  async function waitForReadAnythingApi(timeoutMs = 5000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (typeof window.MarkSetGoReadAnything?.openDocument === 'function') {
        return window.MarkSetGoReadAnything;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    }
    return null;
  }

  let channel = null;
  if (isTopLevelApp) {
    try { channel = new BroadcastChannel(CHANNEL_NAME); } catch {}
  }

  async function openCaptureToken(token, requestId = '') {
    const captureToken = String(token || '').trim();
    if (!captureToken || handledTokens.has(captureToken) || inFlightTokens.has(captureToken)) {
      if (captureToken && handledTokens.has(captureToken)) {
        channel?.postMessage({
          type: 'marksetgo:capture-ack', requestId, token: captureToken, tabId
        });
      }
      return;
    }

    inFlightTokens.add(captureToken);
    try {
      const api = await waitForReadAnythingApi();
      if (!api) throw new Error('Read Anything is not ready.');

      const response = await fetch(`/api/capture/${encodeURIComponent(captureToken)}`, {
        cache: 'no-store'
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || `Capture returned HTTP ${response.status}.`);
      }
      const payload = await response.json();
      if (!String(payload?.text || '').trim()) throw new Error('The captured page was empty.');

      api.openDocument({
        title: companionDocumentTitle(payload),
        author: payload.author || '',
        text: payload.text,
        source: {
          type: payload.captureType === 'selection' ? 'web-passage' : 'bookmarklet',
          url: payload.url || '',
          context: payload.context || '',
          captureType: payload.captureType || 'page',
          documentToc: Array.isArray(payload.documentToc) ? payload.documentToc : [],
          importedAt: new Date().toISOString()
        }
      });

      handledTokens.add(captureToken);
      channel?.postMessage({
        type: 'marksetgo:capture-ack', requestId, token: captureToken, tabId
      });
      try { window.focus(); } catch {}
    } catch (error) {
      console.warn('Read with Mark capture handoff failed:', error);
      const message = String(error?.message || error || 'Capture failed.');
      channel?.postMessage({
        type: 'marksetgo:capture-error',
        requestId,
        token: captureToken,
        tabId,
        message
      });
      try { window.alert(`Read with Mark could not import this page: ${message}`); } catch {}
    } finally {
      inFlightTokens.delete(captureToken);
    }
  }

  if (channel) {
    channel.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'marksetgo:capture-probe') {
        channel.postMessage({
          type: 'marksetgo:capture-ready',
          requestId: message.requestId || '',
          token: message.token || '',
          tabId,
          focused: Boolean(document.hasFocus?.()),
          visible: document.visibilityState === 'visible',
          href: location.href,
          timestamp: Date.now()
        });
        return;
      }

      if (message.type === 'marksetgo:capture-deliver'
          && message.tabId === tabId) {
        // Claim the capture immediately so the bridge never opens a fallback app
        // while this already-open tab is fetching/rendering a large article.
        channel.postMessage({
          type: 'marksetgo:capture-accepted',
          requestId: message.requestId || '',
          token: message.token || '',
          tabId
        });
        openCaptureToken(message.token, message.requestId);
      }
    });
  }

  function upgradedBookmarkletCode() {
    const origin = JSON.stringify(location.origin);
    return `javascript:(()=>{const O=${origin},N='markSetGoApp',e=s=>String(s||'').replace(/\\s+/g,' ').trim(),s=e(window.getSelection?.().toString()),r=document.querySelector('article,main,[role=main]')||document.body,t=e(document.querySelector('meta[property="og:title"]')?.content||document.querySelector('h1')?.innerText||document.title),a=e(document.querySelector('meta[name="author"]')?.content||document.querySelector('[rel=author]')?.innerText),B=[],H=[],S=new Set(),wc=v=>e(v).split(/\\s+/).filter(Boolean).length;let w=0;if(!s){[...r.querySelectorAll('h1,h2,h3,p,blockquote,li')].forEach(n=>{let v=e(n.innerText);if(v.length<=20||S.has(v))return;S.add(v);const h=/^H[1-3]$/.test(n.tagName),o=n.tagName==='LI'?'• '+v:v;if(h)H.push({title:v,index:w,type:'section'});B.push(o);w+=wc(o)})}const x=s||B.join('\\n\\n');if(!x){alert('Read with Mark could not find readable text on this page.');return}const k=s?'selection':'page',c=s?e(window.getSelection()?.anchorNode?.parentElement?.closest('p,blockquote,li')?.innerText||''):'',f=document.createElement('form');f.method='POST';f.action=O+'/capture';f.target=N;[['title',t],['author',a],['url',location.href],['text',x],['captureType',k],['context',c],['structure',JSON.stringify(s?[]:H)]].forEach(([n,v])=>{const i=document.createElement('textarea');i.name=n;i.value=v;f.appendChild(i)});f.hidden=true;document.body.appendChild(f);f.submit();f.remove()})()`;
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
    intro.textContent = 'Replace your existing Read with Mark bookmarklet with this version. It posts directly to the existing Mark, Set, Go! tab when one is open and creates one only when necessary.';
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
    textarea.rows = 7;
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
    tabId,
    openCaptureToken,
    bookmarkletCode: upgradedBookmarkletCode
  });
})();
