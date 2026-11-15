/**
 * IndexedDB key-value store for the web build's persisted query cache (owner, 2026-11-15: "production-level, load
 * instantly from cache"). On the web AsyncStorage is localStorage — about 5 MB per site, shared with the desktop
 * app — and a full ledger cache can exceed it, at which point persisting silently stops and every start downloads
 * everything again. IndexedDB has far more room and doesn't block the page while writing.
 * Same get/multiGet/multiSet/remove shape the chunked cache storage uses. Native keeps AsyncStorage.
 */
const DB = 'fintraxa-mobile';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then((d) => new Promise<T | undefined>((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const webKv = {
  getItem: async (key: string) => ((await run<string>('readonly', (s) => s.get(key))) ?? null) as string | null,
  multiGet: async (keys: string[]): Promise<[string, string | null][]> => {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly');
      const s = tx.objectStore(STORE);
      const reqs = keys.map((k) => s.get(k));
      tx.oncomplete = () => resolve(keys.map((k, i) => [k, (reqs[i].result as string | undefined) ?? null]));
      tx.onerror = () => reject(tx.error);
    });
  },
  multiSet: async (pairs: [string, string][]) => { await run('readwrite', (s) => { for (const [k, v] of pairs) s.put(v, k); }); },
  setItem: async (key: string, value: string) => { await run('readwrite', (s) => s.put(value, key)); },
  multiRemove: async (keys: string[]) => { await run('readwrite', (s) => { for (const k of keys) s.delete(k); }); },
  getAllKeys: async () => ((await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())) ?? []).map(String),
};
