(() => {
  'use strict';

  const DOCUMENT_PREFIX = 'markSetGoDocumentV1:';
  const PROGRESS_KEY = 'markSetGoReadingProgressV1';
  const state = { opening: new Set() };

  function cloudBooks() {
    return window.MarkSetGoCloudLibrary?.list?.() || [];
  }

  function cloudBookForDocument(documentId) {
    return cloudBooks().find((book) => String(book.clientRecordId || '') === String(documentId || '')) || null;
  }

  function localDocument(documentId) {
    if (!documentId) return null;
    try {
      const value = JSON.parse(localStorage.getItem(`${DOCUMENT_PREFIX}${documentId}`) || 'null');
      return value && typeof value === 'object' && typeof value.text === 'string' && value.text.length ? value : null;
    } catch {
      return null;
    }
  }

  function savedResumeIndex(documentId) {
    try {
      const records = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
      const record = records && typeof records === 'object' ? records[documentId] : null;
      return Math.max(0, Number(record?.lastWord ?? record?.furthestWord) || 0);
    } catch {
      return 0;
    }
  }

  async function openCloudDocument(book, options = {}) {
    const api = window.MarkSetGoCloud?.library;
    if (!api?.loadDocument) throw new Error('Cloud document service is unavailable.');
    const payload = await api.loadDocument(book.id);
    const documentRecord = payload?.document;
    if (!documentRecord?.text) throw new Error('The saved account document did not contain readable text.');
    if (typeof window.renderReaderWithText !== 'function') throw new Error('The reader is not ready.');

    const source = {
      ...(documentRecord.source || {}),
      type: documentRecord.source?.type || book.sourceType || 'cloud-document',
      author: documentRecord.author || book.author || '',
      cloudBookId: book.id,
      clientRecordId: book.clientRecordId || ''
    };
    window.renderReaderWithText(documentRecord.title || book.title || 'Untitled', documentRecord.text, source);

    const resumeIndex = Number.isFinite(Number(options.wordIndex))
      ? Math.max(0, Number(options.wordIndex))
      : savedResumeIndex(book.clientRecordId);
    if (resumeIndex > 0 && typeof window.jumpToWordIndex === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(() => window.jumpToWordIndex(resumeIndex)));
    }
    return { source: 'cloud', book, resumeIndex };
  }

  async function open(documentId, options = {}) {
    const id = String(documentId || '').trim();
    if (!id) throw new Error('No document was selected.');

    // The app's verified local-document handler remains authoritative when the
    // text is available in this browser. The manager intervenes only when the
    // old local-only path would otherwise fail.
    const local = localDocument(id);
    if (local) return { source: 'local', document: local, handled: false };

    const book = cloudBookForDocument(id);
    if (!book) {
      throw new Error('This library entry is not connected to an account document. Re-import the text, then choose “Save text to account.”');
    }
    if (!book.documentStored) {
      throw new Error('Only the library entry is saved. The document text has not been saved to your account yet. Re-import the text and choose “Save text to account.”');
    }
    return openCloudDocument(book, options);
  }

  function setOpening(button, opening) {
    if (!button) return;
    if (opening) {
      button.dataset.documentManagerOriginalLabel = button.textContent;
      button.disabled = true;
      button.textContent = 'Opening…';
    } else {
      button.disabled = false;
      if (button.dataset.documentManagerOriginalLabel) {
        button.textContent = button.dataset.documentManagerOriginalLabel;
        delete button.dataset.documentManagerOriginalLabel;
      }
    }
  }

  async function interceptLibraryOpen(event, button) {
    const documentId = button.dataset.libraryDocument || button.dataset.recordDocument;
    if (!documentId || localDocument(documentId)) return; // verified app path handles local text

    event.preventDefault();
    event.stopImmediatePropagation();
    if (state.opening.has(documentId)) return;
    state.opening.add(documentId);
    setOpening(button, true);
    try {
      await open(documentId, { wordIndex: button.dataset.recordIndex });
    } catch (error) {
      window.alert(error?.message || 'Unable to open this document.');
    } finally {
      state.opening.delete(documentId);
      setOpening(button, false);
    }
  }

  function statusForBook(book, documentId) {
    if (localDocument(documentId)) return book?.documentStored ? 'Document saved to account' : 'Available on this device';
    if (book?.documentStored) return 'Document saved to account';
    if (book) return 'Library entry saved';
    return 'Local only';
  }

  function decorateDocumentStates() {
    const books = cloudBooks();

    document.querySelectorAll('[data-library-document]').forEach((button) => {
      const documentId = button.dataset.libraryDocument;
      const book = books.find((item) => String(item.clientRecordId || '') === String(documentId || ''));
      const card = button.closest('.library-primary-focus,.library-continue-card,article,section');
      if (!card) return;
      let badge = card.querySelector('.unified-document-state');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'unified-document-state';
        const heading = card.querySelector('h2,h3');
        if (heading) heading.insertAdjacentElement('afterend', badge);
        else card.prepend(badge);
      }
      const label = statusForBook(book, documentId);
      badge.textContent = label;
      badge.dataset.state = book?.documentStored ? 'document' : (book ? 'metadata' : 'local');
      button.title = label;
    });

    document.querySelectorAll('.cloud-library-account-card').forEach((card) => {
      const bookId = card.querySelector('[data-cloud-library-remove]')?.dataset.cloudLibraryRemove;
      const book = books.find((item) => String(item.id) === String(bookId));
      if (!book) return;
      card.querySelectorAll('.cloud-document-state,.cloud-saved-badge,.cloud-document-badge').forEach((node) => node.remove());
      const heading = card.querySelector('h3');
      if (!heading) return;
      let badge = card.querySelector('.unified-document-state');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'unified-document-state';
        heading.insertAdjacentElement('afterend', badge);
      }
      badge.textContent = statusForBook(book, book.clientRecordId);
      badge.dataset.state = book.documentStored ? 'document' : 'metadata';
    });
  }

  function injectStyles() {
    if (document.getElementById('unified-document-manager-styles')) return;
    const style = document.createElement('style');
    style.id = 'unified-document-manager-styles';
    style.textContent = `
      .unified-document-state{display:inline-flex;width:max-content;margin:.22rem 0 .35rem;padding:.18rem .48rem;border-radius:999px;font-size:.69rem;font-weight:750;background:#eef3f1;color:#53615b}
      .unified-document-state[data-state="document"]{background:#e4f4ec;color:#176b50}
      .unified-document-state[data-state="metadata"]{background:#fff3d6;color:#815f00}
      .unified-document-state[data-state="local"]{background:#edf1f8;color:#415b83}
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-library-document],[data-record-document]');
    if (button) void interceptLibraryOpen(event, button);
  }, true);

  document.addEventListener('marksetgo:cloud-library-ready', decorateDocumentStates);
  const observer = new MutationObserver(() => requestAnimationFrame(decorateDocumentStates));
  observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
  injectStyles();
  requestAnimationFrame(decorateDocumentStates);

  window.MarkSetGoDocumentManager = Object.freeze({ open, openCloudDocument, localDocument, cloudBookForDocument, refreshLabels: decorateDocumentStates });
})();
