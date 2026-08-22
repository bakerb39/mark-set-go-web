/* Mark, Set, Go! Explorer Designer enhancements v3.9
   - Complete UI width + scale only
   - Removes obsolete Reader scenery controls
   - Reliable Export + Copy JSON
   No MutationObserver.
*/
(() => {
  'use strict';

  const DESIGN_STORAGE_KEY = 'markSetGoExplorerVisualDesignerV2';
  const UI_STORAGE_KEY = 'markSetGoExplorerCompleteUIV3';
  const EXPORT_NAME = 'mark-set-go-explorer-design-v2.json';
  const OBSOLETE_SCENERY_KEYS = new Set(['left-art', 'right-art', 'top-art']);

  let uiConfig = {
    enabled: false,
    width: 100,
    scale: 100
  };

  function designerPanel() {
    return document.querySelector('#msg-explorer-visual-designer');
  }

  function appShell() {
    return document.querySelector('#app.app-shell');
  }

  function setStatus(message, saved = false) {
    const node = designerPanel()?.querySelector('[data-vd-status]');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('is-saved', Boolean(saved));
  }

  function loadUiConfig() {
    try {
      const parsed = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || 'null');
      if (parsed && typeof parsed === 'object') uiConfig = { ...uiConfig, ...parsed };
    } catch {}
  }

  function saveUiConfig() {
    try { localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(uiConfig)); } catch {}
  }

  function clearCompleteUiStyles() {
    const shell = appShell();
    if (!shell) return;
    ['width','max-width','margin-left','margin-right','zoom'].forEach(prop => {
      shell.style.removeProperty(prop);
    });
  }

  function applyCompleteUi() {
    const shell = appShell();
    if (!shell) return false;

    if (!uiConfig.enabled) {
      clearCompleteUiStyles();
      return true;
    }

    const width = Math.max(55, Math.min(100, Number(uiConfig.width) || 100));
    const scale = Math.max(70, Math.min(115, Number(uiConfig.scale) || 100));

    shell.style.setProperty('width', `${width}%`, 'important');
    shell.style.setProperty('max-width', 'none', 'important');
    shell.style.setProperty('margin-left', 'auto', 'important');
    shell.style.setProperty('margin-right', 'auto', 'important');
    shell.style.setProperty('zoom', String(scale / 100), 'important');
    return true;
  }

  function activateAndApply() {
    uiConfig.enabled = true;
    saveUiConfig();
    applyCompleteUi();
    window.dispatchEvent(new Event('resize'));
  }

  function completeUiMarkup() {
    return `
      <section class="msg-vd-section" data-vd-complete-ui>
        <div class="msg-vd-section-title">
          <span>Complete UI</span>
          <span>Reader + workspace pane</span>
        </div>

        <div class="msg-vd-control">
          <label>Whole interface width</label>
          <output class="msg-vd-control-output" data-vd-complete-output="width">${Math.round(uiConfig.width)}%</output>
          <input type="range" min="55" max="100" step="1"
                 value="${Number(uiConfig.width) || 100}"
                 data-vd-complete-control="width">
        </div>

        <div class="msg-vd-control">
          <label>Overall interface scale</label>
          <output class="msg-vd-control-output" data-vd-complete-output="scale">${Math.round(uiConfig.scale)}%</output>
          <input type="range" min="70" max="115" step="1"
                 value="${Number(uiConfig.scale) || 100}"
                 data-vd-complete-control="scale">
        </div>

        <div class="msg-vd-complete-actions">
          <button type="button" data-vd-complete-reset>Reset Complete UI</button>
        </div>
      </section>`;
  }

  function createCompleteUiSection() {
    const holder = document.createElement('div');
    holder.innerHTML = completeUiMarkup().trim();
    const section = holder.firstElementChild;

    section.querySelectorAll('[data-vd-complete-control]').forEach(input => {
      input.addEventListener('input', () => {
        const key = input.dataset.vdCompleteControl;
        uiConfig[key] = Number(input.value);

        const output = section.querySelector(`[data-vd-complete-output="${key}"]`);
        if (output) output.textContent = `${Math.round(Number(uiConfig[key]) || 0)}%`;

        activateAndApply();
        setStatus('Complete UI settings updated.', false);
      });
    });

    section.querySelector('[data-vd-complete-reset]')?.addEventListener('click', () => {
      uiConfig = { enabled:false, width:100, scale:100 };
      try { localStorage.removeItem(UI_STORAGE_KEY); } catch {}
      clearCompleteUiStyles();
      section.replaceWith(createCompleteUiSection());
      window.dispatchEvent(new Event('resize'));
      setStatus('Complete UI overrides removed.', false);
    });

    return section;
  }

  function installCompleteUiSection() {
    const panel = designerPanel();
    if (!panel) return false;
    if (panel.querySelector('[data-vd-complete-ui]')) return true;

    const scroll = panel.querySelector('.msg-vd-scroll');
    if (!scroll) return false;

    scroll.insertBefore(createCompleteUiSection(), scroll.firstElementChild || null);
    return true;
  }

  function removeObsoleteSceneryControls() {
    const panel = designerPanel();
    if (!panel) return false;

    const labels = ['Left scenery', 'Right scenery', 'Top panorama'];
    panel.querySelectorAll('[data-vd-layer]').forEach(button => {
      const text = String(button.textContent || '').trim();
      if (labels.includes(text)) button.remove();
    });

    return true;
  }

  function scrubObsoleteSceneryFromSavedDesign() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DESIGN_STORAGE_KEY) || 'null');
      if (!parsed?.targets || typeof parsed.targets !== 'object') return;
      let changed = false;

      for (const key of OBSOLETE_SCENERY_KEYS) {
        if (Object.prototype.hasOwnProperty.call(parsed.targets, key)) {
          delete parsed.targets[key];
          changed = true;
        }
      }

      if (changed) localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(parsed));
    } catch {}
  }

  /* ---------------- reliable export ---------------- */

  function saveLiveDesignerState() {
    designerPanel()?.querySelector('[data-vd-save]')?.click();
    scrubObsoleteSceneryFromSavedDesign();
  }

  function readCurrentConfig() {
    saveLiveDesignerState();

    let design = null;
    try {
      design = JSON.parse(localStorage.getItem(DESIGN_STORAGE_KEY) || 'null');
    } catch {}

    if (!design || typeof design !== 'object') {
      throw new Error('Could not read the current Explorer design.');
    }

    if (design.targets && typeof design.targets === 'object') {
      for (const key of OBSOLETE_SCENERY_KEYS) delete design.targets[key];
    }

    return {
      ...design,
      completeUI: { ...uiConfig }
    };
  }

  function currentConfigText() {
    return JSON.stringify(readCurrentConfig(), null, 2);
  }

  async function copyJson() {
    try {
      const text = currentConfigText();

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setStatus('Design JSON copied to clipboard.', true);
        return true;
      }

      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();

      const copied = document.execCommand('copy');
      textarea.remove();

      if (!copied) throw new Error('Clipboard copy was blocked.');
      setStatus('Design JSON copied to clipboard.', true);
      return true;
    } catch (error) {
      setStatus(`Copy failed: ${error.message}`, false);
      return false;
    }
  }

  async function exportJson() {
    let text;
    try {
      text = currentConfigText();
    } catch (error) {
      setStatus(error.message, false);
      return false;
    }

    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: EXPORT_NAME,
          types: [{
            description: 'JSON design file',
            accept: { 'application/json': ['.json'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        setStatus(`Exported ${EXPORT_NAME}.`, true);
        return true;
      } catch (error) {
        if (error?.name === 'AbortError') {
          setStatus('Export canceled.', false);
          return false;
        }
      }
    }

    try {
      const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = EXPORT_NAME;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);

      anchor.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      }));

      window.setTimeout(() => {
        anchor.remove();
        URL.revokeObjectURL(url);
      }, 2500);

      setStatus(`Export requested for ${EXPORT_NAME}. If blocked, use Copy JSON.`, true);
      return true;
    } catch (error) {
      setStatus(`Download failed: ${error.message}. Use Copy JSON.`, false);
      return false;
    }
  }

  function installExportControls() {
    const panel = designerPanel();
    if (!panel) return false;

    const exportButton = panel.querySelector('[data-vd-export]');
    const toolbar = exportButton?.parentElement;
    if (!exportButton || !toolbar) return false;

    let copyButton = toolbar.querySelector('[data-vd-copy-json]');
    if (!copyButton) {
      copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.dataset.vdCopyJson = '1';
      copyButton.textContent = 'Copy JSON';
      exportButton.insertAdjacentElement('afterend', copyButton);
      copyButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        copyJson();
      });
    }
    return true;
  }

  document.addEventListener('click', event => {
    const exportButton = event.target instanceof Element
      ? event.target.closest('#msg-explorer-visual-designer [data-vd-export]')
      : null;
    if (!exportButton) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    exportJson();
  }, true);

  function installAll() {
    installCompleteUiSection();
    installExportControls();
    removeObsoleteSceneryControls();
  }

  function installSoon() {
    [0,40,120,350,900].forEach(delay => window.setTimeout(installAll, delay));
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('#msg-explorer-design-launcher')) installSoon();
  }, true);

  loadUiConfig();
  scrubObsoleteSceneryFromSavedDesign();

  if (uiConfig.enabled) window.setTimeout(applyCompleteUi, 0);
  else clearCompleteUiStyles();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installSoon, { once:true });
  } else {
    installSoon();
  }

  window.MSGExplorerDesignerEnhancements = Object.freeze({
    export: exportJson,
    copy: copyJson,
    applyCompleteUi
  });
})();
