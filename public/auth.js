(() => {
  'use strict';

  const state = { clerk: null, config: null, session: null, gate: null };
  const controls = () => document.getElementById('auth-controls');

  function setControls(html) {
    const node = controls();
    if (node) node.innerHTML = html;
  }


  function ensureGate() {
    if (state.gate) return state.gate;
    const gate = document.createElement('div');
    gate.id = 'beta-access-gate';
    gate.className = 'beta-access-gate';
    gate.innerHTML = `
      <section class="beta-access-card" role="dialog" aria-modal="true" aria-labelledby="beta-access-title">
        <div class="beta-access-mark">Mark, Set, Go!</div>
        <h1 id="beta-access-title">Private beta</h1>
        <p id="beta-access-message">Checking your access…</p>
        <div class="beta-access-actions" id="beta-access-actions"></div>
      </section>`;
    document.body.appendChild(gate);
    document.body.classList.add('beta-gate-active');
    state.gate = gate;
    return gate;
  }

  function showGate(message, actionsHtml = '') {
    const gate = ensureGate();
    const messageNode = gate.querySelector('#beta-access-message');
    const actionsNode = gate.querySelector('#beta-access-actions');
    if (messageNode) messageNode.textContent = message;
    if (actionsNode) actionsNode.innerHTML = actionsHtml;
  }

  function closeGate() {
    state.gate?.remove();
    state.gate = null;
    document.body.classList.remove('beta-gate-active');
  }


  function clerkModalIsPresent() {
    return Boolean(document.querySelector(
      '.cl-modalBackdrop, .cl-modalContent, [class*="cl-modal"], [data-clerk-modal], [data-clerk-component="SignIn"], [data-clerk-component="SignUp"]'
    ));
  }

  function openClerkAuthDialog(kind) {
    if (!state.clerk) return;
    document.body.classList.add('clerk-auth-dialog-open');
    const open = kind === 'signUp' ? state.clerk.openSignUp?.bind(state.clerk) : state.clerk.openSignIn?.bind(state.clerk);
    if (!open) {
      document.body.classList.remove('clerk-auth-dialog-open');
      return;
    }

    open();

    let appeared = false;
    const startedAt = Date.now();
    const observer = new MutationObserver(() => {
      const present = clerkModalIsPresent();
      if (present) appeared = true;
      if ((appeared && !present) || (!appeared && Date.now() - startedAt > 5000)) {
        observer.disconnect();
        document.body.classList.remove('clerk-auth-dialog-open');
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      if (!appeared && !clerkModalIsPresent()) {
        observer.disconnect();
        document.body.classList.remove('clerk-auth-dialog-open');
      }
    }, 5500);
  }

  function bindGateGuestActions() {
    document.getElementById('beta-gate-sign-in')?.addEventListener('click', () => openClerkAuthDialog('signIn'));
    document.getElementById('beta-gate-sign-up')?.addEventListener('click', () => openClerkAuthDialog('signUp'));
  }

  function renderGateForGuest() {
    showGate('Sign in with an approved account to enter the private beta.', `
      <button class="auth-nav-button auth-nav-primary" id="beta-gate-sign-in" type="button">Sign in</button>
      <button class="auth-nav-button" id="beta-gate-sign-up" type="button">Create account</button>`);
    bindGateGuestActions();
  }

  function renderGateDenied() {
    showGate('This account is signed in but has not been approved for the private beta.', `
      <button class="auth-nav-button auth-nav-primary" id="beta-gate-sign-out" type="button">Sign out</button>`);
    document.getElementById('beta-gate-sign-out')?.addEventListener('click', () => state.clerk?.signOut({ redirectUrl: '/' }));
  }

  function applyBetaGate(session) {
    if (!state.config?.betaAccessEnabled) return closeGate();
    if (!session?.authenticated) return renderGateForGuest();
    if (!session?.betaAccess?.granted) return renderGateDenied();
    closeGate();
  }

  function deriveClerkDomain(key) {
    try {
      const encoded = String(key || '').split('_')[2] || '';
      return atob(encoded).slice(0, -1);
    } catch (_error) {
      return '';
    }
  }

  function loadScript(src, attributes = {}) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      Object.entries(attributes).forEach(([name, value]) => {
        if (value != null && value !== '') script.setAttribute(name, String(value));
      });
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); }, { once: true });
      script.addEventListener('error', () => reject(new Error(`Unable to load ${src}`)), { once: true });
      document.head.appendChild(script);
    });
  }


  function currentFirstName() {
    // Prefer Clerk's explicit first-name fields. The API display name can fall
    // back to an email address when the account profile has no name, and an
    // email must never be used as a greeting.
    const profile = state.session?.user || state.session?.account || {};
    const clerkUser = state.clerk?.user || {};
    const candidates = [
      clerkUser.firstName,
      clerkUser.first_name,
      profile.firstName,
      profile.first_name,
      profile.givenName,
      profile.given_name,
      clerkUser.fullName,
      clerkUser.full_name,
      profile.displayName,
      profile.display_name,
      profile.fullName,
      profile.full_name,
      profile.name,
      clerkUser.username
    ];

    for (const candidate of candidates) {
      const value = String(candidate || '').trim();
      if (!value || value.includes('@')) continue;
      const first = value.split(/\s+/)[0].replace(/^[^A-Za-z]+|[^A-Za-z'’-]+$/g, '');
      if (first) return first;
    }
    return '';
  }

  function publishAuthState(session = state.session) {
    const profile = session?.user || session?.account || null;
    window.MarkSetGoAuth = {
      clerk: state.clerk,
      session,
      user: profile,
      account: profile,
      refresh: fetchSession,
      getFirstName: currentFirstName
    };
    const detail = { session, firstName: currentFirstName() };
    document.dispatchEvent(new CustomEvent('marksetgo:auth-ready', { detail }));
    window.dispatchEvent(new CustomEvent('marksetgo:auth-ready', { detail }));
  }

  async function fetchSession() {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to load account session.');
    state.session = payload;
    publishAuthState(payload);
    document.dispatchEvent(new CustomEvent('marksetgo:auth-changed', { detail: payload }));
    applyBetaGate(payload);
    return payload;
  }

  function renderGuestControls() {
    setControls(`
      <button class="auth-nav-button" id="auth-sign-in" type="button">Sign in</button>
      <button class="auth-nav-button auth-nav-primary" id="auth-sign-up" type="button">Create account</button>
    `);
    document.getElementById('auth-sign-in')?.addEventListener('click', () => openClerkAuthDialog('signIn'));
    document.getElementById('auth-sign-up')?.addEventListener('click', () => openClerkAuthDialog('signUp'));
  }

  function renderSignedInControls() {
    setControls('<span class="auth-plan-badge">Free</span><span id="clerk-user-button"></span>');
    const node = document.getElementById('clerk-user-button');
    if (node) state.clerk.mountUserButton(node, { afterSignOutUrl: '/' });
  }

  async function initialize() {
    setControls('<span class="auth-status">Account…</span>');
    try {
      const response = await fetch('/api/auth/config', { credentials: 'same-origin' });
      state.config = await response.json();
      if (state.config.betaAccessEnabled) showGate('Checking your access…');
      if (!state.config.configured || !state.config.publishableKey) {
        setControls('<span class="auth-status" title="Authentication has not been configured">Guest</span>');
        state.session = { authenticated: false, planCode: 'guest' };
        publishAuthState(state.session);
        if (state.config.betaAccessEnabled) showGate('Private beta access is unavailable because authentication is not configured.');
        else closeGate();
        return;
      }

      const domain = deriveClerkDomain(state.config.publishableKey);
      if (!domain) throw new Error('The Clerk publishable key is invalid.');
      await loadScript(`https://${domain}/npm/@clerk/ui@1/dist/ui.browser.js`);
      await loadScript(
        `https://${domain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`,
        { 'data-clerk-publishable-key': state.config.publishableKey }
      );
      if (!window.Clerk) throw new Error('Clerk did not initialize.');

      state.clerk = window.Clerk;
      await state.clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
      if (state.clerk.isSignedIn) {
        await fetchSession();
        renderSignedInControls();
      } else {
        state.session = { authenticated: false, planCode: 'guest' };
        publishAuthState(state.session);
        renderGuestControls();
        applyBetaGate(state.session);
      }

      state.clerk.addListener(async ({ user }) => {
        if (user) {
          try { await fetchSession(); } catch (error) { console.error(error); }
          renderSignedInControls();
        } else {
          state.session = { authenticated: false, planCode: 'guest' };
          publishAuthState(state.session);
          renderGuestControls();
          applyBetaGate(state.session);
          document.dispatchEvent(new CustomEvent('marksetgo:auth-changed', { detail: state.session }));
        }
      });
    } catch (error) {
      console.error('Authentication startup failed:', error);
      setControls('<button class="auth-nav-button" id="auth-retry" type="button">Account unavailable</button>');
      if (state.config?.betaAccessEnabled) showGate('Account access could not be initialized. Retry after checking the authentication configuration.');
      document.getElementById('auth-retry')?.addEventListener('click', initialize, { once: true });
    }
  }

  window.addEventListener('DOMContentLoaded', initialize, { once: true });
})();
