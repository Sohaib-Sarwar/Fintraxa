import type { PassiveEvent } from '@/data/engines';
import type { FundPosition } from '@/data/types';
import { passivePayers } from '../payers';

const ev = (o: Partial<PassiveEvent>): PassiveEvent => ({
  id: 'x', date: '2026-10-05', month: '2026-10', source: 'dividends', title: 'OGDC', sub: '', symbol: 'OGDC', gross: 0, tax: 0, net: 0, posted: true, ...o,
});
const fund = (key: string, name: string, sales: { date: string; gain: number; cgt: number }[]) =>
  ({ key, fundName: name, amcCode: 'ubl', amcName: 'UBL Funds', sales } as unknown as FundPosition);

describe('passivePayers', () => {
  const events = [
    ev({ id: 'd1', symbol: 'OGDC', title: 'OGDC', net: '765' }),
    ev({ id: 'd2', symbol: 'OGDC', title: 'OGDC', net: '100' }),
    ev({ id: 'd3', symbol: 'FFC', title: 'FFC', net: '300' }),
    ev({ id: 's1', source: 'savings', title: 'Raqami savings', symbol: 'RAQAMI', net: '8000' }),
  ];
  const funds = [fund('a|f1|', 'UBL Cash', [{ date: '2026-10-20', gain: 1200, cgt: 180 }, { date: '2026-09-02', gain: 50, cgt: 0 }])];

  it('groups each payer per month, biggest first, all sources', () => {
    const p = passivePayers('all', events, funds)['2026-10'];
    expect(p.map((x) => [x.kind, x.label, x.net])).toEqual([
      ['bank', 'Raqami savings', 8000], ['fund', 'UBL Cash', 1020], ['stock', 'OGDC', 865], ['stock', 'FFC', 300],
    ]);
    expect(passivePayers('all', events, funds)['2026-09'].map((x) => x.net)).toEqual([50]);
  });
  it('keeps to one source when asked', () => {
    expect(passivePayers('dividends', events, funds)['2026-10'].map((x) => x.label)).toEqual(['OGDC', 'FFC']);
    expect(passivePayers('mutual_funds', events, funds)['2026-10'].map((x) => [x.label, x.amcCode])).toEqual([['UBL Cash', 'ubl']]);
    expect(passivePayers('savings', events, null)['2026-10'].map((x) => x.symbol)).toEqual(['RAQAMI']);
  });
});
