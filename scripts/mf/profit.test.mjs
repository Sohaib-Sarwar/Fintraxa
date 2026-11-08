/**
 * Profit engine (src/lib/mf/profit.js). Every expected figure is worked by
 * hand in the comment above it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFunds, groupByFiscalYear } from '../../src/lib/mf/profit.js';

let n = 0;
const E = (o) => ({ id: `e${++n}`, account_id: 'A', fund_id: o.fund ?? 'F', unit_class: '', seq: n, created_at: String(n).padStart(6, '0'), cash_direction: 'none', ...o });
const C = (e, type, amount) => ({ entry_id: e.id, component_type: type, amount: String(amount) });
const P = (price, date, fund = 'F') => ({ fund_id: fund, price: String(price), date, source: 'mufap' });
const buy = (date, units, nav, fund) => E({ fund, entry_type: 'purchase', trade_date: date, unit_delta: String(units), nav: String(nav), gross_amount: String(units * nav), net_amount: String(units * nav), cash_direction: 'investor_pays' });
const sell = (date, units, nav, gross, net, fund) => E({ fund, entry_type: 'redemption', trade_date: date, unit_delta: String(-units), nav: String(nav), gross_amount: String(gross), net_amount: String(net), cash_direction: 'investor_receives' });
const FY = { start: '2026-07-01', end: '2027-06-30', today: '2026-10-31' };

test('realized = proceeds − FIFO cost; paid CGT only on realized; 15% only on unrealized', () => {
  const b1 = buy('2026-01-10', 100, 10);
  const b2 = buy('2026-02-10', 100, 12);
  const s1 = sell('2026-08-10', 150, 15, 2250, 2220);
  const a = analyzeFunds({ entries: [b1, b2, s1], components: [C(s1, 'cgt', 30)], prices: [P(16, '2026-10-31')], ...FY });
  // FIFO cost of 150 = 1,000 + 50 × 12 = 1,600 → gain 650; CGT 30 → net 620.
  assert.deepEqual(a.totals.realized, { gross: 650, cgt: 30, charges: 0, net: 620, sales: 1 });
  // Held 50 @16 = 800, cost 600 → gross 200, 15% = 30, net 170.
  assert.deepEqual(a.totals.unrealized, { gross: 200, tax: 30, net: 170, rate: 0.15 });
  assert.equal(a.totals.invested, 600);
  assert.equal(a.totals.value, 800);
  // Months: only August settled anything.
  assert.deepEqual(a.months.map((m) => [m.month, m.gross, m.cgt, m.net]),
    [['2026-07', 0, 0, 0], ['2026-08', 650, 30, 620], ['2026-09', 0, 0, 0], ['2026-10', 0, 0, 0]]);
});

test('a full redemption clears what was invested', () => {
  const a = analyzeFunds({ entries: [buy('2026-07-05', 100, 10), sell('2026-07-20', 100, 11, 1100, 1100)], prices: [P(11.5, '2026-10-31')], ...FY });
  assert.equal(a.totals.invested, 0);
  assert.equal(a.totals.value, 0);
  assert.equal(a.totals.held, 0);
  assert.equal(a.positions[0].isOpen, false);
  assert.equal(a.totals.realized.gross, 100);
  assert.equal(a.totals.unrealized.gross, 0);
});

test('estimated CGT: 15% of the net unrealized gain (losses offset gains), nothing on a net loss', () => {
  const a = analyzeFunds({
    entries: [buy('2026-07-01', 10, 100, 'G'), buy('2026-07-01', 10, 100, 'L')],
    prices: [P(110, '2026-10-31', 'G'), P(95, '2026-10-31', 'L')], ...FY,
  });
  // G +100, L −50 → net gain 50 → tax 7.50, net 42.50. Per holding, G alone still shows 15.
  assert.deepEqual(a.totals.unrealized, { gross: 50, tax: 7.5, net: 42.5, rate: 0.15 });
  assert.equal(a.positions.find((p) => p.unrealized.gross === 100).unrealized.tax, 15);
  const loss = analyzeFunds({
    entries: [buy('2026-07-01', 10, 100, 'G'), buy('2026-07-01', 10, 100, 'L')],
    prices: [P(101, '2026-10-31', 'G'), P(90, '2026-10-31', 'L')], ...FY,
  });
  // G +10, L −100 → net loss 90 → no CGT; net = gross.
  assert.deepEqual(loss.totals.unrealized, { gross: -90, tax: 0, net: -90, rate: 0.15 });
});

test('CGT refunds and reversals reduce CGT in the month they arrive; net CGT is never clamped', () => {
  const b = buy('2026-05-01', 100, 10);
  const s = sell('2026-06-10', 100, 12, 1200, 1170);
  const refund = E({ entry_type: 'cgt_refund_cash', trade_date: '2026-08-02', gross_amount: '50', net_amount: '50', cash_direction: 'investor_receives' });
  const a = analyzeFunds({ entries: [b, s, refund], components: [C(s, 'cgt', 30), C(refund, 'cgt_refund', 50)], prices: [], ...FY });
  // The sale was before the range, the refund inside it: gross 0, CGT −50, net +50.
  assert.deepEqual([a.totals.realized.gross, a.totals.realized.cgt, a.totals.realized.net], [0, -50, 50]);
  assert.equal(a.months.find((m) => m.month === '2026-08').cgt, -50);
});

test('a CGT refund paid as units is a refund and a zero-gain lot at its value', () => {
  const b = buy('2026-07-01', 100, 10);
  const ru = E({ entry_type: 'cgt_refund_reinvest', trade_date: '2026-07-03', unit_delta: '4', nav: '10', gross_amount: '40', net_amount: '40', cash_direction: 'internal' });
  const a = analyzeFunds({ entries: [b, ru], components: [C(ru, 'cgt_refund', 40)], prices: [P(10, '2026-10-31')], ...FY });
  assert.equal(a.totals.realized.cgt, -40);
  assert.equal(a.totals.invested, 1040);
  assert.equal(a.totals.unrealized.gross, 0);
});

test('switching funds is a sale of the old fund (gain, CGT) and a purchase of the new one', () => {
  const b = buy('2026-07-01', 100, 10, 'X');
  const out = E({ fund: 'X', entry_type: 'switch_out', trade_date: '2026-08-01', unit_delta: '-100', nav: '11', gross_amount: '1100', net_amount: '1085', cash_direction: 'internal' });
  const inn = E({ fund: 'Y', entry_type: 'switch_in', trade_date: '2026-08-01', unit_delta: '108.5', nav: '10', gross_amount: '1085', net_amount: '1085', cash_direction: 'internal' });
  const a = analyzeFunds({ entries: [b, out, inn], components: [C(out, 'cgt', 15)], prices: [P(10.2, '2026-10-31', 'Y')], ...FY });
  assert.deepEqual([a.totals.realized.gross, a.totals.realized.cgt, a.totals.realized.net], [100, 15, 85]);
  assert.equal(a.totals.invested, 1085);
  assert.equal(a.totals.deposits, 1000, 'a switch is not new money');
  // Y: 108.5 × 10.2 = 1,106.70 − 1,085 = 21.70.
  assert.equal(a.totals.unrealized.gross, 21.7);
});

test('range: sales before the start are not counted; a fund closed before the start is not shown', () => {
  const old = [buy('2026-01-01', 10, 100, 'Old'), sell('2026-03-01', 10, 110, 1100, 1100, 'Old')];
  const cur = [buy('2026-02-01', 100, 10), sell('2026-06-30', 50, 11, 550, 550), sell('2026-07-15', 50, 12, 600, 600)];
  const a = analyzeFunds({ entries: [...old, ...cur], prices: [], ...FY });
  assert.deepEqual(a.positions.map((p) => p.fundId), ['F']);
  assert.equal(a.totals.realized.gross, 100, 'only the July sale: 600 − 500');
  const last = analyzeFunds({ entries: [...old, ...cur], prices: [], start: '2025-07-01', end: '2026-06-30', today: '2026-10-31' });
  assert.deepEqual(last.positions.map((p) => p.fundId).sort(), ['F', 'Old']);
  assert.equal(last.totals.realized.gross, 150, '100 on Old + 50 on F');
});

test('unrealized uses the price known at the end of the range, not today', () => {
  const a = analyzeFunds({ entries: [buy('2026-05-01', 100, 10)], prices: [P(10.5, '2026-06-30'), P(11, '2026-10-31')], start: '2025-07-01', end: '2026-06-30', today: '2026-10-31' });
  assert.equal(a.totals.value, 1050);
  assert.equal(a.totals.unrealized.gross, 50);
});

test('UBL 2-decimal rounding: selling 0.03 units more than recorded is complete and closes the fund', () => {
  const b = E({ entry_type: 'purchase', trade_date: '2026-07-01', unit_delta: '958.66', nav: '104.3031', gross_amount: '99990', net_amount: '99990', cash_direction: 'investor_pays' });
  const s = E({ entry_type: 'redemption', trade_date: '2026-07-12', unit_delta: '-958.69', nav: '104.3031', gross_amount: '99995', net_amount: '99983', cash_direction: 'investor_receives' });
  const a = analyzeFunds({ entries: [b, s], components: [C(s, 'cgt', 12)], prices: [], ...FY });
  assert.ok(!a.totals.incomplete);
  assert.equal(a.totals.invested, 0);
  assert.deepEqual([a.totals.realized.gross, a.totals.realized.cgt, a.totals.realized.net], [5, 12, -7]);
});

test('reversed entries drop out with their reversal', () => {
  const b = buy('2026-07-01', 100, 10);
  const wrong = buy('2026-07-02', 50, 10);
  const rev = E({ entry_type: 'purchase', trade_date: '2026-07-03', unit_delta: '-50', gross_amount: '500', reverses_entry_id: wrong.id });
  const a = analyzeFunds({ entries: [b, wrong, rev], prices: [P(10, '2026-10-31')], ...FY });
  assert.equal(a.totals.invested, 1000);
});

test('no price for a holding: value and unrealized are unknown and flagged, never the cost', () => {
  const a = analyzeFunds({ entries: [E({ entry_type: 'purchase', trade_date: '2026-07-01', unit_delta: '10', gross_amount: '1000', net_amount: '1000', cash_direction: 'investor_pays' })], prices: [], ...FY });
  assert.equal(a.positions[0].value, null);
  assert.equal(a.positions[0].unrealized.gross, null);
  assert.ok(a.totals.incomplete);
  assert.ok(a.positions[0].flags.includes('no_price'));
});

test('cash dividends are realized income and money received', () => {
  const b = buy('2026-07-01', 100, 10);
  const d = E({ entry_type: 'dividend_cash', trade_date: '2026-09-01', gross_amount: '50', net_amount: '50', cash_direction: 'investor_receives' });
  const a = analyzeFunds({ entries: [b, d], prices: [P(10, '2026-10-31')], ...FY });
  assert.equal(a.totals.realized.gross, 50);
  assert.equal(a.totals.withdrawals, 50);
});

test('fiscal-year view: June belongs to the year that started the July before; sums are exact', () => {
  const y = groupByFiscalYear([
    { month: '2026-02', gross: 22.65, cgt: 3, net: 19.65 },
    { month: '2026-06', gross: 0.1, cgt: 0, net: 0.1 },
    { month: '2026-07', gross: 0.2, cgt: 0, net: 0.2 },
    { month: '2027-06', gross: 0.1, cgt: 0.05, net: 0.05 },
  ]);
  assert.deepEqual(y.map((r) => [r.title, r.gross, r.cgt, r.net]), [
    ['FY 2025-26', 22.75, 3, 19.75],
    ['FY 2026-27', 0.3, 0.05, 0.25],
  ]);
  assert.equal(y[1].tick, 'FY 26-27');
});

test('month-end closing value vs invested uses the NAV known at each month end', () => {
  const b = buy('2026-07-01', 100, 10);
  const s1 = sell('2026-09-10', 50, 11, 550, 550);
  const a = analyzeFunds({ entries: [b, s1], prices: [P(10.5, '2026-07-31'), P(11.2, '2026-08-31')], start: '2026-07-01', end: '2027-06-30', today: '2026-10-15' });
  assert.deepEqual(a.series.map((x) => [x.month, x.invested, x.value]), [
    ['2026-07', 1000, 1050],   // 100 × 10.50
    ['2026-08', 1000, 1120],   // 100 × 11.20
    ['2026-09', 500, 550],     // 50 left × 11 (the NAV on the 10 Sep sale is the latest known)
    ['2026-10', 500, 550],     // nothing newer by 15 Oct
  ]);
});

test('active in range: a fund bought before the range and still held is shown and counted; one fully redeemed before it is not', () => {
  const held = [buy('2026-02-01', 100, 10, 'Held')];                                            // bought last FY, never sold
  const gone = [buy('2026-01-01', 10, 100, 'Gone'), sell('2026-03-01', 10, 110, 1100, 1100, 'Gone')]; // closed last FY
  const later = [buy('2026-08-01', 50, 10)];                                                      // bought inside the range
  const prices = [P(11, '2026-10-31', 'Held'), P(11, '2026-10-31')];
  const a = analyzeFunds({ entries: [...held, ...gone, ...later], prices, ...FY });
  assert.deepEqual(a.positions.map((p) => p.fundId).sort(), ['F', 'Held']);
  assert.equal(a.totals.invested, 1500, '1,000 Held + 500 F');
  assert.equal(a.totals.value, 1650, '100 × 11 + 50 × 11');
  // Opening balance on 30 Jun (Held only), then month-ends: Jul Held only, F joins in Aug.
  assert.deepEqual(a.series.map((x) => [x.month, x.invested, !!x.opening]), [['2026-06', 1000, true], ['2026-07', 1000, false], ['2026-08', 1500, false], ['2026-09', 1500, false], ['2026-10', 1500, false]]);
  assert.equal(a.series[0].title, 'Opening balance, 30 Jun 2026');
  assert.equal(a.allPositions.length, 3);
  // A range that ends before the first purchase shows nothing of it.
  const early = analyzeFunds({ entries: held, prices, start: '2025-07-01', end: '2025-12-31', today: '2026-10-31' });
  assert.equal(early.positions.length, 0);
});

test('a fund with no price at all counts at cost in net worth, matching the chart', () => {
  // No MUFAP price and no NAV on the entry: value unknown, so book value (cost) stands in.
  const e = { ...buy('2026-08-01', 100, 10, 'NoNav'), nav: null };
  const a = analyzeFunds({ entries: [e], prices: [], ...FY });
  assert.equal(a.positions[0].value, null, 'the holding itself still shows no market value');
  assert.equal(a.totals.value, 1000);
  assert.equal(a.totals.incomplete, true);
  assert.equal(a.series.at(-1).value, a.totals.value, 'last chart point = net worth');
});

test('opening balance: only for a range that starts on the 1st and only if something was held', () => {
  const held = [buy('2026-02-01', 100, 10, 'Held')];
  const prices = [P(11, '2026-10-31', 'Held')];
  const mid = analyzeFunds({ entries: held, prices, start: '2026-07-15', end: '2027-06-30', today: '2026-10-31' });
  assert.ok(!mid.series.some((x) => x.opening), 'mid-month start: no opening point');
  const sold = [buy('2026-02-01', 100, 10, 'Gone'), sell('2026-03-01', 100, 11, 1100, 1100, 'Gone'), buy('2026-08-01', 10, 10)];
  const empty = analyzeFunds({ entries: sold, prices, ...FY });
  assert.ok(!empty.series.some((x) => x.opening), 'nothing held on 30 Jun: no opening point');
});

test('long histories keep their latest months (no 5-year cut-off)', () => {
  const entries = [buy('2019-01-15', 10, 10), sell('2026-09-10', 5, 12, 60, 60)];
  const a = analyzeFunds({ entries, prices: [], start: '2000-01-01', end: '2026-10-31', today: '2026-10-31' });
  assert.equal(a.months.at(-1).month, '2026-10');
  assert.equal(a.months.find((m) => m.month === '2026-09').gross, 10, 'the 2026 sale is still counted');
  assert.equal(a.series.at(-1).month, '2026-10');
});

test("today's value uses MUFAP's newest NAV even though MUFAP dates it forward", () => {
  // UBL Financial Sector Fund on Sun 8 Nov 2026: last statement NAV 345.2503 (10 Apr);
  // MUFAP posted 320.0428 valid for Mon 9 Nov. Held 100 units bought @ 300 = 3,000.
  const b = buy('2026-03-01', 100, 300);
  const prices = [{ fund_id: 'F', price: '345.2503', date: '2026-04-10', source: 'statement' }, P(320.0428, '2026-11-09')];
  const now = analyzeFunds({ entries: [b], prices, ...FY, today: '2026-11-08' });
  // 100 × 320.0428 = 32,004.28; − 30,000 = 2,004.28 gross; 15% = 300.642 → 300.64; net 1,703.64.
  assert.equal(now.totals.value, 32004.28);
  assert.deepEqual(now.totals.unrealized, { gross: 2004.28, tax: 300.64, net: 1703.64, rate: 0.15 });
  assert.equal(now.positions[0].price.date, '2026-11-09');
  assert.ok(!now.positions[0].flags.includes('price_outdated'));
  // A past range end still uses the price known then: 31 Oct → the 10 Apr statement NAV, 34,525.03.
  const past = analyzeFunds({ entries: [b], prices, start: '2026-07-01', end: '2026-10-31', today: '2026-11-08' });
  assert.equal(past.totals.value, 34525.03);
});
