import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useInvestView, type InvestView } from '@/features/nav/investView';
import { assetRows, valueSeries, type ValuePoint } from '@/data/engines';
import { useFundsAnalysis, useStocksAnalysis } from '@/data/portfolio';
import { useSnapshots, useUid } from '@/data/queries';
import { RangeButton } from '@/features/range/RangeButton';
import { usePeriod } from '@/features/range/usePeriod';
import { type DonutItem } from '@/features/today/AllocationDonut';
import { ChartCard } from '@/features/today/ChartCard';
import { GainChange } from '@/features/invest/GainChange';
import { NetWorthCard } from '@/features/today/NetWorthCard';
import { ALL_TIME_START, fyOf, monthLabel, monthName, todayIso } from '@/lib/dates';
import { autoDecimals, compactNumber, group, share } from '@/lib/format';
import { useTracks } from '@/lib/store';
import { EmptyState, ErrorState, OfflinePill, Skeleton } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { LineChart } from '@/ui/icons';
import { AmcLogo, StockLogo } from '@/ui/Logos';
import { Card, Gap } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { font, space } from '@/ui/tokens';

/** Screen header row (title 44 + padding) and the space kept above the nav, as on Home. */
const HEADER_H = 44 + space.sm + space.md;
const BOTTOM_SPACE = 80 + 14;

type FundsQ = ReturnType<typeof useFundsAnalysis>;
type StocksQ = ReturnType<typeof useStocksAnalysis>;

/** Month bars for one side, with the web ValueChart's hover figures (value, invested, unrealized, realized). */
type InvestBar = ValuePoint & { key: string };

/**
 * Month bars for one side, built with the web's own functions exactly like its dashboards:
 * valueSeries(assetRows(snapshots, side, the period's analysis), { period: 'month', range, fillGaps }).
 */
function useInvestBars(side: 'funds' | 'stocks', analysis: unknown) {
  const snaps = useSnapshots();
  const { range } = usePeriod();
  const today = todayIso();
  return useMemo<InvestBar[]>(() => valueSeries(assetRows(snaps.data ?? [], side, analysis ?? undefined), {
    period: 'month', start: range.start, end: range.end, today, fillGaps: true,
  }).slice(-12).map((pt) => ({ ...pt, key: pt.month })), [snaps.data, side, analysis, range.start, range.end, today]);
}

/** Hold card = the web's hover: the value (now / at the month's close), Invested, Unrealized gain, Realized in it. */
function ValueTip({ m }: { m: InvestBar }) {
  const p = useTheme();
  const hidden = useHidden();
  // Same wording and sign rule as the web hover; full rupees (decimals below 10,000).
  const fmt = (v: number) => group(Math.abs(v), autoDecimals(v));
  const signed = (v: number) => (hidden ? '••••' : `${v > 0 ? '+' : v < 0 ? '−' : ''}Rs ${fmt(v)}`);
  const gainColor = m.unrealized > 0 ? p.pos : m.unrealized < 0 ? p.neg : p.ink2;
  return (
    <View style={{ gap: 4 }}>
      <Text variant="bodyStrong" numberOfLines={1}>{monthName(m.key)}</Text>
      <Text style={[styles.tipValue, { color: p.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{hidden ? 'Rs ••••' : `Rs ${fmt(m.value)}`}</Text>
      <Text variant="caption" tone="muted">{m.live ? 'Value now' : 'Value at the end of the month'}</Text>
      <View style={[styles.tipRule, { backgroundColor: p.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }]} />
      {[{ k: 'Invested', v: hidden ? '••••' : `Rs ${fmt(m.invested)}`, c: p.ink },
        { k: 'Unrealized gain', v: signed(m.unrealized), c: gainColor },
        { k: 'Realized in the period', v: signed(m.realized), c: p.ink }].map((r) => (
        <View key={r.k} style={styles.tipRow}>
          <Text variant="caption" tone="ink2" style={{ flex: 1 }} numberOfLines={1}>{r.k}</Text>
          <Text style={[styles.tipNum, { color: r.c }]}>{r.v}</Text>
        </View>
      ))}
    </View>
  );
}

/** The Home chart card for one side: monthly value bars (hold for the web-style detail) | holdings donut. */
function InvestChart({ side, bars, items }: { side: 'funds' | 'stocks'; bars: InvestBar[]; items: DonutItem[] }) {
  const hidden = useHidden();
  const [month, setMonth] = useState<string | null>(null);
  const sel = month && bars.some((b) => b.key === month) ? month : bars[bars.length - 1]?.key;
  return (
    <View style={styles.chartWrap}>
      <ChartCard<InvestBar> barTitle={sel ? monthLabel(sel, true) : 'By month'} bars={bars} selected={sel} onSelect={setMonth} hidden={hidden}
        format={(v) => (hidden ? '••••' : `Rs ${compactNumber(v)}`)} pieTitle={side === 'funds' ? 'Your funds' : 'Your shares'}
        pieItems={items} pieCenter={side === 'funds' ? 'Mutual funds' : 'PSX shares'}
        renderTip={(b) => <ValueTip m={b} />} />
    </View>
  );
}

/**
 * Invest is two separate views behind one tab (owner, 2026-11-14): the nav shows Funds | Stocks while Invest
 * is open (funds first); Home's tiles open the matching view. No combined overview.
 */
export default function InvestTab() {
  const uid = useUid();
  const tracks = useTracks(uid);
  const picked = useInvestView((s) => s.view);
  const today = todayIso();
  const fy = fyOf(today);
  const allTime = useMemo(() => ({ start: ALL_TIME_START, end: today }), [today]);
  const period = usePeriod();
  const view: InvestView = !tracks.stocks ? 'funds' : !tracks.funds ? 'stocks' : picked;
  const funds = useFundsAnalysis(allTime);
  const fundsFy = useFundsAnalysis(period.upTo);
  const stocks = useStocksAnalysis(allTime);
  const stocksFy = useStocksAnalysis(period.upTo);
  const q = view === 'funds' ? funds : stocks;
  const refetch = () => (view === 'funds' ? Promise.all([funds.refetch(), fundsFy.refetch()]) : Promise.all([stocks.refetch(), stocksFy.refetch()]));
  const loading = q.isLoading && !q.analysis;
  const error = !q.analysis ? q.error : null;
  // Card + chart fill the space between the header and the nav, like Home (owner).
  const [viewport, setViewport] = useState(0);
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fill = Math.max(480, (viewport || winH) - insets.top - HEADER_H - insets.bottom - BOTTOM_SPACE);

  return (
    <Screen title={view === 'funds' ? 'Mutual funds' : 'Stocks'} tabBar onRefresh={refetch} right={<RangeButton />} bottomSpace={BOTTOM_SPACE} onViewport={setViewport}>
      <OfflinePill />
      {loading ? (
        <><Skeleton height={200} radius={28} /><Gap h={space.xl} /><Skeleton height={260} radius={24} /></>
      ) : error ? <ErrorState onRetry={refetch} /> : (
        <Animated.View key={view} entering={FadeInDown.duration(260)}>
          {view === 'funds' ? <Funds fy={fy} fundsQ={funds} fundsFy={fundsFy} fill={fill} /> : <Stocks fy={fy} stocks={stocks} stocksFy={stocksFy} fill={fill} />}
        </Animated.View>
      )}
    </Screen>
  );
}

function Funds({ fundsQ: funds, fundsFy, fill }: { fy: number; fundsQ: FundsQ; fundsFy: FundsQ; fill: number }) {
  const p = useTheme();
  const hidden = useHidden();
  const a = funds.analysis;
  const bars = useInvestBars('funds', fundsFy.analysis);
  if (!a || !a.allPositions.length) return <Card><EmptyState icon={<LineChart size={34} color={p.muted} />} title="No funds yet" body="Upload a fund statement with the + button." action="Upload a statement" onAction={() => router.push('/upload')} /></Card>;
  const open = a.positions.filter((x) => x.isOpen).sort((x, y) => (y.value ?? 0) - (x.value ?? 0));
  const t = a.totals;
  return (
    <View style={{ height: fill }}>
      <NetWorthCard label="Mutual funds" value={t.value} onPress={() => router.push({ pathname: '/holdings', params: { side: 'funds' } })}
        aside={<GainChange pct={share(t.unrealized.gross, t.invested)} hidden={hidden} />} holders={[
        { label: 'Invested', value: t.invested, onPress: () => router.push({ pathname: '/holdings', params: { side: 'funds' } }) },
        { label: 'Unrealized', value: t.unrealized.gross, signed: true },
        { label: 'Realized', value: fundsFy.analysis?.totals.realized.net ?? 0 },
      ]} />
      <InvestChart side="funds" bars={bars} items={open.filter((x) => (x.value ?? 0) > 0).map((x) => ({
        key: x.key, label: x.fundName ?? 'Fund', value: x.value ?? 0, logo: (n: number) => <AmcLogo code={x.amcCode} name={x.amcName} size={n} />,
      }))} />
    </View>
  );
}

function Stocks({ stocks, stocksFy, fill }: { fy: number; stocks: StocksQ; stocksFy: StocksQ; fill: number }) {
  const p = useTheme();
  const hidden = useHidden();
  const a = stocks.analysis;
  const bars = useInvestBars('stocks', stocksFy.analysis);
  if (!a || !a.allPositions.length) return <Card><EmptyState icon={<LineChart size={34} color={p.muted} />} title="No shares yet" body="Upload a broker confirmation with the + button." action="Upload a confirmation" onAction={() => router.push('/upload')} /></Card>;
  const open = a.positions.filter((x) => x.isOpen).sort((x, y) => (y.value ?? 0) - (x.value ?? 0));
  const t = a.totals;
  return (
    <>
      <View style={{ height: fill }}>
      <NetWorthCard label="PSX shares" value={t.value} onPress={() => router.push({ pathname: '/holdings', params: { side: 'stocks' } })}
        aside={<GainChange pct={t.unrealizedPct ?? share(t.unrealized, t.invested)} hidden={hidden} />} holders={[
        { label: 'Invested', value: t.invested, onPress: () => router.push({ pathname: '/holdings', params: { side: 'stocks' } }) },
        { label: 'Unrealized', value: t.unrealized, signed: true },
        { label: 'Realized', value: stocksFy.analysis?.totals.realized ?? 0 },
      ]} />
      <InvestChart side="stocks" bars={bars} items={open.filter((x) => (x.value ?? 0) > 0).map((x) => ({
        key: x.symbol, label: x.symbol, value: x.value ?? 0, logo: (n: number) => <StockLogo symbol={x.symbol} size={n} />,
      }))} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  chartWrap: { flex: 1, marginTop: space.md },
  holding: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md },
  holdingHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  holdingFigs: { flexDirection: 'row', marginTop: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, gap: space.sm },
  fig: { flex: 1, gap: 1 },
  figNum: { fontFamily: font.num, fontSize: 14.5, lineHeight: 19 },
  tipValue: { fontFamily: font.numHeavy, fontSize: 18, lineHeight: 23, letterSpacing: -0.3 },
  tipRule: { height: StyleSheet.hairlineWidth, marginVertical: 3 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipNum: { fontFamily: font.num, fontSize: 12.5 },
  rowCard: { paddingHorizontal: space.lg, borderRadius: 20 },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64 },
  linkIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  moverCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
});
