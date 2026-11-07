/**
 * Mutual fund portfolio engine — deterministic, exact-decimal, versioned.
 *
 * Input: approved ledger entries + their components (as stored), and price
 * observations. Output: positions (FIFO lots, holdings, realized/unrealized,
 * CGT deducted / reversed / refunded) and portfolio totals with XIRR.
 *
 * Nothing here estimates tax. CGT figures are exactly what statements
 * reported; the engine only sums them. Cost basis and realized gain ARE
 * computed (FIFO, the method each AMC uses — see mf_amcs.cost_method_evidence)
 * and are labelled as computed, never as the AMC's own figure.
 *
 * Identity the engine maintains (and the tests assert):
 *   net profit = market value + cash received − cash invested
 *              = realized + unrealized + distributions − net CGT − other charges
 */
import Decimal from 'decimal.js';

export const ENGINE_VERSION = 'mf-engine-1.3.0';
// Period and monthly profit live in ./profit.js (analyzeFunds).

/**
 * Rate used ONLY to estimate the CGT that would fall due if today's
 * unrealized gains were realized: 15%, the rate for individual filers on
 * mutual funds. Never mixed with CGT the statements actually report.
 */
export const CGT_ESTIMATE_RATE = '0.15';

const D = (v) => (v === null || v === undefined || v === '' ? null : new Decimal(String(v)));
const ZERO = new Decimal(0);
// Statements round units (UBL prints 2 decimals, MCB 4), so a full redemption
// can be 0.01–0.03 units more than the rounded purchases added up to.
const UNIT_TOLERANCE = new Decimal('0.05');
const DUST_UNITS = new Decimal('0.01');

const UNIT_IN = new Set(['purchase', 'switch_in', 'transfer_in', 'dividend_reinvest', 'bonus_units', 'capital_refund_units', 'cgt_refund_reinvest']);
const UNIT_OUT = new Set(['redemption', 'switch_out', 'transfer_out']);
const DISTRIBUTIONS = new Set(['dividend_cash', 'dividend_reinvest', 'capital_refund_units']);
const OUTFLOW_CHARGES = new Set(['zakat', 'wht', 'back_load', 'charge', 'other_deduction']);
const INFLOW_COSTS = new Set(['front_load', 'load_tax', 'transaction_cost', 'charge']);

/**
 * @typedef {object} Entry  mf_ledger_entries row (numerics as strings)
 * @typedef {{ entry_id: string, component_type: string, amount: string }} Component
 * @typedef {{ fund_id: string, price: string, date: string, source: string, kind?: string }} PriceObs
 */

/**
 * @param {object} p
 * @param {Entry[]} p.entries
 * @param {Component[]} p.components
 * @param {PriceObs[]} [p.prices]
 * @param {Record<string, {name: string, amc_id: string, mufap_slug?: string}>} [p.funds]
 * @param {Record<string, {name: string, code: string, cost_method_evidence: string}>} [p.amcs]
 * @param {string} [p.asOf] ISO date, default today
 * @param {number} [p.staleDays]
 */
export function computePortfolio({ entries, components = [], prices = [], funds = {}, amcs = {}, asOf, staleDays = 4 }) {
  const today = asOf ?? new Date().toISOString().slice(0, 10);

  // Reversals cancel their target; both drop out.
  const reversed = new Set(entries.filter((e) => e.reverses_entry_id).map((e) => e.reverses_entry_id));
  const live = entries.filter((e) => !e.reverses_entry_id && !reversed.has(e.id));

  const compsByEntry = new Map();
  for (const c of components) {
    if (!compsByEntry.has(c.entry_id)) compsByEntry.set(c.entry_id, []);
    compsByEntry.get(c.entry_id).push(c);
  }

  const groups = new Map();
  for (const e of live) {
    const key = `${e.account_id}|${e.fund_id}|${e.unit_class ?? ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  // No market observation for a fund → fall back to the latest NAV printed on
  // an approved statement, dated and labelled as such. Never a cost price.
  const fromLedger = live
    .filter((e) => e.nav !== null && e.nav !== undefined && Number(e.nav) > 0)
    .map((e) => ({ fund_id: e.fund_id, price: String(e.nav), date: e.price_date ?? e.trade_date, source: 'statement', kind: 'nav' }));
  const latestPrice = latestPrices([...prices, ...fromLedger]);
  const positions = [];
  for (const [key, list] of groups) {
    list.sort(compareEntries);
    const fund = funds[list[0].fund_id];
    const amc = fund ? amcs[fund.amc_id] : null;
    positions.push(computePosition(key, list, compsByEntry, latestPrice.get(list[0].fund_id), {
      today, staleDays, fund, amc,
    }));
  }
  positions.sort((a, b) => (b.marketValue?.toNumber?.() ?? 0) - (a.marketValue?.toNumber?.() ?? 0));

  const totals = sumTotals(positions);
  totals.xirr = xirr([
    ...positions.flatMap((p) => p.externalFlows),
    ...(totals.marketValue && !totals.marketValue.isZero() ? [{ date: today, amount: totals.marketValue }] : []),
  ]);
  return { engineVersion: ENGINE_VERSION, asOf: today, positions, totals };
}

export function compareEntries(a, b) {
  return (a.trade_date < b.trade_date ? -1 : a.trade_date > b.trade_date ? 1 : 0)
    || ((a.seq ?? 0) - (b.seq ?? 0))
    || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
}

function latestPrices(prices) {
  const best = new Map();
  for (const p of prices) {
    if (!p || p.price === null || p.price === undefined || Number(p.price) <= 0) continue;
    const cur = best.get(p.fund_id);
    // Latest date wins; on a tie prefer the market feed (repurchase price).
    if (!cur || p.date > cur.date || (p.date === cur.date && p.source === 'mufap' && cur.source !== 'mufap')) {
      best.set(p.fund_id, p);
    }
  }
  return best;
}

function computePosition(key, list, compsByEntry, price, ctx) {
  const [accountId, fundId, unitClass] = key.split('|');
  const lots = [];          // { entryId, date, units, cost, costKnown }
  const allocations = [];   // realized pieces
  const flags = new Set();
  const flows = [];         // position-level cash flows (incl. switches)
  const externalFlows = []; // portfolio-level: money between investor and AMC

  let units = ZERO;
  let invested = ZERO, received = ZERO, reinvested = ZERO;
  let realized = ZERO, distributions = ZERO;
  let cgtDeducted = ZERO, cgtReversed = ZERO, cgtRefunded = ZERO;
  let otherCharges = ZERO, otherCredits = ZERO, chargesInCost = ZERO;
  let realizedComplete = true;

  for (const e of list) {
    const comps = compsByEntry.get(e.id) ?? [];
    const sumOf = (types) => comps.filter((c) => types.has(c.component_type)).reduce((s, c) => s.plus(c.amount), ZERO);
    const compAmount = (t) => comps.filter((c) => c.component_type === t).reduce((s, c) => s.plus(c.amount), ZERO);
    cgtDeducted = cgtDeducted.plus(compAmount('cgt'));
    cgtReversed = cgtReversed.plus(compAmount('cgt_reversal'));
    cgtRefunded = cgtRefunded.plus(compAmount('cgt_refund'));
    otherCredits = otherCredits.plus(compAmount('other_credit'));

    const du = D(e.unit_delta);
    const gross = D(e.gross_amount);
    const net = D(e.net_amount);
    const t = e.entry_type;

    if (UNIT_IN.has(t) && du && du.gt(0)) {
      units = units.plus(du);
      let cost = gross ?? net ?? (D(e.nav) ? du.times(e.nav) : null);
      let costKnown = cost !== null;
      if (t === 'bonus_units') { cost = ZERO; costKnown = true; flags.add('bonus_units_zero_cost'); }
      if (t === 'transfer_in' && gross === null) { costKnown = false; flags.add('transfer_in_cost_unknown'); }
      if (gross === null && net === null && cost !== null) flags.add('cost_from_units_times_nav');
      lots.push({ entryId: e.id, date: e.trade_date, units: du, originalUnits: du, cost: cost ?? ZERO, costKnown });
      chargesInCost = chargesInCost.plus(sumOf(INFLOW_COSTS));

      if (t === 'purchase') {
        invested = invested.plus(gross ?? net ?? ZERO);
        flows.push({ date: e.trade_date, amount: (gross ?? net ?? ZERO).negated() });
        externalFlows.push({ date: e.trade_date, amount: (gross ?? net ?? ZERO).negated() });
      } else if (t === 'switch_in' || t === 'transfer_in') {
        invested = invested.plus(gross ?? ZERO);
        flows.push({ date: e.trade_date, amount: (gross ?? ZERO).negated() });
      } else {
        reinvested = reinvested.plus(cost ?? ZERO);
      }
      if (DISTRIBUTIONS.has(t)) distributions = distributions.plus(gross ?? ZERO);
    } else if (UNIT_OUT.has(t) && du && du.lt(0)) {
      let need = du.abs();
      units = units.plus(du);
      let cost = ZERO;
      let known = true;
      while (need.gt(0) && lots.length) {
        const lot = lots[0];
        const take = Decimal.min(need, lot.units);
        const part = lot.units.isZero() ? ZERO : lot.cost.times(take).dividedBy(lot.units);
        allocations.push({ fromEntry: lot.entryId, toEntry: e.id, units: take, cost: part, acquired: lot.date, disposed: e.trade_date });
        if (!lot.costKnown) known = false;
        cost = cost.plus(part);
        lot.cost = lot.cost.minus(part);
        lot.units = lot.units.minus(take);
        need = need.minus(take);
        if (lot.units.lte(0)) lots.shift();
      }
      if (need.gt(UNIT_TOLERANCE)) {
        flags.add('insufficient_units');
        known = false;
      }
      const deductions = sumOf(new Set(['cgt', ...OUTFLOW_CHARGES, 'transaction_cost']));
      const proceeds = gross ?? (net !== null ? net.plus(deductions) : (D(e.nav) ? du.abs().times(e.nav) : null));
      if (proceeds === null) { known = false; flags.add('proceeds_unknown'); }
      if (t !== 'transfer_out') {
        realized = realized.plus((proceeds ?? ZERO).minus(cost));
        otherCharges = otherCharges.plus(sumOf(OUTFLOW_CHARGES));
        const cashOut = net ?? (proceeds ? proceeds.minus(deductions) : ZERO);
        received = received.plus(cashOut);
        flows.push({ date: e.trade_date, amount: cashOut });
        if (t === 'redemption') externalFlows.push({ date: e.trade_date, amount: cashOut });
      } else {
        flags.add('transfer_out_moves_cost');
      }
      if (!known) realizedComplete = false;
    } else if (t === 'dividend_cash') {
      distributions = distributions.plus(gross ?? net ?? ZERO);
      otherCharges = otherCharges.plus(sumOf(OUTFLOW_CHARGES));
      const cash = net ?? gross ?? ZERO;
      received = received.plus(cash);
      flows.push({ date: e.trade_date, amount: cash });
      externalFlows.push({ date: e.trade_date, amount: cash });
    } else if (t === 'cgt_refund_cash' || t === 'cgt_reversal') {
      const cash = net ?? gross ?? ZERO;
      received = received.plus(cash);
      flows.push({ date: e.trade_date, amount: cash });
      externalFlows.push({ date: e.trade_date, amount: cash });
    } else if (t === 'zakat_deduction' || t === 'wht_deduction' || t === 'fee_charge' || t === 'sales_load') {
      // Standalone charge with no unit movement: paid by the investor.
      const amt = gross ?? net ?? ZERO;
      otherCharges = otherCharges.plus(amt);
      invested = invested.plus(amt);
      flows.push({ date: e.trade_date, amount: amt.negated() });
      externalFlows.push({ date: e.trade_date, amount: amt.negated() });
    } else if (t === 'cgt_deduction') {
      // Standalone CGT paid in cash by the investor.
      invested = invested.plus(gross ?? net ?? ZERO);
      flows.push({ date: e.trade_date, amount: (gross ?? net ?? ZERO).negated() });
      externalFlows.push({ date: e.trade_date, amount: (gross ?? net ?? ZERO).negated() });
    } else if (t === 'other_adjustment' && du && !du.isZero()) {
      units = units.plus(du);
      if (du.gt(0)) {
        lots.push({ entryId: e.id, date: e.trade_date, units: du, originalUnits: du, cost: gross ?? ZERO, costKnown: gross !== null });
        if (gross === null) flags.add('opening_balance_cost_unknown');
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
        flags.add('unit_adjustment');
      }
    }
  }

  if (units.abs().lte(UNIT_TOLERANCE)) units = units.isNegative() ? ZERO : units;
  const costOpen = lots.reduce((s, l) => s.plus(l.cost), ZERO);
  const costKnown = lots.every((l) => l.costKnown);
  const netCgt = cgtDeducted.minus(cgtReversed).minus(cgtRefunded);   // never clamped

  let marketValue = null, unrealized = null;
  let priceInfo = null;
  if (price) {
    const age = Math.round((Date.parse(ctx.today) - Date.parse(price.date)) / 86_400_000);
    priceInfo = { value: new Decimal(price.price), date: price.date, source: price.source, kind: price.kind ?? 'nav', ageDays: age, stale: age > ctx.staleDays };
    marketValue = units.gt(0) ? units.times(price.price) : ZERO;
    unrealized = costKnown ? marketValue.minus(costOpen) : null;
  } else if (units.lte(DUST_UNITS)) {
    marketValue = ZERO;
    unrealized = ZERO;
  } else {
    flags.add('no_price');
  }

  // Estimate only: CGT due if the open gain were realized today. A loss owes nothing.
  const expectedCgt = unrealized === null ? null : (unrealized.gt(0) ? unrealized.times(CGT_ESTIMATE_RATE) : ZERO);
  const grossProfit = unrealized === null ? null : realized.plus(unrealized).plus(distributions);
  const netProfit = grossProfit === null ? null : grossProfit.minus(netCgt).minus(otherCharges).plus(otherCredits);
  const cashIdentity = marketValue === null ? null : marketValue.plus(received).minus(invested);

  if (cashIdentity !== null && netProfit !== null && cashIdentity.minus(netProfit).abs().gt('0.05')) {
    flags.add('identity_mismatch');   // should never happen; surfaced, not hidden
  }

  return {
    key, accountId, fundId, unitClass,
    fundName: ctx.fund?.name ?? null,
    amcName: ctx.amc?.name ?? null,
    method: { name: 'FIFO', evidence: ctx.amc?.cost_method_evidence ?? 'industry_default', computed: true },
    units,
    isOpen: units.gt(DUST_UNITS),
    lots: lots.map((l) => ({ ...l })),
    allocations,
    costOpen, costKnown,
    price: priceInfo,
    marketValue, unrealized,
    realized, realizedComplete,
    distributions, reinvested,
    invested, received,
    cgtDeducted, cgtReversed, cgtRefunded, netCgt,
    otherCharges, otherCredits, chargesInCost,
    grossProfit, netProfit, cashIdentity,
    expectedCgt,
    netAfterExpectedCgt: netProfit === null || expectedCgt === null ? null : netProfit.minus(expectedCgt),
    xirr: xirr([...flows, ...(marketValue && marketValue.gt(0) ? [{ date: ctx.today, amount: marketValue }] : [])]),
    externalFlows,
    entryCount: list.length,
    firstDate: list[0]?.trade_date ?? null,
    lastDate: list[list.length - 1]?.trade_date ?? null,
    flags: [...flags],
  };
}

function sumTotals(positions) {
  const keys = ['marketValue', 'costOpen', 'unrealized', 'realized', 'distributions', 'invested', 'received',
    'cgtDeducted', 'cgtReversed', 'cgtRefunded', 'netCgt', 'otherCharges', 'chargesInCost', 'grossProfit', 'netProfit',
    'expectedCgt', 'netAfterExpectedCgt'];
  const t = {};
  for (const k of keys) {
    let incomplete = false;
    t[k] = positions.reduce((s, p) => {
      if (p[k] === null) { incomplete = true; return s; }
      return s.plus(p[k]);
    }, ZERO);
    if (incomplete) t[`${k}Incomplete`] = true;
  }
  // Portfolio-level money in/out excludes switches between funds.
  t.externalInvested = positions.flatMap((p) => p.externalFlows).filter((f) => f.amount.lt(0)).reduce((s, f) => s.minus(f.amount), ZERO);
  t.externalReceived = positions.flatMap((p) => p.externalFlows).filter((f) => f.amount.gt(0)).reduce((s, f) => s.plus(f.amount), ZERO);
  t.returnPct = t.externalInvested.gt(0) && !t.netProfitIncomplete ? t.netProfit.dividedBy(t.externalInvested).times(100) : null;
  t.openPositions = positions.filter((p) => p.isOpen).length;
  t.flags = [...new Set(positions.flatMap((p) => p.flags))];
  return t;
}

/**
 * XIRR by Newton's method with a bisection fallback, in exact decimals.
 * @param {{date: string, amount: Decimal}[]} flows  negative = paid in
 * @returns {Decimal|null} annual rate, e.g. 0.18 for 18%
 */
export function xirr(flows) {
  const fs = flows.filter((f) => f.amount && !f.amount.isZero());
  if (fs.length < 2 || !fs.some((f) => f.amount.lt(0)) || !fs.some((f) => f.amount.gt(0))) return null;
  const t0 = Math.min(...fs.map((f) => Date.parse(f.date)));
  const years = fs.map((f) => new Decimal((Date.parse(f.date) - t0) / 86_400_000).dividedBy(365));
  const span = Math.max(...years.map((y) => y.toNumber()));
  if (span < 1 / 365) return null;
  const Dp = Decimal.clone({ precision: 24 });
  const npv = (r) => fs.reduce((s, f, i) => s.plus(new Dp(f.amount).dividedBy(new Dp(1).plus(r).pow(years[i]))), new Dp(0));
  const dnpv = (r) => fs.reduce((s, f, i) => s.minus(new Dp(f.amount).times(years[i]).dividedBy(new Dp(1).plus(r).pow(years[i].plus(1)))), new Dp(0));

  let r = new Dp('0.1');
  for (let i = 0; i < 50; i++) {
    const f = npv(r);
    if (f.abs().lt('1e-7')) return new Decimal(r.toString());
    const d = dnpv(r);
    if (d.isZero()) break;
    const next = r.minus(f.dividedBy(d));
    if (!next.isFinite() || next.lte(-0.9999) || next.gt(1e6)) break;
    if (next.minus(r).abs().lt('1e-12')) return new Decimal(next.toString());
    r = next;
  }
  // Bisection fallback.
  let lo = new Dp('-0.9999'), hi = new Dp('1000');
  let flo = npv(lo), fhi = npv(hi);
  if (flo.isNegative() === fhi.isNegative()) return null;
  for (let i = 0; i < 200; i++) {
    const mid = lo.plus(hi).dividedBy(2);
    const fm = npv(mid);
    if (fm.abs().lt('1e-7') || hi.minus(lo).lt('1e-10')) return new Decimal(mid.toString());
    if (fm.isNegative() === flo.isNegative()) { lo = mid; flo = fm; } else { hi = mid; fhi = fm; }
  }
  return null;
}
