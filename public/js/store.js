/*
 * store.js
 * Saves the visitor's own cards in IndexedDB, inside their browser only.
 * Images are stored as Blobs; card.image / card.fg become object URLs on read.
 * Falls back to an in-memory store when IndexedDB is unavailable
 * (private windows, some file:// setups).
 */
(function () {
  "use strict";
  const HC = (window.HC = window.HC || {});

  const DB_NAME = "holo-cards";
  const STORE = "cards";
  let dbPromise = null;
  const memory = new Map();
  let useMemory = false;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          useMemory = true;
          resolve(null);
        };
        req.onblocked = () => {
          useMemory = true;
          resolve(null);
        };
      } catch (e) {
        useMemory = true;
        resolve(null);
      }
    });
    return dbPromise;
  }

  function tx(db, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const s = t.objectStore(STORE);
      let result;
      Promise.resolve(fn(s)).then((r) => (result = r));
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  function reqP(r) {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  /* Object URLs are cached per card version, so every read of the same
     record returns the same URL and older versions are released. */
  const urlCache = new Map();
  function urlFor(key, stamp, blob) {
    if (!blob) return "";
    const hit = urlCache.get(key);
    if (hit && hit.stamp === stamp) return hit.url;
    if (hit) URL.revokeObjectURL(hit.url);
    const url = URL.createObjectURL(blob);
    urlCache.set(key, { stamp, url });
    return url;
  }

  function hydrate(rec) {
    if (!rec) return null;
    const stamp = rec.updatedAt || rec.createdAt || 0;
    return Object.assign({}, rec, {
      image: urlFor(rec.id + ":bg", stamp, rec.imageBlob),
      fg: urlFor(rec.id + ":fg", stamp, rec.fgBlob),
      own: true,
    });
  }

  HC.store = {
    get persistent() {
      return !useMemory;
    },

    async list() {
      const db = await open();
      let rows;
      if (!db) rows = Array.from(memory.values());
      else rows = await tx(db, "readonly", (s) => reqP(s.getAll()));
      rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return rows.map(hydrate);
    },

    async get(id) {
      const db = await open();
      if (!db) return hydrate(memory.get(id));
      return hydrate(await tx(db, "readonly", (s) => reqP(s.get(id))));
    },

    /** rec must carry imageBlob (and optionally fgBlob). Returns the id. */
    async put(rec) {
      const clean = Object.assign({}, rec);
      delete clean.image;
      delete clean.fg;
      delete clean.own;
      if (!clean.id) clean.id = HC.uid();
      if (!clean.createdAt) clean.createdAt = Date.now();
      clean.updatedAt = Date.now();
      const db = await open();
      if (!db) memory.set(clean.id, clean);
      else await tx(db, "readwrite", (s) => reqP(s.put(clean)));
      return clean.id;
    },

    async remove(id) {
      ["bg", "fg"].forEach((k) => {
        const hit = urlCache.get(id + ":" + k);
        if (hit) URL.revokeObjectURL(hit.url);
        urlCache.delete(id + ":" + k);
      });
      const db = await open();
      if (!db) memory.delete(id);
      else await tx(db, "readwrite", (s) => reqP(s.delete(id)));
    },

    /** The raw record including Blobs (for export / editing). */
    async raw(id) {
      const db = await open();
      if (!db) return memory.get(id) || null;
      return tx(db, "readonly", (s) => reqP(s.get(id)));
    },
  };

  HC.uid = function () {
    const a = new Uint8Array(6);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => (a[i] = Math.random() * 256));
    return "c" + Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
  };
})();
