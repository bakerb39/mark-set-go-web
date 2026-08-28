'use strict';

(function registerSessionManager(global) {
  const namespace = global.MarkSetGoReader = global.MarkSetGoReader || {};

  function runtimeReaderId() {
    const explicit = String(global.__MSG_READER_ID__ || '').trim();
    if (explicit) return explicit;

    const number = Number.parseInt(global.__MSG_READER_NUMBER__ || '', 10);
    if (Number.isFinite(number) && number >= 2) return `reader-${number}`;

    return 'reader-1';
  }

  class SessionManager {
    constructor(options = {}) {
      const readerId = runtimeReaderId();
      const auxiliary = readerId !== 'reader-1';

      /*
       * Reader 1 keeps the historical keys exactly as-is for backward
       * compatibility. Reader 2+ receive independent keys inside the same
       * IndexedDB store so destroying/recreating an auxiliary Reader iframe
       * cannot overwrite another Reader's current-session snapshot.
       */
      this.dbName = options.dbName || 'markSetGoReaderSessionDB';
      this.storeName = options.storeName || 'sessions';
      this.key = options.key || (auxiliary ? `current:${readerId}` : 'current');
      this.fallbackKey = options.fallbackKey
        || (auxiliary ? `markSetGoReaderSessionFallback:${readerId}` : 'markSetGoReaderSessionFallback');
      this.hasSessionKey = options.hasSessionKey
        || (auxiliary ? `markSetGoHasReaderSession:${readerId}` : 'markSetGoHasReaderSession');
      this.readerId = readerId;
    }

    open() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Reader storage could not be opened.'));
      });
    }

    async write(snapshot) {
      try {
        const db = await this.open();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(this.storeName, 'readwrite');
          tx.objectStore(this.storeName).put(snapshot, this.key);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        db.close();
        localStorage.setItem(this.hasSessionKey, '1');
      } catch {
        try {
          localStorage.setItem(this.fallbackKey, JSON.stringify(snapshot));
          localStorage.setItem(this.hasSessionKey, '1');
        } catch {}
      }
    }

    async clear() {
      try {
        const db = await this.open();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(this.storeName, 'readwrite');
          tx.objectStore(this.storeName).delete(this.key);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      } catch {}
      try { localStorage.removeItem(this.fallbackKey); } catch {}
      try { localStorage.removeItem(this.hasSessionKey); } catch {}
    }

    async read() {
      try {
        const db = await this.open();
        const value = await new Promise((resolve, reject) => {
          const tx = db.transaction(this.storeName, 'readonly');
          const request = tx.objectStore(this.storeName).get(this.key);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error);
        });
        db.close();
        if (value) return value;
      } catch {}
      try { return JSON.parse(localStorage.getItem(this.fallbackKey) || 'null'); } catch { return null; }
    }
  }

  namespace.SessionManager = SessionManager;
})(window);
