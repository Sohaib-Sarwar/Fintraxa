/** The device copy of query data (src/lib/queryClient.js): what is kept, and whose it is. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
};
const { shouldPersist, currentUserId, persister } = await import('../../src/lib/queryClient.js');
const q = (key, status = 'success', meta) => ({ queryKey: key, state: { status }, meta });

test('kept: the user\'s own successful queries; not kept: market data, failures, opted-out queries', () => {
  assert.equal(shouldPersist(q(['ie-all-transactions'])), true);
  assert.equal(shouldPersist(q(['mf-ledger', 'u1'])), true);
  assert.equal(shouldPersist(q(['psx', 'prices'])), false);     // public, large, from a CDN
  assert.equal(shouldPersist(q(['mufap', 'funds'])), false);
  assert.equal(shouldPersist(q(['profile'], 'error')), false);
  assert.equal(shouldPersist(q(['x'], 'success', { persist: false })), false);
});

test('owned by the signed-in user: nothing is saved or restored without one', async () => {
  assert.equal(currentUserId(), null);
  assert.equal(await persister.restoreClient(), undefined);
  assert.equal(persister.persistClient({ buster: 'v1', timestamp: 1, clientState: { queries: [] } }), undefined);
  store.set('sb-ref-auth-token', JSON.stringify({ user: { id: 'user-123' } }));
  assert.equal(currentUserId(), 'user-123');
});
