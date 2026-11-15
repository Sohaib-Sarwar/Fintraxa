import Decimal from 'decimal.js';
import { useLocalSearchParams } from 'expo-router';
import { useTrades } from '@/data/queries';
import { longDate } from '@/lib/dates';
import { money, units } from '@/lib/format';
import { EmptyState } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { StockLogo } from '@/ui/Logos';
import { Receipt } from '@/ui/Receipt';
import { Screen } from '@/ui/Screen';

/** One PSX trade as a formal receipt: shares, price, value, fees, what was paid / received, dates, broker. */
export default function StockTradeReceipt() {
  const hidden = useHidden();
  const { id } = useLocalSearchParams<{ id: string }>();
  const trades = useTrades();
  const t = trades.data?.find((r) => r.id === id);
  if (!t) return <Screen back title="Receipt"><EmptyState title="Trade not found" body="It may have been removed." /></Screen>;

  const buy = t.type === 'buy';
  const value = new Decimal(String(t.quantity)).times(String(t.price));
  const fee = new Decimal(String(t.fee ?? 0));
  const total = buy ? value.plus(fee) : value.minus(fee);
  const m = (v: Decimal | number) => money(Number(v), { hidden, decimals: 2 });
  return (
    <Screen back title="Receipt">
      <Receipt
        icon={<StockLogo symbol={t.symbol} size={56} />}
        title={t.symbol}
        subtitle={t.company_name ?? undefined}
        amount={`${buy ? '−' : '+'}${m(total)}`}
        positive={!buy}
        status={buy ? 'Bought' : 'Sold'}
        rows={[
          { label: 'Trade date', value: longDate(t.date) },
          ...(t.settlement_date ? [{ label: 'Settlement', value: longDate(t.settlement_date) }] : []),
          { label: 'Shares', value: units(t.quantity) },
          { label: 'Price per share', value: money(Number(t.price), { decimals: 2 }) },
          { label: 'Trade value', value: m(value) },
          { label: 'Fees and taxes', value: m(fee) },
          { label: buy ? 'Total paid' : 'Total received', value: m(total) },
          ...(t.broker ? [{ label: 'Broker', value: t.broker.toUpperCase() }] : []),
          ...(t.notes ? [{ label: 'Note', value: t.notes }] : []),
        ]}
        reference={t.id.slice(0, 8).toUpperCase()}
      />
    </Screen>
  );
}
