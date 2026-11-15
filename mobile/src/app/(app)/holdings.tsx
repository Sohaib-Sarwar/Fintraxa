import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { FundCard, StockCard } from '@/features/invest/HoldingCards';
import { usePeriod } from '@/features/range/usePeriod';
import { useFundsAnalysis, useStocksAnalysis } from '@/data/portfolio';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { ScrollText } from '@/ui/icons';
import { CircleButton, Gap, SectionHeader } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/tokens';

/**
 * Holdings (owner, 2026-11-14): opened from "Invested" on the Mutual funds / Stocks card, as formal dark cards.
 * Follows the global period like the web (owner, 2026-11-15; web MF Dashboard `held` / `previous`): every holding
 * active in the period — held when it starts or traded in it — split into what is still held at its end (biggest
 * first) and what was sold or redeemed in it (latest first). Each opens its page, which follows the same period.
 */
export default function Holdings() {
  const { side: sideParam } = useLocalSearchParams<{ side?: string }>();
  const side = sideParam === 'stocks' ? 'stocks' : 'funds';
  const period = usePeriod();
  const funds = useFundsAnalysis(period.upTo);
  const stocks = useStocksAnalysis(period.upTo);
  const q = side === 'funds' ? funds : stocks;

  const { held, previous } = useMemo(() => {
    const byValue = (a: { value: number | null }, b: { value: number | null }) => (b.value ?? 0) - (a.value ?? 0);
    const byLast = (a: { lastDate?: string | null }, b: { lastDate?: string | null }) => (b.lastDate ?? '').localeCompare(a.lastDate ?? '');
    if (side === 'funds') {
      const list = funds.analysis?.positions ?? [];
      return {
        held: list.filter((x) => x.isOpen).sort(byValue).map((x) => <FundCard key={x.key} x={x} />),
        previous: list.filter((x) => !x.isOpen).sort(byLast).map((x) => <FundCard key={x.key} x={x} />),
      };
    }
    const list = stocks.analysis?.positions ?? [];
    return {
      held: list.filter((x) => x.isOpen).sort(byValue).map((x) => <StockCard key={x.symbol} x={x} />),
      previous: list.filter((x) => !x.isOpen).sort(byLast).map((x) => <StockCard key={x.symbol} x={x} />),
    };
  }, [side, funds.analysis, stocks.analysis]);

  // The back button and this one are the same width, so "Holdings" sits in the middle (owner, 2026-11-15).
  const right = <CircleButton icon={ScrollText} label="Transactions" onPress={() => router.push({ pathname: '/invest-transactions', params: { side } })} />;

  return (
    <Screen back title="Holdings" onRefresh={() => q.refetch()} right={right}>
      {q.isLoading && !q.analysis ? (
        <><Skeleton height={170} radius={22} /><Gap h={space.sm} /><Skeleton height={170} radius={22} /></>
      ) : held.length || previous.length ? (
        <>
          {held.length ? <View style={{ gap: space.md }}>{held}</View> : null}
          {previous.length ? (
            <>
              <SectionHeader title={side === 'funds' ? `Redeemed in ${period.label}` : `Sold in ${period.label}`} />
              <View style={{ gap: space.md }}>{previous}</View>
            </>
          ) : null}
        </>
      ) : <EmptyState title="Nothing held" body={`No ${side === 'funds' ? 'mutual funds' : 'shares'} held or traded in ${period.label}.`} />}
    </Screen>
  );
}
