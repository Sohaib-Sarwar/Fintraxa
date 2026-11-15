/**
 * Type boundary for the shared JS engines in ../src/lib (the web app's own files, imported unchanged).
 * Their JSDoc is partial (it omits options the web passes, e.g. `funds`/`amcs`/`today`), so the phone
 * declares the call shapes it relies on here, once, instead of casting at every call site.
 */
import { summarize as summarizeJs } from '@core/finance/summary.js';
import { assetRows as assetRowsJs, valueSeries as valueSeriesJs } from '@core/snapshots/series.js';
import { analyzePassive as analyzePassiveJs, passiveEvents as passiveEventsJs, savingsTax as savingsTaxJs, SOURCE_LABEL as SOURCE_LABEL_JS } from '@core/finance/passive.js';
import { bankName as bankNameJs, PSX_BANKS as PSX_BANKS_JS } from '@core/finance/banks.js';
import { duplicateStatus as duplicateStatusJs, oversoldRefs as oversoldRefsJs, toTradeRows as toTradeRowsJs } from '@core/psx/confirmations.js';
import { dividendDuplicates as dividendDuplicatesJs, dividendKey as dividendKeyJs } from '@core/psx/dividends.js';
import { analyzeFunds as analyzeFundsJs } from '@core/mf/profit.js';
import { analyzeStocks as analyzeStocksJs, normSymbol as normSymbolJs } from '@core/psx/portfolio.js';
import { nccplPeriod as nccplPeriodJs, nccplReport as nccplReportJs, taxYearLabel as taxYearLabelJs, taxYearOf as taxYearOfJs } from '@core/psx/nccpl.js';
import { summarizeDividends as summarizeDividendsJs } from '@core/psx/dividends.js';
import { preferNewerPrices as preferNewerPricesJs } from '@core/psx/livePrices.js';
import { staleFeeds as staleFeedsJs } from '@core/market/health.js';
import { getStockSector as getStockSectorJs } from '@core/psxSectors.js';
import type { FeedHealthRow, FundsAnalysis, StocksAnalysis, Txn } from './types';

// The deliberate typing seam: engines are loose JS, cast once here to the shapes declared below.
type Loose = (...args: never[]) => unknown;

export type Summary = {
  start: string; end: string; count: number; active: number; passive: number; expenses: number; transfers: number; saved: number; savingsRate: number | null;
  months: { month: string; label: string; active: number; passive: number; expenses: number; saved: number }[];
  categories: { active: Cat[]; expenses: Cat[] };
};
type Cat = { name: string; icon: string | null; amount: number; count: number };

export type NccplMonth = { month: string; gains: number; losses: number; net: number; ytdNet: number; ytdCgt: number; cgtThisMonth: number };
export type NccplYear = {
  taxYear: number; start: string; end: string; gains: number; losses: number; net: number; carriedUsed: number; taxable: number; cgt: number;
  lossCarriedOut: number; carryForward: { fromYear: number; amount: number; expires: number }[]; months: NccplMonth[]; lots: unknown[];
};
export type NccplReport = { years: NccplYear[]; lots: unknown[]; unmatched: unknown[]; year: (ty: number) => NccplYear | undefined };
export type DividendSummary = { count: number; gross: number; tax: number; zakat: number; deductions: number; net: number; rows: unknown[] };

export const summarize = summarizeJs as Loose as (txns: Txn[], range: { start: string; end: string }, today?: string) => Summary;
export const analyzeFunds = analyzeFundsJs as Loose as (o: {
  entries: unknown[]; components: unknown[]; prices: unknown[]; funds: Record<string, unknown>; amcs: Record<string, unknown>; start: string; end: string; today: string;
}) => FundsAnalysis;
export const analyzeStocks = analyzeStocksJs as Loose as (trades: unknown[], o: { live: Record<string, unknown>; history: Record<string, unknown>; start: string; end: string; today: string }) => StocksAnalysis;
export const normSymbol = normSymbolJs as (s: unknown) => string;
export const nccplReport = nccplReportJs as Loose as (trades: unknown[], o: { today: string }) => NccplReport;
export const nccplPeriod = nccplPeriodJs as Loose as (report: NccplReport, range: { start: string; end: string }) => { gains: number; losses: number; net: number; cgt: number; deemedCost: number };
export const taxYearOf = taxYearOfJs as (iso: string) => number;
export const taxYearLabel = taxYearLabelJs as (ty: number) => string;
export const summarizeDividends = summarizeDividendsJs as Loose as (rows: unknown[], o: { start: string; end: string; today: string }) => DividendSummary;
export const preferNewerPrices = preferNewerPricesJs as Loose as (live: Record<string, unknown>, history: unknown, boardAsOf: string | null) => Record<string, unknown>;
export const staleFeeds = staleFeedsJs as Loose as (rows: FeedHealthRow[], now?: Date) => { feed: string; name: string; latest: string | null; behind: number }[];
export const getStockSector = getStockSectorJs as (symbol: string) => string;

export type PassiveSource = 'mutual_funds' | 'dividends' | 'savings' | 'other';
export type PassiveEvent = { id: string; date: string; month: string; source: PassiveSource; title: string; sub: string; symbol?: string | null; gross: unknown; tax: unknown; net: unknown; posted: boolean };
export type PassiveMonth = { month: string; label: string; gross: number; tax: number; net: number } & Record<PassiveSource, number>;
export type PassiveAnalysis = {
  totals: { gross: number; tax: number; net: number; count: number };
  bySource: Record<PassiveSource, { gross: number; tax: number; net: number; count: number }>;
  months: PassiveMonth[]; avgPerMonth: number; effectiveTaxRate: number | null;
  mom: { month: string; net: number; previous: number; changePct: number | null } | null;
  runRate3: { months: number; perMonth: number } | null;
  events: PassiveEvent[];
};
export const passiveEvents = passiveEventsJs as Loose as (o: { mfMonths: unknown[]; dividends: unknown[]; transactions: unknown[]; today: string }) => PassiveEvent[];
export const analyzePassive = analyzePassiveJs as Loose as (events: PassiveEvent[], o: { start: string; end: string; today: string }) => PassiveAnalysis;
export const SOURCE_LABEL = SOURCE_LABEL_JS as Record<PassiveSource, string>;
/** Savings profit: the gross typed, the bank's withholding (20% filer / 40% non-filer), the net credited — the web's split. */
export const savingsTax = savingsTaxJs as Loose as (gross: string | number, rate?: number) => { gross: string; tax: string; net: string; rate: number } | null;
/** Banks for savings accounts (shared with the web: src/lib/finance/banks.js). */
export const BANKS = PSX_BANKS_JS as { symbol: string; name: string }[];
export const bankName = bankNameJs as (symbol: string) => string;

export const duplicateStatus = duplicateStatusJs as Loose as (confirmations: unknown[], existing: unknown[]) => Record<string, 'recorded' | 'similar'>;
/** FIFO holdings check (the web's TradeImportDialog): imported sales that sell more than the recorded holdings on that date. */
export const oversoldRefs = oversoldRefsJs as Loose as (confirmations: unknown[], isSelected: (ref: string) => boolean, existing: unknown[]) => Set<string>;
export const toTradeRows = toTradeRowsJs as Loose as (c: unknown, trades: unknown[]) => Record<string, unknown>[];
export const dividendDuplicates = dividendDuplicatesJs as Loose as (rows: unknown[], existing: unknown[]) => Record<string, 'saved' | 'possible'>;
export const dividendKey = dividendKeyJs as (x: { symbol: string; payment_date: string; warrant_no?: string | null }) => string;

/** One point of the web ValueChart (src/lib/snapshots/series.js valueSeries): a period's close. */
export type ValuePoint = { month: string; label: string; title: string; live: boolean; date?: string; value: number; invested: number; unrealized: number; realized: number };
/** The web's daily rows for one asset class: snapshots, plus the engine's early points before the first snapshot. */
export const assetRows = assetRowsJs as Loose as (portfolio: unknown[], asset: 'funds' | 'stocks', analysis?: unknown) => unknown[];
/** The web's Value vs invested series: value / invested / unrealized at each period's close, realized summed in it. */
export const valueSeries = valueSeriesJs as Loose as (rows: unknown[], o: { period: 'day' | 'week' | 'month' | 'year'; start?: string; end?: string; today: string; fillGaps?: boolean }) => ValuePoint[];
