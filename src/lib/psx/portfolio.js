/**
 * PSX stock portfolio from the user's trades, in exact decimals.
 *
 * Cost method: weighted average cost per symbol (how brokers and the CDC
 * statement show "average price"). A buy adds shares and its cost
 * (price × quantity + fee). A sell removes shares at the current average cost;
 * the realized gain is the sale proceeds (price × quantity − fee) minus that
 * cost.
 *
 * For a date range [start, end] (end never later than today):
 *   invested    = average cost of the shares held at the end of the range
 *   value       = shares held × price at the end of the range
 *   unrealized  = value − invested            (so value = invested + unrealized)
 *   realized    = Σ (proceeds − average cost) of sales dated inside the range
 *                 gross = before broker fees, fees = sell fee + the buy fees carried in the cost sold
 *   15% CGT     = estimate on a positive unrealized gain, per stock (no tax is due until sold)
 *
 * Price at a date, in order of preference:
 *   today → live PSX price (microservice) → last captured close → last trade price
 *   past  → last captured close on or before that date → last trade price before it
 * Captured closes come from public.psx_price_history (a daily database job).
 * Every position and growth point records which price it used.
 */
import Decimal from 'decimal.js';

/** Estimate only: CGT on an unrealized gain if the shares were sold (individual filer rate). */
export const CGT_RATE = '0.15';

const ZERO = new Decimal(0);
const D = (v) => new Decimal(String(v ?? 0));
const r2 = (d) => (d === null ? null : Number(d.toFixed(2)));
const DUST = new Decimal('0.0001');
/** Month loops stop here; generous (50 years) so long histories are never cut short. */
const MAX_MONTHS = 600;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const byTime = (a, b) => String(a.date).localeCompare(String(b.date)) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
export const normSymbol = (s) => String(s ?? '').trim().toUpperCase();

/** Replays one symbol's trades up to `until` (inclusive). */
function replay(trades, until) {
  let shares = ZERO; let cost = ZERO; let feeCost = ZERO; let lastPrice = null; let lastDate = null;
  const sales = [];
  const flags = new Set();
  for (const t of trades) {
    if (until && t.date > until) break;
    const q = D(t.quantity); const p = D(t.price); const fee = D(t.fee);
    lastPrice = p; lastDate = t.date;
    if (t.type === 'buy') {
      shares = shares.plus(q);
      cost = cost.plus(p.times(q)).plus(fee);
      feeCost = feeCost.plus(fee);
    } else {
      const sell = Decimal.min(q, shares);
      if (q.minus(shares).gt(DUST)) flags.add('sold_more_than_bought');
      const avg = shares.gt(0) ? cost.dividedBy(shares) : ZERO;
      const basis = avg.times(sell);
      const basisFees = shares.gt(0) ? feeCost.dividedBy(shares).times(sell) : ZERO;
      const gain = p.times(q).minus(fee).minus(basis);
      const fees = fee.plus(basisFees);
      sales.push({ date: t.date, gain, fees, gross: gain.plus(fees) });
      shares = shares.minus(sell);
      cost = cost.minus(basis);
      feeCost = feeCost.minus(basisFees);
      if (shares.lte(DUST)) { shares = ZERO; cost = ZERO; feeCost = ZERO; }
    }
  }
  return { shares, cost, lastPrice, lastDate, sales, flags };
}

/** Last captured close on or before `date`, from a date-sorted list. */
function closeOn(list, date) {
  let best = null;
  for (const c of list ?? []) { if (c.date <= date) best = c; else break; }
  return best;
}

/** Price for a symbol at a date, with where it came from. */
function priceAt({ symbol, date, today, live, history, lastTradePrice }) {
  if (date >= today && live[symbol]?.current) return { price: D(live[symbol].current), source: 'live' };
  const close = closeOn(history[symbol], date);
  if (close) return { price: D(close.close), source: 'close', date: close.date };
  if (lastTradePrice) return { price: lastTradePrice, source: 'trade' };
  return null;
}

/**
 * @param {object[]} trades   stock_transactions rows
 * @param {object} [o]
 * @param {Record<string, {current?: number, change?: number, change_pct?: number, name?: string}>} [o.live]  symbol → live record
 * @param {Record<string, {date: string, close: number|string}[]>} [o.history]  symbol → captured closes, oldest first
 * @param {string} [o.start]  ISO date, default: all time
 * @param {string} [o.end]    ISO date, clipped to today
 * @param {string} [o.today]
 */
export function analyzeStocks(trades, { live = {}, history = {}, start = '0000-01-01', end, today = new Date().toISOString().slice(0, 10) } = {}) {
  const endEff = end && end < today ? end : today;
  const isNow = endEff === today;
  const bySymbol = new Map();
  for (const t of trades) {
    const sym = normSymbol(t.symbol);
    if (!sym || !t.date) continue;
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym).push(t);
  }

  const positions = [];
  for (const [symbol, list] of bySymbol) {
    list.sort(byTime);
    if (list[0].date > endEff) continue;   // first bought after the range ends
    const r = replay(list, endEff);
    const held = r.shares.gt(0);
    const px = held ? priceAt({ symbol, date: endEff, today, live, history, lastTradePrice: r.lastPrice }) : null;
    const value = held ? (px ? r.shares.times(px.price) : null) : ZERO;
    const unrealized = value === null ? null : value.minus(r.cost);
    const salesIn = r.sales.filter((s) => s.date >= start && s.date <= endEff);
    const realizedIn = salesIn.reduce((s, x) => s.plus(x.gain), ZERO);
    const unrealTax = unrealized === null ? null : (unrealized.gt(0) ? unrealized.times(new Decimal(CGT_RATE)) : ZERO);
    const realizedAll = r.sales.reduce((s, x) => s.plus(x.gain), ZERO);
    const tradedInRange = list.some((t) => t.date >= start && t.date <= endEff);
    const before = list.filter((t) => t.date < start);
    const heldAtStart = before.length > 0 && replay(before).shares.gt(0);
    const q = live[symbol];
    positions.push({
      symbol,
      companyName: q?.name ?? list.find((t) => t.company_name)?.company_name ?? symbol,
      isOpen: held,
      // Active in the range: still held when it starts, or traded inside it.
      // Fully sold before the start, or first bought after the end → not part of it.
      inRange: heldAtStart || tradedInRange,
      shares: Number(r.shares.toFixed(4)),
      avgCost: held ? Number(r.cost.dividedBy(r.shares).toFixed(4)) : null,
      invested: r2(r.cost),
      price: px ? Number(px.price) : null,
      priceSource: px?.source ?? null,
      priceDate: px?.date ?? (px?.source === 'live' ? today : null),
      dayChange: isNow && held ? (q?.change ?? null) : null,
      dayChangePct: isNow && held ? (q?.change_pct ?? null) : null,
      value: r2(value),
      unrealized: r2(unrealized),
      unrealizedPct: unrealized !== null && r.cost.gt(0) ? Number(unrealized.dividedBy(r.cost).times(100).toFixed(2)) : null,
      realized: r2(realizedIn),
      realizedGross: r2(salesIn.reduce((s, x) => s.plus(x.gross), ZERO)),
      realizedFees: r2(salesIn.reduce((s, x) => s.plus(x.fees), ZERO)),
      realizedAllTime: r2(realizedAll),
      unrealizedTax: r2(unrealTax),
      unrealizedNet: unrealized === null ? null : r2(unrealized.minus(unrealTax)),
      sales: r.sales,
      trades: [...list].sort((a, b) => byTime(b, a)),
      firstDate: list[0].date,
      lastDate: r.lastDate,
      flags: [...r.flags, ...(held && !px ? ['no_price'] : [])],
    });
  }

  const shown = positions.filter((p) => p.inRange);
  const shownSet = new Set(shown.map((p) => p.symbol));
  const open = shown.filter((p) => p.isOpen);
  const sum = (list, k) => Number(list.reduce((s, p) => s.plus(p[k] ?? 0), ZERO).toFixed(2));
  const invested = sum(open, 'invested');
  const unrealized = sum(open, 'unrealized');
  const totals = {
    invested,
    unrealized,
    // Value is defined as invested + unrealized, so the two can never disagree.
    value: Number(D(invested).plus(unrealized).toFixed(2)),
    unrealizedPct: invested > 0 ? Number(((unrealized / invested) * 100).toFixed(2)) : null,
    realized: sum(shown, 'realized'),
    realizedGross: sum(shown, 'realizedGross'),
    realizedFees: sum(shown, 'realizedFees'),
    unrealizedTax: sum(open, 'unrealizedTax'),
    unrealizedNet: sum(open, 'unrealizedNet'),
    held: open.length,
    dayChange: isNow ? Number(open.reduce((s, p) => s.plus(p.dayChange !== null ? D(p.dayChange).times(p.shares) : 0), ZERO).toFixed(2)) : null,
    fallbackPriced: open.filter((p) => p.priceSource && p.priceSource !== 'live').length,
    unpriced: open.filter((p) => p.value === null).length,
  };

  // Month-end growth inside the range: value at that day's price vs cost of the shares held.
  const series = [];
  const first = [...bySymbol.values()].map((l) => l[0].date).sort()[0];
  const pointAt = (at) => {
    let inv = ZERO; let val = ZERO; let held = 0; const used = new Set();
    for (const [symbol, list] of bySymbol) {
      if (!shownSet.has(symbol)) continue;
      const r = replay(list, at);
      if (r.shares.isZero()) continue;
      held += 1;
      inv = inv.plus(r.cost);
      const px = priceAt({ symbol, date: at, today, live, history, lastTradePrice: r.lastPrice });
      if (px) { val = val.plus(r.shares.times(px.price)); used.add(px.source); } else val = val.plus(r.cost);
    }
    return {
      date: at, invested: r2(inv), value: r2(val), live: at === today, held,
      priced: used.size === 0 ? (at === today ? 'live' : 'trade') : used.size === 1 ? [...used][0] : 'mixed',
    };
  };
  if (first && first <= endEff) {
    // Opening balance: holdings the day before a range that starts on the 1st.
    if (start > first && /-01$/.test(start)) {
      const [sy, sm, sd] = start.split('-').map(Number);
      const at = new Date(Date.UTC(sy, sm - 1, sd - 1)).toISOString().slice(0, 10);
      const { held, ...pt } = pointAt(at);
      if (held) series.push({ ...pt, month: at.slice(0, 7), opening: true, label: 'Open', tick: 'Open', title: `Opening balance, ${Number(at.slice(8, 10))} ${MON[Number(at.slice(5, 7)) - 1]} ${at.slice(0, 4)}` });
    }
    const from = start > first ? start : first;
    let [y, m] = from.slice(0, 7).split('-').map(Number);
    const [ty, tm] = endEff.slice(0, 7).split('-').map(Number);
    while ((y < ty || (y === ty && m <= tm)) && series.length < MAX_MONTHS) {
      const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      const { held: _held, ...pt } = pointAt(monthEnd < endEff ? monthEnd : endEff);
      series.push({ ...pt, month: `${y}-${String(m).padStart(2, '0')}`, label: MON[m - 1] });
      m += 1; if (m > 12) { m = 1; y += 1; }
    }
    if (series.length > 12) for (const s of series) if (!s.opening) s.label = `${s.label} ${s.month.slice(2, 4)}`;
  }

  // Realized by month inside the range: gross, broker fees, net — shaped for the earnings chart.
  const months = [];
  if (first && first <= endEff) {
    const from = start > first ? start : first;
    let [y, m] = from.slice(0, 7).split('-').map(Number);
    const [ty, tm] = endEff.slice(0, 7).split('-').map(Number);
    const allSales = shown.flatMap((p) => p.sales);
    while ((y < ty || (y === ty && m <= tm)) && months.length < MAX_MONTHS) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const inMonth = allSales.filter((x) => x.date.slice(0, 7) === key && x.date >= start && x.date <= endEff);
      const g = inMonth.reduce((s, x) => s.plus(x.gross), ZERO);
      const f = inMonth.reduce((s, x) => s.plus(x.fees), ZERO);
      months.push({ month: key, label: MON[m - 1], gross: r2(g), cgt: r2(f), net: r2(g.minus(f)) });
      m += 1; if (m > 12) { m = 1; y += 1; }
    }
    if (months.length > 12) for (const x of months) x.label = `${x.label} ${x.month.slice(2, 4)}`;
  }

  // positions: active in the range (what screens show); allPositions: every stock, for trading.
  return { start, end: endEff, positions: shown, allPositions: positions, totals, series, months };
}

/**
 * Month-end growth points → one point per Pakistan fiscal year (1 Jul – 30 Jun):
 * the last month-end of each year (or today for the current year).
 */
export function fiscalYearEnds(series) {
  const byFy = new Map();
  for (const pt of series) {
    if (pt.opening) continue;
    const [y, m] = pt.month.split('-').map(Number);
    byFy.set(m >= 7 ? y : y - 1, pt);   // series is oldest first, so the last one wins
  }
  return [...byFy.entries()].sort((a, b) => a[0] - b[0]).map(([fy, pt]) => {
    const short = `FY ${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
    return { ...pt, tick: short, label: short, title: `FY ${fy}-${String(fy + 1).slice(2)}${pt.live ? ' to date' : ''}` };
  });
}

/** For the daily snapshot builder (src/lib/snapshots/build.js): the same replay and pricing, one symbol at a time. */
export { replay as replayStock, priceAt as stockPriceAt, byTime as stockByTime };
