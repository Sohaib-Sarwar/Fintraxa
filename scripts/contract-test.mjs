#!/usr/bin/env node
/**
 * Contract test: does the live market data service still return the fields
 * Fintraxa reads?
 *
 * The app has no control over this service. It publishes on its own schedule,
 * and a renamed field there is a silently wrong number here — a portfolio
 * valued at cost while the UI presents it as a market value. That class of
 * failure does not throw, so nothing catches it without a test like this.
 *
 * Every field asserted below is one the app actually reads. When a check
 * fails, the fix is either in the service or at the named call site — not in
 * this file.
 *
 *   node scripts/contract-test.mjs
 *   node scripts/contract-test.mjs --base https://example.com/api
 */

const argBase = process.argv.indexOf('--base');
const BASE = (argBase > -1 ? process.argv[argBase + 1] : null)
  || process.env.VITE_API_BASE_URL
  || 'https://sohaib-sarwar.github.io/PSX-MUFAP-MicroService/api';

let failures = 0;
let checks = 0;

const ok = (label) => { checks += 1; console.log(`  \u001b[32m✓\u001b[0m ${label}`); };
const bad = (label, detail) => {
  checks += 1; failures += 1;
  console.log(`  \u001b[31m✗\u001b[0m ${label}`);
  if (detail) console.log(`      ${detail}`);
};

function check(label, condition, detail) {
  condition ? ok(label) : bad(label, detail);
}

async function get(path) {
  const res = await fetch(`${BASE}/${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
  return res.json();
}

/**
 * Collection files wrap their rows in `data`; single-object files (summary,
 * market-status, stats) put the fields at the top level beside `freshness`.
 * `unwrap` in src/lib/api.js resolves both the same way, so the test does too
 * — otherwise it would assert a shape the app never sees.
 */
const unwrap = (payload) => payload?.data ?? payload;

/** Every field present on the record, with a usable (non-null) value somewhere. */
function assertFields(label, rows, fields, { allowNullOn = [] } = {}) {
  const sample = rows[0];
  if (!sample) return bad(label, 'no rows returned');
  const missing = fields.filter((f) => !(f in sample));
  if (missing.length) {
    return bad(label, `missing field(s): ${missing.join(', ')}`);
  }
  // A field present on every row but null on every row is as useless as an
  // absent one, and that is exactly how a silent upstream change shows up.
  const alwaysNull = fields
    .filter((f) => !allowNullOn.includes(f))
    .filter((f) => rows.every((r) => r[f] === null || r[f] === undefined));
  if (alwaysNull.length) {
    return bad(label, `field(s) null on all ${rows.length} rows: ${alwaysNull.join(', ')}`);
  }
  ok(`${label} (${fields.length} fields, ${rows.length} rows)`);
}

const ENVELOPE = ['count', 'total_filtered', 'total', 'offset', 'limit', 'freshness', 'data'];

async function main() {
  console.log(`\nContract test against ${BASE}\n`);

  // ── Envelope ──────────────────────────────────────────────────────────
  console.log('Envelope');
  const stocks = await get('psx/stocks.json');
  check(
    'psx/stocks.json carries the standard envelope',
    ENVELOPE.every((k) => k in stocks),
    `missing: ${ENVELOPE.filter((k) => !(k in stocks)).join(', ')}`,
  );
  check('data is an array', Array.isArray(stocks.data));
  check(
    'freshness carries state + data_as_of',
    stocks.freshness?.state !== undefined && stocks.freshness?.data_as_of !== undefined,
    'DataFreshness.jsx renders these',
  );

  // ── PSX ───────────────────────────────────────────────────────────────
  console.log('\nPSX stocks — read by marketQueries.stockPriceMap, SharesPage, Research, Tools');
  assertFields('stock record', stocks.data, [
    'symbol',      // every price map keys on this
    'name',        // SharesPage search + detail title
    'sector',      // SharesPage search
    'current',     // the price every valuation uses
    'change',      // PSX Dashboard colouring
    'change_pct',  // SharesPage sort, Research, Tools
    'market_cap',
    'pe_ratio',
    'dividend_yield',
    'volume_30d_avg', // SharesPage volume sort fallback
    'has_quote',
  ], { allowNullOn: [] });

  check(
    'stocks.json is the full universe, not a page',
    stocks.data.length === stocks.total,
    `data=${stocks.data.length} total=${stocks.total} — a truncated list silently `
    + 'values holdings at cost',
  );

  check('universe is populated', stocks.data.length > 400, `only ${stocks.data.length} rows`);

  const ogdc = stocks.data.find((s) => s.symbol === 'OGDC');
  check('a known blue chip is present (OGDC)', Boolean(ogdc));
  check(
    'current price is a positive number',
    typeof ogdc?.current === 'number' && ogdc.current > 0,
    `got ${ogdc?.current}`,
  );

  const quoted = stocks.data.filter((s) => s.has_quote);
  check(
    'quoted rows carry OHLC',
    quoted.length > 0 && quoted.every((s) => 'open' in s && 'high' in s && 'low' in s && 'ldcp' in s),
    'SharesPage detail panel renders open/high/low/ldcp',
  );

  console.log('\nPSX boards — SharesPage filter chips');
  for (const board of ['gainers', 'losers', 'active']) {
    const payload = await get(`psx/stocks/${board}.json`);
    check(`${board}.json returns rows`, payload.data?.length > 0);
  }

  console.log('\nPSX indices — Research.jsx KSE-100 tile');
  const indices = await get('psx/indices.json');
  assertFields('index record', indices.data, ['index_name', 'current', 'change_pct']);
  check(
    'KSE100 is addressable by index_name',
    indices.data.some((i) => String(i.index_name).toUpperCase() === 'KSE100'),
    'Research.jsx matches on index_name === "KSE100"',
  );

  console.log('\nPSX summary + market status');
  const summary = unwrap(await get('psx/stocks/summary.json'));
  check('summary has breadth counts',
    ['gainers', 'losers', 'unchanged', 'listed_instruments'].every((k) => k in summary),
    `got keys: ${Object.keys(summary).slice(0, 8).join(', ')}`);
  const status = unwrap(await get('psx/market-status.json'));
  check('market-status has a status', typeof status?.status === 'string', `got ${status?.status}`);

  // ── MUFAP ─────────────────────────────────────────────────────────────
  console.log('\nMUFAP funds — read by AddFund, fundPriceMap, MF Dashboard/Analytics');
  const funds = await get('mufap/funds.json');
  assertFields('fund record', funds.data, [
    'fund_name',         // the key every holding is matched on
    'slug',              // stored as mutual_fund_transactions.fund_id
    'category',          // AddFund groupBy + chip  (NOT fund_category)
    'amc',               // AddFund search
    'nav',               // fallback price, and written to the DB on purchase
    'offer_price',       // AddFund uses this to compute units
    'repurchase_price',  // what a holding is actually worth
  ], { allowNullOn: ['offer_price', 'repurchase_price'] });

  check(
    'funds.json is the full table, not a page',
    funds.data.length === funds.total,
    `data=${funds.data.length} total=${funds.total}`,
  );

  check(
    'no record carries the old `fund_category` name',
    !funds.data.some((f) => 'fund_category' in f),
    'AddFund.jsx was migrated to `category`; both present means an ambiguous contract',
  );

  check(
    'slugs are unique',
    new Set(funds.data.map((f) => f.slug)).size === funds.data.length,
    'fund_id would collide across holdings',
  );

  check(
    'most funds have a usable repurchase price',
    funds.data.filter((f) => f.repurchase_price || f.nav).length > funds.data.length * 0.9,
    'holdings would fall back to purchase NAV',
  );

  console.log('\nMUFAP categories + stats');
  const cats = await get('mufap/funds/categories.json');
  assertFields('category record', cats.data, ['category', 'slug', 'count']);
  const stats = unwrap(await get('mufap/funds/stats.json'));
  check('stats has total_funds', typeof stats?.total_funds === 'number', `got ${stats?.total_funds}`);

  // ── Freshness ─────────────────────────────────────────────────────────
  console.log('\nFreshness poll');
  const fresh = await get('freshness.json');
  check('freshness.json lists datasets', Boolean(fresh.datasets || fresh.data),
    `got keys: ${Object.keys(fresh).join(', ')}`);

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  if (failures) {
    console.log(`\u001b[31m${failures} of ${checks} checks failed.\u001b[0m`);
    console.log('The app reads these fields — a failure here is a live bug, not a flaky test.');
    process.exit(1);
  }
  console.log(`\u001b[32mAll ${checks} checks passed.\u001b[0m`);
}

main().catch((err) => {
  console.error(`\n\u001b[31mContract test could not run:\u001b[0m ${err.message}`);
  process.exit(2);
});
