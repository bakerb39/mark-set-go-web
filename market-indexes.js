(() => {
  'use strict';

  const STORAGE_KEY = 'markSetGoMarketIndexesEnabledV1';
  const REFRESH_MS = 60 * 1000;
  let sessionEnabled = false;
  let refreshTimer = null;
  let lastFetchAt = 0;

  function readEnabled() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch {}
    return sessionEnabled;
  }

  function writeEnabled(enabled) {
    sessionEnabled = Boolean(enabled);
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
      return true;
    } catch {
      return false;
    }
  }

  function formatValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return number.toLocaleString('en-US', {
      minimumFractionDigits: number >= 10000 ? 0 : 2,
      maximumFractionDigits: 2
    });
  }

  function formatChange(value) {
    const change = Number(value);
    if (!Number.isFinite(change)) return '';
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  }

  function ensureTicker() {
    let ticker = document.getElementById('market-index-ticker');
    if (ticker) return ticker;

    const header = document.querySelector('.site-header');
    if (!header?.parentNode) return null;

    ticker = document.createElement('section');
    ticker.id = 'market-index-ticker';
    ticker.className = 'crypto-market-ticker market-index-ticker';
    ticker.hidden = true;
    ticker.setAttribute('aria-label', 'Major stock market indexes');
    ticker.innerHTML = `
      <div class="crypto-ticker-label"><strong>Indexes</strong><span>Daily</span></div>
      <div class="crypto-ticker-viewport">
        <div class="crypto-ticker-track" id="market-index-track">
          <span class="crypto-ticker-loading">Loading market indexes…</span>
        </div>
      </div>
      <span class="crypto-ticker-provider" title="Market data provider">Yahoo Finance</span>`;

    const cryptoTicker = document.getElementById('crypto-market-ticker');
    if (cryptoTicker?.parentNode) {
      cryptoTicker.insertAdjacentElement('afterend', ticker);
    } else {
      header.insertAdjacentElement('afterend', ticker);
    }

    return ticker;
  }

  function renderIndexes(payload) {
    const ticker = ensureTicker();
    const track = ticker?.querySelector('#market-index-track');
    if (!ticker || !track) return;

    const indexes = Array.isArray(payload?.indexes) ? payload.indexes : [];
    if (!indexes.length) {
      track.innerHTML = '<span class="crypto-ticker-error">Market indexes temporarily unavailable</span>';
      return;
    }

    const items = indexes.map((item) => {
      const change = Number(item.change24h);
      const direction = Number.isFinite(change) ? (change > 0 ? 'up' : change < 0 ? 'down' : 'flat') : 'flat';
      const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '•';
      return `<span class="crypto-ticker-item" title="${item.label || item.short}">
        <strong>${item.short}</strong>
        <span>${formatValue(item.value)}</span>
        <span class="crypto-ticker-change ${direction}">${arrow} ${formatChange(change)}</span>
      </span>`;
    }).join('');

    track.innerHTML = `<span class="crypto-ticker-set">${items}</span><span class="crypto-ticker-set" aria-hidden="true">${items}</span>`;
    track.classList.toggle('is-stale', Boolean(payload?.stale));
  }

  async function refreshTicker({ force = false } = {}) {
    if (!readEnabled()) return;
    const now = Date.now();
    if (!force && now - lastFetchAt < 15000) return;
    lastFetchAt = now;

    const ticker = ensureTicker();
    if (!ticker) return;
    ticker.hidden = false;

    try {
      const response = await fetch('/api/market-indexes', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Market indexes are unavailable.');
      renderIndexes(payload);
    } catch (error) {
      const track = ticker.querySelector('#market-index-track');
      if (track && !track.querySelector('.crypto-ticker-item')) {
        track.innerHTML = `<span class="crypto-ticker-error">${error.message || 'Market indexes temporarily unavailable'}</span>`;
      }
    }
  }

  function stopRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function syncTicker() {
    const enabled = readEnabled();
    const ticker = ensureTicker();
    if (!ticker) return;

    ticker.hidden = !enabled;
    stopRefresh();

    if (enabled) {
      void refreshTicker({ force: true });
      refreshTimer = window.setInterval(() => {
        if (!document.hidden) void refreshTicker();
      }, REFRESH_MS);
    }
  }

  function installSetting() {
    const list = document.querySelector('#app .profile-feature-list');
    if (!list || list.querySelector('[data-market-indexes-setting]')) return;

    const row = document.createElement('label');
    row.className = 'profile-feature-row';
    row.dataset.marketIndexesSetting = '1';
    row.innerHTML = `
      <span>
        <strong>Major Stock Indexes</strong>
        <small>Show the S&P 500, Dow, Nasdaq Composite, and Russell 2000 below the top navigation.</small>
      </span>
      <input type="checkbox" data-market-indexes-toggle aria-label="Show major stock indexes">`;

    const input = row.querySelector('[data-market-indexes-toggle]');
    input.checked = readEnabled();

    input.addEventListener('change', () => {
      const persisted = writeEnabled(input.checked);
      syncTicker();

      const status = document.querySelector('#profile-save-status');
      if (status) {
        status.className = `status profile-save-status ${persisted ? 'success' : ''}`;
        status.textContent = persisted
          ? `Major Stock Indexes is ${input.checked ? 'on' : 'off'}.`
          : `Major Stock Indexes is ${input.checked ? 'on' : 'off'} for this session. Browser storage is full, so this choice may not persist.`;
      }
    });

    list.appendChild(row);
  }

  function boot() {
    ensureTicker();
    installSetting();
    syncTicker();

    const app = document.getElementById('app');
    if (app) {
      new MutationObserver(() => installSetting()).observe(app, {
        childList: true,
        subtree: true
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && readEnabled()) void refreshTicker({ force: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.MarkSetGoMarketIndexes = Object.freeze({
    enabled: readEnabled,
    setEnabled(enabled) {
      writeEnabled(Boolean(enabled));
      syncTicker();
    },
    refresh() {
      return refreshTicker({ force: true });
    }
  });
})();
(() => {
  const href = '/explorer-theme.css?v=1.0.0';
  if (!document.querySelector(`link[href^="/explorer-theme.css"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
})();

(() => {
  'use strict';

  const STORAGE_KEY = 'markSetGoVisualThemeV1';
  const ROOT_ATTRIBUTE = 'data-msg-experience-theme';
  const EXPLORER = 'explorer';
  const DEFAULT = 'default';
  let sessionTheme = DEFAULT;

  function normalize(value) {
    return String(value || '').toLowerCase() === EXPLORER ? EXPLORER : DEFAULT;
  }

  function readTheme() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return normalize(stored);
    } catch {}
    return normalize(sessionTheme);
  }

  function writeTheme(value) {
    const theme = normalize(value);
    sessionTheme = theme;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
    return theme;
  }

  function updateThemeButtons(theme = readTheme()) {
    document.querySelectorAll('[data-visual-theme-option]').forEach((button) => {
      const active = normalize(button.dataset.visualThemeOption) === theme;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      const check = button.querySelector('.profile-preset-check');
      if (check) check.textContent = active ? '✓' : '';
    });
  }

  function applyTheme(value = readTheme()) {
    const theme = normalize(value);
    const root = document.documentElement;
    if (theme === EXPLORER) root.setAttribute(ROOT_ATTRIBUTE, EXPLORER);
    else root.removeAttribute(ROOT_ATTRIBUTE);
    root.classList.toggle('msg-explorer-theme', theme === EXPLORER);
    updateThemeButtons(theme);
    window.dispatchEvent(new CustomEvent('marksetgo:visual-theme-change', { detail: { theme } }));
    return theme;
  }

  function setTheme(value) {
    const theme = writeTheme(value);
    applyTheme(theme);
    return theme;
  }

  function announce(theme) {
    const status = document.querySelector('#profile-save-status');
    if (!status) return;
    status.className = 'status profile-save-status success';
    status.textContent = theme === EXPLORER
      ? 'Explorer / Discovery appearance is on.'
      : 'Default appearance is on.';
  }

  function installProfileControls() {
    const page = document.querySelector('#app .profile-preferences-page');
    if (!page || page.querySelector('[data-visual-theme-card]')) return;

    const current = readTheme();
    const card = document.createElement('section');
    card.className = 'profile-preset-card visual-theme-profile-card';
    card.dataset.visualThemeCard = '1';
    card.innerHTML = `
      <div class="section-heading visual-theme-heading">
        <div>
          <span class="source-category">Appearance</span>
          <h2>Choose an experience style</h2>
          <p>Change the atmosphere of the app without changing your reader settings or features.</p>
        </div>
      </div>
      <div class="visual-theme-grid" role="group" aria-label="Experience style">
        <button class="profile-preset-option visual-theme-option ${current === DEFAULT ? 'active' : ''}" type="button" data-visual-theme-option="default" aria-pressed="${current === DEFAULT}">
          <span class="profile-preset-check" aria-hidden="true">${current === DEFAULT ? '✓' : ''}</span>
          <span class="visual-theme-preview visual-theme-preview-default" aria-hidden="true">
            <span></span><span></span><span></span>
          </span>
          <strong>Default</strong>
          <small>The current Mark, Set, Go! navy, blue, and white presentation.</small>
        </button>
        <button class="profile-preset-option visual-theme-option visual-theme-option-explorer ${current === EXPLORER ? 'active' : ''}" type="button" data-visual-theme-option="explorer" aria-pressed="${current === EXPLORER}">
          <span class="profile-preset-check" aria-hidden="true">${current === EXPLORER ? '✓' : ''}</span>
          <span class="visual-theme-preview visual-theme-preview-explorer" aria-hidden="true">
            <span class="visual-theme-compass">✦</span>
          </span>
          <strong>Explorer / Discovery</strong>
          <small>Sage green, parchment, brass, maps, mountains, and waterfall scenery.</small>
        </button>
      </div>
      <p class="visual-theme-note">Explorer styles the surrounding application. The actual reading canvas stays optimized for readability.</p>`;

    const presetCard = page.querySelector('.profile-preset-card');
    if (presetCard) presetCard.insertAdjacentElement('afterend', card);
    else page.prepend(card);

    card.querySelectorAll('[data-visual-theme-option]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        const theme = setTheme(button.dataset.visualThemeOption);
        announce(theme);
      });
    });

    updateThemeButtons(current);
  }

  function scheduleProfileInstall() {
    requestAnimationFrame(() => requestAnimationFrame(installProfileControls));
  }

  // No MutationObserver: Profile is rendered synchronously by the existing
  // navigation action, so install once immediately after that action runs.
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="profile-preferences"]')) scheduleProfileInstall();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyTheme();
      installProfileControls();
    }, { once: true });
  } else {
    applyTheme();
    installProfileControls();
  }

  window.MarkSetGoVisualTheme = Object.freeze({
    get: readTheme,
    set: setTheme,
    apply: applyTheme,
    installProfileControls
  });
})();
