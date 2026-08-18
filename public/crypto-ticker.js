(() => {
  'use strict';

  const STORAGE_KEY = 'markSetGoCryptoTickerEnabledV1';
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

  function formatPrice(value) {
    const price = Number(value);
    if (!Number.isFinite(price)) return '—';
    if (price >= 1000) {
      return price.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    }
    if (price >= 1) {
      return price.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return price.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 6 });
  }

  function formatChange(value) {
    const change = Number(value);
    if (!Number.isFinite(change)) return '';
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  }

  function ensureTicker() {
    let ticker = document.getElementById('crypto-market-ticker');
    if (ticker) return ticker;

    const header = document.querySelector('.site-header');
    if (!header?.parentNode) return null;

    ticker = document.createElement('section');
    ticker.id = 'crypto-market-ticker';
    ticker.className = 'crypto-market-ticker';
    ticker.hidden = true;
    ticker.setAttribute('aria-label', 'Cryptocurrency market ticker');
    ticker.innerHTML = `
      <div class="crypto-ticker-label"><strong>Crypto</strong><span>24h</span></div>
      <div class="crypto-ticker-viewport">
        <div class="crypto-ticker-track" id="crypto-ticker-track">
          <span class="crypto-ticker-loading">Loading market prices…</span>
        </div>
      </div>
      <span class="crypto-ticker-provider" title="Market data provider">CoinGecko</span>`;
    header.insertAdjacentElement('afterend', ticker);
    return ticker;
  }

  function renderCoins(payload) {
    const ticker = ensureTicker();
    const track = ticker?.querySelector('#crypto-ticker-track');
    if (!ticker || !track) return;

    const coins = Array.isArray(payload?.coins) ? payload.coins : [];
    if (!coins.length) {
      track.innerHTML = '<span class="crypto-ticker-error">Market prices temporarily unavailable</span>';
      return;
    }

    const items = coins.map((coin) => {
      const change = Number(coin.change24h);
      const direction = Number.isFinite(change) ? (change > 0 ? 'up' : change < 0 ? 'down' : 'flat') : 'flat';
      const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '•';
      return `<span class="crypto-ticker-item" title="${coin.name || coin.symbol}">
        <strong>${coin.symbol}</strong>
        <span>${formatPrice(coin.price)}</span>
        <span class="crypto-ticker-change ${direction}">${arrow} ${formatChange(change)}</span>
      </span>`;
    }).join('');

    // Duplicate the row so wide/desktop layouts can animate as a continuous strip.
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
      const response = await fetch('/api/crypto-ticker', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Market prices are unavailable.');
      renderCoins(payload);
    } catch (error) {
      const track = ticker.querySelector('#crypto-ticker-track');
      if (track && !track.querySelector('.crypto-ticker-item')) {
        track.innerHTML = `<span class="crypto-ticker-error">${error.message || 'Market prices temporarily unavailable'}</span>`;
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
    if (!list || list.querySelector('[data-crypto-ticker-setting]')) return;

    const row = document.createElement('label');
    row.className = 'profile-feature-row';
    row.dataset.cryptoTickerSetting = '1';
    row.innerHTML = `
      <span>
        <strong>Cryptocurrency Ticker</strong>
        <small>Show live BTC, ETH, SOL, XRP, and DOGE prices below the top navigation.</small>
      </span>
      <input type="checkbox" data-crypto-ticker-toggle aria-label="Show cryptocurrency ticker">`;

    const input = row.querySelector('[data-crypto-ticker-toggle]');
    input.checked = readEnabled();

    input.addEventListener('change', () => {
      const persisted = writeEnabled(input.checked);
      syncTicker();

      const status = document.querySelector('#profile-save-status');
      if (status) {
        status.className = `status profile-save-status ${persisted ? 'success' : ''}`;
        status.textContent = persisted
          ? `Cryptocurrency Ticker is ${input.checked ? 'on' : 'off'}.`
          : `Cryptocurrency Ticker is ${input.checked ? 'on' : 'off'} for this session. Browser storage is full, so this choice may not persist.`;
      }
    });

    list.appendChild(row);
  }

  function boot() {
    ensureTicker();
    installSetting();
    syncTicker();

    document.addEventListener('click', (event) => {
      if (!event.target.closest?.('[data-action="profile-preferences"]')) return;
      [0, 80, 220].forEach((delay) => window.setTimeout(installSetting, delay));
    }, true);
    document.addEventListener('marksetgo:experience-profile-changed', () => window.setTimeout(installSetting, 0));

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && readEnabled()) void refreshTicker({ force: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.MarkSetGoCryptoTicker = Object.freeze({
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
