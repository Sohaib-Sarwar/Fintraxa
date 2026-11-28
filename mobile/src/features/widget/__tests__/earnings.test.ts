import { basisStart, fromEvents, hour12, liveDecimals, rupees, rupeesShort, sleepWindow, toEvents, widgetFigures, type StoredEvent } from '../earnings';

const MONTH_S = 30.4375 * 86400;
const local = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, m - 1, d, h, mi, s).getTime();

// Tax year 2026-27 so far (Jul–Nov = 5 elapsed months), net after tax:
//   dividends 6,000 (Aug) + 3,000 (Nov), savings 1,500 (Sep), fund profit 2,000 (Oct), other 500 (Jul).
const EVENTS: StoredEvent[] = [
  { d: '2026-07-20', s: 'other', g: '500', t: '0', n: '500' },
  { d: '2026-08-10', s: 'dividends', g: '7058.82', t: '1058.82', n: '6000' },
  { d: '2026-09-30', s: 'savings', g: '1875', t: '375', n: '1500' },
  { d: '2026-10-31', s: 'mutual_funds', g: '2200', t: '200', n: '2000' },
  { d: '2026-11-12', s: 'dividends', g: '3529.41', t: '529.41', n: '3000' },
  // last tax year: outside 'fy', inside '12m' and 'all'
  { d: '2026-03-15', s: 'dividends', g: '1200', t: '180', n: '1020' },
];
const ALL = ['mutual_funds', 'dividends', 'savings', 'other'] as const;
const SLEEP = { from: 23, to: 7 };

describe('widget earnings (the web passive counter)', () => {
  const now = local(2026, 11, 28, 14, 30, 0);

  test('rate = average a month after tax ÷ seconds in an average month, over the tax year', () => {
    const f = widgetFigures({ events: EVENTS }, { sources: [...ALL], basis: 'fy', sleep: SLEEP, now });
    // 13,000 over Jul..Nov = 5 months → 2,600 a month
    expect(f.avgPerMonth).toBe(2600);
    expect(f.months).toBe(5);
    expect(f.perSecond).toBeCloseTo(2600 / MONTH_S, 8);
    // today: 14.5 hours at the rate
    expect(f.today).toBeCloseTo(f.perSecond * 14.5 * 3600, 6);
    expect(f.yesterday).toBeCloseTo(f.perSecond * 86400, 6);
    // 23:00 → 07:00 = 8 hours (the web's "a night")
    expect(f.overnight).toBeCloseTo(f.perSecond * 8 * 3600, 6);
    // this month: 27 days 14.5 hours since 1 Nov
    expect(f.month).toBeCloseTo(f.perSecond * (27 * 86400 + 14.5 * 3600), 4);
    expect(f.received).toBe(3000);
    expect(f.average).toBe(2600);
  });

  test('sources and period change the rate; nothing chosen or no income is zero', () => {
    const divs = widgetFigures({ events: EVENTS }, { sources: ['dividends'], basis: 'fy', sleep: SLEEP, now });
    // dividends have been tracked since March, so the tax year counts all 5 months (Jul..Nov): 9,000 / 5
    expect(divs.avgPerMonth).toBe(1800);
    const year = widgetFigures({ events: EVENTS }, { sources: [...ALL], basis: '12m', sleep: SLEEP, now });
    // Dec 2025..Nov 2026, first income Mar 2026 → 9 months, 14,020
    expect(year.months).toBe(9);
    expect(year.avgPerMonth).toBeCloseTo(14020 / 9, 2);
    const none = widgetFigures({ events: EVENTS }, { sources: [], basis: 'fy', sleep: SLEEP, now });
    expect(none.today).toBe(0);
    expect(none.hasIncome).toBe(false);
  });

  test('a net loss (fund losses) counts as nothing earned, like the web', () => {
    const loss: StoredEvent[] = [{ d: '2026-10-31', s: 'mutual_funds', g: '-9000', t: '0', n: '-9000' }];
    const f = widgetFigures({ events: loss }, { sources: [...ALL], basis: 'fy', sleep: SLEEP, now });
    expect(f.avgPerMonth).toBeLessThan(0);
    expect(f.perSecond).toBe(0);
    expect(f.today).toBe(0);
    expect(f.average).toBe(0);
  });

  test('midnight starts a new day; the 1st starts a new month', () => {
    const f = widgetFigures({ events: EVENTS }, { sources: [...ALL], basis: 'fy', sleep: SLEEP, now: local(2026, 12, 1, 0, 0, 0) });
    expect(f.today).toBe(0);
    expect(f.month).toBe(0);
    expect(f.received).toBe(0);
  });

  test('overnight: the last sleep that has started — whole when over, so far while asleep', () => {
    expect(sleepWindow(local(2026, 11, 28, 9), SLEEP)).toEqual({ start: local(2026, 11, 27, 23), end: local(2026, 11, 28, 7) });
    expect(sleepWindow(local(2026, 11, 28, 2), SLEEP)).toEqual({ start: local(2026, 11, 27, 23), end: local(2026, 11, 28, 2) });
    expect(sleepWindow(local(2026, 11, 28, 23, 30), SLEEP)).toEqual({ start: local(2026, 11, 28, 23), end: local(2026, 11, 28, 23, 30) });
    // 12 am → 8 am, asked at 6 am: midnight to now
    expect(sleepWindow(local(2026, 11, 28, 6), { from: 0, to: 8 })).toEqual({ start: local(2026, 11, 28, 0), end: local(2026, 11, 28, 6) });
  });

  test('averaging period starts', () => {
    expect(basisStart('fy', '2026-11-28')).toBe('2026-07-01');
    expect(basisStart('fy', '2027-03-02')).toBe('2026-07-01');
    expect(basisStart('fy', '2027-07-01')).toBe('2027-07-01');
    expect(basisStart('12m', '2026-11-28')).toBe('2025-12-01');
    expect(basisStart('12m', '2026-01-05')).toBe('2025-02-01');
  });

  test('stored events round-trip exactly', () => {
    const back = toEvents(fromEvents(toEvents(EVENTS, [...ALL])), [...ALL]);
    expect(back.map((e) => String(e.net))).toEqual(toEvents(EVENTS, [...ALL]).map((e) => String(e.net)));
  });

  test('formatting: a counter never rounds up; short figures stay short', () => {
    expect(rupees(1234.567, 2)).toBe('Rs 1,234.56');
    expect(rupees(3.14159, 4)).toBe('Rs 3.1415');
    expect(rupees(0, 2)).toBe('Rs 0.00');
    expect(rupees(12_345_678, 0)).toBe('Rs 12.35M');
    expect(liveDecimals(9.99)).toBe(4);
    expect(liveDecimals(10)).toBe(2);
    expect(liveDecimals(250_000)).toBe(0);
    expect(rupeesShort(812.456)).toBe('Rs 812.45');
    expect(rupeesShort(18_250.9)).toBe('Rs 18,250');
    expect(rupeesShort(1_250_000)).toBe('Rs 1.25M');
    expect(hour12(0)).toBe('12 am');
    expect(hour12(23)).toBe('11 pm');
  });
});
