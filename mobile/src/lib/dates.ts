/**
 * Calendar helpers on ISO `YYYY-MM-DD` strings in the phone's local day (Pakistan for our users — the same
 * rule as the web's `todayIso`, which deliberately avoids UTC's five-hour lag after midnight).
 * The web's src/lib/dateRange.js also holds a Zustand store, so its pure parts are mirrored here.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const isoLocal = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => isoLocal();
export const ALL_TIME_START = '2000-01-01';

const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number];
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();

export const monthOf = (iso: string) => iso.slice(0, 7);
export const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
export const firstDayOf = (month: string) => `${month}-01`;
export const lastDayOf = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${pad(daysIn(y, m))}`;
};
export const addDays = (iso: string, n: number) => {
  const [y, m, d] = parts(iso);
  return isoLocal(new Date(y, m - 1, d + n));
};
export const monthRange = (month: string) => ({ start: firstDayOf(month), end: lastDayOf(month) });

/** Fiscal (tax) year that a date falls in, by its starting calendar year: 2026-11-13 → 2026 (FY 2026-27). */
export const fyOf = (iso: string) => {
  const [y, m] = parts(iso);
  return m >= 7 ? y : y - 1;
};
export const fyRange = (y: number) => ({ start: `${y}-07-01`, end: `${y + 1}-06-30` });
export const fyLabel = (y: number) => `FY ${y}-${String(y + 1).slice(2)}`;

export const monthLabel = (month: string, long = false) => {
  const [y, m] = month.split('-').map(Number);
  return `${(long ? MONTH_LONG : MON)[m - 1]} ${y}`;
};

/** "13 Nov" (same year as today) or "13 Nov 2025". */
export function shortDate(iso: string | null | undefined, today = todayIso()): string {
  if (!iso) return '—';
  const [y, m, d] = parts(iso.slice(0, 10));
  return y === Number(today.slice(0, 4)) ? `${d} ${MON[m - 1]}` : `${d} ${MON[m - 1]} ${y}`;
}

/** "Today", "Yesterday", "Mon 10 Nov", "13 Oct 2025" — for transaction section headers. */
export function dayHeading(iso: string, today = todayIso()): string {
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = parts(iso);
  const dt = new Date(y, m - 1, d);
  const [ty, tm, td] = parts(today);
  const diff = Math.round((new Date(ty, tm - 1, td).getTime() - dt.getTime()) / 86_400_000);
  if (diff > 0 && diff < 7) return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()]} ${d} ${MON[m - 1]}`;
  return shortDate(iso, today);
}

/** "21:40" or "Tue 21:40" or "12 Nov, 21:40" for "as of" and "since you last looked" captions. */
export function timeAgoLabel(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay = isoLocal(d) === isoLocal(new Date(now));
  if (sameDay) return hm;
  if (now - ms < 6 * 86_400_000) return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${hm}`;
  return `${d.getDate()} ${MON[d.getMonth()]}, ${hm}`;
}

export function greeting(hour = new Date().getHours()) {
  return hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}
