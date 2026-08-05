(() => {
  'use strict';

  const DOCUMENT_PREFIX = 'markSetGoDocumentV1:';
  const MAX_RAW_BYTES = 5 * 1024 * 1024;
  const encoder = new TextEncoder();
  const state = { busy: new Set(), lastError: null };

  function api() { return window.MarkSetGoCloud?.library || null; }
  function cloudBooks() { return window.MarkSetGoCloudLibrary?.list?.() || []; }
  function localDocument(clientRecordId) {
    try {
      const value = JSON.parse(localStorage.getItem(`${DOCUMENT_PREFIX}${clientRecordId}`) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch { return null; }
  }
  function fmt(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(2)} MB`;
  }
  function bookById(id) { return cloudBooks().find((book) => String(book.id) === String(id)); }
  function setBusy(id, busy) {
    if (busy) state.busy.add(String(id)); else state.busy.delete(String(id));
    decorate();
  }
  async function refresh() { await window.MarkSetGoCloudLibrary?.refresh?.(); decorate(); }

  async function saveText(bookId) {
    const book = bookById(bookId);
    const doc = localDocument(book?.clientRecordId);
    if (!book || !doc?.text) throw new Error('The document text is not available in this browser.');
    const bytes = encoder.encode(String(doc.text)).byteLength;
    if (bytes > MAX_RAW_BYTES) throw new Error(`This document is ${fmt(bytes)}. The current cloud-database limit is ${fmt(MAX_RAW_BYTES)}.`);
    setBusy(bookId, true);
    try {
      await api().saveDocument(bookId, doc.text);
      await refresh();
    } finally { setBusy(bookId, false); }
  }

  async function openText(bookId) {
    const book = bookById(bookId);
    if (!book) throw new Error('The library record is unavailable.');
    setBusy(bookId, true);
    try {
      const payload = await api().loadDocument(bookId);
      const doc = payload?.document;
      if (!doc?.text) throw new Error('The cloud document did not contain readable text.');
      const source = { ...(doc.source || {}), type: doc.source?.type || book.sourceType || 'cloud-document', author: doc.author || book.author || '' };
      if (typeof window.renderReaderWithText !== 'function') throw new Error('The reader is not ready.');
      window.renderReaderWithText(doc.title || book.title || 'Untitled', doc.text, source);
    } finally { setBusy(bookId, false); }
  }

  async function removeText(bookId) {
    if (!window.confirm('Remove the stored cloud text? The book metadata will remain in My Library.')) return;
    setBusy(bookId, true);
    try { await api().removeDocument(bookId); await refresh(); }
    finally { setBusy(bookId, false); }
  }

  function injectStyles() {
    if (document.querySelector('#cloud-document-adapter-styles')) return;
    const style = document.createElement('style');
    style.id = 'cloud-document-adapter-styles';
    style.textContent = `
      .cloud-document-controls{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.45rem}
      .cloud-document-note{font-size:.74rem;color:var(--muted,#66736d);margin-top:.25rem}
      .cloud-document-badge{display:inline-flex;margin-left:.35rem;font-size:.68rem;font-weight:700;color:var(--accent-strong,#176b50)}
    `;
    document.head.appendChild(style);
  }

  function controls(book) {
    const busy = state.busy.has(String(book.id));
    const local = localDocument(book.clientRecordId);
    if (book.documentStored) {
      return `<div class="cloud-document-controls">
        <button class="primary" type="button" data-cloud-document-open="${book.id}" ${busy ? 'disabled' : ''}>${busy ? 'Working…' : 'Open cloud text'}</button>
        <button class="secondary" type="button" data-cloud-document-remove="${book.id}" ${busy ? 'disabled' : ''}>Remove cloud text</button>
      </div><p class="cloud-document-note">Stored compressed: ${fmt(book.documentCompressedBytes)} · Original: ${fmt(book.documentRawBytes)}</p>`;
    }
    if (local?.text) {
      const bytes = encoder.encode(String(local.text)).byteLength;
      return `<div class="cloud-document-controls"><button class="secondary" type="button" data-cloud-document-save="${book.id}" ${busy || bytes > MAX_RAW_BYTES ? 'disabled' : ''}>${busy ? 'Saving…' : 'Save text to account'}</button></div><p class="cloud-document-note">${bytes > MAX_RAW_BYTES ? `Too large for database storage (${fmt(bytes)}).` : `Estimated original size: ${fmt(bytes)}.`}</p>`;
    }
    return '<p class="cloud-document-note">No text is available on this device or in the account.</p>';
  }

  function bind(root) {
    root.querySelectorAll('[data-cloud-document-save]').forEach((button) => button.addEventListener('click', async () => {
      try { await saveText(button.dataset.cloudDocumentSave); } catch (error) { window.alert(error.message || 'Unable to save the cloud document.'); }
    }));
    root.querySelectorAll('[data-cloud-document-open]').forEach((button) => button.addEventListener('click', async () => {
      try { await openText(button.dataset.cloudDocumentOpen); } catch (error) { window.alert(error.message || 'Unable to open the cloud document.'); }
    }));
    root.querySelectorAll('[data-cloud-document-remove]').forEach((button) => button.addEventListener('click', async () => {
      try { await removeText(button.dataset.cloudDocumentRemove); } catch (error) { window.alert(error.message || 'Unable to remove the cloud document.'); }
    }));
  }

  function decorate() {
    const root = document.querySelector('.my-library-hub');
    if (!root) return;
    injectStyles();
    const books = cloudBooks();
    root.querySelectorAll('.cloud-library-account-card').forEach((card, index) => {
      const remove = card.querySelector('[data-cloud-library-remove]');
      const book = remove ? bookById(remove.dataset.cloudLibraryRemove) : books[index];
      if (!book) return;
      card.querySelector('.cloud-document-controls,.cloud-document-note')?.remove();
      card.querySelector('.cloud-document-note')?.remove();
      card.insertAdjacentHTML('beforeend', controls(book));
      const heading = card.querySelector('h3');
      if (book.documentStored && heading && !heading.querySelector('.cloud-document-badge')) {
        heading.insertAdjacentHTML('beforeend', '<span class="cloud-document-badge">Document saved to account</span>');
      }
    });
    bind(root);
  }

  let decorateFrame = 0;

  function scheduleDecorate() {
    if (decorateFrame) return;
    decorateFrame = requestAnimationFrame(() => {
      decorateFrame = 0;
      decorate();
    });
  }

  // My Library explicitly announces when its cloud records are ready.
  // Avoid observing the entire application DOM: decorate() itself changes the
  // library cards, which previously retriggered the observer indefinitely.
  document.addEventListener('marksetgo:cloud-library-ready', scheduleDecorate);
  document.addEventListener('marksetgo:library-rendered', scheduleDecorate);

  window.MarkSetGoCloudDocuments = Object.freeze({ saveText, openText, removeText, refresh, decorate: scheduleDecorate });
})();
