import Decimal from 'decimal.js';
import { useLocalSearchParams } from 'expo-router';
import { useTrades } from '@/data/queries';
import { money, units } from '@/lib/format';
import { useHidden } from '@/ui/Figures';
import { StockLogo } from '@/ui/Logos';
import { receiptDate, receiptFileName, ReceiptScreen } from '@/ui/Receipt';

const BROKER: Record<string, string> = { akd: 'AKD Securities', ktrade: 'KTrade Securities' };

/**
 * One PSX trade as a formal contract-note style receipt (owner, 2026-11-26: no extra dates or text): shares × price,
 * trade value, charges, the net paid / received, trade date, settlement date only when it differs, broker.
 */
export default function StockTradeReceipt() {
  const hidden = useHidden();
  const { id } = useLocalSearchParams<{ id: string }>();
  const trades = useTrades();
  const t = trades.data?.find((r) => r.id === id);
  if (!t) return <ReceiptScreen receipt={null} file="" loading={trades.isLoading} missing={{ title: 'Trade not found', body: 'It may have been removed.' }} />;

  const buy = t.type === 'buy';
  const value = new Decimal(String(t.quantity)).times(String(t.price));
  const fee = new Decimal(String(t.fee ?? 0));
  const total = buy ? value.plus(fee) : value.minus(fee);
  const m = (v: Decimal | number) => money(v.toString(), { hidden, decimals: 2 });
  const price = hidden ? money(0, { hidden }) : money(String(t.price), { decimals: new Decimal(String(t.price)).decimalPlaces() > 2 ? 4 : 2 });
  return (
    <ReceiptScreen
      classic
      file={receiptFileName(buy ? 'buy' : 'sell', t.symbol, t.date)}
      receipt={{
        icon: <StockLogo symbol={t.symbol} size={52} />,
        title: t.symbol,
        subtitle: t.company_name ?? undefined,
        amount: `${buy ? '−' : '+'}${m(total)}`,
        positive: !buy,
        status: buy ? 'Buy' : 'Sell',
        rows: [
          { label: 'Trade date', value: receiptDate(t.date) },
          ...(t.settlement_date && t.settlement_date !== t.date ? [{ label: 'Settlement date', value: receiptDate(t.settlement_date) }] : []),
          { label: 'Shares × price', value: `${units(t.quantity)} × ${price}` },
          { label: 'Trade value', value: m(value) },
          { label: 'Charges', value: `${buy ? '+' : '−'}${m(fee)}` },
          { label: buy ? 'Net paid' : 'Net received', value: m(total), strong: true },
          ...(t.broker ? [{ label: 'Broker', value: BROKER[t.broker.toLowerCase()] ?? t.broker.toUpperCase() }] : []),
        ],
        reference: t.id.slice(0, 8).toUpperCase(),
      }}
    />
  );
}
