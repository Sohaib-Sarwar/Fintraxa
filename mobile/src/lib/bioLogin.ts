/**
 * Fingerprint sign-in (owner, 2026-11-15: "the login page should have a fingerprint icon").
 *
 * After a password sign-in the user may opt in; the sign-in (email/username + password) is then kept in
 * expo-secure-store (Android Keystore). In a Fintraxa build it is saved with `requireAuthentication`, so the
 * Keystore releases it only after a successful strong-biometric prompt — the same binding the session vault uses
 * (vault.ts). Expo Go cannot bind (Expo limitation), so there the fingerprint is a gate in front of a plainly
 * stored copy. It survives sign-out on purpose (that is when it is needed) and is cleared when it stops working
 * (password changed), when the user turns it off, or when biometrics are re-enrolled (Keystore invalidates it).
 *
 * Nothing leaves the phone: the fingerprint only unlocks the saved sign-in, which then signs in the normal way.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { signIn } from './auth';
import { biometricMode, biometricsAvailable } from './vault';

const LOGIN_ID = 'fx.login.bio';
/** Plain hint: that a fingerprint sign-in exists, and for which identifier (shown on the button). */
const HINT_ID = 'fx.login.hint';
const PROMPT = 'Sign in to Fintraxa';

export type BioLoginResult = 'ok' | 'cancelled' | 'failed' | 'unavailable';

export async function bioLoginHint(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try { return await SecureStore.getItemAsync(HINT_ID); } catch { return null; }
}

export async function canOfferBioLogin(): Promise<boolean> {
  return biometricsAvailable();
}

/** Save the sign-in behind the fingerprint. In a build this shows the system prompt once. */
export async function saveBioLogin(identifier: string, password: string): Promise<boolean> {
  const value = JSON.stringify({ id: identifier.trim(), pw: password });
  try {
    if (biometricMode === 'bound') {
      await SecureStore.setItemAsync(LOGIN_ID, value, { requireAuthentication: true, authenticationPrompt: 'Turn on fingerprint sign-in' });
    } else {
      await SecureStore.setItemAsync(LOGIN_ID, value);
    }
    await SecureStore.setItemAsync(HINT_ID, identifier.trim());
    return true;
  } catch {
    return false;
  }
}

export async function clearBioLogin(): Promise<void> {
  await Promise.all([SecureStore.deleteItemAsync(LOGIN_ID).catch(() => {}), SecureStore.deleteItemAsync(HINT_ID).catch(() => {})]);
}

/** Fingerprint → saved sign-in → normal sign-in. A sign-in the server now rejects is forgotten. */
export async function bioLogin(): Promise<BioLoginResult> {
  let raw: string | null = null;
  try {
    if (biometricMode === 'bound') {
      raw = await SecureStore.getItemAsync(LOGIN_ID, { requireAuthentication: true, authenticationPrompt: PROMPT });
    } else {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: PROMPT, cancelLabel: 'Use password', biometricsSecurityLevel: 'strong' });
      if (!r.success) return 'cancelled';
      raw = await SecureStore.getItemAsync(LOGIN_ID);
    }
  } catch (e) {
    // Cancelled prompt, or the Keystore key was invalidated by a new fingerprint enrolment.
    if (/cancel/i.test(String((e as Error)?.message))) return 'cancelled';
    await clearBioLogin();
    return 'unavailable';
  }
  if (!raw) { await clearBioLogin(); return 'unavailable'; }
  const { id, pw } = JSON.parse(raw) as { id: string; pw: string };
  try {
    await signIn(id, pw);
    return 'ok';
  } catch (e) {
    const m = String((e as Error)?.message ?? '');
    if (/invalid|credentials|password/i.test(m)) await clearBioLogin();
    throw e;
  }
}
