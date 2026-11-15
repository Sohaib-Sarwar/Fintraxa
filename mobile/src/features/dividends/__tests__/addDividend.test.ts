import { checkDividend, dividendAmounts, sharesHeldOn } from '../addDividend';

// Hoisted above the import by Jest: the module's Supabase client and toast are not needed for the maths.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/ui/feedback', () => ({ toast: jest.fn() }));


const T = (symbol: string, type: 'buy' | 'sell', quantity: string, date: string) => ({ symbol, type, quantity, date });

describe('sharesHeldOn', () => {
  const trades = [T('OGDC', 'buy', '100', '2026-01-10'), T('ogdc', 'buy', '50', '2026-03-01'), T('OGDC', 'sell', '30', '2026-04-15'), T('FFC', 'buy', '10', '2026-01-01')];
  it('counts buys minus sells up to the date, any symbol case', () => {
    expect(sharesHeldOn(trades, 'OGDC', '2026-02-01')).toBe(100);
    expect(sharesHeldOn(trades, 'ogdc', '2026-03-01')).toBe(150);
    expect(sharesHeldOn(trades, 'OGDC', '2026-12-31')).toBe(120);
  });
  it('is 0 before the first buy and never negative', () => {
    expect(sharesHeldOn(trades, 'OGDC', '2025-12-31')).toBe(0);
    expect(sharesHeldOn([T('X', 'sell', '5', '2026-01-01')], 'X', '2026-02-01')).toBe(0);
  });
});

describe('dividendAmounts', () => {
  it('gross = shares × DPS, 15% WHT, net = gross − tax (to the paisa)', () => {
    expect(dividendAmounts('120', '7.5', '15')).toEqual({ gross: '900.00', tax: '135.00', net: '765.00', rate: '15' });
  });
  it('rounds half up and keeps net exact', () => {
    // 333 × 1.115 = 371.295 → 371.30; 15% = 55.695 → 55.70; net 315.60
    expect(dividendAmounts('333', '1.115', '15')).toEqual({ gross: '371.30', tax: '55.70', net: '315.60', rate: '15' });
  });
  it('takes the tax typed in rupees over the rate, capped at the gross, and reports its rate', () => {
    expect(dividendAmounts('120', '7.5', '15', '100')).toEqual({ gross: '900.00', tax: '100.00', net: '800.00', rate: '11.11' });
    expect(dividendAmounts('120', '7.5', '15', '5000').net).toBe('0.00');
    expect(dividendAmounts('120', '7.5', '15', '').tax).toBe('135.00');
    expect(dividendAmounts('120', '7.5', '15', null).tax).toBe('135.00');
  });
  it('takes another rate (non-filer 30%, 0%) and clamps silly ones', () => {
    expect(dividendAmounts('1000', '2', '30')).toEqual({ gross: '2000.00', tax: '600.00', net: '1400.00', rate: '30' });
    expect(dividendAmounts('1000', '2', '0').net).toBe('2000.00');
    expect(dividendAmounts('1000', '2', '150').net).toBe('0.00');
  });
  it('accepts thousands separators', () => {
    expect(dividendAmounts('1,000', '2', '15').gross).toBe('2000.00');
  });
});

describe('checkDividend', () => {
  const ok = { symbol: 'OGDC', companyName: 'OGDC', paymentDate: '2026-11-10', type: 'interim' as const, shares: '100', dps: '2', ratePct: '15' };
  it('accepts a complete draft', () => expect(checkDividend(ok, '2026-11-15')).toBeNull());
  it('rejects missing or wrong fields', () => {
    expect(checkDividend({ ...ok, symbol: '' }, '2026-11-15')).toMatch(/stock/);
    expect(checkDividend({ ...ok, paymentDate: '2026-12-01' }, '2026-11-15')).toMatch(/future/);
    expect(checkDividend({ ...ok, shares: '0' }, '2026-11-15')).toMatch(/shares/);
    expect(checkDividend({ ...ok, dps: '' }, '2026-11-15')).toMatch(/per share/);
    expect(checkDividend({ ...ok, ratePct: '101' }, '2026-11-15')).toMatch(/rate/);
    expect(checkDividend({ ...ok, ratePct: '' }, '2026-11-15')).toMatch(/rate/);
    expect(checkDividend({ ...ok, taxRs: '500' }, '2026-11-15')).toMatch(/more than the gross/);
    expect(checkDividend({ ...ok, ratePct: '', taxRs: '20' }, '2026-11-15')).toBeNull();
  });
});
