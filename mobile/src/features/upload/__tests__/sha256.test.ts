import { createHash } from 'crypto';
import { sha256Hex } from '../sha256';

const enc = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));

describe('sha256Hex (JS fallback for the upload hash)', () => {
  it('matches the FIPS 180-4 vectors', () => {
    expect(sha256Hex(enc(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(enc('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(enc('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
  it('matches Node for lengths around block edges and a PDF-sized buffer', () => {
    for (const n of [55, 56, 63, 64, 65, 119, 120, 1000, 250_000]) {
      const b = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 0xff);
      expect(sha256Hex(b)).toBe(createHash('sha256').update(b).digest('hex'));
    }
  });
});
