/**
 * The "price stamp": which day a holding's price is for, where it came from and when it was fetched.
 * Shown when a price is hovered (web) or long-pressed (mobile). Shared by both apps (mobile: @core/market/priceStamp.js).
 *
 * Times are Pakistan time, worked out by hand (PKT is UTC+5 all year, no daylight saving) so the phone's
 * Intl support never matters.
 */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PKT = 5 * 3_600_000;

/** 'YYYY-MM-DD' → '20 Nov 2026'. */
export function stampDate(iso) {
  const s = String(iso ?? '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  return `${Number(s.slice(8, 10))} ${MON[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
}

/** ISO timestamp → '22 Nov 2026, 10:42 am PKT' (null when missing or unreadable). */
export function stampTime(ts) {
  const ms = Date.parse(String(ts ?? ''));
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + PKT);
  const h = d.getUTCHours(); const m = d.getUTCMinutes();
  const clock = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${clock} PKT`;
}

/** Short form for a sub-line: 'fetched today 10:42 am' / 'fetched 20 Nov, 8:01 pm'. */
export function fetchedShort(ts, now = Date.now()) {
  const ms = Date.parse(String(ts ?? ''));
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + PKT); const n = new Date(now + PKT);
  const h = d.getUTCHours(); const m = d.getUTCMinutes();
  const clock = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  const sameDay = d.toISOString().slice(0, 10) === n.toISOString().slice(0, 10);
  return sameDay ? `fetched today ${clock}` : `fetched ${d.getUTCDate()} ${MON[d.getUTCMonth()]}, ${clock}`;
}

/**
 * A stock position (analyzeStocks) → { title, rows: [[label, value]], note }.
 * priceSource: 'live' (the board, or a refreshed price when priceRefreshed), 'close' (a stored close), 'trade'.
 */
export function stockStamp(p) {
  if (!p || p.price === null || p.price === undefined) return null;
  const source = p.priceSource === 'live'
    ? (p.priceRefreshed ? 'PSX company page (price refresh)' : 'PSX market board (published daily after the close)')
    : p.priceSource === 'close' ? 'PSX closing price on file'
      : p.priceSource === 'trade' ? 'Your last trade price (no market price on file)' : 'Unknown';
  const rows = [
    ['Price for', stampDate(p.priceDate) ?? '—'],
    ['Fetched', p.priceSource === 'trade' ? 'Not fetched: taken from your trade' : (stampTime(p.priceFetchedAt) ?? 'Time not recorded')],
    ['Source', source],
  ];
  return { title: `${p.symbol ?? 'Stock'} · Rs ${Number(p.price).toFixed(2)}`, rows, note: stampNote(p.priceDate) };
}

/**
 * A fund price ({ value, date, source, kind, fetchedAt } from engine.js / profit.js) → { title, rows, note }.
 * source: 'mufap' | 'amc' (the fund manager's own page) | 'statement' | 'manual' …
 */
export function fundStamp(price, name = null) {
  if (!price) return null;
  const kind = price.kind === 'repurchase' ? 'Repurchase price' : 'NAV';
  const source = price.source === 'mufap' ? 'MUFAP (industry association)'
    : price.source === 'amc' ? 'The fund manager’s own website'
      : price.source === 'statement' ? 'Your account statement'
        : price.source ? String(price.source) : 'Unknown';
  const rows = [
    [`${kind} for`, stampDate(price.date) ?? '—'],
    ['Fetched', price.source === 'statement' ? 'Not fetched: printed on your statement' : (stampTime(price.fetchedAt) ?? 'Time not recorded')],
    ['Source', source],
  ];
  return { title: `${name ?? 'Fund'} · Rs ${Number(price.value).toFixed(4)}`, rows, note: stampNote(price.date) };
}

/** A plain warning when the price is for a day well behind today (PKT). */
function stampNote(date, now = Date.now()) {
  const ms = Date.parse(String(date ?? ''));
  if (!Number.isFinite(ms)) return null;
  const today = new Date(now + PKT).toISOString().slice(0, 10);
  const days = Math.round((Date.parse(today) - ms) / 86_400_000);
  return days > 4 ? `This price is ${days} days old.` : null;
}
