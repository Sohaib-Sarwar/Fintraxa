import Decimal from 'decimal.js';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTrades } from '@/data/queries';
import { money, units } from '@/lib/format';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { StockLogo } from '@/ui/Logos';
import { Receipt, receiptDate } from '@/ui/Receipt';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/tokens';

const BROKER: Record<string, string> = { akd: 'AKD Securities', ktrade: 'KTrade Securities' };

/**
 * One PSX trade as a formal contract-note style receipt (owner, 2026-11-26: no extra dates or text): shares × price,
 * trade value, charges, the net paid / received, trade date, settlement date only when it differs, broker.
 */
export default function StockTradeReceipt() {
  const hidden = useHidden();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const trades = useTrades();
  const t = trades.data?.find((r) => r.id === id);
  if (!t && trades.isLoading) return <Screen back title="Receipt"><Skeleton height={420} radius={28} /></Screen>;
  if (!t) return <Screen back title="Receipt"><EmptyState title="Trade not found" body="It may have been removed." action="Go back" onAction={() => router.back()} /></Screen>;

  const buy = t.type === 'buy';
  const value = new Decimal(String(t.quantity)).times(String(t.price));
  const fee = new Decimal(String(t.fee ?? 0));
  const total = buy ? value.plus(fee) : value.minus(fee);
  const m = (v: Decimal | number) => money(v.toString(), { hidden, decimals: 2 });
  const price = hidden ? money(0, { hidden }) : money(String(t.price), { decimals: new Decimal(String(t.price)).decimalPlaces() > 2 ? 4 : 2 });
  return (
    <Screen back title="Receipt" scroll={false}>
      <View style={{ flex: 1, paddingBottom: insets.bottom + space.md }}>
        <Receipt
          fill
          icon={<StockLogo symbol={t.symbol} size={52} />}
          title={t.symbol}
          subtitle={t.company_name ?? undefined}
          amount={`${buy ? '−' : '+'}${m(total)}`}
          positive={!buy}
          status={buy ? 'Buy' : 'Sell'}
          rows={[
            { label: 'Trade date', value: receiptDate(t.date) },
            ...(t.settlement_date && t.settlement_date !== t.date ? [{ label: 'Settlement date', value: receiptDate(t.settlement_date) }] : []),
            { label: 'Shares × price', value: `${units(t.quantity)} × ${price}` },
            { label: 'Trade value', value: m(value) },
            { label: 'Charges', value: `${buy ? '+' : '−'}${m(fee)}` },
            { label: buy ? 'Net paid' : 'Net received', value: m(total), strong: true },
            ...(t.broker ? [{ label: 'Broker', value: BROKER[t.broker.toLowerCase()] ?? t.broker.toUpperCase() }] : []),
          ]}
          reference={t.id.slice(0, 8).toUpperCase()}
        />
      </View>
    </Screen>
  );
}
