/**
 * AES-256-GCM with expo-crypto (native Keystore-backed primitives on Android, WebCrypto on web).
 * Strings are encoded as UTF-8 here so nothing depends on TextEncoder/TextDecoder being present.
 * Ciphertext format: base64 of IV (12 bytes) ‖ ciphertext ‖ tag (16 bytes) — `AESSealedData.combined`.
 */
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';

export type Key = AESEncryptionKey;

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 1) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const n = s.charCodeAt(i + 1);
      if (n >= 0xdc00 && n <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (n - 0xdc00); i += 1; }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function utf8Decode(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length;) {
    const c = b[i];
    let cp: number;
    if (c < 0x80) { cp = c; i += 1; } else if (c < 0xe0) { cp = ((c & 31) << 6) | (b[i + 1] & 63); i += 2; } else if (c < 0xf0) { cp = ((c & 15) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63); i += 3; } else { cp = ((c & 7) << 18) | ((b[i + 1] & 63) << 12) | ((b[i + 2] & 63) << 6) | (b[i + 3] & 63); i += 4; }
    if (cp > 0xffff) { cp -= 0x10000; s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023)); } else s += String.fromCharCode(cp);
  }
  return s;
}

export const newKey = () => AESEncryptionKey.generate();
export const keyFromHex = (hex: string) => AESEncryptionKey.import(hex, 'hex');
export const keyToHex = (k: Key) => k.encoded('hex');

export async function encryptString(plain: string, key: Key): Promise<string> {
  const sealed = await aesEncryptAsync(utf8Encode(plain), key);
  return sealed.combined('base64');
}

/** Throws if the data was tampered with or encrypted under another key (GCM tag check). */
export async function decryptString(b64: string, key: Key): Promise<string> {
  const sealed = AESSealedData.fromCombined(b64);
  const bytes = await aesDecryptAsync(sealed, key, { output: 'bytes' });
  return utf8Decode(bytes as Uint8Array);
}
