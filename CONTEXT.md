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

Mobile app (Android first, Expo SDK 58) lives in **`mobile/`** — map in [§15](#15-mobile-app-mobile); plan and live status in
`docs/mobile/MOBILE_APP_PLAN.md` (read it before any mobile work). It ships as **sideloaded APKs (no app store) but is run
as a live app**; owner's phone setup and Expo Go steps: `docs/mobile/DEVICE_SETUP.md`.

---

## 1. Quick facts

| | |
|---|---|
| App | Personal-finance PWA for Pakistan: personal income/expense, mutual funds (MUFAP), PSX shares, net worth, an AI assistant |
| Repo | `fintraxa-app/` = git repo `Sohaib-Sarwar/Fintraxa`, branch `main` (work is committed and pushed to `main`) |
| Stack | Vite 7, React 19, MUI 7, React Router 6, TanStack Query 5 (IndexedDB-persisted), Zustand, Recharts 3, framer-motion, decimal.js, vite-plugin-pwa |
| Backend | Supabase project **`Fintraxa`, ref `qrekpudclwesajfhrokv`** (ap-northeast-2). No app server: RLS + SQL RPCs + Edge Functions (Deno) + pg_cron/pg_net |
| Hosting | Vercel — live at **https://fintraxa.vercel.app** (`vercel.json`: SPA rewrite, strict CSP, HSTS). Railway/Docker/nginx files are legacy |
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
  `income_expense_transactions` (`type` credit/debit), `savings_accounts`, `passive_income_postings`, `user_preferences`
  (`currency`; mobile: `tracks` jsonb `{spending,funds,stocks}`, `auto_lock_minutes` 0–60).
- Mutual funds: `mf_ledger_entries` + `mf_ledger_components` (append-only ledger), `mf_accounts`, `mf_amcs`, `mf_funds`,
  `mf_fund_aliases`, `mf_nav_history`, `mf_statement_imports`, `mf_staged_transactions`, `mf_import_lines`,
  `mf_approval_requests`, `mf_audit_log`; `mutual_fund_transactions` = legacy, read-only, never read by the client.
- PSX: `stock_transactions` (price numeric(14,4), `settlement_date`, `broker`, `fee`), `stock_dividends`, `favorite_stocks`, `psx_price_history`.
- Market/snapshots: `market_index_history` (+ view `market_index_daily`), `market_refresh_runs`, `portfolio_snapshots`, `holding_snapshots`.
- Users/admin: `profiles` (username, full_name, filer_status `filer`/`non_filer`/…, avatar_path), `user_profiles`, `admin_audit_log`, `feature_flags`, `deletion_log`.
- Mobile releases: `app_releases` (version_code pk, version_name, channel preview/production, apk_url https, notes, min_supported_code,
  migrations) — `authenticated` SELECT only (all other grants revoked); rows written by the owner via SQL. Drives the app's update
  banner / forced-update screen. Never delete rows.
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
| market-refresh-holdings-night | 18:40 | 23:40 | `request_holdings_refresh()` → refresh-prices |
| market-snapshot-request-night | 21:15 | 02:15 | `request_snapshots()` (pg_net fetch of feed JSON) |
| market-snapshot-ingest | 21:20, 21:40 | 02:20, 02:40 | `market_private.ingest_snapshots()` |
| psx-backfill-nightly | 21:35 | 02:35 | `request_backfill()` |
| portfolio-snapshot-after-prices | 21:45 | 02:45 | `snapshot_private.request_run()` |
| cron-history-cleanup | 22:00 | 03:00 | deletes `cron.job_run_details` older than 7 days |

One nightly pipeline, ~7 runs a day (free-plan disk IO budget, `20261115120000`). Do not add frequent jobs: every
run writes cron history + pg_net rows. Users' snapshots between nights come from the apps (today's row missing, or
after a change → `portfolio-snapshot` mode user).

Recompute a user's snapshots by hand:
`insert into snapshot_private.dirty(user_id, from_date) values (…, '2000-01-01') on conflict (user_id) do update set from_date = least(snapshot_private.dirty.from_date, excluded.from_date); select snapshot_private.request_run();`
(Triggers on trades, ledger, transactions, dividends and NAVs already mark users dirty.)

**Migrations** (`supabase/migrations`, applied to prod; apply new ones via MCP `apply_migration`):
base schema (`20250301…`, `20260927…baseline_live_schema`), MF ledger (`20261107120000…130000`), market price
history (`20261107140000`), PSX dividends/confirmations (`20261108120000/130000`), finance passive/savings
(`20261108140000/150000`), profiles + username login (`20261108160000`), daily snapshots (`20261108170000`),
index benchmark (`20261109100000`), delete_category (`20261109101000`), backfill + feed health (`20261109110000`),
price precision (`20261109120000`), market refresh (`20261110120000`, `…160000` AMC + schedule), mobile prefs + releases (`20261113120000`).
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

## 15. Mobile app (`mobile/`)

Expo SDK 58 (RN 0.88, React 19.3, New Architecture, React Compiler on), TypeScript strict, Expo Router (`src/app`),
TanStack Query, Zustand, supabase-js. **Runs in Expo Go** (no MMKV/Skia/Sentry yet). Not an npm workspace: own
`package.json`/`node_modules`; root ESLint ignores `mobile/`, `.vercelignore` keeps it out of Vercel.

| Path | What |
|---|---|
| `metro.config.js` | `@core/*` → `../src/lib/*` (**the web's own engine files, unchanged**); their bare imports (`decimal.js`) resolve from `mobile/node_modules` |
| `src/data/engines.ts` | the one typing seam over the JS engines (analyzeFunds/Stocks, nccpl, summarize, dividends, staleFeeds…) |
| `src/data/queries.ts` | every read; keys mirror the web (`ie-all-transactions`, `mf-ledger`, `stock-transactions`, `psx-closes`, `['psx','stocks']`…); market JSON slimmed before caching |
| `src/data/portfolio.ts`, `selectors.ts` | engine-backed views (same inputs as the web hooks) + pure screen figures (day change, Today, Money month, needs-you, since-last-looked) |
| `src/data/mutations.ts` | add (optimistic, client UUID, offline-queued via persisted paused mutations), edit, delete-with-Undo (server delete after 5 s), prefs |
| `src/lib/vault.ts`, `crypto.ts`, `supabase.ts` | AES-256-GCM session storage; key in SecureStore (bound to fingerprint in builds, "gate" mode in Expo Go); reads wait while locked |
| `src/lib/queryClient.ts` | encrypted persisted cache (512 KB chunks), NetInfo/AppState wired into TanStack, per-user buster |
| `src/lib/auth.ts`, `features/session/*` | email or username (`username-login`) sign-in, sign-up/reset via web links, lock screen, auto-lock |
| `src/app/(auth)/*`, `src/app/(app)/*` | welcome/sign-in/sign-up/forgot · tabs Today/Money/Invest/Me + Add (centre +), transaction, transactions, fund/[key], stock/[symbol], tax, dividends, trades, onboarding, biometrics; `dev-ui` gallery (dev only) |
| `src/ui/*` | design system "Ink, Paper, Gold": tokens (contrast-tested), Text, Figures (hero count-up, Delta, StatRow), ListRow, Sheet, Segmented, Keypad, charts (SVG), Calendar, feedback (toast/undo, offline, skeleton), icons (per-icon Lucide imports) |

Commands (from `mobile/`): `npx expo start` (Expo Go QR) · `npm test` (jest-expo: parity with the web's hand-worked engine
cases, engine purity, selectors, formatting, encrypted storage, contrast, icons) · `npx tsc --noEmit` · `npx eslint .` ·
`npx expo export --platform android` (Hermes bundle check). Icons/splash: `node scripts/build-mobile-icons.mjs public/brand/mark.png mobile/assets`.
Not built yet: EAS builds/Update + Sentry (need the owner's Expo login), smart upload (M4), push, Xyro, delete-account.

Theme: dark only (2026-11-15; `ThemeProvider` always uses `dark`, `app.config` `userInterfaceStyle: 'dark'`). `src/ui/tokens.ts` `ACCENTS` (24 presets incl. Black, whose fills carry `accentRing` and whose accent text is white via `accentText`/`accentOnDarkText`; incl. card-matched Moss, Sage, Jade, Mist, Glacier, Champagne; each card design in `cardDesigns.tsx` names its matching `accent`, suggested in the card picker and Me › Display) + `withAccent(dark|light, key)`;
the user picks one in Me › Appearance (`useApp().accent`, persisted on the phone), or `'custom'` with any hex in `useApp().customAccent` (`accentOf`/`customAccent` in tokens.ts derive ink by luminance; presets are typed `AccentPreset`). It colours buttons, the nav, selections and
charts; profit/loss colours never change. Every preset is WCAG-checked in `src/ui/__tests__/tokens.test.ts`; use
`p.accentOnDark` on always-dark surfaces (nav, hero) because Mono's accent is near-black in light mode.
Invest = Mutual funds | Stocks, switched from the nav's Funds/Stocks buttons (funds first; state `src/features/nav/investView.ts`,
which Home's hero tiles also set). Tax / Dividends / Trades links live under Stocks. Big hero/tile amounts switch to K/M/B from
Rs 10,000,000 (`COMPACT_FROM` in `src/lib/format.ts`). Numbers use Inter Tight like the web's FONT_NUM (`font.num`, `numMedium`, `numBold`, `numHeavy` = 800); text stays Inter. Add income/expense (`src/app/(app)/add.tsx`): amount step → details
step (category dropdown sheet, date, note; no scrolling) → `features/money/AddDone.tsx` finish screen; the type comes from the + menu and can't be
switched there. The date dialog (`src/ui/DatePicker.tsx`) blurs the screen via expo-blur's `BlurTargetView` (Android needs
the target; Android ≤ 11 gets a plain dim).

Mobile gotchas: page transitions are done by `Screen` on focus (navigators use `animation: 'none'`); pages that don't use `Screen` need their own entrance. The tab bar is drawn outside `<Tabs>` (bridge + store) so it can blur the screens; don't move it back into `tabBar`. Gesture Handler 3 → use `usePanGesture` + shared-value `.get()/.set()` (React Compiler lint); route guards use
`Stack.Protected` **plus** the segment redirect in `src/app/_layout.tsx` (Protected alone left "/" unmatched when signed out);
category glyphs map MUI names → MaterialIcons (`src/ui/categoryIcons.ts`, tested); import icons only via `@/ui/icons`.

## Change log

Newest first. One line per change: date, commit (or "data"), what and why. Data fixes name the user only by role.

- 2026-11-15 — Mobile upload: fund statements auto-approve every row still open after `mf-import` (`approveAllOpen`: one `mf_approve_staged` call, then row by row if the server refuses the batch); only rows the server refuses (unclassified) stay under 'Waiting for you' with the Approve button. The server still re-checks duplicates and never books unclassified rows.
- 2026-11-15 — Mobile + /m: (1) persisted cache fixed — the buster was the user id, but the cache is restored before the session is read, so it was 'signed-out' at restore and TanStack DELETED the cache on every launch; now a fixed `CACHE_VERSION` with `useCacheOwner` (wipe when another account signs in). Web build stores it in IndexedDB (`lib/webKv.ts`; localStorage is ~5 MB). Avatar cached by path (`cacheKey`), so it shows at once. (2) Auto-lock for everyone: fingerprint on → lock; off → sign out with a notice (`autoLock` in lib/auth.ts); triggers: no touch for max(1, auto-lock) min (root `onTouchStart` → `markActive`; the clock restarts at sign-in/unlock), background for the auto-lock time, or a cold start after it (`lastActiveAt`). The lock time is a device setting now (the cached server copy used to overwrite it on start). LockScreen = the sign-in landing look with the fingerprint prompt opening by itself. (3) Dates never truncated: RangeButton sizes to its label; Add/DatePicker date fields allow two lines. (4) /m: phones never see the desktop loader (page hidden before the redirect), an instant splash in the landing's layout, the old site-wide worker is unregistered on /m (it could serve the desktop app at /m), photo upload works on the web.
- 2026-11-15 — /m without a trailing slash everywhere (manifest id/start_url/scope `/m`, phone redirect to `/m`): the site redirects /m/ → /m (`trailingSlash: false`), so a `/m/` scope left the page outside the installed app. The worker is now `/m-sw.js` at the site root, registered with scope `/m` (a worker can only cover paths under its own folder).
- 2026-11-15 — `.vercelignore` no longer excludes `mobile/` (it did when only EAS built the app); the first /m deploy failed because Vercel never received the folder. Only mobile build output / native dirs are ignored now.
- 2026-11-15 — Web on phones = the mobile app (owner's call): Vercel now runs `npm run build && node scripts/build-mobile-web.mjs`, which exports `mobile/` with Expo web into `dist/m` (baseUrl `/m` via `FINTRAXA_WEB_BASE`, web build only, so the native update fingerprint is unchanged) and makes /m installable on its own (manifest scope/start_url `/m/`, site icons, network-only `/m/sw.js`). `index.html` sends phones (coarse pointer and a screen ≤ 600 px — the physical screen, since the layout width is 980 px before the viewport tag) from / to /m/ — not `/auth` e-mail links; `?desktop=1` / `?desktop=0` remembers a choice in `fx-view`. The web app's Workbox worker denies /m navigations and skips `m/**` in its precache; `vercel.json` rewrites /m/* to /m/index.html. Web build of the mobile app: haptics via `navigator.vibrate` (Android Chrome; silent on iOS), fingerprint unlock via WebAuthn platform passkey (`mobile/src/lib/webPasskey.ts`, a local gate — no password stored), password-based fingerprint sign-in hidden on web. Also: jest maps `@babel/runtime` to mobile/node_modules (CI installs only mobile/).
- 2026-11-15 — CI: `.github/workflows/mobile-deploy.yml` — pushes to the `mobile` branch (paths `mobile/**`, `src/lib/**`) run typecheck + unit tests, then `expo/expo-github-action/continuous-deploy-fingerprint` (profile `preview`, update branch `preview`, android): same native fingerprint → EAS Update (phones update themselves); changed fingerprint → new APK build. Needs repo secret `EXPO_TOKEN`. Branch `mobile` = what is on the phone.
- 2026-11-15 — Mobile: automatic over-the-air updates — `expo-updates` (~58.0.22), `app.config.ts` `updates.url` (EAS project) + `runtimeVersion: { policy: 'fingerprint' }` (an update needing other native code never reaches an older APK); `lib/otaUpdates.ts` (`useOtaUpdates` in the root layout) checks on launch and on every return to the foreground (≥ 60 s apart), downloads quietly, and applies it when the app goes to the background (else on the next cold start). Ship JS/asset changes with `eas update --channel preview --message "…"` from `mobile/`; native changes still need `eas build -p android --profile preview`.
- 2026-11-15 — Mobile: linked to EAS (`app.config.ts` `owner`, `extra.eas.projectId`); first cloud APK build started (profile `preview`, versionCode 2, keystore generated and held by EAS). `expo-updates` is not installed, so the eas.json channels are ignored until it is (`npx expo install expo-updates && eas update:configure`).
- 2026-11-15 — Mobile: the sign-in / sign-up sheet dismisses the keyboard as soon as its button is tapped (`Keyboard.dismiss()` in `submit`).
- 2026-11-15 — 7e73645 (branch `mobile-redesign`): signed-out start is a lock-screen landing (`features/auth/AuthScreen.tsx`): portrait wallpapers cut to the S24 Ultra's 1080×2340 (`assets/wallpapers/`, Pexels / NASA / Unsplash, credits in its CREDITS.md; the old landscape `assets/auth-bg` removed), Fintraxa mark + wordmark, 'Swipe up' (content follows the finger) → fingerprint prompt when fingerprint sign-in is set up, else a light glass sign-in sheet on `SheetFrame` that rides the keyboard (fixes the form hiding when typing); small 'Create account' link opens the same sheet for sign-up. Checked: all migrations applied, no staged MF rows open.
- 2026-11-15 — Mobile (uncommitted): sign-in refined — titles no longer clipped (explicit line heights; the body variant's 22 px line height cut the 26 px title), Forgot password and Create account links removed, a smaller lighter glass window (max 340 wide, blur 22, tint 0.18), and the owner's fingerprint mark (`features/auth/FingerprintGlyph.tsx`) placed at the Galaxy S24 Ultra in-display sensor spot: bottom centre, `SENSOR_FROM_BOTTOM` = 16% of the screen height (Samsung publishes no exact figure).
- 2026-11-15 — Mobile (uncommitted): sign-in / sign-up redesigned after the web AuthPage — `features/auth/AuthScreen.tsx` (welcome, sign-in and sign-up routes all render it): random portrait backdrop (`features/auth/backdrops.ts`, `assets/auth-bg/`: the web's 7 Unsplash `-m` photos + 7 crops of the card photos), frosted window with real blur, the web's underlined fields / validation / inline forgot-password / glass notice, the form slides between Sign in and Sign up, minimal text; `features/auth/LogoLoader.tsx` (the mark breathes with a circling arc) while the backdrop loads and while signing in. Fingerprint button on Sign in: signs in with the saved sign-in (`lib/bioLogin.ts`: email+password in SecureStore with `requireAuthentication` in builds, gate in Expo Go; survives sign-out; cleared when rejected / invalidated / turned off), or a glass sheet says to turn it on in Me › Security › Fingerprint sign-in (asks the password once, verifies it, saves). Sign-out confirm is minimal glass (only the word in red).
- 2026-11-15 — Mobile (uncommitted): card designs 'Visa Black' and 'Amex Botanical' use the owner's own images from `Cards/` as supplied (personal, non-commercial; marks belong to Visa / American Express); `CardDesign.mark: false` hides the Fintraxa mark on them. The unbranded stand-ins (Matte Black, Black Botanical) were removed; Night Bloom stays.
- 2026-11-15 — Mobile (uncommitted): nav frosted-glass restyle tried and reverted at the owner's request (accent pill / + / Add menu unchanged). Three card designs from the owner's `Cards/` references, made unbranded: Matte Black (drawn: matte black + EMV chip), Black Botanical (Pexels leaves on black + engraved double frame), Night Bloom (Pexels); `scripts/build-card-art.mjs` now takes an optional photos dir and always draws Matte Black.
- 2026-11-15 — Mobile: cache kept across automatic sign-outs. With fingerprint off, auto-lock signs out, and `signOut()` deleted the persisted cache + per-user marks, so nearly every open refetched everything (the 'not using cache, slow' report). Now `signOut({ keepData: true })` for auto-lock and the lock screen's 'Use password'; only Me › Sign out wipes. `auth.ts publish()` runs `claimCache(uid)` BEFORE a session is published, so a different account wipes the cache before anything paints. Default staleTime 60 s → 5 min (writes invalidate; pull-to-refresh forces). Period button: `rangePillLabel` (custom ranges compact: '2 Mar – 9 May', '2 Mar – 9 May ’25', 'Dec ’25 – Jan ’26'), one line, shrinks instead of wrapping/'…'. Double-back exit uses Android's system toast (`ToastAndroid`), no haptic.
- 2026-11-15 — Supabase disk IO budget warning (free plan). Postgres itself wrote ~7 MB/day; the waste was 85 cron runs/day (ingest every 20 min = 538 of 594 logged runs) and per-row RLS functions. Migration `20261115120000_lean_schedule_and_rls_initplan` APPLIED: one nightly pipeline (holdings refresh 23:40 PKT, board 02:15, ingest 02:20/02:40, backfill 02:35, snapshots 02:45, cron history cleanup 03:00 keeps 7 days); dropped the morning board + morning/midnight snapshots and the 16:40/20:40 refreshes. RLS: 36 policies now use `(select auth.uid())` / `(select public.is_admin())` (InitPlan, once per statement; `is_admin()` used to run a query per row). Tests `market.test.mjs` / `snapshots-db.test.mjs` assert the new schedule. Mobile: Android double back on Home exits (first press toasts 'Press back again to exit'; other tabs go Home; Net worth sheet closes first) — `useDoubleBackExit` in `(tabs)/_layout.tsx`. `scripts/sync-doc-intake.mjs --check` compares with CRLF normalised (Windows autocrlf).
- 2026-11-15 — Mobile (uncommitted): upload reworked to the web's logic. Fund statements are no longer previewed with an 'Import' button: after identification the same file (SHA-256 in `mf_statement_imports`, `findImport`) is caught as 'Already imported' with its rows; otherwise `mf-import` runs at once (web ImportDialog) and rows show grouped Added / Already in portfolio / Waiting for you + Approve. Trades and dividends match against the saved list after it has loaded (refetch if empty), rows split into 'To add' and 'Already saved' (locked; collapsible); all-saved files show 'Everything here is already saved' and no Add. Minimal Apple glass: `BlackGlass liquid` forces Liquid Glass on these screens; icon stats (new / saved / check), icons instead of coloured text (⚠ hand-entry look-alike, ! FIFO over-sale), step list done ticks are quiet white.
- 2026-11-15 — Edge Function `doc-intake` DEPLOYED (v1, verify_jwt on, via the Supabase MCP; deployed copy = repo files with long header comments trimmed; boots — OPTIONS 200). Checked: all 20 local migrations are applied; no staged MF rows are waiting. Mobile (uncommitted): upload `readFile` reads with `File.bytes()` → `fetch()` fallback and hashes natively → JS fallback (`features/upload/sha256.ts`, FIPS-tested), so "That file could not be read" no longer blocks; Upload/Confirm rebuilt — `features/upload/Identity.tsx` animates document type → broker/AMC/CDC → funds/stocks; steps follow the web order (printed totals, FIFO holdings via the web's `oversoldRefs`, duplicates), lines show New / Already saved / Check / 'sells more than you hold', 'Select all new'; fund imports narrate the pipeline (dupes, reconcile, FIFO) then list every staged row with its status and Approve for open rows (`fetchStaged`/`approveStaged` = web `mf_approve_staged`). Fund/stock transactions use the Wallet's expanding search (`features/money/SearchAndFilter.tsx`). Metallic card designs removed (owner); metallic accents added (Platinum, Titanium, Rose Gold, Bronze; swatches get a sheen). Card picker renders cards ahead during the swipe (no pop-in), card art has no fade.
- 2026-11-15 — Mobile (uncommitted): dark-only theme (Theme switch removed from Me). Liquid Glass style: `ui/glass.tsx` (`useGlass`, `LiquidLayers`: body + specular rim + sheen; `glassLevels(clear)`), transparency slider in Me (`useApp().glassClear`, `ui/GlassSlider.tsx`) drives cards (`BlackGlass`, `Card`), sheet and nav tints. Me: avatar (tap = change photo) and a Profile sheet (name, username, filer status; `useSaveProfile`/`validateProfile` in `features/me/avatar.ts`, web rules). Keyboard: `SheetFrame` rides on `useAnimatedKeyboard` (edge-to-edge Android no longer resizes), `Screen` and auth screens use KeyboardAvoidingView padding, inputs no longer rewrite text while typing. Upload: black glass, short step labels, matching summary (New / Saved / Check, tap to filter), last 3 imports + History; new `uploads` page (`features/upload/recent.ts`: trade uploads by broker + insert time, statement dividends, `mf_statement_imports`; fund imports list their ledger entries by `source_import_id`). Labels: 'Transactions' everywhere; Savings page title 'Savings'; no period text inside passive cards. Fund page shows current NAV + its date instead of cost per unit. Funds/Stocks cards: unrealized % arrow (`features/invest/GainChange.tsx`, stocks use the engine's `totals.unrealizedPct`), Unrealized green/red (`Holder.signed`; Realized stays plain). `compactNumber` fixed (120M showed as "12M": trailing zeros were stripped from whole numbers; 999.6K → 1M). Charts show at most 6 bars (`ui/barWindow.ts`). Period sheet: concise pills, no descriptions. Cards: 11 new designs (NASA space, Pexels greenery, original Platinum Silver/Black built by `mobile/scripts/build-card-art.mjs`, credits in `assets/cards/CREDITS.md`; silver uses dark ink via `useCardInk`); the design picker loops endlessly. KTrade logo fills its circle. Black accent preset. Found: Edge Function `doc-intake` was never deployed (404) — the cause of uploads not being recognised; code verified locally against the real sample PDFs (all 11 recognised); deploy with `npx supabase@2 functions deploy doc-intake --project-ref qrekpudclwesajfhrokv --use-api` after `supabase login`.
- 2026-11-14 — Mobile (uncommitted): receipts, invest transactions and Me redesign. `ui/Receipt.tsx` (black glass formal receipt, dashed tear, reference) used by `transaction/[id]` (no edit/delete there), new `fund-entry/[id]` and `stock-trade/[id]`; fund-entries / stock-trades rows open them. Wallet transaction rows: long-press opens a smoky glass sheet (View receipt / Edit / Delete with confirm + undo; `ListRow`/`TransactionRow` `onLongPress`). New `invest-transactions?side=funds|stocks` (wallet-transactions theme: period, card-art totals, search, fund/stock picker, day groups) linked from a top-right icon on Holdings. Funds/Stocks card tap → Holdings; fund holding cards bigger (full name, 3 lines). Custom accent: `accent: 'custom'` + `customAccent` hex (`accentOf`, `isHex`). `me.tsx` rewritten: compact black glass sections (Appearance: theme/accent swatches + custom colour sheet/match-card chip/style; Track; Security; More), no subtitles, glass sheets over a `BlurTargetView`.
- 2026-11-14 — Mobile (uncommitted): black Apple glass everywhere for holdings: shared `ui/BlackGlass.tsx` (`BlackGlass` panel, `GlassStats` 2-column figures). Fund holding cards are compact (name, invested · worth, gain). Fund page and stock page rebuilt on black glass with no chart and little scrolling (hero: identity + value + gain/today; figures grid; stock adds total return); each links to all its transactions — `fund-entries/[key]` (now black glass) and new `stock-trades/[symbol]` (every trade by month). `features/invest/HoldingChart.tsx` removed (unused).
- 2026-11-14 — Mobile (uncommitted): page motion unified — tabs and the app stack have no navigator transition (`animation: 'none'`); `Screen` replays the Funds ↔ Stocks motion (fade in, settle 25 dp down, 260 ms) on every focus via `useFocusEffect` + a shared value (no remount). Home's Dividends opens `passive-source?source=dividends`; tapping a source page's card opens `app/(app)/passive-entries.tsx` (every payment in the period, dark glass, by month: logo, title, date, net big, gross/tax small). Stock holdings are compact dark cards (symbol, shares · avg price, worth, gain Rs + %). Holding and payment cards use black glass (#0A0A0B → #000 gradient, faint sheen, lit top edge).
- 2026-11-14 — Mobile (uncommitted): FIX — passive Savings was always 0 on mobile: the transactions query lacked `categories.default_tax_rate`, which the web's `passiveSource` uses to tell savings-account profit from other passive income; now `TXN_SELECT` matches the web's (and the optimistic add copies it). Passive income tab = card (Funds · Savings · Dividends, each opens `app/(app)/passive-source.tsx?source=`) + chart filling the screen; hold card = web FlowChart tooltip (`features/passive/passiveUi.tsx` `PassiveTip`: total after tax, each source, CGT / tax withheld); `usePassive(range, source?)` filters events like the web's source picker. Source page: card (total, per month, last month, CGT/tax), bars, donut by fund / stock / account. Holdings page: title "Holdings", current only, no period/filter, dark formal cards (name + logo, current value big in green, gain Rs + %, invested). Stocks: More section removed. All opened pages enter with the Funds ↔ Stocks motion (stack `fade` + `Screen` content `FadeInDown`).
- 2026-11-14 — Mobile (uncommitted): Mutual funds / Stocks pages = card + chart filling the screen (like Home; holdings lists and Best today removed; Stocks keeps Tax / Dividends / Trades links below). Tapping "Invested" opens `app/(app)/holdings.tsx?side=funds|stocks`: current + previous holdings for the period (period button + blurred sheet), Current | Previous | All glass filter, cards from `features/invest/HoldingCards.tsx` (full name, AMC/company · units, Value / Invested / Gain; previous = Redeemed/Sold tag with Realized, CGT or trades, last date). Fund page (`fund/[key].tsx`) trimmed to identity, value + gain, four figures and an "All transactions" link (no chart) → new `fund-entries/[key].tsx` (every ledger entry, newest first, grouped by month, units @ NAV, amount; reversals hidden).
- 2026-11-14 — Mobile (uncommitted): tab switches use one custom transition (tabs layout `sceneStyleInterpolator` + 280 ms timing): the same feel as Reanimated FadeInDown — new page fades in settling 25 dp down, old page gone almost at once; every scene paints `p.bg` (fixes the light flash between tabs).
- 2026-11-14 — Mobile (uncommitted): Mutual funds / Stocks bars and their hold card now run the web's own code: `valueSeries(assetRows(snapshots, side, the period's analysis), { period: 'month', range, fillGaps: true })` from `src/lib/snapshots/series.js` via `data/engines.ts` (test `data/__tests__/valueSeries.test.ts`), so value / invested / unrealized (value − invested at the close) / realized in the period match the web ValueChart hover. An earlier mobile approximation (`assetMonths`) was removed. `useSnapshots` also loads `*_unrealized` and `*_realized_day`. Tax icon removed from the Funds/Stocks header and + from Passive income.
- 2026-11-14 — Mobile (uncommitted): Home card tap opens `features/today/WorthSheet.tsx` — smoky glass sheet (`GlassSheet smoky`) drawn by the tabs layout (store `worthSheetStore.ts`): net-worth total, Mutual funds / PSX / Dividends with % of total, one short note. Bar chart: trend line back to the soft accent colour at 2.4 px, no glow/dots, no black ringed dot on the selected bar.
- 2026-11-14 — Mobile (uncommitted): `BarChart` bars fade top → bottom to transparent (grey; selected in the accent) and the monthly trend line is prominent (7 px soft glow + 2.4 px solid accent line + a dot per month).
- 2026-11-14 — Mobile (uncommitted): the floating nav is now always dark Apple glass in both themes (real blur of the screens behind via the tabs layout's `BlurTargetView`, `blurReductionFactor` 2, smoky rgba(10,10,12,0.58) tint, light icons); the selected tab keeps the accent pill (a quieter frosted version was tried and reverted at the owner's request); Me › Display › Style (Solid | Glass) now only changes the cards.
- 2026-11-14 — Mobile (uncommitted): Transactions search is a glass icon that widens smoothly into a full bar on tap (UI-thread width + fade) while the category pill fades out, and shrinks back on ✕ / blur when empty (`SearchAndCategory`), so the category pill shows full names. Custom range calendar mirrors the web's `RangeFilter.jsx`: one continuous `surface3` band from the start's centre to the end's centre with pill caps at week-row/month edges, solid inverse circles on the two ends, a ring on today, other months' days blank; no range caption.
- 2026-11-14 — Mobile (uncommitted): Transactions polish: period button moved to the header (top right) beside a glass back button; main card = card art under dark glass with label + count chip, total, "x% of all spending" text (no bar), Per day / Largest glass tiles; controls row = glass search (bar ≥ 300 dp, else icon) + category pill; day groups are light glass panels with a lit top edge; `CategoryIcon` tone `glass` (translucent disc) used by `TransactionRow`. Sheets: `SheetFrame` `decor` puts the glass sheen on the panel (it was inside the handle box, drawing a square block) and the backdrop blur is stronger (`blurReductionFactor` 2). Custom range: one continuous rounded glass band between accent end circles.
- 2026-11-14 — Mobile (uncommitted): Transactions main card = the chosen card art under a dark smoky glass wash (white figures, lit edge); controls in one row in this order: search, category, period. Search is a full glass bar when the row is ≥ 430 dp, otherwise a glass icon that expands to fill the row (✕ closes).
- 2026-11-14 — Mobile (uncommitted): glass sheets follow the finger: new `ui/SheetFrame.tsx` (blurred backdrop + panel on one shared value: glides up on open, drag down follows the finger and fades the backdrop, closes past 120 dp or on a flick, rubber-band when pushed up; back/outside/choices close with the same glide). Used by `GlassSheet` (drag by the handle, so lists scroll) and the period sheet (whole panel). Custom range calendar now uses circles only (accent ends, soft circles between; no square band).
- 2026-11-14 — Mobile (uncommitted): bottom sheets are Apple glass: new `ui/GlassSheet.tsx` (in-page, blurred backdrop via the page's `BlurTargetView`, translucent panel + lit top edge; `glassPanel()` colours) used for the category pickers on Transactions and Add; the period sheet's panel uses the same glass. Date selectors (period sheet, add-screen "Select Date") use `glassPanel(dark, true)`: a deeper smoky near-black glass in the dark theme. The old Modal `Sheet` can't blur on Android (separate window), so blurred sheets must be in-page.
- 2026-11-14 — Mobile (uncommitted): bar-chart tips (value pill + hold card) are Apple glass with real blur over the chart (`Glass` in `ui/charts.tsx`, chart drawn inside a `BlurTargetView`); hold-card titles show the month name only (`monthName`); category icons are neutral everywhere (no green/red tone). Transactions: header is back + title; under the summary panel come a full search bar, then the glass period button and a category selector (sheet with icons, totals, radio) side by side; the chip row and header search icon are gone.
- 2026-11-14 — Mobile (uncommitted): Transactions page redesigned from scratch: one side only (`?type=debit` expenses / `credit` income, no type switch), header = back · title · search icon (expands to a field) · glass period button (own blurred RangeSheet); summary panel (total, Transactions / Per day / Largest, share bar when a category is picked); category chips with icons and totals as the only filter; days as grouped rounded cards under sticky headers ("Today" / weekday + date, day total). Summary is list item 0 so sticky indices line up.
- 2026-11-14 — Mobile (uncommitted): Wallet is now only the month card + chart card, filling the screen above the nav (no search button, no lists below). Card: Spent (tap → that month's expenses), the change vs last month to its right (slim arrow icon, plain figure, "vs Oct"), Earned (tap → income), Saved, Passive (tap → Passive income page). Chart switch shows icons (shopping bag / banknote); holding a bar shows that month's top categories with small icons. Transactions page rebuilt: own period button + blurred `RangeSheet` (both now accept a local period), All | Expenses | Income glass switch, category dropdown sheet, total strip; opened from the card with `?type&start&end` (this/last month map to MTD / Last month).
- 2026-11-14 — Mobile (uncommitted): app-wide period. Glass period button (`features/range/RangeButton.tsx`, "FY 2026-27") top right of Home, Mutual funds, Stocks, Wallet and Passive income; it opens `RangeSheet.tsx` (blurred screen, presets This/Last FY, YTD, MTD, Last month, Last 3/6 months, All time, plus a custom range calendar + Apply). `src/lib/range.ts` mirrors the web's `dateRange.js` presets/labels (tests `lib/__tests__/range.test.ts`); the choice persists in `useApp().range`; `usePeriod()` gives range, label, `upTo` (never past today) and chart `months` (`rangeMonths`, last 12 max). Period drives Home dividends in net worth + bars (`monthEndBarsFor`), Funds/Stocks realized + dividends + bars, Passive income (its This tax year | All time switch is gone), Wallet bars.
- 2026-11-14 — Mobile (uncommitted): Wallet reworked: no Expenses/Income or month filters on top; the month card (`features/money/MonthCardPager.tsx`) swipes through months with a blur cross-fade, each month in its own card design (newest = chosen design); Spent big, Earned / Saved / Passive income small. Chart card uses a glass Expenses | Income switch (`ChartCard` `switcher`) instead of Bar | Pie; tapping a bar jumps the card to that month.
- 2026-11-14 — Mobile (uncommitted): Home's card + chart card now on every money page. Shared `features/today/ChartCard.tsx` (Bar | Pie glass switch, hold-a-bar `TipRows`, web donut) used by Home, Mutual funds (monthly funds value | funds donut), Stocks (monthly PSX value + dividends | shares donut), Wallet (6 months spent/earned | categories donut) and Passive income (by month | by source). `NetWorthCard` (the chosen card design, long-press to change) replaces the old `HeroCard`/`HeroBlock` heroes there: Invested/Unrealized/Realized, Saved/Earned/To savings, Per month/Last month/Tax withheld.
- 2026-11-14 — Mobile (uncommitted): Style setting Solid | Glass (Me › Display, `useApp().material`). Glass = Apple-style frosted nav (real blur via expo-blur on Android 12+; tint only on older) and translucent cards with a lit top edge (`Card` in `ui/primitives.tsx`). To blur on Android the nav now renders OUTSIDE the navigator: the navigator renders `BarBridge`, which publishes its tab-bar props to `features/nav/tabBarStore.ts`, and the tabs layout draws the real bar after the `BlurTargetView`.
- 2026-11-14 — Mobile (uncommitted): Home header simplified: 42 dp avatar with the name beside it (19 sp semibold), unboxed date on the right ("Saturday" over "14 Nov 2026"); the boxed date pill is gone.
- 2026-11-14 — Mobile (uncommitted): accents matched to the card designs: six new presets sampled from the card photos (Champagne, Moss, Sage, Jade, Mist, Glacier); every card names its accent; the picker offers "Use with <accent>" and Me › Display shows "Suggested: <accent> — matches your <card> card".
- 2026-11-14 — Mobile (uncommitted): eight more accent presets (Emerald, Sky, Indigo, Lavender, Rose, Coral, Amber, Silver), all contrast-tested.
- 2026-11-14 — Mobile (uncommitted): seven more card designs (ferns, dark leaves, palms, starry forests; Unsplash License, credits in `mobile/assets/cards/CREDITS.md`), 15 in all.
- 2026-11-14 — Mobile (uncommitted): card designs are now Obsidian + the seven web sign-in photos (`public/auth-bg`, Unsplash License) cropped to `mobile/assets/cards/`, photos with a dark scrim; the SVG designs were dropped. Picker: tap a design to use it (no Done; back/outside cancels). Card bottom row: equal columns with hairline dividers, sentence-case labels, plain "Dividends" (still this fiscal year). Home chart card is pitch black in the dark theme.
- 2026-11-14 — Mobile (uncommitted): mobile net worth = mutual funds + PSX + dividends received this fiscal year (Home card + explain sheet); card redesigned as a real-card-ratio face (contactless top-left, gold mark top-right, heavy Inter Tight figure, lighter Mutual funds / PSX / Dividends FY; no trend line) with selectable designs (`features/today/cardDesigns.tsx`; Obsidian = Higgsfield nano_banana_flash art in `assets/cards/obsidian.webp`) chosen by long-press → Google Wallet-style blurred carousel (`CardPicker.tsx`, drawn by the tabs layout inside a `BlurTargetView`; choice in `useApp().cardDesign`); numbers back to Inter Tight (web FONT_NUM), Manrope removed.
- 2026-11-14 — Mobile (uncommitted): Home pie is now a port of the web `components/fx/AllocationDonut.jsx` (`features/today/AllocationDonut.tsx`: overlapping rounded segments from ten o'clock, logos in end caps, web palette, tap for name/value/share, All | Funds | Stocks glass switch); `DonutChart`/`allocationSlices` removed. Net-worth card: matte black, gold Fintraxa mark (`assets/mark.png`) instead of the chip, contactless symbol, no wordmark.
- 2026-11-14 — Mobile (uncommitted): Home main card is now a debit-card-style `features/today/NetWorthCard.tsx` (chip, contactless, net worth, animated 90-day trend line, Mutual funds / PSX, no today % pill); card + chart card fill exactly the space between header and nav (`Screen` `bottomSpace` / `onViewport`); chart card has a glass Bar | Pie switch (`ui/GlassToggle.tsx`, from `small swicth buttons UI.jpg` + web `Seg` glass), bar default, pie = allocation donut (`DonutChart`, `allocationSlices`, from `PIE CHART UI.jpg`); numbers use Manrope (`@expo-google-fonts/manrope`, Expo Go-safe; `font.num*` tokens) because the web's Monety/Artonex files aren't in the repo.
- 2026-11-14 — Mobile (uncommitted): accent-colour presets + picker (Me › Display); dark theme pitch black, no glow; nav keeps its original look but the + shows only on Home/Wallet and, where it's hidden (Invest, Passive), Invest shows as Funds + Stocks buttons; Home: name + date header (no greeting/eye/settings), main card with animated 90-day trend line, Mutual funds / PSX tiles, K/M/B overflow, card + bar chart fill the screen, hold a bar for that month's funds / PSX / dividends (`dividendsByMonth`); Invest = Mutual funds | Stocks (no overview); add income/expense = amount → one-screen details form (category dropdown sheet, date, note) → done screen; date dialog from `date selector ui.jpg` with blurred background. `navigation.test.tsx` was already stale (old tab labels) and still fails.

- 2026-11-14 — Mobile app `mobile/` (Expo SDK 58, Expo Go-runnable): auth + encrypted session + fingerprint unlock/auto-lock, Today / Money / Invest (funds, stocks, tax, dividends, trades) / Me, quick add/edit/delete with Undo, offline encrypted cache, update banner; engines shared via Metro alias; 91 jest tests; root ESLint ignores `mobile/`, `.vercelignore` added; plan §14/§15 and DEVICE_SETUP updated; design refs `docs/mobile/design-references.md`.
- 2026-11-13 — Migration `20261113120000_mobile_app_preferences_releases` applied (owner-approved): `user_preferences.tracks` + `auto_lock_minutes`, table `app_releases` (authenticated read-only). Test: `scripts/psx/mobile-prefs-db.test.mjs`. In-app feedback table declined by the owner.

- 2026-11-13 — Mobile plan: Expo Go testing (§12.0), optional `mobile-preview/` WebView of https://fintraxa.vercel.app/home (M1-T0), M1 must run in Expo Go until the first non-Expo-Go module.
- 2026-11-13 — Mobile plan v1.1: APK distribution (EAS internal), live-app rules (backward-compatible migrations, `app_releases` update banner/forced update, EAS Update channels, in-app feedback → `app_feedback`), Flutter rejected; `docs/mobile/DEVICE_SETUP.md` for the Galaxy S24 Ultra.
- 2026-11-13 — `docs/mobile/MOBILE_APP_PLAN.md`: production plan for the Android app (Expo + shared core, smart document upload, fingerprint unlock, figure budget, milestones M0–M6). Not started.
- 2026-11-13 — CONTEXT.md created; CLAUDE.md files point here; rule: every change updates this file.
- 2026-11-10 data — owner's account: mess bills re-entered from the hostel portal (34 bills, category "Mess Bill", dated the 5th of each bill month, notes "Hostel Mess Bill Mon YYYY").
- 2026-11-10 7bc0512 — refresh-prices also reads fund managers' pages (source `amc`); holdings refreshed by pg_cron 3×/day.
- 2026-11-10 1fb4a7e — Settings > Market prices: on-demand refresh of held prices via `refresh-prices` (NDJSON progress, `market_refresh_runs`).
- 2026-11-09 da284bd — PSX Analytics: two compact cards (Realized, Unrealized); `nccplPeriod` = CGT charged to date at range end − before range start; redesigned NCCPL statement with direct A4 PDF (`pdfExport.js`).
- 2026-11-09 0beb641 — NCCPL CGT engine (`nccpl.js`), realized dated by settlement (snapshot engine snap-1.4.0, function redeployed, all users recomputed), price numeric(14,4).
- 2026-11-09 ca12c3e / fa46823 / 173f124 — automatic PSX close backfill, stale-feed notice, KSE-100 benchmark + daily returns, broker filter.
- 2026-11-08 — daily snapshots, receipts, savings accounts, passive income, Xyro, dividends, broker trade uploads, profiles/username login.
- 2026-11-07 — MF statement import, append-only ledger, FIFO profit engine, global date range.
