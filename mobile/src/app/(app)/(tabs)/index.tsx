import { router } from 'expo-router';
import { AlertTriangle, ChevronRight, Clock, FileText, Plus } from '@/ui/icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { TransactionRow } from '@/features/money/TransactionRow';
import { UpdateBanner } from '@/features/me/UpdateBanner';
import { useToday } from '@/features/today/useToday';
import { firstName, useAuth } from '@/lib/auth';
import { addDays, greeting, shortDate, timeAgoLabel, todayIso } from '@/lib/dates';
import { compactNumber, money } from '@/lib/format';
import { AreaChart, type Point } from '@/ui/charts';
import { EmptyState, ErrorState, OfflinePill, Skeleton } from '@/ui/feedback';
import { Delta, HeroFigure, Money, StatRow, useHidden } from '@/ui/Figures';
import { Card, Chip, Divider, Gap, SectionHeader } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { space } from '@/ui/tokens';

const PERIODS = [{ id: '1M', days: 30 }, { id: '3M', days: 91 }, { id: '1Y', days: 365 }, { id: 'All', days: 0 }] as const;

function asOfCaption(psx: string | null, nav: string | null, tracks: { funds: boolean; stocks: boolean }) {
  const parts = [tracks.stocks && psx ? `PSX close ${shortDate(psx)}` : null, tracks.funds && nav ? `NAV ${shortDate(nav)}` : null].filter(Boolean);
  return parts.length ? `As of ${parts.join(' · ')}` : null;
}

export default function Today() {
  const p = useTheme();
  const hidden = useHidden();
  const user = useAuth((s) => s.user);
  const d = useToday();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['id']>('3M');
  const [scrub, setScrub] = useState<Point | null>(null);
  const [explain, setExplain] = useState(false);

  const chart = useMemo(() => {
    const days = PERIODS.find((x) => x.id === period)!.days;
    if (!days) return d.points;
    const from = addDays(todayIso(), -days);
    return d.points.filter((pt) => pt.date >= from);
  }, [d.points, period]);

  const name = firstName(user, d.profileName);
  const eyebrow = name ? `${greeting()}, ${name}` : greeting();
  const showInvest = d.tracks.funds || d.tracks.stocks;

  if (d.loading) {
    return (
      <Screen eyebrow={eyebrow} tabBar>
        <Skeleton height={14} width={90} />
        <Gap h={10} />
        <Skeleton height={46} width="70%" />
        <Gap h={12} />
        <Skeleton height={24} width={180} />
        <Gap h={space.xxl} />
        <Skeleton height={180} radius={20} />
        <Gap h={space.lg} />
        <Skeleton height={86} radius={20} />
      </Screen>
    );
  }
  if (d.error) return <Screen eyebrow={eyebrow} tabBar><ErrorState onRetry={d.refetch} /></Screen>;
  if (!d.hasAnything) {
    return (
      <Screen eyebrow={eyebrow} title="Let’s get you started" tabBar>
        <EmptyState icon={<Plus size={36} color={p.accent} />} title="Nothing tracked yet"
          body="Log what you spend in seconds with the + button. Funds and shares you add on the web app appear here automatically."
          action="Add your first expense" onAction={() => router.push('/add')} />
      </Screen>
    );
  }

  const f = d.figures;
  return (
    <Screen eyebrow={eyebrow} tabBar onRefresh={d.refetch}
      right={<Pressable onPress={() => router.navigate('/me')} accessibilityRole="button" accessibilityLabel="Open Me" hitSlop={8}
        style={[styles.avatar, { backgroundColor: p.surface2, borderColor: p.border }]}><Text variant="label">{(name || 'F').slice(0, 1)}</Text></Pressable>}>
      <UpdateBanner />
      <OfflinePill />
      {showInvest ? (
        <>
          <HeroFigure label={scrub ? shortDate(scrub.date) : 'Net worth'} value={scrub ? scrub.value : f.worth}
            caption={scrub ? 'Funds and stocks at that day’s close' : asOfCaption(f.psxAsOf, f.navAsOf, d.tracks)} onPress={() => setExplain(true)}>
            {!scrub ? <Delta amount={f.change} percent={f.changePct} suffix="today" /> : null}
          </HeroFigure>
          <Animated.View entering={FadeIn.duration(300)}>
            <AreaChart points={chart} onScrub={setScrub} format={(v) => (hidden ? '••••' : `Rs ${compactNumber(v)}`)} />
          </Animated.View>
          <View style={styles.periods} accessibilityRole="tablist">
            {PERIODS.map((x) => <Chip key={x.id} label={x.id} selected={period === x.id} onPress={() => setPeriod(x.id)} accessibilityLabel={`Show ${x.id === 'All' ? 'all time' : x.id}`} />)}
          </View>
          <Gap h={space.lg} />
          <StatRow stats={[
            ...(d.tracks.spending ? [{ label: 'Saved this month', value: f.saved, tone: 'auto' as const, onPress: () => router.navigate('/money') }] : []),
            { label: 'Invested', value: f.invested, sub: 'Cost of what you hold', onPress: () => router.navigate('/invest') },
          ]} />
        </>
      ) : (
        <HeroFigure label="Saved this month" value={f.saved} caption="Income minus spending, this calendar month" onPress={() => router.navigate('/money')} />
      )}

      {d.needs.length ? (
        <>
          <SectionHeader title="Needs you" />
          <Card padded={false}>
            {d.needs.map((n, i) => (
              <View key={n.key}>
                {i > 0 ? <Divider inset={56} /> : null}
                <View style={styles.needRow}>
                  <View style={[styles.needIcon, { backgroundColor: n.tone === 'warn' ? p.warnSoft : p.accentSoft }]}>
                    {n.tone === 'warn' ? <AlertTriangle size={18} color={p.warn} /> : <FileText size={18} color={p.ink} />}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong">{n.title}</Text>
                    <Text variant="caption" tone="ink2">{n.detail}</Text>
                  </View>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {d.since.length && d.prevSeenAt ? (
        <>
          <SectionHeader title="Since you last looked" />
          <Card>
            <View style={styles.sinceHead}>
              <Clock size={14} color={p.muted} />
              <Text variant="caption" tone="muted">Last opened {timeAgoLabel(d.prevSeenAt)}</Text>
            </View>
            {d.since.map((s) => (
              <View key={s.key} style={styles.sinceRow}>
                <Text variant="body">{s.text}</Text>
                <Money value={s.amount} sign tone="auto" />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {d.tracks.spending && d.recent.length ? (
        <>
          <SectionHeader title="Recent" action="See all" onAction={() => router.push('/transactions')} />
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {d.recent.map((t, i) => (
              <View key={t.id}>
                {i > 0 ? <Divider inset={52} /> : null}
                <TransactionRow t={t} showDate />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Sheet open={explain} onClose={() => setExplain(false)} title="How net worth is calculated">
        <Text variant="body" tone="ink2">What you hold today, at the latest published prices. Cash in bank accounts isn’t included.</Text>
        <Gap h={space.lg} />
        {d.tracks.funds ? <BreakdownRow label="Mutual funds" sub="Units × latest repurchase price (NAV if none)" value={f.funds} onPress={() => { setExplain(false); router.navigate('/invest'); }} /> : null}
        {d.tracks.stocks ? <BreakdownRow label="PSX shares" sub="Shares × last close (or newer refreshed price)" value={f.stocks} onPress={() => { setExplain(false); router.navigate('/invest'); }} /> : null}
        <Divider />
        <View style={styles.sinceRow}>
          <Text variant="bodyStrong">Net worth</Text>
          <Text variant="numLarge">{money(f.worth, { hidden })}</Text>
        </View>
        <Gap h={space.md} />
        <Text variant="caption" tone="muted">“Today” is the change in the last PSX session plus the latest NAV move of each fund. Figures come from the same engines as the web app.</Text>
      </Sheet>
    </Screen>
  );
}

function BreakdownRow({ label, sub, value, onPress }: { label: string; sub: string; value: number; onPress: () => void }) {
  const p = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.breakdown}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{label}</Text>
        <Text variant="caption" tone="ink2">{sub}</Text>
      </View>
      <Money value={value} />
      <ChevronRight size={18} color={p.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  periods: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  needRow: { flexDirection: 'row', gap: space.md, padding: space.lg, alignItems: 'flex-start' },
  needIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sinceHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space.sm },
  sinceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 40 },
  breakdown: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64 },
});
