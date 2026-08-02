(() => {
  'use strict';

  const state = { clerk: null, config: null, session: null };
  const controls = () => document.getElementById('auth-controls');

  function setControls(html) {
    const node = controls();
    if (node) node.innerHTML = html;
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

  async function fetchSession() {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Unable to load account session.');
    state.session = payload;
    window.MarkSetGoAuth = { clerk: state.clerk, session: payload, refresh: fetchSession };
    document.dispatchEvent(new CustomEvent('marksetgo:auth-changed', { detail: payload }));
    return payload;
  }

  function renderGuestControls() {
    setControls(`
      <button class="auth-nav-button" id="auth-sign-in" type="button">Sign in</button>
      <button class="auth-nav-button auth-nav-primary" id="auth-sign-up" type="button">Create account</button>
    `);
    document.getElementById('auth-sign-in')?.addEventListener('click', () => state.clerk?.openSignIn());
    document.getElementById('auth-sign-up')?.addEventListener('click', () => state.clerk?.openSignUp());
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
      if (!state.config.configured || !state.config.publishableKey) {
        setControls('<span class="auth-status" title="Authentication has not been configured">Guest</span>');
        window.MarkSetGoAuth = { clerk: null, session: { authenticated: false, planCode: 'guest' }, refresh: fetchSession };
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
        window.MarkSetGoAuth = { clerk: state.clerk, session: state.session, refresh: fetchSession };
        renderGuestControls();
      }

      state.clerk.addListener(async ({ user }) => {
        if (user) {
          try { await fetchSession(); } catch (error) { console.error(error); }
          renderSignedInControls();
        } else {
          state.session = { authenticated: false, planCode: 'guest' };
          window.MarkSetGoAuth = { clerk: state.clerk, session: state.session, refresh: fetchSession };
          renderGuestControls();
          document.dispatchEvent(new CustomEvent('marksetgo:auth-changed', { detail: state.session }));
        }
      });
    } catch (error) {
      console.error('Authentication startup failed:', error);
      setControls('<button class="auth-nav-button" id="auth-retry" type="button">Account unavailable</button>');
      document.getElementById('auth-retry')?.addEventListener('click', initialize, { once: true });
    }
  }

  window.addEventListener('DOMContentLoaded', initialize, { once: true });
})();
