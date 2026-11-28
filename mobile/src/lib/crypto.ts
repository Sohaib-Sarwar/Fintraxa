/**
 * AES-256-GCM with expo-crypto (native Keystore-backed primitives on Android, WebCrypto on web).
 * Strings are encoded as UTF-8 here so nothing depends on TextEncoder/TextDecoder being present.
 * Ciphertext format: base64 of IV (12 bytes) ‖ ciphertext ‖ tag (16 bytes) — `AESSealedData.combined`.
 */
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';

export type Key = AESEncryptionKey;

/*
 * UTF-8 <-> string. These sit on the start-up path: the encrypted query cache (often 1–3 MB of JSON) is decoded on
 * every launch and encoded on every persist. Hermes has no JIT, so the old per-character loops (array push,
 * `s += char`) took seconds on a phone (owner, 2026-11-28: "startup is too slow"). Native TextEncoder/TextDecoder
 * are used when the runtime has them; otherwise the fallbacks below write into preallocated typed arrays and build
 * strings 8K code units at a time.
 */
type Enc = { encode(s: string): Uint8Array };
type Dec = { decode(b: Uint8Array): string };
const g = globalThis as unknown as { TextEncoder?: new () => Enc; TextDecoder?: new (label?: string) => Dec };
const nativeEncoder: Enc | null = (() => { try { return g.TextEncoder ? new g.TextEncoder() : null; } catch { return null; } })();
const nativeDecoder: Dec | null = (() => { try { return g.TextDecoder ? new g.TextDecoder('utf-8') : null; } catch { return null; } })();

/** Pure-JS UTF-8 encoder (exported for tests): one pass into a preallocated buffer. */
export function utf8EncodeJs(s: string): Uint8Array {
  const out = new Uint8Array(s.length * 3);
  let o = 0;
  for (let i = 0; i < s.length; i += 1) {
    let c = s.charCodeAt(i);
    if (c < 0x80) { out[o++] = c; continue; }
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const n = s.charCodeAt(i + 1);
      if (n >= 0xdc00 && n <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (n - 0xdc00); i += 1; }
    }
    if (c < 0x800) { out[o++] = 0xc0 | (c >> 6); out[o++] = 0x80 | (c & 63); }
    else if (c < 0x10000) { out[o++] = 0xe0 | (c >> 12); out[o++] = 0x80 | ((c >> 6) & 63); out[o++] = 0x80 | (c & 63); }
    else { out[o++] = 0xf0 | (c >> 18); out[o++] = 0x80 | ((c >> 12) & 63); out[o++] = 0x80 | ((c >> 6) & 63); out[o++] = 0x80 | (c & 63); }
  }
  return out.subarray(0, o);
}

const SLICE = 8192;
/** Pure-JS UTF-8 decoder (exported for tests): code units into a typed array, then strings in 8K slices. */
export function utf8DecodeJs(b: Uint8Array): string {
  const units = new Uint16Array(b.length);
  let u = 0;
  for (let i = 0; i < b.length;) {
    const c = b[i];
    let cp: number;
    if (c < 0x80) { units[u++] = c; i += 1; continue; }
    if (c < 0xe0) { cp = ((c & 31) << 6) | (b[i + 1] & 63); i += 2; } else if (c < 0xf0) { cp = ((c & 15) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63); i += 3; } else { cp = ((c & 7) << 18) | ((b[i + 1] & 63) << 12) | ((b[i + 2] & 63) << 6) | (b[i + 3] & 63); i += 4; }
    if (cp > 0xffff) { cp -= 0x10000; units[u++] = 0xd800 + (cp >> 10); units[u++] = 0xdc00 + (cp & 1023); } else units[u++] = cp;
  }
  const parts: string[] = [];
  for (let i = 0; i < u; i += SLICE) parts.push(String.fromCharCode.apply(null, units.subarray(i, Math.min(u, i + SLICE)) as unknown as number[]));
  return parts.join('');
}

export function utf8Encode(s: string): Uint8Array {
  return nativeEncoder ? nativeEncoder.encode(s) : utf8EncodeJs(s);
}

export function utf8Decode(b: Uint8Array): string {
  return nativeDecoder ? nativeDecoder.decode(b) : utf8DecodeJs(b);
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
