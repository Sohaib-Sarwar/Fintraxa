# Fintraxa: handoff context

Read this first, then start on the task. It is the map another engineer (or another Claude model or
account) needs to work without re-exploring the codebase. `CLAUDE.md` holds the **rules** (money maths,
conventions, how to write code here); this file holds the **map** (where everything is, how it connects,
what runs when, what changed recently).

**Keep it current.** Every change — code, migration, Edge Function, cron, deploy, or a data fix for a
user — updates the affected section here and adds a dated line to the [Change log](#change-log), in the
same commit. A change is not done until this file says so. Never put credentials, real user figures or
statement contents here: the repo is pushed.

Market-data service: `../PSX & MUFAP Microservice/CONTEXT.md` (separate repo).

---

## 1. Quick facts

| | |
|---|---|
| App | Personal-finance PWA for Pakistan: personal income/expense, mutual funds (MUFAP), PSX shares, net worth, an AI assistant |
| Repo | `fintraxa-app/` = git repo `Sohaib-Sarwar/Fintraxa`, branch `main` (work is committed and pushed to `main`) |
| Stack | Vite 7, React 19, MUI 7, React Router 6, TanStack Query 5 (IndexedDB-persisted), Zustand, Recharts 3, framer-motion, decimal.js, vite-plugin-pwa |
| Backend | Supabase project **`Fintraxa`, ref `qrekpudclwesajfhrokv`** (ap-northeast-2). No app server: RLS + SQL RPCs + Edge Functions (Deno) + pg_cron/pg_net |
| Hosting | Vercel (`vercel.json`: SPA rewrite, strict CSP, HSTS). Railway/Docker/nginx files are legacy |
| Market data | Static JSON on GitHub Pages from the microservice + its Cloudflare Worker (`/v1/quotes`) |
| Currency/tax | PKR; tax year = 1 Jul–30 Jun; CGT 15% filer; decimals via decimal.js, never JS floats for money |

## 2. Workspace (`C:\Users\sohai\OneDrive\Desktop\Fintraxa`)

| Path | What |
|---|---|
| `fintraxa-app/` | this app (git) |
| `PSX & MUFAP Microservice/` | market-data scraper/publisher (separate git repo) |
| `market-data/` | one-off CSVs (2026 PSX closes, KSE-100 closes) used to backfill price history |
| `CLAUDE.md`, `.mcp.json` | workspace rules (Supabase ref pinned in the MCP URL) |
| `Mutual Fund Real Transactions Statements/`, `Sample Trade confirmations/`, `Dividend Report sample/`, `CGT report NCCPL/`, `Passive Income Tracker/`, `*.sql` Money Flow exports | **real personal data, outside git — never commit it or its figures** |
| `*.jpg/png/webp` at root | UI inspiration and logo sources (bank, broker, NCCPL logos) |

## 3. Architecture

```
Browser (React SPA, PWA)
  ├─ Supabase JS (user JWT, RLS) ── tables / RPCs / Storage (mf-statements, avatars)
  ├─ functions.invoke: mf-import, portfolio-snapshot, username-login
  ├─ fetch (NDJSON stream): refresh-prices
  ├─ market JSON (GitHub Pages)  via src/lib/api.js + marketQueries.js
  └─ Gemini (Xyro, user's own key, browser only)

Postgres (pg_cron)
  ├─ market_private.ingest_snapshots  ── pg_net ── feed JSON → psx_price_history / mf_nav_history / market_index_history (held instruments only)
  ├─ snapshot_private.request_run      ── portfolio-snapshot fn → portfolio_snapshots / holding_snapshots
  ├─ market_private.request_backfill   ── psx-backfill fn → missing PSX closes from PSX market summaries
  └─ market_private.request_holdings_refresh ── refresh-prices fn → live prices for everyone's holdings
```

## 4. Routes and layout (`src/App.jsx`, `src/components/layout/AppLayout.jsx`)

- `/auth` → `features/auth/AuthPage.jsx` (email or username sign-in, sign-up, reset, recovery).
- Protected, inside `AppLayout` (each route has its own ErrorBoundary + Suspense/PageSkeleton):
  - `/` (index) → `income-expense/Dashboard.jsx` — **Personal Finance is the root, not Home**
  - `/home` → `home/Dashboard.jsx` (net worth = funds + stocks + this month's savings)
  - `/add-transaction`, `/transactions`, `/spending` (SpendingInsights), `/passive-income`
  - `/funds`, `/funds/{add,analytics,transactions,imports}` → `mutual-funds/MFSection.jsx` picks the page from the path; `/funds/imports/:id` → `ImportReview.jsx`
  - `/stocks`, `/stocks/{shares,transactions,dividends,analytics,research,tools}` → `psx-stocks/PSXSection.jsx`
  - `*` → `/home` or `/auth`
- Desktop: floating pill top nav (Home, Personal Finance, Mutual Funds, PSX Equities) + avatar → `SettingsDialog`;
  hover-widening section sidebar (hidden on Home). Mobile (≤768px): header, `BottomNavigation`, `PullToRefresh`;
  Funds/Stocks use `SwipeablePages` (carousel + tabs); Finance uses `SubNav` chips.
- **Adding a Funds/Stocks page = 3 edits:** `App.jsx` routes, `sections` in `AppLayout.jsx`, `PAGES` in `MFSection`/`PSXSection`.
- Outlet is keyed on `hideAmounts` (privacy toggle remounts the page). `XyroLauncher` orb is mounted in AppLayout.
- Window events: `fintraxa:open-settings` (`detail.tab`), `fintraxa:open-xyro`, `fintraxa:xyro-cleared`, `fintraxa:xyro-config`.
- One global date range (`useRangeStore` in `lib/dateRange.js`, default this fiscal year) drives every dashboard.

## 5. Features (`src/features`)

- **income-expense:** `Dashboard` (saved = active income − spending; passive beside it), `AddTransaction`
  (category grid, quick amounts), `Transactions`, `TransactionEditor` (receipt/edit/delete), `SpendingInsights`
  (spend or income), `PassiveIncome`, `SavingsAccountsDialog`, `CategoryBadge`, `TypeSwitch`, `passiveIcons`.
- **mutual-funds:** `MFSection`, `Dashboard`, `AddFund` (statement upload or `mf_record_manual_entry`), `Analytics`
  (by AMC/fund), `MFTransactions` + `EntryEditor`, `Imports` / `ImportDialog` (upload steps) / `ImportReview`
  (staged rows: edit, approve, status), `MFDetails`, `HoldingsPanel`, `AmcLogo`, `mfLabels`.
- **psx-stocks:** `PSXSection`, `Dashboard` (+ `BenchmarkChart` vs KSE-100), `SharesPage` (board + watchlist
  `favorite_stocks`), `StockTransactions` / `TradeDialog` (live quote, auto fee) / `TradeEditor` /
  `TradeImportDialog` (AKD/KTrade PDFs), `Dividends` / `DividendTransactions` / `DividendDialog` /
  `DividendUpload` (CDC PDF), `Analytics` + `GainPanels` (Realized / Unrealized cards) + `NccplReport`
  (NCCPL-style CGT statement, direct A4 PDF), `Research` + `Tools` (static March 2026 data in
  `src/data/psxResearch.js`, not live), `StockDetailsDialog`, `importKit`, `BrokerLogo`.
- **settings:** `SettingsDialog` (profile, tax, accounts, categories, prices, xyro, security),
  `CategoriesManager` (`delete_category` RPC), `MarketPricesSettings` (UI for `refresh-prices`).
- **xyro:** `XyroLauncher`, `XyroChat`, `XyroSettings` (API key, model, history), `XyroOrb`, `useXyroChat`, `Markdown`, `theme`.
- **auth:** `AuthPage`, `backdrops.js` (generated by `scripts/build-auth-bg.mjs`).

## 6. Library (`src/lib`)

Pure engines (no React — test with `node --test`):
- `mf/profit.js` — MF realized/unrealized, FIFO, CGT (see `docs/mutual-funds/PROFIT_CALCULATION.md`). `mf/engine.js` is an **older** XIRR engine.
- `psx/portfolio.js` — PSX average cost incl. buy fees; realized by **settlement date**; unrealized; CGT estimate.
- `psx/nccpl.js` — NCCPL/Rule 13N CGT (FIFO by settlement, 0.5%+0.5% deemed costs, monthly running CGT, 3-year loss carry-forward), `nccplPeriod`, `taxYearOf`.
- `psx/confirmations.js` (AKD/KTrade trade PDFs, `BROKERS`), `psx/dividends.js` (CDC reports), `psx/livePrices.js`.
- `finance/summary.js`, `spending.js`, `passive.js`, `amountInput.js`, `banks.js` (savings tax rates).
- `home/combine.js` (net worth, `savingsAt`), `snapshots/build.js` (daily snapshot engine), `snapshots/series.js` (chart series, benchmark), `market/health.js` (stale feeds).
- `xyro/{context,intent,instant,markdown,gemini,models}.js`.
- `dateRange.js`, `formatters.js` (reads currency/privacy from the store at call time), `psxAnalysis.js`, `psxSectors.js` (hand-made map, unknown = "Other"), `stockMeta.js`, `dbErrors.js`, `a11y.js`, `defaultCategories.js`.

React Query hooks:
- `finance/useFinance.js` (**its `AFFECTED` key list must include any new finance query**), `finance/usePassive.js` (`sync_passive_postings`), `finance/useSavingsAccounts.js`.
- `mf/useMfPortfolio.js`, `mf/mutations.js`; `psx/usePsxPortfolio.js` (`stockTradesQuery`, `stockClosesQuery`), `psx/useDividends.js`, `psx/useNccpl.js` (always all trades).
- `snapshots/useSnapshots.js` (calls `portfolio-snapshot` if today's row is missing), `market/useIndexHistory.js`, `profile/useProfile.js`, `xyro/useXyroData.js`, `xyro/storage.js`.

Infrastructure: `supabase.js` (client), `queryClient.js` (IndexedDB persistence per user; `psx`/`mufap` keys never
persisted; `forgetUserData` on sign-out), `api.js` (raw market client), `marketQueries.js` (the only way components
read market data), `market/refreshPrices.js` (streaming), `mf/statementUpload.js`, `mf/hash.js`, `psx/pdfText.js`
(unpdf, lazy), `psx/importSteps.js`, `pdfExport.js` (A4 PDF via html2canvas), `receipt.js` (PNG), `installPrompt.js`, `categoryIcons.jsx`.

## 7. Components

- `src/components/fx/` (import from `components/fx`): `tokens.js` (`useFx` theme tokens, `signColor`, fonts), `Layout.jsx`
  (PageHeader, FxCard, Num, Delta, Kpi, FitPage), `Dashboard.jsx` (Panel, SummaryCard — **not a page**), `Seg`,
  `RangeFilter` (global date filter), `DateField`, `PillSelect`, `Pagination`, `PrivacyToggle`, charts (`ValueChart`,
  `GrowthChart`, `EarningsChart`, `FlowChart`, `BenchmarkChart`, `AllocationDonut`, `HoverLayer`), figures
  (`AnimatedValue`, `FitMoney`, `GainCard`, `PeriodProfit`, `HoldingsCard`).
- `src/components/`: `BrandLoader`, `DataFreshness`, `ErrorBoundary`, `FintraxaLogo`, `GlassToast` (snackbar),
  `InstallPrompt`, `MarketDataNotice` (stale feed), `PageSkeleton`, `PullToRefresh`, `Receipt`, `StockLogo`, `SubNav`,
  `SwipeablePages`, `layout/AppLayout`, `charts/*` (pie helpers), `motion/*` (CountUp, GlareHover, ShinyText, Reveal).
- Stores: `store/appStore.js` (hideAmounts, themeMode, currency + exchange rates, snackbar, `showConfirm`),
  `store/authStore.js` (user/session; `signInWithUsername` via `username-login`), `useRangeStore` in `lib/dateRange.js`.

## 8. Supabase

**Tables (public, all RLS on)** by domain:
- Finance: `categories` (`type` income/expense, `kind` active/passive/spend/transfer, `icon` = MUI icon name),
  `income_expense_transactions` (`type` credit/debit), `savings_accounts`, `passive_income_postings`, `user_preferences`.
- Mutual funds: `mf_ledger_entries` + `mf_ledger_components` (append-only ledger), `mf_accounts`, `mf_amcs`, `mf_funds`,
  `mf_fund_aliases`, `mf_nav_history`, `mf_statement_imports`, `mf_staged_transactions`, `mf_import_lines`,
  `mf_approval_requests`, `mf_audit_log`; `mutual_fund_transactions` = legacy, read-only, never read by the client.
- PSX: `stock_transactions` (price numeric(14,4), `settlement_date`, `broker`, `fee`), `stock_dividends`, `favorite_stocks`, `psx_price_history`.
- Market/snapshots: `market_index_history` (+ view `market_index_daily`), `market_refresh_runs`, `portfolio_snapshots`, `holding_snapshots`.
- Users/admin: `profiles` (username, full_name, filer_status `filer`/`non_filer`/…, avatar_path), `user_profiles`, `admin_audit_log`, `feature_flags`, `deletion_log`.
- Private schemas (no client access): `mf_private` (ledger logic), `snapshot_private.dirty` (user → recompute-from date),
  `market_private` (`psx_summary_days`, `snapshot_requests`, held_symbols/held_funds), `fx_private.login_attempts`.

**Client RPCs:** `delete_category`, `market_feed_health`, `mf_approve_staged`, `mf_edit_staged`, `mf_set_review_status`,
`mf_record_manual_entry`, `mf_edit_entry`, `mf_delete_entry`, `mf_delete_import`, `sync_passive_postings`, `username_available`.
Service-only: `snapshot_work/done`, `psx_backfill_work/save`, `market_refresh_targets/save`, `username_login_*`, `admin_*`.

**Edge Functions** (no `supabase/config.toml` — verify_jwt is set at deploy time):

| Function | verify_jwt | Does | Deploy |
|---|---|---|---|
| `mf-import` | on | statement PDF → per-AMC parser (`_shared/mf/parsers/`: atlas, mcb, meezan, nbp, ubl, generic) → staging → auto-approve clean sections | `npm run deploy:edge` (only this one) |
| `portfolio-snapshot` | off (cron secret or user JWT checked in code) | daily snapshots; `engine/` is **GENERATED** from `src/lib` by `node scripts/sync-snapshot-engine.mjs` | MCP `deploy_edge_function` with `import_map_path: "deno.json"`, or CLI `--no-verify-jwt` |
| `psx-backfill` | off | missing PSX closes from PSX daily market summaries (fflate) | same |
| `refresh-prices` | off | live prices for held stocks/funds via worker `/v1/quotes` (PSX, MUFAP tab1/3, AMC pages); streams NDJSON | `npx supabase@2 functions deploy refresh-prices --no-verify-jwt --project-ref qrekpudclwesajfhrokv --use-api` |
| `username-login` | off | username → sign-in, lockout after failed attempts | `--no-verify-jwt` |

Env names: `MF_ALLOWED_ORIGINS`, `FX_ALLOWED_ORIGINS`, `MARKET_QUOTES_URL`, `MARKET_FUNDS_URL` + standard `SUPABASE_*`.
Storage buckets: `mf-statements`, `avatars` (private, signed URLs).

**pg_cron (UTC → PKT):**

| Job | UTC | PKT | Calls |
|---|---|---|---|
| market-snapshot-ingest | every 20 min | — | `market_private.ingest_snapshots()` |
| market-snapshot-request-morning / night | 03:15 / 21:15 | 08:15 / 02:15 | `request_snapshots()` (pg_net fetch of feed JSON) |
| psx-backfill-nightly | 21:35 | 02:35 | `request_backfill()` |
| portfolio-snapshot-midnight / after-prices / morning | 19:05 / 21:45 / 03:45 | 00:05 / 02:45 / 08:45 | `snapshot_private.request_run()` |
| market-refresh-holdings-close / evening / night | 11:40 Mon–Fri / 15:40 / 18:40 | 16:40 / 20:40 / 23:40 | `request_holdings_refresh()` → refresh-prices |

Recompute a user's snapshots by hand:
`insert into snapshot_private.dirty(user_id, from_date) values (…, '2000-01-01') on conflict (user_id) do update set from_date = least(snapshot_private.dirty.from_date, excluded.from_date); select snapshot_private.request_run();`
(Triggers on trades, ledger, transactions, dividends and NAVs already mark users dirty.)

**Migrations** (`supabase/migrations`, applied to prod; apply new ones via MCP `apply_migration`):
base schema (`20250301…`, `20260927…baseline_live_schema`), MF ledger (`20261107120000…130000`), market price
history (`20261107140000`), PSX dividends/confirmations (`20261108120000/130000`), finance passive/savings
(`20261108140000/150000`), profiles + username login (`20261108160000`), daily snapshots (`20261108170000`),
index benchmark (`20261109100000`), delete_category (`20261109101000`), backfill + feed health (`20261109110000`),
price precision (`20261109120000`), market refresh (`20261110120000`, `…160000` AMC + schedule).
`sql/` files are superseded — do not run.

## 9. Market data

- Base URL `VITE_API_BASE_URL` (default GitHub Pages `…/PSX-MUFAP-MicroService/api/`). Read only through `marketQueries.js` (keys `['psx',…]`, `['mufap',…]`).
- Paths used: `psx/stocks.json`, `psx/stocks/{sym}.json`, `psx/stocks/{gainers,losers,active,quoted,summary}.json`,
  `psx/stocks/top/{metric}.json`, `psx/sectors*.json`, `psx/indices.json`, `psx/indices/{slug}.json`, `psx/market-status.json`,
  `psx/session.json`, `mufap/funds.json`, `mufap/fund/{key}.json`, `mufap/funds/*`, `search.json`, `freshness.json`.
- PSX publishes once per working day after close; MUFAP evenings every day (forward-dated NAVs!). Held prices are also
  refreshed live 3×/day by `refresh-prices`. MUFAP often blocks bots → AMC pages are the fallback (`mf_nav_history.source = 'amc'`).
- Feed health notice: `market_feed_health()` + `lib/market/health.js` + `MarketDataNotice`.

## 10. Money rules (summary — full rules in CLAUDE.md and docs/mutual-funds/PROFIT_CALCULATION.md)

- MF: FIFO lots; realized = proceeds − FIFO cost (+ distributions); CGT = what statements deducted; unrealized est. CGT 15%.
- PSX actual: average cost incl. real buy charges; realized = proceeds after sell charges − avg cost, **dated by settlement**.
- PSX tax (NCCPL): separate figure from `nccpl.js`; NCCPL net = price gain − deemed 0.5%+0.5% (not real fees), so
  actual net = NCCPL net + deemed costs − real fees. Verified to the paisa against a real NCCPL certificate.
- Unrealized est. CGT on a total = 15% of the net gain, nothing on a net loss.
- Savings are per calendar month (income − spending − money moved into investments); nothing carries over.

## 11. Xyro (AI assistant)

Browser-only Gemini chat with the **user's own API key** (localStorage, namespaced per user); no Edge Function.
Per question: `useXyroData` → `context.buildSnapshot` (precomputed facts, exact decimals) → `intent.detectIntent`
(period/category/stock/notes) → `instant.instantAnswer` answers simple questions locally → otherwise
`gemini.answerWithFallback` streams (SSE); `models.js` picks the fastest Flash model, cached 24 h. CSP allows Gemini.

## 12. Tests and verification

- Single file: `node --test scripts/psx/nccpl.test.mjs`. Group: `npm test` (unit-test + `scripts/mf/*` + `scripts/psx/*`).
- `scripts/psx/` also holds snapshot, finance, spending, passive, home, xyro, query-cache tests (not only PSX).
- `*-db.test.mjs` run the real migrations on PGlite via `scripts/db/harness.mjs` (stubs auth, storage, pg_net, pg_cron).
- `snapshot-function.test.mjs` runs `sync-snapshot-engine --check` (fails if the function's engine copy drifts).
- Live/private: `npm run test:contract` (feed envelope), `test:integration` (QA account), `test:private` (`tests/private/`, gitignored, real statements).
- Lint: `npx eslint <files>`. ESLint does **not** flag undefined JSX components — grep imports for new tags.
- Dev server: `npm run dev` (port 5173); `curl http://localhost:5173/src/<file>` returns 200 if Vite can transform it.

## 13. Working rules for this project (from the owner)

- Supabase: only project `qrekpudclwesajfhrokv`. Never `Life Dashboard` or `Money Flow`.
- Don't run `npm run build` / `npm run verify` / full `npm test` unasked: lint + targeted tests + dev-server check.
- Commit and push to `main` when a task is done (owner's standing practice); end commits with the Co-Authored-By line.
- Never type credentials or passwords; QA credentials live in `.env.local` (gitignored) — never read or print them.
- Real statements and figures stay outside git (scratchpad / workspace folders); tests use fake data.
- Mutual-fund statements: deterministic per-AMC parsers only, no LLM.
- Data fixes for a user: inspect first, do it in one transaction, verify, then `request_run()` so snapshots catch up.
- **Update this file with every change.**

## 14. Gotchas

1. Shared PDF code: `src/lib/psx/{pdfText,confirmations,dividends}.js` import `supabase/functions/_shared/mf/pdfRows.js` — editing it changes the browser and `mf-import`.
2. Only `mf-import` has an npm deploy script; the rest are deployed by hand (`--no-verify-jwt`).
3. Edit `src/lib/snapshots/build.js`, `psx/portfolio.js`, `mf/profit.js`, `home/combine.js` → run `node scripts/sync-snapshot-engine.mjs`, bump `SNAPSHOT_VERSION`, redeploy `portfolio-snapshot`, mark users dirty.
4. `Tools.jsx` has its own `CGT_RATE = 0.30` (dividend tax for the calculator), unrelated to the 15% engines.
5. Name collisions: `Dashboard.jsx` in every feature + `components/fx/Dashboard.jsx`; `lib/formatters.js` vs `fx/format.js`; `mf/engine.js` (old) vs `mf/profit.js` (current).
6. `freshnessQuery` key `['market','freshness']` is outside the `psx`/`mufap` prefixes (persisted, not invalidated by a domain refresh).
7. Finance query keys are plain strings (`ie-*`, `home-ie-*`, `mf-free-cash`, `categories`); invalidation relies on `AFFECTED` in `useFinance.js`.
8. `formatCurrency` is not reactive to currency changes; privacy mode works through the outlet remount.
9. Generated/hand-made data: `features/auth/backdrops.js` (generated), `src/data/stockMeta.json` + `public/stock-logos` (scraper scripts), `psxSectors.js` (manual).
10. Stale docs: `README.md` (trust `DEPLOY.md`), Gemini comments in `_shared/mf/normalize.js` and `redact.js` (no LLM runs server-side now).
11. Railway `Dockerfile`/`nginx.conf` lack the CSP and newer env vars — Vercel is the real deploy.
12. Category icons are MUI icon **names** stored in the DB; changing the icon picker orphans saved categories.

## Change log

Newest first. One line per change: date, commit (or "data"), what and why. Data fixes name the user only by role.

- 2026-11-13 — CONTEXT.md created; CLAUDE.md files point here; rule: every change updates this file.
- 2026-11-10 data — owner's account: mess bills re-entered from the hostel portal (34 bills, category "Mess Bill", dated the 5th of each bill month, notes "Hostel Mess Bill Mon YYYY").
- 2026-11-10 7bc0512 — refresh-prices also reads fund managers' pages (source `amc`); holdings refreshed by pg_cron 3×/day.
- 2026-11-10 1fb4a7e — Settings > Market prices: on-demand refresh of held prices via `refresh-prices` (NDJSON progress, `market_refresh_runs`).
- 2026-11-09 da284bd — PSX Analytics: two compact cards (Realized, Unrealized); `nccplPeriod` = CGT charged to date at range end − before range start; redesigned NCCPL statement with direct A4 PDF (`pdfExport.js`).
- 2026-11-09 0beb641 — NCCPL CGT engine (`nccpl.js`), realized dated by settlement (snapshot engine snap-1.4.0, function redeployed, all users recomputed), price numeric(14,4).
- 2026-11-09 ca12c3e / fa46823 / 173f124 — automatic PSX close backfill, stale-feed notice, KSE-100 benchmark + daily returns, broker filter.
- 2026-11-08 — daily snapshots, receipts, savings accounts, passive income, Xyro, dividends, broker trade uploads, profiles/username login.
- 2026-11-07 — MF statement import, append-only ledger, FIFO profit engine, global date range.
