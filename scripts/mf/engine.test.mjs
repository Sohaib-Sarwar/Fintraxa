/**
 * Portfolio engine: FIFO, CGT handling and every accounting case in the
 * brief. Expected values are worked by hand in the comments.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePortfolio, xirr } from '../../src/lib/mf/engine.js';
import Decimal from 'decimal.js';

let id = 0;
const E = (o) => ({ id: `e${++id}`, account_id: o.account ?? 'A', fund_id: o.fund ?? 'F', unit_class: '', seq: id, created_at: String(id).padStart(6, '0'), ...o });
const C = (entry, type, amount) => ({ entry_id: entry.id, component_type: type, amount: String(amount) });
const price = (p, fund = 'F', date = '2026-10-31') => ({ fund_id: fund, price: String(p), date, source: 'mufap' });
const run = (entries, components = [], prices = [price(16)]) => computePortfolio({ entries, components, prices, asOf: '2026-10-31' });
const s = (d) => (d === null ? null : new Decimal(d).toFixed(2));

// Base: buy 100 @10 (1,000), buy 100 @12 (1,200), redeem 150 @15 (gross 2,250, CGT 30, net 2,220).
function base() {
  const b1 = E({ entry_type: 'purchase', trade_date: '2026-01-10', unit_delta: '100', nav: '10', gross_amount: '1000', net_amount: '1000', cash_direction: 'investor_pays' });
  const b2 = E({ entry_type: 'purchase', trade_date: '2026-02-10', unit_delta: '100', nav: '12', gross_amount: '1200', net_amount: '1200', cash_direction: 'investor_pays' });
  const r1 = E({ entry_type: 'redemption', trade_date: '2026-06-10', unit_delta: '-150', nav: '15', gross_amount: '2250', net_amount: '2220', cash_direction: 'investor_receives' });
  return { entries: [b1, b2, r1], components: [C(r1, 'cgt', 30)] };
}

test('FIFO, not average cost: realized 650 (avg cost would give 600)', () => {
  const { entries, components } = base();
  const p = run(entries, components).positions[0];
  // FIFO cost of 150 units = 1,000 + 50 × 12 = 1,600 → realized 2,250 − 1,600 = 650.
  assert.equal(s(p.realized), '650.00');
  assert.equal(p.units.toFixed(4), '50.0000');
  assert.equal(s(p.costOpen), '600.00');
  // Value 50 × 16 = 800 → unrealized 200. Net = 650 + 200 − 30 = 820.
  assert.equal(s(p.marketValue), '800.00');
  assert.equal(s(p.unrealized), '200.00');
  assert.equal(s(p.cgtDeducted), '30.00');
  assert.equal(s(p.netProfit), '820.00');
  // Identity: value + received − invested = 800 + 2,220 − 2,200 = 820.
  assert.equal(s(p.cashIdentity), '820.00');
  assert.equal(p.allocations.length, 2, 'redemption allocated across two lots');
});

test('full redemption leaves no units and no open cost', () => {
  const b = E({ entry_type: 'purchase', trade_date: '2026-01-01', unit_delta: '10', nav: '10', gross_amount: '100', net_amount: '100', cash_direction: 'investor_pays' });
  const r = E({ entry_type: 'redemption', trade_date: '2026-02-01', unit_delta: '-10', nav: '11', gross_amount: '110', net_amount: '110', cash_direction: 'investor_receives' });
  const p = run([b, r], []).positions[0];
  assert.equal(p.units.toFixed(4), '0.0000');
  assert.equal(s(p.costOpen), '0.00');
  assert.equal(s(p.realized), '10.00');
  assert.equal(p.isOpen, false);
});

test('CGT refund reinvested as units: reduces net CGT AND creates a real lot (units were issued)', () => {
  const { entries, components } = base();
  const ref = E({ entry_type: 'cgt_refund_reinvest', trade_date: '2026-06-22', unit_delta: '2', nav: '15', gross_amount: '30', net_amount: '30', cash_direction: 'internal' });
  const p = run([...entries, ref], [...components, C(ref, 'cgt_refund', 30)]).positions[0];
  assert.equal(s(p.cgtDeducted), '30.00');
  assert.equal(s(p.cgtRefunded), '30.00');
  assert.equal(s(p.netCgt), '0.00');
  assert.equal(p.units.toFixed(4), '52.0000');
  assert.equal(s(p.costOpen), '630.00');               // 600 + 30
  // Value 52 × 16 = 832; unrealized 202; net = 650 + 202 − 0 = 852 = 832 + 2,220 − 2,200.
  assert.equal(s(p.netProfit), '852.00');
  assert.equal(s(p.cashIdentity), '852.00');
  assert.equal(s(p.invested), '2200.00', 'a reinvested refund is not new money invested');
});

test('CGT refund paid in cash: no units, no lot, cash received', () => {
  const { entries, components } = base();
  const ref = E({ entry_type: 'cgt_refund_cash', trade_date: '2026-07-01', gross_amount: '30', net_amount: '30', cash_direction: 'investor_receives' });
  const p = run([...entries, ref], [...components, C(ref, 'cgt_refund', 30)]).positions[0];
  assert.equal(p.units.toFixed(4), '50.0000');
  assert.equal(p.lots.length, 1, 'no artificial purchase lot for a cash refund');
  assert.equal(s(p.netCgt), '0.00');
  assert.equal(s(p.received), '2250.00');
  assert.equal(s(p.netProfit), '850.00');
  assert.equal(s(p.cashIdentity), '850.00');
});

test('net CGT is never clamped: a reversal larger than the deduction goes negative', () => {
  const { entries } = base();
  const rev = E({ entry_type: 'cgt_reversal', trade_date: '2026-07-01', gross_amount: '45', net_amount: '45', cash_direction: 'investor_receives' });
  const p = run([...entries, rev], [C(entries[2], 'cgt', 30), C(rev, 'cgt_reversal', 45)]).positions[0];
  assert.equal(s(p.netCgt), '-15.00');
});

test('explicitly reported zero CGT is a zero, and the absence of CGT is no component at all', () => {
  const { entries } = base();
  const p0 = run(entries, [C(entries[2], 'cgt', 0)]).positions[0];
  assert.equal(s(p0.cgtDeducted), '0.00');
  assert.equal(s(p0.realized), '650.00');
});

test('dividends: reinvested (income + lot) and cash with WHT (income, charge, cash)', () => {
  const b = E({ entry_type: 'purchase', trade_date: '2026-01-01', unit_delta: '100', nav: '10', gross_amount: '1000', net_amount: '1000', cash_direction: 'investor_pays' });
  const dr = E({ entry_type: 'dividend_reinvest', trade_date: '2026-03-01', unit_delta: '5', nav: '10', gross_amount: '50', net_amount: '50', cash_direction: 'internal' });
  const dc = E({ entry_type: 'dividend_cash', trade_date: '2026-06-01', gross_amount: '100', net_amount: '85', cash_direction: 'investor_receives' });
  const p = run([b, dr, dc], [C(dc, 'wht', 15)], [price(10)]).positions[0];
  assert.equal(s(p.distributions), '150.00');
  assert.equal(s(p.otherCharges), '15.00');
  assert.equal(s(p.received), '85.00');
  assert.equal(p.units.toFixed(4), '105.0000');
  // Value 1,050; cost 1,050; net = 0 + 0 + 150 − 15 = 135 = 1,050 + 85 − 1,000.
  assert.equal(s(p.netProfit), '135.00');
  assert.equal(s(p.cashIdentity), '135.00');
});

test('bonus units are a zero-cost lot, flagged', () => {
  const b = E({ entry_type: 'purchase', trade_date: '2026-01-01', unit_delta: '100', nav: '10', gross_amount: '1000', net_amount: '1000', cash_direction: 'investor_pays' });
  const bo = E({ entry_type: 'bonus_units', trade_date: '2026-02-01', unit_delta: '10', cash_direction: 'none' });
  const p = run([b, bo], [], [price(10)]).positions[0];
  assert.equal(s(p.costOpen), '1000.00');
  assert.equal(s(p.unrealized), '100.00');
  assert.ok(p.flags.includes('bonus_units_zero_cost'));
});

test('switches are disposals for the fund but not new money for the portfolio', () => {
  const b = E({ fund: 'A', entry_type: 'purchase', trade_date: '2026-01-01', unit_delta: '100', nav: '10', gross_amount: '1000', net_amount: '1000', cash_direction: 'investor_pays' });
  const so = E({ fund: 'A', entry_type: 'switch_out', trade_date: '2026-02-01', unit_delta: '-100', nav: '11', gross_amount: '1100', net_amount: '1095', cash_direction: 'internal' });
  const si = E({ fund: 'B', entry_type: 'switch_in', trade_date: '2026-02-01', unit_delta: '50', nav: '21.9', gross_amount: '1095', net_amount: '1095', cash_direction: 'internal' });
  const r = run([b, so, si], [C(so, 'cgt', 5)], [price(22, 'B')]);
  const a = r.positions.find((x) => x.fundId === 'A');
  assert.equal(s(a.realized), '100.00');
  assert.equal(s(r.totals.externalInvested), '1000.00');
  // Portfolio: value 1,100, nothing received externally → net 100. Per fund: A 100 − 5 = 95; B 1,100 − 1,095 = 5.
  assert.equal(s(r.totals.netProfit), '100.00');
});

test('insufficient units are flagged, not hidden; MCB-style −0.0001 rounding is tolerated', () => {
  const b = E({ entry_type: 'purchase', trade_date: '2026-01-01', unit_delta: '50.0000', nav: '100', gross_amount: '5000', net_amount: '5000', cash_direction: 'investor_pays' });
  const r = E({ entry_type: 'redemption', trade_date: '2026-02-01', unit_delta: '-50.0001', nav: '102', gross_amount: '5100.01', net_amount: '5100.01', cash_direction: 'investor_receives' });
  const p = run([b, r], [], [price(102)]).positions[0];
  assert.ok(!p.flags.includes('insufficient_units'));
  assert.equal(p.units.toFixed(4), '0.0000');
  const r2 = E({ entry_type: 'redemption', trade_date: '2026-03-01', unit_delta: '-10', nav: '102', gross_amount: '1020', net_amount: '1020', cash_direction: 'investor_receives' });
  const p2 = run([b, r, r2], [], [price(102)]).positions[0];
  assert.ok(p2.flags.includes('insufficient_units'));
  assert.equal(p2.realizedComplete, false);
});

test('missing price: value and unrealized are unknown (null), never the purchase price', () => {
  const b = E({ entry_type: 'purchase', trade_date: '2026-01-01', unit_delta: '10', nav: null, gross_amount: '100', net_amount: '100', cash_direction: 'investor_pays' });
  const r = run([b], [], []);
  assert.equal(r.positions[0].marketValue, null);
  assert.equal(r.positions[0].unrealized, null);
  assert.ok(r.positions[0].flags.includes('no_price'));
  assert.equal(r.totals.netProfitIncomplete, true);
});

test('stale prices are marked stale with their date', () => {
  const b = E({ entry_type: 'purchase', trade_date: '2026-01-01', unit_delta: '10', nav: '10', gross_amount: '100', net_amount: '100', cash_direction: 'investor_pays' });
  const p = run([b], [], [price(11, 'F', '2026-10-20')]).positions[0];
  assert.equal(p.price.stale, true);
  assert.equal(p.price.date, '2026-10-20');
});

test('a reversed entry and its reversal both drop out', () => {
  const { entries, components } = base();
  const wrong = E({ entry_type: 'purchase', trade_date: '2026-03-01', unit_delta: '1000', nav: '10', gross_amount: '10000', net_amount: '10000', cash_direction: 'investor_pays' });
  const rev = E({ entry_type: 'purchase', trade_date: '2026-03-01', unit_delta: '-1000', gross_amount: '10000', net_amount: '10000', cash_direction: 'investor_pays', reverses_entry_id: wrong.id });
  const p = run([...entries, wrong, rev], components).positions[0];
  assert.equal(s(p.realized), '650.00');
  assert.equal(p.units.toFixed(4), '50.0000');
});

test('an opening balance with unknown cost makes profit incomplete instead of guessing', () => {
  const open = E({ entry_type: 'other_adjustment', trade_date: '2026-01-01', unit_delta: '100', cash_direction: 'none' });
  const p = run([open], [], [price(10)]).positions[0];
  assert.equal(p.unrealized, null);
  assert.equal(p.netProfit, null);
  assert.ok(p.flags.includes('opening_balance_cost_unknown'));
});

test('loads and transaction costs are part of cost basis; zakat on a redemption is a charge', () => {
  const b = E({ entry_type: 'purchase', trade_date: '2026-01-01', unit_delta: '97.5', nav: '10', gross_amount: '1000', net_amount: '975', cash_direction: 'investor_pays' });
  const r = E({ entry_type: 'redemption', trade_date: '2026-05-01', unit_delta: '-97.5', nav: '12', gross_amount: '1170', net_amount: '1140.75', cash_direction: 'investor_receives' });
  const p = run([b, r], [C(b, 'front_load', 25), C(r, 'cgt', 2), C(r, 'zakat', 27.25)], [price(12)]).positions[0];
  assert.equal(s(p.chargesInCost), '25.00');
  assert.equal(s(p.realized), '170.00');          // 1,170 − 1,000 (cost incl. load)
  assert.equal(s(p.otherCharges), '27.25');
  assert.equal(s(p.netProfit), '140.75');         // 170 − 2 − 27.25
  assert.equal(s(p.cashIdentity), '140.75');      // 0 + 1,140.75 − 1,000
});

test('XIRR: 1,000 → 1,100 after one year is 10%', () => {
  const r = xirr([{ date: '2025-01-01', amount: new Decimal(-1000) }, { date: '2026-01-01', amount: new Decimal(1100) }]);
  assert.equal(r.toFixed(4), '0.1000');
  assert.equal(xirr([{ date: '2025-01-01', amount: new Decimal(-1000) }]), null);
});

test('no binary floating point in stored-amount arithmetic: 0.1 + 0.2 stays 0.3', () => {
  const b1 = E({ entry_type: 'purchase', trade_date: '2026-01-01', unit_delta: '0.1', nav: '1', gross_amount: '0.1', net_amount: '0.1', cash_direction: 'investor_pays' });
  const b2 = E({ entry_type: 'purchase', trade_date: '2026-01-02', unit_delta: '0.2', nav: '1', gross_amount: '0.2', net_amount: '0.2', cash_direction: 'investor_pays' });
  const p = run([b1, b2], [], [price(1)]).positions[0];
  assert.equal(p.units.toString(), '0.3');
  assert.equal(p.costOpen.toString(), '0.3');
});

test('expected CGT is a 15% estimate on open gains only, separate from reported CGT', async () => {
  const { entries, components } = base();
  const p = run(entries, components).positions[0];
  // Unrealized 200 → expected 30. Reported CGT (30) is untouched.
  assert.equal(s(p.expectedCgt), '30.00');
  assert.equal(s(p.cgtDeducted), '30.00');
  assert.equal(s(p.netAfterExpectedCgt), '790.00');
  const loss = run(entries, components, [price(10)]).positions[0];
  assert.equal(s(loss.expectedCgt), '0.00', 'no tax estimated on a loss');
});

test('growth series replays history with prices known at each date', async () => {
  const { growthSeries } = await import('../../src/lib/mf/engine.js');
  const { entries, components } = base();
  const series = growthSeries({ entries, components, prices: [price(16)], asOf: '2026-10-31' });
  assert.ok(series.length >= 9);
  const jan = series[0];
  assert.equal(jan.invested, 1000);              // one lot at 10
  assert.equal(jan.value, 1000);                 // valued at its own NAV (10), not today's 16
  const last = series[series.length - 1];
  assert.equal(last.invested, 600);
  assert.equal(last.value, 800);
});
