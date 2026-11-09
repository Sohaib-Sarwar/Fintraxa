// NCCPL capital gains (src/lib/psx/nccpl.js). Fake trades only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closedLots, nccplReport, taxYearOf } from '../../src/lib/psx/nccpl.js';

let n = 0;
const T = (symbol, type, date, settlement_date, quantity, price) => ({ symbol, type, date, settlement_date, quantity, price, fee: 1, created_at: String(++n).padStart(4, '0') });

test('Rule 13N: 0.5% of the sale and of the cost; same price both ways is a loss of 1% of turnover', () => {
  const { lots } = closedLots([T('AAA', 'buy', '2026-04-29', '2026-04-30', 10, 285), T('AAA', 'sell', '2026-06-09', '2026-06-10', 10, 285)]);
  assert.equal(lots[0].gain, -28.5);
  assert.equal(lots[0].priceGain, 0);
  assert.equal(lots[0].deemedCost, 28.5);
  assert.equal(lots[0].provisionalCgt, 0);
  const g = closedLots([T('BBB', 'buy', '2026-04-15', '2026-04-16', 100, 19.4), T('BBB', 'sell', '2026-06-01', '2026-06-02', 100, 20)]).lots[0];
  assert.equal(g.gain, 40.3);                  // 60 − 10 − 9.70
  assert.equal(g.provisionalCgt, 6.05);        // 15%, rounded to paisa
});

test('FIFO by settlement date; holding days from purchase settlement to sale settlement; buys settle before same-day sales', () => {
  const { lots, unmatched } = closedLots([
    T('CCC', 'buy', '2026-03-05', '2026-03-06', 100, 37),
    T('CCC', 'buy', '2026-03-17', '2026-03-18', 100, 35.5),
    T('CCC', 'sell', '2026-06-01', '2026-06-02', 150, 36.1),
    T('CCC', 'buy', '2026-06-01', '2026-06-02', 10, 36),   // settles with the sale but is not sold here (FIFO)
    T('CCC', 'sell', '2026-06-05', '2026-06-08', 100, 40),  // 50 left of lot 2 + 10 of lot 3, 40 unmatched
  ]);
  assert.deepEqual(lots.map((l) => [l.quantity, l.buyPrice, l.holdingDays, l.settlement]), [
    [100, 37, 88, '2026-06-02'], [50, 35.5, 76, '2026-06-02'], [50, 35.5, 82, '2026-06-08'], [10, 36, 6, '2026-06-08'],
  ]);
  assert.deepEqual(unmatched, [{ symbol: 'CCC', settlement: '2026-06-08', quantity: 40 }]);
});

test('months run on within a tax year: CGT is 15% of the year-to-date net minus what was charged; a loss month refunds', () => {
  const r = nccplReport([
    T('DDD', 'buy', '2026-01-02', '2026-01-05', 100, 100), T('DDD', 'sell', '2026-02-02', '2026-02-03', 100, 120),   // Feb gain
    T('EEE', 'buy', '2026-01-02', '2026-01-05', 100, 100), T('EEE', 'sell', '2026-03-02', '2026-03-03', 100, 90),    // Mar loss
  ]);
  const y = r.year(2026);
  const feb = (100 * 120 - 100 * 100) - 0.005 * (12000 + 10000);   // 1890
  const mar = (100 * 90 - 100 * 100) - 0.005 * (9000 + 10000);     // −1095
  assert.deepEqual(y.months.map((m) => [m.month, m.net, m.ytdNet, m.ytdCgt, m.cgtThisMonth]), [
    ['2026-02', feb, feb, 283.5, 283.5],
    ['2026-03', mar, feb + mar, 119.25, -164.25],                    // refund of the difference
  ]);
  assert.deepEqual([y.gains, y.losses, y.net, y.taxable, y.cgt], [1890, -1095, 795, 795, 119.25]);
});

test('a net loss carries forward 3 tax years, used oldest first, then expires', () => {
  const loss = (y) => [T('LLL', 'buy', `${y}-01-02`, `${y}-01-05`, 100, 100), T('LLL', 'sell', `${y}-02-02`, `${y}-02-03`, 100, 90)];
  const gain = (y, p) => [T('GGG', 'buy', `${y}-01-02`, `${y}-01-05`, 100, 100), T('GGG', 'sell', `${y}-02-02`, `${y}-02-03`, 100, p)];
  const r = nccplReport([...loss(2026), ...gain(2027, 105), ...gain(2028, 120)]);
  const l = 1095;                                              // the 2026 loss
  const g27 = 500 - 0.005 * (10500 + 10000);                   // 397.50
  const g28 = 2000 - 0.005 * (12000 + 10000);                  // 1890
  assert.equal(r.year(2026).lossCarriedOut, l);
  assert.deepEqual(r.year(2027).carriedIn, [{ fromYear: 2026, used: g27 }]);
  assert.deepEqual([r.year(2027).taxable, r.year(2027).cgt], [0, 0]);
  assert.deepEqual(r.year(2028).carriedIn, [{ fromYear: 2026, used: l - g27 }]);
  assert.equal(r.year(2028).taxable, Math.round((g28 - (l - g27)) * 100) / 100);
  // Expiry: a loss of TY 2026 is not usable in TY 2030.
  const late = nccplReport([...loss(2026), ...gain(2030, 105)]);
  assert.deepEqual(late.year(2030).carriedIn, []);
  assert.equal(late.year(2030).taxable, g27);
  assert.equal(taxYearOf('2025-07-01'), 2026);
  assert.equal(taxYearOf('2026-06-30'), 2026);
});

test('a period sums its lots and the CGT its months were charged; whole tax years match the year', async () => {
  const { nccplPeriod } = await import('../../src/lib/psx/nccpl.js');
  const r = nccplReport([
    T('DDD', 'buy', '2026-01-02', '2026-01-05', 100, 100), T('DDD', 'sell', '2026-02-02', '2026-02-03', 100, 120),
    T('EEE', 'buy', '2026-01-02', '2026-01-05', 100, 100), T('EEE', 'sell', '2026-03-02', '2026-03-03', 100, 90),
  ]);
  const mar = nccplPeriod(r, { start: '2026-03-01', end: '2026-03-31' });
  assert.deepEqual([mar.lots.length, mar.gains, mar.losses, mar.net, mar.cgt], [1, 0, -1095, -1095, -164.25]);
  const ty = nccplPeriod(r, { start: '2025-07-01', end: '2026-06-30' });
  assert.deepEqual([ty.net, ty.cgt, ty.deemedCost], [795, r.year(2026).cgt, 110 + 95]);
});

test('a range starting mid-month gets only its own days of CGT, matching the lots it counts', async () => {
  const { nccplPeriod } = await import('../../src/lib/psx/nccpl.js');
  const r = nccplReport([
    T('DDD', 'buy', '2026-01-02', '2026-01-05', 100, 100), T('DDD', 'sell', '2026-02-02', '2026-02-03', 100, 120),   // +1890, settles 3 Feb
    T('EEE', 'buy', '2026-01-02', '2026-01-05', 100, 100), T('EEE', 'sell', '2026-03-02', '2026-03-03', 100, 90),    // −1095, settles 3 Mar
  ]);
  // 15 Feb – 30 Jun: only the March loss is in range. Charged before the range: 15% × 1890 = 283.50;
  // to date at 30 Jun: 15% × 795 = 119.25; so the range is a refund of 164.25. (Counting February's
  // whole-month charge as well would give +119.25 on a range whose only lot is a loss.)
  const p = nccplPeriod(r, { start: '2026-02-15', end: '2026-06-30' });
  assert.deepEqual([p.lots.length, p.net, p.cgt], [1, -1095, -164.25]);
  assert.deepEqual([p.years[0].chargedBefore, p.years[0].cgtToDate, p.years[0].ytdBefore, p.years[0].ytdEnd], [283.5, 119.25, 1890, 795]);
  // A range inside February that misses the 3 Feb settlement charges nothing.
  assert.equal(nccplPeriod(r, { start: '2026-02-10', end: '2026-02-28' }).cgt, 0);
});

test('a range across 30 June is split; each tax year runs on its own', async () => {
  const { nccplPeriod } = await import('../../src/lib/psx/nccpl.js');
  const r = nccplReport([
    T('DDD', 'buy', '2026-01-02', '2026-01-05', 100, 100), T('DDD', 'sell', '2026-02-02', '2026-02-03', 100, 120),   // TY26 +1890
    T('EEE', 'buy', '2026-01-02', '2026-01-05', 100, 100), T('EEE', 'sell', '2026-03-02', '2026-03-03', 100, 90),    // TY26 −1095
    T('GGG', 'buy', '2026-08-01', '2026-08-04', 100, 100), T('GGG', 'sell', '2026-09-01', '2026-09-02', 100, 110),   // TY27 1000 − 105 = +895
  ]);
  const p = nccplPeriod(r, { start: '2026-03-01', end: '2026-12-31' });
  assert.deepEqual(p.years.map((s) => [s.taxYear, s.start, s.end, s.cgt]), [[2026, '2026-03-01', '2026-06-30', -164.25], [2027, '2026-07-01', '2026-12-31', 134.25]]);
  assert.deepEqual([p.net, p.cgt], [-200, -30]);
});

test('losses brought forward are set off before the range is charged', async () => {
  const { nccplPeriod } = await import('../../src/lib/psx/nccpl.js');
  const r = nccplReport([
    T('LLL', 'buy', '2026-01-02', '2026-01-05', 100, 100), T('LLL', 'sell', '2026-02-02', '2026-02-03', 100, 90),    // TY26 −1095, carried forward
    T('GGG', 'buy', '2027-01-02', '2027-01-05', 100, 100), T('GGG', 'sell', '2027-02-02', '2027-02-03', 100, 120),   // TY27 +1890
  ]);
  // 1890 − 1095 brought forward = 795 taxable; 15% = 119.25 = the year's CGT.
  const p = nccplPeriod(r, { start: '2027-02-01', end: '2027-02-28' });
  assert.deepEqual([p.net, p.years[0].lossesAvailable, p.years[0].lossesUsed, p.years[0].taxableToDate, p.cgt], [1890, 1095, 1095, 795, 119.25]);
  assert.equal(p.cgt, r.year(2027).cgt);
});
