import Decimal from 'decimal.js';
import { router, useLocalSearchParams } from 'expo-router';
import { useDividends } from '@/data/queries';
import { longDate } from '@/lib/dates';
import { money, units } from '@/lib/format';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { StockLogo } from '@/ui/Logos';
import { Receipt } from '@/ui/Receipt';
import { Screen } from '@/ui/Screen';

const TYPE: Record<string, string> = { interim: 'Interim dividend', final: 'Final dividend', special: 'Special dividend' };
const FILER: Record<string, string> = { filer: 'Filer', non_filer: 'Non-filer', unknown: 'Not stated' };

/**
 * One dividend as a formal receipt (owner, 2026-11-15: tap a row in Dividend payments): the stock's logo, the amount
 * received big, then every detail — date, type, shares, dividend per share, gross, tax withheld (and its rate),
 * zakat, net, filer status, warrant, where it came from. Same black-glass receipt as transactions and trades.
 */
export default function DividendReceipt() {
  const hidden = useHidden();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useDividends();
  const d = q.data?.find((x) => x.id === id);

  if (!d && q.isLoading) return <Screen back title="Receipt"><Skeleton height={420} radius={28} /></Screen>;
  if (!d) return <Screen back title="Receipt"><EmptyState title="Dividend not found" body="It may have been deleted." action="Go back" onAction={() => router.back()} /></Screen>;

  const rs = (v: string | number) => money(v, { hidden, decimals: 2 });
  const gross = new Decimal(d.gross_amount);
  const tax = new Decimal(d.tax_amount).plus(d.jh_tax_amount ?? 0);
  const zakat = new Decimal(d.zakat_amount ?? 0);
  // The per-share figure as typed, or gross ÷ shares for statement imports and older rows.
  const dps = d.dps ? new Decimal(d.dps) : new Decimal(d.shares).gt(0) ? gross.dividedBy(d.shares) : null;
  const rate = gross.gt(0) ? tax.dividedBy(gross).times(100) : null;

  return (
    <Screen back title="Receipt">
      <Receipt
        icon={<StockLogo symbol={d.symbol} size={56} />}
        title={d.symbol}
        subtitle={d.company_name ?? 'Cash dividend'}
        amount={`+${rs(d.net_amount)}`}
        positive
        status={d.dividend_type ? TYPE[d.dividend_type] : 'Cash dividend received'}
        rows={[
          { label: 'Payment date', value: longDate(d.payment_date) },
          ...(d.issue_date ? [{ label: 'Issue date', value: longDate(d.issue_date) }] : []),
          ...(d.dividend_type ? [{ label: 'Type', value: TYPE[d.dividend_type] }] : []),
          { label: 'Shares', value: units(Number(d.shares)) },
          ...(dps ? [{ label: 'Dividend per share', value: hidden ? '••' : `Rs ${dps.toDecimalPlaces(4).toString()}` }] : []),
          { label: 'Gross dividend', value: rs(d.gross_amount) },
          { label: `Tax withheld${rate ? ` (${rate.toDecimalPlaces(1).toString()}%)` : ''}`, value: `−${rs(tax.toFixed(2))}` },
          ...(zakat.gt(0) ? [{ label: 'Zakat', value: `−${rs(zakat.toFixed(2))}` }] : []),
          { label: 'Net received', value: rs(d.net_amount) },
          { label: 'Filer status', value: FILER[d.filer_status ?? 'unknown'] ?? 'Not stated' },
          ...(d.warrant_no ? [{ label: 'Warrant no.', value: d.warrant_no }] : []),
          { label: 'Recorded from', value: d.source === 'statement' ? 'CDC dividend report' : 'Added by hand' },
          ...(d.notes ? [{ label: 'Note', value: d.notes }] : []),
          { label: 'Recorded', value: longDate(d.created_at.slice(0, 10)) },
        ]}
        reference={(d.warrant_no || d.id.slice(0, 8)).toUpperCase()}
      />
    </Screen>
  );
}
