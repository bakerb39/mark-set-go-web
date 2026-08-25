(() => {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const isAuxiliaryReader =
    window.parent !== window &&
    (
      params.get('msgSecondaryReader') === '1' ||
      Number(params.get('msgReaderNumber') || 0) >= 2 ||
      params.get('msgWorkspaceMode') === 'reader'
    );

  if (!isAuxiliaryReader) return;

  window.__MSG_WORKSPACE_PANE__ = true;
  window.MSGWorkspacePane = true;
  window.__MSG_WORKSPACE_SKIP_ACCOUNT_BOOTSTRAP__ = true;

  // Reader 2+ is a same-origin secondary view. It uses the outer app's account
  // session and shared IndexedDB; it must not initialize a second Clerk client,
  // beta gate, account bootstrap, or cloud restore cycle.
  try {
    if (window.parent?.MarkSetGoAuth) {
      window.MarkSetGoAuth = window.parent.MarkSetGoAuth;
    }
  } catch {}

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const raw = typeof input === 'string' ? input : (input && input.url) || '';
    try {
      const url = new URL(raw, window.location.href);

      // auth.js only needs config to decide whether to boot Clerk. Report a
      // deliberately local/non-configured account inside auxiliary Readers.
      // The outer top-level app remains fully authenticated and beta-protected.
      if (url.pathname === '/api/auth/config') {
        return Promise.resolve(new Response(JSON.stringify({
          configured:false,
          publishableKey:'',
          provider:'workspace-parent',
          betaAccessEnabled:false,
          workspacePane:true
        }), {
          status:200,
          headers:{'Content-Type':'application/json'}
        }));
      }

      // Defensive: no auxiliary Reader should directly refresh the session.
      if (url.pathname === '/api/auth/session') {
        return Promise.resolve(new Response(JSON.stringify({
          configured:false,
          authenticated:false,
          planCode:'workspace',
          betaAccess:{enabled:false,granted:true},
          workspacePane:true
        }), {
          status:200,
          headers:{'Content-Type':'application/json'}
        }));
      }
    } catch {}

    return nativeFetch(input, init);
  };

  // auth.js may publish its local guest placeholder after reading the fake
  // config. Prevent that secondary placeholder event from waking cloud modules,
  // and restore the useful read-only parent auth object for code that inspects it.
  document.addEventListener('marksetgo:auth-ready', (event) => {
    event.stopImmediatePropagation();
    try {
      if (window.parent?.MarkSetGoAuth) {
        window.MarkSetGoAuth = window.parent.MarkSetGoAuth;
      }
    } catch {}
  }, true);

  document.addEventListener('marksetgo:auth-changed', (event) => {
    event.stopImmediatePropagation();
  }, true);

  // If an older cached auth.js managed to create a gate anyway, remove it once.
  window.addEventListener('DOMContentLoaded', () => {
    document.querySelector('#beta-access-gate')?.remove();
    document.body.classList.remove('beta-gate-active');
  }, { once:true });
})();