# Mutual fund statement import — implementation plan

> **Superseded in part (2026-11-07).** Gemini extraction was dropped at the
> owner's request: statements are parsed by deterministic per-AMC parsers
> (`supabase/functions/_shared/mf/parsers/`) — faster, exact and nothing
> leaves Supabase. Everything else here (schema, staging, approval,
> append-only ledger, duplicates, reconciliation, FIFO) was built as planned.

Status: **awaiting approval.** Nothing in the database, the app code or
Supabase configuration has been changed. The only files written are this plan
and `MUTUAL_FUND_STATEMENT_ANALYSIS.md`.

Companion: [MUTUAL_FUND_STATEMENT_ANALYSIS.md](./MUTUAL_FUND_STATEMENT_ANALYSIS.md).

---

## 1. Existing architecture assessment

**Shape.** Vite + React SPA (PWA). No application server: the browser talks to
Supabase (Postgres + PostgREST + Auth) with the user's JWT; authorisation is
RLS. Market data is a static JSON service (MUFAP snapshot, current day only —
no NAV history).

**Mutual funds today** — one table, three screens:

| Piece | What it does | Problem for this project |
|---|---|---|
| `mutual_fund_transactions` | `nav`, `investment_amount`, `units` all NOT NULL; `type in (buy, sell)`; `investment_amount > 0` | Cannot represent CGT, refunds, loads, switches, distributions, null NAV, multi-row events, unit class, account, source document |
| `AddFund.jsx` | Manual buy at today's MUFAP offer price; JS float units | No sell UI exists — all 12 live rows are buys |
| `Dashboard.jsx` | **Average cost**, JS floats, prices looked up by *fund name* | Not FIFO; float drift; a fund rename breaks valuation |
| `Analytics.jsx`, `useAggregatedAssets.js`, `AddTransaction.jsx` (free cash) | Re-derive holdings / cash from the same table with floats | Four independent copies of the holdings logic |

**Live database (read-only inspection, 2026-11-07).** 9 auth users, 1 admin.
`mutual_fund_transactions`: **12 rows, 1 user, all manual buys**, approximate
dates (e.g. 2026-03-01), `fund_id` holds the fund *name* (pre-slug rows). They
do **not** match the statements (e.g. 5 manual buys of Meezan Islamic Fund vs
one 16,000 conversion on the statement). No storage buckets, no edge
functions. Extensions: `pgcrypto`, `uuid-ossp`, `supabase_vault`.
Security advisors: only pre-existing warnings (SECURITY DEFINER admin
functions callable by `authenticated`, which self-check `is_admin()`;
leaked-password protection off).

**Drift.** The repo has 2 migration files; the live history has 6 migrations
with different versions. New migrations will be added as files *and* applied
with the Supabase MCP, and the drift is documented, not "fixed" by resetting.

**Baseline tests (before any change).** `npm run lint` clean · `npm test`
16/16 pass · `npm run build` succeeds. `test:contract` (live market API) to be
run before and after.

**Secrets.** `GEMINI_API_KEY` is in `fintraxa-app/.env.local` (gitignored by
`.env.*` and `*.local`; not `VITE_`-prefixed, so not in the bundle). It must
become a Supabase Edge Function secret; the browser never sees it.

---

## 2. PDF statement analysis

See the companion document. Decisive findings:

- Text stream order is **unsafe** for NBP, MCB, UBL → rebuild rows from glyph
  coordinates.
- Multi-row events (MCB 2 rows, Meezan 2, NBP 3) and page-straddling rows.
- PII inside MCB transaction descriptions (name + IBAN + ref).
- CGT refunds **reinvested as units** (Meezan `CGT REFUND`, UBL
  `Additional Purchase (CGT-Refund)`); Atlas calls a purchase "Online Sale".
- Real same-day, same-amount, same-type, different-transaction rows (Meezan).
- Null vs zero in real data (`-`, `0.0000` NAV, explicit `0` CGT).
- FIFO: **stated** by NBP; Meezan and UBL CGT figures are consistent with FIFO
  and (for Meezan) inconsistent with average cost; Atlas/NBP CGT is not
  reproducible from a flat rate → reported CGT is stored, never computed.

---

## 3. Existing schema limitations

1. NOT NULL `nav`/`units`/`investment_amount` → cannot store a CGT row, a
   refund of capital with no NAV, or a fee.
2. `type ∈ {buy, sell}` → no switches, distributions, refunds, taxes.
3. No account, AMC, unit class, statement, page or evidence → no provenance,
   no reconciliation, no dedupe.
4. `fund_id` = slug for new rows, name for old rows → inconsistent identity.
5. Free UPDATE/DELETE by the owner → not an auditable ledger.
6. No uniqueness → nothing stops the same event twice.

---

## 4. Proposed normalized architecture

### 4.1 Where each layer runs

| Layer | Runs in | Why |
|---|---|---|
| 1 Document processing (validate, text, rows, redaction) | Supabase **Edge Function** (Deno) | Keeps PDFs and the Gemini key server-side; no new server to operate |
| 2 Gemini extraction | same Edge Function | key stays a server secret |
| 3 Validation, dedupe, reconciliation | shared pure JS module (Edge Function + tests) **and** SQL constraints | deterministic, unit-testable with the existing `node --test` harness |
| 4 Staging + approval | Postgres tables + `SECURITY DEFINER` RPCs | atomic, row-locked, idempotent |
| 5 Ledger | Postgres, append-only | integrity enforced by the database, not the client |
| Portfolio engine (FIFO, P&L, XIRR) | shared pure JS module using exact decimals, run in the client over the approved ledger | reproducible, versioned, testable offline |

The PDF goes browser → **private** Storage bucket `mf-statements/<uid>/<sha256>.pdf`
(RLS: owner-only folder) → Edge Function. Nothing else leaves the trusted
environment except redacted row text sent to Gemini.

**Edge Function limits.** Supabase caps CPU per invocation (~2 s) and wall
clock. So the pipeline is a **resumable state machine driven by the client**,
one bounded step per call, every step idempotent:

```
create  → validate PDF, hash, extract rows, redact, plan chunks   (status: parsing → extracting)
chunk k → Gemini on chunk k, validate schema, store candidates     (repeat; retry-safe)
finalize→ normalise, evidence-check, dedupe, reconcile, stage     (status: awaiting_approval)
```

A refresh or dropped connection resumes from the first unfinished step.

### 4.2 Tables (all additive; legacy table untouched)

Reference (readable by any signed-in user, written only by service role / RPC):

- `mf_amcs` — AMC, short name, statement profile (precision, row grouping,
  sign conventions — the table in analysis §5).
- `mf_funds` — fund, AMC, MUFAP slug (nullable), category, currency.
- `mf_fund_aliases` — normalised statement names/abbreviations → fund
  (`AMMF`, `AL MEEZAN MUTUAL FUND (AMMF)`, …). Unknown names prompt the user
  once in review; the answer is saved as an alias.

User-owned (RLS: owner `select`; writes only via RPC):

- `mf_accounts` — user, AMC, **masked** account ref (`••1386`) + salted
  SHA-256 of the normalised account number (for matching; raw number not
  stored), label. Many accounts per AMC allowed.
- `mf_statement_imports` — lifecycle (`uploaded, parsing, redacting,
  extracting, validating, awaiting_approval, partially_approved, approved,
  rejected, failed, completed_with_warnings`), file SHA-256 (**unique per
  user**), storage path, page count, period, AMC, account, model id, prompt
  version, parser version, schema version, per-stage timestamps, error
  `{stage, category, safe_message, retryable, recovery_action}`,
  reconciliation JSON, correlation id.
- `mf_import_chunks` — (import, chunk) unique; pages, status, attempts,
  input hash, last error. Makes retries safe and shows which chunk failed.
- `mf_import_lines` — the **redacted** reconstructed lines (page, line id,
  text). This is the evidence shown in review. Unredacted text is not stored.
- `mf_staged_transactions` — one row per extracted economic event:
  raw Gemini JSON (verbatim), cited line ids, original label, canonical type,
  normalised fields, components, warnings, missing fields, validation
  results, duplicate status + link, review status (`pending_review, approved,
  rejected, excluded, duplicate, requires_attention`), **user edits stored
  separately** from the AI values. Unique on (import, first cited line) so
  re-running a chunk cannot double-stage.

Ledger (append-only — no UPDATE/DELETE grants; trigger rejects them):

- `mf_ledger_entries` — user, account, fund, unit class, canonical type,
  original label, trade date, price date, NAV (nullable), **signed unit
  delta** (nullable), gross amount (nullable), net amount (nullable), investor
  cash direction, currency, external ref, redacted description, origin
  (`statement | manual | legacy_migration`), source import / staged row /
  page, fingerprint + occurrence index, `reverses_entry_id`, approved by/at.
- `mf_ledger_components` — entry, type (`cgt, cgt_reversal, cgt_refund,
  zakat, wht, front_load, back_load, load_tax, transaction_cost, charge,
  other`), amount, direction, `reported_zero` flag, optional link to the CGT
  entry it reverses. Also used for **standalone** tax adjustments.
- `mf_nav_history` — fund, NAV date, NAV, repurchase price, source
  (`statement | mufap_snapshot | manual`), source ref, verified flag,
  imported at. Insert-only; a corrected value is a new row, never an
  overwrite.
- `mf_audit_log` — actor, action, entity, before/after, correlation id.
  Insert-only.

All money, units and prices are `numeric` (unbounded; no floats anywhere,
including the JS engine, which uses an exact-decimal library).

Derived (not stored as truth): lots and redemption allocations are computed by
the versioned engine from the ledger; optionally cached later in a
`mf_lot_allocations` table stamped with the engine version.

### 4.3 Canonical classification

`purchase, redemption, switch_in, switch_out, transfer_in, transfer_out,
dividend_cash, dividend_reinvest, bonus_units, capital_refund_units,
cgt_deduction, cgt_reversal, cgt_refund_cash, cgt_refund_reinvest,
zakat_deduction, wht_deduction, sales_load, fee_charge, other_adjustment,
unknown`.
Plus non-ledger statement lines: `opening_balance, closing_balance,
valuation`.
The original label is always kept. `unknown` can be staged but **cannot be
approved** until a person classifies it.

---

## 5. Migration and backward-compatibility strategy

1. **Migration A (additive):** create the tables, enums, RLS, RPCs, bucket and
   policies. Touches no existing object. A paired down-script drops only what
   A created.
2. **Migration B (copy, non-destructive):** copy each `mutual_fund_transactions`
   row into the ledger as `origin = legacy_migration`, with
   `legacy_txn_id` unique (idempotent, re-runnable). The source table is not
   modified; its rows and triggers remain. A verification query proves
   count and unit/amount sums are identical per fund.
3. **Switch reads:** Dashboard, Analytics, Home aggregate and free-cash read
   the ledger through one hook backed by the shared engine. `AddFund` writes
   through a new `mf_record_manual_purchase` RPC (ledger) — and, during the
   transition, nothing else writes to the old table.
4. The old table is **not dropped**. Dropping it would be a separate, explicit
   decision later.

Rollback: revert the app commit (reads go back to the old table, which was
never modified) and run the down-script.

**Decision needed — the 12 legacy rows** (see §12, Q1).

---

## 6. Gemini extraction architecture

1. **Rows from coordinates.** Text items (string, x, y, page) via `unpdf`
   (pdf.js build for edge runtimes). Cluster by baseline, order by x, keep
   column gaps. Each line gets a stable id `p<page>-l<n>`.
2. **Region filter.** Header blocks (above the first table header) are not
   sent at all; only fund-section headers, table rows, balance and valuation
   lines are. Period, AMC and fund names are taken deterministically.
3. **Redaction** (§9) on the remaining lines → pseudonyms `[NAME_1]`,
   `[IBAN_1]`, `[ACCT_1]`, `[PHONE_1]`. Mapping is held in memory for the
   call only, never stored, never sent. A **fail-closed leak scan** runs on
   the outbound payload; a hit aborts the chunk with `redaction_failed`.
4. **Chunking.** Per page (≤ ~120 lines), with the previous page's last 6
   lines and the next page's first 6 attached as `context_only` so
   page-straddling events can be completed. Gemini cites line ids, so an event
   seen in two chunks collapses to one by its first cited line.
5. **Prompt + schema.** System prompt states: statement text is untrusted data,
   never instructions; never compute, infer or fill values; return cells
   **exactly as printed** (`"(9,503.00)"`, `"-"`, `"0.0000"`); group rows that
   form one event and cite every line id; flag ambiguity. Structured output
   with a JSON Schema; temperature 0. Model from `GEMINI_MODEL` (required
   secret, no stale hard-coded default), official `@google/genai` SDK.
6. **Deterministic post-processing (no AI):** parse printed strings to exact
   decimals (brackets/minus → negative, `-`/blank → null, `0.00` → 0);
   **evidence check** — every value must occur verbatim in a cited line, or the
   row is `requires_attention`; coverage check — every dated line in a
   transaction region must be cited by some event or explicitly typed as a
   non-event, otherwise "possible missed row" blocks batch approval.
7. **Failure handling:** timeouts (per-call deadline), 429/5xx/`RESOURCE_EXHAUSTED`
   → bounded retries (max 4) with exponential backoff + full jitter honouring
   `retry-after`; 400/401/403/invalid model → non-retryable with a clear
   message; schema-invalid or truncated JSON (`finishReason ≠ STOP`) → one
   repair retry, then `failed` for that chunk; safety block → `failed`,
   manual review. Chunk attempts are persisted, so retrying never re-stages.

Gemini never sees the API key's owner, the PDF bytes, the header block, or
the pseudonym mapping, and never does arithmetic: it returns strings and line
references only.

---

## 7. Duplicate-detection strategy

1. **File:** SHA-256 recomputed server-side; `unique (user_id, file_sha256)`.
   Same PDF again → the existing import is returned (concurrent uploads hit
   the constraint; the loser gets the winner's id).
2. **Event fingerprint:** SHA-256 of (account, fund, unit class, trade date,
   canonical type, units at printed precision, gross, net, NAV). Description
   is *not* in the fingerprint (formats change); external ref is compared
   separately.
3. **Occurrence index:** the k-th event with the same fingerprint *within one
   statement* (in statement order) gets index k. Ledger constraint
   `unique (user_id, account_id, fund_id, fingerprint, occurrence_index)`.
   - Two genuine identical same-day trades → indexes 1 and 2 → both kept.
   - An overlapping later statement reproduces both → same keys → both
     detected as exact duplicates, neither re-imported.
   - The Meezan same-day `CONVERT OUT` pair differs in units → different
     fingerprints → both kept.
4. **Classification** for every staged event against the ledger (same
   account + fund, date as the first filter, never the only one):
   `exact_duplicate` (fingerprint + index match, or same external ref) → cannot
   be approved; `probable_duplicate` (same date and type, values equal within
   printed-precision tolerance, or same ref with differing values) → review;
   `same_date_different` → new, informational note; `new`; `ambiguous` →
   review. Also checked against `legacy_migration`/`manual` entries in the
   same fund within ±7 days.
5. **Concurrency:** approval RPC takes `pg_advisory_xact_lock` on (user,
   account), re-runs the duplicate check inside the lock, inserts with
   `on conflict do nothing` and verifies the count, and records an
   **idempotency key** (`unique`) — a retried or double-clicked approval
   returns the original result.

---

## 8. Financial calculation and reconciliation strategy

### 8.1 Engine (deterministic, versioned `ENGINE_VERSION`)

- Position = (account, fund, unit class). Units = Σ signed unit deltas of
  approved, non-reversed entries.
- **Lots**, FIFO by price date then statement order: `purchase`, `switch_in`,
  `transfer_in`, `dividend_reinvest`, `cgt_refund_reinvest`,
  `capital_refund_units` create lots (cost = amount actually invested, load
  treatment configurable); `bonus_units` → zero-cost lot (flagged).
  A **cash** CGT refund creates **no** lot.
- `redemption`, `switch_out`, `transfer_out` consume lots FIFO →
  realized gross gain = gross proceeds − allocated cost. A switch is a
  disposal + acquisition (Meezan charges CGT on CONVERT OUT, confirming it).
- Method is configured **per AMC with recorded evidence**: NBP
  `FIFO — stated on statement`; Meezan/UBL `FIFO — consistent with reported
  CGT`; MCB/Atlas `FIFO — industry default (Sec. 37A / NCCPL), not confirmed
  by statement`. Realized cost basis is labelled *computed* (never presented as
  the AMC's figure) and *estimated* where the method is unconfirmed.
- An opening balance with no prior history has unknown cost → realized and
  unrealized for that position are marked **incomplete**, not guessed (user
  can import the earlier statement or enter a cost).

Metrics kept separate: market value · external cash invested · external cash
received · realized gross · unrealized gross · gross total · CGT deducted ·
CGT reversed · CGT refunded · **net CGT = deducted − reversed − refunded**
(never clamped) · other taxes and charges · net profit after reported charges
· investor XIRR (external flows + terminal value) · fund NAV return
(MUFAP-reported returns; NAV history once accumulated).

Cross-checks built into the tests using the real statements: Meezan *To Date*
gain per fund, NBP realized gain — computed by the engine and compared with the
AMC's own figure.

### 8.2 Valuation

Latest NAV for the fund by date across `mf_nav_history` and the live MUFAP
snapshot (repurchase price, matched by **slug**, not name), always displayed
with its date and source; flagged *stale* past 3 working days; never called
"live".

### 8.3 Reconciliation (blocks batch approval on material differences)

Per import and position, with tolerances from printed precision
(e.g. unit tolerance = rows × ½ unit of the last printed digit):

- opening + Σ unit deltas = closing (and every printed running balance — this
  pinpoints a missed row);
- units × NAV ≈ gross (Meezan: ≈ net + CGT; Meezan transaction cost: ≈ inflow −
  cost);
- gross − CGT − zakat − load − charges = net (per AMC convention);
- statement continuity: this opening = previous import's closing;
- ledger holdings vs latest statement closing.

Each result is `exact | rounding | missing_source | material | unexplained`
and shown to the reviewer. Nothing is adjusted to make it balance.

---

## 9. Security and privacy

- Gemini key: Edge Function secret only; never logged, returned or bundled.
- Edge Function verifies the JWT and import ownership on every call; RLS on
  every table (with explicit `GRANT`s, since new tables may not be exposed to
  the Data API by default); policies use `to authenticated` **plus**
  `(select auth.uid()) = user_id`, and UPDATE policies carry `with check`.
- Privileged write logic (approve, reject, reverse, record manual purchase)
  lives as `SECURITY DEFINER` functions in a **non-exposed `mf_private`
  schema**, each starting with an `auth.uid()` ownership check and a pinned
  `search_path`. The API surface is thin `SECURITY INVOKER` wrappers in
  `public`. Default `EXECUTE` is revoked from `public`/`anon`. This keeps new
  functions out of the "SECURITY DEFINER callable via REST" advisor finding
  that the existing admin functions trigger.
- Any view over user data is created `with (security_invoker = true)`.
- The Storage bucket gets explicit INSERT + SELECT policies scoped to
  `(storage.foldername(name))[1] = auth.uid()::text`. There is no UPDATE
  policy: a re-upload of the same hash is a no-op, not an overwrite.
- Authorisation never reads `user_metadata`.
- Advisors (`get_advisors` security + performance) are run after every
  migration, with zero new findings as the bar.
- Upload validation: `%PDF-` magic, ≤ 10 MB, ≤ 40 pages, not encrypted, has a
  text layer; storage path is derived server-side from uid + hash (no
  client-chosen paths → no traversal). Per-user rate limit on imports.
- Redaction: labelled header fields (name, address, CNIC, registration /
  customer / account / portfolio no., IBAN, RAAST ID, phone, e-mail) are
  harvested first and redacted everywhere they recur; pattern rules for IBAN
  `PK\d{2}[A-Z]{4}\d{16}`, CNIC, PK mobile numbers, e-mail, and long bare digit
  runs in the description column; amounts, units, NAVs, dates, fund names and
  short trailing transaction refs are preserved. Fail closed.
- Logs: structured JSON with correlation id, stage, category, counts and
  durations — no document text, no amounts, no identifiers.
- Prompt injection: statement text is fenced and declared data; output is
  schema-constrained and can only cite line ids and copy printed strings, so
  an injected instruction cannot write to the database.

---

## 10. UI

- **Upload icon** in the Mutual Funds page header (`UploadFileRounded`, with
  tooltip "Import statement"), opening an upload dialog; plus an **Imports**
  sub-page (`/funds/imports`) listing imports with status, and a **Review**
  screen (`/funds/imports/:id`).
- Review shows per event: original label, canonical type, dates, gross, net,
  NAV, units, CGT / refund / other components, page + highlighted redacted
  evidence lines, duplicate and reconciliation badges, missing fields; edit
  dialog (AI value and corrected value both kept); exclude; approve selected /
  approve all clean (atomic).
- Dashboard: holdings and P&L from the engine — realized vs unrealized,
  CGT deducted / refunded / net, net profit, XIRR, NAV date + source, method
  label per AMC.

---

## 11. Testing plan

All runnable with the existing `node --test` harness unless noted.

- **Row reconstruction & redaction:** sanitized text-item fixtures (positions
  from the real PDFs, PII replaced) for all five layouts: page-straddling rows,
  wrapped descriptions, `-`/`0.0000`/`(x)`, 2-dp units, leak scanner.
- **Gemini (mocked):** valid output, malformed JSON, truncated, missing
  fields, unknown labels, CGT refund as units, same-date rows, chunk overlap
  collapse, hallucinated value rejected by evidence check, retry/backoff and
  non-retryable errors.
- **Duplicates:** the 12 mandatory scenarios — pure-logic cases in unit tests;
  concurrency cases (parallel uploads, parallel approvals, retry after
  failure) as **integration tests against the live project using the QA
  account** (RLS-isolated from real users).
- **Accounting:** every case in the brief, with independently hand-computed
  expected values; plus the real-statement cross-checks (Meezan To Date, NBP
  realized) kept in a **gitignored** `tests/private/` suite so real figures
  never enter git.
- **Regression:** lint, existing 16 unit tests, build, `test:contract`,
  before and after; contract tests for the legacy-compatible reads.
- **End to end:** browser run with the QA account: upload → review → approve
  → dashboard.

Results will be reported as actually run: passed / failed / skipped.

---

## 12. Files expected to change

New:
`supabase/migrations/2026110700000{0,1}_mf_*.sql` (+ down script),
`supabase/functions/mf-import/index.ts`,
`supabase/functions/_shared/mf/{pdfRows,redact,extractSchema,prompt,gemini,normalize,validate,dedupe,reconcile}.js`,
`src/lib/mf/{engine,decimal,fingerprint}.js` (shared with the function),
`src/features/mutual-funds/{ImportDialog,Imports,ImportReview}.jsx`,
`src/features/mutual-funds/useMfPortfolio.js`,
`scripts/mf-*.test.mjs`, `scripts/mf-integration-test.mjs`,
`docs/mutual-funds/{MUTUAL_FUNDS_ARCHITECTURE,MUTUAL_FUND_DATA_DICTIONARY,MUTUAL_FUND_TESTING}.md`.

Changed:
`src/features/mutual-funds/{Dashboard,Analytics,AddFund,MFSection}.jsx`,
`src/features/home/useAggregatedAssets.js`,
`src/features/income-expense/AddTransaction.jsx` (free-cash source),
`src/lib/dbErrors.js` (new constraint messages), sidebar/routes,
`package.json` (`decimal.js`; test script), `CLAUDE.md`, `.gitignore`
(`tests/private/`, QA credentials file).

Dependencies added: `decimal.js` (exact arithmetic in JS — the one
unavoidable addition). Edge Function only: `unpdf`, `@google/genai`
(imported by the Deno runtime, not bundled into the app).

---

## 13. Risks and unresolved questions

Risks:
- Edge CPU limit on large PDFs → mitigated by per-step invocations; a 40-page
  cap.
- Gemini grouping errors on unseen layouts → caught by evidence, coverage and
  running-balance checks; never auto-approved.
- MUFAP has no NAV history → fund-level return uses MUFAP's published returns
  until our own history accumulates.
- Load / transaction cost in cost basis and refund-of-capital lot treatment
  are not documented by any statement → configurable, flagged *estimated*.
- Scanned PDFs: none in this corpus. **Proposed:** reject with a clear message
  in v1 (local OCR in the edge runtime is not practical); add OCR later only
  if a scanned statement appears.

- No local Supabase stack (no CLI, no Docker), so there is nowhere safe to
  iterate on SQL. **Proposed:** iterate on a temporary Supabase **branch**,
  then apply the final reviewed migration to production with
  `apply_migration` once. Branches are billed per hour; delete it afterwards.
  The cheaper fallback is to apply the reviewed, purely additive migration
  straight to production.

Decisions I need from you (also in the chat message):

- **Q1 — legacy rows.** The 12 manual rows overlap funds the statements cover
  but don't match them. Proposed: migrate them into the ledger as
  `legacy_migration`, and when a statement for that fund is approved, offer to
  **supersede** them with reversal entries (preserved and auditable, excluded
  from totals). Alternatives: keep counting them; or exclude them now.
- **Q2 — QA account e-mail.** A plus-address on your mailbox (sign-up
  confirmation lands with you) or a confirmed-by-SQL test address. The
  password is generated locally into a gitignored file and never printed.
- **Q3 — real statements in testing.** May the QA account process the real
  PDFs end to end (redacted rows go to Gemini; data lives only in the QA
  account; the real-figure assertions stay in gitignored tests)?
- **Q4 — the Gemini secret.** Set `GEMINI_API_KEY` and `GEMINI_MODEL` as Edge
  Function secrets yourself in the dashboard (keeps the key out of this
  session entirely — recommended), or let me push it from `.env.local` via
  the CLI after you log in.
