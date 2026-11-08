/**
 * Fast answers: read the question before asking the model.
 *
 * The summary tables (months, categories, years, holdings) always go with the
 * system instruction, which stays identical between questions so Gemini can
 * reuse it (implicit prompt caching). Raw records are NOT sent wholesale any
 * more: only the rows that match what the question is about (its period,
 * category or stock) are attached to that one question. A smaller prompt is
 * the biggest single win for time to first word.
 *
 * Also gives the chat a few honest progress lines ("Looking at June 2026…")
 * to show while the answer is on its way.
 */
import Decimal from 'decimal.js';
import { kindOf } from '../finance/summary.js';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON_RE = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const monthIndex = (word) => MONTHS.findIndex((m) => m.startsWith(word.toLowerCase().slice(0, 3)));
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1-12
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000));
const LABEL_MONTH = (y, m) => `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`;
const monthPeriod = (y, m) => ({ start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(lastDay(y, m))}`, label: LABEL_MONTH(y, m) });

export const MAX_TXNS = 150;
export const MAX_DIVIDENDS = 80;
export const MAX_TRADES = 80;
export const RECENT_TXNS = 40;

const TOPICS = [
  ['networth', /net\s*worth|worth|wealth|assets|how\s+rich/i],
  ['income', /\b(earn|earned|earning|income|made|make|salary|paid me|received)\b/i],
  ['spending', /\b(spend|spent|spending|expense|expenses|bills?|cost|costs|money go|went|buy|bought|paid)\b/i],
  ['dividends', /dividend/i],
  ['funds', /\b(fund|funds|mutual|mf|nav|units?|redeem|redemption)\b/i],
  ['stocks', /\b(stock|stocks|shares?|psx|equit(y|ies)|trade|trades|portfolio)\b/i],
  ['tax', /\b(tax|taxes|cgt|zakat|withh?old(ing)?|filer)\b/i],
  ['savings', /\b(sav(e|ed|ing|ings)|bank profit|profit rate|savings rate)\b/i],
];
const WANTS_ROWS = /\b(list|show|which|what did i|biggest|largest|smallest|highest|lowest|recent|latest|last \d+|transactions?|entries|details?|when did|on \d{1,2}|each)\b/i;

/**
 * The period a question is about, or null.
 * Understands: today, yesterday, this/last week, this/last month, this/last year,
 * this/last fiscal year (FY), "June", "June 2025", "Jun 25", "3 Nov", "2026-11-03", "2025".
 */
export function detectPeriod(question, today) {
  const q = ` ${String(question).toLowerCase()} `;
  const [ty, tm] = today.split('-').map(Number);
  const fyStart = tm >= 7 ? ty : ty - 1;
  if (/\btoday\b/.test(q)) return { start: today, end: today, label: 'today' };
  if (/\byesterday\b/.test(q)) { const d = addDays(today, -1); return { start: d, end: d, label: 'yesterday' }; }
  if (/\b(this|current) week\b/.test(q)) return { start: addDays(today, -6), end: today, label: 'the last 7 days' };
  if (/\blast week\b/.test(q)) return { start: addDays(today, -13), end: addDays(today, -7), label: 'last week' };
  if (/\b(this|current) month\b|\bmonth so far\b/.test(q)) return { ...monthPeriod(ty, tm), end: today };
  if (/\b(last|previous|past) month\b/.test(q)) return tm === 1 ? monthPeriod(ty - 1, 12) : monthPeriod(ty, tm - 1);
  if (/\b(this|current) (fiscal|financial) year\b|\bthis fy\b/.test(q)) return { start: `${fyStart}-07-01`, end: today, label: `FY ${fyStart}-${String(fyStart + 1).slice(2)}` };
  if (/\b(last|previous) (fiscal|financial) year\b|\blast fy\b/.test(q)) return { start: `${fyStart - 1}-07-01`, end: `${fyStart}-06-30`, label: `FY ${fyStart - 1}-${String(fyStart).slice(2)}` };
  const fy = q.match(/\bfy\s*'?(\d{2,4})(?:\s*[-/]\s*(\d{2,4}))?\b/);
  if (fy) { let y = Number(fy[1]); if (y < 100) y += 2000; return { start: `${y}-07-01`, end: `${y + 1}-06-30`, label: `FY ${y}-${String(y + 1).slice(2)}` }; }
  if (/\b(this|current) year\b/.test(q)) return { start: `${ty}-01-01`, end: today, label: String(ty) };
  if (/\blast year\b/.test(q)) return { start: `${ty - 1}-01-01`, end: `${ty - 1}-12-31`, label: String(ty - 1) };
  const isoDay = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoDay) { const d = `${isoDay[1]}-${isoDay[2]}-${isoDay[3]}`; return { start: d, end: d, label: d }; }
  const day = q.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MON_RE})\\b(?:\\s+(\\d{4}))?`));
  if (day) {
    const m = monthIndex(day[2]) + 1; const dd = Number(day[1]);
    let y = day[3] ? Number(day[3]) : ty;
    if (!day[3] && `${y}-${pad(m)}-${pad(dd)}` > today) y -= 1;
    const d = `${y}-${pad(m)}-${pad(dd)}`;
    return { start: d, end: d, label: d };
  }
  const mon = q.match(new RegExp(`\\b(${MON_RE})\\b(?:\\s*'?(\\d{4}|\\d{2})\\b)?`));
  // "may" is also a verb: only take it with a year or when it is the only month-like word near "in".
  if (mon && !(mon[1] === 'may' && !mon[2] && !/\bin may\b|\bmay \d/.test(q))) {
    const m = monthIndex(mon[1]) + 1;
    let y = mon[2] ? Number(mon[2]) : ty;
    if (y < 100) y += 2000;
    if (!mon[2] && m > tm) y -= 1; // a month name alone means its most recent occurrence
    return monthPeriod(y, m);
  }
  const year = q.match(/\b(20\d{2})\b/);
  if (year) return { start: `${year[1]}-01-01`, end: `${year[1]}-12-31`, label: year[1] };
  return null;
}

// Words that belong to the question, not to a payee, employer or merchant name.
const STOP = new Set(('a an the i me my mine we our you your it its is are was were be been am do did does done have has had get got gets getting '
  + 'how much many what which who whom whose when where why total sum all any some of in on at to for from by with about into than then so '
  + 'please tell show give list me can could would will shall should may might must just only also and or not no yes there this that these those '
  + 'money rs pkr rupees amount amounts paid pay pays receive received receiving earn earned earning earnings income incomes made make salary salaries '
  + 'spend spent spending expense expenses cost costs bought buy buying transaction transactions entry entries note notes month months year years '
  + 'today yesterday week weeks last previous current so far fy fiscal financial till until since up per day days ago from').split(' '));
const MONTH_WORDS = new Set([...MONTHS, 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec']);
const tokens = (s) => String(s).toLowerCase().replace(/[^a-z0-9&.\- ]+/g, ' ').split(/\s+/).map((w) => w.replace(/^[.-]+|[.-]+$/g, '')).filter(Boolean);
const noteHas = (note, words) => { const n = ` ${tokens(note).join(' ')} `; return words.every((w) => n.includes(` ${w} `) || n.includes(` ${w}`)); };

/**
 * Names in the question that appear in transaction notes ("99 Technologies",
 * "K-Electric", "Careem"). Returns [{ words, text }] where text is the name as
 * written in the first matching note. Only names that some note contains count.
 */
export function detectNoteTerms(question, notes = [], exclude = []) {
  if (!notes.length) return [];
  const skip = new Set([...exclude.flatMap((x) => tokens(x))]);
  const words = tokens(question);
  const runs = []; let run = [];
  for (const w of words) {
    const keep = !STOP.has(w) && !MONTH_WORDS.has(w) && !skip.has(w) && !/^(19|20)\d{2}$/.test(w) && (w.length > 1 || /\d/.test(w));
    if (keep) run.push(w); else if (run.length) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  const out = [];
  for (const r of runs) {
    // The longest stretch of the run that some note contains (so "from 99 technologies ltd" still finds "99 technologies").
    let found = null;
    for (let len = r.length; len >= 1 && !found; len -= 1) {
      for (let i = 0; i + len <= r.length && !found; i += 1) {
        const part = r.slice(i, i + len);
        if (part.length === 1 && part[0].length < 3) continue; // a lone short word is too vague
        const hit = notes.find((n) => noteHas(n, part));
        if (hit) {
          const re = new RegExp(part.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^a-z0-9]+'), 'i');
          found = { words: part, text: (String(hit).match(re) ?? [part.join(' ')])[0] };
        }
      }
    }
    if (found) out.push(found);
  }
  return out;
}
export const matchesNote = (t, terms) => terms.some((term) => noteHas(t.notes ?? '', term.words));

/**
 * What the question is about.
 * @param {string} question
 * @param {{ today: string, categories?: string[], symbols?: string[] }} known names from the user's data
 */
export function detectIntent(question, { today, categories = [], symbols = [], notes = [] }) {
  const q = String(question);
  const lower = q.toLowerCase();
  const topics = TOPICS.filter(([, re]) => re.test(q)).map(([k]) => k);
  const cats = categories.filter((c) => c && c.length > 2 && lower.includes(c.toLowerCase()));
  const syms = symbols.filter((s) => s && new RegExp(`\\b${s.replace(/[^A-Za-z0-9]/g, '')}\\b`, 'i').test(q));
  const noteTerms = detectNoteTerms(q, notes, [...cats, ...syms]);
  return { period: detectPeriod(q, today), topics, categories: cats, symbols: syms, noteTerms, wantsRows: WANTS_ROWS.test(q) };
}

const cell = (v, max = 48) => String(v ?? '').replace(/[\r\n,;|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const f2 = (v) => new Decimal(String(v ?? 0)).toFixed(2);
const inPeriod = (p, date) => !p || (date >= p.start && date <= p.end);

/**
 * The raw records that answer this question, as compact text to attach to it.
 * Empty when the summary tables are enough (e.g. "what is my net worth").
 */
export function relevantRecords(intent, { transactions = [], dividends = [], trades = [] }) {
  const { period, categories, symbols, topics, wantsRows, noteTerms = [] } = intent;
  const out = [];
  const narrowed = !!period || categories.length > 0 || noteTerms.length > 0;
  const aboutTx = topics.some((t) => ['income', 'spending', 'savings', 'tax'].includes(t)) || categories.length > 0 || noteTerms.length > 0 || (!topics.length && wantsRows);

  if (aboutTx && (narrowed || wantsRows)) {
    let rows = transactions.filter((t) => t.date && inPeriod(period, t.date));
    // A name from the notes narrows first; the category too when both agree (else the note wins: "salary from X").
    if (noteTerms.length) {
      const byNote = rows.filter((t) => matchesNote(t, noteTerms));
      const both = categories.length ? byNote.filter((t) => categories.includes(t.categories?.name)) : byNote;
      rows = both.length ? both : byNote;
    } else if (categories.length) rows = rows.filter((t) => categories.includes(t.categories?.name));
    rows = rows.sort((a, b) => b.date.localeCompare(a.date));
    const cap = narrowed ? MAX_TXNS : RECENT_TXNS;
    if (rows.length) {
      out.push(`Transactions${period ? ` in ${period.label}` : ''}${categories.length ? ` for ${categories.join(', ')}` : ''}${noteTerms.length ? ` whose note mentions ${noteTerms.map((n) => `"${n.text}"`).join(' or ')}` : ''} (date,direction,category,kind,amount,account,note)${rows.length > cap ? `; ${cap} of ${rows.length} shown` : ''}:`);
      for (const t of rows.slice(0, cap)) {
        const gross = t.gross_amount !== null && t.gross_amount !== undefined ? ` (gross ${f2(t.gross_amount)}, tax ${f2(t.tax_amount ?? 0)})` : '';
        out.push([t.date, t.type === 'credit' ? 'in' : 'out', cell(t.categories?.name || 'Uncategorized', 32), kindOf(t), f2(t.amount) + gross, cell(t.savings_accounts?.name ?? '', 30), cell(t.notes ?? '', 60)].join(','));
      }
    } else if (narrowed) out.push(`No transactions${period ? ` in ${period.label}` : ''}${categories.length ? ` for ${categories.join(', ')}` : ''}.`);
  }

  if (topics.includes('dividends') || (symbols.length && !topics.includes('stocks'))) {
    const rows = dividends.filter((d) => inPeriod(period, d.payment_date) && (!symbols.length || symbols.includes(d.symbol)))
      .sort((a, b) => b.payment_date.localeCompare(a.payment_date));
    if (rows.length && (period || symbols.length || wantsRows)) {
      out.push('', `Dividend payments${period ? ` in ${period.label}` : ''}${symbols.length ? ` for ${symbols.join(', ')}` : ''} (payment date,symbol,shares,gross,tax and zakat,net):`);
      for (const x of rows.slice(0, MAX_DIVIDENDS)) {
        const tax = new Decimal(String(x.tax_amount ?? 0)).plus(String(x.jh_tax_amount ?? 0)).plus(String(x.zakat_amount ?? 0));
        out.push([x.payment_date, x.symbol, x.shares ?? '', f2(x.gross_amount), tax.toFixed(2), f2(x.net_amount)].join(','));
      }
    }
  }

  if (topics.includes('stocks') || symbols.length) {
    const rows = trades.filter((t) => inPeriod(period, String(t.date)) && (!symbols.length || symbols.includes(t.symbol)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (rows.length && (period || symbols.length || wantsRows)) {
      out.push('', `PSX trades${period ? ` in ${period.label}` : ''}${symbols.length ? ` for ${symbols.join(', ')}` : ''} (date,type,symbol,quantity,price,fee):`);
      for (const t of rows.slice(0, MAX_TRADES)) out.push([t.date, t.type, t.symbol, t.quantity, t.price, t.fee ?? 0].map((v) => cell(v, 20)).join(','));
    }
  }
  return out.join('\n').trim();
}

/** The user's question with its records, as sent (the chat shows only the question). */
export function withRecords(question, records, period) {
  if (!records && !period) return question;
  return [
    question,
    '',
    '[Context for this question, from the user\'s data. Do not mention this block.]',
    period ? `Period asked about: ${period.label} (${period.start} to ${period.end}).` : '',
    records,
  ].filter(Boolean).join('\n');
}

const TOPIC_STEP = {
  income: 'Adding up your income',
  spending: 'Going through your expenses',
  dividends: 'Checking your dividends',
  funds: 'Reviewing your mutual funds',
  stocks: 'Reviewing your PSX holdings',
  networth: 'Totting up your net worth',
  tax: 'Checking tax and CGT',
  savings: 'Looking at what you saved',
};

/** Three or four short lines to show while the answer is coming, in the order the work happens. */
export function thinkingSteps(intent) {
  const steps = ['Reading your question'];
  if (intent.period) steps.push(`Looking at ${intent.period.label}`);
  if (intent.categories.length) steps.push(`Filtering ${intent.categories.slice(0, 2).join(' and ')}`);
  if (intent.noteTerms?.length) steps.push(`Searching notes for ${intent.noteTerms.slice(0, 2).map((n) => n.text).join(' and ')}`);
  if (intent.symbols.length) steps.push(`Pulling up ${intent.symbols.slice(0, 2).join(' and ')}`);
  for (const t of intent.topics.slice(0, 2)) steps.push(TOPIC_STEP[t]);
  if (steps.length === 1) steps.push('Looking through your Fintraxa data');
  steps.push('Writing your answer');
  return [...new Set(steps)].slice(0, 5);
}
