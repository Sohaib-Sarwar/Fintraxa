/**
 * Capital gains tax on PSX shares, computed the way NCCPL does it (Income Tax Rules,
 * Rule 13N special procedure; the "Inventory Based Capital Gain/Loss" report brokers
 * send monthly, and NCCPL's Annual Capital Gain Loss Report).
 *
 * LOTS
 *   Sales are matched to purchases first in, first out, per stock, ordered by
 *   SETTLEMENT date (T+1). A lot's holding period runs from the purchase's settlement to
 *   the sale's settlement, and the gain belongs to the month and tax year of the sale's
 *   settlement.
 *
 * DEEMED COSTS (Rule 13N)
 *   NCCPL does not use the broker's actual commission. For a client's trade it deducts
 *   0.5% of the sale consideration and adds 0.5% to the cost of acquisition:
 *       gain = (sale − cost) − 0.5% × sale − 0.5% × cost
 *   (A share bought and sold at the same price is a loss of 1% of the turnover.)
 *   Verified against a real NCCPL certificate and broker report: 29 of 31 lots equal to the
 *   paisa, the other 2 differing only by a sale price stored with 2 decimals instead of 3.
 *
 * MONTHS (provisional CGT, as the broker report shows it)
 *   Within a tax year (1 July – 30 June) gains and losses run on: each month's CGT is
 *   15% of the year-to-date net gain (after carried-forward losses) minus what earlier
 *   months were already charged. A losing month after a gaining one is a refund (negative).
 *
 * TAX YEARS (final)
 *   Net gain of the year (A) − carried-forward losses of the previous 3 tax years, used
 *   oldest first = taxable gain; CGT = 15% of it. A net loss is carried forward for the
 *   next 3 tax years; unused after that, it expires.
 *
 * RATE
 *   15% for shares acquired on or after 1 July 2024 (filer or not, from tax year 2026).
 *   Older acquisitions had holding-period slabs; such lots are flagged `olderRegime` and
 *   15% is assumed.
 *
 * This covers shares only. NCCPL nets one taxpayer's gains and losses across all brokers and
 * mutual funds (its "Capital Gain/(Loss) Allocation"); funds' CGT is deducted by the funds
 * themselves and shown with them.
 *
 * Exact decimals (decimal.js) throughout.
 */
import Decimal from 'decimal.js';

export const DEEMED_COST_RATE = '0.005';   // Rule 13N: 0.5% of sale and of cost, client trades
export const CGT_RATE = '0.15';
export const CARRY_FORWARD_YEARS = 3;
const NEW_REGIME_FROM = '2024-07-01';

const D = (v) => new Decimal(String(v ?? 0));
const ZERO = new Decimal(0);
const r2 = (d) => Number(D(d).toFixed(2));
const DAY = 86_400_000;
const settleOf = (t) => String(t.settlement_date ?? t.date).slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
/** Tax year of a date: TY 2026 = 1 Jul 2025 – 30 Jun 2026. */
export const taxYearOf = (iso) => { const y = Number(iso.slice(0, 4)); return Number(iso.slice(5, 7)) >= 7 ? y + 1 : y; };
export const taxYearRange = (ty) => ({ start: `${ty - 1}-07-01`, end: `${ty}-06-30` });

/**
 * Every lot ever closed, oldest first.
 * @returns {{ lots: Lot[], unmatched: { symbol, settlement, quantity }[] }}
 * Lot: { settlement, saleDate, symbol, quantity, buyPrice, sellPrice, buySettlement, buyDate,
 *        holdingDays, sale, cost, priceGain, deemedCost, gain, provisionalCgt, olderRegime, broker }
 */
export function closedLots(trades, { costRate = DEEMED_COST_RATE, rate = CGT_RATE } = {}) {
  const r = D(costRate); const tax = D(rate);
  const ordered = [...trades]
    .filter((t) => t.symbol && (t.type === 'buy' || t.type === 'sell') && Number(t.quantity) > 0)
    .sort((a, b) => settleOf(a).localeCompare(settleOf(b))
      || (a.type === b.type ? 0 : a.type === 'buy' ? -1 : 1)          // same settlement: buys first
      || String(a.date).localeCompare(String(b.date))
      || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
  const open = new Map(); const lots = []; const unmatched = [];
  for (const t of ordered) {
    const sym = String(t.symbol).trim().toUpperCase();
    if (!open.has(sym)) open.set(sym, []);
    const queue = open.get(sym);
    if (t.type === 'buy') {
      queue.push({ qty: D(t.quantity), price: D(t.price), settled: settleOf(t), date: String(t.date).slice(0, 10) });
      continue;
    }
    let need = D(t.quantity);
    const settled = settleOf(t);
    while (need.gt(0) && queue.length) {
      const lot = queue[0];
      const take = Decimal.min(need, lot.qty);
      const sale = take.times(D(t.price));
      const cost = take.times(lot.price);
      const deemed = r.times(sale.plus(cost));
      const gain = sale.minus(cost).minus(deemed).toDecimalPlaces(2);
      lots.push({
        settlement: settled, saleDate: String(t.date).slice(0, 10), symbol: sym, broker: t.broker ?? null,
        quantity: Number(take), buyPrice: Number(lot.price), sellPrice: Number(D(t.price)),
        buySettlement: lot.settled, buyDate: lot.date, holdingDays: daysBetween(lot.settled, settled),
        sale: r2(sale), cost: r2(cost), priceGain: r2(sale.minus(cost)), deemedCost: r2(deemed),
        gain: Number(gain), provisionalCgt: gain.gt(0) ? r2(gain.times(tax)) : 0,
        olderRegime: lot.settled < NEW_REGIME_FROM,
      });
      lot.qty = lot.qty.minus(take);
      need = need.minus(take);
      if (lot.qty.lte(0)) queue.shift();
    }
    if (need.gt(0)) unmatched.push({ symbol: sym, settlement: settled, quantity: Number(need) });
  }
  return { lots, unmatched };
}

const sumBy = (rows, f) => rows.reduce((s, x) => s.plus(D(f(x))), ZERO);

/**
 * Tax years with carry-forward, and the months of each with running provisional CGT.
 * @returns {{
 *   years: TaxYear[], lots, unmatched,
 *   year(ty): TaxYear | undefined
 * }}
 * TaxYear: { taxYear, start, end, gains, losses, net, carriedIn: [{ fromYear, used }], carriedUsed,
 *            taxable, cgt, lossCarriedOut, carryForward: [{ fromYear, amount, expires }],
 *            months: Month[], lots }
 * Month: { month, gains, losses, net, ytdNet, ytdTaxable, ytdCgt, previouslyCharged, cgtThisMonth, lots }
 */
export function nccplReport(trades, { costRate = DEEMED_COST_RATE, rate = CGT_RATE, today } = {}) {
  const { lots, unmatched } = closedLots(trades, { costRate, rate });
  const tax = D(rate);
  const lastTy = Math.max(...[...lots.map((l) => taxYearOf(l.settlement)), today ? taxYearOf(today) : 0]);
  const firstTy = lots.length ? taxYearOf(lots[0].settlement) : lastTy;
  const pool = []; // carried-forward losses: { fromYear, left: Decimal }
  const years = [];
  for (let ty = firstTy; ty <= lastTy && lots.length; ty += 1) {
    const { start, end } = taxYearRange(ty);
    const yl = lots.filter((l) => l.settlement >= start && l.settlement <= end);
    const gains = sumBy(yl.filter((l) => l.gain > 0), (l) => l.gain);
    const losses = sumBy(yl.filter((l) => l.gain < 0), (l) => l.gain);
    const net = gains.plus(losses);
    // Losses from the previous 3 tax years still usable, oldest first.
    const usable = pool.filter((p) => p.left.gt(0) && ty - p.fromYear <= CARRY_FORWARD_YEARS);
    let toCover = net.gt(0) ? net : ZERO;
    const carriedIn = [];
    for (const p of usable.sort((a, b) => a.fromYear - b.fromYear)) {
      if (toCover.lte(0)) break;
      const used = Decimal.min(p.left, toCover);
      p.left = p.left.minus(used); toCover = toCover.minus(used);
      carriedIn.push({ fromYear: p.fromYear, used: r2(used) });
    }
    const carriedUsed = carriedIn.reduce((s, c) => s.plus(D(c.used)), ZERO);
    const taxable = net.gt(0) ? net.minus(carriedUsed) : ZERO;
    if (net.lt(0)) pool.push({ fromYear: ty, left: net.abs() });

    // Months: running year-to-date, after the carried-forward losses available this year.
    const available = usable.reduce((s, p) => s.plus(p.left), ZERO).plus(carriedUsed); // what could be used this year
    const months = [];
    let ytd = ZERO; let charged = ZERO;
    const keys = [...new Set(yl.map((l) => l.settlement.slice(0, 7)))].sort();
    for (const m of keys) {
      const ml = yl.filter((l) => l.settlement.startsWith(m));
      const mg = sumBy(ml.filter((l) => l.gain > 0), (l) => l.gain);
      const ms = sumBy(ml.filter((l) => l.gain < 0), (l) => l.gain);
      ytd = ytd.plus(mg).plus(ms);
      const ytdTaxable = ytd.gt(available) ? ytd.minus(available) : ZERO;
      const ytdCgt = ytdTaxable.times(tax).toDecimalPlaces(2);
      months.push({
        month: m, gains: r2(mg), losses: r2(ms), net: r2(mg.plus(ms)),
        ytdNet: r2(ytd), ytdTaxable: r2(ytdTaxable), ytdCgt: r2(ytdCgt),
        previouslyCharged: r2(charged), cgtThisMonth: r2(ytdCgt.minus(charged)), lots: ml,
      });
      charged = ytdCgt;
    }
    years.push({
      taxYear: ty, start, end, lossesAvailable: r2(available),
      gains: r2(gains), losses: r2(losses), net: r2(net),
      carriedIn, carriedUsed: r2(carriedUsed), taxable: r2(taxable), cgt: r2(taxable.times(tax)),
      lossCarriedOut: net.lt(0) ? r2(net.abs()) : 0,
      carryForward: pool.filter((p) => p.left.gt(0) && p.fromYear + CARRY_FORWARD_YEARS > ty)
        .map((p) => ({ fromYear: p.fromYear, amount: r2(p.left), expires: p.fromYear + CARRY_FORWARD_YEARS })),
      months, lots: yl,
    });
  }
  return { years, lots, unmatched, year: (ty) => years.find((y) => y.taxYear === ty) };
}

/**
 * NCCPL figures for a date range (lots by sale settlement date, the same lots the range's
 * realized profit counts).
 *
 * CGT for the range is the change in the tax year's running charge across it:
 *     CGT charged to date at the range's last day − CGT charged to date just before its first day
 * where "charged to date" = 15% × max(0, year-to-date net − losses brought forward into the year).
 * At month ends this is exactly the monthly charge above, so whole months and whole tax years
 * agree with the statement; a range that starts or ends mid-month gets only its own days' share
 * (counting a whole month's CGT while counting only part of its lots would not match the profit).
 * A range spanning tax years is split at 30 June; each year runs on its own.
 * @returns {{ lots, gains, losses, net, deemedCost, cgt, years: Segment[] }}
 * Segment: { taxYear, start, end, net, ytdBefore, ytdEnd, lossesAvailable, lossesUsed,
 *            taxableToDate, cgtToDate, chargedBefore, cgt }
 */
export function nccplPeriod(report, { start, end }, { rate = CGT_RATE } = {}) {
  const tax = D(rate);
  const lots = report.lots.filter((l) => l.settlement >= start && l.settlement <= end);
  const charge = (ytd, available) => (ytd.gt(available) ? ytd.minus(available).times(tax).toDecimalPlaces(2) : ZERO);
  const years = report.years.filter((y) => y.start <= end && y.end >= start).map((y) => {
    const from = start > y.start ? start : y.start;
    const to = end < y.end ? end : y.end;
    const available = D(y.lossesAvailable);
    const ytdBefore = sumBy(y.lots.filter((l) => l.settlement < from), (l) => l.gain);
    const ytdEnd = sumBy(y.lots.filter((l) => l.settlement <= to), (l) => l.gain);
    const before = charge(ytdBefore, available);
    const toDate = charge(ytdEnd, available);
    return {
      taxYear: y.taxYear, start: from, end: to, net: r2(ytdEnd.minus(ytdBefore)),
      ytdBefore: r2(ytdBefore), ytdEnd: r2(ytdEnd), lossesAvailable: r2(available),
      lossesUsed: r2(Decimal.min(available, Decimal.max(ytdEnd, ZERO))),
      taxableToDate: r2(Decimal.max(ytdEnd.minus(available), ZERO)),
      cgtToDate: r2(toDate), chargedBefore: r2(before), cgt: r2(toDate.minus(before)),
    };
  });
  return {
    lots,
    gains: r2(sumBy(lots.filter((l) => l.gain > 0), (l) => l.gain)),
    losses: r2(sumBy(lots.filter((l) => l.gain < 0), (l) => l.gain)),
    net: r2(sumBy(lots, (l) => l.gain)),
    deemedCost: r2(sumBy(lots, (l) => l.deemedCost)),
    cgt: r2(sumBy(years, (s) => s.cgt)),
    years,
  };
}

/** "2025-26" for tax year 2026. */
export const taxYearLabel = (ty) => `${ty - 1}-${String(ty).slice(2)}`;
