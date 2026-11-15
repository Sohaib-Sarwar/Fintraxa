import Decimal from 'decimal.js';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useStocksAnalysis } from '@/data/portfolio';
import { RangeButton } from '@/features/range/RangeButton';
import { usePeriod } from '@/features/range/usePeriod';
import { monthLabel, shortDate } from '@/lib/dates';
import { group, money, units } from '@/lib/format';
import { BlackGlass, GLASS_INK, GLASS_INK2, GLASS_LINE } from '@/ui/BlackGlass';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { ArrowDownLeft, ArrowUpRight } from '@/ui/icons';
import { StockLogo } from '@/ui/Logos';
import { Gap } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { font, space } from '@/ui/tokens';

/**
 * Every trade in one stock (owner, 2026-11-14: linked from the stock page), newest first, grouped by month, in
 * black glass: buy / sell, shares @ price, date · broker · fees, and the amount. Only the global period's trades.
 */
export default function StockTrades() {
  const hidden = useHidden();
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const period = usePeriod();
  const range = period.upTo;
  const { analysis, isLoading } = useStocksAnalysis(range);
  const x = analysis?.allPositions.find((pos) => pos.symbol === symbol);
  const right = <RangeButton />;

  const groups = useMemo(() => {
    const rows = (x?.trades ?? []).filter((t) => t.date >= range.start && t.date <= range.end).sort((a, b) => b.date.localeCompare(a.date));
    const map = new Map<string, typeof rows>();
    for (const t of rows) map.set(t.date.slice(0, 7), [...(map.get(t.date.slice(0, 7)) ?? []), t]);
    return [...map.entries()];
  }, [x, range.start, range.end]);
  const count = groups.reduce((n, [, r]) => n + r.length, 0);

  if (isLoading && !analysis) return <Screen back title="Transactions" right={right}><Skeleton height={70} radius={22} /><Gap h={space.md} /><Skeleton height={300} radius={22} /></Screen>;
  if (!x) return <Screen back title="Transactions" right={right}><EmptyState title="Stock not found" body="No trades in this symbol." /></Screen>;

  return (
    <Screen back title="Transactions" right={right}>
      <BlackGlass style={styles.head}>
        <StockLogo symbol={x.symbol} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{x.symbol}</Text>
          <Text style={styles.small}>{count} trade{count === 1 ? '' : 's'} in {period.label}</Text>
        </View>
      </BlackGlass>
      {groups.length ? groups.map(([m, rows]) => (
        <View key={m}>
          <Text variant="label" tone="ink2" style={styles.month}>{monthLabel(m, true)}</Text>
          <BlackGlass style={{ paddingVertical: 0 }}>
            {rows.map((t, i) => {
              const buy = t.type === 'buy';
              const Icon = buy ? ArrowDownLeft : ArrowUpRight;
              return (
                <Pressable key={t.id} onPress={() => router.push({ pathname: '/stock-trade/[id]', params: { id: t.id } })} accessibilityRole="button"
                  style={({ pressed }) => [styles.row, i > 0 && styles.sep, { opacity: pressed ? 0.75 : 1 }]}>
                  <View style={styles.icon}><Icon size={17} color={GLASS_INK} /></View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={styles.title} numberOfLines={1}>{buy ? 'Bought' : 'Sold'} {units(t.quantity)} @ {hidden ? '••' : group(Number(t.price), 2)}</Text>
                    <Text style={styles.small} numberOfLines={1}>
                      {shortDate(t.date)}{t.broker ? ` · ${t.broker.toUpperCase()}` : ''}{t.fee ? ` · fees ${money(t.fee, { hidden, decimals: 2 })}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.amt}>{money(new Decimal(String(t.quantity)).times(String(t.price)).toFixed(2), { hidden })}</Text>
                </Pressable>
              );
            })}
          </BlackGlass>
        </View>
      )) : <EmptyState title="No trades" body={`No buys or sells in ${period.label}.`} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { color: GLASS_INK, fontFamily: font.bold, fontSize: 16 },
  small: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12 },
  month: { marginTop: space.xl, marginBottom: space.sm, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: space.sm },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  title: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 14.5 },
  amt: { color: GLASS_INK, fontFamily: font.num, fontSize: 14.5 },
});
