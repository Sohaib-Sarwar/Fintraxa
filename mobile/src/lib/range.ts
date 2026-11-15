/**
 * One period for the whole app (owner, 2026-11-14: the FY button on every money page) — the pure parts of the
 * web's `src/lib/dateRange.js`, mirrored with the same ids, dates and labels so both apps agree. Presets are
 * recomputed from today on every read (a saved "This fiscal year" rolls over on 1 July); only a custom range
 * stores fixed dates. Pakistan's fiscal year runs 1 July → 30 June ("FY 2026-27").
 */
import { addMonths, ALL_TIME_START, fyLabel, fyOf, fyRange, lastDayOf, todayIso } from './dates';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ym = (iso: string) => iso.slice(0, 7).split('-').map(Number) as [number, number];
const mName = (month: string) => MON[ym(month)[1] - 1];
const monthLabel = (month: string) => `${mName(month)} ${month.slice(0, 4)}`;
const shortDate = (iso: string, withYear = true) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MON[m - 1]}${withYear ? ` ${y}` : ''}`;
};

export type RangeId = 'fy' | 'lfy' | 'ytd' | 'mtd' | 'lm' | 'l3' | 'l6' | 'all' | 'custom';
export type RangeChoice = { id: RangeId; start?: string; end?: string };
export type Range = { id: RangeId; start: string; end: string };
export type Preset = Range & { label: string; short: string; sub: string };

export function presets(today = todayIso()): Preset[] {
  const fy = fyOf(today);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const lm = addMonths(month, -1);
  return [
    { id: 'fy', label: 'This fiscal year', short: fyLabel(fy), sub: `Jul ${fy} – Jun ${fy + 1}`, ...fyRange(fy) },
    { id: 'lfy', label: 'Last fiscal year', short: fyLabel(fy - 1), sub: `Jul ${fy - 1} – Jun ${fy}`, ...fyRange(fy - 1) },
    { id: 'ytd', label: 'Year to date', short: `YTD ${year}`, sub: `1 Jan ${year} – today`, start: `${year}-01-01`, end: today },
    { id: 'mtd', label: 'Month to date', short: `MTD ${mName(month)}`, sub: `1 ${mName(month)} – today`, start: `${month}-01`, end: today },
    { id: 'lm', label: 'Last month', short: monthLabel(lm), sub: monthLabel(lm), start: `${lm}-01`, end: lastDayOf(lm) },
    { id: 'l3', label: 'Last 3 months', short: 'Last 3 months', sub: `${mName(addMonths(month, -2))} – today`, start: `${addMonths(month, -2)}-01`, end: today },
    { id: 'l6', label: 'Last 6 months', short: 'Last 6 months', sub: `${mName(addMonths(month, -5))} – today`, start: `${addMonths(month, -5)}-01`, end: today },
    { id: 'all', label: 'All time', short: 'All time', sub: 'Everything recorded', start: ALL_TIME_START, end: today },
  ];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A stored choice → concrete dates for today. Unknown ids fall back to this fiscal year. */
export function resolveRange(choice: RangeChoice | null | undefined, today = todayIso()): Range {
  if (choice?.id === 'custom' && ISO.test(choice.start ?? '') && ISO.test(choice.end ?? '') && choice.start! <= choice.end!) {
    return { id: 'custom', start: choice.start!, end: choice.end! };
  }
  const list = presets(today);
  const p = list.find((x) => x.id === choice?.id) ?? list[0];
  return { id: p.id, start: p.start, end: p.end };
}

/** The button label: the preset's short name, or "12 Jul – 14 Nov 2026" for a custom range. */
export function rangeLabel(r: Range, today = todayIso()): string {
  const p = presets(today).find((x) => x.id === r.id);
  if (p) return p.short;
  return r.start.slice(0, 4) === r.end.slice(0, 4) ? `${shortDate(r.start, false)} – ${shortDate(r.end)}` : `${shortDate(r.start)} – ${shortDate(r.end)}`;
}

/**
 * The period button's text (owner, 2026-11-15: the top-right range was "still buggy" — long custom dates wrapped or
 * were cut): presets as their short name; custom ranges without the current year ("2 Mar – 9 May"), another single
 * year once at the end ("2 Mar – 9 May ’25"), across years by month ("Dec ’25 – Jan ’26"), one day as "9 May".
 */
export function rangePillLabel(r: Range, today = todayIso()): string {
  const p = presets(today).find((x) => x.id === r.id);
  if (p) return p.short;
  const [sy, sm] = ym(r.start);
  const [ey, em] = ym(r.end);
  const yy = (y: number) => `’${String(y).slice(2)}`;
  const thisYear = Number(today.slice(0, 4));
  if (r.start === r.end) return `${shortDate(r.start, false)}${sy === thisYear ? '' : ` ${yy(sy)}`}`;
  if (sy !== ey) return `${MON[sm - 1]} ${yy(sy)} – ${MON[em - 1]} ${yy(ey)}`;
  return `${shortDate(r.start, false)} – ${shortDate(r.end, false)}${sy === thisYear ? '' : ` ${yy(sy)}`}`;
}

/** The part of the range that has happened: never later than today. */
export const effectiveEnd = (r: Range, today = todayIso()) => (r.end < today ? r.end : today);

/**
 * Month keys a chart shows for the range: from its first month to the month it effectively ends, the most
 * recent `max` of them ("All time" shows the last 12 months).
 */
export function rangeMonths(r: Range, today = todayIso(), max = 12): string[] {
  const last = effectiveEnd(r, today).slice(0, 7);
  const out: string[] = [];
  for (let m = last; m >= r.start.slice(0, 7) && out.length < max; m = addMonths(m, -1)) out.push(m);
  return out.reverse();
}
