import Decimal from 'decimal.js';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MonthCardPager, type MonthFigures } from '@/features/money/MonthCardPager';
import { RangeButton } from '@/features/range/RangeButton';
import { usePeriod } from '@/features/range/usePeriod';
import { useCardInk } from '@/features/today/NetWorthCard';
import { ChartCard } from '@/features/today/ChartCard';
import { summarize, type Summary } from '@/data/engines';
import { useTransactions } from '@/data/queries';
import { addMonths, monthLabel, monthName, monthOf, monthRange, todayIso } from '@/lib/dates';
import { compactNumber } from '@/lib/format';
import { ErrorState, OfflinePill, Skeleton } from '@/ui/feedback';
import type { Bar } from '@/ui/charts';
import { Money, useHidden } from '@/ui/Figures';
import { ArrowDownRight, ArrowUpRight, Banknote, ShoppingBag } from '@/ui/icons';
import { CategoryIcon } from '@/ui/Logos';
import { Gap } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { alpha, dark, font, space } from '@/ui/tokens';

type Side = 'spend' | 'income';
/** Screen header row (title 44 + padding) and the space kept above the nav, as on Home. */
const HEADER_H = 44 + space.sm + space.md;
const BOTTOM_SPACE = 80 + 14;

/**
 * Spending change inside the card, right of the total — set formally (owner): a slim arrow icon, the percentage
 * in the card's ink, "vs Oct" under it. Only the arrow carries a quiet tint (down = green, up = red).
 */
function ChangePill({ vs, prev, sameDays }: { vs: number; prev: string; sameDays: boolean }) {
  const c = useCardInk();
  const flat = Math.abs(vs) < 0.05;
  const Arrow = vs < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <View style={styles.change} accessible
      accessibilityLabel={`Spending ${flat ? 'unchanged' : vs < 0 ? 'down' : 'up'} ${Math.abs(vs)} percent vs ${sameDays ? 'the same days of ' : ''}${prev}`}>
      <View style={styles.changeRow}>
        {flat ? null : <Arrow size={14} color={alpha(vs < 0 ? dark.pos : dark.neg, 0.9)} strokeWidth={2.4} />}
        <Text style={[styles.changeText, { color: c.ink }, !c.shadow && { textShadowRadius: 0 }]}>{flat ? '0.0%' : `${Math.abs(vs).toFixed(1)}%`}</Text>
      </View>
      <Text style={[styles.changeSub, { color: c.ink2 }]}>vs {prev}</Text>
    </View>
  );
}

const MAX_MONTHS = 36;
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Wallet (owner, 2026-11-14): just the month card and the chart card, filling the screen above the nav.
 * Swipe the card left/right for other months (each month its own design, blurred transitions). Spent is the
 * big figure, with the change vs last month beside it; Earned, Saved and Passive the small ones. Tap Spent or
 * Earned → that month's expenses / income in Transactions; Passive → the Passive income page. The chart's glass
 * switch (icons) picks Expenses or Income; hold a bar for that month's categories; tap one to move the card.
 */
export default function WalletTab() {
  const hidden = useHidden();
  const txns = useTransactions();
  const period = usePeriod();
  const today = todayIso();
  const thisMonth = monthOf(today);
  const [month, setMonth] = useState(thisMonth);
  const [side, setSide] = useState<Side>('spend');
  const [viewport, setViewport] = useState(0);
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const all = useMemo(() => txns.data ?? [], [txns.data]);

  // Cards: from the first month with a transaction (at most three years back) to this month.
  const months = useMemo(() => {
    const first = all.reduce((m, t) => (t.date && t.date.slice(0, 7) < m ? t.date.slice(0, 7) : m), thisMonth);
    const out: string[] = [];
    for (let m = thisMonth; m >= first && out.length < MAX_MONTHS; m = addMonths(m, -1)) out.push(m);
    return out.reverse();
  }, [all, thisMonth]);

  // One summary per month the cards or the bars need.
  const sums = useMemo(() => {
    const map = new Map<string, Summary>();
    for (const m of new Set([...months, ...period.months])) map.set(m, summarize(all, monthRange(m), today));
    return map;
  }, [all, months, period.months, today]);
  const sum = useCallback((m: string) => sums.get(m) ?? summarize(all, monthRange(m), today), [sums, all, today]);

  // Spending vs the previous month: same days for the current month, whole months otherwise.
  const vsFor = useCallback((m: string) => {
    const pm = addMonths(m, -1);
    const cur = sum(m).expenses;
    let before: number;
    if (m === thisMonth) {
      const r = monthRange(pm);
      const day = Math.min(Number(today.slice(8, 10)), Number(r.end.slice(8, 10)));
      before = summarize(all, { start: r.start, end: `${pm}-${String(day).padStart(2, '0')}` }, today).expenses;
    } else before = sum(pm).expenses;
    return before > 0 ? Number(new Decimal(cur).minus(before).dividedBy(before).times(100).toFixed(1)) : null;
  }, [sum, thisMonth, today, all]);

  const openTxns = useCallback((type: 'debit' | 'credit', m: string) => {
    const r = monthRange(m);
    router.push({ pathname: '/transactions', params: { type, start: r.start, end: r.end } });
  }, []);

  const figures = useCallback((m: string): MonthFigures => {
    const s = sum(m);
    const name = MONTH_LONG[Number(m.slice(5, 7)) - 1];
    const vs = vsFor(m);
    return {
      label: `Spent in ${name}${m.slice(0, 4) !== thisMonth.slice(0, 4) ? ` ${m.slice(0, 4)}` : ''}`,
      spent: s.expenses,
      onPress: () => openTxns('debit', m),
      aside: vs === null ? null : <ChangePill vs={vs} prev={MONTH_LONG[Number(addMonths(m, -1).slice(5, 7)) - 1].slice(0, 3)} sameDays={m === thisMonth} />,
      holders: [
        { label: 'Earned', value: s.active, onPress: () => openTxns('credit', m) },
        { label: 'Saved', value: s.saved },
        { label: 'Passive', value: s.passive, onPress: () => router.navigate('/passive') },
      ],
    };
  }, [sum, thisMonth, vsFor, openTxns]);

  const bars = useMemo<Bar[]>(() => period.months.map((m) => {
    const s = sum(m);
    return { key: m, label: monthLabel(m).slice(0, 3), value: side === 'spend' ? s.expenses : s.active };
  }), [period.months, sum, side]);

  const right = <RangeButton />;
  if (txns.isLoading && !txns.data) {
    return <Screen title="Wallet" tabBar right={right}><Skeleton height={230} radius={22} /><Gap h={space.lg} /><Skeleton height={300} radius={24} /></Screen>;
  }
  if (txns.error && !txns.data) return <Screen title="Wallet" tabBar right={right}><ErrorState onRetry={() => txns.refetch()} /></Screen>;

  const fill = Math.max(460, (viewport || winH) - insets.top - HEADER_H - insets.bottom - BOTTOM_SPACE);

  return (
    <Screen title="Wallet" tabBar right={right} bottomSpace={BOTTOM_SPACE} onViewport={setViewport} onRefresh={() => txns.refetch()}>
      <OfflinePill />
      <View style={{ height: fill }}>
        <MonthCardPager months={months} month={month} onChange={setMonth} figures={figures} />
        <View style={styles.chartWrap}>
          <ChartCard<Bar, Side> barTitle={side === 'spend' ? 'Expenses' : 'Income'} bars={bars} selected={month}
            onSelect={setMonth} hidden={hidden} format={(v) => (hidden ? '••••' : `Rs ${compactNumber(v)}`)}
            renderTip={(b) => <CategoryTip month={b.key} total={b.value} side={side} summary={sum(b.key)} />}
            switcher={{ value: side, onChange: setSide, options: [{ value: 'spend', label: 'Expenses', icon: ShoppingBag }, { value: 'income', label: 'Income', icon: Banknote }] }} />
        </View>
      </View>
    </Screen>
  );
}

/** A held bar: the month, its total, then the biggest categories with small icons. */
function CategoryTip({ month, total, side, summary }: { month: string; total: number; side: Side; summary: Summary }) {
  const p = useTheme();
  const list = (side === 'spend' ? summary.categories.expenses : summary.categories.active).filter((c) => Number(c.amount) > 0).slice(0, 5);
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.tipHead}>
        <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{monthName(month)}</Text>
        <Money value={total} variant="label" />
      </View>
      <View style={[styles.tipRule, { backgroundColor: p.border }]} />
      {list.length ? list.map((c) => (
        <View key={c.name} style={styles.tipRow}>
          <CategoryIcon icon={c.icon} size={18} tone="neutral" />
          <Text variant="caption" tone="ink2" numberOfLines={1} style={{ flex: 1 }}>{c.name}</Text>
          <Money value={Number(c.amount)} variant="caption" />
        </View>
      )) : <Text variant="caption" tone="muted">Nothing recorded</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  chartWrap: { flex: 1, marginTop: space.md },
  change: { alignItems: 'flex-end' },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  changeText: { color: '#F5F5F3', fontFamily: font.numMedium, fontSize: 14, lineHeight: 18, letterSpacing: -0.2,
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  changeSub: { color: 'rgba(245,245,243,0.6)', fontFamily: font.medium, fontSize: 10.5, lineHeight: 13 },
  tipHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  tipRule: { height: StyleSheet.hairlineWidth },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
