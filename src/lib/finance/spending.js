/**
 * Insights for a date range, for spending or for active income: pure, exact (decimal.js).
 *
 * side 'spend' (default): the focus is spending; active income is shown beside it.
 * side 'income': the focus is active income (salary, freelance, ...); spending is beside it.
 * Every figure below is about the focus side; `category` narrows the focus side only.
 *
 * Spending is every debit whose category is a 'spend' kind (see summary.js
 * kindOf). Money moved into savings or investments is a transfer, not spending,
 * and is left out here too.
 *
 *   total            spent in the range
 *   avgMonthly       spent in the range's complete calendar months ÷ their number
 *                    (a part month would drag the average down); null with none
 *   mtd              this month to date vs the same days of last month
 *   previous         the same number of days immediately before the range
 *   shareOfIncome    total ÷ active income in the range, %
 *   categories       amount, share, count and change vs the previous period
 *   largest          the biggest single expenses
 *   category option  every figure for one expense category; allTotal / shareOfSpending put it against all spending
 *   months           spent and active income month by month (for the chart)
 */
import Decimal from 'decimal.js';
import { kindOf } from './summary.js';

const ZERO = new Decimal(0);
const D = (v) => new Decimal(String(v ?? 0));
const r2 = (d) => Number(d.toFixed(2));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86_400_000;
const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const toIso = (d) => d.toISOString().slice(0, 10);
const addDays = (iso, n) => toIso(new Date(toDate(iso).getTime() + n * DAY));
const nextMonth = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };
const prevMonth = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };
const monthEnd = (m) => { const [y, mo] = m.split('-').map(Number); return toIso(new Date(Date.UTC(y, mo, 0))); };
/** Percentage change, one decimal; null when there is nothing to compare with. */
const pct = (now, before) => (before.gt(0) ? Number(now.minus(before).dividedBy(before).times(100).toFixed(1)) : null);

export const isSpend = (t) => t.type === 'debit' && kindOf(t) === 'spend';
export const isActiveIncome = (t) => t.type === 'credit' && kindOf(t) !== 'passive';
const isActive = isActiveIncome;

/**
 * @param {object[]} txns  income_expense_transactions rows with categories(name, icon, kind)
 * @param {{ start: string, end?: string }} range
 * @param {string} today   ISO date (local)
 * @param {{ largest?: number, category?: string|null, side?: 'spend'|'income' }} [o] category: only that category of the focus side (by name)
 */
export function analyzeSpending(txns, { start, end }, today, { largest = 6, category = null, side = 'spend' } = {}) {
  const endEff = end && end < today ? end : today;
  const sum = (rows) => rows.reduce((s, t) => s.plus(D(t.amount)), ZERO);
  const isFocus = side === 'income' ? isActive : isSpend;
  const byCategory = (rows) => (category ? rows.filter((t) => (t.categories?.name || 'Uncategorized') === category) : rows);
  const focusAll = txns.filter(isFocus);
  const spend = byCategory(focusAll);  // the focus rows (spending, or active income)
  const inRange = spend.filter((t) => t.date >= start && t.date <= endEff);
  const total = sum(inRange);
  const allTotal = sum(focusAll.filter((t) => t.date >= start && t.date <= endEff));
  const active = sum(txns.filter((t) => isActive(t) && t.date >= start && t.date <= endEff));
  const spentAll = sum(txns.filter((t) => isSpend(t) && t.date >= start && t.date <= endEff));
  // Month series: the focus side follows the category filter, the other side is everything.
  const monthSpend = side === 'income' ? txns.filter(isSpend) : spend;
  const monthIncome = side === 'income' ? spend : txns.filter(isActive);

  // The same number of days just before the range.
  const days = Math.round((toDate(endEff) - toDate(start)) / DAY) + 1;
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(start, -days);
  const prevRows = spend.filter((t) => t.date >= prevStart && t.date <= prevEnd);
  const prevTotal = sum(prevRows);

  // By category, with the previous period beside it.
  const cats = new Map();
  const slot = (t) => {
    const name = t.categories?.name || 'Uncategorized';
    if (!cats.has(name)) cats.set(name, { name, icon: t.categories?.icon ?? null, amount: ZERO, count: 0, prev: ZERO });
    return cats.get(name);
  };
  for (const t of inRange) { const c = slot(t); c.amount = c.amount.plus(D(t.amount)); c.count += 1; }
  for (const t of prevRows) { const name = t.categories?.name || 'Uncategorized'; if (cats.has(name)) cats.get(name).prev = cats.get(name).prev.plus(D(t.amount)); }
  const categories = [...cats.values()].sort((a, b) => b.amount.comparedTo(a.amount) || a.name.localeCompare(b.name)).map((c) => ({
    name: c.name, icon: c.icon, count: c.count, amount: r2(c.amount), prev: r2(c.prev),
    share: total.gt(0) ? Number(c.amount.dividedBy(total).times(100).toFixed(1)) : 0,
    change: pct(c.amount, c.prev),
  }));

  // Month by month, from the first month with any activity (or the range start, if later).
  const months = [];
  const firstActivity = txns.filter((t) => isSpend(t) || isActive(t)).map((t) => t.date).sort()[0];
  if (firstActivity && firstActivity <= endEff) {
    const from = (start > firstActivity ? start : firstActivity).slice(0, 7);
    for (let m = from; m <= endEff.slice(0, 7) && months.length < 600; m = nextMonth(m)) {
      const inMonth = (t) => t.date.slice(0, 7) === m && t.date >= start && t.date <= endEff;
      months.push({
        month: m, label: MON[Number(m.slice(5, 7)) - 1], live: m === today.slice(0, 7),
        spent: r2(sum(monthSpend.filter(inMonth))), income: r2(sum(monthIncome.filter(inMonth))),
      });
    }
    if (months.length > 12) for (const x of months) x.label = `${x.label} ${x.month.slice(2, 4)}`;
  }

  // Average over complete calendar months inside the range only.
  const complete = months.filter((m) => `${m.month}-01` >= start && monthEnd(m.month) <= endEff && monthEnd(m.month) < today);
  const focusKey = side === 'income' ? 'income' : 'spent';
  const completeTotal = complete.reduce((s, m) => s.plus(D(m[focusKey])), ZERO);
  const avgMonthly = complete.length ? r2(completeTotal.dividedBy(complete.length)) : null;

  // This month so far vs the same days of last month (pace, not a full-month comparison).
  const thisMonth = today.slice(0, 7);
  const dayOfMonth = Number(today.slice(8, 10));
  const lastMonth = prevMonth(thisMonth);
  const lastCut = `${lastMonth}-${String(Math.min(dayOfMonth, Number(monthEnd(lastMonth).slice(8, 10)))).padStart(2, '0')}`;
  const mtdNow = sum(spend.filter((t) => t.date >= `${thisMonth}-01` && t.date <= today));
  const mtdBefore = sum(spend.filter((t) => t.date >= `${lastMonth}-01` && t.date <= lastCut));

  return {
    side, start, end: endEff, days, count: inRange.length,
    spentAll: r2(spentAll),          // all spending in the range (beside income)
    keptShare: side === 'income' && active.gt(0) ? Number(active.minus(spentAll).dividedBy(active).times(100).toFixed(1)) : null,
    total: r2(total),
    allTotal: r2(allTotal),           // every category, for the share of one
    shareOfSpending: allTotal.gt(0) ? Number(total.dividedBy(allTotal).times(100).toFixed(1)) : null,
    active: r2(active),
    shareOfIncome: active.gt(0) ? Number(total.dividedBy(active).times(100).toFixed(1)) : null,
    avgMonthly, completeMonths: complete.length,
    mtd: { month: thisMonth, spent: r2(mtdNow), before: r2(mtdBefore), change: pct(mtdNow, mtdBefore) },
    previous: { start: prevStart, end: prevEnd, total: r2(prevTotal), change: pct(total, prevTotal) },
    categories,
    largest: [...inRange].sort((a, b) => D(b.amount).comparedTo(D(a.amount)) || b.date.localeCompare(a.date)).slice(0, largest),
    months,
  };
}
