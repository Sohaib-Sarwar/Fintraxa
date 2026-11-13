import Decimal from 'decimal.js';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { ChevronLeft } from '@/ui/icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTrades } from '@/data/queries';
import { shortDate } from '@/lib/dates';
import { money, units } from '@/lib/format';
import { EmptyState } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { ListRow } from '@/ui/ListRow';
import { StockLogo } from '@/ui/Logos';
import { IconButton, Pill } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { SCREEN_PAD, space } from '@/ui/tokens';

export default function Trades() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const hidden = useHidden();
  const trades = useTrades();
  const rows = trades.data ?? [];
  return (
    <View style={[styles.root, { backgroundColor: p.bg, paddingTop: insets.top }]}>
      <View style={styles.top}>
        <IconButton icon={ChevronLeft} label="Back" onPress={() => router.back()} size={26} />
        <Text variant="headline">Trades</Text>
        <View style={{ width: 48 }} />
      </View>
      {rows.length ? (
        <FlashList
          data={rows}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: insets.bottom + space.xxl }}
          renderItem={({ item: t }) => (
            <ListRow
              leading={<StockLogo symbol={t.symbol} />}
              title={`${t.symbol}`}
              subtitle={`${shortDate(t.date)} · ${units(t.quantity)} @ ${money(t.price, { decimals: 2 }).replace('Rs ', '')}${t.broker ? ` · ${t.broker.toUpperCase()}` : ''}`}
              trailing={<Text variant="num">{money(new Decimal(String(t.quantity)).times(String(t.price)).toFixed(2), { hidden })}</Text>}
              trailingSub={<Pill tone={t.type === 'buy' ? 'flat' : 'accent'} text={t.type === 'buy' ? 'Buy' : 'Sell'} />}
              onPress={() => router.push({ pathname: '/stock/[symbol]', params: { symbol: t.symbol.toUpperCase() } })}
            />
          )}
        />
      ) : <EmptyState title="No trades yet" body="Upload a broker confirmation or add a trade on the web app." />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, minHeight: 56 },
});
