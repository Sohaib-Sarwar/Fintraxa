import Decimal from 'decimal.js';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useInvestView } from '@/features/nav/investView';
import { UpdateBanner } from '@/features/me/UpdateBanner';
import { useToday } from '@/features/today/useToday';
import { markHomeReady, useCurtain } from '@/features/session/SignInCurtain';
import { useAvatarUrl, useDividends, useProfile, useSnapshots } from '@/data/queries';
import { dividendsByMonth, monthEndBarsFor, type MonthBar } from '@/data/selectors';
import { RangeButton } from '@/features/range/RangeButton';
import { usePeriod } from '@/features/range/usePeriod';
import { useDividendSummary } from '@/data/portfolio';
import { firstName, useAuth } from '@/lib/auth';
import { monthLabel, monthName, monthOf, todayIso } from '@/lib/dates';
import { compactNumber, isLong } from '@/lib/format';
import { type DonutItem } from '@/features/today/AllocationDonut';
import { ChartCard, TipRows } from '@/features/today/ChartCard';
import { CARD_RATIO, NetWorthCard } from '@/features/today/NetWorthCard';
import { useWorthSheet } from '@/features/today/worthSheetStore';
import { EmptyState, ErrorState, OfflinePill, Skeleton } from '@/ui/feedback';
import { Money, useHidden } from '@/ui/Figures';
import { AlertTriangle, FileText, FileUp } from '@/ui/icons';
import { AmcLogo, Avatar, StockLogo } from '@/ui/Logos';
import { Card, SectionHeader } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { accentText, font, SCREEN_PAD, space } from '@/ui/tokens';


type HomeBar = MonthBar & { dividends: number };
/** Header row height inside Screen (row 46 + its top/bottom padding). */
const HEADER_H = 44 + space.sm + space.md;
/** The nav's top edge is 80 dp above the safe area; the cards stop 14 dp above it. */
const BOTTOM_SPACE = 80 + 14;
type PieTab = 'all' | 'funds' | 'stocks';

/**
 * Header (owner, 2026-11-14): avatar (opens profile & settings) with the name beside it; the glass period
 * button ("FY 2026-27") on the right, the same place as on every money page.
 */
function HomeHeader({ name }: { name: string }) {
  const p = useTheme();
  const profile = useProfile();
  const avatar = useAvatarUrl(profile.data?.avatar_path);
  return (
    <View style={styles.header}>
      <Pressable onPress={() => router.push('/me')} accessibilityRole="button" accessibilityLabel="Open your profile and settings" hitSlop={6}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <Avatar uri={avatar.data} name={name} size={42} />
      </Pressable>
      <Text style={[styles.name, { color: p.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{name || 'Welcome'}</Text>
      <RangeButton />
    </View>
  );
}

/** What a held bar shows: the month, then funds, PSX and dividends received that month. */
function MonthTip({ b, funds, stocks }: { b: HomeBar; funds: boolean; stocks: boolean }) {
  const rows = [
    ...(funds ? [{ k: 'Mutual funds', v: b.funds }] : []),
    ...(stocks ? [{ k: 'PSX shares', v: b.stocks }] : []),
    ...(stocks ? [{ k: 'Dividends', v: b.dividends }] : []),
  ];
  return <TipRows title={monthName(b.key)} rows={rows.map((r) => ({ k: r.k, v: <Money value={r.v} variant="label" compact={isLong(r.v, 1_000_000)} /> }))} />;
}

export default function Home() {
  const p = useTheme();
  const hidden = useHidden();
  const user = useAuth((s) => s.user);
  const d = useToday();
  const snaps = useSnapshots();
  const divs = useDividends();
  const period = usePeriod();
  const fyDivs = useDividendSummary(period.upTo);
  const setView = useInvestView((s) => s.setView);
  const [month, setMonth] = useState<string | null>(null);
  const openWorth = useWorthSheet((st) => st.open);
  const [viewport, setViewport] = useState(0);
  const [pieTab, setPieTab] = useState<PieTab>('all');
  const { height: winH, width: winW } = useWindowDimensions();
  // Production first paint (owner, 2026-11-15: "after login Home doesn't look production level"): from the cache the
  // page is simply there, no animation; only a cold start (nothing cached) cross-fades from placeholders that have
  // the exact shape of the card and chart, so nothing jumps.
  const [cold] = useState(d.loading);
  // Real content (or a real empty account) is on screen: lift the sign-in curtain / let the splash go — one frame
  // later, so the reveal never shows a half-drawn page.
  // Also when a curtain goes up over an already-loaded Home (fingerprint unlock).
  const curtainWaiting = useCurtain((s) => !!s.source && !s.ready);
  useEffect(() => {
    if (d.loading) return undefined;
    const f = requestAnimationFrame(markHomeReady);
    return () => cancelAnimationFrame(f);
  }, [d.loading, curtainWaiting]);
  const insets = useSafeAreaInsets();
  const name = firstName(user, d.profileName);
  const header = <HomeHeader name={name} />;
  const f = d.figures;
  const thisMonth = monthOf(todayIso());

  const bars = useMemo<HomeBar[]>(() => {
    const byMonth = dividendsByMonth(divs.data ?? []);
    return monthEndBarsFor(snaps.data ?? [], { month: thisMonth, funds: f.funds, stocks: f.stocks }, period.months).map((b) => ({ ...b, dividends: byMonth[b.key] ?? 0 }));
  }, [snaps.data, divs.data, thisMonth, f.funds, f.stocks, period.months]);
  // Mobile net worth (owner, 2026-11-14) = mutual funds + PSX shares + dividends received in the chosen period (default this FY).
  const divFy = d.tracks.stocks ? fyDivs.summary?.net ?? 0 : 0;
  const worth = Number(new Decimal(String(f.worth)).plus(String(divFy)).toFixed(2));
  // Web Home's allocation items: every open fund and share holding with its logo.
  const pieItems = useMemo<DonutItem[]>(() => {
    const fundsRows = (d.tracks.funds ? d.funds?.positions ?? [] : []).filter((x) => x.isOpen && (x.value ?? 0) > 0)
      .map((x) => ({ key: `f-${x.key}`, label: x.fundName ?? 'Fund', value: x.value ?? 0, logo: (n: number) => <AmcLogo code={x.amcCode} name={x.amcName} size={n} /> }));
    const stockRows = (d.tracks.stocks ? d.stocks?.positions ?? [] : []).filter((x) => x.isOpen && (x.value ?? 0) > 0)
      .map((x) => ({ key: `s-${x.symbol}`, label: x.symbol, value: x.value ?? 0, logo: (n: number) => <StockLogo symbol={x.symbol} size={n} /> }));
    return pieTab === 'funds' ? fundsRows : pieTab === 'stocks' ? stockRows : [...fundsRows, ...stockRows];
  }, [d.funds, d.stocks, d.tracks.funds, d.tracks.stocks, pieTab]);
  const selKey = month && bars.some((b) => b.key === month) ? month : bars[bars.length - 1]?.key;

  // Card + chart fill exactly the space between the header and the nav (owner): viewport − header − nav.
  const fill = Math.max(480, (viewport || winH) - insets.top - HEADER_H - insets.bottom - BOTTOM_SPACE);
  const cardH = Math.round((winW - SCREEN_PAD * 2) / CARD_RATIO);

  if (d.loading) {
    return (
      <Screen header={header} tabBar bottomSpace={BOTTOM_SPACE} onViewport={setViewport}>
        <View style={{ height: fill }}>
          <Skeleton height={cardH} radius={28} />
          <View style={styles.chartWrap}><Skeleton height="100%" radius={24} /></View>
        </View>
      </Screen>
    );
  }
  if (d.error) return <Screen header={header} tabBar><ErrorState onRetry={d.refetch} /></Screen>;

  const showInvest = d.tracks.funds || d.tracks.stocks;
  const open = (v: 'funds' | 'stocks') => { setView(v); router.navigate('/invest'); };
  const enter = cold ? FadeIn.duration(220) : undefined;

  return (
    <Screen header={header} tabBar bottomSpace={BOTTOM_SPACE} onViewport={setViewport} onRefresh={() => Promise.all([d.refetch(), snaps.refetch(), divs.refetch()])}>
      <UpdateBanner />
      <OfflinePill />

      <View style={{ height: fill }}>
      {!d.hasAnything ? (
        <Card>
          <EmptyState icon={<FileUp size={34} color={accentText(p)} />} title="Nothing tracked yet"
            body="Tap + below: log an expense or income, or upload a fund statement, broker confirmation or CDC dividend report." />
        </Card>
      ) : (
        <Animated.View entering={enter}>
          <NetWorthCard label={showInvest ? 'Net worth' : 'Saved this month'} value={showInvest ? worth : f.saved} onPress={() => openWorth({
            total: showInvest ? worth : f.saved,
            funds: showInvest && d.tracks.funds ? f.funds : null,
            stocks: showInvest && d.tracks.stocks ? f.stocks : null,
            dividends: showInvest && d.tracks.stocks ? divFy : null,
            period: period.label,
          })}
            holders={showInvest ? [
              ...(d.tracks.funds ? [{ label: 'Mutual funds', value: f.funds, onPress: () => open('funds') }] : []),
              ...(d.tracks.stocks ? [{ label: 'PSX', value: f.stocks, onPress: () => open('stocks') }] : []),
              ...(d.tracks.stocks ? [{ label: 'Dividends', value: divFy, onPress: () => router.push({ pathname: '/passive-source', params: { source: 'dividends' } }) }] : []),
            ] : []} />
        </Animated.View>
      )}

      {showInvest && !bars.length && snaps.isLoading ? (
        <View style={styles.chartWrap}><Skeleton height="100%" radius={24} /></View>
      ) : null}
      {showInvest && bars.length ? (
        <Animated.View entering={cold || snaps.isFetchedAfterMount ? FadeIn.duration(220) : undefined} style={styles.chartWrap}>
          <ChartCard<HomeBar, PieTab> barTitle={selKey ? monthLabel(selKey, true) : ''} bars={bars} selected={selKey} onSelect={setMonth} hidden={hidden}
            format={(v) => (hidden ? '••••' : `Rs ${compactNumber(v)}`)} renderTip={(b) => <MonthTip b={b} funds={d.tracks.funds} stocks={d.tracks.stocks} />}
            pieItems={pieItems} pieCenter={pieTab === 'funds' ? 'Mutual funds' : pieTab === 'stocks' ? 'Stocks' : 'Net worth'}
            pieTabs={d.tracks.funds && d.tracks.stocks ? { value: pieTab, onChange: setPieTab, options: [{ value: 'all', label: 'All' }, { value: 'funds', label: 'Funds' }, { value: 'stocks', label: 'Stocks' }] } : undefined} />
        </Animated.View>
      ) : null}
      </View>

      {d.needs.length ? (
        <>
          <SectionHeader title="Needs you" />
          <View style={{ gap: space.sm }}>
            {d.needs.map((n) => (
              <Card key={n.key} style={styles.needCard}>
                <View style={[styles.needIcon, { backgroundColor: n.tone === 'warn' ? p.warnSoft : p.accentSoft }]}>
                  {n.tone === 'warn' ? <AlertTriangle size={18} color={p.warn} /> : <FileText size={18} color={p.mode === 'dark' ? p.accent : p.accentDeep} />}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">{n.title}</Text>
                  <Text variant="caption" tone="ink2">{n.detail}</Text>
                </View>
              </Card>
            ))}
          </View>
        </>
      ) : null}

    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, height: 44 },
  name: { flex: 1, fontFamily: font.semibold, fontSize: 19, lineHeight: 24, letterSpacing: -0.3 },
  chartWrap: { flex: 1, marginTop: space.md },
  needCard: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', padding: space.lg },
  needIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 42 },
});
