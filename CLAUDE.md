# Fintraxa — app conventions

## Supabase

Always the project named **`Fintraxa`**, ref **`qrekpudclwesajfhrokv`** (ap-northeast-2).
Never `Life Dashboard` or `Money Flow` — different apps on the same account.
`../.mcp.json` pins the ref in the MCP server URL.

Two different vocabularies live in the schema and they are easy to mix up:

| Table | Column | Allowed values |
| --- | --- | --- |
| `income_expense_transactions` | `type` | `credit`, `debit` |
| `categories` | `type` | `income`, `expense` |
| `mutual_fund_transactions` | `type` | `buy`, `sell` |
| `stock_transactions` | `type` | `buy`, `sell` |

A transaction is credit/debit; the *category* it points at is income/expense.
Filtering code has to translate between them — see `AddTransaction`.

Authorisation is RLS, not client-side filtering. Still pass `.eq('user_id', …)`
on reads: it keeps intent explicit and survives a policy that lets an admin see
more than their own rows.

## Stack

Vite 7 + React 19 + MUI 7 + React Router 6 + TanStack Query 5 + Zustand +
Recharts 3 + framer-motion, shipped as a PWA.

**Not Next.js, deliberately.** Everything behind `/auth` is per-user data
fetched from Supabase with the user's own JWT, so there is nothing for a server
to render ahead of time; the public surface is one login screen. Next.js would
add a server runtime, break `vite-plugin-pwa`, and buy no first-paint win.
Revisit only if public, indexable, content-driven pages are added.

## Market data

Every market read goes through `src/lib/marketQueries.js`. Do not call
`psxAPI`/`mufapAPI` from a component — that is how the same dataset ended up
cached twice under two keys with two different row limits, drifting apart.
Keys are prefixed `['psx', …]` / `['mufap', …]` so a refresh can invalidate one
domain by prefix.

Prices come from a static JSON service that republishes on a schedule (PSX once
per working day after the close; MUFAP hourly on working evenings). The client
cannot make it scrape — "refresh" means re-read what is published.

## Writes

Every mutation gets `onError: dbErrorHandler(showSnackbar, '…')` from
`src/lib/dbErrors.js`. Never surface `err.message`: it is raw PostgREST text
(`new row … violates check constraint "…_amount_check"`).

Validate numbers with `validatePositiveNumber` *before* the round-trip. Note
that `!amount` does not catch `"0"` — the string is truthy.

Anything destructive asks first, via `useAppStore().showConfirm`.

## Charts

Use `src/components/charts`: `pieSector` for the `shape` prop, `makeOuterLabel`
for labels, `DonutCenter` for the hole.

Recharts 3 removed `activeIndex` from `Pie` and deprecated `activeShape` —
`shape` receives `isActive` per sector instead. Passing `activeIndex` does
nothing, silently. Six charts here were doing exactly that.

## Motion

`src/components/motion` — `CountUp`, `GlareHover`, `ShinyText` are ported from
ReactBits (via the `reactbits` MCP server in `../.mcp.json`); `Reveal`
reimplements their `animated-content` without pulling in gsap.

`Reveal` is a CSS keyframe animation, not a JS one, on purpose: its resting
style is the *visible* end state with `animation-fill-mode: both`. A JS
entrance ties visibility to the animation completing, and rAF is throttled in
background tabs — the login screen rendered empty until focused.

Honour `prefers-reduced-motion`. `index.css` collapses durations globally;
components that animate imperatively should check `useReducedMotion()`.

## Icons

- **App chrome** (nav bar, sidebar, bottom tabs, auth screen) — `lucide-react`.
- **Feature pages** — `@mui/icons-material`, Rounded variants.
- **Category icons — must stay MUI.** `categories.icon` stores MUI icon *names*
  (`'Work'`, `'Restaurant'`, …) chosen by the user. Changing that picker
  orphans every saved category.

## Accessibility

A styled `<Box onClick>` is not a button. Spread `clickable()` / `selectable()`
from `src/lib/a11y.js` onto one and it becomes focusable, announces correctly
and responds to Enter and Space.

Do not blanket-suppress `:focus-visible`. Recharts charts are keyboard
navigable (`rootTabIndex: 0`).

## Assets

`public/` images are optimised and committed; regenerate with the sharp script
if the source art changes. Watch for: the brand mark is rendered at 26–80 px,
so ship a small WebP, not a 1024px PNG. The PWA manifest's 192px and 512px
icons must actually exist — Chrome will not fire `beforeinstallprompt` without
them, which silently disables the "Install as app" flow on Android.

## Mutual funds

Holdings come from the append-only ledger (`mf_ledger_entries` + `mf_ledger_components`),
never from `mutual_fund_transactions` (legacy, read-only, mirrored into the ledger by a trigger).
Read through `src/lib/mf/useMfPortfolio.js`. Profit for a date range comes from `src/lib/mf/profit.js`
(`analyzeFunds`, via `useMfAnalysis`): FIFO lots, exact decimals (decimal.js — never JS floats for money).
- Realized = sale proceeds − FIFO cost (+ distributions) in the range; CGT = what statements deducted,
  net of refunds/reversals in the range. Paid CGT applies to realized gains only.
- Unrealized = value at the range end − FIFO cost of units held. Estimated CGT: per holding 15% of its gain;
  on a total (portfolio, filter) 15% of the net gain and nothing on a net loss (losses offset gains). Same for PSX.
- Invested = FIFO cost of units still held (a redemption removes its units' cost).
- Verified by `scripts/mf/profit.test.mjs` (hand-worked) and `tests/private/profit-crosscheck.test.mjs`
  (real statements vs the QA ledger, NBP's and Meezan's own printed figures).
- **Full rules, worked example and change checklist: `docs/mutual-funds/PROFIT_CALCULATION.md`.**
  Read it before touching any profit, CGT or invested figure.

- Statements: upload → `mf-statements` bucket → Edge Function `mf-import` → per-AMC parser
  (`supabase/functions/_shared/mf/parsers/`) → staging → duplicate check (SQL) → auto-approve
  clean, reconciled fund sections. Add an AMC by adding a parser + fixture test, not an LLM.
- Writes only via RPCs (`mf_approve_staged`, `mf_edit_staged`, `mf_record_manual_entry`,
  `mf_edit_entry`, `mf_delete_entry`, `mf_delete_import` …). Clients still cannot UPDATE/DELETE the
  ledger directly; edits and permanent deletes go through SECURITY DEFINER functions that check
  ownership and write `mf_audit_log`. Deleting an import also removes its PDF via the Storage API.
- One global date range (`src/lib/dateRange.js`, default this fiscal year, 1 Jul–30 Jun) drives every
  dashboard; shared UI lives in `src/components/fx`.
- CGT shown as charged/refunded is what statements report. The 15% figure is an estimate on
  unrealized gains and must stay labelled as one.
- Redeploy the function from disk: `npm run deploy:edge` (needs `supabase login`).
- AMC logos: `node scripts/build-amc-logos.mjs <dir>` → `public/amc-logos/<code>.webp`.

## Before pushing

```
npm run verify        # lint + unit tests + build
npm run test:contract # 24 checks against the live market API
npm run test:private  # real statements (gitignored, local only)
npm run test:integration # live, as the QA account
```

## Daily snapshots

`portfolio_snapshots` (one row per user per day) and `holding_snapshots` (one row per user,
holding and day: units, cost, price, value, unrealized, realized that day) are written only by
the Edge Function `portfolio-snapshot` (pg_cron at 00:05, 02:45 and 08:45 PKT, and on demand for
the signed-in user). The maths is `src/lib/snapshots/build.js`; the function runs a copy kept
identical by `node scripts/sync-snapshot-engine.mjs` (a test fails if it drifts; re-run it after
changing `profit.js`, `portfolio.js`, `combine.js` or `build.js`, then redeploy the function).
- Changes to ledger, trades, transactions, dividends or statement NAVs mark the user "dirty from"
  that date (trigger); the next run recomputes from there.
- Market closes are captured only for instruments someone holds (`market_private.held_symbols/held_funds`).
- Charts read snapshots through `src/lib/snapshots/series.js` (value vs invested, profit windows).
- Savings are per calendar month (`savingsAt` in `src/lib/home/combine.js`): that month's income minus
  spending and money moved into investments. Nothing carries into the next month.
- Portfolio vs KSE-100: snapshots store `stocks_flow_day`, `stocks_dividend_day` and `stocks_return_day`
  (time-weighted daily return of the shares; buys/sales are not profit, dividends are). Index closes live in
  `market_index_history` (view `market_index_daily` adds each day's return), captured daily from the feed's
  `psx/indices.json`. `benchmarkSeries` / `sameWindowIndex` in `series.js` build the "% since 1 Jan" chart.
- Missing stock history is filled automatically by the Edge Function `psx-backfill` (nightly 02:35 PKT, and at once
  when a trade is saved in a stock with no close within 10 days before it): `psx_backfill_work` lists missing
  (symbol, day), the function reads PSX's per-day market summaries, `psx_backfill_save` stores the closes, remembers
  read days and holidays (`market_private.psx_summary_days`) and recomputes affected users. Only closes holdings need
  are kept. `scripts/psx/backfill-closes.py` does the same by hand. KSE-100 history came from PSX closing-rate PDFs.
- Feed health: `public.market_feed_health()` + `src/lib/market/health.js` show a notice on Home / PSX / Mutual Funds
  when a feed is two or more working days behind (one day of slack for holidays).
- Realized PSX profit = proceeds after the sell fee − average cost, which already includes buy fees. Gain cards lead
  with that after-fees figure for realized; unrealized leads with gross.

## Categories

Deleting a category goes through `public.delete_category(id, move_to)`: it moves the transactions to another
category of the same type and deletes, in one transaction (Settings > Categories).
