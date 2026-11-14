import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { useFundsAnalysis } from '@/data/portfolio';
import { ALL_TIME_START, longDate, todayIso } from '@/lib/dates';
import { money, units } from '@/lib/format';
import { EmptyState } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { AmcLogo } from '@/ui/Logos';
import { Receipt } from '@/ui/Receipt';
import { Screen } from '@/ui/Screen';

const ENTRY: Record<string, string> = {
  purchase: 'Purchase', redemption: 'Redemption', switch_in: 'Switch in', switch_out: 'Switch out',
  cgt_refund_reinvest: 'CGT refund reinvested', capital_refund_units: 'Capital refund (units)', dividend_reinvest: 'Dividend reinvested',
};
const ORIGIN: Record<string, string> = { statement: 'Fund statement', manual: 'Added by hand', import: 'Statement import' };

/** One mutual-fund ledger entry as a formal receipt: every detail the ledger holds. */
export default function FundEntryReceipt() {
  const hidden = useHidden();
  const { id, key } = useLocalSearchParams<{ id: string; key: string }>();
  const range = useMemo(() => ({ start: ALL_TIME_START, end: todayIso() }), []);
  const { analysis } = useFundsAnalysis(range);
  const x = analysis?.allPositions.find((pos) => pos.key === key);
  const e = x?.entries.find((r) => String(r.id) === id);
  if (!x || !e) return <Screen back title="Receipt"><EmptyState title="Entry not found" body="It may have been removed." /></Screen>;

  const u = Number(e.unit_delta ?? 0);
  const gross = e.gross_amount !== null && e.gross_amount !== undefined ? Number(e.gross_amount) : null;
  const net = e.net_amount !== null && e.net_amount !== undefined ? Number(e.net_amount) : null;
  const amt = gross ?? net;
  const type = String(e.entry_type);
  const m = (v: number) => money(v, { hidden, decimals: 2 });
  return (
    <Screen back title="Receipt">
      <Receipt
        icon={<AmcLogo code={x.amcCode} name={x.amcName} size={56} />}
        title={x.fundName ?? 'Fund'}
        subtitle={x.amcName ?? undefined}
        amount={amt !== null ? `${u < 0 ? '−' : ''}${m(Math.abs(amt))}` : `${u > 0 ? '+' : ''}${units(u)} units`}
        positive={false}
        status={ENTRY[type] ?? String(e.original_label ?? type).replace(/_/g, ' ')}
        rows={[
          { label: 'Trade date', value: longDate(String(e.trade_date)) },
          ...(e.price_date && e.price_date !== e.trade_date ? [{ label: 'NAV date', value: longDate(String(e.price_date)) }] : []),
          { label: 'Units', value: `${u > 0 ? '+' : ''}${units(u)}` },
          ...(e.nav ? [{ label: 'NAV per unit', value: money(Number(e.nav), { decimals: 4 }) }] : []),
          ...(gross !== null ? [{ label: 'Gross amount', value: m(gross) }] : []),
          ...(net !== null && net !== gross ? [{ label: 'Net amount', value: m(net) }] : []),
          ...(gross !== null && net !== null && gross !== net ? [{ label: 'Deductions', value: m(Math.abs(gross - net)) }] : []),
          ...(e.unit_class ? [{ label: 'Unit class', value: String(e.unit_class) }] : []),
          ...(e.original_label ? [{ label: 'Statement label', value: String(e.original_label) }] : []),
          ...(e.origin ? [{ label: 'Source', value: ORIGIN[String(e.origin)] ?? String(e.origin) }] : []),
        ]}
        reference={e.external_ref ? String(e.external_ref) : String(e.id).slice(0, 8).toUpperCase()}
      />
    </Screen>
  );
}
