import Decimal from 'decimal.js';
import { useLocalSearchParams } from 'expo-router';
import { useDividends } from '@/data/queries';
import { money, units } from '@/lib/format';
import { useHidden } from '@/ui/Figures';
import { StockLogo } from '@/ui/Logos';
import { receiptDate, receiptFileName, ReceiptScreen, type ReceiptRow } from '@/ui/Receipt';

const TYPE: Record<string, string> = { interim: 'Interim dividend', final: 'Final dividend', special: 'Special dividend' };
const FILER: Record<string, string> = { filer: 'Filer', non_filer: 'Non-filer' };

/**
 * One dividend as a formal receipt (owner, 2026-11-15: tap a row in Dividend payments), filling the screen.
 * The money first — payment date, shares × dividend per share, gross, tax withheld (and its rate), zakat when
 * deducted, net received — then the CDC warrant details only when the dividend has them (warrant no., account,
 * filer status, issue date), so a hand entry completed by an uploaded CDC report shows them (owner, 2026-11-26).
 */
export default function DividendReceipt() {
  const hidden = useHidden();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useDividends();
  const d = q.data?.find((x) => x.id === id);

  if (!d) return <ReceiptScreen receipt={null} file="" loading={q.isLoading} missing={{ title: 'Dividend not found', body: 'It may have been deleted.' }} />;

  const rs = (v: string | number) => money(v, { hidden, decimals: 2 });
  const gross = new Decimal(d.gross_amount);
  const tax = new Decimal(d.tax_amount).plus(d.jh_tax_amount ?? 0);
  const zakat = new Decimal(d.zakat_amount ?? 0);
  // The per-share figure as typed, or gross ÷ shares for statement imports and older rows.
  const dps = d.dps ? new Decimal(d.dps) : new Decimal(d.shares).gt(0) ? gross.dividedBy(d.shares) : null;
  const rate = gross.gt(0) ? tax.dividedBy(gross).times(100) : null;
  const filer = d.filer_status ? FILER[d.filer_status] : undefined;

  const rows: ReceiptRow[] = [
    { label: 'Payment date', value: receiptDate(d.payment_date) },
    { label: dps ? 'Shares × per share' : 'Shares', value: dps ? `${units(d.shares)} × ${hidden ? money(0, { hidden }) : `Rs ${dps.toDecimalPlaces(4).toString()}`}` : units(d.shares) },
    { label: 'Gross dividend', value: rs(gross.toFixed(2)) },
    { label: `Tax withheld${rate ? ` (${rate.toDecimalPlaces(1).toString()}%)` : ''}`, value: `−${rs(tax.toFixed(2))}` },
    ...(zakat.gt(0) ? [{ label: 'Zakat', value: `−${rs(zakat.toFixed(2))}` }] : []),
    { label: 'Net received', value: rs(d.net_amount), strong: true },
    ...(d.warrant_no ? [{ label: 'Warrant no.', value: d.warrant_no }] : []),
    ...(d.account_ref ? [{ label: 'CDC account', value: d.account_ref }] : []),
    ...(filer ? [{ label: 'Filer status', value: filer }] : []),
    ...(d.issue_date ? [{ label: 'Issue date', value: receiptDate(d.issue_date) }] : []),
  ];

  return (
    <ReceiptScreen
      classic
      file={receiptFileName('dividend', d.symbol, d.payment_date)}
      receipt={{
        icon: <StockLogo symbol={d.symbol} size={48} />,
        title: d.symbol,
        subtitle: d.company_name ?? undefined,
        amount: `+${rs(d.net_amount)}`,
        positive: true,
        status: d.dividend_type ? TYPE[d.dividend_type] : 'Cash dividend',
        rows,
        reference: d.id.slice(0, 8).toUpperCase(),
      }}
    />
  );
}
