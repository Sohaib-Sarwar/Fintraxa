/**
 * Home: mutual funds + PSX stocks as one portfolio.
 *
 * Both sides are already worked out for the same date range by their own
 * engines (src/lib/mf/profit.js and src/lib/psx/portfolio.js); this only adds
 * them up, in exact decimals, and merges their month-end closing values.
 */
import Decimal from 'decimal.js';

const D = (v) => new Decimal(String(v ?? 0));
const add = (...xs) => Number(xs.reduce((s, x) => s.plus(D(x)), new Decimal(0)).toFixed(2));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Month-end points from both sides → one series. A month that only one side
 * covers counts the other as nothing held (it had no holdings yet).
 * points: [{ month, invested, value, live?, priced? }]
 */
export function mergeSeries(...sides) {
  const byMonth = new Map();
  for (const side of sides) {
    for (const pt of side ?? []) {
      const cur = byMonth.get(pt.month) ?? { month: pt.month, invested: 0, value: 0, live: false, priced: new Set() };
      cur.invested = add(cur.invested, pt.invested);
      cur.value = add(cur.value, pt.value);
      cur.live = cur.live || !!pt.live;
      if (pt.priced) cur.priced.add(pt.priced);
      byMonth.set(pt.month, cur);
    }
  }
  const out = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).map((pt) => ({
    ...pt,
    label: MON[Number(pt.month.slice(5, 7)) - 1],
    priced: pt.live ? 'live' : pt.priced.size === 1 ? [...pt.priced][0] : pt.priced.size ? 'mixed' : undefined,
  }));
  if (out.length > 12) for (const pt of out) pt.label = `${pt.label} ${pt.month.slice(2, 4)}`;
  return out;
}

/**
 * Totals across both sides.
 * Unrealized is net of the 15% CGT estimate on both sides; realized is after
 * CGT (funds, as statements report) and after broker fees (stocks).
 */
export function combineTotals(mf, psx) {
  const m = mf ?? { value: 0, invested: 0, held: 0, realized: { net: 0 }, unrealized: { net: 0, gross: 0 } };
  const s = psx ?? { value: 0, invested: 0, held: 0, realized: 0, unrealizedNet: 0, unrealized: 0 };
  const value = add(m.value, s.value);
  return {
    value,
    invested: add(m.invested, s.invested),
    unrealizedNet: add(m.unrealized?.net, s.unrealizedNet),
    unrealizedGross: add(m.unrealized?.gross, s.unrealized),
    realized: add(m.realized?.net, s.realized),
    held: (m.held ?? 0) + (s.held ?? 0),
    split: {
      funds: { value: m.value ?? 0, share: value > 0 ? (m.value ?? 0) / value : 0 },
      stocks: { value: s.value ?? 0, share: value > 0 ? (s.value ?? 0) / value : 0 },
    },
  };
}
