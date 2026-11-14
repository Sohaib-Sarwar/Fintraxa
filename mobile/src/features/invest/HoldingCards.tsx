/**
 * Holding cards (owner, 2026-11-14), dark Apple glass in both themes. Funds: logo + full name, current value big
 * and green, gain (Rs and %), invested. Stocks (compact): symbol, shares · avg buying price, worth, gain.
 * Tap → the fund / share page.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { FundPosition, StockPosition } from '@/data/types';
import { compactNumber, group, isLong, share, units } from '@/lib/format';
import { useHidden } from '@/ui/Figures';
import { AmcLogo, StockLogo } from '@/ui/Logos';
import { BlackGlass } from '@/ui/BlackGlass';
import { Text } from '@/ui/Text';
import { dark, font, space } from '@/ui/tokens';

const INK = '#F3F4F2';
const INK2 = 'rgba(243,244,242,0.62)';

/**
 * Fund holding (owner): a little taller than the stock cards so the details read well — logo, the full fund name
 * (up to three lines), units · invested small, then the worth big and green with the gain (Rs and %).
 */
export function FundCard({ x }: { x: FundPosition }) {
  const hidden = useHidden();
  const rs = (v: number) => `Rs ${isLong(v, 1e7) ? compactNumber(v) : group(v, 0)}`;
  const gain = x.unrealized.gross;
  const g = share(gain, x.invested);
  const gColor = gain > 0 ? dark.pos : gain < 0 ? dark.neg : INK2;
  return (
    <BlackGlass style={styles.fund} onPress={() => router.push({ pathname: '/fund/[key]', params: { key: x.key } })}
      accessibilityLabel={`${x.fundName ?? 'Fund'}, worth ${hidden ? 'hidden' : rs(x.value ?? 0)}, gain ${hidden ? 'hidden' : rs(gain)}`}>
      <View style={styles.fundHead}>
        <AmcLogo code={x.amcCode} name={x.amcName} size={42} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.fundName} numberOfLines={3}>{x.fundName ?? 'Fund'}</Text>
          <Text style={styles.label} numberOfLines={1}>{units(x.units)} units · invested {hidden ? '••••' : rs(x.invested)}</Text>
        </View>
      </View>
      <View style={styles.fundFoot}>
        <Text style={styles.worthBig} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{hidden ? 'Rs ••••' : x.value === null ? '—' : rs(x.value)}</Text>
        <Text style={[styles.label, { color: gColor, fontFamily: font.numMedium, fontSize: 13 }]} numberOfLines={1}>
          {hidden ? '••••' : `${gain > 0 ? '+' : gain < 0 ? '−' : ''}${rs(Math.abs(gain))}${g !== null ? ` · ${gain < 0 ? '−' : '+'}${Math.abs(g).toFixed(1)}%` : ''}`}
        </Text>
      </View>
    </BlackGlass>
  );
}

/**
 * Compact stock holding (owner): logo, the symbol bold, shares · average buying price small; on the right the
 * current worth big and green, and the gain in rupees and percent small. Same dark glass as the fund cards.
 */
export function StockCard({ x }: { x: StockPosition }) {
  const hidden = useHidden();
  const rs = (v: number) => `Rs ${isLong(v, 1e7) ? compactNumber(v) : group(v, 0)}`;
  const gain = x.unrealized ?? 0;
  const g = share(gain, x.invested);
  const gColor = gain > 0 ? dark.pos : gain < 0 ? dark.neg : INK2;
  return (
    <Pressable onPress={() => router.push({ pathname: '/stock/[symbol]', params: { symbol: x.symbol } })} accessibilityRole="button"
      accessibilityLabel={`${x.symbol}, ${units(x.shares)} shares, worth ${hidden ? 'hidden' : rs(x.value ?? 0)}, gain ${hidden ? 'hidden' : rs(gain)}`}
      style={({ pressed }) => [styles.card, styles.compact, { opacity: pressed ? 0.88 : 1 }]}>
      <LinearGradient colors={['#0A0A0B', '#000000']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.015)', 'rgba(255,255,255,0)']} locations={[0, 0.45, 1]} end={{ x: 0.6, y: 0.8 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <StockLogo symbol={x.symbol} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.symbol} numberOfLines={1}>{x.symbol}</Text>
        <Text style={styles.label} numberOfLines={1}>
          {units(x.shares)} shares{x.avgCost !== null ? ` · avg ${hidden ? '••' : `Rs ${group(x.avgCost, 2)}`}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={styles.worth} numberOfLines={1}>{hidden ? 'Rs ••••' : x.value === null ? '—' : rs(x.value)}</Text>
        <Text style={[styles.label, { color: gColor, fontFamily: font.numMedium }]} numberOfLines={1}>
          {hidden ? '••••' : `${gain > 0 ? '+' : gain < 0 ? '−' : ''}${rs(Math.abs(gain))}${g !== null ? ` · ${gain < 0 ? '−' : '+'}${Math.abs(g).toFixed(1)}%` : ''}`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, overflow: 'hidden', padding: space.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderTopColor: 'rgba(255,255,255,0.20)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  name: { flex: 1, color: INK, fontFamily: font.semibold, fontSize: 15, lineHeight: 20 },
  label: { color: INK2, fontFamily: font.medium, fontSize: 11.5 },
  value: { color: dark.pos, fontFamily: font.numHeavy, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, marginTop: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginTop: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.10)' },
  num: { fontFamily: font.num, fontSize: 14.5, lineHeight: 19, marginTop: 1 },
  compact: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  fundName: { color: INK, fontFamily: font.semibold, fontSize: 15, lineHeight: 20 },
  fund: { paddingVertical: space.lg },
  fundHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  fundFoot: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md, marginTop: space.md, paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  worthBig: { flexShrink: 1, color: dark.pos, fontFamily: font.numHeavy, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  symbol: { color: INK, fontFamily: font.bold, fontSize: 16, letterSpacing: 0.2 },
  worth: { color: dark.pos, fontFamily: font.numHeavy, fontSize: 18, lineHeight: 23, letterSpacing: -0.3 },
});
