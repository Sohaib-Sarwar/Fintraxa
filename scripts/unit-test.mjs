#!/usr/bin/env node
/**
 * Unit tests for the client-side query layer in src/lib/api.js.
 *
 * A static host cannot answer `?q=`, `?limit=` or `?sort_by=`, so all of that
 * moved into the browser. That logic now decides which rows a user sees and in
 * what order — it is worth testing on its own, without the network.
 *
 *   node scripts/unit-test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { applyQuery, slugify } from '../src/lib/api.js';

const envelope = (rows) => ({
  count: rows.length, total_filtered: rows.length, total: rows.length,
  offset: 0, limit: null, freshness: { state: 'fresh' }, data: rows,
});

const STOCKS = envelope([
  { symbol: 'OGDC', name: 'Oil & Gas Development', sector: 'OIL & GAS', current: 316.24, change_pct: 1.2, pe_ratio: 4.1, indices: ['KSE100', 'KSE30'], is_etf: false },
  { symbol: 'HUBC', name: 'Hub Power Company', sector: 'POWER GENERATION', current: 199.0, change_pct: -0.8, pe_ratio: 6.3, indices: ['KSE100'], is_etf: false },
  { symbol: 'FCCL', name: 'Fauji Cement', sector: 'CEMENT', current: 40.5, change_pct: 3.4, pe_ratio: null, indices: [], is_etf: false },
  { symbol: 'MEBL', name: 'Meezan Bank', sector: 'COMMERCIAL BANKS', current: 280.1, change_pct: 0.0, pe_ratio: 9.9, indices: ['KSE100', 'KMI30'], is_etf: false },
]);

const FIELDS = ['symbol', 'name', 'sector'];

test('applyQuery returns every row when no options are given', () => {
  const out = applyQuery(STOCKS, {}, FIELDS);
  assert.equal(out.data.length, 4);
  assert.equal(out.total_filtered, 4);
});

test('applyQuery preserves the freshness envelope', () => {
  // The UI reads freshness off the same object it reads rows from; dropping it
  // during filtering would silently blank the "prices as of" label.
  assert.equal(applyQuery(STOCKS, { limit: 1 }, FIELDS).freshness.state, 'fresh');
});

test('search matches across every listed field, case-insensitively', () => {
  assert.deepEqual(applyQuery(STOCKS, { search: 'ogdc' }, FIELDS).data.map((r) => r.symbol), ['OGDC']);
  assert.deepEqual(applyQuery(STOCKS, { search: 'meezan' }, FIELDS).data.map((r) => r.symbol), ['MEBL']);
  assert.deepEqual(applyQuery(STOCKS, { search: 'CEMENT' }, FIELDS).data.map((r) => r.symbol), ['FCCL']);
});

test('search is skipped when the caller names no searchable fields', () => {
  // Deliberate: boards like gainers.json are filtered server-side and pass no
  // searchFields, so a stray `search` option must not silently empty them.
  assert.equal(applyQuery(STOCKS, { search: 'ogdc' }, []).data.length, 4);
});

test('a blank search is not a filter', () => {
  assert.equal(applyQuery(STOCKS, { search: '   ' }, FIELDS).data.length, 4);
});

test('equality filters match scalars case-insensitively', () => {
  assert.deepEqual(applyQuery(STOCKS, { sector: 'cement' }, FIELDS).data.map((r) => r.symbol), ['FCCL']);
});

test('equality filters match array membership', () => {
  // `indices` is an array on every stock record; filtering by index is how a
  // KSE100-only view would be built.
  const out = applyQuery(STOCKS, { indices: 'KMI30' }, FIELDS);
  assert.deepEqual(out.data.map((r) => r.symbol), ['MEBL']);
});

test('boolean filters compare as booleans, not strings', () => {
  assert.equal(applyQuery(STOCKS, { is_etf: 'false' }, FIELDS).data.length, 4);
  assert.equal(applyQuery(STOCKS, { is_etf: 'true' }, FIELDS).data.length, 0);
});

test('sort descending is the default direction', () => {
  const out = applyQuery(STOCKS, { sortBy: 'current' }, FIELDS);
  assert.deepEqual(out.data.map((r) => r.symbol), ['OGDC', 'MEBL', 'HUBC', 'FCCL']);
});

test('sort ascending is honoured', () => {
  const out = applyQuery(STOCKS, { sortBy: 'current', order: 'asc' }, FIELDS);
  assert.deepEqual(out.data.map((r) => r.symbol), ['FCCL', 'HUBC', 'MEBL', 'OGDC']);
});

test('rows with a null sort key go last in both directions', () => {
  // A "lowest P/E" board must not open with a company that has no P/E.
  const asc = applyQuery(STOCKS, { sortBy: 'pe_ratio', order: 'asc' }, FIELDS);
  const desc = applyQuery(STOCKS, { sortBy: 'pe_ratio', order: 'desc' }, FIELDS);
  assert.equal(asc.data.at(-1).symbol, 'FCCL');
  assert.equal(desc.data.at(-1).symbol, 'FCCL');
});

test('sorting does not mutate the source array', () => {
  // The payload is shared between every caller of the same cached dataset;
  // an in-place sort would reorder the list under five other components.
  const before = STOCKS.data.map((r) => r.symbol);
  applyQuery(STOCKS, { sortBy: 'current' }, FIELDS);
  assert.deepEqual(STOCKS.data.map((r) => r.symbol), before);
});

test('limit and offset paginate, and total_filtered reports the pre-page count', () => {
  const out = applyQuery(STOCKS, { sortBy: 'current', limit: 2, offset: 1 }, FIELDS);
  assert.deepEqual(out.data.map((r) => r.symbol), ['MEBL', 'HUBC']);
  assert.equal(out.count, 2);
  assert.equal(out.total_filtered, 4);
  assert.equal(out.offset, 1);
});

test('filter, sort and page compose in that order', () => {
  const out = applyQuery(STOCKS, { search: 'a', sortBy: 'current', order: 'asc', limit: 2 }, FIELDS);
  assert.ok(out.total_filtered >= out.data.length);
  assert.ok(out.data.every((r, i, a) => i === 0 || a[i - 1].current <= r.current));
});

test('a malformed payload yields an empty result rather than throwing', () => {
  for (const bad of [null, undefined, {}, { data: null }, { data: 'nope' }]) {
    assert.equal(applyQuery(bad, { search: 'x' }, FIELDS).data.length, 0);
  }
});

test('slugify matches the service, so generated paths resolve', () => {
  // These must stay byte-identical to build_static_api.py's slugify — they
  // become endpoint paths.
  assert.equal(slugify('Shariah Compliant Money Market'), 'shariah-compliant-money-market');
  assert.equal(slugify('OIL & GAS EXPLORATION COMPANIES'), 'oil-gas-exploration-companies');
  assert.equal(slugify('KSE100'), 'kse100');
  assert.equal(slugify('  Aggressive  Fixed Income '), 'aggressive-fixed-income');
  assert.equal(slugify(''), 'other');
  assert.equal(slugify(null), 'other');
  assert.equal(slugify('---'), 'other');
});
