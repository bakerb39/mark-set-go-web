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
      throw new Error('This library entry does not have readable text yet. Re-import the book once; the app will now save the text automatically.');
    }
    if (!book.documentStored) {
      throw new Error('Only the library entry was saved by an earlier version. Re-import the book once; the text will now be saved automatically to your account.');
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

  let decorateScheduled = false;
  let decorating = false;

  function setTextIfChanged(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }

  function setDatasetIfChanged(node, key, value) {
    if (node.dataset[key] !== value) node.dataset[key] = value;
  }

  function decorateDocumentStates() {
    if (decorating) return;
    decorating = true;
    try {
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
        const badgeState = book?.documentStored ? 'document' : (book ? 'metadata' : 'local');
        setTextIfChanged(badge, label);
        setDatasetIfChanged(badge, 'state', badgeState);
        if (button.title !== label) button.title = label;
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
        const label = statusForBook(book, book.clientRecordId);
        const badgeState = book.documentStored ? 'document' : 'metadata';
        setTextIfChanged(badge, label);
        setDatasetIfChanged(badge, 'state', badgeState);
      });
    } finally {
      decorating = false;
    }
  }

  function scheduleDecoration() {
    if (decorateScheduled || decorating || !document.querySelector('.my-library-hub')) return;
    decorateScheduled = true;
    requestAnimationFrame(() => {
      decorateScheduled = false;
      decorateDocumentStates();
    });
  }

  function injectStyles() {
    if (document.getElementById('unified-document-manager-styles')) return;
    const style = document.createElement('style');
    style.id = 'unified-document-manager-styles';
    style.textContent = `
      .unified-document-state{display:inline-flex;width:max-content;margin:.22rem 0 .35rem;padding:.18rem .48rem;border-radius:999px;font-size:.69rem;font-weight:750;background:#edf3f8;color:#536b82}
      .unified-document-state[data-state="document"]{background:#e7f1fa;color:#245f91}
      .unified-document-state[data-state="metadata"]{background:#fff3d6;color:#815f00}
      .unified-document-state[data-state="local"]{background:#edf1f8;color:#415b83}
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-library-document],[data-record-document]');
    if (button) void interceptLibraryOpen(event, button);
  }, true);

  document.addEventListener('marksetgo:cloud-library-ready', scheduleDecoration);
  const observer = new MutationObserver(scheduleDecoration);
  observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
  injectStyles();
  scheduleDecoration();

  window.MarkSetGoDocumentManager = Object.freeze({ open, openCloudDocument, localDocument, cloudBookForDocument, refreshLabels: decorateDocumentStates });
})();
