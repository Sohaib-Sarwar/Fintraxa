import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { FundCard, StockCard } from '@/features/invest/HoldingCards';
import { useFundsAnalysis, useStocksAnalysis } from '@/data/portfolio';
import { ALL_TIME_START, todayIso } from '@/lib/dates';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { ScrollText } from '@/ui/icons';
import { CircleButton, Gap } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/tokens';

/**
 * Holdings (owner, 2026-11-14): opened from "Invested" on the Mutual funds / Stocks card. What you hold now,
 * biggest first, as formal dark cards — no period, no filters.
 */
export default function Holdings() {
  const { side: sideParam } = useLocalSearchParams<{ side?: string }>();
  const side = sideParam === 'stocks' ? 'stocks' : 'funds';
  const range = useMemo(() => ({ start: ALL_TIME_START, end: todayIso() }), []);
  const funds = useFundsAnalysis(range);
  const stocks = useStocksAnalysis(range);
  const q = side === 'funds' ? funds : stocks;

  const cards = useMemo(() => (side === 'funds'
    ? (funds.analysis?.positions ?? []).filter((x) => x.isOpen).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).map((x) => <FundCard key={x.key} x={x} />)
    : (stocks.analysis?.positions ?? []).filter((x) => x.isOpen).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).map((x) => <StockCard key={x.symbol} x={x} />)),
  [side, funds.analysis, stocks.analysis]);

  return (
    <Screen back title="Holdings" onRefresh={() => q.refetch()}
      right={<CircleButton icon={ScrollText} label="Transactions" onPress={() => router.push({ pathname: '/invest-transactions', params: { side } })} />}>
      {q.isLoading && !q.analysis ? (
        <><Skeleton height={170} radius={22} /><Gap h={space.sm} /><Skeleton height={170} radius={22} /></>
      ) : cards.length ? <View style={{ gap: space.md }}>{cards}</View> : <EmptyState title="Nothing held" body={side === 'funds' ? 'You hold no mutual funds right now.' : 'You hold no shares right now.'} />}
    </Screen>
  );
}
