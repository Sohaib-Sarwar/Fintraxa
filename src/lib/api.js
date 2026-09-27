/**
 * Market data client — PK Finance Unified Service.
 *
 * The service publishes static JSON to a CDN: GET only, no authentication,
 * CORS open to every origin, nothing rate limited. That shape drives three
 * decisions this module makes on the caller's behalf:
 *
 *   1. A static host cannot answer `?q=` or `?limit=`. Anything that used to
 *      be a query parameter is applied here, on the client, over the whole
 *      dataset. `applyQuery` is that logic.
 *
 *   2. Search runs against `search.json` — a 224 KB index (~22 KB gzipped) of
 *      identifier, label and grouping for all 1,300 instruments and funds,
 *      with no prices. It is what the service publishes *instead of* a search
 *      endpoint.
 *
 *   3. Datasets change a few times a day on a published schedule, not per
 *      request. `freshness.json` is under a kilobyte and says when each one
 *      last moved — poll that rather than re-downloading a dataset to find
 *      out whether it changed.
 *
 * Every dataset response carries the same envelope:
 *   { count, total_filtered, total, offset, limit, freshness, data }
 * Single-record responses carry { freshness, data }. `fetchJSON` returns the
 * envelope intact so callers can read `freshness`; `unwrap` takes just `data`.
 */

const DEFAULT_BASE = 'https://sohaib-sarwar.github.io/PSX-MUFAP-MicroService/api';

// Optional-chained so the module also loads outside Vite — `import.meta.env` is
// undefined under plain Node, and the unit tests import this file directly.
const API_BASE = String(import.meta.env?.VITE_API_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');

// health.json and ready.json sit beside the dashboard, one level above /api.
const SITE_BASE = API_BASE.replace(/\/api$/, '');

const REQUEST_TIMEOUT_MS = 15_000;

// A dataset is republished a handful of times a day. Holding the in-flight
// promise for a minute collapses the burst of parallel calls that a dashboard
// mount produces — six widgets asking for psx/stocks.json become one request.
// React Query caches the *results*; this dedupes the *requests* beneath it.
const INFLIGHT_TTL_MS = 60_000;

// ─── Errors ─────────────────────────────────────

export class APIError extends Error {
  constructor(message, { status = 0, path = '', cause = undefined } = {}) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.path = path;
    if (cause) this.cause = cause;
  }

  /** A 404 on a `{symbol}`/`{slug}` path means "no such record", not an outage. */
  get isNotFound() {
    return this.status === 404;
  }

  /** Nothing reached the server — offline, DNS, CORS, or the request timed out. */
  get isOffline() {
    return this.status === 0;
  }
}

// ─── Transport ──────────────────────────────────

const inflight = new Map();

async function request(url, { signal, timeout = REQUEST_TIMEOUT_MS, path = url } = {}) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeout);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      // No credentials: this origin is public and sending cookies to it would
      // only trip CORS.
      credentials: 'omit',
    });

    if (!res.ok) {
      throw new APIError(
        res.status === 404
          ? `Not found: ${path}`
          : `Service returned ${res.status} for ${path}`,
        { status: res.status, path },
      );
    }
    return await res.json();
  } catch (err) {
    if (err instanceof APIError) throw err;
    // The caller's own abort is not a service failure — let it through as-is
    // so React Query treats it as a cancellation rather than an error.
    if (signal?.aborted) throw err;
    if (err?.name === 'AbortError') {
      throw new APIError(`Request timed out: ${path}`, { status: 0, path, cause: err });
    }
    throw new APIError(`Could not reach the market data service`, {
      status: 0,
      path,
      cause: err,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Fetch one published file, returning its envelope whole.
 *
 * Concurrent calls for the same path share one request. A caller's `signal`
 * aborts that caller's await, never the shared request — cancelling one
 * widget must not blank the five others reading the same dataset.
 */
export function fetchJSON(path, { signal } = {}) {
  const clean = String(path).replace(/^\/+/, '');
  const url = `${API_BASE}/${clean}`;

  const cached = inflight.get(url);
  if (cached && Date.now() - cached.at < INFLIGHT_TTL_MS) {
    return signal ? raceAbort(cached.promise, signal) : cached.promise;
  }

  const promise = request(url, { path: clean }).catch((err) => {
    // A failure must not be cached, or one offline moment poisons the next
    // minute of retries.
    inflight.delete(url);
    throw err;
  });
  inflight.set(url, { promise, at: Date.now() });

  return signal ? raceAbort(promise, signal) : promise;
}

function raceAbort(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () =>
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Drop the envelope and return just the records. */
export const unwrap = (payload) => payload?.data ?? payload;

/** Clear the request-dedupe window — used by pull-to-refresh. */
export function invalidateCache() {
  inflight.clear();
}

// ─── Slugs ──────────────────────────────────────

/**
 * Mirrors `slugify` in the service's build_static_api.py. Slugs are published
 * on every row that has an addressable endpoint, so prefer `row.slug` and use
 * this only when all you hold is a display name.
 */
export const slugify = (name) =>
  String(name ?? 'other')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'other';

// ─── Client-side query ──────────────────────────

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Filter, sort and paginate a dataset the way the old query-parameter API did.
 *
 * Supported options: `search` (substring over `searchFields`), `sortBy`/`order`,
 * `limit`/`offset`, and any other key, which is matched for equality against
 * the field of that name — case-insensitively for strings, and against array
 * membership for fields like `indices`.
 *
 * Returns an envelope of the same shape the service publishes, so a filtered
 * result and a raw one are interchangeable to a caller.
 */
export function applyQuery(payload, options = {}, searchFields = []) {
  const rows = Array.isArray(unwrap(payload)) ? unwrap(payload) : [];
  const { search, sortBy, order = 'desc', limit, offset = 0, ...filters } = options ?? {};

  let out = rows;

  for (const [field, wanted] of Object.entries(filters)) {
    if (wanted === undefined || wanted === null || wanted === '') continue;
    const needle = String(wanted).toLowerCase();
    out = out.filter((row) => {
      const value = row?.[field];
      if (Array.isArray(value)) return value.some((v) => String(v).toLowerCase() === needle);
      if (typeof value === 'boolean') return value === (needle === 'true');
      return String(value ?? '').toLowerCase() === needle;
    });
  }

  if (search && searchFields.length) {
    const needle = String(search).toLowerCase().trim();
    if (needle) {
      out = out.filter((row) =>
        searchFields.some((f) => String(row?.[f] ?? '').toLowerCase().includes(needle)),
      );
    }
  }

  if (sortBy) {
    const dir = String(order).toLowerCase() === 'asc' ? 1 : -1;
    // Copy before sorting: `out` may still be the cached array behind the
    // shared promise, and sorting in place would corrupt it for every other
    // caller of the same dataset.
    out = [...out].sort((a, b) => {
      const av = a?.[sortBy];
      const bv = b?.[sortBy];
      const an = num(av);
      const bn = num(bv);
      // Missing values sort last whichever way the column is pointing, so a
      // "top by P/E" list never opens with a row that has no P/E.
      if (an === null && bn === null) return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
      if (an === null) return 1;
      if (bn === null) return -1;
      return (an - bn) * dir;
    });
  }

  const totalFiltered = out.length;
  const start = Math.max(0, Number(offset) || 0);
  const end = limit == null ? undefined : start + Math.max(0, Number(limit) || 0);
  const page = out.slice(start, end);

  return {
    count: page.length,
    total_filtered: totalFiltered,
    total: payload?.total ?? rows.length,
    offset: start,
    limit: limit ?? null,
    freshness: payload?.freshness ?? null,
    data: page,
  };
}

const STOCK_SEARCH_FIELDS = ['symbol', 'name', 'sector'];
const FUND_SEARCH_FIELDS = ['fund_name', 'amc', 'category'];

// ─── PSX Stocks ─────────────────────────────────

const PSX_TOP_METRICS = new Set([
  'market-cap',
  'dividend-yield',
  'pe-ratio',
  'yearly-gainers',
]);

export const psxAPI = {
  /** Service info, dataset counts and the refresh schedule. */
  getInfo: (opts) => fetchJSON('psx/index.json', opts),

  /**
   * The full PSX universe, ordered by market cap.
   *
   * Every record: symbol, name, sector, sector_code, indices, flags, current,
   * change, change_pct, change_1y_pct, market_cap, pe_ratio, dividend_yield,
   * free_float, volume_30d_avg, has_quote, is_etf, is_debt — plus ldcp, open,
   * high, low, volume and traded when `has_quote` is true.
   */
  getStocks: async (params = {}, opts) =>
    applyQuery(await fetchJSON('psx/stocks.json', opts), params, STOCK_SEARCH_FIELDS),

  /** One instrument by ticker. Throws an APIError with `isNotFound` if unlisted. */
  getStock: async (symbol, opts) => {
    const key = String(symbol ?? '').trim().toLowerCase();
    if (!key) throw new APIError('A symbol is required', { status: 400, path: 'psx/stocks' });
    return unwrap(await fetchJSON(`psx/stocks/${encodeURIComponent(key)}.json`, opts));
  },

  /** Substring match on symbol, name or sector, over the full universe. */
  searchStocks: async (query, opts) =>
    applyQuery(
      await fetchJSON('psx/stocks.json', opts),
      { search: query, limit: 50 },
      STOCK_SEARCH_FIELDS,
    ),

  getGainers: async (limit = 20, opts) =>
    applyQuery(await fetchJSON('psx/stocks/gainers.json', opts), { limit }),

  getLosers: async (limit = 20, opts) =>
    applyQuery(await fetchJSON('psx/stocks/losers.json', opts), { limit }),

  /**
   * Most active by 30-day average volume — which is what the exchange's
   * screener publishes now that per-session volume is no longer served in bulk.
   */
  getActive: async (limit = 20, opts) =>
    applyQuery(await fetchJSON('psx/stocks/active.json', opts), { limit }),

  /**
   * Only the instruments carrying today's LDCP, open, high, low and session
   * volume. PSX withdrew the bulk quote feed, so this set is bounded (~120).
   */
  getQuoted: async (params = {}, opts) =>
    applyQuery(await fetchJSON('psx/stocks/quoted.json', opts), params, STOCK_SEARCH_FIELDS),

  /**
   * A ranked board. `metric` is one of market-cap, dividend-yield, pe-ratio
   * or yearly-gainers.
   */
  getTop: async (metric, limit = 50, opts) => {
    if (!PSX_TOP_METRICS.has(metric)) {
      throw new APIError(`Unknown PSX ranking "${metric}"`, {
        status: 400,
        path: 'psx/stocks/top',
      });
    }
    return applyQuery(await fetchJSON(`psx/stocks/top/${metric}.json`, opts), { limit });
  },

  /** Market breadth and session totals, from the exchange's own header. */
  getSummary: async (opts) => unwrap(await fetchJSON('psx/stocks/summary.json', opts)),

  /** Per-sector counts, breadth, combined market cap and average move. */
  getSectors: async (params = {}, opts) =>
    applyQuery(await fetchJSON('psx/sectors.json', opts), params, ['sector']),

  /** Every instrument in one sector. `slug` comes from `getSectors()`. */
  getSectorStocks: async (slug, params = {}, opts) =>
    applyQuery(
      await fetchJSON(`psx/sectors/${encodeURIComponent(slugify(slug))}.json`, opts),
      params,
      STOCK_SEARCH_FIELDS,
    ),

  /** KSE100, KSE30, KMI30, ALLSHR and the rest, with session high, low, change. */
  getIndices: async (params = {}, opts) =>
    applyQuery(await fetchJSON('psx/indices.json', opts), params, ['index_name']),

  /** Constituents of one index, largest first. e.g. `getIndexStocks('KSE100')`. */
  getIndexStocks: async (name, params = {}, opts) =>
    applyQuery(
      await fetchJSON(`psx/indices/${encodeURIComponent(slugify(name))}.json`, opts),
      params,
      STOCK_SEARCH_FIELDS,
    ),

  /**
   * Whether PSX was trading when the snapshot was taken, per market segment.
   * Read from the exchange's own panel, not inferred from a clock.
   */
  getMarketStatus: async (opts) => unwrap(await fetchJSON('psx/market-status.json', opts)),

  /** Trades, volume and value per market segment, plus exchange-wide totals. */
  getSession: async (params = {}, opts) =>
    applyQuery(await fetchJSON('psx/session.json', opts), params, ['market']),
};

// ─── MUFAP Mutual Funds ─────────────────────────

const MUFAP_PERIODS = new Set([
  'ytd', 'mtd', 'd1', 'd15', 'd30', 'd90', 'd180', 'd270', 'd365', 'y2', 'y3',
]);

export const mufapAPI = {
  /** Service info, fund/category/AMC counts and the refresh schedule. */
  getInfo: (opts) => fetchJSON('mufap/index.json', opts),

  /**
   * The whole MUFAP daily statistics table, sorted by name.
   *
   * Every record: fund_name, slug, category, sector, amc, trustee, rating,
   * benchmark, nav, offer_price, repurchase_price, market_price,
   * front_end_load, back_end_load, contingent_load, inception_date,
   * validity_date, return_basis, and `returns` — an object keyed by period
   * (ytd, mtd, d1, d15, d30, d90, d180, d270, d365, y2, y3).
   */
  getFunds: async (params = {}, opts) =>
    applyQuery(await fetchJSON('mufap/funds.json', opts), params, FUND_SEARCH_FIELDS),

  /** One fund by slug. Slugs are on every row of `getFunds()` and the search index. */
  getFund: async (slug, opts) => {
    const key = slugify(slug);
    if (!key || key === 'other') {
      throw new APIError('A fund slug is required', { status: 400, path: 'mufap/fund' });
    }
    return unwrap(await fetchJSON(`mufap/fund/${encodeURIComponent(key)}.json`, opts));
  },

  /** Substring match on fund name, AMC or category. */
  searchFunds: async (query, opts) =>
    applyQuery(
      await fetchJSON('mufap/funds.json', opts),
      { search: query, limit: 50 },
      FUND_SEARCH_FIELDS,
    ),

  /** Every category with its fund count and the slug addressing it. */
  getCategories: async (params = {}, opts) =>
    applyQuery(await fetchJSON('mufap/funds/categories.json', opts), params, ['category']),

  /** Every fund in one category. `slug` comes from `getCategories()`. */
  getFundsByCategory: async (slug, params = {}, opts) =>
    applyQuery(
      await fetchJSON(`mufap/funds/category/${encodeURIComponent(slugify(slug))}.json`, opts),
      params,
      FUND_SEARCH_FIELDS,
    ),

  /** Every asset management company with fund count and categories operated. */
  getAMCs: async (params = {}, opts) =>
    applyQuery(await fetchJSON('mufap/funds/amcs.json', opts), params, ['amc']),

  /** Every fund managed by one company. `slug` comes from `getAMCs()`. */
  getFundsByAMC: async (slug, params = {}, opts) =>
    applyQuery(
      await fetchJSON(`mufap/funds/amc/${encodeURIComponent(slugify(slug))}.json`, opts),
      params,
      FUND_SEARCH_FIELDS,
    ),

  /** Every published stability rating with the number of funds carrying it. */
  getRatings: async (opts) => applyQuery(await fetchJSON('mufap/funds/ratings.json', opts)),

  /** Every trustee institution with the number of funds it holds. */
  getTrustees: async (opts) => applyQuery(await fetchJSON('mufap/funds/trustees.json', opts)),

  /** Industry aggregates: counts, and mean/median/min/max NAV and YTD return. */
  getStats: async (opts) => unwrap(await fetchJSON('mufap/funds/stats.json', opts)),

  /** Highest NAV funds. The service has no top-nav file; this sorts the table. */
  getTopNav: async (limit = 10, opts) =>
    applyQuery(await fetchJSON('mufap/funds.json', opts), {
      sortBy: 'nav',
      order: 'desc',
      limit,
    }),

  /** Best performers over one return period. */
  getTop: async (period = 'ytd', limit = 50, opts) => {
    if (!MUFAP_PERIODS.has(period)) {
      throw new APIError(`Unknown return period "${period}"`, {
        status: 400,
        path: 'mufap/funds/top',
      });
    }
    return applyQuery(await fetchJSON(`mufap/funds/top/${period}.json`, opts), { limit });
  },

  /** Weakest performers over one return period. */
  getBottom: async (period = 'ytd', limit = 50, opts) => {
    if (!MUFAP_PERIODS.has(period)) {
      throw new APIError(`Unknown return period "${period}"`, {
        status: 400,
        path: 'mufap/funds/bottom',
      });
    }
    return applyQuery(await fetchJSON(`mufap/funds/bottom/${period}.json`, opts), { limit });
  },
};

// ─── Search ─────────────────────────────────────

/**
 * Search both domains at once against the published search index.
 *
 * Each hit: { type: 'stock' | 'fund', id, label, group, issuer, active,
 * endpoint } — where `endpoint` is the path to the full record. No prices or
 * returns; fetch the endpoint for those.
 */
export async function searchAll(query, { type, limit = 25, ...opts } = {}) {
  const needle = String(query ?? '').toLowerCase().trim();
  if (!needle) return [];

  const rows = unwrap(await fetchJSON('search.json', opts));
  if (!Array.isArray(rows)) return [];

  const scored = [];
  for (const row of rows) {
    if (type && row?.type !== type) continue;
    const id = String(row?.id ?? '').toLowerCase();
    const label = String(row?.label ?? '').toLowerCase();
    // Rank exact ticker first, then prefix, then anything containing the term:
    // typing "ogdc" should not surface a fund whose name merely includes it.
    let score;
    if (id === needle) score = 0;
    else if (id.startsWith(needle)) score = 1;
    else if (label.startsWith(needle)) score = 2;
    else if (label.includes(needle) || id.includes(needle)) score = 3;
    else continue;
    scored.push({ score, row });
  }

  scored.sort((a, b) => a.score - b.score || String(a.row.label).localeCompare(String(b.row.label)));
  return scored.slice(0, limit).map((s) => s.row);
}

// ─── Freshness & health ─────────────────────────

/**
 * When each dataset was last fetched, what the source dates it, when the next
 * run is due and how many records it holds. Under a kilobyte — poll this
 * instead of re-downloading a dataset to find out whether it changed.
 */
export const getFreshness = (opts) => fetchJSON('freshness.json', opts);

/** Liveness of the published site. */
export const getAPIHealth = async ({ signal } = {}) =>
  request(`${SITE_BASE}/health.json`, { signal, path: 'health.json' });

/** Readiness — whether the published snapshots are current enough to serve. */
export const getAPIReady = async ({ signal } = {}) =>
  request(`${SITE_BASE}/ready.json`, { signal, path: 'ready.json' });

/**
 * True when a dataset is old enough that the UI should say so rather than
 * present its numbers as current. The envelope's own `state` is authoritative:
 * the service knows its schedule and the market calendar, and a weekend is not
 * a failure.
 */
export const isStale = (freshness) =>
  Boolean(freshness) && freshness.state !== 'fresh';

export { API_BASE };
