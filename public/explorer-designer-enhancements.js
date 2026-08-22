/* Mark, Set, Go! Explorer Designer enhancements v3.6
   Reliable Export + Copy JSON.
   Does not modify Reader geometry.
   No MutationObserver.
*/
(() => {
  'use strict';

  const STORAGE_KEY = 'markSetGoExplorerVisualDesignerV2';
  const EXPORT_NAME = 'mark-set-go-explorer-design-v2.json';

  function designerPanel() {
    return document.querySelector('#msg-explorer-visual-designer');
  }

  function status(message, saved = false) {
    const node = designerPanel()?.querySelector('[data-vd-status]');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('is-saved', Boolean(saved));
  }

  function readCurrentConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error('No saved design is available yet.');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') throw new Error('Saved design is invalid.');
      return parsed;
    } catch (error) {
      throw new Error(error?.message || 'Could not read the current design.');
    }
  }

  function saveLiveDesignerState() {
    const saveButton = designerPanel()?.querySelector('[data-vd-save]');
    if (saveButton) saveButton.click();
  }

  function currentConfigText() {
    // The Designer keeps live edits in a private closure. Trigger its own Save
    // action first so localStorage contains exactly what is currently on screen.
    saveLiveDesignerState();
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

    // Best path in Chromium/Edge: user explicitly chooses the destination.
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
        // Fall through to classic download.
        console.warn('Save File picker unavailable; falling back to download.', error);
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

      // Use a real MouseEvent rather than HTMLElement.click().
      anchor.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      }));

      window.setTimeout(() => {
        anchor.remove();
        URL.revokeObjectURL(url);
      }, 2500);

      status(`Export requested for ${EXPORT_NAME}. If your browser blocks it, use Copy JSON.`, true);
      return true;
    } catch (error) {
      status(`Download failed: ${error.message}. Use Copy JSON.`, false);
      return false;
    }
  }

  function installButtons() {
    const panel = designerPanel();
    if (!panel) return false;

    const exportButton = panel.querySelector('[data-vd-export]');
    const toolbar = exportButton?.parentElement;
    if (!exportButton || !toolbar) return false;

    // Capture-phase interception prevents the old exporter from claiming
    // success when the browser did not actually produce a file.
    if (exportButton.dataset.vdReliableExport !== '1') {
      exportButton.dataset.vdReliableExport = '1';
      exportButton.title = 'Save the current Explorer design as JSON';
    }

    let copyButton = toolbar.querySelector('[data-vd-copy-json]');
    if (!copyButton) {
      copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.dataset.vdCopyJson = '1';
      copyButton.textContent = 'Copy JSON';
      copyButton.title = 'Copy the complete design JSON to the clipboard';
      exportButton.insertAdjacentElement('afterend', copyButton);
      copyButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        copyJson();
      });
    }

    return true;
  }

  // Override the existing export handler before its normal bubbling listener.
  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('#msg-explorer-visual-designer [data-vd-export]')
      : null;
    if (!button) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    exportJson();
  }, true);

  function installSoon() {
    [0, 40, 120, 350, 900].forEach(delay => {
      window.setTimeout(installButtons, delay);
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('#msg-explorer-design-launcher')) installSoon();
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installSoon, { once: true });
  } else {
    installSoon();
  }

  window.MSGExplorerDesignerExport = Object.freeze({
    export: exportJson,
    copy: copyJson
  });
})();
