import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { taxYearLabel, taxYearOf } from '@/data/engines';
import { useNccpl, useStocksAnalysis } from '@/data/portfolio';
import { monthLabel, todayIso } from '@/lib/dates';
import { addMoney } from '@/lib/format';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { HeroFigure, Money, StatRow } from '@/ui/Figures';
import { Card, Chip, Divider, Gap, SectionHeader } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { space } from '@/ui/tokens';

/**
 * Invest › Tax (plan §5): capital gains tax on shares exactly as NCCPL computes it (src/lib/psx/nccpl.js:
 * FIFO by settlement, Rule 13N deemed costs, monthly running CGT, 3-year loss carry-forward), beside what
 * you actually kept after real fees. Verified against a real NCCPL certificate on the web.
 */
export default function Tax() {
  const { report, isLoading, currentTaxYear } = useNccpl();
  const years = useMemo(() => [...(report?.years ?? [])].map((y) => y.taxYear).sort((a, b) => b - a), [report]);
  const [ty, setTy] = useState<number>(currentTaxYear);
  const year = report?.year(ty);
  const range = useMemo(() => ({ start: `${ty - 1}-07-01`, end: `${ty}-06-30` }), [ty]);
  const stocks = useStocksAnalysis(range);
  const actualNet = stocks.analysis?.totals.realized ?? 0;
  const keep = addMoney(actualNet, -(year?.cgt ?? 0));
  const isCurrent = ty === taxYearOf(todayIso());

  if (isLoading && !report) return <Screen back title="Tax"><Skeleton height={46} width="60%" /><Gap h={space.xl} /><Skeleton height={200} radius={20} /></Screen>;
  if (!report || !report.years.length) {
    return <Screen back title="Tax"><EmptyState title="No share sales yet" body="Capital gains tax applies when you sell shares. Your NCCPL figures will appear here." /></Screen>;
  }

  return (
    <Screen back title={`Tax ${taxYearLabel(ty)}`}>
      {years.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingBottom: space.md }}>
          {years.map((y) => <Chip key={y} label={taxYearLabel(y)} selected={y === ty} onPress={() => setTy(y)} />)}
        </ScrollView>
      ) : null}
      <HeroFigure label="Capital gains tax (NCCPL)" value={year?.cgt ?? 0}
        caption={isCurrent ? `Tax year ends 30 June ${ty}. Running total so far.` : `1 Jul ${ty - 1} – 30 Jun ${ty}`} />
      <StatRow stats={[
        { label: 'NCCPL net gain', value: year?.net ?? 0, tone: 'auto', sign: true, sub: 'After 0.5% + 0.5% deemed costs' },
        { label: 'Your net, after fees', value: actualNet, tone: 'auto', sign: true, sub: 'Real broker charges' },
        { label: 'You keep', value: keep, tone: 'auto', sign: true, sub: 'Net after fees − CGT' },
      ]} />

      {year?.months.length ? (
        <>
          <SectionHeader title="Month by month" />
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {year.months.map((m, i) => (
              <View key={m.month}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{monthLabel(m.month)}</Text>
                    <Text variant="caption" tone="ink2">Net gain <Money value={m.net} variant="caption" tone="auto" sign /></Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Money value={m.cgtThisMonth} tone={m.cgtThisMonth < 0 ? 'auto' : 'ink'} />
                    <Text variant="caption" tone="muted">{m.cgtThisMonth < 0 ? 'refund' : 'charged'}</Text>
                  </View>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {year && (year.carriedUsed > 0 || year.carryForward.length > 0 || year.lossCarriedOut > 0) ? (
        <>
          <SectionHeader title="Losses carried forward" />
          <Card>
            {year.carriedUsed > 0 ? <Line label="Earlier losses used this year" value={year.carriedUsed} /> : null}
            {year.lossCarriedOut > 0 ? <Line label="Loss this year (carried forward)" value={year.lossCarriedOut} /> : null}
            {year.carryForward.map((c) => <Line key={c.fromYear} label={`From ${taxYearLabel(c.fromYear)} · usable until ${taxYearLabel(c.expires)}`} value={c.amount} />)}
          </Card>
        </>
      ) : null}

      <Gap h={space.xl} />
      <Text variant="caption" tone="muted">The NCCPL-style statement PDF is on the web app (Stocks › Analytics › report). Mutual-fund CGT is deducted by the fund manager and shows on each fund.</Text>
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.line}>
      <Text variant="body" tone="ink2" style={{ flex: 1 }}>{label}</Text>
      <Money value={value} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 60, gap: space.md },
  line: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: space.md },
});
