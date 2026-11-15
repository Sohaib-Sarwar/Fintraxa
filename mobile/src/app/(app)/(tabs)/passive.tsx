import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type PassiveMonth, type PassiveSource } from '@/data/engines';
import { usePassive } from '@/data/portfolio';
import { SourceIcon, SHORT_LABEL, VIEW_LABEL, PassiveTip } from '@/features/passive/passiveUi';
import { RangeButton } from '@/features/range/RangeButton';
import { usePeriod } from '@/features/range/usePeriod';
import { ChartCard } from '@/features/today/ChartCard';
import { NetWorthCard } from '@/features/today/NetWorthCard';
import { monthLabel } from '@/lib/dates';
import { compactNumber } from '@/lib/format';
import { ErrorState, OfflinePill, Skeleton } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { Gap } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/tokens';

type Bar = PassiveMonth & { key: string; value: number };
const HEADER_H = 44 + space.sm + space.md;
const BOTTOM_SPACE = 80 + 14;
const ORDER: PassiveSource[] = ['mutual_funds', 'savings', 'dividends', 'other'];

/**
 * Passive income (owner, 2026-11-14): only the card and the chart, filling the screen like Home. The card shows
 * the period's after-tax total and, compactly, Funds · Savings · Dividends — each opens its own page.
 * Bars = the web's months; holding one shows the web tooltip (total after tax, each source, tax withheld).
 */
export default function PassiveTab() {
  const hidden = useHidden();
  const period = usePeriod();
  const { analysis: a, isLoading, refetch } = usePassive(period.upTo);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewport, setViewport] = useState(0);
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fill = Math.max(480, (viewport || winH) - insets.top - HEADER_H - insets.bottom - BOTTOM_SPACE);

  const bars = useMemo<Bar[]>(() => (a?.months ?? []).slice(-12).map((m) => ({ ...m, key: m.month, value: m.net })), [a]);
  const sel = selected && bars.some((b) => b.key === selected) ? selected : bars[bars.length - 1]?.key;
  const open = (source: PassiveSource) => router.push({ pathname: '/passive-source', params: { source } });

  if (isLoading) return <Screen title="Passive income" tabBar right={<RangeButton />}><Skeleton height={230} radius={22} /><Gap h={space.lg} /><Skeleton height={300} radius={24} /></Screen>;
  if (!a) return <Screen title="Passive income" tabBar right={<RangeButton />}><ErrorState onRetry={refetch} /></Screen>;

  const holders = ORDER.filter((s) => s !== 'other' || a.bySource.other.count > 0).slice(0, 3)
    .map((s) => ({ label: SHORT_LABEL[s], value: a.bySource[s].net, onPress: () => open(s) }));
  const pie = ORDER.filter((s) => a.bySource[s].net > 0)
    .map((s) => ({ key: s, label: VIEW_LABEL[s], value: a.bySource[s].net, logo: (n: number) => <SourceIcon source={s} size={n} /> }));

  return (
    <Screen title="Passive income" tabBar onRefresh={refetch} right={<RangeButton />} bottomSpace={BOTTOM_SPACE} onViewport={setViewport}>
      <OfflinePill />
      <View style={{ height: fill }}>
        <NetWorthCard label="Passive income" value={a.totals.net} holders={holders} />
        <View style={styles.chartWrap}>
          <ChartCard<Bar> barTitle={sel ? monthLabel(sel, true) : 'By month'} bars={bars} selected={sel} onSelect={setSelected} hidden={hidden}
            format={(v) => (hidden ? '••••' : `Rs ${compactNumber(v)}`)} renderTip={(b) => <PassiveTip m={b} pick="all" />}
            pieTitle="By source" pieCenter="Passive income" pieItems={pie} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chartWrap: { flex: 1, marginTop: space.md },
});
