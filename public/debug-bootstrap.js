(() => {
  'use strict';
  const boot = window.__MSG_BOOT_DEBUG = window.__MSG_BOOT_DEBUG || { startedAt:new Date().toISOString(), errors:[], rejections:[], navigation:[] };
  window.addEventListener('error', (event) => {
    boot.errors.push({ at:new Date().toISOString(), message:event.message || 'Script error', source:event.filename || '', line:event.lineno || 0, col:event.colno || 0 });
    if (boot.errors.length > 50) boot.errors.shift();
  });
  window.addEventListener('unhandledrejection', (event) => {
    boot.rejections.push({ at:new Date().toISOString(), message:String(event.reason?.message || event.reason || 'Unhandled rejection') });
    if (boot.rejections.length > 50) boot.rejections.shift();
  });
  document.addEventListener('click', (event) => {
    const el = event.target instanceof Element ? event.target.closest('[data-action],a[href],button') : null;
    if (!el) return;
    boot.navigation.push({ at:new Date().toISOString(), action:el.dataset?.action || '', href:el.getAttribute?.('href') || '', label:(el.textContent || '').replace(/\s+/g,' ').trim().slice(0,120) });
    if (boot.navigation.length > 80) boot.navigation.shift();
  }, true);
})();
