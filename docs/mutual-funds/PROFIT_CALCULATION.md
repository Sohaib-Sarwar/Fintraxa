# Mutual fund profit — how every number is calculated

This is the reference for the figures on the Mutual Funds dashboard, Analytics
and the fund details window. It is written for two readers: the owner (what
each number means) and anyone changing the code, including Claude (the rules
that must not drift).

**Code:** `src/lib/mf/profit.js` → `analyzeFunds()`, read by the screens
through `useMfAnalysis(range, { amcId, fundId })` in `src/lib/mf/useMfPortfolio.js`.
**Tests:** `scripts/mf/profit.test.mjs` (hand-worked cases) and
`tests/private/profit-crosscheck.test.mjs` (real statements, local only).

---

## 1. Inputs

| Input | Where it comes from |
| --- | --- |
| Transactions | `mf_ledger_entries`: approved statement rows, manual entries, migrated rows. Numbers are read as text and kept as exact decimals. |
| Tax and charges on a transaction | `mf_ledger_components`: `cgt`, `cgt_refund`, `cgt_reversal`, `zakat`, `wht`, loads, charges. |
| Prices | MUFAP (today's repurchase price/NAV), statement valuation prices (`mf_nav_history`), and the NAV printed on each transaction. |
| Date range | The global filter (`src/lib/dateRange.js`): this fiscal year (1 Jul – 30 Jun) by default, YTD, other presets, or custom. A range ending in the future stops at today. |

A reversed entry and the reversal that cancels it are both ignored.

---

## 2. The one pass: FIFO lots

Each holding (account + fund + unit class) is replayed oldest first.

- **Units in** (purchase, switch in, transfer in, dividend reinvested, bonus,
  refund-of-capital units, CGT refund paid as units) add a **lot**:
  `{ date, units, cost }`. Cost = gross amount (bonus units cost 0).
- **Units out** (redemption, switch out) take units from the **oldest lots
  first** (FIFO, the method AMCs use for CGT, Sec. 37A / NCCPL). The cost of
  the units taken is their share of each lot's cost. That makes one
  **realization**:

  ```
  proceeds = gross amount of the sale (or net + CGT + deductions if only net is printed)
  cost     = FIFO cost of the units sold
  gain     = proceeds − cost
  cgt      = CGT component on that sale (what the statement deducted)
  ```

  A **transfer out** moves units and their cost away and gains nothing.
- **Tax events** are kept separately, dated: CGT deducted on a sale or on its
  own (+), CGT refunds and reversals (−), including a refund paid as units.
- **Distributions** (cash dividend, dividend reinvested, refund of capital)
  count as realized income on their date.

Rounding: statements round units (UBL to 2 dp, MCB to 4 dp), so a full sale can
be a few hundredths more than the rounded purchases added up to. Up to
**0.05 units** over is treated as rounding: the holding closes at zero. More
than that is flagged `sold_more_than_recorded` (an earlier statement is
probably missing) and the realized figure is marked incomplete.

---

## 3. The figures

### Invested
`Σ cost of the lots still held at the end of the range`

The money still at work. A redemption removes the cost of the units it sold,
so a fully redeemed fund adds nothing. (This is not "total deposits".
Deposits in the range are reported separately.)

### Current value
`units held at the end of the range × price on that date`

The price is the latest observation **on or before** the end date (market feed
preferred on a tie). For a past range, the price known then is used, never
today's. No price → value unknown (shown "—" and flagged `no_price`), never
replaced by cost.

**At today the newest price wins, even if it is dated ahead.** MUFAP publishes
NAVs with a forward validity date: on Sun 8 Nov 2026 it posted UBL Financial
Sector Fund at 320.0428 *valid for 9 Nov*. The on-or-before rule alone dropped
that and valued the holding at its 10 Apr statement NAV (345.2503), overstating
value and unrealized gain by ~8%. So when the range ends today, the newest
observation is used whatever its date.

### Realized gain (inside the range)
```
gross = Σ gain of sales dated in the range + distributions in the range
CGT   = Σ tax events in the range   (deducted − refunded − reversed; never clamped, can be negative)
net   = gross − CGT − other deductions on those sales (zakat, WHT, back-end load, charges)
```
**Paid CGT is applied to realized gains only.** A sale before the range is not
counted even if its CGT refund arrives inside the range. The refund reduces
CGT in the month it arrives.

### Unrealized gain (at the end of the range)
```
gross = current value − invested           (per holding)
tax   = 15% × gross if gross > 0, else 0   (per holding; a loss in one fund does not reduce another's tax)
net   = gross − tax
```
The 15% (individual filer rate) is an **estimate**: no CGT is due until units
are sold. It must always be labelled as an estimate, and it is never mixed into
"CGT paid".

### Holdings shown
- **Held:** units > 0.01 at the end of the range.
- **In the range (active):** still held when the range starts (units > 0.01
  from trades before the start), **or** traded inside the range. A fund bought
  before the range and never sold is part of it. A fund fully redeemed before
  the start, or first bought after the end, is not. This one rule drives the
  lists, the totals (value, invested, unrealized), the month-end series and the
  Analytics filter options, which are built from the engine's `positions`. PSX
  (`src/lib/psx/portfolio.js`) uses the same rule; its `allPositions` keeps
  every stock for the trading screens.
- **Previous holdings** (dashboard): funds at zero units at the range end that
  were traded inside the range, with the realized net for the range.

### Profit by month (bar chart)
For each calendar month inside the range: realized **gross**, **CGT** (tax
events that month) and **net**, the same rules as Realized, applied to one
month. The bars therefore add up to the Realized card for the same range. The
chart draws one bar per month at the gross height, green for net and a coral
cap for CGT. A refund month is all green because CGT is negative.

---

## 4. Worked example (also a test)

FY 2026-27, today 31 Oct 2026.

| Date | Transaction |
| --- | --- |
| 10 Jan | Buy 100 units @ 10 = 1,000 |
| 10 Feb | Buy 100 units @ 12 = 1,200 |
| 10 Aug | Redeem 150 units @ 15: gross 2,250, CGT 30, net 2,220 |
| 31 Oct | Price 16 |

- FIFO cost of the 150 sold = 1,000 + 50 × 12 = **1,600**
- Realized: gross 2,250 − 1,600 = **650**, CGT **30**, net **620** (all in August)
- Held 50 units: invested = **600**, value = 50 × 16 = **800**
- Unrealized: gross **200**, 15% = **30**, net **170**

An average-cost method would give 600 realized. FIFO gives 650, which matches
the AMCs' CGT.

---

## 5. How it was verified

| Check | Result |
| --- | --- |
| Hand-worked unit tests (`npm test`) | FIFO, full redemption clears invested, 15% per holding, refunds, refund as units, switches, range boundaries, past-date prices, forward-dated MUFAP NAV at today, UBL rounding, reversals, missing price, dividends |
| NBP statement | Realized gain equals the figure NBP prints, to the paisa |
| Meezan statements | Realized + unrealized − CGT equals Meezan's printed "To Date" gain, within whole-rupee rounding |
| Every real statement vs the live QA ledger | Realized gain and CGT per fund identical for all 12 funds (Atlas, MCB ×2, Meezan ×4, NBP, UBL ×4) |
| Passive Income tracker (owner's own records) | Monthly realized + CGT match, e.g. UBL Oct 1,253.54 / 186, MCB Aug 2,442.12 / 396, NBP Oct 20.97 / 4 |

Run the private checks locally (statements stay outside the repo):

```
npm run test:private
QA_LEDGER=<export of the QA ledger as JSON> node --test tests/private/profit-crosscheck.test.mjs
```

---

## 6. Rules for changing this code

1. Money is `decimal.js` end to end; convert to a JS number only when handing a
   rounded value to the screen.
2. Keep FIFO. Do not switch to average cost; the AMCs' CGT is FIFO.
3. Paid CGT (from statements) and the 15% estimate never mix. "CGT paid" is
   only what statements report.
4. Never value a holding at cost when its price is unknown. Show "—" and flag it.
5. A change to any rule here needs a hand-worked test in `profit.test.mjs` and
   a rerun of the private cross-check before it ships.
6. `src/lib/mf/engine.js` (`computePortfolio`) is the older all-time engine,
   still used for the ledger view and the manual-overlap notice. Screens that
   show profit read `profit.js`. Do not add a second profit calculation.
