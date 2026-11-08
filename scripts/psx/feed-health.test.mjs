// Stale market data warning (src/lib/market/health.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedSession, workingDaysBehind, staleFeeds } from '../../src/lib/market/health.js';

const at = (pkt) => new Date(Date.parse(`${pkt}+05:00`)); // a moment in Pakistan time

test('expected session: the previous weekday after the 08:15 capture, one more day back before it', () => {
  assert.equal(expectedSession(at('2026-11-10T10:00:00')), '2026-11-09');  // Tue morning → Mon
  assert.equal(expectedSession(at('2026-11-10T06:00:00')), '2026-11-06');  // Tue before capture → Fri (skips the weekend)
  assert.equal(expectedSession(at('2026-11-09T09:00:00')), '2026-11-06');  // Mon → Fri
  assert.equal(expectedSession(at('2026-11-08T12:00:00')), '2026-11-06');  // Sun → Fri
});

test('working days behind skip weekends; one day behind is tolerated (holiday), two is stale', () => {
  assert.equal(workingDaysBehind('2026-11-06', '2026-11-06'), 0);
  assert.equal(workingDaysBehind('2026-11-06', '2026-11-09'), 1);
  assert.equal(workingDaysBehind('2026-11-05', '2026-11-09'), 2);
  const rows = [
    { feed: 'psx', latest_data: '2026-11-06' },
    { feed: 'mufap', latest_data: '2026-11-04', last_error: 'HTTP 503' },
    { feed: 'psx_indices', latest_data: null },
  ];
  assert.deepEqual(staleFeeds(rows, at('2026-11-10T10:00:00')).map((f) => [f.feed, f.behind, f.error]), [
    ['mufap', 3, 'HTTP 503'], ['psx_indices', Infinity, null],
  ]); // psx is 1 behind on Tuesday (Monday not in yet): fine
});
