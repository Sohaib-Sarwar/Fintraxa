/**
 * One date range for the whole app (Home, Mutual Funds, PSX).
 *
 * Pakistan's fiscal year runs 1 July → 30 June and is labelled "FY 2026-27".
 * Presets are recomputed from today's date every time they are read, so a
 * saved "This fiscal year" choice rolls over on 1 July instead of freezing
 * the dates it was saved with. Only a custom range stores fixed dates.
 *
 * Dates are ISO strings (YYYY-MM-DD) in local time: a range is calendar days
 * the user sees, not instants.
 */
import { create } from 'zustand';

const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const isoLocal = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => isoLocal();

export const ym = (iso) => iso.slice(0, 7).split('-').map(Number);
const daysIn = (y, m) => new Date(y, m, 0).getDate();
export const addMonths = (month, n) => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const lastDayOf = (month) => { const [y, m] = month.split('-').map(Number); return `${month}-${pad(daysIn(y, m))}`; };
export const dayBefore = (iso) => { const [y, m, d] = iso.split('-').map(Number); return isoLocal(new Date(y, m - 1, d - 1)); };

export const fyOf = (iso) => { const [y, m] = ym(iso); return m >= 7 ? y : y - 1; };
export const fyLabel = (y) => `FY ${y}-${String(y + 1).slice(2)}`;
export const fyRange = (y) => ({ start: `${y}-07-01`, end: `${y + 1}-06-30` });

export const shortDate = (iso, withYear = true) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
};
export const monthLabel = (month) => { const [y, m] = month.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };

/** Earliest date "All time" can mean. Anything before real data is harmless. */
export const ALL_TIME_START = '2000-01-01';

/** @returns {{id:string,label:string,short:string,sub:string,start:string,end:string}[]} */
export function presets(today = todayIso()) {
  const fy = fyOf(today);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const mName = (m) => MONTHS[ym(m)[1] - 1];
  return [
    { id: 'fy', label: 'This fiscal year', short: fyLabel(fy), sub: `Jul ${fy} – Jun ${fy + 1}`, ...fyRange(fy) },
    { id: 'lfy', label: 'Last fiscal year', short: fyLabel(fy - 1), sub: `Jul ${fy - 1} – Jun ${fy}`, ...fyRange(fy - 1) },
    { id: 'ytd', label: 'Year to date', short: `YTD ${year}`, sub: `1 Jan ${year} – today`, start: `${year}-01-01`, end: today },
    { id: 'mtd', label: 'Month to date', short: `MTD ${mName(month)}`, sub: `1 ${mName(month)} – today`, start: `${month}-01`, end: today },
    { id: 'lm', label: 'Last month', short: monthLabel(addMonths(month, -1)), sub: monthLabel(addMonths(month, -1)), start: `${addMonths(month, -1)}-01`, end: lastDayOf(addMonths(month, -1)) },
    { id: 'l3', label: 'Last 3 months', short: 'Last 3 months', sub: `${mName(addMonths(month, -2))} – today`, start: `${addMonths(month, -2)}-01`, end: today },
    { id: 'l6', label: 'Last 6 months', short: 'Last 6 months', sub: `${mName(addMonths(month, -5))} – today`, start: `${addMonths(month, -5)}-01`, end: today },
    { id: 'all', label: 'All time', short: 'All time', sub: 'Everything recorded', start: ALL_TIME_START, end: today },
  ];
}

/** A stored choice → concrete dates for today. Unknown ids fall back to this FY. */
export function resolveRange(choice, today = todayIso()) {
  const list = presets(today);
  if (choice?.id === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(choice.start ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(choice.end ?? '') && choice.start <= choice.end) {
    return { id: 'custom', start: choice.start, end: choice.end };
  }
  const p = list.find((x) => x.id === choice?.id) ?? list[0];
  return { id: p.id, start: p.start, end: p.end };
}

export function rangeLabel(r, today = todayIso()) {
  const p = presets(today).find((x) => x.id === r.id);
  if (p) return p.short;
  return r.start.slice(0, 4) === r.end.slice(0, 4)
    ? `${shortDate(r.start, false)} – ${shortDate(r.end)}`
    : `${shortDate(r.start)} – ${shortDate(r.end)}`;
}

/** The part of the range that has happened: never later than today. */
export const effectiveEnd = (r, today = todayIso()) => (r.end < today ? r.end : today);

export const inRange = (iso, r) => !!iso && iso >= r.start && iso <= r.end;

const KEY = 'fx-range';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* preference only */ } };

/** Global range choice, remembered per browser. Default: this fiscal year. */
export const useRangeStore = create((set) => ({
  choice: read() ?? { id: 'fy' },
  setChoice: (choice) => { write(choice); set({ choice }); },
}));

/** Concrete { id, start, end } for the current choice. */
export function useDateRange() {
  const choice = useRangeStore((s) => s.choice);
  const setChoice = useRangeStore((s) => s.setChoice);
  return { range: resolveRange(choice), setRange: setChoice };
}
