/**
 * Is market data current? The feed publishes each PSX session after the close and the
 * capture runs at 02:15 and 08:15 PKT, so by 08:30 on any day the previous weekday's
 * session should be stored. A feed counts as stale when it is two or more working days
 * behind that (one day of slack covers a market holiday).
 */

/** Today's date and hour in Pakistan (UTC+5, no daylight saving). */
export function pktNow(now = new Date()) {
  const t = new Date(now.getTime() + 5 * 3_600_000);
  return { date: t.toISOString().slice(0, 10), hour: t.getUTCHours() + t.getUTCMinutes() / 60 };
}

const isWeekday = (iso) => { const d = new Date(`${iso}T00:00:00Z`).getUTCDay(); return d !== 0 && d !== 6; };
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The newest session that should be stored by now. */
export function expectedSession(now = new Date()) {
  const { date, hour } = pktNow(now);
  // Before the morning capture, yesterday's session may not be in yet: look one day further back.
  let d = addDays(date, hour >= 8.5 ? -1 : -2);
  while (!isWeekday(d)) d = addDays(d, -1);
  return d;
}

/** Weekdays after `latest` up to and including `expected`. */
export function workingDaysBehind(latest, expected) {
  if (!latest) return Infinity;
  let n = 0;
  for (let d = addDays(latest, 1); d <= expected; d = addDays(d, 1)) if (isWeekday(d)) n += 1;
  return n;
}

const NAMES = { psx: 'PSX share prices', mufap: 'Mutual fund NAVs', psx_indices: 'KSE-100 index' };

/**
 * rows from public.market_feed_health() → the feeds that are behind, or [] when all is current.
 * [{ feed, name, latest, behind, error }]
 */
export function staleFeeds(rows, now = new Date()) {
  const expected = expectedSession(now);
  return (rows ?? []).map((r) => ({
    feed: r.feed, name: NAMES[r.feed] ?? r.feed, latest: r.latest_data ?? null,
    behind: workingDaysBehind(r.latest_data, expected), error: r.last_error ?? null,
  })).filter((f) => f.behind >= 2);
}
