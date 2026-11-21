import Decimal from 'decimal.js';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { fetchedShort, getStockSector, stockStamp, type PriceStamp } from '@/data/engines';
import { useDividendSummary, useStocksAnalysis } from '@/data/portfolio';
import { RangeButton } from '@/features/range/RangeButton';
import { usePeriod } from '@/features/range/usePeriod';
import { shortDate, todayIso } from '@/lib/dates';
import { addMoney, compactNumber, group, isLong, share, units } from '@/lib/format';
import { BlackGlass, GLASS_INK, GLASS_INK2, GLASS_LINE, GlassStats } from '@/ui/BlackGlass';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { ChevronRight, ScrollText } from '@/ui/icons';
import { StockLogo } from '@/ui/Logos';
import { Gap } from '@/ui/primitives';
import { PriceStampSheet } from '@/ui/PriceStampSheet';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { dark, font, space } from '@/ui/tokens';

/**
 * One PSX holding (owner, 2026-11-14): black Apple glass, only the necessary, little scrolling — what it's worth
 * and today's move, six figures and the total return, and a link to its trades.
 * Follows the global period (owner, 2026-11-15: it showed all-time realized and dividends): holdings, value and
 * unrealized as at the period's end; realized (sales settled in it), dividends (paid in it) and trades within it.
 */
export default function StockDetail() {
  const hidden = useHidden();
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const period = usePeriod();
  const range = period.upTo;
  const { analysis, isLoading } = useStocksAnalysis(range);
  const divs = useDividendSummary(range);
  const x = analysis?.allPositions.find((pos) => pos.symbol === symbol);
  const right = <RangeButton />;
  const [stamp, setStamp] = useState<PriceStamp | null>(null);

  if (isLoading && !analysis) return <Screen back title={symbol} right={right}><Skeleton height={200} radius={22} /><Gap h={space.md} /><Skeleton height={200} radius={22} /></Screen>;
  if (!x) return <Screen back title={symbol} right={right}><EmptyState title="Nothing in this period" body={`No ${symbol} trades by the end of ${period.label}.`} /></Screen>;

  const rs = (v: number | null) => (hidden ? '••••' : v === null ? '—' : `Rs ${isLong(v, 1e7) ? compactNumber(v) : group(v, Math.abs(v) < 1e4 ? 2 : 0)}`);
  const signed = (v: number) => (hidden ? '••••' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${rs(Math.abs(v))}`);
  const tint = (v: number) => (v > 0 ? dark.pos : v < 0 ? dark.neg : GLASS_INK);
  const dividends = Number(divs.all.filter((dv) => dv.symbol === x.symbol && dv.payment_date >= range.start && dv.payment_date <= range.end)
    .reduce((s, dv) => s.plus(dv.net_amount), new Decimal(0)).toFixed(2));
  const past = range.end < todayIso();
  const tradesIn = x.trades.filter((t) => t.date >= range.start && t.date <= range.end).length;
  const day = x.dayChange !== null ? Number(new Decimal(String(x.dayChange)).times(String(x.shares)).toFixed(2)) : null;
  const unreal = x.isOpen ? x.unrealized ?? 0 : 0;
  const total = addMoney(unreal, x.realized, dividends);
  const totalPct = share(total, x.invested || null);

  return (
    <Screen back title={x.symbol} right={right}>
      {/* Formal hero (owner, 2026-11-15: dates and values overflowed): who it is, the value, then two tidy tiles —
          today's move and the last price with its date — each on one line that shrinks rather than wraps. */}
      <BlackGlass style={styles.hero}>
        <View style={styles.head}>
          <StockLogo symbol={x.symbol} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.symbol} numberOfLines={1}>{x.symbol}</Text>
            <Text style={styles.small} numberOfLines={1}>{x.companyName}</Text>
          </View>
          <View style={styles.sector}><Text style={styles.sectorText} numberOfLines={1}>{getStockSector(x.symbol)}</Text></View>
        </View>
        <View style={styles.rule} />
        <Text style={styles.small} numberOfLines={1}>{x.isOpen ? (past ? `Value on ${shortDate(range.end)}` : 'Market value') : `Sold out · realized in ${period.label}`}</Text>
        <Text style={[styles.value, !x.isOpen && { color: tint(x.realized) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{x.isOpen ? rs(x.value) : signed(x.realized)}</Text>
        {x.isOpen ? (
          <View style={styles.tiles}>
            <View style={styles.tile}>
              <Text style={styles.small} numberOfLines={1}>{past ? 'On the day' : 'Today'}</Text>
              <Text style={[styles.tileValue, { color: day === null ? GLASS_INK2 : tint(day) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {day === null ? '—' : signed(day)}
              </Text>
              <Text style={[styles.small, { color: day === null ? GLASS_INK2 : tint(day) }]} numberOfLines={1}>
                {x.dayChangePct !== null && !hidden ? `${x.dayChangePct > 0 ? '+' : ''}${x.dayChangePct.toFixed(2)}%` : day === null ? 'No move yet' : ' '}
              </Text>
            </View>
            {/* Tap or long-press → when this price was fetched and where from (owner, 2026-11-22). */}
            <Pressable style={({ pressed }) => [styles.tile, styles.tileRight, { opacity: pressed ? 0.7 : 1 }]} disabled={x.price === null}
              onPress={() => setStamp(stockStamp(x))} onLongPress={() => setStamp(stockStamp(x))}
              accessibilityRole="button" accessibilityLabel={`Last price${x.price === null ? '' : `, Rs ${group(x.price, 2)}`}`} accessibilityHint="Shows when this price was fetched and where from">
              <Text style={styles.small} numberOfLines={1}>Last price</Text>
              <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{x.price === null ? '—' : hidden ? '••' : `Rs ${group(x.price, 2)}`}</Text>
              <Text style={styles.small} numberOfLines={1}>{[x.priceDate ? shortDate(x.priceDate) : null, fetchedShort(x.priceFetchedAt)].filter(Boolean).join(' · ') || ' '}</Text>
            </Pressable>
          </View>
        ) : null}
        {!x.inRange ? <Text style={[styles.small, { marginTop: space.sm }]} numberOfLines={2}>No shares held or traded in {period.label}</Text> : null}
      </BlackGlass>

      <BlackGlass style={styles.block}>
        <GlassStats items={[
          { label: 'Shares', value: units(x.shares) },
          { label: 'Avg cost (incl. fees)', value: x.avgCost === null ? '—' : rs(x.avgCost) },
          { label: 'Invested', value: rs(x.invested) },
          { label: 'Unrealized', value: signed(unreal), color: tint(unreal), sub: x.unrealizedPct !== null && !hidden ? `${x.unrealizedPct > 0 ? '+' : ''}${x.unrealizedPct.toFixed(1)}%` : undefined, subColor: tint(unreal) },
          { label: 'Realized (after fees)', value: signed(x.realized), color: tint(x.realized), sub: period.label },
          // Tap → this stock's dividend payments in the same period (owner, 2026-11-15).
          { label: 'Dividends received', value: signed(dividends), color: tint(dividends), sub: period.label,
            onPress: () => router.push({ pathname: '/passive-entries', params: { source: 'dividends', symbol: x.symbol } }) },
        ]} />
        <View style={styles.total}>
          <Text style={styles.totalLabel}>Total return</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.totalValue, { color: tint(total) }]}>{signed(total)}</Text>
            {totalPct !== null && !hidden ? <Text style={styles.small}>{totalPct > 0 ? '+' : ''}{totalPct.toFixed(1)}% of invested</Text> : null}
          </View>
        </View>
      </BlackGlass>

      <BlackGlass style={[styles.block, styles.link]} onPress={() => router.push({ pathname: '/stock-trades/[symbol]', params: { symbol: x.symbol } })}
        accessibilityLabel={`Transactions in ${period.label}, ${tradesIn}`}>
        <View style={styles.linkIcon}><ScrollText size={18} color={GLASS_INK} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.linkTitle}>Transactions</Text>
          <Text style={styles.small}>{tradesIn} trade{tradesIn === 1 ? '' : 's'} in {period.label}</Text>
        </View>
        <ChevronRight size={18} color={GLASS_INK2} />
      </BlackGlass>
      <PriceStampSheet stamp={stamp} onClose={() => setStamp(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingVertical: space.lg },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: GLASS_LINE, marginVertical: space.md },
  sector: { maxWidth: 120, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' },
  sectorText: { color: GLASS_INK2, fontFamily: font.medium, fontSize: 11 },
  tiles: { flexDirection: 'row', marginTop: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  tile: { flex: 1, gap: 2, paddingRight: space.md },
  tileRight: { paddingLeft: space.md, paddingRight: 0, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: GLASS_LINE },
  tileValue: { color: GLASS_INK, fontFamily: font.num, fontSize: 17, lineHeight: 22 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  symbol: { color: GLASS_INK, fontFamily: font.bold, fontSize: 19, letterSpacing: 0.2 },
  small: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12 },
  value: { color: dark.pos, fontFamily: font.numHeavy, fontSize: 32, lineHeight: 39, letterSpacing: -0.8, marginTop: 2 },
  block: { marginTop: space.md },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  totalLabel: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 14.5 },
  totalValue: { fontFamily: font.numHeavy, fontSize: 18, lineHeight: 23 },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  linkIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  linkTitle: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 15 },
});
