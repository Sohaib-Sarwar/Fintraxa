/**
 * TanStack Query with an encrypted persisted cache, so a cold start paints the last known figures at once
 * ("instant first, then fresh", plan §3.7) and every tab works offline (§6.7).
 *
 * - The cache is AES-GCM encrypted with the vault's cache key (no biometric needed, §8.5) and only painted
 *   after unlock (the navigator isn't mounted while locked).
 * - Android's AsyncStorage cannot read a single value over ~2 MB (SQLite CursorWindow), so the blob is
 *   split into 512 KB chunks.
 * - One cache per user (buster = user id); signing out deletes it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { decryptString, encryptString } from './crypto';
import { webKv } from './webKv';
import { cacheKey } from './vault';

/** Where the cache lives: IndexedDB on the web build (localStorage is ~5 MB, shared with the desktop site), AsyncStorage on native. */
const kv = Platform.OS === 'web' ? webKv : AsyncStorage;
const BASE = 'fx.cache.';
const CHUNK = 512 * 1024;

export const chunkedEncryptedStorage = {
  async getItem(key: string): Promise<string | null> {
    const head = await kv.getItem(`${BASE}${key}`);
    if (!head) return null;
    const n = Number(head);
    if (!Number.isInteger(n) || n < 1 || n > 200) return null;
    const parts = await kv.multiGet(Array.from({ length: n }, (_, i) => `${BASE}${key}.${i}`));
    const cipher = parts.map(([, v]) => v ?? '').join('');
    try {
      return await decryptString(cipher, await cacheKey());
    } catch {
      await this.removeItem(key);
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    const cipher = await encryptString(value, await cacheKey());
    const n = Math.max(1, Math.ceil(cipher.length / CHUNK));
    const pairs: [string, string][] = Array.from({ length: n }, (_, i) => [`${BASE}${key}.${i}`, cipher.slice(i * CHUNK, (i + 1) * CHUNK)]);
    const old = Number(await kv.getItem(`${BASE}${key}`)) || 0;
    await kv.multiSet([...pairs, [`${BASE}${key}`, String(n)]]);
    if (old > n) await kv.multiRemove(Array.from({ length: old - n }, (_, i) => `${BASE}${key}.${n + i}`));
  },
  async removeItem(key: string): Promise<void> {
    const all = await kv.getAllKeys();
    const mine = all.filter((k) => k === `${BASE}${key}` || k.startsWith(`${BASE}${key}.`));
    if (mine.length) await kv.multiRemove(mine);
  },
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 5 minutes (owner, 2026-11-15: "not using cache, reloads"): cached figures show at once and refresh quietly
      // after that; every write invalidates what it changes, and pull-to-refresh forces a fetch.
      staleTime: 5 * 60_000,
      gcTime: 7 * 24 * 60 * 60_000, // must be ≥ maxAge of the persister, or restored data is dropped
      retry: (n, err) => n < 2 && !/JWT|permission|401|403/i.test(String((err as Error)?.message ?? '')),
      refetchOnWindowFocus: true, // = app returned to the foreground (focusManager below); only stale queries refetch
      networkMode: 'offlineFirst',
    },
    // Writes pause while offline and resume when the connection returns (queued, persisted — plan §6.7).
    mutations: { networkMode: 'online', retry: 2 },
  },
});

export const CACHE_KEY = 'query';
export const persister = createAsyncStoragePersister({
  storage: chunkedEncryptedStorage,
  key: CACHE_KEY,
  throttleTime: 2000,
});

/** Live closes are refetched anyway and the big board is cheap to slim; everything else persists. */
export const shouldPersist = (queryKey: readonly unknown[]) => queryKey[0] !== 'psx-closes';

/** Bump to discard every phone's cached data after an incompatible change to cached shapes. */
export const CACHE_VERSION = 'v2';
const OWNER_KEY = 'fx.cache.owner';

/**
 * Keeps the persisted cache to one account: called before a session is published (auth.ts `publish`), so when a
 * different user signs in on this phone the previous user's cached data is wiped before anything of it can paint.
 */
export async function claimCache(uid: string) {
  const owner = await AsyncStorage.getItem(OWNER_KEY);
  if (owner && owner !== uid) await forgetCache();
  if (owner !== uid) await AsyncStorage.setItem(OWNER_KEY, uid);
}

/** Belt and braces for sessions published before this check existed. */
export function useCacheOwner(uid: string | undefined) {
  useEffect(() => { if (uid) claimCache(uid).catch(() => {}); }, [uid]);
}

export async function forgetCache() {
  await chunkedEncryptedStorage.removeItem(CACHE_KEY);
  queryClient.clear();
}

// React Native has no browser online/focus events: wire NetInfo (offline pause/resume of writes) and
// AppState (refetch stale data when the app comes back to the foreground — plan §11.7).
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)));
if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
    return () => sub.remove();
  });
}
