/**
 * refresh-prices: latest prices for held stocks and funds, now.
 *
 *   1. what is held (market_refresh_targets: stocks with shares, funds with units) — one user's
 *      holdings when a user taps Refresh, everyone's when the schedule runs it (userId null)
 *   2. the market-data worker's POST /v1/quotes, in parallel:
 *        psx            one company page per held symbol
 *        mufap tab=1/3  only the held funds' rows of MUFAP's two tables
 *        amc            the held funds' rows of their managers' own price pages (UBL, Meezan, …)
 *   3. per fund, the newest price of the three (MUFAP wins a tie: it is the industry reference)
 *   4. market_refresh_save → psx_price_history / mf_nav_history, which every page reads
 *   5. the run, logged in market_refresh_runs, with each step's timing
 *
 * MUFAP has been refusing datacenter addresses with a Cloudflare challenge. MUFAP's table is
 * compiled from what each fund manager reports, and the managers publish the same prices on
 * their own websites, usually hours earlier; so a fund's price no longer depends on MUFAP
 * answering. A fund whose manager is not in the worker's registry still waits for MUFAP.
 *
 * Holdings are worked out at every run from the trades and the ledger, so a stock or fund bought
 * later is included and one sold out is not. A fund is looked up by the exact name, category and
 * manager its MUFAP link (mf_funds.mufap_slug) has in the published fund list, not by the name
 * Fintraxa stores, which can be a statement's spelling.
 *
 * Every step is sent to the caller as it happens (one JSON object per line), so Settings can show
 * the progress live. Plain JS, shared with the Node tests (scripts/psx/refresh-prices.test.mjs).
 */

export const STALE_RUN_MS = 2 * 60_000;    // a "running" row older than this was abandoned
export const MIN_GAP_MS = 20_000;          // one refresh per user per 20 s
export const BATCH = 40;                   // the worker's per-request cap

/** Newest NAV of a fund across MUFAP's tab=1 (NAV) and tab=3 (prices) rows; see app/mufap/parsers.py. */
export function pickFund(t1, t3) {
  if (!t1 && !t3) return null;
  const d1 = t1?.validity_date ?? null; const d3 = t3?.validity_date ?? null;
  const useT3 = t3 && (!t1 || (d3 && (!d1 || d3 > d1)));
  const date = useT3 ? d3 : d1;
  const nav = useT3 ? t3.nav : t1.nav;
  // The repurchase price is what a holding is worth, but only when it is for that same day.
  const repurchase = t3 && d3 === date ? t3.repurchase_price : null;
  return { nav_date: date, price: repurchase || nav, kind: repurchase ? 'repurchase' : 'nav', nav, source: 'mufap' };
}

/** MUFAP's pick, or the manager's own price when it is for a later day (or MUFAP has none). */
export function pickNewest(mufap, amc) {
  const fromAmc = amc?.validity_date && amc.price > 0
    ? { nav_date: amc.validity_date, price: amc.price, kind: amc.kind === 'repurchase' ? 'repurchase' : 'nav', nav: amc.nav ?? amc.price, source: 'amc', source_url: amc.source_url ?? null }
    : null;
  if (!mufap?.nav_date) return fromAmc ?? mufap ?? null;
  if (!fromAmc) return mufap;
  return fromAmc.nav_date > mufap.nav_date ? fromAmc : mufap;
}

const fundKey = (name, category) => `${String(name ?? '').trim().toLowerCase()}|${String(category ?? '').trim().toLowerCase()}`;
/** The worker's fundNorm: "Al-Ameen …" and "Al Ameen …" are the same fund. */
export const fundNorm = (s) => String(s ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/** Several capped requests to one source, merged into one answer shaped like a single one. */
async function batched(quotes, list, body, key) {
  if (!list.length) return null;
  const parts = await Promise.all(chunks(list, BATCH).map((part) => quotes({ ...body, [key]: part })));
  if (parts.length === 1) return parts[0];
  const merged = { ...parts[0] };
  for (const field of ['quotes', 'funds', 'managers', 'unsupported']) {
    if (parts.some((p) => Array.isArray(p?.[field]))) merged[field] = parts.flatMap((p) => p?.[field] ?? []);
  }
  if (merged.unsupported) merged.unsupported = [...new Set(merged.unsupported)];
  const statuses = parts.map((p) => p?.status).filter(Boolean);
  if (statuses.length) merged.status = statuses.includes('ok') ? 'ok' : statuses[0];
  return merged;
}

/**
 * deps: { userId (null = everyone's holdings, the scheduled run), admin (service-role client),
 *         quotes(body) → Promise<json>, emit(event), now(),
 *         mufapIndex() → Promise<Map<slug, { fund_name, category, amc }>> (the published fund list) }
 * Returns the finished run row.
 */
export async function refresh({ userId = null, admin, quotes, emit = () => {}, now = () => Date.now(), mufapIndex = async () => new Map() }) {
  const t0 = now();
  const since = (t) => now() - t;
  const scheduled = userId === null;

  // One at a time (per user, or for the schedule); a double tap gets the run in progress.
  let lastQ = admin.from('market_refresh_runs').select('id, status, requested_at');
  lastQ = scheduled ? lastQ.is('user_id', null) : lastQ.eq('user_id', userId);
  const { data: last } = await lastQ.order('requested_at', { ascending: false }).limit(1).maybeSingle();
  if (last) {
    const age = now() - Date.parse(last.requested_at);
    if ((last.status === 'running' && age < STALE_RUN_MS) || age < MIN_GAP_MS) {
      const err = new Error(last.status === 'running' ? 'A refresh is already running.' : 'Prices were refreshed a few seconds ago.');
      err.status = 429;
      throw err;
    }
  }

  const { data: run, error: runErr } = await admin.from('market_refresh_runs')
    .insert({ user_id: userId, kind: scheduled ? 'scheduled' : 'user' }).select('id, requested_at').single();
  if (runErr) throw runErr;
  emit({ type: 'start', run_id: run.id, at: run.requested_at });

  const details = { steps: [] };
  const step = (name, started, extra = {}) => { const s = { name, ms: since(started), ...extra }; details.steps.push(s); return s; };

  try {
    const tH = now();
    const { data: targets, error: tErr } = await admin.rpc('market_refresh_targets', { p_user: userId });
    if (tErr) throw tErr;
    const symbols = targets?.psx ?? [];
    // MUFAP's own name, category and manager for each held fund, from its link; Fintraxa's as a fallback.
    const index = (targets?.funds ?? []).length ? await mufapIndex().catch(() => new Map()) : new Map();
    const funds = (targets?.funds ?? []).map((f) => {
      const m = f.slug ? index.get(f.slug) : null;
      return { ...f, mufapName: m?.fund_name ?? f.name, mufapCategory: m?.category ?? f.category ?? '', amc: m?.amc ?? null };
    });
    emit({ type: 'holdings', ...step('holdings', tH), psx: symbols, funds: funds.map((f) => f.name) });

    // ── fetch, in parallel; each source reports as soon as it lands ──
    const tF = now();
    const wanted = funds.map((f) => ({ name: f.mufapName, category: f.mufapCategory }));
    const managed = funds.filter((f) => f.amc).map((f) => ({ name: f.mufapName, amc: f.amc }));
    const psxJob = batched(quotes, symbols, { source: 'psx' }, 'symbols').then((r) => {
      if (!r) return null;
      const ok = (r.quotes ?? []).filter((q) => q.status === 'ok');
      emit({ type: 'source', source: 'psx', ...step('psx', tF, { requested: symbols.length, ok: ok.length }), quotes: r.quotes ?? [] });
      return r;
    });
    const tab = (n) => batched(quotes, wanted, { source: 'mufap', tab: n }, 'funds').then((r) => {
      if (!r) return null;
      emit({ type: 'source', source: `mufap_tab${n}`, ...step(`mufap_tab${n}`, tF, { status: r.status, matched: (r.funds ?? []).length }), status: r.status, error: r.error ?? null });
      return r;
    });
    const amcJob = batched(quotes, managed, { source: 'amc' }, 'funds').then((r) => {
      if (!r) return null;
      emit({ type: 'source', source: 'amc', ...step('amc', tF, { status: r.status, matched: (r.funds ?? []).length, requested: managed.length }), status: r.status, managers: r.managers ?? [] });
      return r;
    });
    const names = ['psx', 'mufap_tab1', 'mufap_tab3', 'amc'];
    const settled = await Promise.allSettled([psxJob, tab(1), tab(3), amcJob]);
    const [psxRes, t1Res, t3Res, amcRes] = settled.map((s) => (s.status === 'fulfilled' ? s.value : { failed: String(s.reason?.message ?? s.reason) }));
    settled.forEach((s, i) => {
      if (s.status === 'rejected') emit({ type: 'source', source: names[i], status: 'unavailable', error: String(s.reason?.message ?? s.reason) });
    });

    // ── shape the rows to save ──
    const psxRows = (psxRes?.quotes ?? []).filter((q) => q.status === 'ok' && q.price > 0 && q.as_of)
      .map((q) => ({ symbol: q.symbol, day: q.as_of, close: q.price, change: q.change, change_pct: q.change_pct }));
    const byKey = (res) => new Map((res?.funds ?? []).map((r) => [fundKey(r.name, r.category), r]));
    const m1 = byKey(t1Res); const m3 = byKey(t3Res);
    const mA = new Map((amcRes?.funds ?? []).map((r) => [`${fundNorm(r.name)}|${r.amc}`, r]));
    const fundRows = [];
    const fundResults = funds.map((f) => {
      const k = fundKey(f.mufapName, f.mufapCategory);
      const picked = pickNewest(pickFund(m1.get(k), m3.get(k)), f.amc ? mA.get(`${fundNorm(f.mufapName)}|${f.amc}`) : null);
      if (picked?.nav_date && picked.price > 0) {
        fundRows.push({
          fund_id: f.id, nav_date: picked.nav_date, price: picked.price, kind: picked.kind,
          source: picked.source, slug: picked.source === 'amc' ? (picked.source_url ?? f.slug) : f.slug,
        });
      }
      return { id: f.id, name: f.name, amc: f.amc, ...(picked ?? { status: 'not_found' }) };
    });

    const tS = now();
    emit({ type: 'saving', psx: psxRows.length, funds: fundRows.length });
    const { data: saved, error: sErr } = await admin.rpc('market_refresh_save', { p_user: userId, p_psx: psxRows, p_funds: fundRows });
    if (sErr) throw sErr;
    step('save', tS, saved);

    const mufapStatus = [t1Res?.status, t3Res?.status].filter(Boolean);
    const psxOk = !symbols.length || psxRows.length === symbols.length;
    const fundsOk = !funds.length || fundRows.length === funds.length;
    const status = psxOk && fundsOk ? 'ok' : (psxRows.length || fundRows.length) ? 'partial' : 'failed';
    details.psx = (psxRes?.quotes ?? []).map((q) => ({ symbol: q.symbol, status: q.status, price: q.price ?? null, change_pct: q.change_pct ?? null, as_of: q.as_of ?? null, as_of_text: q.as_of_text ?? null }));
    details.funds = fundResults;
    details.mufap = {
      status: mufapStatus.includes('ok') ? 'ok' : mufapStatus[0] ?? (funds.length ? 'unavailable' : 'none'),
      error: [t1Res, t3Res].map((r) => r?.error ?? r?.failed).find(Boolean) ?? null,
      ray: [t1Res, t3Res].map((r) => r?.ray).find(Boolean) ?? null,
    };
    details.amc = {
      status: amcRes?.status ?? (managed.length ? 'unavailable' : 'none'),
      managers: amcRes?.managers ?? [],
      unsupported: amcRes?.unsupported ?? [],
      error: amcRes?.failed ?? null,
    };

    const finished = {
      finished_at: new Date(now()).toISOString(), status, duration_ms: since(t0),
      psx_requested: symbols.length, psx_updated: psxRows.length,
      mufap_requested: funds.length, mufap_updated: fundRows.length, details,
    };
    const { data: row } = await admin.from('market_refresh_runs').update(finished).eq('id', run.id).select('*').single();
    emit({ type: 'done', run: row ?? { id: run.id, ...finished } });
    return row ?? { id: run.id, ...finished };
  } catch (error) {
    const message = String(error?.message ?? error);
    details.error = message;
    await admin.from('market_refresh_runs').update({ finished_at: new Date(now()).toISOString(), status: 'failed', duration_ms: since(t0), details }).eq('id', run.id);
    emit({ type: 'error', message });
    throw error;
  }
}
