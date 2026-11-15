import Decimal from 'decimal.js';
import { BlurTargetView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFundsAnalysis } from '@/data/portfolio';
import { useTrades } from '@/data/queries';
import { RangeButton } from '@/features/range/RangeButton';
import { RangeSheet } from '@/features/range/RangeSheet';
import { CardArt } from '@/features/today/cardDesigns';
import { addDays, ALL_TIME_START, todayIso } from '@/lib/dates';
import { compactNumber, group, money, units } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { rangeLabel, rangePillLabel, resolveRange, type RangeChoice } from '@/lib/range';
import { useApp } from '@/lib/store';
import { GLASS_INK, GLASS_INK2 } from '@/ui/BlackGlass';
import { EmptyState } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { GlassSheet } from '@/ui/GlassSheet';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, ChevronLeft, LayoutGrid } from '@/ui/icons';
import { SearchAndFilter } from '@/features/money/SearchAndFilter';
import { AmcLogo, StockLogo } from '@/ui/Logos';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { font, SCREEN_PAD, space } from '@/ui/tokens';

type Row = { id: string; date: string; inflow: boolean; title: string; sub: string; amount: number; filterKey: string; logo: React.ReactNode; open: () => void };
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ENTRY: Record<string, string> = { purchase: 'Purchase', redemption: 'Redemption', switch_in: 'Switch in', switch_out: 'Switch out', cgt_refund_reinvest: 'CGT refund reinvested', capital_refund_units: 'Capital refund', dividend_reinvest: 'Dividend reinvested' };

function dayParts(iso: string, today: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = `${d} ${MON[m - 1]}${String(y) !== today.slice(0, 4) ? ` ${y}` : ''}`;
  if (iso === today) return { main: 'Today', sub: date };
  if (iso === addDays(today, -1)) return { main: 'Yesterday', sub: date };
  return { main: WEEKDAY[new Date(y, m - 1, d).getDay()], sub: date };
}

/**
 * All fund or share transactions (owner, 2026-11-14: the icon on Holdings), in the Wallet transactions theme: the
 * card art under dark glass with what went in and came out, a search, a fund / stock selector, the period, and
 * the days as glass groups. Tap a row → its receipt.
 */
export default function InvestTransactions() {
  const p = useTheme();
  const hidden = useHidden();
  const insets = useSafeAreaInsets();
  const { side: sideParam } = useLocalSearchParams<{ side?: string }>();
  const side = sideParam === 'stocks' ? 'stocks' : 'funds';
  const allTime = useMemo(() => ({ start: ALL_TIME_START, end: todayIso() }), []);
  const funds = useFundsAnalysis(allTime);
  const trades = useTrades();
  const cardDesign = useApp((s) => s.cardDesign);
  const [choice, setChoice] = useState<RangeChoice>(useApp.getState().range);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const target = useRef<ComponentRef<typeof View>>(null);
  const today = todayIso();
  const range = useMemo(() => resolveRange(choice, today), [choice, today]);
  const dark = p.mode === 'dark';

  // Every row of this side, with what the selector filters on.
  const all = useMemo<Row[]>(() => {
    if (side === 'funds') {
      return (funds.analysis?.allPositions ?? []).flatMap((x) => x.entries.filter((e) => !e.reverses_entry_id).map((e) => {
        const u = Number(e.unit_delta ?? 0);
        const amt = Number(e.gross_amount ?? e.net_amount ?? 0);
        return {
          id: String(e.id), date: String(e.trade_date), inflow: u >= 0, filterKey: x.key, amount: amt,
          title: ENTRY[String(e.entry_type)] ?? String(e.entry_type).replace(/_/g, ' '),
          sub: `${x.fundName ?? 'Fund'} · ${u > 0 ? '+' : ''}${units(u)} units`,
          logo: <AmcLogo code={x.amcCode} name={x.amcName} size={36} />,
          open: () => router.push({ pathname: '/fund-entry/[id]', params: { id: String(e.id), key: x.key } }),
        };
      }));
    }
    return (trades.data ?? []).map((t) => ({
      id: t.id, date: t.date, inflow: t.type === 'buy', filterKey: t.symbol, amount: Number(new Decimal(String(t.quantity)).times(String(t.price)).toFixed(2)),
      title: `${t.type === 'buy' ? 'Bought' : 'Sold'} ${t.symbol}`, sub: `${units(t.quantity)} @ ${group(Number(t.price), 2)}${t.broker ? ` · ${t.broker.toUpperCase()}` : ''}`,
      logo: <StockLogo symbol={t.symbol} size={36} />,
      open: () => router.push({ pathname: '/stock-trade/[id]', params: { id: t.id } }),
    }));
  }, [side, funds.analysis, trades.data]);

  // Selector options: each fund / stock seen, biggest activity first.
  const options = useMemo(() => {
    const map = new Map<string, { key: string; name: string; logo: React.ReactNode; total: number }>();
    for (const r of all) {
      const cur = map.get(r.filterKey) ?? { key: r.filterKey, name: side === 'funds' ? r.sub.split(' · ')[0] : r.filterKey, logo: r.logo, total: 0 };
      cur.total += r.amount;
      map.set(r.filterKey, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [all, side]);
  const chosen = options.find((o) => o.key === pick) ?? null;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((r) => r.date >= range.start && r.date <= range.end && (!pick || r.filterKey === pick)
      && (!needle || `${r.title} ${r.sub}`.toLowerCase().includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [all, range.start, range.end, pick, q]);
  const days = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) map.set(r.date, [...(map.get(r.date) ?? []), r]);
    return [...map.entries()];
  }, [rows]);
  const totIn = rows.filter((r) => r.inflow).reduce((s, r) => s + r.amount, 0);
  const totOut = rows.filter((r) => !r.inflow).reduce((s, r) => s + r.amount, 0);
  const rs = (v: number) => (hidden ? 'Rs ••••' : `Rs ${Math.abs(v) >= 1e7 ? compactNumber(v) : group(v, 0)}`);
  const title = 'Transactions';
  const glassEdge = { borderColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(16,20,12,0.10)', borderBottomColor: dark ? 'rgba(255,255,255,0.26)' : 'rgba(16,20,12,0.18)' };
  const glassFill: [string, string] = dark ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)'] : ['rgba(255,255,255,0.98)', 'rgba(232,235,228,0.95)'];
  const rowGlass = dark ? { bg: 'rgba(255,255,255,0.045)', border: 'rgba(255,255,255,0.08)' } : { bg: 'rgba(255,255,255,0.78)', border: 'rgba(16,20,12,0.08)' };

  return (
    <View style={[styles.root, { backgroundColor: p.bg }]}>
      <BlurTargetView ref={target} style={[styles.root, { backgroundColor: p.bg, paddingTop: insets.top }]}>
        <Animated.View entering={FadeInDown.duration(260)} style={styles.root}>
          <View style={styles.top}>
            <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back" style={[styles.iconBtn, glassEdge]}>
              <LinearGradient colors={glassFill} style={StyleSheet.absoluteFill} />
              <ChevronLeft size={19} color={p.ink} />
            </Pressable>
            <Text style={[styles.title, { color: p.ink }]} numberOfLines={1}>{title}</Text>
            <RangeButton label={rangePillLabel(range, today)} onPress={() => setRangeOpen(true)} />
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: insets.bottom + space.xxl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.panel}>
              <CardArt id={cardDesign} />
              <LinearGradient colors={['rgba(8,8,10,0.58)', 'rgba(8,8,10,0.84)']} style={StyleSheet.absoluteFill} />
              <Text style={styles.small}>{side === 'funds' ? 'Invested' : 'Bought'}{chosen ? ` · ${chosen.name}` : ''}</Text>
              <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{rs(totIn)}</Text>
              <View style={styles.tiles}>
                <View style={styles.tile}><Text style={styles.small}>{side === 'funds' ? 'Redeemed' : 'Sold'}</Text><Text style={styles.tileNum}>{rs(totOut)}</Text></View>
                <View style={styles.tile}><Text style={styles.small}>Transactions</Text><Text style={styles.tileNum}>{rows.length}</Text></View>
              </View>
            </View>

            <SearchAndFilter q={q} setQ={setQ} title={title} edge={glassEdge} fill={glassFill} filter={
              <Pressable onPress={() => { haptic.tick(); setPickOpen(true); }} accessibilityRole="button" style={[styles.pick, glassEdge]}
                accessibilityLabel={`${side === 'funds' ? 'Fund' : 'Stock'}: ${chosen?.name ?? 'all'}. Change`}>
                <LinearGradient colors={glassFill} style={StyleSheet.absoluteFill} />
                {chosen ? <View style={{ transform: [{ scale: 0.6 }], marginHorizontal: -6 }}>{chosen.logo}</View> : <LayoutGrid size={15} color={p.ink2} />}
                <Text style={[styles.pickText, { color: p.ink }]} numberOfLines={1}>{chosen?.name ?? (side === 'funds' ? 'All funds' : 'All stocks')}</Text>
                <ChevronDown size={14} color={p.ink2} />
              </Pressable>
            } />

            {days.length ? days.map(([date, list]) => {
              const d = dayParts(date, today);
              return (
                <View key={date}>
                  <View style={styles.day}>
                    <Text style={[styles.dayMain, { color: p.ink }]}>{d.main}</Text>
                    <Text style={[styles.daySub, { color: p.muted }]}>{d.sub}</Text>
                  </View>
                  <View style={[styles.group, { backgroundColor: rowGlass.bg, borderColor: rowGlass.border }]}>
                    {list.map((r, i) => {
                      const Icon = r.inflow ? ArrowDownLeft : ArrowUpRight;
                      return (
                        <Pressable key={r.id} onPress={r.open} accessibilityRole="button" style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: rowGlass.border }, { opacity: pressed ? 0.75 : 1 }]}>
                          {r.logo}
                          <View style={{ flex: 1, gap: 1 }}>
                            <View style={styles.titleRow}><Icon size={13} color={p.ink2} /><Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{r.title}</Text></View>
                            <Text variant="caption" tone="muted" numberOfLines={1}>{r.sub}</Text>
                          </View>
                          <Text style={[styles.amt, { color: p.ink }]}>{money(r.amount, { hidden })}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            }) : <EmptyState title="Nothing here" body={q || pick ? 'No transactions match these filters.' : `No ${title.toLowerCase()} in ${rangeLabel(range, today)}.`} />}
          </ScrollView>
        </Animated.View>
      </BlurTargetView>

      {pickOpen ? (
        <GlassSheet blurTarget={target} onClose={() => setPickOpen(false)} title={side === 'funds' ? 'Fund' : 'Stock'} maxHeight={0.75}>
          {[{ key: null as string | null, name: side === 'funds' ? 'All funds' : 'All stocks', logo: null as React.ReactNode, total: 0 }, ...options].map((o, i) => {
            const on = o.key === pick;
            return (
              <Pressable key={o.key ?? 'all'} onPress={() => { haptic.tick(); setPick(o.key); setPickOpen(false); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                style={({ pressed }) => [styles.option, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: rowGlass.border }, { opacity: pressed ? 0.75 : 1 }]}>
                {o.logo ?? <View style={[styles.allIcon, { backgroundColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)' }]}><LayoutGrid size={17} color={p.ink2} /></View>}
                <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>{o.name}</Text>
                {on ? <Check size={18} color={dark ? p.accent : p.accentDeep} strokeWidth={2.6} /> : null}
              </Pressable>
            );
          })}
        </GlassSheet>
      ) : null}
      {rangeOpen ? <RangeSheet blurTarget={target} range={range} onChoose={setChoice} onClose={() => setRangeOpen(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: SCREEN_PAD, height: 60 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: font.bold, fontSize: 21, letterSpacing: -0.4 },
  panel: { borderRadius: 24, overflow: 'hidden', padding: space.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderTopColor: 'rgba(255,255,255,0.28)', backgroundColor: '#0A0A0B' },
  small: { color: GLASS_INK2, fontFamily: font.medium, fontSize: 12 },
  total: { color: GLASS_INK, fontFamily: font.numHeavy, fontSize: 34, lineHeight: 42, letterSpacing: -1, marginTop: 2 },
  tiles: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  tile: { flex: 1, gap: 2, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' },
  tileNum: { color: GLASS_INK, fontFamily: font.num, fontSize: 15.5, lineHeight: 21 },
  pick: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, height: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  pickText: { flex: 1, fontFamily: font.semibold, fontSize: 13.5 },
  day: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: space.xl, paddingBottom: space.sm, paddingHorizontal: 4 },
  dayMain: { fontFamily: font.semibold, fontSize: 14.5 },
  daySub: { fontFamily: font.medium, fontSize: 13 },
  group: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  amt: { fontFamily: font.num, fontSize: 14.5 },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56 },
  allIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
