(() => {
  'use strict';

  const STYLE_ID = 'msg-beta-feedback-style';
  const REPORT_ACTION = 'beta-feedback-report';
  const ADMIN_ACTION = 'beta-feedback-admin';
  let screenshotDataUrl = '';
  let captureMethod = '';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .beta-report-button{
        margin-left:10px;display:inline-flex;align-items:center;gap:7px;
        min-height:34px;padding:6px 11px;border:1px solid rgba(255,255,255,.45);
        border-radius:8px;background:rgba(255,255,255,.12);color:inherit;
        font:inherit;font-weight:700;cursor:pointer;white-space:nowrap
      }
      .beta-report-button:hover{background:rgba(255,255,255,.2)}
      .beta-report-badge{font-size:10px;letter-spacing:.08em;text-transform:uppercase;
        padding:2px 5px;border-radius:999px;background:#f1c75b;color:#30230a}
      .beta-feedback-modal{position:fixed;inset:0;z-index:12000;background:rgba(5,13,28,.68);
        display:grid;place-items:center;padding:24px}
      .beta-feedback-card{width:min(760px,96vw);max-height:92vh;overflow:auto;background:#fff;
        color:#172033;border-radius:16px;box-shadow:0 28px 90px rgba(0,0,0,.34);padding:24px}
      .beta-feedback-card h1{margin:0 0 6px;font-size:26px}
      .beta-feedback-card p{color:#586274}
      .beta-feedback-close{float:right;border:0;background:transparent;font-size:26px;cursor:pointer}
      .beta-feedback-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .beta-feedback-card label{display:grid;gap:6px;font-weight:700}
      .beta-feedback-card input,.beta-feedback-card select,.beta-feedback-card textarea{
        width:100%;box-sizing:border-box;border:1px solid #bdc6d3;border-radius:9px;padding:10px 11px;
        font:inherit;color:#172033;background:#fff}
      .beta-feedback-card textarea{min-height:190px;resize:vertical}
      .beta-feedback-shot{border:1px dashed #9aa7b8;border-radius:12px;padding:14px;background:#f7f9fc}
      .beta-feedback-shot-actions{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
      .beta-feedback-shot-preview{max-width:100%;max-height:300px;border-radius:8px;border:1px solid #ccd4df}
      .beta-feedback-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
      .beta-feedback-card button{border-radius:8px;border:1px solid #aab5c4;background:#fff;padding:9px 13px;cursor:pointer;font-weight:700}
      .beta-feedback-card button.primary{background:#173a67;color:#fff;border-color:#173a67}
      .beta-feedback-status{min-height:22px;margin-top:10px;font-weight:700}
      .beta-admin-page{max-width:1180px;margin:0 auto;padding:24px}
      .beta-admin-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:18px 0}
      .beta-admin-toolbar label{display:grid;gap:5px;font-weight:700}
      .beta-admin-toolbar input,.beta-admin-toolbar select{padding:8px 10px;border:1px solid #b9c4d2;border-radius:8px}
      .beta-admin-list{display:grid;gap:12px}
      .beta-admin-item{border:1px solid #cfd7e2;border-radius:12px;background:#fff;padding:16px;color:#182436}
      .beta-admin-item-head{display:flex;gap:10px;justify-content:space-between;align-items:flex-start}
      .beta-admin-item-meta{font-size:12px;color:#667284;margin:7px 0 12px}
      .beta-admin-item-description{white-space:pre-wrap}
      .beta-admin-controls{display:grid;grid-template-columns:160px 160px 1fr auto;gap:10px;align-items:end;margin-top:14px}
      .beta-admin-controls label{display:grid;gap:5px;font-weight:700}
      .beta-admin-controls select,.beta-admin-controls textarea{padding:8px;border:1px solid #b9c4d2;border-radius:8px;font:inherit}
      .beta-admin-controls textarea{min-height:72px}
      .beta-admin-shot{display:block;max-width:420px;max-height:260px;margin-top:12px;border-radius:8px;border:1px solid #cbd3de}
      .beta-pill{display:inline-block;border-radius:999px;background:#eef2f7;padding:3px 8px;font-size:12px;font-weight:800;text-transform:uppercase}
      @media(max-width:760px){
        .beta-feedback-grid{grid-template-columns:1fr}
        .beta-admin-controls{grid-template-columns:1fr}
        .beta-report-badge{display:none}
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
      .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
    return payload;
  }

  function addReportButton() {
    const brand = document.querySelector('.site-header .brand');
    if (!brand || document.querySelector('[data-beta-report]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'beta-report-button';
    button.dataset.betaReport = '1';
    button.innerHTML = '<span>🐛 Report issue</span><span class="beta-report-badge">Beta</span>';
    brand.insertAdjacentElement('afterend', button);
    button.addEventListener('click', openReportDialog);
  }

  async function refreshAdminMenu() {
    let isAdmin = false;
    try {
      isAdmin = Boolean((await api('/api/beta-feedback/admin-status')).admin);
    } catch (_) {}
    let button = document.querySelector('[data-beta-admin-nav]');
    if (!isAdmin) {
      button?.remove();
      return;
    }
    if (button) return;
    const nav = document.querySelector('.site-header nav');
    const profile = nav?.querySelector('[data-action="profile-preferences"]');
    if (!nav) return;
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'top-level-nav-button';
    button.dataset.betaAdminNav = '1';
    button.innerHTML = '<span class="nav-icon" aria-hidden="true">⚙</span> Admin';
    (profile || nav.lastElementChild)?.insertAdjacentElement(profile ? 'afterend' : 'beforebegin', button);
    button.addEventListener('click', renderAdminPage);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) return reject(new Error('Use a PNG, JPEG, or WEBP screenshot.'));
      if (file.size > 5 * 1024 * 1024) return reject(new Error('Screenshot must be 5 MB or smaller.'));
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read the screenshot.'));
      reader.readAsDataURL(file);
    });
  }

  async function captureScreen() {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen capture is not supported in this browser.');
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    try {
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const scale = Math.min(1, 1600 / width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.82);
    } finally {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  function updatePreview(modal) {
    const preview = modal.querySelector('#beta-feedback-preview');
    const remove = modal.querySelector('#beta-feedback-remove-shot');
    if (screenshotDataUrl) {
      preview.src = screenshotDataUrl;
      preview.hidden = false;
      remove.hidden = false;
    } else {
      preview.removeAttribute('src');
      preview.hidden = true;
      remove.hidden = true;
    }
  }

  function openReportDialog() {
    document.querySelector('.beta-feedback-modal')?.remove();
    screenshotDataUrl = '';
    captureMethod = '';

    const modal = document.createElement('div');
    modal.className = 'beta-feedback-modal';
    modal.innerHTML = `
      <section class="beta-feedback-card" role="dialog" aria-modal="true" aria-labelledby="beta-feedback-title">
        <button type="button" class="beta-feedback-close" aria-label="Close">×</button>
        <h1 id="beta-feedback-title">Report a beta issue</h1>
        <p>Tell me what happened. A screenshot is optional but very helpful.</p>

        <div class="beta-feedback-grid">
          <label>Type
            <select id="beta-feedback-type">
              <option value="bug">Bug / something is broken</option>
              <option value="feature">Feature request</option>
              <option value="general">General feedback</option>
            </select>
          </label>
          <label>Short title
            <input id="beta-feedback-short-title" maxlength="180" placeholder="Example: Reader closes when I change themes">
          </label>
        </div>

        <label style="margin-top:14px">What happened / what would you like?
          <textarea id="beta-feedback-description" required placeholder="Please include what you were doing, what you expected, and what happened instead."></textarea>
        </label>

        <section class="beta-feedback-shot" style="margin-top:14px">
          <strong>Screenshot (optional)</strong>
          <div class="beta-feedback-shot-actions">
            <button type="button" id="beta-feedback-capture">Capture screen</button>
            <label style="display:inline-flex;align-items:center">
              <span class="beta-feedback-card button" style="display:none"></span>
              <input id="beta-feedback-file" type="file" accept="image/png,image/jpeg,image/webp">
            </label>
            <button type="button" id="beta-feedback-remove-shot" hidden>Remove screenshot</button>
          </div>
          <p style="margin:6px 0 10px">You can also paste a screenshot here with Ctrl+V.</p>
          <img id="beta-feedback-preview" class="beta-feedback-shot-preview" alt="Screenshot preview" hidden>
        </section>

        <div class="beta-feedback-status" id="beta-feedback-status" aria-live="polite"></div>
        <div class="beta-feedback-actions">
          <button type="button" class="beta-feedback-cancel">Cancel</button>
          <button type="button" class="primary" id="beta-feedback-submit">Send report</button>
        </div>
      </section>`;

    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.beta-feedback-close').addEventListener('click', close);
    modal.querySelector('.beta-feedback-cancel').addEventListener('click', close);
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });

    modal.querySelector('#beta-feedback-file').addEventListener('change', async (event) => {
      const status = modal.querySelector('#beta-feedback-status');
      try {
        screenshotDataUrl = await fileToDataUrl(event.target.files?.[0]);
        captureMethod = 'file';
        status.textContent = 'Screenshot attached.';
        updatePreview(modal);
      } catch (error) { status.textContent = error.message; }
    });

    modal.querySelector('#beta-feedback-capture').addEventListener('click', async () => {
      const status = modal.querySelector('#beta-feedback-status');
      status.textContent = 'Choose the tab, window, or screen to capture…';
      try {
        screenshotDataUrl = await captureScreen();
        captureMethod = 'screen-capture';
        status.textContent = 'Screen captured.';
        updatePreview(modal);
      } catch (error) {
        status.textContent = error.name === 'NotAllowedError' ? 'Screen capture was canceled.' : error.message;
      }
    });

    modal.querySelector('#beta-feedback-remove-shot').addEventListener('click', () => {
      screenshotDataUrl = '';
      captureMethod = '';
      updatePreview(modal);
    });

    modal.addEventListener('paste', async (event) => {
      const image = [...(event.clipboardData?.items || [])].find((item) => item.type.startsWith('image/'));
      if (!image) return;
      const status = modal.querySelector('#beta-feedback-status');
      try {
        screenshotDataUrl = await fileToDataUrl(image.getAsFile());
        captureMethod = 'clipboard';
        status.textContent = 'Pasted screenshot attached.';
        updatePreview(modal);
      } catch (error) { status.textContent = error.message; }
    });

    modal.querySelector('#beta-feedback-submit').addEventListener('click', async () => {
      const status = modal.querySelector('#beta-feedback-status');
      const submit = modal.querySelector('#beta-feedback-submit');
      const description = modal.querySelector('#beta-feedback-description').value.trim();
      if (!description) {
        status.textContent = 'Please describe the issue or request.';
        return;
      }
      submit.disabled = true;
      status.textContent = 'Sending…';
      try {
        await api('/api/beta-feedback', {
          method: 'POST',
          body: JSON.stringify({
            type: modal.querySelector('#beta-feedback-type').value,
            title: modal.querySelector('#beta-feedback-short-title').value.trim(),
            description,
            screenshotDataUrl,
            captureMethod,
            url: location.href,
            viewKey: document.querySelector('#app')?.dataset?.viewKey || '',
            userAgent: navigator.userAgent,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            appVersion: document.querySelector('.site-footer small')?.textContent || ''
          })
        });
        status.textContent = 'Thank you — your report was saved.';
        setTimeout(close, 900);
      } catch (error) {
        status.textContent = error.message;
        submit.disabled = false;
      }
    });
  }

  async function renderAdminPage() {
    const app = document.querySelector('#app');
    if (!app) return;
    app.dataset.viewKey = 'beta-feedback-admin';
    app.innerHTML = `
      <section class="beta-admin-page">
        <header class="platform-hero">
          <div><span class="source-category">Private beta</span><h1>Beta feedback admin</h1>
          <p>Review bugs, feature requests, screenshots, and status.</p></div>
        </header>
        <div class="beta-admin-toolbar">
          <label>Status<select id="beta-admin-status">
            <option value="">All</option><option value="new">New</option><option value="reviewing">Reviewing</option>
            <option value="planned">Planned</option><option value="in_progress">In progress</option>
            <option value="completed">Completed</option><option value="closed">Closed</option>
          </select></label>
          <label>Type<select id="beta-admin-type">
            <option value="">All</option><option value="bug">Bugs</option><option value="feature">Features</option>
            <option value="general">General</option>
          </select></label>
          <label>Search<input id="beta-admin-search" placeholder="Search feedback"></label>
          <button type="button" id="beta-admin-refresh">Refresh</button>
        </div>
        <div id="beta-admin-message" class="status">Loading…</div>
        <div id="beta-admin-list" class="beta-admin-list"></div>
      </section>`;

    const load = async () => {
      const list = app.querySelector('#beta-admin-list');
      const message = app.querySelector('#beta-admin-message');
      message.textContent = 'Loading…';
      const params = new URLSearchParams();
      const status = app.querySelector('#beta-admin-status').value;
      const type = app.querySelector('#beta-admin-type').value;
      const q = app.querySelector('#beta-admin-search').value.trim();
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      if (q) params.set('q', q);

      try {
        const payload = await api(`/api/admin/beta-feedback?${params}`);
        const items = payload.feedback || [];
        message.textContent = `${items.length} report${items.length === 1 ? '' : 's'}`;
        list.innerHTML = items.length ? items.map((item) => `
          <article class="beta-admin-item" data-feedback-id="${escapeHtml(item.id)}">
            <div class="beta-admin-item-head">
              <div>
                <span class="beta-pill">${escapeHtml(item.feedback_type)}</span>
                <h2>${escapeHtml(item.title || '(No title)')}</h2>
              </div>
              <span class="beta-pill">${escapeHtml(item.status)}</span>
            </div>
            <div class="beta-admin-item-meta">
              ${escapeHtml(item.reporter_name || item.reporter_email || 'Beta user')} ·
              ${escapeHtml(new Date(item.created_at).toLocaleString())}
              ${item.metadata?.url ? ` · ${escapeHtml(item.metadata.url)}` : ''}
            </div>
            <div class="beta-admin-item-description">${escapeHtml(item.description)}</div>
            ${item.has_screenshot ? `<img class="beta-admin-shot" loading="lazy" src="/api/admin/beta-feedback/${encodeURIComponent(item.id)}/screenshot" alt="Submitted screenshot">` : ''}
            <div class="beta-admin-controls">
              <label>Status<select data-admin-status>
                ${['new','reviewing','planned','in_progress','completed','closed'].map(v => `<option value="${v}" ${v===item.status?'selected':''}>${v.replace('_',' ')}</option>`).join('')}
              </select></label>
              <label>Priority<select data-admin-priority>
                ${['low','normal','high','critical'].map(v => `<option value="${v}" ${v===item.priority?'selected':''}>${v}</option>`).join('')}
              </select></label>
              <label>Admin notes<textarea data-admin-notes placeholder="Private notes">${escapeHtml(item.admin_notes || '')}</textarea></label>
              <button type="button" data-admin-save>Save</button>
            </div>
            <div class="status" data-admin-item-status></div>
          </article>`).join('') : '<p>No feedback matches these filters.</p>';

        list.querySelectorAll('[data-admin-save]').forEach((button) => {
          button.addEventListener('click', async () => {
            const item = button.closest('[data-feedback-id]');
            const itemStatus = item.querySelector('[data-admin-item-status]');
            itemStatus.textContent = 'Saving…';
            try {
              await api(`/api/admin/beta-feedback/${encodeURIComponent(item.dataset.feedbackId)}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  status: item.querySelector('[data-admin-status]').value,
                  priority: item.querySelector('[data-admin-priority]').value,
                  adminNotes: item.querySelector('[data-admin-notes]').value
                })
              });
              itemStatus.textContent = 'Saved.';
            } catch (error) { itemStatus.textContent = error.message; }
          });
        });
      } catch (error) {
        message.textContent = error.message;
        list.innerHTML = '';
      }
    };

    app.querySelector('#beta-admin-refresh').addEventListener('click', load);
    app.querySelector('#beta-admin-status').addEventListener('change', load);
    app.querySelector('#beta-admin-type').addEventListener('change', load);
    app.querySelector('#beta-admin-search').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') load();
    });
    load();
  }

  function initialize() {
    injectStyles();
    addReportButton();
    refreshAdminMenu();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }

  document.addEventListener('marksetgo:auth-changed', refreshAdminMenu);
  window.MarkSetGoBetaFeedback = { openReportDialog, renderAdminPage, refreshAdminMenu };
})();
