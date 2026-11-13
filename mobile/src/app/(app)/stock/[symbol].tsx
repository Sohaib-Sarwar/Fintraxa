import Decimal from 'decimal.js';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { HoldingChart } from '@/features/invest/HoldingChart';
import { getStockSector } from '@/data/engines';
import { useDividendSummary, useStocksAnalysis } from '@/data/portfolio';
import { ALL_TIME_START, shortDate, todayIso } from '@/lib/dates';
import { money, pct, units } from '@/lib/format';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { Delta, HeroFigure, Money, StatRow, useHidden } from '@/ui/Figures';
import { StockLogo } from '@/ui/Logos';
import { Card, Divider, Gap, Pill, SectionHeader } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { space } from '@/ui/tokens';

export default function StockDetail() {
  const hidden = useHidden();
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const range = useMemo(() => ({ start: ALL_TIME_START, end: todayIso() }), []);
  const { analysis, isLoading } = useStocksAnalysis(range);
  const divs = useDividendSummary(range);
  const x = analysis?.allPositions.find((pos) => pos.symbol === symbol);

  if (isLoading && !analysis) return <Screen back><Skeleton height={46} width="70%" /><Gap h={space.xl} /><Skeleton height={160} radius={20} /></Screen>;
  if (!x) return <Screen back><EmptyState title="Stock not found" body="No trades in this symbol." /></Screen>;

  const dividends = divs.all.filter((dv) => dv.symbol === x.symbol).reduce((s, dv) => s.plus(dv.net_amount), new Decimal(0));
  const day = x.dayChange !== null ? Number(new Decimal(String(x.dayChange)).times(String(x.shares)).toFixed(2)) : null;
  const info: [string, React.ReactNode][] = [
    ['Last price', x.price !== null ? `${money(x.price, { decimals: 2 })}${x.priceDate ? ` · ${shortDate(x.priceDate)}` : ''}` : 'No price'],
    ['Sector', getStockSector(x.symbol)],
    ['Invested', <Money key="i" value={x.invested} />],
    ['Realized, all time', <Money key="r" value={x.realized} tone="auto" sign />],
    ['Dividends received', <Money key="d" value={Number(dividends.toFixed(2))} />],
  ];
  return (
    <Screen back>
      <View style={styles.title}>
        <StockLogo symbol={x.symbol} size={44} />
        <View style={{ flex: 1 }}>
          <Text variant="headline">{x.symbol}</Text>
          <Text variant="caption" tone="ink2" numberOfLines={1}>{x.companyName}</Text>
        </View>
        {x.dayChangePct !== null ? <Pill tone={x.dayChangePct > 0 ? 'pos' : x.dayChangePct < 0 ? 'neg' : 'flat'} text={pct(x.dayChangePct)} /> : null}
      </View>
      <HeroFigure label={x.isOpen ? 'Current value' : 'Sold out'} value={x.isOpen ? x.value : x.realized}
        caption={x.isOpen ? `${units(x.shares)} shares${x.priceDate ? ` · close ${shortDate(x.priceDate)}` : ''}` : 'Realized profit on this stock'}>
        {x.isOpen ? <Delta amount={day} percent={x.dayChangePct} suffix="today" /> : null}
      </HeroFigure>
      {x.isOpen ? (
        <>
          <StatRow stats={[
            { label: 'Unrealized', value: x.unrealized, tone: 'auto', sign: true, sub: x.unrealizedPct !== null ? pct(x.unrealizedPct) : null },
            { label: 'Avg cost', value: x.avgCost, sub: 'Incl. buy fees' },
            { label: 'Shares', value: null, text: units(x.shares) },
          ]} />
          <HoldingChart type="psx" assetKey={x.symbol} live={{ value: x.value, cost: x.invested }} />
        </>
      ) : null}

      <SectionHeader title="Details" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {info.map(([k, v], i) => (
          <View key={k}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.row}>
              <Text variant="body" tone="ink2">{k}</Text>
              {typeof v === 'string' ? <Text variant="num" style={{ flexShrink: 1, textAlign: 'right' }}>{v}</Text> : v}
            </View>
          </View>
        ))}
      </Card>

      <SectionHeader title="Trades" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {x.trades.map((t, i) => (
          <View key={t.id}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{t.type === 'buy' ? 'Bought' : 'Sold'} {units(t.quantity)} @ {money(t.price, { decimals: 2 }).replace('Rs ', '')}</Text>
                <Text variant="caption" tone="ink2">{shortDate(t.date)}{t.broker ? ` · ${t.broker.toUpperCase()}` : ''}{t.fee ? ` · fee ${money(t.fee, { hidden, decimals: 2 })}` : ''}</Text>
              </View>
              <Text variant="num">{money(new Decimal(String(t.quantity)).times(String(t.price)).toFixed(2), { hidden })}</Text>
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, gap: space.md },
});
