/**
 * portfolio-snapshot: compute and store daily snapshots for one user or all.
 *
 * Inputs come straight from the user's own rows (service role, always filtered
 * by user_id) and the captured prices; the maths is engine/build.js, a copy of
 * the app's src/lib/snapshots/build.js (kept identical by a test).
 */
import { buildSnapshots, firstActivity, SNAPSHOT_VERSION } from './engine/build.js';

const MAX_DAYS = 3 * 366;   // backfill cap per run
const CHUNK = 500;          // rows per insert

/** Today in Pakistan (UTC+5, no daylight saving). */
export const todayPkt = (now = Date.now()) => new Date(now + 5 * 3_600_000).toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** PostgREST returns at most 1,000 rows per request: page through. */
async function all(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const ENTRY_COLS = [
  'id', 'account_id', 'fund_id', 'unit_class', 'entry_type', 'trade_date', 'price_date', 'seq', 'created_at',
  'reverses_entry_id', 'cash_direction', 'nav::text', 'unit_delta::text', 'gross_amount::text', 'net_amount::text',
].join(',');

/** Everything one user's snapshots are computed from. */
export async function loadUserData(db, userId) {
  const [entries, components, funds, amcs, trades, transactions, dividends] = await Promise.all([
    all(() => db.from('mf_ledger_entries').select(ENTRY_COLS).eq('user_id', userId).order('trade_date').order('seq')),
    all(() => db.from('mf_ledger_components').select('entry_id, component_type, amount::text').eq('user_id', userId)),
    all(() => db.from('mf_funds').select('id, name, amc_id, mufap_slug')),
    all(() => db.from('mf_amcs').select('id, code, name')),
    all(() => db.from('stock_transactions').select('*').eq('user_id', userId)),
    all(() => db.from('income_expense_transactions').select('date, type, amount::text, categories(name, kind)').eq('user_id', userId)),
    all(() => db.from('stock_dividends').select('payment_date, net_amount::text').eq('user_id', userId)),
  ]);
  const fundIds = [...new Set(entries.map((e) => e.fund_id))];
  // Public captured NAVs (user_id null) and this user's own statement NAVs; never another user's.
  const navs = fundIds.length
    ? await all(() => db.from('mf_nav_history').select('fund_id, nav_date, price::text, price_kind, source')
      .in('fund_id', fundIds).or(`user_id.is.null,user_id.eq.${userId}`).order('nav_date'))
    : [];
  const symbols = [...new Set(trades.map((t) => String(t.symbol ?? '').trim().toUpperCase()).filter(Boolean))];
  const closes = symbols.length
    ? await all(() => db.from('psx_price_history').select('symbol, price_date, close::text').in('symbol', symbols).order('price_date'))
    : [];
  const history = {};
  for (const c of closes) (history[c.symbol] ??= []).push({ date: c.price_date, close: c.close });
  return {
    mf: {
      entries, components,
      prices: navs.map((n) => ({ fund_id: n.fund_id, price: n.price, date: n.nav_date, source: n.source, kind: n.price_kind })),
      funds: Object.fromEntries(funds.map((f) => [f.id, f])),
      amcs: Object.fromEntries(amcs.map((a) => [a.id, a])),
    },
    psx: { trades, history },
    finance: { transactions, dividends },
  };
}

/** Compute one user's snapshots from `fromDate` to today and replace those days in the tables. */
export async function snapshotUser(db, userId, fromDate, today = todayPkt()) {
  const data = await loadUserData(db, userId);
  const first = firstActivity(data);
  if (!first) return { userId, days: 0, holdings: 0 };
  let from = fromDate && fromDate > first ? fromDate : first;
  if (from > today) from = today;
  if (Date.parse(today) - Date.parse(from) > MAX_DAYS * 86_400_000) from = addDays(today, -MAX_DAYS);

  const { days, holdings } = buildSnapshots({ ...data, from, to: today, today });

  // Replace the recomputed days: a holding sold since may no longer appear.
  let r = await db.from('holding_snapshots').delete().eq('user_id', userId).gte('snap_date', from);
  if (r.error) throw new Error(r.error.message);
  for (let i = 0; i < holdings.length; i += CHUNK) {
    r = await db.from('holding_snapshots').insert(holdings.slice(i, i + CHUNK).map((h) => ({ ...h, user_id: userId })));
    if (r.error) throw new Error(r.error.message);
  }
  for (let i = 0; i < days.length; i += CHUNK) {
    r = await db.from('portfolio_snapshots').upsert(
      days.slice(i, i + CHUNK).map((d) => ({ ...d, user_id: userId, engine_version: SNAPSHOT_VERSION, computed_at: new Date().toISOString() })),
      { onConflict: 'user_id,snap_date' },
    );
    if (r.error) throw new Error(r.error.message);
  }
  return { userId, from, to: today, days: days.length, holdings: holdings.length };
}

/** Run for everyone who needs it (cron) or for one user. Errors for one user do not stop the others. */
export async function run(db, { userId = null } = {}) {
  const { data: work, error } = await db.rpc('snapshot_work', { p_user: userId });
  if (error) throw new Error(error.message);
  const results = [];
  for (const w of work ?? []) {
    try {
      results.push(await snapshotUser(db, w.user_id, w.from_date));
      await db.rpc('snapshot_done', { p_user: w.user_id, p_started: w.started_at });
    } catch (e) {
      console.error('[portfolio-snapshot]', w.user_id.slice(0, 8), e.message);
      results.push({ userId: w.user_id, error: e.message });
    }
  }
  return results;
}
