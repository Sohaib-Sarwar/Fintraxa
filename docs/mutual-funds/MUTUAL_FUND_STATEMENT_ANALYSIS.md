# Mutual fund statement analysis

Analysis of the six real AMC statements supplied in
`../Mutual Fund Real Transactions Statements/` (outside the repository — the
originals are never committed). Every personal identifier is masked here:
names, addresses, phone numbers, e-mail, CNIC, registration / customer /
account / portfolio numbers, IBANs and RAAST IDs. Where a worked example is
needed to show a convention, the figures are **illustrative** and say so; the
real figures were verified privately and are not reproduced.

Analysed 2026-11-07.

## 1. Inventory

| # | AMC | File | Pages | Generator | Text layer | Period | Funds in file |
|---|-----|------|------:|-----------|-----------|--------|---------------|
| 1 | Atlas Asset Management | `Atlas Funds/Atlas Funds.pdf` | 1 | PDFium | yes | 1 month | 1 |
| 2 | MCB Investment Management | `MCB FUNDS/MCB FUnds Statement.pdf` | 9 | Oracle Reports 11g | yes | 4 months | 2 |
| 3 | Al Meezan Investment Management | `Meezan Funds/Meezan.pdf` | 3 | Crystal Reports | yes | 12 months (FY) | 4 |
| 4 | Al Meezan Investment Management | `Meezan Funds/meezan 2.pdf` | 3 | Crystal Reports | yes | ~4 months | 4 |
| 5 | NBP Fund Management | `NBP Funds/NBP statment.pdf` | 1 | Oracle Reports 10g | yes | ~5 weeks | 1 |
| 6 | UBL Fund Managers | `UBL Funds/UBL Funds_statement.pdf` | 11 | Oracle Reports 11g | yes | 10 months | 4 |

None is encrypted, none is scanned — every page has a usable text layer, so
OCR is not needed for this corpus. `Sample Trade confirmations/` holds PSX
stock trade confirmations, not fund statements, and is out of scope.

**Extraction finding that drives the design.** Reading the text layer in
stream order (or with `pdftotext -layout`) does **not** preserve rows for
NBP, MCB and UBL: amounts, units and dates come out of the stream in column
order or drift onto neighbouring lines, and MCB's wrapped descriptions
interleave with the next row's numbers. Rows must be rebuilt from glyph
coordinates (cluster text items by baseline `y`, order by `x`) before
anything is interpreted. Atlas and Meezan survive stream order, but the same
coordinate method handles them too.

## 2. Common structure

Every statement has: an identity header (PII — never sent to Gemini), a
statement period, one or more **fund sections** each with an opening unit
balance, transaction rows, and a closing unit balance and/or valuation line,
then disclaimers. All amounts are PKR.

An "account" at an AMC is **not** one fund. Meezan's single portfolio holds 4
funds, MCB's single account holds 2, UBL's customer ID holds 4. The schema
must model *account → many fund positions*, and a position is further keyed by
**unit class** (Meezan `GROWTH-B` vs `GROWTH-C`; UBL `Class 'A'` vs `Class 'B'`).

## 3. Per-AMC format

### 3.1 Atlas (1 fund, 1 page)

Columns: `NAV Date | Transaction | Gross Amount | CGT | Zakat | Net Load | Net Amount | Unit Price | No. of Units | Balance Units`.

- **"Online Sale" is a purchase** — the label is written from the AMC's side
  (the AMC sells units to the investor). "Online Redemption" is a redemption.
  A naive keyword classifier would invert this.
- Redemption: `Gross − CGT − Zakat − Load = Net`, CGT in its own column.
  Units in parentheses are outflows.
- A blank cell is printed as `-` (not reported), distinct from `0.00`.
- Footer: closing balance, valuation line (units × unit price as of a date),
  a *Dividend Payout* table (empty here, but its columns — Gross Dividend, WHT,
  Zakat, Other Deductions, Net Dividend — show where dividends and WHT would
  appear), *Summary of Investment*, *Mode of Unit Holding*.
- Dates `DD-Mon-YYYY`. Amounts 2 dp, units 4 dp, price 4 dp.
- Statement CGT is **not** reproducible as a flat 15% of the FIFO gain —
  another reason the system must store reported CGT, never compute it.

### 3.2 MCB (2 funds, 9 pages)

Columns: `Date | Nature | Units Inflow/(Outflow) | Rate | Gross Amount | FEL/BEL Load (Amount, %age) | Net Amount Inflow/(Outflow) | Balance Units`.

- **Descriptions wrap over 5–8 lines and contain PII**: the investor's name,
  the destination bank and IBAN, then a trailing numeric reference, e.g.
  `iPayment- [NAME] - [IBAN]-UBL-<6-digit ref>`. Redaction has to operate
  *inside* the description and keep the trailing reference, which is the best
  external transaction identifier any of these statements offers.
- **A redemption is two rows.** The `iPayment-…` / `APP REDEMPTION` row
  carries units (negative), rate and gross amount; the following `CGT*` row
  carries CGT in brackets in the *Gross* column and the **net payout** in the
  *Net Amount* column. Illustrative: gross 1,000 → CGT row `(2)` and net
  `(998)`. The two must be grouped into one economic event.
- `Online Investment - [NAME] - [BANK] - [IBAN]` is a purchase (gross = net,
  no load in this file).
- Rows straddle page breaks (a description begins at the foot of one page and
  ends at the head of the next, followed by its CGT row).
- **Units can go negative by rounding**: a full redemption leaves the running
  balance at `-.0001`, recovered by the next purchase. Reconciliation needs a
  unit tolerance; "insufficient units" cannot be a hard failure at 1e-4.
- Dates `DD-MON-YY`; amounts 0–2 dp (both appear in one column); units up to
  4 dp, printed without leading zero (`.0001`).
- `*Capital Gains Tax`, `**Including Taxes` footnotes define the markers.
- Valuation line per fund: units × repurchase price as on a date.

### 3.3 Meezan (4 funds, 3 pages; two consecutive statements)

Columns: `Date | Transaction Type | Inflows (PKR) | Outflows (PKR) | NAV (PKR) | No. of Units | Unit Balance`.

Page 1 is a summary: per-fund units, NAV, value, and **AMC-reported gain**
(*FYTD* and *To Date*), plus *Total Purchases* / *Total Withdrawals* for the
period. Page 2 has the transactions per fund section (full fund name with the
abbreviation in brackets, e.g. `… (AMMF)`, plus unit class).

Labels seen: `PURCHASE`, `REDEMPTION`, `CONVERT IN`, `CONVERT OUT`, `CGT`,
`CGT REFUND`, `TRANSACTION COST`, `REFUND OF CAPITAL`.

- **Outflow amounts are net of CGT.** `CONVERT OUT` / `REDEMPTION` show the
  net proceeds; the `CGT` row on the same date carries the tax. Units × NAV
  reconciles to `outflow + CGT`, not to the outflow alone.
- **`CGT REFUND` is reinvested as units** at that day's NAV — a real unit
  inflow, unlike a cash refund. It is counted in the period's *Total
  Purchases*.
- **`REFUND OF CAPITAL`** issues units with the NAV column printed `0.0000`
  (NAV not reported — must be stored as null, not 0).
- **`TRANSACTION COST`** is deducted from a conversion inflow before units are
  allotted: `inflow − transaction cost ≈ units × NAV`.
- **Same-date, same-amount, same-type rows that are different
  transactions**: one fund has two `CONVERT OUT` rows on one date for the
  same amount at the same NAV, with *different* unit counts and *different*
  CGT. Deduplicating on date + amount + type would silently delete a real
  transaction.
- Amounts are rounded to whole rupees; units and NAV 4 dp. Reconciliation
  tolerance must follow the printed precision.
- Statement chaining: the second statement's opening unit balances equal the
  first statement's closing balances — a continuity check between imports.
- The AMC's *To Date* gain equals `current value + net outflows − inflows`
  per fund, with CGT refunds and refund-of-capital units *not* counted as
  inflows. This is an independent figure the profit engine can be tested
  against.
- CGT amounts across same-day conversions are consistent with **FIFO** lot
  relief and inconsistent with average cost.

### 3.4 NBP (1 fund, 1 page)

Columns: `Date | Transactions | Price Date | Units | Price | Amount`.

- One economic event spans several rows with no date on the continuation
  rows: `Investment` + `Front End Load on Investment` + `Taxes on Front End
  Load`; and `Gross SwiftPAY` (or `Gross Redemption`) + `Capital Gain Tax` +
  `Net SwiftPAY` (or `Net Redemption`).
- `SwiftPAY` is an instant redemption channel, not a different event type.
- **Price date differs from transaction date** (redemption priced the day
  before the transaction row).
- Explicit `0.00` load and tax-on-load rows: reported zero, not missing.
- Summary block reports **Realized Gain/(Loss)**, **Unrealized**, **Gross Cash
  Dividend**, **Total Gain**, since inception and for the period. The realized
  gain equals gross proceeds minus FIFO cost (before CGT).
- **The statement says: "Upon redemption for capital gain tax purpose, First In
  First Out method applies."** This is the only statement that names the
  method explicitly.
- No running unit balance column — row-level reconciliation must use the
  opening/closing balances only.
- Dates `DD-MON-YY`.

### 3.5 UBL (4 funds, 11 pages)

Columns: `Date & Type of Transaction | Gross Amount | Load (Rs.)-(%) | Charges | CGTax/Tax | Net Amount | Unit Price (NAV) | Price Applicable Date | Number of Units | Balance Units`.

- One header block per page (PII), one fund per section; a fund's section can
  run over several pages (one fund spans pages 2–9).
- Date sits on its own line *above* the transaction label.
- Labels seen: `Initial Purchase`, `Additional Purchase`,
  `Redemption (Withdrawal)`, `Conversion To (<fund>)`,
  `Conversion From (<fund>)`, and **`Additional Purchase (CGT-Refund)`** —
  a CGT refund reinvested as units, labelled as a purchase, with
  `(CGT-Refund)` wrapped onto a second line. Losing the wrapped line turns a
  tax refund into an ordinary investment.
- `Gross − CGT − Load − Charges = Net`. CGT printed as `0` on some conversions
  (reported zero) and blank on purchases (not applicable).
- **Price applicable date can precede the transaction date** (refund row
  dated in July, priced at a June NAV).
- Units and balance units printed to **2 dp**; amounts rounded to the rupee
  (footnote says so). Unit tolerance per row is 0.005.
- Footer per fund: valuation line (`value of your investment in <abbr> is
  Rs.X (valued @ <date> price i.e. <price>)`). The page footer also states
  the CGT regime (15% for individual filers on mutual funds).

## 4. Cross-AMC vocabulary

| Economic event | Atlas | MCB | Meezan | NBP | UBL |
|---|---|---|---|---|---|
| Purchase | Online Sale | Online Investment | PURCHASE | Investment | Initial / Additional Purchase |
| Redemption | Online Redemption | iPayment, APP REDEMPTION | REDEMPTION | Gross/Net SwiftPAY, Gross/Net Redemption | Redemption (Withdrawal) |
| Switch out / in | — | — | CONVERT OUT / IN | — | Conversion To / From (fund) |
| CGT deducted | CGT column | CGT* row | CGT row | Capital Gain Tax row | CGTax column |
| CGT refund (as units) | — | — | CGT REFUND | — | Additional Purchase (CGT-Refund) |
| Distribution as units | (Dividend Payout table) | — | REFUND OF CAPITAL | — | — |
| Load | Net Load column | FEL/BEL column | — | Front End Load on Investment | Load column |
| Tax on load | — | (included, `**`) | — | Taxes on Front End Load | — |
| Fee / cost | — | — | TRANSACTION COST | — | Charges column |
| Zakat | Zakat column | — | — | — | (in Charges) |
| WHT | Dividend table | — | — | — | — |

Not present in any supplied statement but anticipated by the schema: cash
dividend, dividend reinvestment, bonus units, unit transfer in/out, zakat
deduction, cash-only CGT reversal (e.g. an NCCPL credit).

## 5. Conventions that the engine must parameterise

| Convention | Atlas | MCB | Meezan | NBP | UBL |
|---|---|---|---|---|---|
| Rows per redemption | 1 | 2 | 2 | 3 | 1 |
| Redemption amount printed | gross + net | gross, then net on CGT row | **net only** + CGT row | gross, CGT, net | gross + net |
| Amount precision | 2 dp | 0–2 dp | 0 dp | 2 dp | 0 dp |
| Unit precision | 4 dp | 4 dp | 4 dp | 4 dp | **2 dp** |
| Running unit balance | yes | yes | yes | no | yes |
| Separate price date | NAV Date | no | no | yes | yes |
| Negative numbers | `(x)` | `(x)` | `-x` / outflow column | `( x)` | `(x)` / `( x)` |
| AMC-reported gain | no | no | FYTD + To Date (net of net CGT) | realized/unrealized (gross) | no |
| Cost method stated | no | no | no (data consistent with FIFO) | **FIFO, stated** | no (data consistent with FIFO) |

These are per-AMC *statement profiles* (configuration consulted by
validation and reconciliation), not separate schemas — every AMC lands in the
same tables.

## 6. Implications

1. Coordinate-based row reconstruction is mandatory; stream text is unsafe.
2. Gemini must group multi-row events (MCB 2, Meezan 2, NBP 3) and cite the
   source lines it used, so the grouping can be verified deterministically.
3. Labels must be classified with the AMC in context ("Sale" at Atlas = buy).
4. CGT refunds come in two forms — reinvested as units (Meezan, UBL) and,
   potentially, cash — and must be distinguished by whether a unit movement
   is printed, never assumed.
5. Null ≠ 0 occurs in real data: `-` cells, `0.0000` NAV on refund-of-capital,
   explicit `0` CGT on conversions.
6. Identical-looking same-day transactions occur in real data.
7. Tolerances must derive from printed precision per AMC.
8. PII appears inside transaction descriptions (MCB), not only in headers.
