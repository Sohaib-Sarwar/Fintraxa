/**
 * Supabase client for the phone. Same project and RLS as the web app (ref qrekpudclwesajfhrokv).
 * The session is stored encrypted (AES-256-GCM, key from the vault) in AsyncStorage; reads wait until the
 * vault is open, so nothing — not even supabase-js's own start-up — touches the session while locked.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { decryptString, encryptString } from './crypto';
import { env } from './env';
import { sessionKey } from './vault';

const PREFIX = 'fx.sb.';

/**
 * Ending the previous session on a fresh start (closing the app signs out — owner's rule) used to go through
 * `supabase.auth.signOut()`, which first refreshes an expired token and then calls /logout — two network round trips
 * before the login page could appear (owner, 2026-11-28: "takes time to load the login page"). Now, while
 * `discarding` is on, every stored session read is captured and deleted instead of returned, so supabase-js starts
 * signed out with no network at all; the captured sessions are revoked on the server in the background
 * (`revokeInBackground`).
 */
let discarding = false;
const captured: string[] = [];

/** From now until `stopDiscarding()`, stored sessions are taken out of storage instead of being loaded. */
export function startDiscarding() { discarding = true; }
export function stopDiscarding() { discarding = false; }

/** Every stored session (decrypted), removed from the phone. Call after the vault is open. */
export async function takeStoredSessions(): Promise<string[]> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
  if (keys.length) {
    const key = await sessionKey();
    for (const [, raw] of await AsyncStorage.multiGet(keys)) {
      if (raw) captured.push(await decryptString(raw, key).catch(() => ''));
    }
    await AsyncStorage.multiRemove(keys);
  }
  return captured.splice(0).filter(Boolean);
}

export const encryptedStorage: SupportedStorage = {
  async getItem(key) {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    try {
      const value = await decryptString(raw, await sessionKey());
      if (discarding) { captured.push(value); await AsyncStorage.removeItem(PREFIX + key); return null; }
      return value;
    } catch {
      // Written under another key (vault reset) or corrupted: treat as signed out, cleanly.
      await AsyncStorage.removeItem(PREFIX + key);
      return null;
    }
  },
  async setItem(key, value) {
    await AsyncStorage.setItem(PREFIX + key, await encryptString(value, await sessionKey()));
  },
  async removeItem(key) {
    await AsyncStorage.removeItem(PREFIX + key);
  },
};

export const supabase = createClient(env.supabaseUrl, env.supabaseKey, {
  auth: {
    storage: encryptedStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/** Remove every stored session copy (sign-out, account switch, invalidated fingerprint). */
export async function wipeStoredSession() {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}

// Refresh tokens only while the app is on screen (Supabase's recommended React Native pattern).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

const REVOKE_KEY = 'fx.revoke.pending';
const timeoutFetch = (url: string, init: RequestInit) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15_000);
  return fetch(url, { ...init, signal: ctl.signal }).finally(() => clearTimeout(t));
};

/** End one stored session on the server: refresh first when its access token has expired, then /logout (this device). */
async function revokeOne(raw: string): Promise<boolean> {
  let s: { access_token?: string; refresh_token?: string; expires_at?: number; currentSession?: unknown } | null = null;
  try { s = JSON.parse(raw); } catch { return true; }
  const sess = (s?.currentSession ?? s) as { access_token?: string; refresh_token?: string; expires_at?: number } | null;
  if (!sess?.refresh_token && !sess?.access_token) return true; // not a session (code verifier, user copy)
  const headers = { apikey: env.supabaseKey, 'Content-Type': 'application/json' };
  let token = sess.access_token;
  if (!token || !sess.expires_at || sess.expires_at * 1000 < Date.now() + 30_000) {
    if (!sess.refresh_token) return true;
    const r = await timeoutFetch(`${env.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers, body: JSON.stringify({ refresh_token: sess.refresh_token }) });
    if (r.status >= 400 && r.status < 500) return true; // already revoked / expired: nothing left to end
    if (!r.ok) return false;
    token = (await r.json())?.access_token;
    if (!token) return false;
  }
  const out = await timeoutFetch(`${env.supabaseUrl}/auth/v1/logout?scope=local`, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${token}` } });
  return out.ok || (out.status >= 400 && out.status < 500);
}

/**
 * Revoke sessions taken off the phone, off the start-up path. Offline or failing ones are kept (encrypted with the
 * session key) and retried on the next start, so a closed app's session is always ended on the server eventually.
 */
export function revokeInBackground(raws: string[]) {
  (async () => {
    const key = await sessionKey();
    let pending = raws;
    const prev = await AsyncStorage.getItem(REVOKE_KEY);
    if (prev) { try { pending = [...pending, ...JSON.parse(await decryptString(prev, key))]; } catch { /* other key */ } }
    if (!pending.length) return;
    const left: string[] = [];
    for (const raw of pending) { if (!(await revokeOne(raw).catch(() => false))) left.push(raw); }
    if (left.length) await AsyncStorage.setItem(REVOKE_KEY, await encryptString(JSON.stringify(left.slice(-5)), key));
    else await AsyncStorage.removeItem(REVOKE_KEY);
  })().catch(() => {});
}
