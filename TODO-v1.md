# Fintraxa v1 — Release Checklist

Target: `fintraxa-v1` branch → merged to `main` → deployed to Vercel.

Live data source: **PK Finance Unified Service** —
`https://sohaib-sarwar.github.io/PSX-MUFAP-MicroService/api`
(static JSON over HTTPS, GET only, no auth, CORS open, nothing rate limited)

Database: Supabase project `Fintraxa` (`qrekpudclwesajfhrokv`, ap-northeast-2).

---

## Phase 1 — API integration

- [ ] 1.1 Rewrite `src/lib/api.js` against the live static API contract
- [ ] 1.2 Handle the `{count, total_filtered, total, offset, limit, freshness, data}` envelope
- [ ] 1.3 Replace removed endpoints (`/health` per-domain, `POST /scrape`, `?q=` search,
      `funds/category/{name}`) with what the static API actually publishes
- [ ] 1.4 Client-side search via `search.json` (static host cannot answer `?q=`)
- [ ] 1.5 Client-side filter / sort / paginate where the old code passed query params
- [ ] 1.6 Field-name migration at every call site (old names → live schema names)
- [ ] 1.7 Freshness/staleness surfaced in the UI instead of silently showing old prices
- [ ] 1.8 React Query defaults: staleTime, gc, retry, refetch policy
- [ ] 1.9 Delete dead fallbacks / hardcoded market data superseded by the live feed

## Phase 2 — Database audit (Supabase MCP)

- [ ] 2.1 Reconcile `supabase_schema.sql` / `sql/` with the live schema
- [ ] 2.2 Fix `function_search_path_mutable` on 10 functions
- [ ] 2.3 Fix SECURITY DEFINER functions executable by `anon` (9 functions)
- [ ] 2.4 Enable leaked-password protection
- [ ] 2.5 Verify RLS policies actually isolate per user (not just "RLS enabled")
- [ ] 2.6 Add missing indexes on `user_id` / `date` foreign keys
- [ ] 2.7 Re-run security + performance advisors until clean

## Phase 3 — Frontend audit

- [ ] 3.1 Every Supabase read/write matches the live schema (columns, CHECKs, NOT NULLs)
- [ ] 3.2 Auth: session handling, refresh, protected routes, sign-out
- [ ] 3.3 Error boundaries + honest empty/error/loading states
- [ ] 3.4 Money maths: rounding, PKR formatting, buy/sell cost basis, realised vs unrealised
- [ ] 3.5 Lint clean (`npm run lint`)
- [ ] 3.6 Production build clean (`npm run build`), bundle size reviewed
- [ ] 3.7 PWA / service worker correct against the new API origin
- [ ] 3.8 Accessibility and mobile layout pass

## Phase 4 — QA

- [ ] 4.1 Smoke test every route signed-out and signed-in
- [ ] 4.2 CRUD round-trip for each transaction type
- [ ] 4.3 API-down / stale-data / empty-portfolio behaviour
- [ ] 4.4 Contract test: live API still returns the fields the app reads

## Phase 5 — Ship

- [ ] 5.1 `vercel.json` (SPA rewrites, headers, caching)
- [ ] 5.2 Environment variables documented and set in Vercel
- [ ] 5.3 Commit to `fintraxa-v1`, push, open PR, merge to `main`
- [ ] 5.4 Deploy to Vercel production, verify live
