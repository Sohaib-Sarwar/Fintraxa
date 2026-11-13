/**
 * Type boundary for the shared JS engines in ../src/lib (the web app's own files, imported unchanged).
 * Their JSDoc is partial (it omits options the web passes, e.g. `funds`/`amcs`/`today`), so the phone
 * declares the call shapes it relies on here, once, instead of casting at every call site.
 */
import { summarize as summarizeJs } from '@core/finance/summary.js';
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
