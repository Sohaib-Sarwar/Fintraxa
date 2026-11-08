/**
 * Instant answers: the common, unambiguous questions answered right here from
 * the user's own records, exactly (decimal.js), with no round trip to the
 * model. "How much dividend did I get in October 2026", "what did I spend on
 * rent this year", "what did I earn in June", "my net worth" come back in
 * milliseconds, in the same format the model is asked to use.
 *
 * Deliberately narrow: one topic, a clear scope, and none of the words that
 * need judgement (compare, why, trend, advice …). Anything else returns null
 * and goes to the model as before, so a wrong guess is never shown.
 */
import Decimal from 'decimal.js';
import { kindOf } from '../finance/summary.js';
import { matchesNote } from './intent.js';

const ZERO = new Decimal(0);
const D = (v) => new Decimal(String(v ?? 0));
const rs = (d) => `Rs ${D(d).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const SOURCE = { mutual_funds: 'Mutual fund profit', dividends: 'Dividends', savings: 'Savings profit', other: 'Other passive' };
// Questions that need reasoning, comparison or a list: leave them to the model.
const NEEDS_MODEL = /\b(compare|compared|vs|versus|why|trend|average|avg|forecast|predict|should|advice|recommend|best|worst|biggest|largest|smallest|highest|lowest|list|each|every|which|when|how many|percent|%|ratio|rate|growth|change|increase|decrease|more than|less than|between|and)\b/i;
const inP = (p, d) => !p || (d >= p.start && d <= p.end);
const scopeText = (intent) => [
  intent.period ? (/^\d{4}-\d{2}-\d{2}$/.test(intent.period.label) ? `on ${intent.period.label}` : `in ${intent.period.label}`) : 'in total',
].join(' ');
const table = (head, rows) => [`| ${head[0]} | ${head[1]} |`, '|---|---:|', ...rows.map(([a, b]) => `| ${a} | ${b} |`)].join('\n');

/**
 * @param {string} question
 * @param {object} intent   detectIntent()
 * @param {{ transactions, dividends, events, worth }} data
 * @returns {string|null}   markdown, or null when the model should answer
 */
export function instantAnswer(question, intent, data) {
  if (!data || NEEDS_MODEL.test(question)) return null;
  const { topics, period, categories, symbols, noteTerms = [] } = intent;
  const only = (t) => topics.length === 1 && topics[0] === t;

  // A payee, employer or merchant named in the notes: "salary from 99 Technologies", "spent at Careem".
  if (noteTerms.length && topics.length <= 1 && (topics.length === 0 || ['income', 'spending'].includes(topics[0]))) {
    const inScope = (data.transactions ?? []).filter((t) => inP(period, t.date) && matchesNote(t, noteTerms));
    const both = categories.length ? inScope.filter((t) => categories.includes(t.categories?.name)) : inScope;
    let rows = both.length ? both : inScope;
    const dir = topics[0] === 'income' ? 'credit' : topics[0] === 'spending' ? 'debit' : null;
    if (dir) rows = rows.filter((t) => t.type === dir);
    const name = noteTerms.map((n) => `“${n.text}”`).join(' or ');
    if (!rows.length) return `No transactions mentioning ${name} ${scopeText(intent)}.`;
    const credits = rows.filter((t) => t.type === 'credit'); const debits = rows.filter((t) => t.type === 'debit');
    if (credits.length && debits.length && !dir) return null; // money both ways: let the model explain it
    const isIn = credits.length > 0;
    const total = rows.reduce((s, t) => s.plus(D(t.amount)), ZERO);
    const byMonth = new Map();
    for (const t of rows) byMonth.set(t.date.slice(0, 7), (byMonth.get(t.date.slice(0, 7)) ?? ZERO).plus(D(t.amount)));
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const lines = [`You ${isIn ? 'received' : 'paid'} **${rs(total)}** ${isIn ? 'from' : 'to'} ${name} ${scopeText(intent)}.`, ''];
    if (byMonth.size > 1) {
      const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
      lines.push(table(['Month', 'Amount'], [...months.slice(0, 7).map(([m, v]) => [`${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`, rs(v)]), ...(months.length > 7 ? [['Earlier', rs(months.slice(7).reduce((a, [, v]) => a.plus(v), ZERO))]] : []), ['**Total**', `**${rs(total)}**`]]), '');
    }
    lines.push(`- **Entries:** ${rows.length}, matched by the note`);
    return lines.join('\n');
  }

  // Net worth now.
  if ((only('networth') || (topics.includes('networth') && topics.length <= 2)) && !period && data.worth) {
    const w = data.worth;
    return [
      `Your net worth is **${rs(w.value)}** right now.`, '',
      table(['Part', 'Value'], [['Mutual funds', rs(w.funds)], ['PSX stocks', rs(w.stocks)], ['**Total**', `**${rs(w.value)}**`]]),
    ].join('\n');
  }

  // Dividends for a period and/or stocks.
  if (only('dividends') && (period || symbols.length)) {
    const rows = (data.dividends ?? []).filter((d) => inP(period, d.payment_date) && (!symbols.length || symbols.includes(d.symbol)));
    const who = symbols.length ? ` from ${symbols.join(' and ')}` : '';
    if (!rows.length) return `You received **no dividends**${who} ${scopeText(intent)}.`;
    let gross = ZERO; let tax = ZERO; let net = ZERO;
    const bySym = new Map();
    for (const d of rows) {
      const t = D(d.tax_amount).plus(D(d.jh_tax_amount)).plus(D(d.zakat_amount));
      gross = gross.plus(D(d.gross_amount)); tax = tax.plus(t); net = net.plus(D(d.net_amount));
      bySym.set(d.symbol, (bySym.get(d.symbol) ?? ZERO).plus(D(d.net_amount)));
    }
    const lines = [`You received **${rs(net)}** in dividends${who} ${scopeText(intent)}, after tax.`, ''];
    if (bySym.size > 1) {
      const sorted = [...bySym.entries()].sort((a, b) => b[1].comparedTo(a[1]));
      lines.push(table(['Stock', 'Net'], [...sorted.slice(0, 7).map(([s, v]) => [s, rs(v)]), ...(sorted.length > 7 ? [['Others', rs(sorted.slice(7).reduce((a, [, v]) => a.plus(v), ZERO))]] : []), ['**Total**', `**${rs(net)}**`]]), '');
    }
    lines.push(`- **Gross:** ${rs(gross)}`, `- **Tax and zakat withheld:** ${rs(tax)}`, `- **Payments:** ${rows.length}`);
    return lines.join('\n');
  }

  // Spending for a period and/or categories.
  if (only('spending') && (period || categories.length)) {
    const rows = (data.transactions ?? []).filter((t) => t.type === 'debit' && kindOf(t) === 'spend' && inP(period, t.date) && (!categories.length || categories.includes(t.categories?.name)));
    const on = categories.length ? ` on ${categories.join(' and ')}` : '';
    if (!rows.length) return `You spent **nothing**${on} ${scopeText(intent)}.`;
    const total = rows.reduce((s, t) => s.plus(D(t.amount)), ZERO);
    const byCat = new Map();
    for (const t of rows) { const n = t.categories?.name || 'Uncategorized'; byCat.set(n, (byCat.get(n) ?? ZERO).plus(D(t.amount))); }
    const lines = [`You spent **${rs(total)}**${on} ${scopeText(intent)}.`, ''];
    if (byCat.size > 1) {
      const sorted = [...byCat.entries()].sort((a, b) => b[1].comparedTo(a[1]));
      lines.push(table(['Category', 'Amount'], [...sorted.slice(0, 7).map(([n, v]) => [n, rs(v)]), ...(sorted.length > 7 ? [['Others', rs(sorted.slice(7).reduce((a, [, v]) => a.plus(v), ZERO))]] : []), ['**Total**', `**${rs(total)}**`]]), '');
    }
    lines.push(`- **Expenses recorded:** ${rows.length}`, '- Money moved into savings or investments is not counted as spending.');
    return lines.join('\n');
  }

  // Money made in a period: active income + passive income.
  if (only('income') && period && !categories.length) {
    const act = (data.transactions ?? []).filter((t) => t.type === 'credit' && kindOf(t) !== 'passive' && inP(period, t.date));
    const pas = (data.events ?? []).filter((e) => inP(period, e.date));
    const active = act.reduce((s, t) => s.plus(D(t.amount)), ZERO);
    const bySrc = new Map();
    for (const e of pas) bySrc.set(e.source, (bySrc.get(e.source) ?? ZERO).plus(D(e.net)));
    const passive = [...bySrc.values()].reduce((s, v) => s.plus(v), ZERO);
    const total = active.plus(passive);
    if (total.isZero()) return `Nothing was earned ${scopeText(intent)}: no income or passive income is recorded.`;
    const rows = [['Active income', rs(active)], ...[...bySrc.entries()].filter(([, v]) => !v.isZero()).map(([s, v]) => [SOURCE[s] ?? s, rs(v)]), ['**Total**', `**${rs(total)}**`]];
    return [
      `You made **${rs(total)}** ${scopeText(intent)}.`, '',
      table(['Source', 'Amount'], rows), '',
      '- Active income is salary, business and other earned income; passive amounts are after tax.',
    ].join('\n');
  }
  return null;
}
