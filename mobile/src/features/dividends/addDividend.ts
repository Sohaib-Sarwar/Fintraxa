/**
 * Add a dividend by hand on the phone (owner, 2026-11-15): pick the stock, type the dividend per share; shares held on
 * the payment date come from the trades, gross = shares × DPS, withholding tax (15% for filers by default, editable),
 * net = gross − tax. Exact decimals (decimal.js), rupees to the paisa. Saved like the web's DividendDialog
 * (source 'manual'); the snapshot trigger marks the user dirty from that date.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { normSymbol } from '@/data/engines';
import { supabase } from '@/lib/supabase';
import { toast } from '@/ui/feedback';

export type DividendType = 'interim' | 'final' | 'special';
export const DIVIDEND_TYPES: { value: DividendType; label: string }[] = [
  { value: 'interim', label: 'Interim' }, { value: 'final', label: 'Final' }, { value: 'special', label: 'Special' },
];
/** Pakistan's withholding tax on dividends: 15% for filers (Active Taxpayer List), 30% for non-filers. */
export const WHT_FILER = 15;
export const WHT_NON_FILER = 30;

const D = (v: string | number | null | undefined) => {
  try { return new Decimal(String(v || 0).replace(/,/g, '')); } catch { return new Decimal(0); }
};

type TradeLike = { symbol: string; type: string; quantity: string | number; date: string };

/** Shares of `symbol` held at the end of `date` (trade dates), from the user's trades. Never negative. */
export function sharesHeldOn(trades: TradeLike[], symbol: string, date: string): number {
  const sym = normSymbol(symbol);
  const n = trades.filter((t) => normSymbol(t.symbol) === sym && String(t.date).slice(0, 10) <= date)
    .reduce((s, t) => (t.type === 'sell' ? s.minus(D(t.quantity)) : s.plus(D(t.quantity))), new Decimal(0));
  return n.gt(0) ? Number(n.toFixed(4)) : 0;
}

/**
 * Gross, tax and net from shares × DPS and the WHT rate (%), each rounded to the paisa; net = gross − tax exactly.
 * `taxRs` (owner, 2026-11-15: "make the WHT tax editable"): the tax as typed in rupees — it wins over the rate (never
 * more than the gross), and `rate` reports the percentage it works out to.
 */
export function dividendAmounts(shares: string | number, dps: string | number, ratePct: string | number, taxRs?: string | null) {
  const gross = D(shares).times(D(dps)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const typed = taxRs !== undefined && taxRs !== null && taxRs.trim() !== '';
  const rateIn = Decimal.min(Decimal.max(D(ratePct), 0), 100);
  const tax = typed
    ? Decimal.min(Decimal.max(D(taxRs), 0), gross).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    : gross.times(rateIn).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const net = gross.minus(tax);
  const rate = typed ? (gross.gt(0) ? tax.dividedBy(gross).times(100).toDecimalPlaces(2) : new Decimal(0)) : rateIn;
  return { gross: gross.toFixed(2), tax: tax.toFixed(2), net: net.toFixed(2), rate: rate.toString() };
}

export type DividendDraft = {
  symbol: string; companyName: string | null; paymentDate: string; type: DividendType; shares: string; dps: string; ratePct: string;
  /** Tax typed in rupees (overrides the rate); null = worked out from the rate. */
  taxRs?: string | null;
};

/** What's wrong with the draft, in plain words, or null when it can be saved. */
export function checkDividend(d: DividendDraft, today: string): string | null {
  if (!d.symbol) return 'Choose the stock that paid it.';
  if (!d.paymentDate || d.paymentDate > today) return 'Choose a payment date that is not in the future.';
  if (!(Number(d.shares) > 0)) return 'Enter the number of shares the dividend was paid on.';
  if (!(Number(d.dps) > 0)) return 'Enter the dividend per share.';
  if (d.taxRs !== undefined && d.taxRs !== null && d.taxRs.trim() !== '') {
    const t = Number(d.taxRs);
    const gross = Number(dividendAmounts(d.shares, d.dps, 0).gross);
    if (!(t >= 0)) return 'Enter the tax withheld in rupees.';
    if (t > gross) return 'The tax withheld can’t be more than the gross dividend.';
    return null;
  }
  const r = Number(d.ratePct);
  if (d.ratePct.trim() === '' || !(r >= 0 && r <= 100)) return 'The tax rate must be between 0% and 100%.';
  return null;
}

export function useAddDividend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uid, d }: { uid: string; d: DividendDraft }) => {
      const a = dividendAmounts(d.shares, d.dps, d.ratePct, d.taxRs);
      const rate = Number(a.rate);
      const row = {
        user_id: uid,
        symbol: normSymbol(d.symbol),
        company_name: d.companyName?.slice(0, 200) ?? null,
        payment_date: d.paymentDate,
        shares: D(d.shares).toFixed(4),
        dps: D(d.dps).toFixed(4),
        dividend_type: d.type,
        gross_amount: a.gross,
        tax_amount: a.tax,
        net_amount: a.net,
        filer_status: rate === WHT_FILER ? 'filer' : rate === WHT_NON_FILER ? 'non_filer' : 'unknown',
        source: 'manual',
      };
      const { data, error } = await supabase.from('stock_dividends').insert(row).select('id').single();
      if (error) throw error;
      return { id: (data as { id: string }).id, ...a };
    },
    onSuccess: () => {
      ['stock-dividends', 'snapshots'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast('Dividend added');
    },
  });
}
