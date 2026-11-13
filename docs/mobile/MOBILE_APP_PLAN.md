# Fintraxa Mobile — Production Plan (Android first)

| | |
|---|---|
| Document | `docs/mobile/MOBILE_APP_PLAN.md` |
| Version | 1.1 — 2026-11-13 (APK distribution, no app store; see §12) |
| Status | **Approved direction, not started.** Milestone status table in §14 is the live tracker |
| Owner | Product owner of Fintraxa (approves every gate marked ⛔) |
| Executor | A Claude model working in this repo |
| Platform | Android first (phones), iOS later from the same codebase |
| Distribution | **Signed APK, sideloaded — no Google Play or other store.** Owner's device: Samsung Galaxy S24 Ultra |
| Operating mode | **Treat it as a live production app from the first tester build**: real Supabase project, real users' data, backward-compatible changes, crash reporting, versioned releases, in-app updates and feedback |
| Stack decision | Expo (React Native, New Architecture) + shared pure-JS core with the web app + existing Supabase |

---

## 0. How to execute this plan (read first, Claude)

1. Read `CONTEXT.md` (the map) and `CLAUDE.md` (the rules) before anything else. Do not re-explore what they cover.
2. Work **milestone by milestone, task by task** (§13). A task is done only when every acceptance check passes and
   you have run its verification commands. Never mark a task done on the strength of "it compiles".
3. **Gates (⛔)** need the owner's explicit "yes" in chat before you act: database migrations, new/redeployed Edge
   Functions, Supabase Auth settings, EAS cloud builds (the free plan has a small monthly Android build quota),
   publishing an EAS Update to the `production` channel, signing keys, any purchase or account creation. Prepare
   everything, then ask once with a short summary. There is **no app store**: never create Play Console artefacts.
3a. **Live-app discipline.** Testers run real builds against the real backend. Every migration must keep the web app
   *and every installed APK version still allowed to run* working (additive changes; rename/drop only after the
   minimum supported version moves past it — §12.4). Never ship a build that has not been installed and smoke-tested
   on the owner's S24 Ultra first.
4. Version numbers in this plan were current on 2026-11-13 (Expo SDK 57 / React Native 0.86 / React 19.2). At M0,
   check the latest stable Expo SDK and each library's compatibility table; prefer the newest stable SDK.
   Record what you chose in §15.
5. After every task: update `CONTEXT.md` (affected map section + Change log line), tick the task in §14, commit with
   a clear message, push to `main`. Small commits; one task per commit where possible.
6. Owner rules that apply here: no `npm run build` / `verify` / full `npm test` unasked (targeted tests + lint);
   never type or print credentials; real statements and figures never enter git; Supabase project ref is
   `qrekpudclwesajfhrokv` only; money is `decimal.js`, never floats.
7. When the plan and reality disagree (a library is abandoned, an API changed), choose the closest equivalent that
   meets the same acceptance criteria, write the deviation in §15, and continue. Ask only if a gate is involved.

---

## 1. Product goals

**Vision.** Fintraxa on Android is the fastest way for a Pakistani investor to know *where they stand today* and to
get a document *into* the system in seconds. Not a smaller website: a calmer one.

**Goals (measurable)**

| # | Goal | Target |
|---|---|---|
| G1 | Know my position at a glance | Net worth + today's change visible ≤ 1.2 s after tapping the icon (cached data) |
| G2 | Log an expense fast | Icon tap → saved expense in ≤ 3 taps and ≤ 6 s |
| G3 | Get any document in | Share a PDF from WhatsApp/Gmail → correct type recognised ≥ 98% of supported docs → review screen in ≤ 4 s |
| G4 | Trustworthy numbers | Every figure equals the web app's figure for the same range to the paisa (same engines) |
| G5 | Low fatigue | ≤ 1 hero + 3 supporting figures per screen; ≤ 1 routine notification per day |
| G6 | Smooth | 60 fps (120 fps on capable screens) scrolling and transitions; no frame > 32 ms in key flows |
| G7 | Secure | Fingerprint unlock that actually protects the session (key bound to biometrics), auto-lock, no secrets in logs |
| G8 | Stable | Crash-free sessions ≥ 99.7%; ANR rate < 0.2% |
| G9 | Fast feedback loop | Tester → "Send feedback" in ≤ 2 taps (with screen + version attached); JS fixes reach installed APKs via EAS Update without reinstalling |


**Non-goals for v1**: Play Store / any store listing, bank SMS reading (kept out even though sideloading would allow
it: it needs a sensitive permission most users refuse and would block a future Play release), OCR of
photos/screenshots, budgets, multi-currency accounts, tablets/foldables beyond "works", iOS build (code stays
iOS-safe), Urdu UI (v1.1).

---

## 2. Who uses it and what they need every day

Primary persona: a salaried or student investor in Pakistan who holds a few mutual funds and PSX shares through a
broker (AKD/KTrade), tracks personal spending, and receives documents by email/WhatsApp.

| Frequency | Job to be done | What the app must give in one glance |
|---|---|---|
| Several times a day | "Am I up or down?" | Net worth, today's change, what moved it |
| Daily | "Log what I just spent" | One-tap add, category, done |
| Daily (after 17:00 PKT) | "How did my stocks close?" | Portfolio change today, top mover, KSE-100 for context |
| Weekly | "Did a statement/confirmation arrive? Put it in." | Share → recognised → review → saved |
| Monthly | "How much did I save? Where did money go?" | Saved this month, top 3 categories, vs last month |
| Event | "Dividend paid / trade confirmed / NAV posted" | A single, quiet notification with one number |
| Yearly (May–June) | "What CGT will I owe? What did I really keep?" | NCCPL CGT for the tax year, you keep after fees and CGT, the statement PDF |

Everything else (research, screeners, formulas, allocation charts, lot-level detail) is **one tap deeper**, never on
the first screen.

---

## 3. Experience principles

1. **One question per screen.** Each tab answers one question (Today: "where do I stand?", Money: "where did my money
   go this month?", Invest: "how are my investments doing?"). Anything not answering it moves to a detail sheet.
2. **The figure budget.** Exactly one hero figure and at most three supporting figures above the fold. Exact values,
   breakdowns and history live in bottom sheets opened by tapping the figure.
3. **Change before totals.** Lead with what changed (today, this month, since you last looked); totals are context.
4. **Calm colour.** Monochrome surfaces. Green/red only for profit and loss, never for decoration. One brand accent
   (gold) for the primary action and focus.
5. **Progressive disclosure, not hidden features.** Tabs and sections the user doesn't use stay hidden (chosen at
   onboarding, changeable in Settings), so a spender who has no stocks never sees an empty Stocks screen.
6. **The app tells you what needs you.** A single "Needs you" strip on Today (imports to review, data problems) instead
   of badges everywhere.
7. **Instant first, then fresh.** Show cached numbers immediately, refresh silently, animate the change. Never a
   spinner where a number was already known.
8. **Thumb-first.** Primary actions in the bottom 40% of the screen; bottom sheets instead of new pages; swipe actions
   on rows; 48 dp minimum touch targets.
9. **Trust signals.** "As of" time under market figures, a short "how is this calculated" sheet on every money
   figure, haptic + animated confirmation on every save.
10. **Respect.** Privacy mask (long-press the hero number or tap the eye), no ads, no dark patterns, few notifications.

---

## 4. Information architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Today        Money        [  +  ]        Invest        Me    │   ← bottom bar (5 slots, centre = Add)
└──────────────────────────────────────────────────────────────┘

Today   (home)      Net worth, today's change, Needs you, Since you last looked, quick glance cards
Money   (finance)   This month: spent, earned, saved · categories · transactions · passive income
+       (sheet)     Add expense · Add income · Upload document · Add trade · Add fund entry · Add dividend
Invest              [Overview | Funds | Stocks] segmented
                    Overview: total invested value, unrealized, today, realized this tax year (net), CGT card
                    Funds: holdings list → fund sheet;  Stocks: holdings list → stock sheet
                    Dividends, Trades, Imports and Tax are rows at the bottom ("More in Invest")
Me                  Profile, tracking preferences, security (fingerprint, auto-lock), notifications,
                    savings accounts, categories, market prices refresh, Xyro, appearance, export, delete account
Xyro (assistant)    Floating button on Today and Invest only (not on forms); opens a full-height sheet
```

- **Hidden by preference:** if the user tracks only spending, the bar becomes `Today · Money · + · Me` and Invest
  disappears; Today drops investment cards. Stored in `user_preferences` (see §9).
- **Deep links:** `fintraxa://today`, `fintraxa://money/tx/{id}`, `fintraxa://invest/funds/{fundId}`,
  `fintraxa://invest/stocks/{symbol}`, `fintraxa://imports/{id}`, `fintraxa://add/{expense|income|document}`.
  Notifications and app shortcuts use them.
- **Android app shortcuts (long-press icon):** Add expense · Upload document · Invest.
- **Back behaviour:** predictive back everywhere; bottom sheets close on back before the screen does.

---

## 5. What each screen shows (the figure budget)

Format rules for all figures:
- Hero: full value with grouping, no decimals for ≥ Rs 10,000 (`Rs 1,248,300`), 2 decimals below that. Compact form
  (`Rs 1.25M`) only when the full one cannot fit at the minimum hero size; tapping shows the exact value.
- Changes: sign + amount + percent on one line: `+Rs 3,420 · +0.27%`. Green/red text only, no coloured backgrounds
  except the tiny delta pill.
- Percent with 2 decimals; holdings ≥ 1% move show an arrow glyph, < 0.05% show "flat".
- Every market figure carries an "as of" caption (`PSX close 13 Nov, 15:30` / `NAV 12 Nov`).
- Privacy mask replaces digits with `••••••` everywhere, including notifications and the app-switcher snapshot.

| Screen | Hero (1) | Supporting (≤ 3) | Behind a tap |
|---|---|---|---|
| **Today** | Net worth | Today's change (Rs, %) · Saved this month · Invested value | Net worth breakdown (funds / stocks / savings), 30-day net-worth line, "how it's calculated" |
| Today › Needs you | — | up to 3 items, each one line + action | full list |
| Today › Since you last looked | — | one line per change: "Stocks +Rs 2,140 since Tue 21:40", "MUFAP NAVs posted for 2 funds" | — |
| **Money** | Spent this month | Earned · Saved · vs last month (±%) | category breakdown, daily spend chart, all transactions |
| Money › Category | Spent in category this month | 6-month average · last 3 transactions | all transactions in category |
| **Invest › Overview** | Investments value | Unrealized P/L (+%) · Today · Realized this tax year (net after fees) | value vs invested chart, vs KSE-100, allocation, CGT details |
| Invest › Funds | Funds value | Unrealized · Today (latest NAV) · Number of funds | per fund: units, avg cost, NAV date, realized, CGT paid |
| Invest › Stocks | Stocks value | Unrealized · Today · Day's top mover | per stock: shares, avg cost (incl. fees), last close, realized, dividends |
| Fund / Stock sheet | Current value | Unrealized (+%) · Today · Avg cost | transactions, price chart, realized, dividends, sector |
| **Tax** (Invest › More) | CGT this tax year (NCCPL) | NCCPL net gain · Your net after fees · You keep | monthly running CGT, losses carried forward, lots, Download statement PDF |
| Dividends | Received this tax year (net) | Tax withheld · Payments count · Next ex-date if known | list by payment date |
| **Me** | Name + avatar | Plan · Last sync time · Fingerprint on/off | everything else as rows |

Rules this table enforces:
- Realized/unrealized appear only on Invest, never on Today (Today stays a "position" screen).
- Tax appears only in Invest › Tax and in the yearly reminder.
- Allocation donuts, research data, screeners and formulas are not in v1 navigation (web only).

---

## 6. Key flows

### 6.1 First launch and sign-in
1. Splash (brand mark on black, held until fonts + cache are ready, ≤ 600 ms).
2. Welcome: one line of value ("Your money, right where you left it."), buttons **Sign in** / **Create account**.
3. Sign in: one field "Email or username", password, **Sign in**. Username goes through the existing `username-login`
   Edge Function, email through Supabase password sign-in. Errors are plain ("Wrong password. 4 tries left.").
4. After first success: full-screen prompt **"Unlock with fingerprint next time?"** with **Use fingerprint** / **Not now**.
   Use fingerprint → system biometric prompt → enabled (see §8).
5. Tracking preferences (first time only): "What do you want to track?" — Spending · Mutual funds · PSX shares
   (multi-select, all on by default). Saved to `user_preferences`.
6. Prefetch: profile, last 60 days of transactions, holdings, latest snapshots (in parallel), then Today.

### 6.2 Returning user
- Cold start with fingerprint on: splash → system biometric prompt immediately (no custom screen first) → Today with
  cached figures (≤ 1.2 s target from icon tap on the reference device) → silent refresh → figures animate if changed.
- Fingerprint fails 3× or is unavailable → "Use password" screen (prefilled username).
- Auto-lock: after 5 minutes in background (setting: immediately / 1 / 5 / 15 min) the session key is dropped from
  memory; return = biometric prompt.

### 6.3 Quick add expense (the most frequent write)
`+` → Add expense sheet opens with numeric keypad focused:
1. Amount (big, Inter Tight), keypad with quick amounts (last 4 distinct amounts in this category).
2. Category chips: the user's 8 most-used, then "More".
3. Date defaults to today (chip: Today / Yesterday / pick). Note optional (single line, recent notes suggested).
4. **Save** → haptic success + check animation → sheet closes → Money and Today figures update optimistically.
Edit/delete from the transaction sheet; delete asks once and offers **Undo** for 5 s.

### 6.4 Smart document upload ("Upload anything")
Entry points: `+` › Upload document · Android share sheet (PDF from WhatsApp/Gmail/Files) · app shortcut ·
notification "Statement email?" (v1.1).

```
pick/share PDF ─► hash (SHA-256) ─► duplicate? ──yes─► "Already imported on 12 Oct" (open it)
                                  │ no
                                  ▼
                 upload to Storage  documents/{uid}/{sha}.pdf   (progress ring)
                                  ▼
                 Edge Function doc-intake: extract text → classify
                                  ▼
      ┌──────────────┬─────────────────────┬────────────────────┬───────────────┐
      │ Fund statement│ Trade confirmation  │ CDC dividend report│ Unknown        │
      │ (AMC named)   │ (AKD / KTrade)      │                    │                │
      ▼               ▼                     ▼                    ▼
   mf-import       parse trades          parse dividends       "We couldn't tell what this is"
   pipeline        → preview rows        → preview rows        choose type manually / send feedback
      ▼               ▼                     ▼
   Review screen (one design, three variants): what we found, duplicates greyed, warnings, Approve
```

- Password-protected PDFs (some AMC statements): detect, ask for the password once, retry; never store it.
- The classification card says what it found in plain words: "AKD trade confirmation · 3 trades · settles 14 Nov" with
  a **Change type** link (user override).
- Recognition uses the existing deterministic detectors: `detectBroker` (`src/lib/psx/confirmations.js`),
  `parseDividendReport` (`src/lib/psx/dividends.js`), `detectAmc` (`supabase/functions/_shared/mf/parsers/index.js`).
  No LLM.
- After approval: "Added 3 trades" toast with **View**; Invest figures update; snapshots recompute (existing triggers).

### 6.5 Check investments after the close
Notification (17:30 PKT trading days, only if the user holds stocks): "Stocks closed +Rs 2,140 (+0.8%) · KSE-100 +0.5%"
→ deep link to Invest › Stocks with today's movers sorted first.

### 6.6 Tax season
June 1 and June 25 reminders (opt-in): "Tax year ends 30 June. CGT so far: Rs X." → Invest › Tax → **Download
statement** (PDF via `expo-print`, share sheet).

### 6.7 Offline
All tabs render from the persisted cache with an "Offline · last updated 21:40" pill. Writes (add expense) are queued
and retried when online (TanStack Query mutation persistence); uploads require a connection.

---

## 7. Visual design system ("Ink, Paper, Gold")

Direction, informed by 2026 fintech patterns (biometric-first entry, one-handed bottom-sheet navigation, uncluttered
home with horizontally scrolling hubs, dark mode as a first-class theme, micro-interactions as trust signals) and
Material 3 Expressive motion (springs, spatial continuity) — **applied with restraint to Fintraxa's existing brand**:
monochrome surfaces, green/red only for P&L, the gold mark. Before building screens, the executor collects 10–15
current references from Dribbble (`fintech app`, `investment app`, `banking app dark`) and the Figma community
(fintech mobile UI kits), saves links + one-line takeaways to `docs/mobile/design-references.md`, and checks each
screen against them. Copying any specific product's look is not allowed — references inform, they don't dictate.

### 7.1 Tokens (one source: `packages/tokens`, consumed by web MUI theme and mobile)

| Token | Dark (default) | Light |
|---|---|---|
| `bg` | `#000000` (true black, OLED) | `#F4F5F6` |
| `surface` | `#0C0C0D` | `#FFFFFF` |
| `surface2` | `#151517` | `#F6F7F8` |
| `surface3` | `#1E1E21` | `#ECEEF1` |
| `hairline` | `#1A1A1D` | `#EEF0F2` |
| `border` | `rgba(255,255,255,0.08)` | `rgba(10,12,16,0.08)` |
| `ink` / `ink2` / `muted` | `#F5F5F7` / `#A8A8AE` / `#7C7C84` | `#0B0C0E` / `#4B5058` / `#80858D` |
| `pos` / `neg` | `#3CCF8E` / `#FF7A70` | `#137148` / `#C4302B` |
| `accent` (brand gold) | `#C9A27E` | `#A9825E` (darker for contrast on white) |
| `warn` | `#F0B44C` | `#8F5D00` |

These match the web tokens in `src/components/fx/tokens.js`; gold comes from the brand mark. Validate every text/
background pair for WCAG AA (4.5:1 body, 3:1 large); adjust `muted` if it fails on `surface2`.

### 7.2 Typography
- Words: **Inter** (variable). Figures: **Inter Tight** with tabular numerals. Both open-licensed and already
  self-hosted by the web app. Monety/Artonex are commercial; use them only if licensed files are supplied.
- Scale (sp): Hero 44/48 (Inter Tight 650, −2% tracking) · Title 24/30 · Headline 18/24 (600) · Body 15/22 ·
  Label 13/18 (500) · Caption 12/16. Respect system font scale up to 200%: hero figures use auto-fit (shrink to 70%
  minimum, then compact format), never clip.

### 7.3 Shape, space, elevation
- 4 dp grid; screen padding 20 dp; card padding 16–20 dp; gaps 12 dp.
- Radii: chips 12, inputs 16, cards 24, bottom sheets 32 (top corners), FAB fully round.
- No drop shadows in dark mode; 1 px hairline borders separate surfaces. Light mode: one soft shadow level for sheets.

### 7.4 Components (build once in `mobile/src/ui`)
`Screen` (edge-to-edge, safe areas, large title that collapses on scroll) · `HeroFigure` (animated count, privacy
mask, "as of" caption, tap → sheet) · `DeltaPill` · `StatRow` (≤ 3 supporting figures) · `Card` · `NeedsYouStrip` ·
`SinceLastLookedCard` · `ListRow` (icon/logo, title, subtitle, trailing figure + delta, swipe actions) ·
`BottomSheet` (snap points, back-closes) · `SegmentedControl` · `Chip` · `AmountKeypad` · `CategoryGrid` ·
`StockLogo` / `AmcLogo` / `BrokerLogo` (bundled WebP from `public/`) · `Sparkline` · `AreaChart` (value vs invested) ·
`BarChart` (monthly) · `EmptyState` · `Skeleton` (only when no cache) · `Toast` (with Undo) · `ConfirmSheet`.

### 7.5 Motion and haptics
- Springs for sheets and tab content (Reanimated 4, UI thread). Durations: tap feedback 100 ms, sheet 280 ms spring,
  figure count-up 450 ms (only when the value changed), screen transitions native stack defaults.
- Shared-element feel: tapping a holding row expands into its sheet (container transform).
- Haptics: light tick on segment/chip change, success on save/approve, warning on delete confirm, none on scroll.
- `Reduce motion` (system) → no count-ups, cross-fades only.

### 7.6 Icons
- UI chrome: `lucide-react-native` (matches web chrome).
- **Category icons must render the names stored in the DB** (`categories.icon` holds MUI icon names such as
  `Restaurant`, `DirectionsCar`, `CreditCard`, `VolunteerActivism`). Map PascalCase MUI names to Material Icons
  glyph names (`Restaurant` → `restaurant`, `DirectionsCar` → `directions-car`) via `@expo/vector-icons`
  `MaterialIcons`; build the list from `select distinct icon from categories` plus the picker list in
  `src/lib/categoryIcons.jsx`, with a test that every name maps to an existing glyph and a fallback (`category`).

### 7.7 Screen sketches (structure, not pixels)

```
TODAY                                   INVEST › OVERVIEW                    ADD EXPENSE (sheet)
┌──────────────────────────┐            ┌──────────────────────────┐        ┌──────────────────────────┐
│ Good evening, Ali     ◉  │            │ Invest   [Overview|Funds|Stocks]   │ ── Add expense       ✕   │
│ Net worth                │            │ Investments                       │                          │
│ Rs 1,248,300             │            │ Rs 842,100                        │        Rs 1,250          │
│ +Rs 3,420 · +0.27% today │            │ Unrealized +Rs 61,200 · +7.8%     │  [500][1,000][1,250][2k] │
│ Saved this month  Invested│           │ Today +Rs 2,140 · Realized FY …   │  ◯Food ◯Transport ◯Mess │
│ Rs 18,400   Rs 842,100   │            │ ┌ value vs invested ───────────┐ │  ◯Bills ◯Shopping  More  │
│ ┌ Needs you ───────────┐ │            │ └──────────────────────────────┘ │  Today ▾   Note…         │
│ │ 1 import to review ›  │ │            │ Funds            Rs 512,000  ›  │  ┌──────────────────────┐│
│ └───────────────────────┘ │            │ Stocks           Rs 330,100  ›  │  │ 1 2 3 │ 4 5 6 │ 7 8 9 ││
│ Since you last looked     │            │ Tax 2026-27  CGT Rs 0        ›  │  │  . 0 ⌫   [  Save  ]  ││
│ Stocks +Rs 2,140 since Tue│            │ More: Dividends · Trades · Imports│ └──────────────────────┘│
├──────────────────────────┤            ├──────────────────────────┤        └──────────────────────────┘
│ Today Money (+) Invest Me│            │ Today Money (+) Invest Me│
└──────────────────────────┘            └──────────────────────────┘
```

---

## 8. Authentication and fingerprint login (security design)

Goal: fingerprint unlock that protects the session cryptographically, not just a screen in front of it.

1. **Session storage.** Supabase client `auth.storage` = custom adapter: session JSON encrypted with AES-256-GCM;
   ciphertext in MMKV (or AsyncStorage); the AES key never stored in plain form.
2. **Key protection.**
   - Fingerprint ON: the AES key is stored in `expo-secure-store` with `requireAuthentication: true` (Android Keystore
     key bound to strong biometrics). At unlock, one biometric prompt releases the key; it is kept **in memory only**
     for the session, so token refresh writes do not trigger more prompts (SecureStore with `requireAuthentication`
     prompts on save *and* read — never write through it after unlock).
   - Fingerprint OFF: the key is stored in SecureStore without `requireAuthentication` (still Keystore-backed).
3. **Lock.** Background longer than the auto-lock setting, or explicit "Lock now" → drop the in-memory session key
   and clear the in-memory query cache → biometric prompt on return. The persisted cache stays encrypted on disk (5).
4. **Invalidation.** New fingerprint enrolled / biometrics removed → Keystore key invalidated → catch the error, fall
   back to password sign-in, offer to re-enable.
5. **Cached data at rest.** The persisted query cache lives in MMKV with MMKV encryption; that key sits in SecureStore
   without a biometric requirement, so hydration needs no second prompt. Figures are painted only **after** unlock,
   never behind the prompt. Targets: fingerprint off → icon tap to Today ≤ 1.2 s; fingerprint on → prompt dismissed
   to Today ≤ 400 ms (hydrate while the prompt is showing).
6. **Password sign-in** keeps the web rules: username lockout via `username-login`, plain error messages, no account
   enumeration beyond what the web already does.
7. **Other protections:** app-switcher snapshot blurred (`FLAG_SECURE` optional toggle "Hide app content in recent
   apps", default ON); no tokens, amounts or emails in logs or Sentry breadcrumbs; certificate pinning not used
   (Supabase rotates certs); jailbreak/root detection not used (no payment features).
8. **Account deletion** in Me › Delete account (a live app holding financial data must let people leave): confirm sheet → re-authenticate
   (biometric or password) → `delete-account` Edge Function (§9) → signed out, local data wiped.
9. Passkeys: out of scope for v1; revisit when Supabase passkey support is GA.

---

## 9. Architecture

### 9.1 Repository layout (minimal disruption to the web app and its Vercel deploy)

```
fintraxa-app/                    (repo root = web app, stays deployable as is)
├─ package.json                  web app + "workspaces": ["packages/*", "mobile"]
├─ src/                          web app (imports engines from @fintraxa/core after M0)
├─ packages/
│  ├─ core/                      pure JS engines + parsers + formatting (no React, no DOM, no Node-only APIs)
│  │   mf/profit.js · psx/portfolio.js · psx/nccpl.js · psx/confirmations.js · psx/dividends.js ·
│  │   snapshots/build.js · snapshots/series.js · home/combine.js · finance/* · dateRange (pure parts) ·
│  │   format/money.js (pure formatter: currency/privacy passed in) · market/health.js · xyro/{context,intent,instant,gemini,models}.js
│  └─ tokens/                    design tokens (JS objects) → MUI theme (web) and StyleSheet (mobile)
├─ mobile/                       Expo app (TypeScript strict)
├─ supabase/                     migrations + Edge Functions (portfolio-snapshot engine synced from packages/core)
└─ scripts/                      tests keep working; imports point at packages/core
```

- Keep `src/lib/*` paths working during migration by re-exporting from `@fintraxa/core` (thin shims), then switch
  imports file by file. Tests in `scripts/` import from `packages/core` directly.
- `scripts/sync-snapshot-engine.mjs` reads from `packages/core` instead of `src/lib`.
- React versions: mobile pins `react`/`react-native` to the Expo SDK's exact versions. If npm hoisting puts two React
  copies in the tree (web `^19.2`, mobile exact), use `overrides` or keep `mobile` out of workspaces and depend on
  `"@fintraxa/core": "file:../packages/core"`. Decide in M0-T1 by checking `npm ls react`.
- `formatters.js` currently reads the Zustand store at call time; core gets a pure `formatMoney(n, { currency,
  rate, hidden, decimals })` and the web keeps its store-reading wrapper.

### 9.2 Mobile stack (verify versions at M0)

| Concern | Choice | Why |
|---|---|---|
| Runtime | Expo SDK 57+ (RN 0.86, React 19.2, New Architecture, Hermes V1) | Fast startup, OTA updates, EAS builds |
| Language | TypeScript strict (mobile); core stays JS with JSDoc + `checkJs` | Safety where the UI churns, no rewrite of tested core |
| Navigation | Expo Router (typed routes), native tabs/stack | Deep links for free, predictive back |
| Server state | TanStack Query 5 + persister on MMKV (encrypted) | Same patterns as web; instant cold start |
| Client state | Zustand 5 (privacy, theme, lock state, preferences) | Same as web |
| Supabase | `@supabase/supabase-js` 2 with the encrypted storage adapter (§8) | Same backend |
| Lists | FlashList v2 | Long transaction lists at 60/120 fps |
| Animation | Reanimated 4 + Gesture Handler | UI-thread animations |
| Bottom sheets | `@gorhom/bottom-sheet` (Reanimated-4-compatible release) | Thumb-first details |
| Charts | `victory-native` (Skia) | GPU charts, gestures, smooth on low-end |
| Images | `expo-image` | Disk cache for stock/AMC logos |
| Secure storage | `expo-secure-store`, `expo-local-authentication` | Keystore + BiometricPrompt |
| Storage | `react-native-mmkv` | Synchronous, fast persisted cache |
| Files | `expo-document-picker`, `expo-file-system`, share intent (`expo-share-intent` or equivalent config plugin) | Upload anything |
| Streaming fetch | `expo/fetch` | NDJSON (`refresh-prices`), SSE (Xyro) |
| PDF output | `expo-print` + `expo-sharing` | NCCPL statement |
| Notifications | `expo-notifications` + Expo Push service (FCM v1 credentials in EAS) | Simple server send |
| Haptics | `expo-haptics` | Trust micro-interactions |
| Errors | `@sentry/react-native` with PII scrubbing | Crash-free target |
| Widgets (M5, optional) | `react-native-android-widget` | Net worth widget |
| Tests | `jest-expo` + React Native Testing Library; Maestro for E2E | Unit + flows |
| Build/release | EAS Build, EAS Submit, EAS Update (channels: `development`, `preview`, `production`) | No local Android SDK required for releases |

### 9.3 Data flow on the device

```
Supabase (RLS) ──► TanStack Query (packages/core query factories via mobile/src/data) ──► MMKV (encrypted)
      ▲                         │                                              │
      │                 selectors + core engines                         hydrate at launch
      │            (analyzeStocks, analyzeFunds, nccplPeriod,              (sync, before first frame)
      │             savingsAt, series from portfolio_snapshots)
 Edge Functions: username-login · refresh-prices · portfolio-snapshot · mf-import · doc-intake · delete-account · notify
```

- Prefer **server-computed snapshots** (`portfolio_snapshots`, `holding_snapshots`) for charts and "today"; run
  engines on device only for current positions and range figures (cheap). Never rebuild daily history on device.
- Query keys mirror the web (`['psx', …]`, `['mufap', …]`, plain finance keys); finance invalidation list mirrors
  `AFFECTED` in `src/lib/finance/useFinance.js`.

### 9.4 Backend additions (all ⛔ gated)

| Item | What | Notes |
|---|---|---|
| `user_preferences` columns | `tracks jsonb` (`{spending, funds, stocks}`), `notify jsonb` (categories, quiet hours), `auto_lock_minutes int` | RLS own row |
| `push_tokens` table | `user_id, token, platform, device_name, created_at, last_seen_at`, unique `(user_id, token)` | RLS own rows; delete on sign-out |
| Storage bucket `documents` | private; path `{uid}/{sha256}.pdf`; 10 MB limit; PDF only | RLS by folder = `auth.uid()` |
| Edge Function `doc-intake` | input: storage path (+ optional password); extracts text (unpdf, same `_shared/mf/pdfRows.js`), classifies (broker / CDC / AMC detectors), parses trades/dividends with `packages/core`, for MF hands off to the `mf-import` pipeline; returns `{kind, confidence, summary, rows, duplicates, warnings}` | verify_jwt on; no LLM; logs without amounts |
| Trades/dividends save | reuse existing table inserts with the existing duplicate rules (`duplicateStatus`, `dividendDuplicates`) — via RPCs `psx_save_trades(rows)` / `psx_save_dividends(rows)` that re-check duplicates server-side | keeps web and mobile consistent |
| Edge Function `delete-account` | re-auth check, deletes user rows (all tables), storage objects (`mf-statements`, `documents`, `avatars`), push tokens, then the auth user; writes `deletion_log` | same flow also offered on the web app (Settings) |
| Edge Function `notify` | called by pg_cron after the close/NAV/snapshot runs; builds per-user digests from snapshots; respects preferences + quiet hours; sends via Expo Push API; prunes dead tokens | one routine push per day max |
| Auth settings | add redirect `fintraxa://auth-callback` (password reset, email confirm) | Supabase dashboard / Management API — owner action |
| `app_releases` table | `version_code int pk, version_name, released_at, apk_url, notes, min_supported_code int, channel` | readable by `authenticated`; written by owner only (SQL/admin). Drives the in-app update banner and forced updates (§12.3) |
| `app_feedback` table + bucket `feedback` | `id, user_id, created_at, message, category (bug/idea/data/other), route, app_version, version_code, device_model, os_version, screenshot_path, status (new/seen/fixed)` | RLS: insert/select own rows; owner reads all via SQL or a small web admin view. Screenshot optional, private bucket `feedback/{uid}/…` |

---

## 10. Notifications (anti-fatigue by design)

| Notification | When | Default | Content |
|---|---|---|---|
| Stocks close digest | 17:30 PKT trading days, if user holds stocks | On | "Stocks +Rs 2,140 (+0.8%) today · KSE-100 +0.5%" |
| Funds NAV digest | ~21:30 PKT when new NAVs posted for held funds | On | "NAVs posted: funds +Rs 1,050 today" |
| Import ready | when `doc-intake`/`mf-import` finishes | On | "Statement read: 6 entries ready to review" |
| Data problem | feed ≥ 2 working days stale, or oversold position detected | On | one line + "See details" |
| Monthly summary | 1st of month 09:00 | On | "October: saved Rs 18,400 (+12% vs Sep)" |
| Tax reminders | 1 Jun and 25 Jun | Off | CGT so far this tax year |

Rules: at most **one** routine (digest) notification per day — if both digests apply, merge them at 21:30.
Quiet hours 22:00–08:00 (configurable). Privacy mask on → notifications say "Your daily summary is ready" without
figures. Android channels per category so users can mute in system settings. Ask for `POST_NOTIFICATIONS` only after
the first successful import or on the first visit to Invest, never at launch.

---

## 11. Performance plan ("insanely fast")

**Reference devices:** one mid-range (e.g. Galaxy A35 / Redmi Note 13 class, 6–8 GB) and one low-end (4 GB,
Android 13+). Targets are measured on release builds, not dev.

| Metric | Target |
|---|---|
| Cold start → Today with cached figures (fingerprint off) | ≤ 1.2 s mid-range, ≤ 2.0 s low-end |
| Biometric prompt dismissed → Today painted | ≤ 400 ms |
| Warm start | ≤ 400 ms |
| Tab switch | ≤ 100 ms to first paint, no blank frames |
| Scroll (1,000 transactions) | 0 dropped frames on mid-range at 60 Hz; ≥ 110 fps on 120 Hz |
| Add expense: keypad visible after `+` | ≤ 150 ms |
| JS bundle (Hermes bytecode) | ≤ 4 MB; APK per ABI ≤ 35 MB |
| Memory steady state | ≤ 250 MB |

Techniques (all required):
1. Hermes V1 bytecode, New Architecture, React Compiler enabled; no `useMemo` sprinkling where the compiler covers it.
2. Synchronous MMKV hydration before the first frame; splash held only until hydration + fonts (`expo-splash-screen`).
3. Lazy routes for heavy screens (Tax/NCCPL report, Xyro, Imports); inline requires for parser code (only loaded
   in upload flows); Xyro and PDF generation never in the startup path.
4. Server snapshots for history; engines on device only for current positions; memoised selectors per query.
5. FlashList v2 with fixed item types; `expo-image` for logos with memory+disk cache and bundled WebP logos.
6. All animations on the UI thread (Reanimated worklets); no JS-driven animation loops; no layout animations on
   long lists.
7. Prefetch on login and when the app returns to foreground (stale-while-revalidate); no request waterfalls on any
   screen (verify in Flipper/React Native DevTools network panel).
8. Android release config: R8 minify + resource shrinking, app bundle (ABI splits), Baseline Profile if the Expo
   plugin/route supports it at M6 (verify), `android:largeHeap` not used.
9. Measure: React Native DevTools profiler + Android Studio/Perfetto traces at each milestone; record numbers in §15.

---

## 12. Distribution, updates and feedback (APK, no store) + Android requirements

### 12.1 Build profiles (`mobile/eas.json`)

| Profile | Purpose | Output | Update channel | Who installs |
|---|---|---|---|---|
| `development` | development client for daily work (Fast Refresh from the PC) | debug APK, `developmentClient: true` | — | owner's S24 Ultra |
| `preview` | tester builds for feedback rounds | release-signed APK, `distribution: "internal"`, `android.buildType: "apk"` | `preview` | owner + invited testers |
| `production` | the "live" app | release-signed APK, same settings | `production` | everyone using Fintraxa mobile |

- Package name `com.fintraxa.app` (owner confirms ⛔). Debug builds use `com.fintraxa.app.dev` so both can be
  installed side by side (`app.config.ts` switches on `APP_VARIANT`).
- Builds run on EAS (cloud; the free plan has a small monthly Android build quota, so batch native changes) or locally
  with `npx expo run:android --variant release` on the owner's Windows PC (Android SDK + JDK 17).
  `eas build --local` is not supported on native Windows (WSL only) — don't plan around it.
- **Signing:** EAS-managed keystore. Immediately after the first release build, the owner downloads a backup
  (`eas credentials` → Android → download keystore) and stores it outside the repo. Losing it means every tester must
  uninstall and reinstall (server data is safe; local settings are lost).
- **Versioning:** `version` = semver (`1.0.0`), `android.versionCode` auto-incremented by EAS (`autoIncrement`), shown in
  Me › About and attached to every feedback and Sentry event.

### 12.2 Installing on phones

- EAS internal distribution gives an install page + QR code per build; or share the `.apk` file directly
  (WhatsApp/Drive). Testers need "Install unknown apps" allowed for the app they open it from; Samsung phones need
  **Auto Blocker off** while installing. Play Protect may show "unrecognised app" — "More details → Install anyway".
- Owner device setup is documented in `docs/mobile/DEVICE_SETUP.md` (Galaxy S24 Ultra). Keep it current.

### 12.3 Updates for a live, sideloaded app

- **JavaScript/asset changes** → `eas update --channel preview|production -m "…"`. `runtimeVersion` policy:
  `fingerprint` (native changes automatically get a new runtime, so an update can never reach an incompatible APK).
  The app checks for updates on launch and foreground, downloads in the background and applies on next launch;
  Me › About shows "Update ready — restart" for impatient testers. ⛔ for the `production` channel.
- **Native changes** (new native module, SDK upgrade, permissions) → new APK. The app reads `app_releases`:
  - newer `version_code` available → dismissible banner "Fintraxa 1.3 is available" → opens `apk_url` in the browser;
  - installed `version_code` < `min_supported_code` → blocking screen with the download button (used only when a
    backend change would break old builds).
- **Rollback:** republish the previous EAS Update (`eas update:republish`) — never delete a release row; set
  `min_supported_code` back if needed.
- **Release notes:** every release row has plain-language notes; the app shows them once after updating ("What's new").

### 12.4 Backend compatibility rules (because old APKs stay installed)

- Migrations are additive: new columns nullable or defaulted; new RPCs instead of changed signatures.
- Renames/drops only after `min_supported_code` excludes every build that used the old shape, and after the web app
  is updated.
- Edge Functions accept the previous request shape for at least one release.
- Each release row lists the backend migrations it depends on.

### 12.5 Feedback and crash reporting

- **Send feedback**: Me › Send feedback, and a two-finger long-press anywhere (shake is too easy to trigger in pockets).
  Sheet: category chips (Bug, Idea, Wrong number, Other), message, "attach screenshot of this screen" (captured before
  the sheet opened, privacy mask respected), auto-attached route, app version, device model, OS. Saved to
  `app_feedback`; screenshot to the `feedback` bucket. Works offline (queued).
- **Crashes and errors**: Sentry (`@sentry/react-native`) for release builds, environment = channel, release = version +
  update id; PII scrubbing (no amounts, emails, tokens, notes, document text); source maps uploaded by the EAS build hook.
- **Owner's triage**: a saved SQL view `app_feedback_open` (new + seen) and, later, a small admin page in the web app.
  Each fixed item gets `status = 'fixed'` and the version that fixed it.

### 12.6 Android platform requirements (apply even without a store)

- **Target API 36 (Android 16)** — current One UI on the S24 Ultra is Android 16-based; also keeps the door open for a
  future Play release.
  minSdk per Expo SDK default.
- **Edge-to-edge**: draw behind system bars, handle insets everywhere (`react-native-safe-area-context`), test
  3-button and gesture navigation.
- **Predictive back**: enable and test on every screen and sheet.
- **16 KB memory page support**: verify native dependencies (future devices; Play requirement if ever published).
- **Runtime permissions**: notifications (Android 13+) only — the document picker and share intent grant per-file
  access; no storage, SMS, contacts, location or camera permission in v1. No `REQUEST_INSTALL_PACKAGES` (updates
  open the browser).
- **App icon**: adaptive icon + monochrome themed icon (Android 13+), from the brand mark.
- **Splash screen** via `expo-splash-screen` (brand mark on black).
- **App shortcuts** (static): Add expense, Upload document, Invest.
- **Share target**: `ACTION_SEND` for `application/pdf` (single file) via the share-intent config plugin.
- **Samsung specifics**: test with One UI's gesture navigation, Edge panels, "Secure Folder" install, and Samsung's
  battery optimisation (notifications must still arrive; guide users to "Never sleeping apps" only if delivery fails).
- If a Play release is ever wanted: Data safety form, financial features declaration, account deletion URL, privacy
  policy, content rating, and the closed-testing period for new personal developer accounts. Not part of v1.

---

## 13. Execution plan (milestones and tasks)

Legend: **Files** = main paths touched · **Accept** = acceptance criteria · **Verify** = commands/checks to run.
Effort is for one Claude executor with owner reviews; calendar time depends on gate turnaround.

### M0 — Foundations (no user-visible change) · ~1 week

**M0-T1 Workspace and core package**
- Files: `package.json`, `packages/core/**`, `packages/tokens/**`, `src/lib/**` (shims), `scripts/**` imports,
  `scripts/sync-snapshot-engine.mjs`.
- Steps: create `packages/core` (ESM, `"type": "module"`, no deps except `decimal.js`), move pure modules listed in
  §9.1, leave re-export shims in `src/lib`, extract pure money formatter, move tokens to `packages/tokens` and build the
  MUI theme from them, update the snapshot-engine sync source.
- Accept: web app renders identically (spot-check Home, Funds, Stocks › Analytics, Money); all existing targeted tests
  pass; `sync-snapshot-engine --check` passes; `npm ls react` shows one React for web; no file in `packages/core`
  imports React, Zustand, Supabase, `window`, `document` or `localStorage` (add a test that greps for these).
- Verify: `node --test scripts/psx/*.test.mjs scripts/mf/*.test.mjs` (targeted, owner allows these), `npx eslint`
  on changed files, dev server loads the four pages.

**M0-T2 Engine parity harness**
- Files: `packages/core/test/parity.test.mjs`.
- Steps: fixture of fake trades/ledger/transactions (no real data) → run engines → snapshot expected outputs; the
  same harness will run under Hermes in M1 (Jest in `mobile`) to prove identical results.
- Accept: harness green on Node.

**M0-T3 Design references** — `docs/mobile/design-references.md` with 10–15 Dribbble/Figma references and takeaways
mapped to §7 components. Accept: owner skims and approves direction (lightweight gate).

### M1 — App shell, auth, fingerprint · ~1.5 weeks

**M1-T1 Expo app scaffold** — `mobile/` with Expo Router, TypeScript strict, New Architecture, Hermes, React
Compiler, ESLint, `jest-expo`, path alias to `@fintraxa/core`, `app.config.ts` (package `com.fintraxa.app` — confirm
with owner ⛔, scheme `fintraxa`, adaptive + monochrome icon, splash, edge-to-edge, target 36).
Accept: dev build runs on an emulator; `@fintraxa/core` parity tests pass under `jest-expo` (Hermes-compatible).

**M1-T2 UI kit + theme** — tokens → `ThemeProvider`, fonts (Inter, Inter Tight) loaded before splash hides,
components from §7.4 with a hidden `/_dev/ui` gallery screen. Accept: every component in dark + light, font scale
100% and 200%, TalkBack labels present.

**M1-T3 Supabase client + encrypted session storage** (§8.1–8.2) — Accept: sign in, kill app, relaunch → still
signed in; tokens never appear in logs; unit test for the adapter (encrypt/decrypt/round-trip, corrupted data →
signed out cleanly).

**M1-T4 Sign-in screens** — email or username + password (via `username-login`), errors, forgot password (deep link
`fintraxa://auth-callback` ⛔ redirect setting), create account. Accept: all paths work against the QA account
(owner signs in on device — Claude never types the password).

**M1-T5 Fingerprint unlock + auto-lock** (§8.2–8.4) — enrol prompt after first sign-in, biometric gate at launch,
auto-lock timer, invalidation fallback, settings toggle. Accept: on a real device: enable → relaunch → prompt →
Today; add a new fingerprint in system settings → app falls back to password; disable → no prompt.

**M1-T6 Navigation skeleton + preferences** — tabs per §4 (hidden by `tracks`), centre `+` sheet, deep links,
app shortcuts, predictive back. Includes ⛔ migration for `user_preferences` columns (§9.4).

**M1-T7 Query layer + persistence** — query factories shared from core where pure, MMKV encrypted persister,
prefetch on login/foreground, offline pill. Accept: airplane mode → every tab renders last data; cold start shows
cached Today without skeleton.

**M1-T8 Live-app plumbing** — Sentry (scrubbed), EAS Update wiring (`runtimeVersion: fingerprint`, channels), ⛔ migration for `app_releases` + `app_feedback` + bucket, update banner/forced-update screen, Send feedback sheet (offline queue), Me › About (version, update id, "check for updates"). Accept: a test EAS Update reaches the installed preview APK; a feedback item with screenshot lands in Supabase; a forced-update row blocks an old build.

**M1-T9 First tester build** — ⛔ `preview` APK on EAS, installed on the S24 Ultra via the install page. Accept: sign in, fingerprint, tabs render, feedback works. From here on every milestone ends with a preview APK or update and a feedback round.

### M2 — Read surfaces · ~2 weeks

**M2-T1 Today** — hero net worth, today's change, Needs you, Since you last looked (store `last_seen_at` per device in
MMKV; compute deltas from snapshots), privacy mask, "how it's calculated" sheet. Accept: figures equal the web Home
for the same moment (manual check on the QA account + parity tests).

**M2-T2 Money** — month hero, supporting figures, category list, transactions (FlashList, sticky month headers,
search), passive income row. Accept: equals web Money dashboard for the same month.

**M2-T3 Invest › Overview** — hero, supporting figures, value vs invested chart (snapshots), vs KSE-100 sheet, Funds/
Stocks summary rows, Tax row, More links. Accept: equals web figures for this fiscal year.

**M2-T4 Funds list + fund sheet**; **M2-T5 Stocks list + stock sheet** (logos, as-of captions, transactions, realized,
dividends). **M2-T6 Dividends list**, **M2-T7 Trades list**, **M2-T8 Imports list** (status, open review).
Accept for each: figure parity with web, empty/loading/error states designed, 0 dropped frames scrolling on
mid-range.

**M2-T9 Market prices refresh** (Me) — streams `refresh-prices` progress via `expo/fetch`. Accept: steps appear live.

### M3 — Write surfaces · ~1.5 weeks

**M3-T1 Quick add expense/income** (§6.3) with optimistic updates and offline queue. Accept: G2 met (stopwatch on
device); undo works; figures update everywhere.
**M3-T2 Edit/delete transaction** (sheet, swipe actions, confirm + undo).
**M3-T3 Manual trade** (live quote, auto fee from core, settlement date) using the server duplicate check.
**M3-T4 Manual dividend**, **M3-T5 Manual fund entry** (`mf_record_manual_entry`), **M3-T6 Categories and savings
accounts** management. Accept: every write validated with `validatePositiveNumber` equivalents before the round-trip;
errors through a mobile `dbErrorHandler` (never raw PostgREST text).

### M4 — Smart upload · ~2 weeks

**M4-T1 ⛔ Backend**: `documents` bucket + policies, `doc-intake` function, `psx_save_trades` / `psx_save_dividends`
RPCs, PGlite db tests (`scripts/psx/doc-intake-db.test.mjs`), function tests with synthetic fixtures (no real docs).
Accept: classifier correct on every existing synthetic fixture type; unknown docs return `kind: 'unknown'`;
duplicates detected by hash and by content.
**M4-T2 Upload flow UI** (§6.4): picker, hashing, progress, classification card, change type, password prompt.
**M4-T3 Share intent** (PDF from WhatsApp/Gmail/Files lands in the flow, cold and warm start).
**M4-T4 Review screens** (fund / trades / dividends variants, one component), approve → toast → figures update.
Accept: G3 met on the QA account with the owner's own documents tested **locally by the owner** (real docs never
committed); private crosscheck tests may live in `tests/private/`.

### M5 — Tax, notifications, assistant, account · ~1.5 weeks

**M5-T1 Tax screen + statement PDF** (`expo-print` HTML template fed by `nccplReport`). Accept: PDF figures equal
the web statement; shares to WhatsApp/Files.
**M5-T2 ⛔ Notifications backend** (`push_tokens`, `notify`, cron) + client (channels, permission timing, deep links,
preferences, quiet hours, privacy). Accept: each notification type delivered on device from a test trigger; at most
one routine push per day enforced by a test.
**M5-T3 Xyro sheet** (core pipeline, key in SecureStore, streaming answers). **M5-T4 ⛔ Delete account** (function +
in-app flow + web Settings). **M5-T5 Me/settings** complete. **M5-T6 (optional) Android widget** — net worth + today.

### M6 — Hardening and live release · ~2 weeks

**M6-T1 Performance pass** — measure §11 on both reference devices; fix until met; record numbers in §15.
**M6-T2 Accessibility pass** — TalkBack walkthrough of every flow, 200% font, contrast check, touch targets.
**M6-T3 E2E** — Maestro flows: sign in, fingerprint unlock (where emulator allows), add expense, upload each doc
type (fixtures), approve, tax PDF, delete account (on a throwaway account). Run in EAS or locally.
**M6-T4 Security review** — logs/Sentry scrubbed, storage encrypted, RLS on new tables, functions authenticate,
no secrets in the bundle (`grep` the exported bundle for keys), dependency audit.
**M6-T5 Release runbook** — `docs/mobile/RELEASE.md`: version bump, build, smoke test on the S24 Ultra (checklist:
cold start, fingerprint, add expense, upload each doc type, tax PDF, notifications, offline), `app_releases` row with
notes, EAS Update rules, rollback steps, keystore backup check.
**M6-T6 ⛔ Live release 1.0** — `production` APK → owner smoke test → testers in two waves (owner + 2–3 people, then
everyone) → watch Sentry crash-free/ANR and `app_feedback` for 7 days → JS fixes via `production` updates.

---

## 14. Status tracker (update after every task)

| Milestone | Status | Notes |
|---|---|---|
| M0 Foundations | Not started | |
| M1 Shell, auth, fingerprint | Not started | |
| M2 Read surfaces | Not started | |
| M3 Write surfaces | Not started | |
| M4 Smart upload | Not started | |
| M5 Tax, notifications, assistant, account | Not started | |
| M6 Hardening and release | Not started | |

---

## 15. Decisions and deviations log

| Date | Decision | Why |
|---|---|---|
| 2026-11-13 | Expo/React Native + shared pure-JS core; Android first; Supabase unchanged plus §9.4 additions | Reuses the tested engines; native feel on low-end Android; OTA updates |
| 2026-11-13 | No SMS reading, no OCR in v1 | Sensitive permission, future Play compatibility; accuracy |
| 2026-11-13 | Flutter considered and rejected | Would rewrite ~7,600 lines of tested JS money logic in Dart and re-verify it against NCCPL/AMC figures; loses code shared with the web app and Edge Functions; OTA updates need a third-party service. Flutter's rendering performance is not the issue — reuse and correctness are |
| 2026-11-13 | Distribute as signed APK (EAS internal distribution), no app store; operate as a live app | Owner wants direct installs for feedback rounds; quality bar unchanged |
| 2026-11-13 | Document recognition is deterministic (existing detectors), not an LLM | Owner rule; reproducible |

(Executor: add the chosen Expo SDK and library versions here at M0, and measured performance numbers at M6.)

---

## 16. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Two React copies in the workspace | Crashes / hooks errors | Decide in M0-T1 (`npm ls react`); fall back to `file:` dependency |
| A library not yet compatible with the SDK (bottom sheet, share intent, charts) | Blocked screen | Check compatibility at M0; alternatives: Expo Router modal sheets, native intent filter + config plugin, Skia-drawn charts |
| Biometric storage quirks (prompt on save) | Repeated prompts | Key-in-memory design (§8); real-device testing only |
| Engine output differs under Hermes | Wrong money figures | Parity harness (M0-T2) runs in both Node and `jest-expo`; any diff blocks the milestone |
| MUFAP/PSX feed delays | Stale figures | Existing `refresh-prices` + feed-health notice; "as of" captions everywhere |
| Sideload friction (Auto Blocker, "Install unknown apps", Play Protect warning) | Testers give up | One-page install guide with screenshots; install page/QR from EAS; owner helps the first wave |
| Lost signing keystore | Every tester must reinstall | Backup right after the first release build (§12.1); check it in each release runbook |
| Old APKs break after a backend change | Crashes for some testers | §12.4 compatibility rules; `min_supported_code` forced update |
| EAS free build quota runs out mid-month | Can't ship native fixes | Batch native changes; JS fixes via EAS Update; local `expo run:android --variant release` as fallback |
| Scope creep from the web feature set | Fatigue, delay | §5 table is the contract; research/tools stay web-only in v1 |
| Real documents leaking into git | Privacy | Fixtures are synthetic; real-doc checks run locally in `tests/private/` (gitignored) |

---

## 17. Definition of done (v1.0)

- All tasks in §13 accepted; §11 targets met on both reference devices and recorded.
- Figure parity with the web app proven by tests and a manual check on the QA account.
- Live release 1.0 installed by the owner and testers from the install page; update banner, forced update, EAS
  Update and Send feedback proven end to end; keystore backed up; `docs/mobile/RELEASE.md` and `DEVICE_SETUP.md` current.
- `CONTEXT.md` has a "Mobile app" section (structure, commands, release steps) and Change log lines for every task.
- Crash-free ≥ 99.7% and ANR < 0.2% (Sentry) over the first week of the live release.

---

## 18. Research sources (2026-11-13)

- Expo SDK releases: https://expo.dev/changelog/sdk-57 · https://expo.dev/changelog/sdk-56 · https://expo.dev/changelog/sdk-55
- SecureStore (`requireAuthentication`): https://docs.expo.dev/versions/v57.0.0/sdk/securestore.md ·
  save-and-read prompt behaviour: https://forums.expo.dev/t/securestore-requireauthentication-requires-auth-on-save-and-retrieval/74513 ·
  biometric refresh-token pattern: https://thoughtbot.com/blog/biometrics-authentication-for-your-mobile-app
- Supabase with Expo (encrypted session storage): https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native.md
- EAS APK builds and internal distribution: https://docs.expo.dev/build-reference/apk/ · https://docs.expo.dev/build/internal-distribution/ ·
  local builds (Windows unsupported, WSL only): https://docs.expo.dev/build-reference/local-builds.md · plans: https://docs.expo.dev/billing/plans.md
- Samsung Auto Blocker: https://www.samsung.com/uk/support/mobile-devices/protect-your-galaxy-device-with-the-new-auto-blocker-feature/
- Google Play target API: https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-AU
- Google Play SMS/Call Log policy: https://support.google.com/googleplay/android-developer/answer/10208820?hl=en
- Google Play User Data (account deletion): https://support.google.com/googleplay/android-developer/answer/10144311
- Material 3 Expressive (motion, shape): https://developer.android.com/design/ui/wear/guides/get-started/design-language
- 2026 fintech UX patterns: https://procreator.design/blog/best-fintech-ux-practices-for-mobile-apps/ ·
  https://www.designstudiouiux.com/blog/fintech-ux-design-trends/ · https://www.wavespace.agency/blog/banking-app-ux
- Inspiration galleries: https://dribbble.com/tags/fintech-app · https://www.figma.com/community/file/1198696657548170852/fintech-mobile-app-ui-design
- React Native performance 2026: https://www.rapidnative.com/blogs/react-native-performance-optimization-2026-playbook ·
  https://reactnativerelay.com/article/react-compiler-react-native-expo-2026
