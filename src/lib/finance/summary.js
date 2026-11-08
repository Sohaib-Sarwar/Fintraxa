/**
 * Personal finance for a date range: pure, exact.
 *
 * Transactions are `income_expense_transactions` rows: type 'credit' (money in)
 * or 'debit' (money out), with an amount and a category whose `kind` says what
 * the money is:
 *   credit → 'active'  (salary, business, freelance…)  → active income
 *            'passive' (savings profit, …)             → passive income (via ./passive.js)
 *   debit  → 'spend'                                   → expenses
 *            'transfer' (into savings or investments)  → not an expense; reported apart
 *
 * Saved = active income − expenses. Passive income is reported beside it, not
 * inside it, so "saved" always means what was kept from earned income.
 */
import Decimal from 'decimal.js';
import { SOURCES, SOURCE_LABEL } from './passive.js';

const ZERO = new Decimal(0);
const D = (v) => new Decimal(String(v ?? 0));
const r2 = (d) => Number(d.toFixed(2));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nextMonth = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };

/** What a transaction is. Falls back by name for rows read before categories had a kind. */
export function kindOf(t) {
  const k = t.categories?.kind;
  if (k) return k;
  if (t.type === 'credit') return 'active';
  return /^(investment - |savings$)/i.test(t.categories?.name ?? '') ? 'transfer' : 'spend';
}

/**
 * @param {object[]} txns     rows with { type, amount, date, categories?: { name, icon, kind } }
 * @param {{ start: string, end: string }} range (end clipped to today)
 * @param {string} [today]
 * @param {{ passive?: object }} [o] analyzePassive() for the same range; without it,
 *        passive income is only what was entered under passive categories
 */
export function summarize(txns, { start, end }, today = new Date().toISOString().slice(0, 10), { passive } = {}) {
  const endEff = end && end < today ? end : today;
  const rows = txns.filter((t) => t.date >= start && t.date <= endEff);
  let active = ZERO; let expenses = ZERO; let transfers = ZERO; let manualPassive = ZERO;
  const activeCats = new Map(); const spendCats = new Map();
  const add = (map, t, a) => {
    const name = t.categories?.name || 'Uncategorized';
    const cur = map.get(name) ?? { name, icon: t.categories?.icon ?? null, amount: ZERO, count: 0 };
    cur.amount = cur.amount.plus(a); cur.count += 1;
    map.set(name, cur);
  };
  for (const t of rows) {
    const a = D(t.amount);
    const k = kindOf(t);
    if (t.type === 'credit') {
      if (k === 'passive') manualPassive = manualPassive.plus(a);
      else { active = active.plus(a); add(activeCats, t, a); }
    } else if (k === 'transfer') transfers = transfers.plus(a);
    else { expenses = expenses.plus(a); add(spendCats, t, a); }
  }
  const passiveNet = passive ? D(passive.totals.net) : manualPassive;
  const saved = active.minus(expenses);

  // Month by month: active, passive and expenses.
  const months = [];
  const passiveByMonth = new Map((passive?.months ?? []).map((m) => [m.month, m.net]));
  const firstDates = [rows.map((t) => t.date).sort()[0], passive?.months?.[0] ? `${passive.months[0].month}-01` : null].filter(Boolean).sort();
  if (firstDates.length) {
    const from = (start > firstDates[0] ? start : firstDates[0]).slice(0, 7);
    for (let m = from; m <= endEff.slice(0, 7) && months.length < 600; m = nextMonth(m)) {
      let act = ZERO; let exp = ZERO; let man = ZERO;
      for (const t of rows) {
        if (t.date.slice(0, 7) !== m) continue;
        const k = kindOf(t);
        if (t.type === 'credit') { if (k === 'passive') man = man.plus(D(t.amount)); else act = act.plus(D(t.amount)); } else if (k !== 'transfer') exp = exp.plus(D(t.amount));
      }
      const pas = passive ? D(passiveByMonth.get(m) ?? 0) : man;
      months.push({ month: m, label: MON[Number(m.slice(5, 7)) - 1], active: r2(act), passive: r2(pas), expenses: r2(exp), saved: r2(act.minus(exp)) });
    }
    if (months.length > 12) for (const x of months) x.label = `${x.label} ${x.month.slice(2, 4)}`;
  }

  const list = (map) => [...map.values()].map((c) => ({ ...c, amount: r2(c.amount) })).sort((a, b) => b.amount - a.amount);
  return {
    start, end: endEff, count: rows.length,
    active: r2(active), passive: r2(passiveNet), expenses: r2(expenses), transfers: r2(transfers), saved: r2(saved),
    // Share of active income kept; null when nothing was earned.
    savingsRate: active.gt(0) ? Number(saved.dividedBy(active).times(100).toFixed(1)) : null,
    categories: {
      active: list(activeCats),
      expenses: list(spendCats),
      passive: passive
        ? SOURCES.map((s) => ({ name: SOURCE_LABEL[s], source: s, amount: passive.bySource[s].net, count: passive.bySource[s].count })).filter((c) => c.amount > 0)
        : [],
    },
    months,
  };
}

/** Months → Pakistan fiscal years (1 Jul – 30 Jun): every numeric column summed exactly. */
export function byFiscalYear(months) {
  const years = new Map();
  for (const m of months) {
    const [y, mo] = m.month.split('-').map(Number);
    const fy = mo >= 7 ? y : y - 1;
    if (!years.has(fy)) years.set(fy, {});
    const acc = years.get(fy);
    for (const [k, v] of Object.entries(m)) if (typeof v === 'number') acc[k] = (acc[k] ?? ZERO).plus(D(v));
  }
  return [...years.entries()].sort((a, b) => a[0] - b[0]).map(([fy, v]) => {
    const short = `FY ${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
    return { month: `${fy}-07`, label: short, tick: short, title: `FY ${fy}-${String(fy + 1).slice(2)}`, ...Object.fromEntries(Object.entries(v).map(([k, d]) => [k, r2(d)])) };
  });
}
