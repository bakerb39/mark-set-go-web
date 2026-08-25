(() => {
  'use strict';

  // Mark, Set, Go! Cloud Content Sync v1.0.0
  // PostgreSQL/account = durable master; IndexedDB = local/offline working copy.
  // No MutationObserver is used.

  const DB_NAME = 'markSetGoLocalLibraryV1';
  const STORE_NAME = 'books';
  const POLL_MS = 30000;
  const MAX_ACCOUNT_DOCUMENT_BYTES = 5 * 1024 * 1024;
  const RELOAD_MARKER = 'markSetGoCloudContentRestoreReloadV1';

  const EXACT_CONTENT_KEYS = new Set([
    'mark-notebook:insights:v1',
    'mark-notebook:history:v1',
    'syntopicon:saved:v1'
  ]);

  const CONTENT_PREFIXES = [
    'reader-annotations:',
    'whole-guide-questions:'
  ];

  const state = {
    authenticated: false,
    syncing: false,
    timer: 0,
    cloudRecords: 0,
    cloudBooks: 0,
    oversizeDocuments: 0,
    lastSyncAt: '',
    lastError: '',
    restoredThisSession: 0,
    initialized: false
  };

  function emit(status, detail = {}) {
    document.dispatchEvent(new CustomEvent('marksetgo:cloud-content-status', {
      detail: { status, ...detail, ...publicStatus() }
    }));
  }

  function publicStatus() {
    return {
      authenticated: Boolean(state.authenticated),
      syncing: Boolean(state.syncing),
      cloudRecords: Number(state.cloudRecords) || 0,
      cloudBooks: Number(state.cloudBooks) || 0,
      oversizeDocuments: Number(state.oversizeDocuments) || 0,
      lastSyncAt: state.lastSyncAt || '',
      lastError: state.lastError || '',
      restoredThisSession: Number(state.restoredThisSession) || 0
    };
  }

  function cloudApi() {
    return window.MarkSetGoCloud?.library || null;
  }

  function isGenericContentKey(key) {
    const value = String(key || '');
    return EXACT_CONTENT_KEYS.has(value)
      || CONTENT_PREFIXES.some((prefix) => value.startsWith(prefix));
  }

  function clientTimestamp(record) {
    const value = record?.updatedAt || record?.savedAt || record?.createdAt || '';
    const ms = Date.parse(String(value || ''));
    return Number.isFinite(ms) ? ms : 0;
  }

  function remoteTimestamp(row) {
    const value = row?.clientUpdatedAt || row?.client_updated_at || row?.updatedAt || row?.updated_at || '';
    const ms = Date.parse(String(value || ''));
    return Number.isFinite(ms) ? ms : 0;
  }

  function stableJson(value) {
    const seen = new WeakSet();
    const normalize = (item) => {
      if (!item || typeof item !== 'object') return item;
      if (seen.has(item)) return null;
      seen.add(item);
      if (Array.isArray(item)) return item.map(normalize);
      const out = {};
      Object.keys(item).sort().forEach((key) => { out[key] = normalize(item[key]); });
      return out;
    };
    try { return JSON.stringify(normalize(value)); }
    catch { return JSON.stringify(value); }
  }

  function simpleHash(value) {
    const text = stableJson(value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function readProgressStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem('markSetGoReadingProgressV1') || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeProgressStore(value) {
    try {
      localStorage.setItem('markSetGoReadingProgressV1', JSON.stringify(value || {}));
      return true;
    } catch (error) {
      console.warn('Cloud-restored reading progress could not be stored locally.', error);
      return false;
    }
  }

  function readReadingList() {
    try {
      const parsed = JSON.parse(localStorage.getItem('markSetGoReadingListV1') || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeReadingList(items) {
    try {
      localStorage.setItem('markSetGoReadingListV1', JSON.stringify(Array.isArray(items) ? items : []));
      return true;
    } catch {
      return false;
    }
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB is unavailable.'));
      const request = indexedDB.open(DB_NAME);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.close();
          reject(new Error('The local reading database is not ready yet.'));
          return;
        }
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('IndexedDB could not be opened.'));
    });
  }

  async function listIdbRecords(predicate = () => true) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const records = [];
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return resolve(records);
          const value = cursor.value;
          if (value?.key && predicate(value.key, value)) records.push(value);
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  async function getIdbRecord(key) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(String(key || ''));
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  async function putIdbRecord(record) {
    if (!record?.key) return false;
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('IndexedDB write was aborted.'));
      });
    } finally {
      db.close();
    }
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `Request failed with HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function loadRemoteContent() {
    const payload = await request('/api/account/content-sync', { method:'GET' });
    const rows = Array.isArray(payload.records) ? payload.records : [];
    state.cloudRecords = rows.length;
    return new Map(rows.map((row) => [String(row.key || row.contentKey || ''), row]));
  }

  async function saveRemoteContent(key, record) {
    const timestamp = record?.updatedAt || record?.savedAt || new Date().toISOString();
    const payload = await request(`/api/account/content-sync/${encodeURIComponent(key)}`, {
      method:'PUT',
      body:JSON.stringify({
        payload:record,
        clientUpdatedAt:timestamp
      })
    });
    return payload.record || null;
  }

  async function syncGenericIndexedDbContent() {
    const [remote, localRecords] = await Promise.all([
      loadRemoteContent(),
      listIdbRecords((key) => isGenericContentKey(key))
    ]);

    const local = new Map(localRecords.map((record) => [String(record.key), record]));
    const keys = new Set([...local.keys(), ...remote.keys()]);
    let uploaded = 0;
    let restored = 0;

    for (const key of keys) {
      if (!isGenericContentKey(key)) continue;
      const localRecord = local.get(key) || null;
      const remoteRow = remote.get(key) || null;
      const remoteRecord = remoteRow?.payload && typeof remoteRow.payload === 'object'
        ? remoteRow.payload
        : null;

      if (localRecord && !remoteRecord) {
        const saved = await saveRemoteContent(key, localRecord);
        if (saved) {
          remote.set(key, saved);
          uploaded += 1;
        }
        continue;
      }

      if (!localRecord && remoteRecord) {
        await putIdbRecord({ ...remoteRecord, key });
        restored += 1;
        continue;
      }

      if (!localRecord || !remoteRecord) continue;

      const localTime = clientTimestamp(localRecord);
      const cloudTime = remoteTimestamp(remoteRow) || clientTimestamp(remoteRecord);
      const same = simpleHash(localRecord) === simpleHash(remoteRecord);
      if (same) continue;

      if (cloudTime > localTime + 750) {
        await putIdbRecord({ ...remoteRecord, key });
        restored += 1;
      } else {
        const saved = await saveRemoteContent(key, localRecord);
        if (saved) {
          remote.set(key, saved);
          uploaded += 1;
        }
      }
    }

    return { uploaded, restored };
  }

  function normalizeCloudBook(raw = {}) {
    const metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
    return {
      raw,
      id:String(raw.id || ''),
      clientRecordId:String(raw.client_record_id || raw.clientRecordId || metadata.documentId || ''),
      title:String(raw.title || 'Untitled'),
      author:String(raw.author || ''),
      sourceType:String(raw.source_type || raw.sourceType || ''),
      sourceId:String(raw.source_id || raw.sourceId || ''),
      sourceUrl:String(raw.source_url || raw.sourceUrl || ''),
      metadata,
      documentStored:Boolean(raw.document_stored ?? raw.documentStored),
      documentUpdatedAt:raw.document_updated_at || raw.documentUpdatedAt || '',
      progressUpdatedAt:raw.progress_updated_at || raw.progressUpdatedAt || '',
      playbackIndex:Number(raw.playback_index ?? raw.playbackIndex ?? raw.word_index ?? raw.wordIndex),
      viewportAnchorIndex:Number(raw.viewport_anchor_index ?? raw.viewportAnchorIndex),
      viewportOffsetPx:Number(raw.viewport_offset_px ?? raw.viewportOffsetPx) || 0,
      pageNumber:raw.page_number ?? raw.pageNumber ?? null,
      mode:String(raw.mode || '')
    };
  }

  function localBookMetadata(documentId, documentRecord, progressItem, readingListItem) {
    const source = documentRecord?.source && typeof documentRecord.source === 'object'
      ? documentRecord.source
      : progressItem?.source && typeof progressItem.source === 'object'
        ? progressItem.source
        : readingListItem?.source && typeof readingListItem.source === 'object'
          ? readingListItem.source
          : {};
    return {
      clientRecordId:documentId,
      title:String(documentRecord?.title || progressItem?.title || readingListItem?.title || 'Untitled'),
      author:String(source.author || readingListItem?.author || ''),
      sourceType:String(source.type || source.provider || 'reader'),
      sourceId:String(source.id || ''),
      sourceUrl:String(source.url || source.sourceUrl || source.externalUrl || readingListItem?.sourceUrl || ''),
      coverUrl:String(documentRecord?.coverUrl || source.coverUrl || readingListItem?.coverUrl || ''),
      metadata:{
        documentId,
        totalWords:Number(progressItem?.totalWords) || 0,
        furthestWord:Number(progressItem?.furthestWord) || 0,
        lastReadAt:progressItem?.lastReadAt || null,
        totalSeconds:Number(progressItem?.totalSeconds) || 0,
        sessions:Number(progressItem?.sessions) || 0,
        source,
        readingListId:String(readingListItem?.id || ''),
        note:String(readingListItem?.note || ''),
        status:String(readingListItem?.status || ''),
        addedAt:readingListItem?.addedAt || readingListItem?.createdAt || null
      }
    };
  }

  function normalizeProgressPayload(item = {}, documentId = '') {
    const wordIndex = Math.max(0, Number(item.lastWord ?? item.wordIndex ?? item.furthestWord) || 0);
    const totalWords = Math.max(0, Number(item.totalWords) || 0);
    return {
      mode:String(item.mode || ''),
      wordIndex,
      playbackIndex:wordIndex,
      viewportAnchorIndex:Math.max(0, Number(item.viewportAnchorIndex ?? wordIndex) || wordIndex),
      viewportOffsetPx:Number(item.viewportOffsetPx) || 0,
      scrollRatio:Math.max(0, Math.min(1, Number(item.scrollRatio ?? (totalWords ? wordIndex / totalWords : 0)) || 0)),
      pageNumber:item.pageNumber == null ? null : Math.max(1, Number(item.pageNumber) || 1),
      positionData:{
        documentId,
        title:String(item.title || ''),
        updatedAt:item.lastReadAt || new Date().toISOString()
      }
    };
  }

  function remoteProgressItem(book, existing = {}) {
    const index = Number.isFinite(book.playbackIndex) ? Math.max(0, book.playbackIndex) : 0;
    const totalWords = Number(existing.totalWords || book.metadata?.totalWords) || 0;
    return {
      ...existing,
      documentId:book.clientRecordId,
      title:book.title || existing.title || 'Untitled',
      lastWord:index,
      furthestWord:Math.max(Number(existing.furthestWord) || 0, index),
      totalWords,
      mode:book.mode || existing.mode || '',
      pageNumber:book.pageNumber ?? existing.pageNumber ?? null,
      lastReadAt:book.progressUpdatedAt || existing.lastReadAt || new Date().toISOString(),
      source:book.metadata?.source || existing.source || {}
    };
  }

  async function syncBooksAndProgress() {
    const api = cloudApi();
    if (!api) return { uploadedDocuments:0, restoredDocuments:0, uploadedProgress:0, restoredProgress:0 };

    const [documentRecords, cloudPayload] = await Promise.all([
      listIdbRecords((key) => String(key || '').startsWith('reader-document:')),
      api.list()
    ]);

    let cloudBooks = (Array.isArray(cloudPayload?.books) ? cloudPayload.books : []).map(normalizeCloudBook);
    let byClient = new Map(cloudBooks.filter((book) => book.clientRecordId).map((book) => [book.clientRecordId, book]));

    const progress = readProgressStore();
    const readingList = readReadingList();
    const docsById = new Map(documentRecords.map((record) => [String(record.documentId || record.key.slice('reader-document:'.length)), record]));
    const listById = new Map(
      readingList
        .map((item) => [String(item?.documentId || item?.id || ''), item])
        .filter(([id]) => id)
    );

    const localIds = new Set([
      ...docsById.keys(),
      ...Object.keys(progress),
      ...listById.keys()
    ]);

    let createdMetadata = false;

    // Ensure every locally-known book has an account library record.
    for (const documentId of localIds) {
      if (!documentId || byClient.has(documentId)) continue;
      const metadata = localBookMetadata(
        documentId,
        docsById.get(documentId),
        progress[documentId],
        listById.get(documentId)
      );
      if (!metadata.title) continue;
      const result = await api.save(metadata);
      const book = normalizeCloudBook(result?.book || {});
      if (book.clientRecordId) {
        byClient.set(book.clientRecordId, book);
        createdMetadata = true;
      }
    }

    if (createdMetadata) {
      const refreshed = await api.list();
      cloudBooks = (Array.isArray(refreshed?.books) ? refreshed.books : []).map(normalizeCloudBook);
      byClient = new Map(cloudBooks.filter((book) => book.clientRecordId).map((book) => [book.clientRecordId, book]));
    }

    state.cloudBooks = cloudBooks.length;
    state.oversizeDocuments = 0;

    let uploadedDocuments = 0;
    let restoredDocuments = 0;
    let uploadedProgress = 0;
    let restoredProgress = 0;
    let progressChanged = false;
    let readingListChanged = false;

    // Upload local documents/progress when they are newer or missing remotely.
    for (const documentId of localIds) {
      const book = byClient.get(documentId);
      if (!book?.id) continue;

      const documentRecord = docsById.get(documentId);
      if (documentRecord?.text) {
        const bytes = new TextEncoder().encode(String(documentRecord.text)).byteLength;
        if (bytes > MAX_ACCOUNT_DOCUMENT_BYTES) {
          state.oversizeDocuments += 1;
        } else {
          const localTime = clientTimestamp(documentRecord);
          const cloudTime = Date.parse(String(book.documentUpdatedAt || '')) || 0;
          if (!book.documentStored || localTime > cloudTime + 750) {
            await api.saveDocument(book.id, String(documentRecord.text));
            uploadedDocuments += 1;
            book.documentStored = true;
            book.documentUpdatedAt = documentRecord.savedAt || new Date().toISOString();
          }
        }
      }

      const localProgress = progress[documentId];
      if (localProgress) {
        const localTime = Date.parse(String(localProgress.lastReadAt || localProgress.updatedAt || '')) || 0;
        const cloudTime = Date.parse(String(book.progressUpdatedAt || '')) || 0;
        const cloudIndex = Number.isFinite(book.playbackIndex) ? Math.max(0, book.playbackIndex) : 0;
        const localIndex = Math.max(0, Number(localProgress.lastWord ?? localProgress.furthestWord) || 0);

        if (!cloudTime || localTime > cloudTime + 750 || (localTime === cloudTime && localIndex > cloudIndex)) {
          await api.saveProgress(book.id, normalizeProgressPayload(localProgress, documentId));
          uploadedProgress += 1;
        } else if (cloudTime > localTime + 750 || cloudIndex > localIndex) {
          progress[documentId] = remoteProgressItem(book, localProgress);
          restoredProgress += 1;
          progressChanged = true;
        }
      } else if (book.progressUpdatedAt || Number.isFinite(book.playbackIndex)) {
        progress[documentId] = remoteProgressItem(book, {});
        restoredProgress += 1;
        progressChanged = true;
      }
    }

    // Restore cloud-only documents and reading-list metadata.
    for (const book of cloudBooks) {
      const documentId = book.clientRecordId;
      if (!documentId) continue;

      const localDocument = docsById.get(documentId);
      const localTime = clientTimestamp(localDocument);
      const cloudTime = Date.parse(String(book.documentUpdatedAt || '')) || 0;

      if (book.documentStored && (!localDocument?.text || cloudTime > localTime + 750)) {
        const payload = await api.loadDocument(book.id);
        const document = payload?.document;
        if (document?.text) {
          await putIdbRecord({
            key:`reader-document:${documentId}`,
            type:'reader-document',
            documentId,
            title:String(document.title || book.title || 'Untitled'),
            text:String(document.text),
            source:document.source && typeof document.source === 'object'
              ? document.source
              : book.metadata?.source || {},
            savedAt:document.updatedAt || book.documentUpdatedAt || new Date().toISOString()
          });
          restoredDocuments += 1;
        }
      }

      if (!progress[documentId] && (book.documentStored || book.progressUpdatedAt)) {
        progress[documentId] = remoteProgressItem(book, {});
        restoredProgress += 1;
        progressChanged = true;
      }

      const readingMeta = book.metadata || {};
      const remoteReadingListId = String(readingMeta.readingListId || '');
      if (remoteReadingListId && !listById.has(documentId)) {
        readingList.push({
          id:remoteReadingListId,
          documentId,
          title:book.title,
          author:book.author,
          source:readingMeta.source || {},
          sourceUrl:book.sourceUrl,
          coverUrl:book.raw?.cover_url || book.raw?.coverUrl || '',
          note:String(readingMeta.note || ''),
          status:String(readingMeta.status || 'saved'),
          addedAt:readingMeta.addedAt || new Date().toISOString()
        });
        listById.set(documentId, readingList.at(-1));
        readingListChanged = true;
      }
    }

    if (progressChanged) writeProgressStore(progress);
    if (readingListChanged) writeReadingList(readingList);

    return {
      uploadedDocuments,
      restoredDocuments,
      uploadedProgress,
      restoredProgress,
      restored: restoredDocuments + restoredProgress + (readingListChanged ? 1 : 0)
    };
  }

  function recentRestoreReloaded() {
    try {
      const value = Number(sessionStorage.getItem(RELOAD_MARKER) || 0);
      return value > 0 && Date.now() - value < 120000;
    } catch {
      return false;
    }
  }

  function scheduleReloadAfterRestore(restored) {
    if (!restored || recentRestoreReloaded()) return false;
    try { sessionStorage.setItem(RELOAD_MARKER, String(Date.now())); } catch {}
    window.setTimeout(() => location.reload(), 180);
    return true;
  }

  async function syncNow({ manual = false } = {}) {
    if (!state.authenticated) return { authenticated:false };
    if (state.syncing) return { authenticated:true, syncing:true };

    state.syncing = true;
    state.lastError = '';
    emit('syncing');

    try {
      // Give app startup migrations a moment to create/open the shared IDB store.
      let generic;
      try {
        generic = await syncGenericIndexedDbContent();
      } catch (error) {
        if (/not ready/i.test(String(error?.message || ''))) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          generic = await syncGenericIndexedDbContent();
        } else {
          throw error;
        }
      }

      const books = await syncBooksAndProgress();
      const restored = Number(generic.restored || 0) + Number(books.restored || 0);
      state.restoredThisSession += restored;
      state.lastSyncAt = new Date().toISOString();
      state.syncing = false;
      emit('synced', { generic, books, manual });

      if (restored && !manual) {
        scheduleReloadAfterRestore(restored);
      } else if (!restored) {
        try { sessionStorage.removeItem(RELOAD_MARKER); } catch {}
      }

      return {
        authenticated:true,
        generic,
        books,
        restored
      };
    } catch (error) {
      state.syncing = false;
      state.lastError = error?.message || String(error);
      console.warn('Cloud content synchronization failed.', error);
      emit('error', { error:state.lastError });
      throw error;
    }
  }

  function schedule(delay = 800) {
    window.clearTimeout(state.timer);
    if (!state.authenticated) return;
    state.timer = window.setTimeout(() => {
      void syncNow().catch(() => {});
    }, delay);
  }

  function startPolling() {
    if (state.poller) return;
    state.poller = window.setInterval(() => {
      if (state.authenticated && document.visibilityState === 'visible') {
        void syncNow().catch(() => {});
      }
    }, POLL_MS);
  }

  function acceptCloudReady() {
    state.authenticated = true;
    emit('cloud-ready');
    schedule(450);
    startPolling();
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;

    document.addEventListener('marksetgo:cloud-ready', acceptCloudReady);

    document.addEventListener('marksetgo:auth-changed', (event) => {
      state.authenticated = Boolean(event.detail?.authenticated);
      if (!state.authenticated) {
        window.clearTimeout(state.timer);
        state.lastError = '';
        emit('signed-out');
        return;
      }
      schedule(700);
      startPolling();
    });

    document.addEventListener('marksetgo:document-available', () => schedule(700));

    document.addEventListener('visibilitychange', () => {
      if (!state.authenticated) return;
      if (document.visibilityState === 'hidden') {
        void syncNow().catch(() => {});
      } else {
        schedule(500);
      }
    });

    window.addEventListener('online', () => schedule(250));
    window.addEventListener('pagehide', () => {
      if (state.authenticated) void syncNow().catch(() => {});
    });

    const bootstrap = window.MarkSetGoCloud?.state?.bootstrap;
    if (bootstrap) acceptCloudReady();

    emit('ready');
  }

  window.MarkSetGoCloudContentSync = Object.freeze({
    syncNow,
    status:publicStatus
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();
