/* Mark, Set, Go! Explorer Designer enhancements v3.7
   - Reliable Export / Copy JSON
   - Complete UI controls for Reader + workspace/right pane
   - Background control for the outer app shell
   No MutationObserver.
*/
(() => {
  'use strict';

  const DESIGN_STORAGE_KEY = 'markSetGoExplorerVisualDesignerV2';
  const UI_STORAGE_KEY = 'markSetGoExplorerCompleteUIV1';
  const EXPORT_NAME = 'mark-set-go-explorer-design-v2.json';

  const DEFAULT_UI = {
    width: 100,
    scale: 100,
    background: '#fffdf6',
    transparent: false
  };

  function panel() {
    return document.querySelector('#msg-explorer-visual-designer');
  }

  function appShell() {
    return document.querySelector('#app.app-shell');
  }

  function status(message, saved = false) {
    const node = panel()?.querySelector('[data-vd-status]');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('is-saved', Boolean(saved));
  }

  function loadUiConfig() {
    try {
      const parsed = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || 'null');
      return { ...DEFAULT_UI, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
    } catch {
      return { ...DEFAULT_UI };
    }
  }

  function saveUiConfig(config) {
    try { localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(config)); } catch {}
  }

  let uiConfig = loadUiConfig();

  function applyCompleteUi() {
    const shell = appShell();
    if (!shell) return false;

    const width = Math.max(55, Math.min(100, Number(uiConfig.width) || 100));
    const scale = Math.max(70, Math.min(115, Number(uiConfig.scale) || 100));

    shell.style.setProperty(
      'width',
      `min(${width}vw, calc(100vw - 24px))`,
      'important'
    );
    shell.style.setProperty('max-width', 'none', 'important');
    shell.style.setProperty('margin-left', 'auto', 'important');
    shell.style.setProperty('margin-right', 'auto', 'important');

    /*
     * Chromium/Edge support CSS zoom and it changes layout dimensions instead
     * of leaving a transform-sized ghost box behind. That makes it a better
     * whole-interface scale control for this app than transform:scale().
     */
    shell.style.setProperty('zoom', String(scale / 100), 'important');

    if (uiConfig.transparent) {
      shell.style.setProperty('background', 'transparent', 'important');
      shell.style.setProperty('background-image', 'none', 'important');
    } else {
      shell.style.setProperty('background', String(uiConfig.background || '#fffdf6'), 'important');
      shell.style.setProperty('background-image', 'none', 'important');
    }

    return true;
  }

  function saveAndApplyUi() {
    saveUiConfig(uiConfig);
    applyCompleteUi();
    window.dispatchEvent(new Event('resize'));
  }

  function uiMarkup() {
    return `
      <section class="msg-vd-section msg-vd-complete-ui-section" data-vd-complete-ui>
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

        <div class="msg-vd-control">
          <label>Backdrop color</label>
          <input type="color"
                 value="${String(uiConfig.background || '#fffdf6')}"
                 data-vd-complete-control="background">
        </div>

        <div class="msg-vd-control">
          <label class="msg-vd-check">
            <input type="checkbox"
                   ${uiConfig.transparent ? 'checked' : ''}
                   data-vd-complete-control="transparent">
            Transparent app backdrop
          </label>
        </div>

        <div class="msg-vd-complete-actions">
          <button type="button" data-vd-complete-reset>Reset Complete UI</button>
        </div>
      </section>`;
  }

  function bindCompleteUi(section) {
    section.querySelectorAll('[data-vd-complete-control]').forEach(input => {
      const key = input.dataset.vdCompleteControl;
      const eventName = input.type === 'color' || input.type === 'checkbox' ? 'input' : 'input';

      input.addEventListener(eventName, () => {
        if (input.type === 'checkbox') uiConfig[key] = Boolean(input.checked);
        else if (input.type === 'range') uiConfig[key] = Number(input.value);
        else uiConfig[key] = input.value;

        const output = section.querySelector(`[data-vd-complete-output="${key}"]`);
        if (output) output.textContent = `${Math.round(Number(uiConfig[key]) || 0)}%`;

        saveAndApplyUi();
        status('Complete UI settings updated.', false);
      });
    });

    section.querySelector('[data-vd-complete-reset]')?.addEventListener('click', () => {
      uiConfig = { ...DEFAULT_UI };
      saveAndApplyUi();
      section.replaceWith(createCompleteUiSection());
      status('Complete UI settings reset.', false);
    });
  }

  function createCompleteUiSection() {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = uiMarkup().trim();
    const section = wrapper.firstElementChild;
    bindCompleteUi(section);
    return section;
  }

  function installCompleteUiSection() {
    const designer = panel();
    if (!designer) return false;
    if (designer.querySelector('[data-vd-complete-ui]')) return true;

    const scroll = designer.querySelector('.msg-vd-scroll');
    if (!scroll) return false;

    const section = createCompleteUiSection();
    scroll.insertBefore(section, scroll.firstElementChild || null);
    return true;
  }

  /* ---------------- reliable export ---------------- */

  function saveLiveDesignerState() {
    const saveButton = panel()?.querySelector('[data-vd-save]');
    if (saveButton) saveButton.click();
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

    /*
     * Keep backward compatibility with the existing v2 import while also
     * carrying the new outer-interface settings in the export.
     */
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
        status('Design JSON copied to clipboard.', true);
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
      status('Design JSON copied to clipboard.', true);
      return true;
    } catch (error) {
      status(`Copy failed: ${error.message}`, false);
      return false;
    }
  }

  async function exportJson() {
    let text;
    try {
      text = currentConfigText();
    } catch (error) {
      status(error.message, false);
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
        status(`Exported ${EXPORT_NAME}.`, true);
        return true;
      } catch (error) {
        if (error?.name === 'AbortError') {
          status('Export canceled.', false);
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

      status(`Export requested for ${EXPORT_NAME}. If blocked, use Copy JSON.`, true);
      return true;
    } catch (error) {
      status(`Download failed: ${error.message}. Use Copy JSON.`, false);
      return false;
    }
  }

  function installExportControls() {
    const designer = panel();
    if (!designer) return false;

    const exportButton = designer.querySelector('[data-vd-export]');
    const toolbar = exportButton?.parentElement;
    if (!exportButton || !toolbar) return false;

    let copyButton = toolbar.querySelector('[data-vd-copy-json]');
    if (!copyButton) {
      copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.dataset.vdCopyJson = '1';
      copyButton.textContent = 'Copy JSON';
      copyButton.title = 'Copy the complete design JSON to the clipboard';
      exportButton.insertAdjacentElement('afterend', copyButton);
      copyButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        copyJson();
      });
    }
    return true;
  }

  /* Override old export before its bubbling listener. */
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
    applyCompleteUi();
  }

  function installSoon() {
    [0, 40, 120, 350, 900].forEach(delay => {
      window.setTimeout(installAll, delay);
    });
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('#msg-explorer-design-launcher')) installSoon();
  }, true);

  document.addEventListener('marksetgo:document-available', () => {
    window.setTimeout(applyCompleteUi, 0);
  });

  document.addEventListener('marksetgo:experience-profile-changed', () => {
    window.setTimeout(applyCompleteUi, 0);
  });

  window.addEventListener('pageshow', () => {
    window.setTimeout(() => {
      installAll();
      applyCompleteUi();
    }, 0);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      installSoon();
      applyCompleteUi();
    }, { once: true });
  } else {
    installSoon();
    applyCompleteUi();
  }

  window.MSGExplorerDesignerEnhancements = Object.freeze({
    export: exportJson,
    copy: copyJson,
    applyCompleteUi,
    getCompleteUi: () => ({ ...uiConfig })
  });
})();
