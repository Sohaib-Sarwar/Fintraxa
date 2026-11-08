/**
 * Chart series from daily portfolio snapshots, for the Mutual Funds and PSX
 * dashboards: Daily, Monthly or Yearly (Pakistan fiscal year, 1 Jul to 30 Jun),
 * showing realized or unrealized profit.
 *
 * The two measures aggregate differently, which is the point of keeping them apart:
 *   realized    a flow: what sales (and fund distributions) earned IN the period → summed
 *   unrealized  a level: the gain on units still held AT the period's close → its last day
 */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const r2 = (n) => Math.round(n * 100) / 100;
const FIELDS = {
  funds: { realized: 'funds_realized_day', unrealized: 'funds_unrealized', value: 'funds_value' },
  stocks: { realized: 'stocks_realized_day', unrealized: 'stocks_unrealized', value: 'stocks_value' },
};

const fyOf = (iso) => { const y = Number(iso.slice(0, 4)); return Number(iso.slice(5, 7)) >= 7 ? y : y - 1; };
const dayLabel = (iso) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;

/**
 * @param {object[]} rows   portfolio_snapshots rows (any order)
 * @param {{ asset: 'funds'|'stocks', measure: 'realized'|'unrealized', period: 'day'|'month'|'year', start?: string, end?: string, today: string }} o
 * @returns {{ month, label, tick, title, live, amount }[]}  `month` keeps FlowChart's key; `amount` is the plotted value
 */
export function profitSeries(rows, { asset, measure, period, start = '0000-01-01', end, today }) {
  const f = FIELDS[asset];
  const endEff = end && end < today ? end : today;
  const sorted = [...rows].filter((r) => r.snap_date <= endEff).sort((a, b) => a.snap_date.localeCompare(b.snap_date));
  // Years always cover the whole history (one year alone is a single point); days and months follow the range.
  const scoped = period === 'year' ? sorted : sorted.filter((r) => r.snap_date >= start);
  const groups = new Map();
  for (const r of scoped) {
    const key = period === 'day' ? r.snap_date : period === 'month' ? r.snap_date.slice(0, 7) : String(fyOf(r.snap_date));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const points = [];
  for (const [key, list] of groups) {
    const last = list.at(-1);
    const rawUnreal = last[f.unrealized];
    // No market price that day (valued at trade price): an unrealized figure would be meaningless, so no point.
    if (measure === 'unrealized' && (rawUnreal === null || rawUnreal === undefined)) continue;
    const amount = measure === 'realized'
      ? r2(list.reduce((s, r) => s + (Number(r[f.realized]) || 0), 0))
      : r2(Number(rawUnreal) || 0);
    if (period === 'day') {
      points.push({ month: key.slice(0, 7), label: dayLabel(key), tick: dayLabel(key), title: `${dayLabel(key)} ${key.slice(0, 4)}`, live: key === today, amount, date: key });
    } else if (period === 'month') {
      const m = Number(key.slice(5, 7)) - 1;
      points.push({ month: key, label: MON[m], tick: MON[m], title: `${MON_LONG[m]} ${key.slice(0, 4)}${key === today.slice(0, 7) ? ' so far' : ''}`, live: key === today.slice(0, 7), amount });
    } else {
      const fy = Number(key);
      const short = `FY ${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
      points.push({ month: `${fy}-07`, label: short, tick: short, title: `FY ${fy}-${String(fy + 1).slice(2)}${fy === fyOf(today) ? ' to date' : ''}`, live: fy === fyOf(today), amount });
    }
  }
  if (period === 'month' && points.length > 12) for (const p of points) p.tick = `${p.label} ${p.month.slice(2, 4)}`;
  return points;
}

/** True when the snapshots cover the range well enough to draw from them. */
export const snapshotsCover = (rows, start) => rows.length > 0 && rows.some((r) => r.snap_date <= start);

/**
 * The live engine's months (realized) and month-end series (value − invested)
 * as ProfitChart's fallback rows, for months before the snapshots begin.
 */
export function engineFallback(months = [], series = []) {
  // A month-end valued at the buyer's own trade price (no market close captured yet) has no real
  // unrealized gain: value − cost would only show the fees. Those months get null, not a number.
  const unreal = new Map(series.filter((p) => !p.opening).map((p) => [
    p.month, p.priced === 'trade' ? null : Math.round(((Number(p.value) || 0) - (Number(p.invested) || 0)) * 100) / 100,
  ]));
  const keys = [...new Set([...months.map((m) => m.month), ...unreal.keys()])].sort();
  const byMonth = new Map(months.map((m) => [m.month, m.net]));
  return keys.map((k) => ({ month: k, realized: Number(byMonth.get(k)) || 0, unrealized: unreal.has(k) ? unreal.get(k) : null }));
}

/* ─── Value vs invested ──────────────────────────────────────────────────── */

const weekStart = (iso) => {
  const t = Date.parse(`${iso}T00:00:00Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(t - dow * 86_400_000).toISOString().slice(0, 10);
};
const periodKey = (iso, period) => (period === 'day' ? iso : period === 'week' ? weekStart(iso)
  : period === 'month' ? iso.slice(0, 7) : String(fyOf(iso)));

function periodMeta(key, period, today) {
  if (period === 'day') return { month: key.slice(0, 7), label: dayLabel(key), tick: dayLabel(key), title: `${dayLabel(key)} ${key.slice(0, 4)}`, live: key === today };
  if (period === 'week') return { month: key.slice(0, 7), label: dayLabel(key), tick: dayLabel(key), title: `Week of ${dayLabel(key)} ${key.slice(0, 4)}`, live: weekStart(today) === key };
  if (period === 'month') {
    const m = Number(key.slice(5, 7)) - 1;
    return { month: key, label: MON[m], tick: MON[m], title: `${MON_LONG[m]} ${key.slice(0, 4)}${key === today.slice(0, 7) ? ' so far' : ''}`, live: key === today.slice(0, 7) };
  }
  const fy = Number(key);
  const short = `FY ${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
  return { month: `${fy}-07`, label: short, tick: short, title: `FY ${fy}-${String(fy + 1).slice(2)}${fy === fyOf(today) ? ' to date' : ''}`, live: fy === fyOf(today) };
}

/**
 * Value vs invested at each period's close, from daily rows (a holding's or the portfolio's).
 *   value / invested / unrealized  read at the period's last day (levels)
 *   realized                       summed over the period (a flow)
 * keys: which row fields hold value, invested and the day's realized profit.
 * fillGaps: periods inside the history with no row mean "nothing held" (a holding
 *   sold and bought back later): they become zero points instead of a straight line.
 */
export function valueSeries(rows, { period, start = '0000-01-01', end, today, keys = { value: 'value', cost: 'cost', realized: 'realized_day' }, fillGaps = false }) {
  const endEff = end && end < today ? end : today;
  const scoped = [...rows].filter((r) => r.snap_date <= endEff && (period === 'year' || r.snap_date >= start))
    .sort((a, b) => a.snap_date.localeCompare(b.snap_date));
  const groups = new Map();
  for (const r of scoped) {
    const k = periodKey(r.snap_date, period);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  let keysInOrder = [...groups.keys()];
  if (fillGaps && scoped.length) {
    const all = new Set();
    for (let t = Date.parse(`${scoped[0].snap_date}T00:00:00Z`); t <= Date.parse(`${scoped.at(-1).snap_date}T00:00:00Z`); t += 86_400_000) {
      all.add(periodKey(new Date(t).toISOString().slice(0, 10), period));
    }
    keysInOrder = [...all];
  }
  const points = keysInOrder.map((k) => {
    const list = groups.get(k);
    if (!list) return { ...periodMeta(k, period, today), value: 0, invested: 0, unrealized: 0, realized: 0 };
    const last = list.at(-1);
    const value = r2(Number(last[keys.value]) || 0);
    const invested = r2(Number(last[keys.cost]) || 0);
    return {
      ...periodMeta(k, period, today), date: last.snap_date,
      value, invested, unrealized: r2(value - invested),
      realized: r2(list.reduce((s, r) => s + (Number(r[keys.realized]) || 0), 0)),
    };
  });
  if (period === 'month' && points.length > 12) for (const p of points) p.tick = `${p.label} ${p.month.slice(2, 4)}`;
  return points;
}

/** Cumulative dividends received from `start` up to each point's close (for the Home chart). */
export function withCumulativeDividends(points, dividends, start) {
  const sorted = [...dividends].filter((d) => d.payment_date >= start).sort((a, b) => a.payment_date.localeCompare(b.payment_date));
  return points.map((p) => {
    const until = p.date ?? `${p.month}-31`;
    const total = sorted.filter((d) => d.payment_date <= until).reduce((s, d) => s + (Number(d.net_amount) || 0), 0);
    return { ...p, dividends: r2(total) };
  });
}

/** Holding rows → one row per day for the holdings `keep` selects (a fund in two accounts, a sector, all). */
export function sumByDate(rows, keep = () => true) {
  const byDate = new Map();
  for (const r of rows) {
    if (!keep(r)) continue;
    const cur = byDate.get(r.snap_date) ?? { snap_date: r.snap_date, value: 0, cost: 0, realized_day: 0 };
    cur.value += Number(r.value) || 0; cur.cost += Number(r.cost) || 0; cur.realized_day += Number(r.realized_day) || 0;
    byDate.set(r.snap_date, cur);
  }
  return [...byDate.values()].map((d) => ({ ...d, value: r2(d.value), cost: r2(d.cost), realized_day: r2(d.realized_day) }))
    .sort((a, b) => a.snap_date.localeCompare(b.snap_date));
}

/** Several level fields read at each period's close (Home: funds and stocks value). */
export function levelSeries(rows, { period, fields, start = '0000-01-01', end, today }) {
  const endEff = end && end < today ? end : today;
  const scoped = [...rows].filter((r) => r.snap_date <= endEff && (period === 'year' || r.snap_date >= start))
    .sort((a, b) => a.snap_date.localeCompare(b.snap_date));
  const last = new Map();
  for (const r of scoped) last.set(periodKey(r.snap_date, period), r);
  const points = [...last].map(([k, r]) => ({
    ...periodMeta(k, period, today), date: r.snap_date,
    ...Object.fromEntries(fields.map(([out, src]) => [out, r2(Number(r[src]) || 0)])),
  }));
  if (period === 'month' && points.length > 12) for (const p of points) p.tick = `${p.label} ${p.month.slice(2, 4)}`;
  return points;
}

/**
 * Daily rows for one asset class from portfolio_snapshots, as ValueChart reads them.
 * Months before the first snapshot come from the live engine's month-ends
 * (series: [{ month, date, value, invested }], months: [{ month, net }]).
 */
export function assetRows(portfolio, asset, { series = [], months = [] } = {}) {
  const k = asset === 'funds' ? 'funds' : 'stocks';
  const rows = portfolio.map((r) => ({ snap_date: r.snap_date, value: Number(r[`${k}_value`]) || 0, cost: Number(r[`${k}_cost`]) || 0, realized_day: Number(r[`${k}_realized_day`]) || 0 }));
  const firstSnap = rows[0]?.snap_date ?? '9999-12-31';
  const net = new Map(months.map((m) => [m.month, Number(m.net) || 0]));
  const early = series.filter((p) => !p.opening && p.date && p.date < firstSnap)
    .map((p) => ({ snap_date: p.date, value: Number(p.value) || 0, cost: Number(p.invested) || 0, realized_day: net.get(p.month) ?? 0 }));
  return [...early, ...rows];
}

/**
 * Home chart: mutual funds and PSX value at each period's close, plus dividends received.
 *   dividends  Daily / Weekly / Monthly: cumulative from the range start to each close.
 *              Yearly: what each fiscal year paid on its own.
 * early: month-end points from the live engine ([{ date, funds, stocks }]) for dates before the first snapshot.
 */
export function holdingsSeries({ snaps = [], early = [], dividends = [], period, start, end, today }) {
  const firstSnap = snaps[0]?.snap_date ?? '9999-12-31';
  const rows = [
    ...early.filter((p) => !p.opening && p.date && p.date < firstSnap).map((p) => ({ snap_date: p.date, funds_value: p.funds, stocks_value: p.stocks })),
    ...snaps,
  ];
  const points = levelSeries(rows, { period, fields: [['funds', 'funds_value'], ['stocks', 'stocks_value']], start, end, today });
  const paid = [...dividends].sort((a, b) => a.payment_date.localeCompare(b.payment_date));
  return points.map((p) => {
    const inPeriod = period === 'year'
      ? paid.filter((d) => String(fyOf(d.payment_date)) === String(p.month.slice(0, 4)) && d.payment_date <= p.date)
      : paid.filter((d) => d.payment_date >= start && d.payment_date <= p.date);
    return { ...p, value: r2(p.funds + p.stocks), dividends: r2(inPeriod.reduce((s, d) => s + (Number(d.net_amount) || 0), 0)) };
  });
}

/**
 * Your share portfolio against an index, as cumulative % since `start` (e.g. 1 January),
 * read at each period's close.
 *
 *   portfolio  compounds the daily time-weighted returns the snapshots store
 *              (stocks_return_day: buys and sales are not counted as profit; dividends are)
 *   index      close at the period end ÷ the last close before `start`, minus one
 *
 * rows   portfolio_snapshots rows { snap_date, stocks_return_day }
 * index  [{ price_date, close }] for one index, any order
 * Returns points shaped like valueSeries ({ month, label, tick, title, date, live }) with
 * `portfolio` and `index` in percent (12.5 = +12.5%), plus `gap` = portfolio − index.
 * A period before the portfolio held anything has portfolio null.
 */
export function benchmarkSeries(rows, index, { period = 'month', start, end, today }) {
  const endEff = end && end < today ? end : today;
  const closes = [...(index ?? [])].map((x) => ({ date: x.price_date, close: Number(x.close) }))
    .filter((x) => x.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  const baseClose = closes.filter((x) => x.date < start).at(-1)?.close ?? closes.find((x) => x.date >= start)?.close ?? null;
  const days = [...(rows ?? [])].filter((r) => r.snap_date >= start && r.snap_date <= endEff)
    .sort((a, b) => a.snap_date.localeCompare(b.snap_date));
  const dates = new Set([...days.map((r) => r.snap_date), ...closes.filter((x) => x.date >= start && x.date <= endEff).map((x) => x.date)]);
  const byDate = new Map(days.map((r) => [r.snap_date, r]));
  let growth = 1; let started = false; let ci = 0; let lastClose = null;
  const groups = new Map();
  for (const d of [...dates].sort()) {
    const r = byDate.get(d);
    const ret = r && r.stocks_return_day !== null && r.stocks_return_day !== undefined ? Number(r.stocks_return_day) : null;
    if (ret !== null && Number.isFinite(ret)) { growth *= 1 + ret; started = true; }
    while (ci < closes.length && closes[ci].date <= d) { lastClose = closes[ci].close; ci += 1; }
    groups.set(periodKey(d, period), {
      date: d,
      portfolio: started ? r2((growth - 1) * 100) : null,
      index: baseClose && lastClose ? r2((lastClose / baseClose - 1) * 100) : null,
    });
  }
  const points = [...groups.entries()].map(([k, v]) => ({
    ...periodMeta(k, period, today), ...v,
    gap: v.portfolio !== null && v.index !== null ? r2(v.portfolio - v.index) : null,
  }));
  if (period === 'month' && points.length > 12) for (const p of points) p.tick = `${p.label} ${p.month.slice(2, 4)}`;
  return points;
}

/**
 * A fair comparison when you started holding shares after `start`: the index's change
 * over the same days your return covers (from the last close before your first held
 * day to the latest close). Null when you held from the start, or without data.
 * Returns { since: 'YYYY-MM-DD', index: % } (e.g. { since: '2026-03-03', index: 3.47 }).
 */
export function sameWindowIndex(rows, index, { start, end, today }) {
  const endEff = end && end < today ? end : today;
  const first = [...(rows ?? [])].filter((r) => r.snap_date >= start && r.snap_date <= endEff
    && r.stocks_return_day !== null && r.stocks_return_day !== undefined)
    .map((r) => r.snap_date).sort()[0];
  if (!first || first <= start) return null;
  const closes = [...(index ?? [])].map((x) => ({ date: x.price_date, close: Number(x.close) }))
    .filter((x) => x.close > 0 && x.date <= endEff).sort((a, b) => a.date.localeCompare(b.date));
  const base = closes.filter((x) => x.date < first).at(-1);
  const last = closes.at(-1);
  if (!base || !last || last.date < first) return null;
  return { since: first, index: r2((last.close / base.close - 1) * 100) };
}
