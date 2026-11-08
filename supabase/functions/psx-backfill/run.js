/**
 * psx-backfill: fill missing PSX closes for held stocks from the exchange's per-day
 * market summaries. Pure helpers plus the run loop; the zip reader and fetch are
 * passed in, so the same code is unit-tested in Node (scripts/psx/backfill-function.test.mjs).
 *
 * Summary file rows: date|symbol|sector|name|open|high|low|close|volume|ldcp
 */

/** Closes for the wanted symbols from one summary's text: Map symbol → close. */
export function parseSummary(text, wanted) {
  const want = new Set([...wanted].map((s) => String(s).toUpperCase()));
  const out = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const p = line.split('|');
    if (p.length < 10) continue;
    const sym = p[1].trim().toUpperCase();
    if (!want.has(sym)) continue;
    const close = Number(p[7]);
    if (Number.isFinite(close) && close > 0) out.set(sym, close);
  }
  return out;
}

/** Work rows [{ symbol, day }] → Map day → Set of symbols, oldest day first. */
export function groupByDay(rows) {
  const byDay = new Map();
  for (const r of [...rows].sort((a, b) => String(a.day).localeCompare(String(b.day)))) {
    const d = String(r.day).slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, new Set());
    byDay.get(d).add(String(r.symbol).toUpperCase());
  }
  return byDay;
}

/**
 * Fetch each day's summary and collect closes. A day with no file (holiday) is
 * remembered as no_file; a read day remembers every symbol looked up, found or not
 * (a stock that did not trade that day is not looked up again).
 *
 * download(day) → Uint8Array | null (null: no file); unzip(bytes) → text
 * Stops early when `deadline` (ms timestamp) passes; the rest is picked up next run.
 */
export async function collect(work, { download, unzip, deadline = Infinity, pause = () => Promise.resolve() }) {
  const closes = []; const days = []; const failed = [];
  for (const [day, symbols] of groupByDay(work)) {
    if (Date.now() > deadline) break;
    let bytes;
    try { bytes = await download(day); } catch (e) { failed.push({ day, error: String(e?.message ?? e) }); continue; }
    if (!bytes) { days.push({ day, status: 'no_file', symbols: [] }); await pause(); continue; }
    let found;
    try { found = parseSummary(unzip(bytes), symbols); } catch (e) { failed.push({ day, error: `unreadable: ${e?.message ?? e}` }); continue; }
    for (const [symbol, close] of found) closes.push({ symbol, day, close });
    days.push({ day, status: 'loaded', symbols: [...symbols] });
    await pause();
  }
  return { closes, days, failed };
}
