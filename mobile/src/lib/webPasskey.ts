/**
 * Fingerprint on the web build (owner, 2026-11-15: the mobile UI installed from the browser). Uses WebAuthn with the
 * phone's own platform authenticator (fingerprint / face / screen lock) and `userVerification: 'required'`:
 *   - turning fingerprint unlock on registers a local passkey for this site (its id is remembered on the phone);
 *   - unlocking asks the system for that passkey, which Android only releases after the fingerprint matches.
 * This is a local gate in front of the remembered session (like the APK's Expo Go "gate" mode) — nothing is sent
 * to a server and no password is stored. Not on native (`vault.ts` uses the Keystore there).
 */
const ID_KEY = 'fx.passkey.id';

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

const storedId = (): string | null => { try { return localStorage.getItem(ID_KEY); } catch { return null; } };

export async function passkeyAvailable(): Promise<boolean> {
  try {
    const P = (globalThis as { PublicKeyCredential?: { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> } }).PublicKeyCredential;
    return !!P?.isUserVerifyingPlatformAuthenticatorAvailable && (await P.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

export const hasPasskey = () => !!storedId();

/** Register this phone's fingerprint for Fintraxa (one system prompt). */
export async function registerPasskey(): Promise<boolean> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: random(32),
        rp: { name: 'Fintraxa', id: location.hostname },
        user: { id: random(16), name: 'fintraxa', displayName: 'Fintraxa' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60_000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    localStorage.setItem(ID_KEY, b64(cred.rawId));
    return true;
  } catch {
    return false;
  }
}

export type PasskeyResult = 'ok' | 'cancelled' | 'missing';

/** Ask for the fingerprint. 'missing' = no passkey on this phone (turned off, or site data cleared). */
export async function verifyPasskey(): Promise<PasskeyResult> {
  const id = storedId();
  if (!id) return 'missing';
  try {
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: unb64(id) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return got ? 'ok' : 'cancelled';
  } catch (e) {
    // NotAllowedError = cancelled or timed out; InvalidStateError/NotFound = the passkey is gone.
    return (e as Error)?.name === 'NotAllowedError' ? 'cancelled' : 'missing';
  }
}

export function forgetPasskey() {
  try { localStorage.removeItem(ID_KEY); } catch { /* storage blocked */ }
}
