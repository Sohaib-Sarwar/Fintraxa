import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { sha256Fallback, uuid } from '../../src/lib/mf/hash.js';

test('fallback SHA-256 matches the reference implementation (works over plain-http LAN dev)', () => {
  for (const n of [0, 1, 55, 56, 63, 64, 65, 1000, 250_000]) {
    const b = randomBytes(n);
    assert.equal(sha256Fallback(new Uint8Array(b)), createHash('sha256').update(b).digest('hex'), `length ${n}`);
  }
});

test('uuid() is RFC 4122 v4', () => {
  assert.match(uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
