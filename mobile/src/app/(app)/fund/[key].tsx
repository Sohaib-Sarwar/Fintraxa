import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { HoldingChart } from '@/features/invest/HoldingChart';
import { useFundsAnalysis } from '@/data/portfolio';
import { ALL_TIME_START, shortDate, todayIso } from '@/lib/dates';
import { money, pct, share, units } from '@/lib/format';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { Delta, HeroFigure, Money, StatRow, useHidden } from '@/ui/Figures';
import { AmcLogo } from '@/ui/Logos';
import { Card, Divider, Gap, SectionHeader } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { space } from '@/ui/tokens';

const ENTRY: Record<string, string> = {
  purchase: 'Bought', redemption: 'Redeemed', switch_in: 'Switched in', switch_out: 'Switched out',
  cgt_refund_reinvest: 'CGT refund reinvested', capital_refund_units: 'Capital refund (units)', dividend_reinvest: 'Dividend reinvested',
};

export default function FundDetail() {
  const hidden = useHidden();
  const { key } = useLocalSearchParams<{ key: string }>();
  const range = useMemo(() => ({ start: ALL_TIME_START, end: todayIso() }), []);
  const { analysis, day, isLoading } = useFundsAnalysis(range);
  const x = analysis?.allPositions.find((pos) => pos.key === key);

  if (isLoading && !analysis) return <Screen back><Skeleton height={46} width="70%" /><Gap h={space.xl} /><Skeleton height={160} radius={20} /></Screen>;
  if (!x) return <Screen back><EmptyState title="Fund not found" body="It may have been removed from your ledger." /></Screen>;

  const d = day?.per.get(x.key);
  const entries = [...x.entries].filter((e) => !e.reverses_entry_id).sort((a, b) => String(b.trade_date).localeCompare(String(a.trade_date)));
  const info: [string, React.ReactNode][] = [
    ['Price', x.price ? `${money(x.price.value, { decimals: 4 })} · ${shortDate(x.price.date)}${x.price.stale ? ' (old)' : ''}` : 'No price yet'],
    ['Invested', <Money key="i" value={x.invested} />],
    ['Realized, all time', <Money key="r" value={x.allTime.net} tone="auto" sign />],
    ['CGT paid, all time', <Money key="c" value={x.allTime.cgt} />],
    ['Est. CGT if sold now', <Money key="e" value={x.unrealized.tax} />],
  ];
  return (
    <Screen back>
      <View style={styles.title}>
        <AmcLogo code={x.amcCode} name={x.amcName} size={44} />
        <View style={{ flex: 1 }}>
          <Text variant="headline" numberOfLines={2}>{x.fundName ?? 'Fund'}</Text>
          <Text variant="caption" tone="ink2">{x.amcName ?? ''}</Text>
        </View>
      </View>
      <HeroFigure label="Current value" value={x.value} caption={x.price ? `NAV ${shortDate(x.price.date)}` : null}>
        {d ? <Delta amount={d.change} percent={d.pct} suffix={`since ${shortDate(d.prevDate)}`} /> : null}
      </HeroFigure>
      <StatRow stats={[
        { label: 'Unrealized', value: x.unrealized.gross, tone: 'auto', sign: true, sub: pct(share(x.unrealized.gross, x.invested)) },
        { label: 'Avg cost / unit', value: x.avgCost, sub: 'FIFO' },
        { label: 'Units', value: null, text: units(x.units) },
      ]} />
      <HoldingChart type="mf" assetKey={x.key} live={{ value: x.value, cost: x.invested }} />

      <SectionHeader title="Details" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {info.map(([k, v], i) => (
          <View key={k}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.row}>
              <Text variant="body" tone="ink2">{k}</Text>
              {typeof v === 'string' ? <Text variant="num">{v}</Text> : v}
            </View>
          </View>
        ))}
      </Card>

      <SectionHeader title="Activity" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {entries.slice(0, 40).map((e, i) => {
          const u = Number(e.unit_delta ?? 0);
          const amt = (e.gross_amount ?? e.net_amount) as string | null;
          return (
            <View key={String(e.id)}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{ENTRY[String(e.entry_type)] ?? String(e.entry_type).replace(/_/g, ' ')}</Text>
                  <Text variant="caption" tone="ink2">{shortDate(String(e.trade_date))} · {u > 0 ? '+' : ''}{units(u)} units</Text>
                </View>
                {amt ? <Text variant="num">{money(amt, { hidden })}</Text> : null}
              </View>
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, gap: space.md },
});
