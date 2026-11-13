/**
 * Money and number formatting for the phone (plan §5 format rules). Pure: privacy is passed in, never read
 * from a store, so every function is testable and safe in lists. Rounding goes through decimal.js — no
 * float artefacts like 0.1 + 0.2 in a displayed figure.
 */
import Decimal from 'decimal.js';

export const MASK = '••••••';
export const CURRENCY = 'Rs';

type Num = number | string | Decimal | null | undefined;

const toDec = (n: Num): Decimal | null => {
  if (n === null || n === undefined || n === '') return null;
  try {
    const d = new Decimal(String(n));
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
};

/** "1234567.5" → "1,234,567.50" (western grouping, like the web app and the plan's examples). */
export function group(n: Num, decimals = 0): string {
  const d = toDec(n);
  if (!d) return '0';
  const fixed = d.abs().toFixed(decimals, Decimal.ROUND_HALF_UP);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = d.isNegative() && !new Decimal(fixed).isZero() ? '-' : '';
  return `${sign}${grouped}${frac ? `.${frac}` : ''}`;
}

/**
 * Default money rule (plan §5): no decimals at or above Rs 10,000, two below — except whole-rupee amounts,
 * which never show `.00` (it is noise in a list: `Rs 8,200`, but `Rs 8,200.50`).
 */
export const autoDecimals = (n: Num) => {
  const d = toDec(n);
  if (!d) return 0;
  return d.abs().gte(10_000) || d.isInteger() ? 0 : 2;
};

export type MoneyOpts = { hidden?: boolean; decimals?: number; sign?: boolean; compact?: boolean };

/** `Rs 1,248,300` · `-Rs 12.50` · `+Rs 3,420` (sign) · `Rs 1.25M` (compact) · `Rs ••••••` (hidden). */
export function money(n: Num, { hidden = false, decimals, sign = false, compact = false }: MoneyOpts = {}): string {
  if (hidden) return `${CURRENCY} ${MASK}`;
  const d = toDec(n) ?? new Decimal(0);
  const places = decimals ?? autoDecimals(d);
  // Sign from the value as displayed: -0.001 shown with 2 decimals is "Rs 0.00", not "-Rs 0.00".
  const shown = compact ? d : new Decimal(d.toFixed(places, Decimal.ROUND_HALF_UP));
  const prefix = shown.isNegative() && !shown.isZero() ? '-' : sign && shown.gt(0) ? '+' : '';
  const body = compact ? compactNumber(d.abs()) : group(d.abs(), places);
  return `${prefix}${CURRENCY} ${body}`;
}

/** 1,250,000 → "1.25M"; 84,000 → "84K"; 950 → "950". */
export function compactNumber(n: Num): string {
  const d = toDec(n);
  if (!d) return '0';
  const a = d.abs();
  const unit = a.gte(1e9) ? ['B', 1e9] as const : a.gte(1e6) ? ['M', 1e6] as const : a.gte(1e3) ? ['K', 1e3] as const : null;
  if (!unit) return group(d, a.lt(100) && !a.isInteger() ? 2 : 0);
  const v = d.dividedBy(unit[1]);
  const s = v.abs().gte(100) ? v.toFixed(0) : v.abs().gte(10) ? v.toFixed(1) : v.toFixed(2);
  return `${s.replace(/\.?0+$/, '')}${unit[0]}`;
}

/** Percent with 2 decimals and an explicit sign: `+0.27%`, `-1.05%`, `0.00%`. */
export function pct(n: Num, { sign = true, decimals = 2 }: { sign?: boolean; decimals?: number } = {}): string {
  const d = toDec(n);
  if (!d) return '—';
  const s = d.toFixed(decimals, Decimal.ROUND_HALF_UP);
  const zero = new Decimal(s).isZero();
  return `${sign && d.gt(0) && !zero ? '+' : ''}${zero ? (0).toFixed(decimals) : s}%`;
}

/**
 * `+Rs 3,420 · +0.27%` — the change line under every hero (plan §5). Changes drop decimals from Rs 100 up
 * (less noise in a line read at a glance); smaller moves keep paisa so they don't round to nothing.
 */
export function delta(amount: Num, percent?: Num, opts: { hidden?: boolean } = {}): string {
  const d = toDec(amount);
  const a = money(amount, { sign: true, hidden: opts.hidden, decimals: d && d.abs().gte(100) ? 0 : 2 });
  return percent === undefined || percent === null ? a : `${a} · ${pct(percent)}`;
}

/** Direction of a figure for colouring: pos / neg / flat (changes under 0.005 count as flat). */
export function tone(n: Num): 'pos' | 'neg' | 'flat' {
  const d = toDec(n);
  if (!d || d.abs().lt(0.005)) return 'flat';
  return d.gt(0) ? 'pos' : 'neg';
}

/** Units/shares: up to 4 decimals, trailing zeros dropped. */
export function units(n: Num): string {
  const d = toDec(n);
  if (!d) return '0';
  return group(d, 4).replace(/\.?0+$/, '');
}

/** Percent of `part` in `whole` as a number with 2 decimals (null when whole is 0). */
export function share(part: Num, whole: Num): number | null {
  const p = toDec(part); const w = toDec(whole);
  if (!p || !w || w.isZero()) return null;
  return Number(p.dividedBy(w).times(100).toFixed(2));
}

/** Exact sum of money values (2 decimals) — never `a + b` on floats for figures we display. */
export function addMoney(...xs: Num[]): number {
  return Number(xs.reduce<Decimal>((s, x) => s.plus(toDec(x) ?? 0), new Decimal(0)).toFixed(2));
}

/** Percent change of `change` against the starting value `total − change` (null when that base is ≤ 0). */
export function changePct(change: Num, total: Num): number | null {
  const c = toDec(change); const t = toDec(total);
  if (!c || !t) return null;
  const base = t.minus(c);
  return base.lte(0) ? null : Number(c.dividedBy(base).times(100).toFixed(2));
}
