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

export const encryptedStorage: SupportedStorage = {
  async getItem(key) {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    try {
      return await decryptString(raw, await sessionKey());
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
