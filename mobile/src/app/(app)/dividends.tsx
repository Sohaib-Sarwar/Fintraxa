import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDividendSummary } from '@/data/portfolio';
import { fyLabel, fyOf, fyRange, shortDate, todayIso } from '@/lib/dates';
import { units } from '@/lib/format';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { HeroFigure, Money, StatRow } from '@/ui/Figures';
import { StockLogo } from '@/ui/Logos';
import { Card, Divider, Gap, SectionHeader } from '@/ui/primitives';
import { ListRow } from '@/ui/ListRow';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { space } from '@/ui/tokens';

export default function Dividends() {
  const fy = fyOf(todayIso());
  const range = useMemo(() => fyRange(fy), [fy]);
  const { all, summary, isLoading } = useDividendSummary(range);
  if (isLoading && !summary) return <Screen back title="Dividends"><Skeleton height={46} width="60%" /><Gap h={space.xl} /><Skeleton height={200} radius={20} /></Screen>;
  if (!all.length) return <Screen back title="Dividends"><EmptyState title="No dividends yet" body="Upload your CDC dividend report on the web app, or add one by hand there." /></Screen>;
  return (
    <Screen back title="Dividends">
      <HeroFigure label={`Received in ${fyLabel(fy)} (after tax)`} value={summary?.net ?? 0} />
      <StatRow stats={[
        { label: 'Tax withheld', value: summary?.tax ?? 0 },
        { label: 'Zakat', value: summary?.zakat ?? 0 },
        { label: 'Payments', value: null, text: String(summary?.count ?? 0) },
      ]} />
      <SectionHeader title="All payments" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {all.map((d, i) => (
          <View key={d.id}>
            {i > 0 ? <Divider inset={52} /> : null}
            <ListRow leading={<StockLogo symbol={d.symbol} />} title={d.symbol}
              subtitle={`${shortDate(d.payment_date)} · ${units(d.shares)} shares`}
              trailing={<Money value={Number(d.net_amount)} decimals={2} />}
              trailingSub={<Text variant="caption" tone="muted">gross <Money value={Number(d.gross_amount)} variant="caption" tone="muted" decimals={2} /></Text>} />
          </View>
        ))}
      </Card>
      <View style={styles.pad} />
    </Screen>
  );
}

const styles = StyleSheet.create({ pad: { height: space.lg } });
