import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { fetchedShort, fundStamp, type PriceStamp } from '@/data/engines';
import { useFundsAnalysis } from '@/data/portfolio';
import { RangeButton } from '@/features/range/RangeButton';
import { usePeriod } from '@/features/range/usePeriod';
import { shortDate, todayIso } from '@/lib/dates';
import { compactNumber, group, isLong, share, units } from '@/lib/format';
import { BlackGlass, GLASS_INK, GLASS_INK2, GlassStats } from '@/ui/BlackGlass';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { ChevronRight, ScrollText } from '@/ui/icons';
import { AmcLogo } from '@/ui/Logos';
import { Gap } from '@/ui/primitives';
import { PriceStampSheet } from '@/ui/PriceStampSheet';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { dark, font, space } from '@/ui/tokens';

/**
 * One mutual-fund holding (owner, 2026-11-14): black Apple glass, only what matters, little scrolling — the fund,
 * its value and gain, four figures, and a link to its transactions.
 * Follows the global period (owner, 2026-11-15): units, value, invested and unrealized as at the period's end;
 * realized (redemptions, distributions, CGT) and transactions within it.
 */
export default function FundDetail() {
  const hidden = useHidden();
  const { key } = useLocalSearchParams<{ key: string }>();
  const period = usePeriod();
  const range = period.upTo;
  const { analysis, isLoading } = useFundsAnalysis(range);
  const x = analysis?.allPositions.find((pos) => pos.key === key);
  const right = <RangeButton />;
  const [stamp, setStamp] = useState<PriceStamp | null>(null);

  if (isLoading && !analysis) return <Screen back title="Mutual fund" right={right}><Skeleton height={200} radius={22} /><Gap h={space.md} /><Skeleton height={160} radius={22} /></Screen>;
  if (!x) return <Screen back title="Mutual fund" right={right}><EmptyState title="Nothing in this period" body={`No entries for this fund by the end of ${period.label}.`} /></Screen>;

  const rs = (v: number | null) => (hidden ? '••••' : v === null ? '—' : `Rs ${isLong(v, 1e7) ? compactNumber(v) : group(v, Math.abs(v) < 1e4 ? 2 : 0)}`);
  const signed = (v: number) => (hidden ? '••••' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${rs(Math.abs(v))}`);
  const gain = x.unrealized.gross;
  const g = share(gain, x.invested);
  const gColor = gain > 0 ? dark.pos : gain < 0 ? dark.neg : GLASS_INK2;
  const count = x.entries.filter((e) => !e.reverses_entry_id && String(e.trade_date) >= range.start && String(e.trade_date) <= range.end).length;
  const past = range.end < todayIso();
  const realized = x.realized.net;

  return (
    <Screen back title="Mutual fund" right={right}>
      <BlackGlass style={styles.hero}>
        <View style={styles.head}>
          <AmcLogo code={x.amcCode} name={x.amcName} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.name} numberOfLines={3}>{x.fundName ?? 'Fund'}</Text>
            <Text style={styles.small} numberOfLines={1}>
              {x.amcName ?? 'Mutual fund'}
            </Text>
          </View>
        </View>
        <Text style={[styles.small, { marginTop: space.lg }]}>{x.isOpen ? (past ? `Value on ${shortDate(range.end)}` : 'Current value') : `Fully redeemed · realized in ${period.label}`}</Text>
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{x.isOpen ? rs(x.value) : signed(realized)}</Text>
        {x.isOpen ? (
          <Text style={[styles.gain, { color: gColor }]}>{signed(gain)}{g !== null && !hidden ? `  ·  ${gain < 0 ? '−' : '+'}${Math.abs(g).toFixed(1)}%` : ''}<Text style={styles.small}>  unrealized gain</Text></Text>
        ) : null}
        {!x.inRange ? <Text style={[styles.small, { marginTop: space.sm }]}>Not held or traded in {period.label}</Text> : null}
      </BlackGlass>

      <BlackGlass style={styles.block}>
        <GlassStats items={[
          { label: 'Units', value: units(x.units) },
          // Owner, 2026-11-15: the current NAV and its date, not the cost per unit.
          // Tap or long-press → when this price was fetched and where from (owner, 2026-11-22).
          { label: 'Current NAV', value: x.price ? group(x.price.value, 4) : '—',
            sub: x.price ? `${shortDate(x.price.date)}${x.price.stale ? ' · old' : ''}${fetchedShort(x.price.fetchedAt) ? ` · ${fetchedShort(x.price.fetchedAt)}` : ''}` : 'No price yet', subColor: x.price?.stale ? dark.warn : undefined,
            ...(x.price ? { onPress: () => setStamp(fundStamp(x.price, x.fundName)), onLongPress: () => setStamp(fundStamp(x.price, x.fundName)), hint: 'Shows when this price was fetched and where from' } : {}) },
          { label: 'Invested', value: rs(x.invested) },
          { label: 'Realized', value: signed(realized), color: realized > 0 ? dark.pos : realized < 0 ? dark.neg : GLASS_INK, sub: `${period.label} · after CGT` },
          // What the statements deducted and gave back in the period (owner, 2026-11-15: "clearly see the CGT paid and refunded").
          { label: 'CGT paid', value: (x.realized.cgtPaid ?? 0) ? `−${rs(x.realized.cgtPaid ?? 0)}` : rs(0), color: (x.realized.cgtPaid ?? 0) ? dark.neg : GLASS_INK, sub: 'on realized gains' },
          { label: 'CGT refunded', value: (x.realized.cgtRefunded ?? 0) ? `+${rs(x.realized.cgtRefunded ?? 0)}` : rs(0), color: (x.realized.cgtRefunded ?? 0) ? dark.pos : GLASS_INK, sub: 'refunds and reversals' },
        ]} />
      </BlackGlass>

      <BlackGlass style={[styles.block, styles.link]} onPress={() => router.push({ pathname: '/fund-entries/[key]', params: { key: x.key } })}
        accessibilityLabel={`Transactions in ${period.label}, ${count}`}>
        <View style={styles.linkIcon}><ScrollText size={18} color={GLASS_INK} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.linkTitle}>Transactions</Text>
          <Text style={styles.small}>{count} entr{count === 1 ? 'y' : 'ies'} in {period.label}</Text>
        </View>
        <ChevronRight size={18} color={GLASS_INK2} />
      </BlackGlass>
      <PriceStampSheet stamp={stamp} onClose={() => setStamp(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingVertical: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { color: GLASS_INK, fontFamily: font.bold, fontSize: 17, lineHeight: 22 },
  small: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12 },
  value: { color: dark.pos, fontFamily: font.numHeavy, fontSize: 32, lineHeight: 39, letterSpacing: -0.8, marginTop: 2 },
  gain: { fontFamily: font.num, fontSize: 14, marginTop: 2 },
  block: { marginTop: space.md },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  linkIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  linkTitle: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 15 },
});
