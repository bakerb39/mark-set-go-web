(() => {
  'use strict';

  const firstName = () => {
    const auth = window.MarkSetGoAuth || {};
    const session = auth.session || {};
    const profile = session.user || session.account || auth.user || auth.account || {};
    const clerkUser = auth.clerk?.user || {};
    const candidates = [
      auth.getFirstName?.(),
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
  };

  const greeting = () => {
    const hour = new Date().getHours();
    const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const name = firstName();
    return `${salutation}${name ? `, ${name}` : ''}.`;
  };

  function applyPersonalization(root = document) {
    const name = firstName();

    root.querySelectorAll?.('[data-askmark-greeting]').forEach((node) => {
      node.textContent = greeting();
    });

    const libraryName = root.querySelector?.('#library-welcome-name');
    if (libraryName) libraryName.textContent = name ? `, ${name}` : '';

    if (name) {
      root.querySelectorAll?.('.askmark-message.user-message > div > span').forEach((node) => {
        if (node.textContent.trim() === 'You' || node.dataset.personalizedUser === 'true') {
          node.textContent = name;
          node.dataset.personalizedUser = 'true';
        }
      });
    }
  }

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      applyPersonalization();
    });
  }

  document.addEventListener('marksetgo:auth-ready', scheduleApply);
  document.addEventListener('marksetgo:auth-changed', scheduleApply);
  window.addEventListener('marksetgo:auth-ready', scheduleApply);
  document.addEventListener('DOMContentLoaded', scheduleApply, { once: true });

  document.addEventListener('marksetgo:library-rendered', scheduleApply);
  document.addEventListener('marksetgo:document-available', () => window.setTimeout(scheduleApply, 0));
  document.addEventListener('marksetgo:experience-profile-changed', scheduleApply);
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-action],[data-read]')) window.setTimeout(scheduleApply, 0);
  }, true);

  [100, 500, 1200, 2500].forEach((delay) => window.setTimeout(scheduleApply, delay));
})();
