// psx-backfill Edge Function helpers (supabase/functions/psx-backfill/run.js). Fake summaries only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSummary, groupByDay, collect } from '../../supabase/functions/psx-backfill/run.js';

const summary = [
  '15MAY2026|FFC|0807|Fauji Fertilizer|510|515|505|512.11|1000|509.3|||',
  '15MAY2026|MCB|0807|MCB Bank|398|400|396|398.88|2000|397|||',
  '15MAY2026|XYZ|0807|Not wanted|1|1|1|1|1|1|||',
  'garbage line',
  '15MAY2026|DEAD|0807|Suspended|0|0|0|0|0|0|||',
].join('\n');

test('parseSummary keeps only the wanted symbols with a positive close', () => {
  assert.deepEqual([...parseSummary(summary, ['ffc', 'MCB', 'DEAD'])], [['FFC', 512.11], ['MCB', 398.88]]);
});

test('groupByDay orders days oldest first and groups symbols', () => {
  const g = groupByDay([{ symbol: 'MCB', day: '2026-05-15' }, { symbol: 'ffc', day: '2026-05-14' }, { symbol: 'FFC', day: '2026-05-15' }]);
  assert.deepEqual([...g].map(([d, s]) => [d, [...s].sort()]), [['2026-05-14', ['FFC']], ['2026-05-15', ['FFC', 'MCB']]]);
});

test('collect: closes from read days, holidays remembered, failures reported and retried later', async () => {
  const work = [
    { symbol: 'FFC', day: '2026-05-15' }, { symbol: 'MCB', day: '2026-05-15' }, { symbol: 'SYS', day: '2026-05-15' },
    { symbol: 'FFC', day: '2026-05-01' },   // holiday: no file
    { symbol: 'FFC', day: '2026-05-18' },   // network error
  ];
  const files = { '2026-05-15': summary };
  const r = await collect(work, {
    download: async (d) => { if (d === '2026-05-18') throw new Error('timeout'); return files[d] ? new TextEncoder().encode(files[d]) : null; },
    unzip: (bytes) => new TextDecoder().decode(bytes),
  });
  assert.deepEqual(r.closes, [{ symbol: 'FFC', day: '2026-05-15', close: 512.11 }, { symbol: 'MCB', day: '2026-05-15', close: 398.88 }]);
  assert.deepEqual(r.days, [
    { day: '2026-05-01', status: 'no_file', symbols: [] },
    { day: '2026-05-15', status: 'loaded', symbols: ['FFC', 'MCB', 'SYS'] },  // SYS did not trade: not asked again
  ]);
  assert.deepEqual(r.failed, [{ day: '2026-05-18', error: 'timeout' }]);   // not marked as read
});

test('collect stops at the deadline and leaves the rest for the next run', async () => {
  const r = await collect([{ symbol: 'FFC', day: '2026-05-15' }], { download: async () => null, unzip: () => '', deadline: Date.now() - 1 });
  assert.deepEqual(r, { closes: [], days: [], failed: [] });
});
