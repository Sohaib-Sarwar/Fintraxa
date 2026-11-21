/**
 * Fund managers whose price pages sit behind a Cloudflare bot challenge (MCB / Alhamra, owner 2026-11-22: "MCB is
 * mandatory"). We don't get past bot protection ourselves: Gemini's URL-context tool has Google's fetcher (a crawler
 * these sites admit) read the manager's OWN official page, and we keep only the NAV and its date, after checks:
 *   - two independent reads must give the same NAV and date (a misread is caught by disagreement);
 *   - the date is recent: at most 10 days old, at most 5 days ahead (money-market NAVs are forward-dated);
 *   - the NAV is within 5% (money market) / 15% (others) of the last price on file, when there is one.
 * Offer / redemption are never taken from the model (it once echoed the NAV as the offer). AI never estimates.
 * Plain JS, shared with the Node tests (scripts/psx/refresh-prices.test.mjs).
 */

/** Managers read this way: MUFAP's/Fintraxa's manager name → its official daily-price page. */
export const READ_VIA_AI = {
  'MCB Investment Management Limited': { id: 'mcb', url: 'https://www.mcbfunds.com/daily-funds-mobile/' },
};

export const AI_MODEL = 'gemini-3.5-flash-lite';
const DAY = 86_400_000;

/** The prompt: read the page, return only what is printed, never guess. */
export function readerPrompt(url, names) {
  return [
    `Open ${url} (the fund manager's official daily fund prices page) and read its price table.`,
    'For each fund below, copy exactly what the page prints for the NAV (net asset value per unit) and the date that NAV',
    'applies to (the price / validity date column). Funds may be listed once per unit class; the NAV is the same.',
    'Do not use any other website, do not calculate, round or estimate. If the page could not be opened or a fund is',
    'not on it, use null for that fund.',
    'Funds:',
    ...names.map((n, i) => `${i + 1}. ${n}`),
    'Answer with JSON only, no prose, exactly: {"page_read": true|false, "funds": [{"fund": "<name as listed above>", "nav": <number|null>, "date": "YYYY-MM-DD"|null}]}',
  ].join('\n');
}

/** The JSON object in a model answer (it may be wrapped in a ```json fence). */
export function parseReader(text) {
  const s = String(text ?? '');
  const i = s.indexOf('{'); const j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; }
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

/**
 * Two reads → accepted rows. `last`: Map<normalised fund name, { price, category }> of the last price on file.
 * → [{ name, validity_date, price, kind: 'nav', nav }] for the funds both reads agree on and that pass the checks.
 */
export function acceptReads(a, b, names, { today = new Date().toISOString().slice(0, 10), last = new Map() } = {}) {
  if (!a?.funds || !b?.funds || a.page_read === false || b.page_read === false) return [];
  const pick = (r, n) => r.funds.find((f) => norm(f.fund) === norm(n));
  const t = Date.parse(today);
  const out = [];
  for (const name of names) {
    const x = pick(a, name); const y = pick(b, name);
    const nav = Number(x?.nav); const date = x?.date;
    if (!(nav > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) continue;
    if (Number(y?.nav) !== nav || y?.date !== date) continue; // the two reads must agree exactly
    const age = (t - Date.parse(date)) / DAY;
    if (age > 10 || age < -5) continue;
    const prev = last.get(norm(name));
    if (prev?.price > 0) {
      const band = /money market|cash|liquid/i.test(`${prev.category ?? ''} ${name}`) ? 0.05 : 0.15;
      if (Math.abs(nav - prev.price) / prev.price > band) continue;
    }
    out.push({ name, validity_date: date, price: nav, kind: 'nav', nav });
  }
  return out;
}

/**
 * Read the held funds of the managers in READ_VIA_AI. `generate(prompt) → Promise<string>` calls the model with the
 * URL-context tool (index.ts); it is passed in so tests can stand in for it.
 * → { managers: [{ amc, id, status, matched, url, error? }], funds: [{ ...row, amc, source_url }] }
 */
export async function readManagersViaAi(funds, { generate, today, last } = {}) {
  const byAmc = new Map();
  for (const f of funds) if (READ_VIA_AI[f.amc]) byAmc.set(f.amc, [...(byAmc.get(f.amc) ?? []), f.name]);
  const managers = []; const found = [];
  if (!generate) return { managers, funds: found };
  await Promise.all([...byAmc].map(async ([amc, names]) => {
    const def = READ_VIA_AI[amc];
    try {
      const prompt = readerPrompt(def.url, names);
      const [ra, rb] = await Promise.all([generate(prompt), generate(prompt)]);
      const rows = acceptReads(parseReader(ra), parseReader(rb), names, { today, last });
      managers.push({ amc, id: def.id, status: 'ok', via: 'gemini_url_context', url: def.url, matched: rows.length, requested: names.length });
      for (const r of rows) found.push({ ...r, amc, source_url: def.url });
    } catch (error) {
      managers.push({ amc, id: def.id, status: 'unavailable', via: 'gemini_url_context', url: def.url, error: String(error?.message ?? error).slice(0, 200) });
    }
  }));
  return { managers, funds: found };
}
