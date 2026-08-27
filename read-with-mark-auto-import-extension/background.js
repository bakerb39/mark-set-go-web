'use strict';

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

function validHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function appSenderAllowed(sender) {
  try {
    const url = new URL(sender?.tab?.url || '');
    return ALLOWED_APP_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function waitForTabComplete(tabId, timeoutMs = 16000) {
  return new Promise((resolve, reject) => {
    let done = false;

    const finish = (error = null) => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      error ? reject(error) : resolve(true);
    };

    const onUpdated = (updatedId, changeInfo) => {
      if (updatedId === tabId && changeInfo.status === 'complete') finish();
    };

    const timer = setTimeout(() => {
      finish(new Error('The publisher page took too long to load.'));
    }, timeoutMs);

    chrome.tabs.onUpdated.addListener(onUpdated);

    chrome.tabs.get(tabId).then((tab) => {
      if (tab?.status === 'complete') finish();
    }).catch(() => {});
  });
}

async function requestCapture(tabId) {
  const delays = [250, 650, 1200, 2200];
  let lastError = null;

  for (const delay of delays) {
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type:'RWM_CAPTURE_FULL_PAGE',
        at:Date.now()
      });

      if (response?.ok && String(response.text || '').trim()) {
        return response;
      }

      if (response?.error) lastError = new Error(response.error);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Read with Mark could not read the publisher page.');
}

async function recoverArticle(message, sender) {
  if (!appSenderAllowed(sender)) {
    return { ok:false, error:'This page is not an approved Mark, Set, Go! app.' };
  }

  const url = validHttpUrl(message?.url);
  if (!url) return { ok:false, error:'The article URL is not valid.' };

  let targetTab = null;

  try {
    targetTab = await chrome.tabs.create({
      url,
      active:false
    });

    if (!targetTab?.id) {
      throw new Error('Chrome could not open the publisher page.');
    }

    await waitForTabComplete(targetTab.id);
    const captured = await requestCapture(targetTab.id);

    return {
      ok:true,
      requestId:String(message.requestId || ''),
      title:String(captured.title || ''),
      author:String(captured.author || ''),
      url:String(captured.url || url),
      text:String(captured.text || ''),
      structure:Array.isArray(captured.structure) ? captured.structure : [],
      wordCount:Number(captured.wordCount || 0)
    };
  } catch (error) {
    return {
      ok:false,
      requestId:String(message.requestId || ''),
      error:error?.message || 'Read with Mark could not recover the article.'
    };
  } finally {
    if (targetTab?.id) {
      try { await chrome.tabs.remove(targetTab.id); } catch {}
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'RWM_APP_IMPORT_REQUEST') return false;

  recoverArticle(message, sender)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok:false,
        requestId:String(message.requestId || ''),
        error:error?.message || 'Read with Mark recovery failed.'
      });
    });

  // Keep the MV3 message channel alive while the inactive publisher tab loads.
  return true;
});