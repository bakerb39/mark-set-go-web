'use strict';

(function registerSessionManager(global) {
  const namespace = global.MarkSetGoReader = global.MarkSetGoReader || {};

  class SessionManager {
    constructor({ dbName = 'markSetGoReaderSessionDB', storeName = 'sessions', key = 'current', fallbackKey = 'markSetGoReaderSessionFallback' } = {}) {
      this.dbName = dbName;
      this.storeName = storeName;
      this.key = key;
      this.fallbackKey = fallbackKey;
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
        localStorage.setItem('markSetGoHasReaderSession', '1');
      } catch {
        try { localStorage.setItem(this.fallbackKey, JSON.stringify(snapshot)); } catch {}
      }
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
