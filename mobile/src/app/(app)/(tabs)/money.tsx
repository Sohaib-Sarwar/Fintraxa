import Decimal from 'decimal.js';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Wallet } from '@/ui/icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { TransactionRow } from '@/features/money/TransactionRow';
import { useTransactions } from '@/data/queries';
import { byDay, dayNet, monthFigures } from '@/data/selectors';
import type { Txn } from '@/data/types';
import { addMonths, dayHeading, monthLabel, monthOf, monthRange, todayIso } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { pct } from '@/lib/format';
import { ShareBar } from '@/ui/charts';
import { EmptyState, ErrorState, OfflinePill, Skeleton } from '@/ui/feedback';
import { HeroFigure, Money, StatRow } from '@/ui/Figures';
import { ListRow } from '@/ui/ListRow';
import { CategoryIcon } from '@/ui/Logos';
import { Card, Divider, Gap, IconButton, Pill, SectionHeader } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { space } from '@/ui/tokens';

const DAYS_SHOWN = 10;

export default function MoneyTab() {
  const p = useTheme();
  const txns = useTransactions();
  const today = todayIso();
  const thisMonth = monthOf(today);
  const [month, setMonth] = useState(thisMonth);
  const [category, setCategory] = useState<string | null>(null);

  const all = txns.data ?? [];
  const range = monthRange(month);
  const figs = useMemo(() => monthFigures(all, range, monthRange(addMonths(month, -1)), today), [all, month]); // eslint-disable-line react-hooks/exhaustive-deps -- range derives from month
  const rows = useMemo(() => all.filter((t) => t.date >= range.start && t.date <= range.end), [all, month]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => byDay(rows), [rows]);
  const firstMonth = all.length ? monthOf(all[all.length - 1].date) : thisMonth;

  const step = (n: number) => { haptic.tick(); setMonth((m) => addMonths(m, n)); };
  const isCurrent = month === thisMonth;
  const label = monthLabel(month, true).split(' ')[0];

  const header = (
    <View style={styles.monthBar}>
      <IconButton icon={ChevronLeft} label="Previous month" onPress={() => step(-1)} />
      <Text variant="bodyStrong" accessibilityLiveRegion="polite">{isCurrent ? 'This month' : monthLabel(month, true)}</Text>
      <View style={{ opacity: isCurrent ? 0.3 : 1 }} pointerEvents={isCurrent ? 'none' : 'auto'}>
        <IconButton icon={ChevronRight} label="Next month" onPress={() => step(1)} />
      </View>
    </View>
  );

  if (txns.isLoading && !txns.data) {
    return <Screen title="Money" tabBar><Skeleton height={46} width="60%" /><Gap h={space.xl} /><Skeleton height={86} radius={20} /><Gap h={space.xl} /><Skeleton height={240} radius={20} /></Screen>;
  }
  if (txns.error && !txns.data) return <Screen title="Money" tabBar><ErrorState onRetry={() => txns.refetch()} /></Screen>;

  const vsTone = figs.vsLast === null ? 'flat' : figs.vsLast > 0.05 ? 'neg' : figs.vsLast < -0.05 ? 'pos' : 'flat';
  const catRows = category ? rows.filter((t) => (t.categories?.name ?? 'Uncategorized') === category && t.type === 'debit') : [];
  const catFig = figs.categories.find((c) => c.name === category);
  const sixMonthAvg = category ? avgSpend(all, category, month, today) : null;

  return (
    <Screen title="Money" tabBar onRefresh={() => txns.refetch()}>
      <OfflinePill />
      {header}
      <HeroFigure label={`Spent in ${label}`} value={figs.spent} caption={isCurrent ? 'So far this month' : null}>
        {figs.vsLast !== null ? <Pill tone={vsTone} text={`${pct(figs.vsLast, { decimals: 1 })} vs same days last month`} /> : null}
      </HeroFigure>
      <StatRow stats={[
        { label: 'Earned', value: figs.earned },
        { label: 'Saved', value: figs.saved, tone: 'auto', sub: figs.earned > 0 ? `${Math.round((figs.saved / figs.earned) * 100)}% of income` : null },
        { label: 'Moved to savings', value: figs.transfers, sub: 'Not spending' },
      ]} />

      {figs.categories.length ? (
        <>
          <SectionHeader title="Where it went" />
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {figs.categories.slice(0, 6).map((c, i) => (
              <View key={c.name}>
                {i > 0 ? <Divider inset={52} /> : null}
                <ListRow
                  leading={<CategoryIcon icon={c.icon} />}
                  title={c.name}
                  subtitle={`${c.count} payment${c.count === 1 ? '' : 's'} · ${c.share}%`}
                  trailing={<Money value={c.amount} />}
                  trailingSub={<View style={{ width: 72 }}><ShareBar share={c.share} /></View>}
                  onPress={() => setCategory(c.name)}
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title="Transactions" action={all.length ? 'Search all' : undefined} onAction={() => router.push('/transactions')} />
      {days.length ? (
        <Card padded={false} style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
          {days.slice(0, DAYS_SHOWN).map((d) => (
            <View key={d.date}>
              <View style={styles.dayHead}>
                <Text variant="label" tone="ink2">{dayHeading(d.date, today)}</Text>
                <Money value={dayNet(d.rows)} variant="caption" tone="muted" sign />
              </View>
              {d.rows.map((t) => <TransactionRow key={t.id} t={t} />)}
            </View>
          ))}
          {days.length > DAYS_SHOWN ? (
            <Pressable onPress={() => router.push('/transactions')} style={styles.more} accessibilityRole="button">
              <Text variant="label" tone="accent">Show all {rows.length} in {label}</Text>
            </Pressable>
          ) : null}
        </Card>
      ) : (
        <Card>
          <EmptyState icon={<Wallet size={32} color={p.muted} />} title={`Nothing in ${label}`}
            body={month < firstMonth ? 'You hadn’t started tracking yet.' : 'Tap + to log an expense or income.'} />
        </Card>
      )}

      <Sheet open={!!category} onClose={() => setCategory(null)} title={category ?? ''}>
        {catFig ? (
          <>
            <HeroFigure label={`Spent in ${label}`} value={catFig.amount} caption={`${catFig.share}% of this month’s spending`} />
            {sixMonthAvg !== null ? (
              <View style={styles.sheetRow}>
                <Text variant="body" tone="ink2">6-month monthly average</Text>
                <Money value={sixMonthAvg} />
              </View>
            ) : null}
            <Gap h={space.md} />
            {catRows.map((t) => <TransactionRow key={t.id} t={t} showDate />)}
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

/** Average monthly spend in a category over the 6 full months before `month` (months with no data count as 0 once tracking began). */
function avgSpend(all: Txn[], category: string, month: string, today: string): number | null {
  const first = all.length ? monthOf(all[all.length - 1].date) : null;
  if (!first) return null;
  let total = new Decimal(0); let n = 0;
  for (let i = 1; i <= 6; i += 1) {
    const m = addMonths(month, -i);
    if (m < first) break;
    const r = monthRange(m);
    for (const t of all) {
      if (t.type === 'debit' && t.date >= r.start && t.date <= r.end && t.date <= today && (t.categories?.name ?? 'Uncategorized') === category) total = total.plus(String(t.amount));
    }
    n += 1;
  }
  return n ? Number(total.dividedBy(n).toFixed(2)) : null;
}

const styles = StyleSheet.create({
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: -12, marginBottom: space.xs },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.lg, paddingBottom: 2 },
  more: { alignItems: 'center', paddingVertical: space.md, minHeight: 48, justifyContent: 'center' },
  sheetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
});
