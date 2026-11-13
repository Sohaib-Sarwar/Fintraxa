/**
 * The vault holds the AES key that encrypts the Supabase session on disk (plan §8).
 *
 * - The key lives in expo-secure-store (Android Keystore). With fingerprint on, in a Fintraxa build, it is
 *   stored with `requireAuthentication` — Keystore releases it only after a successful biometric prompt, so
 *   the session is cryptographically bound to the fingerprint, not just hidden behind a screen.
 * - Expo Go cannot use `requireAuthentication` (Expo's documented limitation), so there the key is stored
 *   plainly and the fingerprint is a gate in front of it (`mode: 'gate'`). Same UX; weaker binding. Release
 *   builds always use the bound mode.
 * - After unlock the key is kept in memory only, so token refreshes never trigger more prompts
 *   (SecureStore with `requireAuthentication` prompts on save and on read).
 * - Lock drops the in-memory key; storage reads then wait until the vault opens again.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { keyFromHex, keyToHex, newKey, type Key } from './crypto';
import { isExpoGo } from './env';

const PLAIN_ID = 'fx.session.key';
const BOUND_ID = 'fx.session.key.bio';
const CACHE_ID = 'fx.cache.key';

export type BiometricMode = 'bound' | 'gate';
export const biometricMode: BiometricMode = isExpoGo || Platform.OS === 'web' ? 'gate' : 'bound';

export type OpenResult = 'ok' | 'cancelled' | 'invalidated' | 'unavailable';

// ── key storage (SecureStore on device; localStorage on web, which is a dev/verification target only) ──
const webStore = {
  get: (k: string) => { try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; } },
  set: (k: string, v: string) => { try { globalThis.localStorage?.setItem(k, v); } catch { /* private mode */ } },
  del: (k: string) => { try { globalThis.localStorage?.removeItem(k); } catch { /* private mode */ } },
};
const store = {
  get: (k: string, o?: SecureStore.SecureStoreOptions) => (Platform.OS === 'web' ? Promise.resolve(webStore.get(k)) : SecureStore.getItemAsync(k, o)),
  set: (k: string, v: string, o?: SecureStore.SecureStoreOptions) => (Platform.OS === 'web' ? Promise.resolve(webStore.set(k, v)) : SecureStore.setItemAsync(k, v, o)),
  del: (k: string) => (Platform.OS === 'web' ? Promise.resolve(webStore.del(k)) : SecureStore.deleteItemAsync(k)),
};

// ── in-memory state ──
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

let current: Key | null = null;
let waiting = deferred<Key>();
const listeners = new Set<(open: boolean) => void>();

/** Resolves with the session key once the vault is open (immediately if it already is). */
export const sessionKey = (): Promise<Key> => (current ? Promise.resolve(current) : waiting.promise);
export const isOpen = () => current !== null;
export function onVaultChange(fn: (open: boolean) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

function setOpen(k: Key) {
  current = k;
  waiting.resolve(k);
  listeners.forEach((l) => l(true));
}

/** Lock: forget the key. Anything reading the session now waits for the next unlock. */
export function closeVault() {
  if (!current) return;
  current = null;
  waiting = deferred<Key>();
  listeners.forEach((l) => l(false));
}

const PROMPT = { promptMessage: 'Unlock Fintraxa', cancelLabel: 'Use password', biometricsSecurityLevel: 'strong' as const };

export async function biometricsAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const [hw, enrolled, level] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync(), LocalAuthentication.getEnrolledLevelAsync(),
    ]);
    return hw && enrolled && level >= LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG;
  } catch {
    return false;
  }
}

/** System biometric prompt only (no key involved) — used to confirm sensitive actions. */
export async function confirmWithBiometrics(message = 'Confirm it’s you'): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({ ...PROMPT, promptMessage: message, cancelLabel: 'Cancel' });
    return r.success;
  } catch {
    return false;
  }
}

async function readOrCreatePlainKey(): Promise<Key> {
  const hex = await store.get(PLAIN_ID);
  if (hex) return keyFromHex(hex);
  const k = await newKey();
  await store.set(PLAIN_ID, await keyToHex(k));
  return k;
}

/**
 * Open the vault. With `biometric`, shows the system prompt first (bound: Keystore releases the key;
 * gate: LocalAuthentication then the plain key). Without, reads (or on first launch creates) the plain key.
 */
export async function openVault({ biometric }: { biometric: boolean }): Promise<OpenResult> {
  if (current) return 'ok';
  if (!biometric) {
    setOpen(await readOrCreatePlainKey());
    return 'ok';
  }
  if (!(await biometricsAvailable())) return 'invalidated';
  if (biometricMode === 'gate') {
    const r = await LocalAuthentication.authenticateAsync(PROMPT);
    if (!r.success) return r.error === 'not_enrolled' || r.error === 'not_available' ? 'invalidated' : 'cancelled';
    setOpen(await readOrCreatePlainKey());
    return 'ok';
  }
  try {
    const hex = await SecureStore.getItemAsync(BOUND_ID, { requireAuthentication: true, authenticationPrompt: PROMPT.promptMessage });
    if (!hex) return 'invalidated';
    setOpen(await keyFromHex(hex));
    return 'ok';
  } catch (e) {
    // A new fingerprint enrolled or biometrics removed permanently invalidates the Keystore key.
    const msg = String((e as Error)?.message ?? e);
    if (/invalidat|not.?enrolled|no.?biometric|KeyPermanently/i.test(msg)) return 'invalidated';
    return 'cancelled';
  }
}

/**
 * Turn fingerprint unlock on: one prompt; in bound mode the key moves into biometric-protected storage
 * (the plain copy is deleted). Requires the vault to be open.
 */
export async function enableBiometricKey(): Promise<boolean> {
  if (!current || !(await biometricsAvailable())) return false;
  if (biometricMode === 'gate') return confirmWithBiometrics('Turn on fingerprint unlock');
  try {
    await SecureStore.setItemAsync(BOUND_ID, await keyToHex(current), { requireAuthentication: true, authenticationPrompt: 'Turn on fingerprint unlock' });
    await store.del(PLAIN_ID);
    return true;
  } catch {
    return false;
  }
}

/** Turn fingerprint unlock off: the key goes back to plain (still Keystore-encrypted) storage. */
export async function disableBiometricKey(): Promise<void> {
  if (!current) return;
  await store.set(PLAIN_ID, await keyToHex(current));
  if (biometricMode === 'bound') await store.del(BOUND_ID).catch(() => {});
}

/** After an invalidation or sign-out wipe: forget every session key; the next open creates a fresh one. */
export async function resetVault(): Promise<void> {
  current = null;
  waiting = deferred<Key>();
  await Promise.all([store.del(PLAIN_ID), store.del(BOUND_ID)].map((p) => p.catch(() => {})));
  listeners.forEach((l) => l(false));
}

/** Key for the persisted query cache: never biometric, so hydration can run while the prompt is up (§8.5). */
let cacheKeyPromise: Promise<Key> | null = null;
export function cacheKey(): Promise<Key> {
  cacheKeyPromise ??= (async () => {
    const hex = await store.get(CACHE_ID);
    if (hex) return keyFromHex(hex);
    const k = await newKey();
    await store.set(CACHE_ID, await keyToHex(k));
    return k;
  })();
  return cacheKeyPromise;
}
