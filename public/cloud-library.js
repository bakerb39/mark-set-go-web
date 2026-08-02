(() => {
  'use strict';

  const PROGRESS_KEY = 'markSetGoReadingProgressV1';
  const READING_LIST_KEY = 'markSetGoReadingListV1';
  const DOCUMENT_PREFIX = 'markSetGoDocumentV1:';
  const SYNC_INTERVAL_MS = 20000;

  const state = {
    authenticated: false,
    ready: false,
    syncing: false,
    books: [],
    byClientId: new Map(),
    signatures: new Map(),
    timer: null,
    lastError: null,
    decorateScheduled: false
  };

  function cloudApi() {
    return window.MarkSetGoCloud?.library || null;
  }

  function readObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  function readArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function readDocument(documentId) {
    if (!documentId) return null;
    try {
      const value = JSON.parse(localStorage.getItem(`${DOCUMENT_PREFIX}${documentId}`) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  }

  function cleanText(value, fallback = '') {
    return String(value ?? fallback).trim();
  }

  function sourceMetadata(source = {}) {
    if (!source || typeof source !== 'object') return {};
    return {
      type: cleanText(source.type),
      provider: cleanText(source.provider),
      id: cleanText(source.id),
      url: cleanText(source.url || source.sourceUrl || source.externalUrl),
      author: cleanText(source.author),
      year: cleanText(source.year),
      description: cleanText(source.description),
      format: cleanText(source.format)
    };
  }

  function collectLocalMetadata() {
    const progress = readObject(PROGRESS_KEY);
    const readingList = readArray(READING_LIST_KEY);
    const records = new Map();

    Object.entries(progress).forEach(([documentId, item]) => {
      if (!documentId || !item || typeof item !== 'object') return;
      const document = readDocument(documentId);
      const source = sourceMetadata(document?.source || item.source || {});
      const title = cleanText(item.title || document?.title, 'Untitled');
      records.set(documentId, {
        clientRecordId: documentId,
        title,
        author: cleanText(source.author || document?.author),
        sourceType: cleanText(source.type || source.provider || 'reader'),
        sourceId: cleanText(source.id),
        sourceUrl: cleanText(source.url),
        coverUrl: cleanText(document?.coverUrl || document?.source?.coverUrl),
        metadata: {
          documentId,
          totalWords: Number(item.totalWords) || 0,
          furthestWord: Number(item.furthestWord) || 0,
          lastReadAt: item.lastReadAt || null,
          totalSeconds: Number(item.totalSeconds) || 0,
          sessions: Number(item.sessions) || 0,
          source,
          documentAvailableInSession: Boolean(document?.text)
        }
      });
    });

    readingList.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const clientRecordId = cleanText(item.documentId || item.id);
      if (!clientRecordId) return;
      const existing = records.get(clientRecordId);
      const source = sourceMetadata(item.source || {});
      records.set(clientRecordId, {
        clientRecordId,
        title: cleanText(item.title || existing?.title, 'Untitled'),
        author: cleanText(item.author || source.author || existing?.author),
        sourceType: cleanText(source.type || source.provider || existing?.sourceType || 'reading-list'),
        sourceId: cleanText(source.id || existing?.sourceId),
        sourceUrl: cleanText(item.sourceUrl || source.url || existing?.sourceUrl),
        coverUrl: cleanText(item.coverUrl || existing?.coverUrl),
        metadata: {
          ...(existing?.metadata || {}),
          readingListId: cleanText(item.id),
          note: cleanText(item.note),
          status: cleanText(item.status || 'saved'),
          addedAt: item.addedAt || item.createdAt || null,
          source: { ...(existing?.metadata?.source || {}), ...source }
        }
      });
    });

    return [...records.values()];
  }

  function stableSignature(record) {
    return JSON.stringify(record);
  }

  function normalizeCloudBook(book) {
    const metadata = book?.metadata && typeof book.metadata === 'object' ? book.metadata : {};
    return {
      ...book,
      id: book?.id || '',
      clientRecordId: book?.client_record_id || book?.clientRecordId || metadata.documentId || '',
      title: book?.title || 'Untitled',
      author: book?.author || '',
      sourceType: book?.source_type || book?.sourceType || '',
      sourceId: book?.source_id || book?.sourceId || '',
      sourceUrl: book?.source_url || book?.sourceUrl || '',
      coverUrl: book?.cover_url || book?.coverUrl || '',
      addedAt: book?.added_at || book?.addedAt || null,
      updatedAt: book?.updated_at || book?.updatedAt || null,
      metadata
    };
  }

  function setBooks(books) {
    state.books = (Array.isArray(books) ? books : []).map(normalizeCloudBook);
    state.byClientId = new Map(state.books.filter((book) => book.clientRecordId).map((book) => [book.clientRecordId, book]));
    decorateLibraryView();
    document.dispatchEvent(new CustomEvent('marksetgo:cloud-library-ready', {
      detail: { count: state.books.length, books: state.books.slice() }
    }));
  }

  async function loadCloudLibrary() {
    const api = cloudApi();
    if (!state.authenticated || !api) return [];
    const payload = await api.list();
    setBooks(payload?.books || []);
    return state.books;
  }

  async function syncLocalMetadata({ force = false } = {}) {
    const api = cloudApi();
    if (!state.authenticated || !api || state.syncing) return;
    state.syncing = true;
    state.lastError = null;
    try {
      const local = collectLocalMetadata();
      for (const record of local) {
        const signature = stableSignature(record);
        if (!force && state.signatures.get(record.clientRecordId) === signature) continue;
        const payload = await api.save(record);
        const saved = normalizeCloudBook(payload?.book || {});
        state.signatures.set(record.clientRecordId, signature);
        if (saved.clientRecordId) state.byClientId.set(saved.clientRecordId, saved);
      }
      await loadCloudLibrary();
    } catch (error) {
      state.lastError = error;
      console.warn('Cloud library metadata sync failed.', error);
      decorateLibraryView();
    } finally {
      state.syncing = false;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function hasLocalDocument(documentId) {
    return Boolean(readDocument(documentId)?.text);
  }

  function cloudOnlyBooks() {
    return state.books.filter((book) => book.clientRecordId && !readObject(PROGRESS_KEY)[book.clientRecordId]);
  }

  function injectStyles() {
    if (document.querySelector('#cloud-library-adapter-styles')) return;
    const style = document.createElement('style');
    style.id = 'cloud-library-adapter-styles';
    style.textContent = `
      .cloud-library-sync-status{display:inline-flex;align-items:center;gap:.4rem;margin-top:.45rem;padding:.3rem .6rem;border:1px solid var(--border,#d8dfdc);border-radius:999px;font-size:.78rem;background:var(--surface,#fff)}
      .cloud-library-sync-status[data-state="error"]{border-color:#c77;color:#8b2f2f}
      .cloud-library-account-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.75rem}
      .cloud-library-account-card{border:1px solid var(--border,#d8dfdc);border-radius:12px;padding:.85rem;background:var(--surface,#fff);display:grid;gap:.55rem}
      .cloud-library-account-card h3{margin:0;font-size:1rem}.cloud-library-account-card p{margin:0;color:var(--muted,#66736d);font-size:.86rem}
      .cloud-library-account-actions{display:flex;gap:.45rem;flex-wrap:wrap}.cloud-library-account-actions button{font-size:.8rem}
      .cloud-saved-badge{display:inline-flex;margin-left:.45rem;font-size:.7rem;font-weight:600;color:var(--accent-strong,#176b50)}
    `;
    document.head.appendChild(style);
  }

  function addCloudBadges(root) {
    root.querySelectorAll('[data-library-document]').forEach((control) => {
      const id = control.dataset.libraryDocument;
      if (!id || !state.byClientId.has(id)) return;
      const card = control.closest('article');
      const heading = card?.querySelector('h2,h3');
      if (heading && !heading.querySelector('.cloud-saved-badge')) {
        const badge = document.createElement('span');
        badge.className = 'cloud-saved-badge';
        badge.textContent = 'Saved to account';
        heading.appendChild(badge);
      }
    });
  }

  function cloudSectionHtml() {
    const books = cloudOnlyBooks();
    if (!books.length) return '';
    return `
      <details class="library-section cloud-library-account-section" open>
        <summary><span><strong>Saved to your account</strong><small>Library metadata available from PostgreSQL</small></span><span class="library-section-count">${books.length}</span></summary>
        <div class="library-section-body"><div class="cloud-library-account-grid">
          ${books.map((book) => {
            const id = escapeHtml(book.clientRecordId);
            const sourceUrl = escapeHtml(book.sourceUrl || book.metadata?.source?.url || '');
            return `<article class="cloud-library-account-card">
              <div><span class="source-category">Cloud library</span><h3>${escapeHtml(book.title)}</h3><p>${escapeHtml(book.author || 'Author not listed')}</p></div>
              <p>${hasLocalDocument(book.clientRecordId) ? 'The text is available in this browser session.' : 'Metadata is saved. Reopen or re-import the source text to read it on this device.'}</p>
              <div class="cloud-library-account-actions">
                ${hasLocalDocument(book.clientRecordId) ? `<button class="primary" type="button" data-cloud-library-open="${id}">Open local text</button>` : ''}
                ${sourceUrl ? `<a class="secondary button-link" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">Open source</a>` : ''}
                <button class="secondary" type="button" data-cloud-library-remove="${escapeHtml(book.id)}">Remove metadata</button>
              </div>
            </article>`;
          }).join('')}
        </div></div>
      </details>`;
  }

  function bindCloudSection(root) {
    root.querySelectorAll('[data-cloud-library-open]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.cloudLibraryOpen;
        const existing = root.querySelector(`[data-library-document="${CSS.escape(id)}"]`);
        if (existing) existing.click();
        else window.alert('The text metadata is saved to your account, but the reading text must be reopened on this device.');
      });
    });
    root.querySelectorAll('[data-cloud-library-remove]').forEach((button) => {
      button.addEventListener('click', async () => {
        const api = cloudApi();
        if (!api || !window.confirm('Remove this book metadata from your account library?')) return;
        button.disabled = true;
        try {
          await api.remove(button.dataset.cloudLibraryRemove);
          await loadCloudLibrary();
        } catch (error) {
          window.alert(error.message || 'The account library record could not be removed.');
          button.disabled = false;
        }
      });
    });
  }

  function decorateLibraryView() {
    const root = document.querySelector('.my-library-hub');
    if (!root) return;
    injectStyles();

    let status = root.querySelector('.cloud-library-sync-status');
    if (!status) {
      status = document.createElement('span');
      status.className = 'cloud-library-sync-status';
      root.querySelector('.library-welcome > div')?.appendChild(status);
    }
    const statusState = state.lastError ? 'error' : state.syncing ? 'syncing' : 'saved';
    const statusText = state.lastError
      ? 'Account library sync unavailable'
      : state.syncing
        ? 'Syncing account library…'
        : `${state.books.length} account librar${state.books.length === 1 ? 'y item' : 'y items'} synced`;
    if (status.dataset.state !== statusState) status.dataset.state = statusState;
    if (status.textContent !== statusText) status.textContent = statusText;

    addCloudBadges(root);
    const section = cloudSectionHtml();
    const signature = JSON.stringify(cloudOnlyBooks().map((book) => [book.id, book.clientRecordId, book.title, book.author, book.sourceUrl, book.updatedAt]));
    const existingSection = root.querySelector('.cloud-library-account-section');
    if (!section) {
      existingSection?.remove();
    } else if (!existingSection || existingSection.dataset.cloudSignature !== signature) {
      existingSection?.remove();
      root.insertAdjacentHTML('beforeend', section);
      const inserted = root.querySelector('.cloud-library-account-section');
      if (inserted) inserted.dataset.cloudSignature = signature;
      bindCloudSection(root);
    }
  }

  function scheduleSync(delay = 750) {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => syncLocalMetadata(), delay);
  }

  function startPolling() {
    if (state.poller) return;
    state.poller = setInterval(() => {
      if (document.visibilityState === 'visible') syncLocalMetadata();
    }, SYNC_INTERVAL_MS);
  }

  document.addEventListener('marksetgo:auth-changed', (event) => {
    state.authenticated = Boolean(event.detail?.authenticated);
    if (!state.authenticated) {
      setBooks([]);
      state.signatures.clear();
      return;
    }
    scheduleSync(200);
    startPolling();
  });

  document.addEventListener('marksetgo:cloud-ready', (event) => {
    state.authenticated = true;
    const books = event.detail?.library || [];
    setBooks(books);
    scheduleSync(250);
    startPolling();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') syncLocalMetadata();
    else decorateLibraryView();
  });
  window.addEventListener('pagehide', () => { syncLocalMetadata(); });
  window.addEventListener('pageshow', () => { decorateLibraryView(); scheduleSync(500); });

  const observer = new MutationObserver(() => {
    if (!document.querySelector('.my-library-hub') || state.decorateScheduled) return;
    state.decorateScheduled = true;
    requestAnimationFrame(() => {
      state.decorateScheduled = false;
      decorateLibraryView();
    });
  });
  observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });

  window.MarkSetGoCloudLibrary = Object.freeze({
    get state() { return { ...state, books: state.books.slice(), byClientId: undefined }; },
    list: () => state.books.slice(),
    refresh: loadCloudLibrary,
    sync: () => syncLocalMetadata({ force: true })
  });
})();
