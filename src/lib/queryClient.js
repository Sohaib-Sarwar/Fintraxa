/**
 * The app's one QueryClient, and its copy on the device.
 *
 * Why persist: every page reads several Supabase tables. On a reload the first
 * request has to open a fresh connection to the database region, and the page
 * stayed empty until every query had answered (3 to 5 seconds), then appeared
 * all at once. With the last good answers kept in IndexedDB, a reload paints
 * the previous figures at once and refreshes them in the background
 * (stale-while-revalidate): the same data the user saw a moment ago, never a
 * blank screen.
 *
 * Privacy: the copy belongs to one signed-in user. It is stored with that
 * user's id, restored only for the same user, and deleted on sign-out. Market
 * data (PSX / MUFAP, public, large, and fast from a CDN) is not stored.
 */
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      // Kept long enough to be restored after a reload the next day.
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: { retry: 0 },
  },
});

/* ── A tiny IndexedDB key-value store (no dependency). Falls back to nothing. ── */
const DB = 'fintraxa-cache';
const STORE = 'kv';
let dbPromise = null;
const db = () => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
};
const tx = async (mode, fn) => {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
};
const idbStorage = {
  getItem: (k) => tx('readonly', (s) => s.get(k)).catch(() => null),
  setItem: (k, v) => tx('readwrite', (s) => s.put(v, k)).catch(() => {}),
  removeItem: (k) => tx('readwrite', (s) => s.delete(k)).catch(() => {}),
};

/* ── Whose data: the signed-in user's id, read synchronously from Supabase's stored session. ── */
export function currentUserId() {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (/^sb-.+-auth-token$/.test(k)) return JSON.parse(localStorage.getItem(k))?.user?.id ?? null;
    }
  } catch { /* storage blocked */ }
  return null;
}

const KEY = 'fintraxa-query-cache';
const base = createAsyncStoragePersister({ storage: idbStorage, key: KEY, throttleTime: 1500 });

/** The persister, scoped to the signed-in user: a copy saved by someone else is never restored. */
export const persister = {
  persistClient: (client) => {
    const owner = currentUserId();
    return owner ? base.persistClient({ ...client, buster: `${client.buster}|${owner}` }) : undefined;
  },
  restoreClient: async () => {
    const owner = currentUserId();
    const saved = await base.restoreClient();
    if (!owner || !saved || !String(saved.buster ?? '').endsWith(`|${owner}`)) return undefined;
    return { ...saved, buster: String(saved.buster).slice(0, -(owner.length + 1)) };
  },
  removeClient: () => base.removeClient(),
};

/** Bump when a stored query's shape changes, so an old copy is thrown away instead of misread. */
export const CACHE_VERSION = 'v1';

/** Public market data is fetched fresh (it is large and served from a CDN); everything else that succeeded is kept. */
export const shouldPersist = (query) => query.state.status === 'success'
  && !['psx', 'mufap'].includes(query.queryKey?.[0])
  && query.meta?.persist !== false;

export const persistOptions = {
  persister,
  maxAge: 24 * 60 * 60 * 1000,
  buster: CACHE_VERSION,
  dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
};

/** Sign-out: nothing of this user's stays in memory or on the device. */
export async function forgetUserData() {
  queryClient.clear();
  await persister.removeClient();
}
