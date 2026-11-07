/**
 * Personal finance (income/expense) for a date range — pure, exact.
 *
 * Transactions are `income_expense_transactions` rows: type 'credit' (money
 * in) or 'debit' (money out), with an amount and a category.
 */
import Decimal from 'decimal.js';

const ZERO = new Decimal(0);
const D = (v) => new Decimal(String(v ?? 0));
const r2 = (d) => Number(d.toFixed(2));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nextMonth = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };

/**
 * @param {object[]} txns  rows with { type, amount, date, categories?: { name, icon } }
 * @param {{ start: string, end: string }} range  (end clipped to today)
 * @param {string} [today]
 */
export function summarize(txns, { start, end }, today = new Date().toISOString().slice(0, 10)) {
  const endEff = end && end < today ? end : today;
  const rows = txns.filter((t) => t.date >= start && t.date <= endEff);
  let income = ZERO; let expense = ZERO;
  const byCat = new Map();
  for (const t of rows) {
    const a = D(t.amount);
    if (t.type === 'credit') income = income.plus(a);
    else {
      expense = expense.plus(a);
      const name = t.categories?.name || 'Uncategorized';
      const cur = byCat.get(name) ?? { name, icon: t.categories?.icon ?? null, amount: ZERO, count: 0 };
      cur.amount = cur.amount.plus(a); cur.count += 1;
      byCat.set(name, cur);
    }
  }
  const net = income.minus(expense);

  const months = [];
  const first = rows.map((t) => t.date).sort()[0];
  if (first) {
    const from = (start > first ? start : first).slice(0, 7);
    for (let m = from; m <= endEff.slice(0, 7) && months.length < 120; m = nextMonth(m)) {
      let inc = ZERO; let exp = ZERO;
      for (const t of rows) {
        if (t.date.slice(0, 7) !== m) continue;
        if (t.type === 'credit') inc = inc.plus(D(t.amount)); else exp = exp.plus(D(t.amount));
      }
      months.push({ month: m, label: MON[Number(m.slice(5, 7)) - 1], income: r2(inc), expense: r2(exp), net: r2(inc.minus(exp)) });
    }
    if (months.length > 12) for (const x of months) x.label = `${x.label} ${x.month.slice(2, 4)}`;
  }

  return {
    start, end: endEff, count: rows.length,
    income: r2(income), expense: r2(expense), net: r2(net),
    // Share of income kept; null when there was no income to keep.
    savingsRate: income.gt(0) ? Number(net.dividedBy(income).times(100).toFixed(1)) : null,
    categories: [...byCat.values()].map((c) => ({ ...c, amount: r2(c.amount) })).sort((a, b) => b.amount - a.amount),
    months,
  };
}

/** Months → Pakistan fiscal years (1 Jul – 30 Jun), income and expense summed exactly. */
export function byFiscalYear(months) {
  const years = new Map();
  for (const m of months) {
    const [y, mo] = m.month.split('-').map(Number);
    const fy = mo >= 7 ? y : y - 1;
    const cur = years.get(fy) ?? { income: ZERO, expense: ZERO };
    cur.income = cur.income.plus(D(m.income)); cur.expense = cur.expense.plus(D(m.expense));
    years.set(fy, cur);
  }
  return [...years.entries()].sort((a, b) => a[0] - b[0]).map(([fy, v]) => {
    const short = `FY ${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
    return { month: `${fy}-07`, label: short, tick: short, title: `FY ${fy}-${String(fy + 1).slice(2)}`, income: r2(v.income), expense: r2(v.expense), net: r2(v.income.minus(v.expense)) };
  });
}
