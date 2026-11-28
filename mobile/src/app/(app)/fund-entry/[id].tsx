import Decimal from 'decimal.js';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { useFundsAnalysis } from '@/data/portfolio';
import { useLedger } from '@/data/queries';
import { ALL_TIME_START, todayIso } from '@/lib/dates';
import { money, units } from '@/lib/format';
import { useHidden } from '@/ui/Figures';
import { AmcLogo } from '@/ui/Logos';
import { receiptDate, receiptFileName, ReceiptScreen, type ReceiptRow } from '@/ui/Receipt';

const ENTRY: Record<string, string> = {
  purchase: 'Purchase', redemption: 'Redemption', switch_in: 'Switch in', switch_out: 'Switch out',
  cgt_refund_reinvest: 'CGT refund reinvested', capital_refund_units: 'Capital refund (units)', dividend_reinvest: 'Dividend reinvested',
};
const LOAD = new Set(['front_load', 'back_load', 'load_tax']);
const OTHER = new Set(['zakat', 'wht', 'transaction_cost', 'charge', 'other_deduction']);

/**
 * One mutual-fund ledger entry as a formal receipt (owner, 2026-11-26: only what matters financially): the fund and
 * its manager, the type, date, units × NAV, the amount, CGT / load / other deductions when the statement had them,
 * and the net. No NAV date, unit class, statement label or source.
 */
export default function FundEntryReceipt() {
  const hidden = useHidden();
  const { id, key } = useLocalSearchParams<{ id: string; key: string }>();
  const range = useMemo(() => ({ start: ALL_TIME_START, end: todayIso() }), []);
  const { analysis, isLoading } = useFundsAnalysis(range);
  const ledger = useLedger();
  const x = analysis?.allPositions.find((pos) => pos.key === key);
  const e = x?.entries.find((r) => String(r.id) === id);
  if (!x || !e) return <ReceiptScreen receipt={null} file="" loading={isLoading} missing={{ title: 'Entry not found', body: 'It may have been removed.' }} />;

  const m = (v: Decimal) => money(v.toFixed(2), { hidden, decimals: 2 });
  const dec = (v: unknown) => (v === null || v === undefined || v === '' ? null : new Decimal(String(v)));
  const u = dec(e.unit_delta) ?? new Decimal(0);
  const nav = dec(e.nav);
  const gross = dec(e.gross_amount);
  const net = dec(e.net_amount);
  const amt = gross ?? net;
  // Big figure: what reached the bank on a redemption (net), what was put in otherwise (gross).
  const headline = u.lt(0) ? net ?? gross : gross ?? net;
  const type = String(e.entry_type);

  // The statement's deductions on this entry (ledger components), summed by kind.
  const comps = (ledger.data?.components ?? []).filter((c) => String(c.entry_id) === String(e.id));
  const sum = (pick: (t: string) => boolean) => comps.filter((c) => pick(c.component_type)).reduce((s, c) => s.plus(new Decimal(c.amount).abs()), new Decimal(0));
  const cgt = sum((t) => t === 'cgt');
  const cgtBack = sum((t) => t === 'cgt_refund' || t === 'cgt_reversal');
  const load = sum((t) => LOAD.has(t));
  const other = sum((t) => OTHER.has(t));
  const showNet = net && gross && !net.eq(gross);

  const rows: ReceiptRow[] = [
    { label: 'Date', value: receiptDate(String(e.trade_date)) },
    { label: nav ? 'Units × NAV' : 'Units', value: nav ? `${units(u.abs().toString())} × ${hidden ? money(0, { hidden }) : money(nav.toString(), { decimals: 4 })}` : units(u.abs().toString()) },
    ...(amt ? [{ label: showNet ? 'Gross amount' : 'Amount', value: m(amt), strong: !showNet }] : []),
    ...(cgt.gt(0) ? [{ label: 'CGT withheld', value: `−${m(cgt)}` }] : []),
    ...(cgtBack.gt(0) ? [{ label: 'CGT refunded', value: `+${m(cgtBack)}` }] : []),
    ...(load.gt(0) ? [{ label: 'Load', value: `−${m(load)}` }] : []),
    ...(other.gt(0) ? [{ label: 'Other deductions', value: `−${m(other)}` }] : []),
    ...(showNet ? [{ label: u.lt(0) ? 'Net received' : 'Net invested', value: m(net!), strong: true }] : []),
  ];

  return (
    <ReceiptScreen
      file={receiptFileName(x.fundName ?? 'fund', type, String(e.trade_date))}
      receipt={{
        icon: <AmcLogo code={x.amcCode} name={x.amcName} size={48} />,
        title: x.fundName ?? 'Fund',
        subtitle: x.amcName ?? undefined,
        amount: headline ? m(headline.abs()) : `${units(u.abs().toString())} units`,
        status: ENTRY[type] ?? String(e.original_label ?? type).replace(/_/g, ' '),
        rows,
        reference: e.external_ref ? String(e.external_ref) : String(e.id).slice(0, 8).toUpperCase(),
      }}
    />
  );
}
