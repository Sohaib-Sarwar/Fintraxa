/**
 * Encrypted session storage (plan M1-T3 accept): round-trip, tampering/another key → signed out cleanly,
 * ciphertext never contains the token, and the chunked query-cache store handles values over Android's
 * 2 MB AsyncStorage row limit. expo-crypto's AES is native, so it is backed here by Node's own AES-256-GCM
 * (same algorithm, IV 12 bytes ‖ ciphertext ‖ tag 16 bytes layout).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
// jest.mock calls below are hoisted above these imports by babel-jest.
import { chunkedEncryptedStorage } from '../queryClient';
import { encryptedStorage } from '../supabase';
import * as vault from '../vault';

jest.mock('expo-crypto', () => {
  const nodeCrypto = jest.requireActual('crypto') as typeof import('crypto');
  class AESEncryptionKey {
    raw: Buffer;
    constructor(k: Buffer) { this.raw = k; }
    static async generate() { return new AESEncryptionKey(nodeCrypto.randomBytes(32)); }
    static async import(hex: string) { return new AESEncryptionKey(Buffer.from(hex, 'hex')); }
    async encoded() { return this.raw.toString('hex'); }
  }
  class AESSealedData {
    buf: Buffer;
    constructor(b: Buffer) { this.buf = b; }
    static fromCombined(b64: string) { return new AESSealedData(Buffer.from(b64, 'base64')); }
    async combined() { return this.buf.toString('base64'); }
  }
  return {
    AESEncryptionKey,
    AESSealedData,
    randomUUID: () => nodeCrypto.randomUUID(),
    aesEncryptAsync: async (plain: Uint8Array, key: AESEncryptionKey) => {
      const iv = nodeCrypto.randomBytes(12);
      const c = nodeCrypto.createCipheriv('aes-256-gcm', key.raw, iv);
      const body = Buffer.concat([c.update(Buffer.from(plain)), c.final()]);
      return new AESSealedData(Buffer.concat([iv, body, c.getAuthTag()]));
    },
    aesDecryptAsync: async (sealed: AESSealedData, key: AESEncryptionKey) => {
      const b = sealed.buf;
      const d = nodeCrypto.createDecipheriv('aes-256-gcm', key.raw, b.subarray(0, 12));
      d.setAuthTag(b.subarray(b.length - 16));
      return new Uint8Array(Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]));
    },
  };
});

jest.mock('expo-secure-store', () => {
  const mem = new Map<string, string>();
  return {
    getItemAsync: async (k: string) => mem.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => { mem.set(k, v); },
    deleteItemAsync: async (k: string) => { mem.delete(k); },
  };
});

jest.mock('../env', () => ({
  env: { supabaseUrl: 'https://example.supabase.co', supabaseKey: 'sb_publishable_test', marketApi: 'https://example.test/api', webApp: 'https://example.test' },
  isExpoGo: true, isWeb: false, appVersion: '1.0.0',
}));


const SESSION = JSON.stringify({ access_token: 'eyJhbGciOi.secret.token', refresh_token: 'r3fr3sh', user: { email: 'qa@example.test' } });

beforeAll(async () => {
  await vault.openVault({ biometric: false });
});

test('session round-trips through the encrypted adapter', async () => {
  await encryptedStorage.setItem('sb-auth', SESSION);
  expect(await encryptedStorage.getItem('sb-auth')).toBe(SESSION);
});

test('what lands on disk is ciphertext: no token, no email', async () => {
  await encryptedStorage.setItem('sb-auth', SESSION);
  const raw = (await AsyncStorage.getItem('fx.sb.sb-auth'))!;
  expect(raw).toBeTruthy();
  expect(raw).not.toContain('secret');
  expect(raw).not.toContain('qa@example');
  expect(Buffer.from(raw, 'base64').toString('utf8')).not.toContain('secret');
});

test('tampered ciphertext → treated as signed out, and the bad copy is removed', async () => {
  await encryptedStorage.setItem('sb-auth', SESSION);
  const raw = (await AsyncStorage.getItem('fx.sb.sb-auth'))!;
  const bytes = Buffer.from(raw, 'base64');
  bytes[20] ^= 0xff;
  await AsyncStorage.setItem('fx.sb.sb-auth', bytes.toString('base64'));
  expect(await encryptedStorage.getItem('sb-auth')).toBeNull();
  expect(await AsyncStorage.getItem('fx.sb.sb-auth')).toBeNull();
});

test('after a vault reset (e.g. fingerprints changed) the old session cannot be read', async () => {
  await encryptedStorage.setItem('sb-auth', SESSION);
  await vault.resetVault();
  await vault.openVault({ biometric: false }); // a brand-new key
  expect(await encryptedStorage.getItem('sb-auth')).toBeNull();
});

test('while locked, reads wait for the unlock instead of failing (no signed-out flash)', async () => {
  await encryptedStorage.setItem('sb-auth', SESSION);
  vault.closeVault();
  let done = false;
  const pending = Promise.resolve(encryptedStorage.getItem('sb-auth')).then((v) => { done = true; return v; });
  await new Promise((r) => setTimeout(r, 20));
  expect(done).toBe(false);
  await vault.openVault({ biometric: false });
  expect(await pending).toBe(SESSION);
});

test('query cache: values above the 2 MB row limit are chunked, encrypted and restored exactly', async () => {
  const big = JSON.stringify({ rows: Array.from({ length: 30000 }, (_, i) => ({ id: i, note: `row ${i} – Rs ${i}.50 · محمد` })) });
  expect(big.length).toBeGreaterThan(1_000_000);
  await chunkedEncryptedStorage.setItem('q', big);
  const chunks = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('fx.cache.q.'));
  expect(chunks.length).toBeGreaterThan(2);
  expect(await chunkedEncryptedStorage.getItem('q')).toBe(big);
  // Writing a smaller value removes the stale tail chunks.
  await chunkedEncryptedStorage.setItem('q', '{"small":true}');
  expect((await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('fx.cache.q.'))).toEqual(['fx.cache.q.0']);
  await chunkedEncryptedStorage.removeItem('q');
  expect(await chunkedEncryptedStorage.getItem('q')).toBeNull();
});
