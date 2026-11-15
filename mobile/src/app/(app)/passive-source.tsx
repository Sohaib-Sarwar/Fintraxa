import { BlurTargetView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type PassiveMonth, type PassiveSource } from '@/data/engines';
import { useFundsAnalysis, usePassive } from '@/data/portfolio';
import { passivePayers } from '@/features/passive/payers';
import { PassiveTip, SourceIcon, TAX_LABEL, VIEW_LABEL } from '@/features/passive/passiveUi';
import { RangeButton } from '@/features/range/RangeButton';
import { RangeSheet } from '@/features/range/RangeSheet';
import { CHART_MONTHS, usePeriod } from '@/features/range/usePeriod';
import { type DonutItem } from '@/features/today/AllocationDonut';
import { ChartCard } from '@/features/today/ChartCard';
import { NetWorthCard } from '@/features/today/NetWorthCard';
import { monthLabel, monthName } from '@/lib/dates';
import { compactNumber } from '@/lib/format';
import { ErrorState, Skeleton } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { AmcLogo, BankLogo, StockLogo } from '@/ui/Logos';
import { Gap } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { useTheme } from '@/ui/theme';
import { space } from '@/ui/tokens';

type Bar = PassiveMonth & { key: string; value: number };
const SOURCES: PassiveSource[] = ['mutual_funds', 'dividends', 'savings', 'other'];
const HEADER_H = 44 + space.sm + space.md;

/**
 * One passive source — Mutual funds, Dividends or Savings accounts (owner, 2026-11-14: opened from the Passive
 * income card; the web's source picker). Same theme as the tabs: the card (total after tax, per month, last
 * month, CGT / tax withheld), the bar chart of that source by month with the web tooltip on hold, and the web's
 * donut: by fund, by stock or by account. Card + chart fill the screen.
 */
export default function PassiveSourcePage() {
  const p = useTheme();
  const hidden = useHidden();
  const { source: param } = useLocalSearchParams<{ source?: string }>();
  const source: PassiveSource = SOURCES.includes(param as PassiveSource) ? (param as PassiveSource) : 'dividends';
  const period = usePeriod();
  const { analysis: a, events, isLoading, refetch } = usePassive(period.upTo, source);
  const funds = useFundsAnalysis(period.upTo);
  const [selected, setSelected] = useState<string | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [viewport, setViewport] = useState(0);
  const target = useRef<ComponentRef<typeof View>>(null);
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fill = Math.max(460, (viewport || winH) - insets.top - HEADER_H - insets.bottom - space.xl);

  const bars = useMemo<Bar[]>(() => (a?.months ?? []).slice(-CHART_MONTHS).map((m) => ({ ...m, key: m.month, value: m.net })), [a]);
  const sel = selected && bars.some((b) => b.key === selected) ? selected : bars[bars.length - 1]?.key;

  // Who paid in each month — funds, stocks or banks — biggest first (the bar's hold card).
  const payers = useMemo(() => passivePayers(source, events, funds.analysis?.allPositions), [source, events, funds.analysis]);

  // The web's donut for one source: by fund, by stock, or by account.
  const pie = useMemo<DonutItem[]>(() => {
    if (source === 'mutual_funds') {
      return (funds.analysis?.allPositions ?? []).filter((x) => x.realized.net > 0).map((x) => ({
        key: x.key, label: x.fundName ?? 'Fund', value: x.realized.net, logo: (n: number) => <AmcLogo code={x.amcCode} name={x.amcName} size={n} />,
      }));
    }
    const inRange = (events ?? []).filter((e) => e.date >= period.upTo.start && e.date <= period.upTo.end);
    const map = new Map<string, DonutItem>();
    for (const e of inRange) {
      const k = source === 'dividends' ? e.symbol ?? e.title : e.title;
      const cur = map.get(k) ?? { key: k, label: k, value: 0, logo: source === 'dividends' && e.symbol ? (n: number) => <StockLogo symbol={e.symbol!} size={n} />
        : source === 'savings' && e.symbol ? (n: number) => <BankLogo symbol={e.symbol} size={n} /> : (n: number) => <SourceIcon source={source} size={n} /> };
      cur.value += Number(e.net) || 0;
      map.set(k, cur);
    }
    return [...map.values()].filter((x) => x.value > 0);
  }, [source, funds.analysis, events, period.upTo.start, period.upTo.end]);

  const title = VIEW_LABEL[source];
  const right = <RangeButton label={period.label} onPress={() => setRangeOpen(true)} />;
  const body = isLoading ? (
    <><Skeleton height={230} radius={22} /><Gap h={space.lg} /><Skeleton height={300} radius={24} /></>
  ) : !a ? <ErrorState onRetry={refetch} /> : (
    <View style={{ height: fill }}>
      <NetWorthCard label={title} value={a.totals.net} onPress={() => router.push({ pathname: '/passive-entries', params: { source } })} holders={[
        { label: 'Per month', value: a.runRate3?.perMonth ?? a.avgPerMonth },
        { label: a.mom ? monthName(a.mom.month) : 'Last month', value: a.mom?.net ?? 0 },
        { label: TAX_LABEL[source], value: a.totals.tax },
      ]} />
      <View style={styles.chartWrap}>
        <ChartCard<Bar> barTitle={sel ? monthLabel(sel, true) : 'By month'} bars={bars} selected={sel} onSelect={setSelected} hidden={hidden}
          format={(v) => (hidden ? '••••' : `Rs ${compactNumber(v)}`)} renderTip={(b) => <PassiveTip m={b} pick={source} payers={payers[b.key]} />}
          pieTitle={source === 'mutual_funds' ? 'By fund' : source === 'dividends' ? 'By stock' : 'By account'} pieCenter={title} pieItems={pie} />
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: p.bg }]}>
      <BlurTargetView ref={target} style={[styles.root, { backgroundColor: p.bg }]}>
        <Screen back title={title} right={right} bottomSpace={space.xl} onViewport={setViewport} onRefresh={refetch}>{body}</Screen>
      </BlurTargetView>
      {rangeOpen ? <RangeSheet blurTarget={target} range={period.range} onChoose={period.set} onClose={() => setRangeOpen(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  chartWrap: { flex: 1, marginTop: space.md },
});
