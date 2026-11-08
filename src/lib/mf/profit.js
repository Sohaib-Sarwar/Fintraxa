/**
 * Mutual-fund profit, from first principles.
 *
 * One pass over each holding's transactions, oldest first, keeping FIFO lots
 * (the method AMCs use for CGT). Every figure the app shows comes from three
 * things this pass records:
 *
 *   Lots          units still held and what they cost      → Invested
 *   Realizations  each sale/switch out: proceeds − FIFO cost → Realized gain
 *                 with the CGT the statement deducted on it
 *   Tax events    CGT charged, refunded or reversed outside a sale
 *
 * Realized (in a date range)
 *   gross = Σ (proceeds − FIFO cost) of sales in range + distributions in range
 *   CGT   = what the statements deducted in range − refunds/reversals in range
 *   net   = gross − CGT − other deductions (zakat, WHT)
 *
 * Unrealized (at the end of the range)
 *   gross = units held × price on that date − FIFO cost of those units
 *   tax   = 15% of a gain (per holding; a loss owes nothing) — an estimate,
 *           because no CGT is due until the units are sold
 *   net   = gross − tax
 *
 * Exact decimals throughout (decimal.js); results are rounded to paisa only
 * when handed to the screen.
 */
import Decimal from 'decimal.js';

export const PROFIT_VERSION = 'mf-profit-2.0.0';
export const UNREALIZED_CGT_RATE = '0.15';

const ZERO = new Decimal(0);
const D = (v) => (v === null || v === undefined || v === '' ? null : new Decimal(String(v)));
/** Statements round units (UBL to 2 dp): a full sale can exceed the rounded buys by a few hundredths. */
const ROUNDING_UNITS = new Decimal('0.05');
const DUST_UNITS = new Decimal('0.01');
const RATE = new Decimal(UNREALIZED_CGT_RATE);

const ADDS_UNITS = new Set(['purchase', 'switch_in', 'transfer_in', 'dividend_reinvest', 'bonus_units', 'capital_refund_units', 'cgt_refund_reinvest']);
const REMOVES_UNITS = new Set(['redemption', 'switch_out', 'transfer_out']);
const DISTRIBUTION = new Set(['dividend_cash', 'dividend_reinvest', 'capital_refund_units']);
const SALE_DEDUCTIONS = new Set(['zakat', 'wht', 'back_load', 'charge', 'transaction_cost', 'other_deduction']);

const r2 = (d) => (d === null ? null : Number(d.toFixed(2)));
const positionKey = (e) => `${e.account_id}|${e.fund_id}|${e.unit_class ?? ''}`;
const byTime = (a, b) => (a.trade_date < b.trade_date ? -1 : a.trade_date > b.trade_date ? 1 : 0)
  || ((a.seq ?? 0) - (b.seq ?? 0)) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));

/** Reversed entries and their reversals cancel out; neither is part of the history. */
export function liveEntries(entries) {
  const reversed = new Set(entries.filter((e) => e.reverses_entry_id).map((e) => e.reverses_entry_id));
  return entries.filter((e) => !e.reverses_entry_id && !reversed.has(e.id));
}

/**
 * Replays one holding. Returns its lots after every transaction is applied,
 * plus every realization and tax event, each dated.
 */
export function replayHolding(list, componentsByEntry) {
  const lots = [];          // { date, units, cost, costKnown, entryId }
  const realizations = [];  // { date, entryId, units, proceeds, cost, gain, cgt, deductions, complete }
  const taxEvents = [];     // { date, entryId, amount }  + charged, − refunded
  const income = [];        // { date, entryId, amount }  distributions
  const deposits = [];      // { date, amount }  money paid in (purchases)
  const withdrawals = [];   // { date, amount }  money paid out (sales, cash dividends, cash refunds)
  const flags = new Set();
  let units = ZERO;

  for (const e of [...list].sort(byTime)) {
    const comps = componentsByEntry.get(e.id) ?? [];
    const comp = (types) => comps.filter((c) => types.has(c.component_type)).reduce((s, c) => s.plus(c.amount), ZERO);
    const cgt = comp(new Set(['cgt']));
    const refunds = comp(new Set(['cgt_refund', 'cgt_reversal']));
    const du = D(e.unit_delta);
    const gross = D(e.gross_amount);
    const net = D(e.net_amount);
    const nav = D(e.nav);
    const t = e.entry_type;

    if (ADDS_UNITS.has(t) && du && du.gt(0)) {
      let cost = gross ?? net ?? (nav ? du.times(nav) : null);
      let costKnown = cost !== null;
      if (t === 'bonus_units') { cost = ZERO; costKnown = true; }
      if (t === 'transfer_in' && gross === null) { costKnown = false; flags.add('transfer_in_cost_unknown'); }
      lots.push({ date: e.trade_date, units: du, cost: cost ?? ZERO, costKnown, entryId: e.id });
      units = units.plus(du);
      if (t === 'purchase') deposits.push({ date: e.trade_date, amount: gross ?? net ?? ZERO });
      if (DISTRIBUTION.has(t)) income.push({ date: e.trade_date, entryId: e.id, amount: gross ?? cost ?? ZERO });
      if (t === 'cgt_refund_reinvest') taxEvents.push({ date: e.trade_date, entryId: e.id, amount: (refunds.gt(0) ? refunds : (gross ?? ZERO)).negated() });
    } else if (REMOVES_UNITS.has(t) && du && du.lt(0)) {
      let need = du.abs();
      let cost = ZERO;
      let complete = true;
      while (need.gt(0) && lots.length) {
        const lot = lots[0];
        const take = Decimal.min(need, lot.units);
        const part = lot.units.isZero() ? ZERO : lot.cost.times(take).dividedBy(lot.units);
        if (!lot.costKnown) complete = false;
        cost = cost.plus(part);
        lot.cost = lot.cost.minus(part);
        lot.units = lot.units.minus(take);
        need = need.minus(take);
        if (lot.units.lte(0)) lots.shift();
      }
      if (need.gt(ROUNDING_UNITS)) { complete = false; flags.add('sold_more_than_recorded'); }
      units = units.plus(du);
      if (units.abs().lte(ROUNDING_UNITS) && units.lt(0)) units = ZERO;
      if (t === 'transfer_out') continue;   // units leave with their cost; nothing is gained
      const deductions = comp(SALE_DEDUCTIONS);
      const proceeds = gross ?? (net !== null ? net.plus(cgt).plus(deductions) : (nav ? du.abs().times(nav) : null));
      if (proceeds === null) { complete = false; flags.add('sale_amount_unknown'); }
      realizations.push({
        date: e.trade_date, entryId: e.id, type: t, units: du.abs(), proceeds: proceeds ?? ZERO, cost,
        gain: (proceeds ?? ZERO).minus(cost), cgt, deductions, complete,
      });
      if (cgt.gt(0)) taxEvents.push({ date: e.trade_date, entryId: e.id, amount: cgt });
      if (refunds.gt(0)) taxEvents.push({ date: e.trade_date, entryId: e.id, amount: refunds.negated() });
      if (t === 'redemption') withdrawals.push({ date: e.trade_date, amount: net ?? (proceeds ? proceeds.minus(cgt).minus(deductions) : ZERO) });
      if (!complete) flags.add('realized_incomplete');
    } else if (t === 'dividend_cash') {
      income.push({ date: e.trade_date, entryId: e.id, amount: gross ?? net ?? ZERO });
      withdrawals.push({ date: e.trade_date, amount: net ?? gross ?? ZERO });
    } else if (t === 'cgt_deduction') {
      taxEvents.push({ date: e.trade_date, entryId: e.id, amount: cgt.gt(0) ? cgt : (gross ?? net ?? ZERO) });
    } else if (t === 'cgt_refund_cash' || t === 'cgt_reversal') {
      const amt = refunds.gt(0) ? refunds : (gross ?? net ?? ZERO);
      taxEvents.push({ date: e.trade_date, entryId: e.id, amount: amt.negated() });
      withdrawals.push({ date: e.trade_date, amount: net ?? gross ?? ZERO });
    } else if (t === 'other_adjustment' && du && !du.isZero()) {
      if (du.gt(0)) {
        lots.push({ date: e.trade_date, units: du, cost: gross ?? ZERO, costKnown: gross !== null, entryId: e.id });
        if (gross === null) flags.add('opening_cost_unknown');
      } else {
        let need = du.abs();
        while (need.gt(0) && lots.length) {
          const lot = lots[0];
          const take = Decimal.min(need, lot.units);
          lot.cost = lot.cost.minus(lot.cost.times(take).dividedBy(lot.units));
          lot.units = lot.units.minus(take);
          need = need.minus(take);
          if (lot.units.lte(0)) lots.shift();
        }
      }
      units = units.plus(du);
    }
  }
  return { lots, units, realizations, taxEvents, income, deposits, withdrawals, flags };
}

/** Latest price on or before `date` for each fund: market feed, statement valuations, then trade NAVs. */
export function priceBook(prices, entries) {
  const obs = new Map();
  const add = (fundId, date, price, source) => {
    if (!fundId || !date || price === null || price === undefined || Number(price) <= 0) return;
    if (!obs.has(fundId)) obs.set(fundId, []);
    obs.get(fundId).push({ date, price: new Decimal(String(price)), source });
  };
  for (const p of prices) add(p.fund_id, p.date, p.price, p.source);
  for (const e of entries) if (e.nav) add(e.fund_id, e.price_date ?? e.trade_date, e.nav, 'statement');
  const rank = { mufap: 2, statement: 1 };
  for (const list of obs.values()) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (rank[a.source] ?? 0) - (rank[b.source] ?? 0)));
  return (fundId, date) => {
    const list = obs.get(fundId);
    if (!list) return null;
    let best = null;
    for (const o of list) { if (o.date <= date) best = o; else break; }
    return best;
  };
}

const sumAmounts = (list, from, to) => list.filter((x) => x.date >= from && x.date <= to).reduce((s, x) => s.plus(x.amount), ZERO);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthEnd = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const nextMonth = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7); };
const dayBefore = (iso) => { const [y, mo, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, d - 1)).toISOString().slice(0, 10); };
const longDate = (iso) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
/** Month loops stop here; generous (50 years) so long histories are never cut short. */
const MAX_MONTHS = 600;

/** Holding state at a date: units, cost of units held, value, unrealized. */
function stateAt(list, componentsByEntry, priceAt, fundId, date) {
  const r = replayHolding(list.filter((e) => e.trade_date <= date), componentsByEntry);
  const units = r.units.gt(DUST_UNITS) ? r.units : ZERO;
  const cost = units.isZero() ? ZERO : r.lots.reduce((s, l) => s.plus(l.cost), ZERO);
  const costKnown = r.lots.every((l) => l.costKnown);
  const p = units.isZero() ? null : priceAt(fundId, date);
  const value = units.isZero() ? ZERO : (p ? units.times(p.price) : null);
  const gross = value === null || !costKnown ? null : value.minus(cost);
  const tax = gross === null ? null : (gross.gt(0) ? gross.times(RATE) : ZERO);
  return { replay: r, units, cost, costKnown, price: p, value, unrealized: { gross, tax, net: gross === null ? null : gross.minus(tax) } };
}

/**
 * Everything the screens need for one date range.
 * @param {object} a
 * @param {object[]} a.entries      approved ledger rows (numerics as strings)
 * @param {object[]} a.components   their components
 * @param {object[]} a.prices       { fund_id, date, price, source }
 * @param {string} a.start          ISO date
 * @param {string} a.end            ISO date (clipped to today)
 * @param {string} [a.today]
 */
export function analyzeFunds({ entries, components = [], prices = [], funds = {}, amcs = {}, start, end, today: todayIn }) {
  const today = todayIn ?? new Date().toISOString().slice(0, 10);
  const endEff = end && end < today ? end : today;
  const live = liveEntries(entries);
  const componentsByEntry = new Map();
  for (const c of components) {
    if (!componentsByEntry.has(c.entry_id)) componentsByEntry.set(c.entry_id, []);
    componentsByEntry.get(c.entry_id).push({ ...c, amount: new Decimal(String(c.amount)) });
  }
  const priceAt = priceBook(prices, live);
  const groups = new Map();
  for (const e of live) {
    const k = positionKey(e);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }

  const positions = [];
  for (const [key, list] of groups) {
    const [accountId, fundId, unitClass] = key.split('|');
    const atEnd = stateAt(list, componentsByEntry, priceAt, fundId, endEff);
    const r = atEnd.replay;
    const inRange = (x) => x.date >= start && x.date <= endEff;
    const sales = r.realizations.filter(inRange);
    const gross = sales.reduce((s, x) => s.plus(x.gain), ZERO).plus(sumAmounts(r.income, start, endEff));
    const cgt = sumAmounts(r.taxEvents, start, endEff);
    const charges = sales.reduce((s, x) => s.plus(x.deductions), ZERO);
    const tradedInRange = list.some((e) => e.trade_date >= start && e.trade_date <= endEff);
    const before = list.filter((e) => e.trade_date < start);
    const heldAtStart = before.length > 0 && replayHolding(before, componentsByEntry).units.gt(DUST_UNITS);
    const fund = funds[fundId];
    const allTimeGain = r.realizations.reduce((s, x) => s.plus(x.gain), ZERO).plus(r.income.reduce((s, x) => s.plus(x.amount), ZERO));
    const allTimeCgt = r.taxEvents.reduce((s, x) => s.plus(x.amount), ZERO);
    positions.push({
      key, accountId, fundId, unitClass,
      fundName: fund?.name ?? null,
      amcId: fund?.amc_id ?? null,
      amcCode: fund ? amcs[fund.amc_id]?.code ?? null : null,
      amcName: fund ? amcs[fund.amc_id]?.name ?? null : null,
      isOpen: atEnd.units.gt(0),
      // Active in the range: still held when it starts, or traded inside it.
      // Fully redeemed before the start, or first bought after the end → not part of it.
      inRange: heldAtStart || tradedInRange,
      units: Number(atEnd.units.toFixed(4)),
      price: atEnd.price ? { value: Number(atEnd.price.price), date: atEnd.price.date, source: atEnd.price.source, stale: Date.parse(endEff) - Date.parse(atEnd.price.date) > 4 * 86_400_000 } : null,
      value: r2(atEnd.value),
      invested: r2(atEnd.cost),
      avgCost: atEnd.units.gt(0) && atEnd.costKnown ? Number(atEnd.cost.dividedBy(atEnd.units).toFixed(4)) : null,
      unrealized: { gross: r2(atEnd.unrealized.gross), tax: r2(atEnd.unrealized.tax), net: r2(atEnd.unrealized.net) },
      realized: { gross: r2(gross), cgt: r2(cgt), charges: r2(charges), net: r2(gross.minus(cgt).minus(charges)), sales: sales.length },
      allTime: { gross: r2(allTimeGain), cgt: r2(allTimeCgt), net: r2(allTimeGain.minus(allTimeCgt)) },
      deposits: r2(sumAmounts(r.deposits, start, endEff)),
      withdrawals: r2(sumAmounts(r.withdrawals, start, endEff)),
      lots: r.lots.map((l) => ({ date: l.date, units: Number(l.units.toFixed(4)), cost: r2(l.cost), costKnown: l.costKnown })),
      sales: sales.map((x) => ({ date: x.date, units: Number(x.units.toFixed(4)), proceeds: r2(x.proceeds), cost: r2(x.cost), gain: r2(x.gain), cgt: r2(x.cgt), complete: x.complete })),
      entries: list,
      firstDate: list.map((e) => e.trade_date).sort()[0] ?? null,
      lastDate: list.map((e) => e.trade_date).sort().pop() ?? null,
      flags: [...r.flags, ...(atEnd.units.gt(0) && !atEnd.price ? ['no_price'] : []), ...(atEnd.price && Date.parse(endEff) - Date.parse(atEnd.price.date) > 4 * 86_400_000 && atEnd.units.gt(0) ? ['price_outdated'] : [])],
    });
  }

  const shown = positions.filter((p) => p.inRange);
  const shownKeys = new Set(shown.map((p) => p.key));
  const sum = (f) => Number(shown.reduce((s, p) => s.plus(f(p) ?? 0), ZERO).toFixed(2));
  const anyNull = (f) => shown.some((p) => f(p) === null);
  const totals = {
    // A holding with no price at all counts at cost (book value), the same rule as the month-end series;
    // totals.incomplete tells the screens a figure rests on that fallback.
    value: sum((p) => p.value ?? (p.isOpen ? p.invested : 0)),
    invested: sum((p) => p.invested),
    deposits: sum((p) => p.deposits),
    withdrawals: sum((p) => p.withdrawals),
    realized: {
      gross: sum((p) => p.realized.gross), cgt: sum((p) => p.realized.cgt), charges: sum((p) => p.realized.charges),
      net: sum((p) => p.realized.net), sales: shown.reduce((s, p) => s + p.realized.sales, 0),
    },
    unrealized: { gross: sum((p) => p.unrealized.gross), tax: sum((p) => p.unrealized.tax), net: sum((p) => p.unrealized.net), rate: Number(UNREALIZED_CGT_RATE) },
    held: shown.filter((p) => p.isOpen).length,
    incomplete: anyNull((p) => p.value) || anyNull((p) => p.unrealized.gross) || shown.some((p) => p.flags.includes('realized_incomplete')),
  };

  // Month by month inside the range: realized gross, CGT paid, net — what the statements settled that month.
  const months = [];
  const firstData = live.map((e) => e.trade_date).sort()[0];
  if (firstData) {
    const from = start > firstData ? start : `${firstData.slice(0, 7)}-01`;
    for (let m = from.slice(0, 7); m <= endEff.slice(0, 7) && months.length < MAX_MONTHS; m = nextMonth(m)) {
      const a = m === from.slice(0, 7) ? from : `${m}-01`;
      const b = monthEnd(m) < endEff ? monthEnd(m) : endEff;
      let gross = ZERO; let cgt = ZERO; let charges = ZERO;
      for (const [k, list] of groups) {
        if (!shownKeys.has(k)) continue;
        const r = replayHolding(list.filter((e) => e.trade_date <= b), componentsByEntry);
        const sales = r.realizations.filter((x) => x.date >= a && x.date <= b);
        gross = gross.plus(sales.reduce((s, x) => s.plus(x.gain), ZERO)).plus(sumAmounts(r.income, a, b));
        cgt = cgt.plus(sumAmounts(r.taxEvents, a, b));
        charges = charges.plus(sales.reduce((s, x) => s.plus(x.deductions), ZERO));
      }
      months.push({ month: m, label: MON[Number(m.slice(5, 7)) - 1], gross: r2(gross), cgt: r2(cgt), net: r2(gross.minus(cgt).minus(charges)) });
    }
    if (months.length > 12) for (const x of months) x.label = `${x.label} ${x.month.slice(2, 4)}`;
  }

  // Month-end closing value vs invested (FIFO cost of units held) inside the range.
  // Each month-end uses the latest NAV known on that day (MUFAP captures,
  // statement valuations, transaction NAVs); a unit with no price at all
  // counts at cost so the line never drops to zero for a missing quote.
  const series = [];
  const pointAt = (at) => {
    let inv = ZERO; let val = ZERO; let old = 0; let held = 0;
    for (const [k, list] of groups) {
      if (!shownKeys.has(k)) continue;
      const fundId = k.split('|')[1];
      const st = stateAt(list, componentsByEntry, priceAt, fundId, at);
      if (st.units.isZero()) continue;
      held += 1;
      inv = inv.plus(st.cost);
      val = val.plus(st.value ?? st.cost);
      if (!st.price || Date.parse(at) - Date.parse(st.price.date) > 7 * 86_400_000) old += 1;
    }
    return { date: at, invested: r2(inv), value: r2(val), live: at === today, priced: old ? 'mixed' : 'close', held };
  };
  if (firstData) {
    // Opening balance: what was held the day before a range that starts on the 1st,
    // so growth over the period is measured from where the period began.
    if (start > firstData && start.endsWith('-01')) {
      const at = dayBefore(start);
      const { held, ...pt } = pointAt(at);
      if (held) series.push({ ...pt, month: at.slice(0, 7), opening: true, label: 'Open', tick: 'Open', title: `Opening balance, ${longDate(at)}` });
    }
    const from = start > firstData ? start : firstData;
    for (let m = from.slice(0, 7); m <= endEff.slice(0, 7) && series.length < MAX_MONTHS; m = nextMonth(m)) {
      const at = monthEnd(m) < endEff ? monthEnd(m) : endEff;
      const { held: _held, ...pt } = pointAt(at);
      series.push({ ...pt, month: m, label: MON[Number(m.slice(5, 7)) - 1] });
    }
    if (series.length > 12) for (const x of series) if (!x.opening) x.label = `${x.label} ${x.month.slice(2, 4)}`;
  }

  return { version: PROFIT_VERSION, start, end: endEff, totals, positions: shown, allPositions: positions, months, series };
}

/**
 * Months → Pakistan fiscal years (1 Jul – 30 Jun), summed exactly.
 * Each row keeps the chart's shape: { month (first month of the FY), tick, title, gross, cgt, net }.
 */
export function groupByFiscalYear(months) {
  const years = new Map();
  for (const m of months) {
    const [y, mo] = m.month.split('-').map(Number);
    const fy = mo >= 7 ? y : y - 1;
    if (!years.has(fy)) years.set(fy, { gross: ZERO, cgt: ZERO, net: ZERO });
    const acc = years.get(fy);
    acc.gross = acc.gross.plus(String(m.gross));
    acc.cgt = acc.cgt.plus(String(m.cgt));
    acc.net = acc.net.plus(String(m.net));
  }
  return [...years.entries()].sort((a, b) => a[0] - b[0]).map(([fy, v]) => {
    const short = `FY ${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
    return { month: `${fy}-07`, label: short, tick: short, title: `FY ${fy}-${String(fy + 1).slice(2)}`, gross: r2(v.gross), cgt: r2(v.cgt), net: r2(v.net) };
  });
}
