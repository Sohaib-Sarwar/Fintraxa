import Decimal from 'decimal.js';
import { router } from 'expo-router';
import { Landmark, LineChart, Receipt, ScrollText } from '@/ui/icons';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDividendSummary, useFundsAnalysis, useNccpl, useStocksAnalysis } from '@/data/portfolio';
import { taxYearLabel } from '@/data/engines';
import type { FundPosition, StockPosition } from '@/data/types';
import { useUid } from '@/data/queries';
import { ALL_TIME_START, fyLabel, fyOf, fyRange, shortDate, todayIso } from '@/lib/dates';
import { addMoney, changePct, money, pct, share, tone, units } from '@/lib/format';
import { useTracks } from '@/lib/store';
import { EmptyState, ErrorState, OfflinePill, Skeleton } from '@/ui/feedback';
import { Delta, HeroFigure, Money, StatRow, useHidden } from '@/ui/Figures';
import { ListRow } from '@/ui/ListRow';
import { AmcLogo, StockLogo } from '@/ui/Logos';
import { Card, Divider, Gap, Pill, SectionHeader } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Segmented } from '@/ui/Segmented';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { space } from '@/ui/tokens';

type Seg = 'overview' | 'funds' | 'stocks';

export default function InvestTab() {
  const uid = useUid();
  const tracks = useTracks(uid);
  const today = todayIso();
  const fy = fyOf(today);
  const allTime = useMemo(() => ({ start: ALL_TIME_START, end: today }), [today]);
  const fyR = useMemo(() => fyRange(fy), [fy]);
  const funds = useFundsAnalysis(allTime);
  const fundsFy = useFundsAnalysis(fyR);
  const stocks = useStocksAnalysis(allTime);
  const stocksFy = useStocksAnalysis(fyR);
  const options = [
    ...(tracks.funds && tracks.stocks ? [{ value: 'overview' as const, label: 'Overview' }] : []),
    ...(tracks.funds ? [{ value: 'funds' as const, label: 'Funds' }] : []),
    ...(tracks.stocks ? [{ value: 'stocks' as const, label: 'Stocks' }] : []),
  ];
  const [seg, setSeg] = useState<Seg>(options[0]?.value ?? 'overview');
  const active = options.some((o) => o.value === seg) ? seg : options[0]?.value ?? 'overview';
  const refetch = () => Promise.all([funds.refetch(), stocks.refetch()]);

  const loading = (funds.isLoading && !funds.analysis) || (stocks.isLoading && !stocks.analysis);
  const error = !funds.analysis && !stocks.analysis ? funds.error ?? stocks.error : null;

  return (
    <Screen title="Invest" tabBar onRefresh={refetch}>
      <OfflinePill />
      {options.length > 1 ? <Segmented options={options} value={active} onChange={setSeg} accessibilityLabel="Investment view" /> : null}
      <Gap h={space.lg} />
      {loading ? (
        <><Skeleton height={46} width="65%" /><Gap h={space.xl} /><Skeleton height={86} radius={20} /><Gap h={space.xl} /><Skeleton height={260} radius={20} /></>
      ) : error ? <ErrorState onRetry={refetch} /> : active === 'overview' ? (
        <Overview fy={fy} funds={funds} fundsFy={fundsFy} stocks={stocks} stocksFy={stocksFy} />
      ) : active === 'funds' ? (
        <Funds fy={fy} funds={funds} fundsFy={fundsFy} />
      ) : (
        <Stocks fy={fy} stocks={stocks} stocksFy={stocksFy} />
      )}
    </Screen>
  );
}

type FundsQ = ReturnType<typeof useFundsAnalysis>;
type StocksQ = ReturnType<typeof useStocksAnalysis>;

function Overview({ fy, funds, fundsFy, stocks, stocksFy }: { fy: number; funds: FundsQ; fundsFy: FundsQ; stocks: StocksQ; stocksFy: StocksQ }) {
  const p = useTheme();
  const { report, currentTaxYear } = useNccpl();
  const divs = useDividendSummary(fyRange(fy));
  const fv = funds.analysis?.totals.value ?? 0;
  const sv = stocks.analysis?.totals.value ?? 0;
  const value = addMoney(fv, sv);
  const invested = addMoney(funds.analysis?.totals.invested, stocks.analysis?.totals.invested);
  const unreal = addMoney(funds.analysis?.totals.unrealized.gross, stocks.analysis?.totals.unrealized);
  const realized = addMoney(fundsFy.analysis?.totals.realized.net, stocksFy.analysis?.totals.realized);
  const day = addMoney(stocks.analysis?.totals.dayChange, funds.day?.total);
  const cgt = report?.year(currentTaxYear)?.cgt ?? 0;
  if (!value && !funds.analysis?.allPositions.length && !stocks.analysis?.allPositions.length) {
    return <EmptyState icon={<LineChart size={34} color={p.muted} />} title="No investments yet" body="Add a fund statement or a PSX trade on the web app — it appears here automatically." />;
  }
  const fShare = share(fv, value) ?? 0;
  return (
    <>
      <HeroFigure label="Investments value" value={value} caption="Funds and shares at the latest published prices">
        <Delta amount={day} percent={changePct(day, value)} suffix="today" />
      </HeroFigure>
      <StatRow stats={[
        { label: 'Unrealized', value: unreal, tone: 'auto', sign: true, sub: invested > 0 ? pct(share(unreal, invested)) : null },
        { label: `Realized ${fyLabel(fy).replace('FY ', '')}`, value: realized, tone: 'auto', sign: true, sub: 'After fees & CGT' },
        { label: 'Dividends', value: divs.summary?.net ?? 0, sub: `${divs.summary?.count ?? 0} this tax year` },
      ]} />

      <SectionHeader title="Where it is" />
      <Card>
        <View style={[styles.allocTrack, { backgroundColor: p.surface3 }]} accessibilityLabel={`Funds ${fShare}%, stocks ${(100 - fShare).toFixed(0)}%`}>
          <View style={{ width: `${fShare}%`, backgroundColor: p.accent }} />
          <View style={{ flex: 1, backgroundColor: p.mode === 'dark' ? p.ink2 : p.ink }} />
        </View>
        <Gap h={space.sm} />
        <AllocRow color={p.accent} label="Mutual funds" value={fv} share={fShare} />
        <AllocRow color={p.mode === 'dark' ? p.ink2 : p.ink} label="PSX shares" value={sv} share={100 - fShare} />
      </Card>

      <SectionHeader title="More in Invest" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <ListRow leading={<RowIcon icon={Landmark} />} title={`Tax ${taxYearLabel(currentTaxYear)}`} subtitle="NCCPL capital gains tax on shares"
          trailing={<Money value={cgt} />} chevron onPress={() => router.push('/tax')} />
        <Divider inset={52} />
        <ListRow leading={<RowIcon icon={Receipt} />} title="Dividends" subtitle="Cash dividends received" chevron onPress={() => router.push('/dividends')} />
        <Divider inset={52} />
        <ListRow leading={<RowIcon icon={ScrollText} />} title="Trades" subtitle="Every buy and sell" chevron onPress={() => router.push('/trades')} />
      </Card>
    </>
  );
}

function AllocRow({ color, label, value, share: s }: { color: string; label: string; value: number; share: number }) {
  return (
    <View style={styles.allocRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="body" style={{ flex: 1 }}>{label}</Text>
      <Text variant="caption" tone="muted" style={{ marginRight: space.md }}>{s.toFixed(0)}%</Text>
      <Money value={value} />
    </View>
  );
}

function RowIcon({ icon: Icon }: { icon: typeof Landmark }) {
  const p = useTheme();
  return <View style={[styles.rowIcon, { backgroundColor: p.surface2 }]}><Icon size={19} color={p.ink} /></View>;
}

function Funds({ fy, funds, fundsFy }: { fy: number; funds: FundsQ; fundsFy: FundsQ }) {
  const p = useTheme();
  const hidden = useHidden();
  const a = funds.analysis;
  const open = (a?.positions ?? []).filter((x) => x.isOpen).sort((x, y) => (y.value ?? 0) - (x.value ?? 0));
  const closed = (a?.allPositions ?? []).filter((x) => !x.isOpen);
  if (!a || !a.allPositions.length) return <EmptyState icon={<LineChart size={34} color={p.muted} />} title="No funds yet" body="Upload a fund statement on the web app; your holdings appear here." />;
  const t = a.totals;
  return (
    <>
      <HeroFigure label="Funds value" value={t.value} caption={funds.day?.latestDate ? `Latest NAV ${shortDate(funds.day.latestDate)}` : null}>
        <Delta amount={funds.day?.total ?? null} suffix="latest NAV" />
      </HeroFigure>
      <StatRow stats={[
        { label: 'Unrealized', value: t.unrealized.gross, tone: 'auto', sign: true, sub: t.invested > 0 ? pct(share(t.unrealized.gross, t.invested)) : null },
        { label: `Realized ${fyLabel(fy).replace('FY ', '')}`, value: fundsFy.analysis?.totals.realized.net ?? 0, tone: 'auto', sign: true, sub: 'Net of CGT' },
        { label: 'Invested', value: t.invested, sub: `${t.held} fund${t.held === 1 ? '' : 's'}` },
      ]} />
      <SectionHeader title="Holdings" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {open.map((x, i) => (
          <View key={x.key}>
            {i > 0 ? <Divider inset={52} /> : null}
            <FundRow x={x} day={funds.day?.per.get(x.key)?.change ?? null} hidden={hidden} />
          </View>
        ))}
      </Card>
      {closed.length ? <Text variant="caption" tone="muted" style={{ marginTop: space.md }}>{closed.length} fully redeemed fund{closed.length === 1 ? '' : 's'} not shown.</Text> : null}
      {t.incomplete ? <Text variant="caption" tone="warn" style={{ marginTop: space.sm }}>Some figures use cost because a price or statement detail is missing.</Text> : null}
    </>
  );
}

function FundRow({ x, day, hidden }: { x: FundPosition; day: number | null; hidden: boolean }) {
  const gainPct = share(x.unrealized.gross, x.invested);
  return (
    <ListRow
      leading={<AmcLogo code={x.amcCode} name={x.amcName} />}
      title={x.fundName ?? 'Fund'}
      subtitle={`${units(x.units)} units${x.price ? ` · NAV ${shortDate(x.price.date)}` : ''}`}
      trailing={<Money value={x.value} />}
      trailingSub={gainPct !== null ? <Text variant="caption" tone={tone(x.unrealized.gross)}>{hidden ? '••' : `${money(x.unrealized.gross, { sign: true, compact: true })} · ${pct(gainPct)}`}</Text> : null}
      onPress={() => router.push({ pathname: '/fund/[key]', params: { key: x.key, day: day === null ? '' : String(day) } })}
    />
  );
}

function Stocks({ fy, stocks, stocksFy }: { fy: number; stocks: StocksQ; stocksFy: StocksQ }) {
  const p = useTheme();
  const a = stocks.analysis;
  if (!a || !a.allPositions.length) return <EmptyState icon={<LineChart size={34} color={p.muted} />} title="No shares yet" body="Add a trade or upload a broker confirmation on the web app." />;
  const open = a.positions.filter((x) => x.isOpen).sort((x, y) => Math.abs(y.dayChangePct ?? 0) - Math.abs(x.dayChangePct ?? 0));
  const t = a.totals;
  const top = open.reduce<StockPosition | null>((b, x) => (x.dayChangePct !== null && (!b || Math.abs(x.dayChangePct) > Math.abs(b.dayChangePct ?? 0)) ? x : b), null);
  return (
    <>
      <HeroFigure label="Stocks value" value={t.value} caption={stocks.boardAsOf ? `PSX close ${shortDate(stocks.boardAsOf.slice(0, 10))}` : null}>
        <Delta amount={t.dayChange} percent={changePct(t.dayChange, t.value)} suffix="today" />
      </HeroFigure>
      <StatRow stats={[
        { label: 'Unrealized', value: t.unrealized, tone: 'auto', sign: true, sub: t.unrealizedPct !== null ? pct(t.unrealizedPct) : null },
        { label: `Realized ${fyLabel(fy).replace('FY ', '')}`, value: stocksFy.analysis?.totals.realized ?? 0, tone: 'auto', sign: true, sub: 'After fees' },
        { label: 'Top mover', value: top && top.dayChange !== null ? Number(new Decimal(String(top.dayChange)).times(String(top.shares)).toFixed(2)) : null, tone: 'auto', sign: true, sub: top ? `${top.symbol} ${pct(top.dayChangePct)}` : 'No moves' },
      ]} />
      <SectionHeader title="Holdings" />
      <Text variant="caption" tone="muted" style={{ marginTop: -space.sm, marginBottom: space.sm }}>Biggest movers today first</Text>
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {open.map((x, i) => (
          <View key={x.symbol}>
            {i > 0 ? <Divider inset={52} /> : null}
            <ListRow
              leading={<StockLogo symbol={x.symbol} />}
              title={x.symbol}
              subtitle={`${units(x.shares)} shares · avg ${x.avgCost !== null ? money(x.avgCost, { decimals: 2 }).replace('Rs ', '') : '—'}`}
              trailing={<Money value={x.value} />}
              trailingSub={x.dayChangePct !== null ? <Pill tone={tone(x.dayChangePct)} text={Math.abs(x.dayChangePct) < 0.05 ? 'flat' : pct(x.dayChangePct)} /> : null}
              onPress={() => router.push({ pathname: '/stock/[symbol]', params: { symbol: x.symbol } })}
            />
          </View>
        ))}
      </Card>
      {t.unpriced ? <Text variant="caption" tone="warn" style={{ marginTop: space.sm }}>{t.unpriced} holding{t.unpriced === 1 ? '' : 's'} without a price are valued at cost.</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  allocTrack: { height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row' },
  allocRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: space.md },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
