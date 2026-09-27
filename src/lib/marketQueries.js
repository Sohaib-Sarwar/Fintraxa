/**
 * React Query definitions for every market-data read in the app.
 *
 * One place owns the key, the fetcher and the staleness policy for each
 * dataset, because three things went wrong when call sites owned them:
 *
 *   - The same endpoint was cached under two keys (`psx-stocks` and
 *     `psx-stocks-live`), so it was fetched twice and the two copies drifted.
 *   - Some call sites asked for `{ limit: 5000 }` and others for no limit,
 *     which silently truncated the list that fed portfolio valuation.
 *   - staleTime was guessed per call site and bore no relation to how often
 *     the service actually republishes.
 *
 * Every key is prefixed `['psx', …]` or `['mufap', …]`, so a refresh can
 * invalidate one domain with a prefix match.
 *
 * Staleness is set from the publication schedule, not from habit. PSX is
 * scraped once per working day at 17:00 PKT, after the close; MUFAP hourly on
 * working evenings. Re-asking a CDN every five minutes for a file that moves
 * once a day is just noise, so the windows here are wide and `freshnessQuery`
 * — under a kilobyte — is what detects an early republish.
 */

import { psxAPI, mufapAPI, getFreshness } from './api';

/** Both datasets move at most hourly; the CDN copy is good for far longer. */
const DATASET_STALE_MS = 15 * 60 * 1000;
const DATASET_GC_MS = 24 * 60 * 60 * 1000;

/** The cheap poll that tells us whether anything moved. */
const FRESHNESS_STALE_MS = 5 * 60 * 1000;

const dataset = (key, queryFn) => ({
  queryKey: key,
  queryFn,
  staleTime: DATASET_STALE_MS,
  gcTime: DATASET_GC_MS,
});

// ─── PSX ────────────────────────────────────────

/**
 * The full 747-instrument universe. Deliberately unpaginated: this feeds
 * portfolio valuation, and a holding missing from a truncated page would be
 * valued at its purchase price without anything saying so.
 */
export const psxStocksQuery = () =>
  dataset(['psx', 'stocks'], ({ signal }) => psxAPI.getStocks({}, { signal }));

export const psxGainersQuery = (limit = 20) =>
  dataset(['psx', 'gainers', limit], ({ signal }) => psxAPI.getGainers(limit, { signal }));

export const psxLosersQuery = (limit = 20) =>
  dataset(['psx', 'losers', limit], ({ signal }) => psxAPI.getLosers(limit, { signal }));

export const psxActiveQuery = (limit = 20) =>
  dataset(['psx', 'active', limit], ({ signal }) => psxAPI.getActive(limit, { signal }));

export const psxIndicesQuery = () =>
  dataset(['psx', 'indices'], ({ signal }) => psxAPI.getIndices({}, { signal }));

export const psxSummaryQuery = () =>
  dataset(['psx', 'summary'], ({ signal }) => psxAPI.getSummary({ signal }));

export const psxMarketStatusQuery = () =>
  dataset(['psx', 'market-status'], ({ signal }) => psxAPI.getMarketStatus({ signal }));

export const psxSectorsQuery = () =>
  dataset(['psx', 'sectors'], ({ signal }) => psxAPI.getSectors({}, { signal }));

// ─── MUFAP ──────────────────────────────────────

/** All 553 funds. Same reasoning as the stock universe: no pagination. */
export const mufapFundsQuery = () =>
  dataset(['mufap', 'funds'], ({ signal }) => mufapAPI.getFunds({}, { signal }));

export const mufapCategoriesQuery = () =>
  dataset(['mufap', 'categories'], ({ signal }) => mufapAPI.getCategories({}, { signal }));

export const mufapStatsQuery = () =>
  dataset(['mufap', 'stats'], ({ signal }) => mufapAPI.getStats({ signal }));

export const mufapTopQuery = (period = 'ytd', limit = 50) =>
  dataset(['mufap', 'top', period, limit], ({ signal }) =>
    mufapAPI.getTop(period, limit, { signal }));

// ─── Freshness ──────────────────────────────────

/**
 * When each dataset was last fetched and when the next run is due. Poll this
 * rather than re-downloading a dataset to find out whether it changed.
 */
export const freshnessQuery = () => ({
  queryKey: ['market', 'freshness'],
  queryFn: ({ signal }) => getFreshness({ signal }),
  staleTime: FRESHNESS_STALE_MS,
  gcTime: DATASET_GC_MS,
});

// ─── Shared selectors ───────────────────────────

/**
 * symbol (upper-cased) → live record, for valuing holdings.
 *
 * Upper-casing on both sides is not cosmetic: `stock_transactions.symbol` is
 * whatever the user's broker statement said, and the service publishes the
 * exchange's own casing. Keying raw made lookups miss.
 */
export function stockPriceMap(payload) {
  const map = {};
  for (const s of payload?.data ?? []) {
    const key = String(s?.symbol ?? '').toUpperCase();
    if (key) map[key] = s;
  }
  return map;
}

/**
 * fund_name → the price a holding is worth today.
 *
 * Repurchase price, not NAV: repurchase is what the AMC actually pays on a
 * redemption, so it is what the holding is worth. NAV is the fallback for the
 * funds that publish no repurchase price.
 */
export function fundPriceMap(payload) {
  const map = {};
  for (const f of payload?.data ?? []) {
    if (f?.fund_name) map[f.fund_name] = f.repurchase_price || f.nav;
  }
  return map;
}

/** slug → full fund record, for looking a holding up by its stored `fund_id`. */
export function fundBySlug(payload) {
  const map = {};
  for (const f of payload?.data ?? []) {
    if (f?.slug) map[f.slug] = f;
  }
  return map;
}
