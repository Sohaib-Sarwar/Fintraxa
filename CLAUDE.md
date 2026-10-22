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

## Before pushing

```
npm run verify        # lint + unit tests + build
npm run test:contract # 24 checks against the live market API
```
