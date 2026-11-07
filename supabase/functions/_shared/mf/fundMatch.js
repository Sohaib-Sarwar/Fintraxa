/**
 * Map a fund name as printed on a statement to the MUFAP fund that the live
 * price feed publishes, within the same AMC. Conservative: exact normalised
 * match, then strong token overlap; otherwise no match (the holding is then
 * valued from the statement's own prices and flagged).
 */

const AMC_OF_FEED = {
  atlas: /\batlas\b/i,
  mcb: /\bmcb\b/i,
  meezan: /\bmeezan\b/i,
  nbp: /\bnbp\b/i,
  ubl: /\bubl\b/i,
  hbl: /\bhbl\b/i,
  abl: /\babl\b/i,
  faysal: /\bfaysal\b/i,
  alfalah: /\balfalah\b/i,
};

export const normName = (s) => String(s ?? '').toLowerCase()
  .replace(/&/g, 'and')
  .replace(/\([a-z0-9]{2,8}\)/g, ' ')     // "(AMMF)"
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const tokens = (s) => new Set(normName(s).split(' ').filter((t) => t && !['the', 'of', 'fund'].includes(t)));

export const slugify = (name) =>
  String(name ?? 'other').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'other';

/**
 * @param {string} printedName
 * @param {string} amcCode
 * @param {{fund_name: string, amc: string, slug?: string, category?: string}[]} feed
 */
export function matchMufapFund(printedName, amcCode, feed) {
  const amcRe = AMC_OF_FEED[amcCode];
  const pool = (feed ?? []).filter((f) => f?.fund_name && (!amcRe || amcRe.test(f.amc ?? '')));
  const target = normName(printedName).replace(/\s+/g, '');
  const exact = pool.find((f) => normName(f.fund_name).replace(/\s+/g, '') === target);
  if (exact) return { ...pick(exact), score: 1 };

  const want = tokens(printedName);
  let best = null;
  for (const f of pool) {
    const have = tokens(f.fund_name);
    const inter = [...want].filter((t) => have.has(t)).length;
    const score = inter / new Set([...want, ...have]).size;
    if (!best || score > best.score) best = { f, score };
  }
  if (best && best.score >= 0.8) return { ...pick(best.f), score: Number(best.score.toFixed(3)) };
  return null;
}

const pick = (f) => ({ fund_name: f.fund_name, slug: f.slug || slugify(f.fund_name), category: f.category ?? null, amc: f.amc ?? null,
  nav: f.nav ?? null, repurchase_price: f.repurchase_price ?? null, validity_date: f.validity_date ?? null });
