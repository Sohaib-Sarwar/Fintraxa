# Fintraxa v1 — Release Checklist

Live data source: **PK Finance Unified Service**
`https://sohaib-sarwar.github.io/PSX-MUFAP-MicroService/api`
Static JSON over HTTPS. GET only, no auth, CORS open, nothing rate limited.
747 instruments · 553 funds · 18 indices.

Database: Supabase project `Fintraxa` (`qrekpudclwesajfhrokv`, ap-northeast-2).

---

## Phase 1 — API integration ✅

- [x] 1.1 `src/lib/api.js` rewritten against the live contract. The old client
      pointed at `api.fintraxa.com`, which does not resolve — **the whole market
      data layer was dead**, not merely outdated.
- [x] 1.2 `{count, total_filtered, total, offset, limit, freshness, data}`
      envelope handled, including the single-object files that omit `data`
- [x] 1.3 Removed endpoints replaced: per-domain `/health`, `POST /scrape`,
      `?q=` search, `funds/category/{name}`
- [x] 1.4 Client-side search over the published `search.json` index
- [x] 1.5 `applyQuery` does the filtering, sorting and paging a static host
      cannot (16 unit tests)
- [x] 1.6 Field migration: `fund_category`→`category`, `fund_id`→`slug`,
      `company`/`company_name`→`name`, `last_scrape`→`freshness`,
      indices matched on `index_name`
- [x] 1.7 `DataFreshness` reports the *session the prices describe*, not the
      fetch time — "Updated 4h ago" on a Saturday was true and misleading
- [x] 1.8 `src/lib/marketQueries.js` owns every key, fetcher and staleTime
- [x] 1.9 Dead `syncFundsStocks.js` deleted (unreachable, `ReferenceError`,
      wrote to three tables that do not exist)

## Phase 2 — Database ✅

- [x] 2.1 Baseline migration reconciled with live; duplicate schema files marked
      superseded
- [x] 2.2 `search_path` pinned on all 10 functions
- [x] 2.3 Anon-executable SECURITY DEFINER functions: 9 → 1 (`is_admin`, kept
      deliberately — RLS policies call it and evaluate as the querying role)
- [x] 2.5 RLS verified empirically: every table returns `[]` to an anonymous
      client; trigger functions no longer routable as RPC
- [x] 2.6 Indexes confirmed present on every `(user_id, …)` access path
- [x] 2.7 Advisors clean apart from two documented, deliberate items
- [x] **Found and fixed:** five UPDATE policies had `USING` but no `WITH CHECK`
      — a user could edit their own row and reassign `user_id` to someone else
      in the same statement
- [ ] 2.4 **Needs you:** enable leaked-password protection (dashboard toggle)

## Phase 3 — Frontend ✅

- [x] 3.1 Every Supabase read/write checked against live columns and CHECKs
- [x] 3.2 Auth: `onAuthStateChange` now unsubscribes, `signOut` error surfaced,
      `getSession` failure no longer hangs behind the splash spinner
- [x] 3.3 `ErrorBoundary` per route + 404 catch-all; market-data failure shows a
      banner instead of rendering as "no stocks found"
- [x] 3.4 Portfolio valuation reports how many holdings are priced at cost
      rather than presenting a cost basis as a market value
- [x] 3.5 `npm run lint` clean (74 problems → 0)
- [x] 3.6 `npm run build` clean
- [x] 3.7 PWA runtime caching repointed from the dead domain to the live origin
- [x] **Found and fixed:** stock edit dialog collected `notes` and never saved
      them; edit dialogs could violate `CHECK (> 0)` with no visible error;
      favourites toggle silently reverted on failure; "Forgot Password?" was
      styled text with no handler; "Remember Me" was wired to nothing

## Phase 4 — QA ✅

- [x] 4.1 App boots, routes, renders; console clean
- [x] 4.4 `npm run test:contract` — 24 checks against the live API
- [x] `npm run test` — 16 unit tests on the query layer
- [ ] 4.2/4.3 **Needs you:** signed-in CRUD round-trip. I cannot create a
      Supabase account — that is a remote identity provider, outside what I may
      sign up to on your behalf.

## Phase 5 — Ship

- [x] 5.1 `vercel.json`: SPA rewrites, CSP, HSTS, immutable asset caching
- [x] 5.2 Environment variables documented in `.env.example`
- [ ] 5.3 Branch → PR → merge
- [ ] 5.4 Vercel production deploy

---

## Verified false alarms

Both looked like release blockers in the first pass and neither was real. Worth
recording so they are not "re-found" later:

- The category seed upsert uses `onConflict: 'user_id,name'`. The constraint
  `categories_user_id_name_unique` **does** exist live.
- `favorite_stocks` **does** have `UNIQUE (user_id, symbol)` live.

## Known, deliberate, or deferred

- `is_admin()` stays anon-executable. Revoking it makes every table with an
  "admin can view all" policy raise *permission denied for function* instead of
  returning no rows. It reports only on `auth.uid()`.
- Default categories are seeded on first visit to **Add Transaction**. Open
  Mutual Funds first and free cash reads Rs 0 until then. Worth moving to a
  shared hook post-v1.
- `psxSectors.js` still derives sector from a static symbol map, though the API
  now publishes `sector` and `sector_code` on every row. The sector *filter*
  list is built from the static map, so switching needs both sides changed.
- `src/data/psxResearch.js` remains hardcoded (prices dated March 2026). It
  backs the Research and Tools screens and is clearly labelled "research" in
  the UI where no live price exists.
