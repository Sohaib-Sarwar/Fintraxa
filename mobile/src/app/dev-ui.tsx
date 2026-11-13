/**
 * Component gallery (plan M1-T2): every UI building block with SAMPLE figures (not anyone's data), for
 * checking dark/light, font scaling and TalkBack labels. Development builds only — release builds redirect.
 * Open: fintraxa://dev-ui, or /dev-ui on the web dev server. `?light` forces the light palette.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertTriangle, Landmark } from '@/ui/icons';
import { pressKey } from '@/lib/amount';
import { addDays, todayIso } from '@/lib/dates';
import { useApp } from '@/lib/store';
import { AreaChart, ShareBar, type Point } from '@/ui/charts';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { Delta, HeroFigure, Money, StatRow } from '@/ui/Figures';
import { Keypad } from '@/ui/Keypad';
import { ListRow } from '@/ui/ListRow';
import { AmcLogo, CategoryIcon, StockLogo } from '@/ui/Logos';
import { Button, Card, Chip, Divider, Gap, Pill, SectionHeader } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Segmented } from '@/ui/Segmented';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { space } from '@/ui/tokens';

// Deterministic sample series: a gentle climb with noise.
const SAMPLE: Point[] = Array.from({ length: 90 }, (_, i) => ({
  date: addDays(todayIso(), i - 89),
  value: Math.round(1_150_000 + i * 1100 + Math.sin(i / 4) * 9000),
  cost: 1_080_000 + Math.floor(i / 30) * 20_000,
}));

export default function DevUi() {
  const p = useTheme();
  const { light } = useLocalSearchParams<{ light?: string }>();
  const [seg, setSeg] = useState<'overview' | 'funds' | 'stocks'>('overview');
  const [amount, setAmount] = useState('1250');
  const [scrub, setScrub] = useState<Point | null>(null);
  useEffect(() => { if (light !== undefined) useApp.getState().set({ themePref: 'light' }); }, [light]);
  if (!__DEV__) return <Redirect href="/" />;
  const last = SAMPLE[SAMPLE.length - 1];

  return (
    <Screen eyebrow="Good evening, Ali" right={<Pill text="Sample data" tone="accent" />}>
      <HeroFigure label={scrub ? scrub.date : 'Net worth'} value={scrub ? scrub.value : last.value} caption="As of PSX close 13 Nov · NAV 13 Nov">
        {!scrub ? <Delta amount={3420} percent={0.27} suffix="today" /> : null}
      </HeroFigure>
      <AreaChart points={SAMPLE} onScrub={setScrub} format={(v) => `Rs ${(v / 1e6).toFixed(2)}M`} />
      <View style={styles.row}>{['1M', '3M', '1Y', 'All'].map((x) => <Chip key={x} label={x} selected={x === '3M'} />)}</View>
      <Gap h={space.lg} />
      <StatRow stats={[{ label: 'Saved this month', value: 18400, tone: 'auto' }, { label: 'Invested', value: 842100, sub: 'Cost of what you hold' }]} />

      <SectionHeader title="Needs you" />
      <Card padded={false}>
        <View style={styles.need}>
          <View style={[styles.needIcon, { backgroundColor: p.warnSoft }]}><AlertTriangle size={18} color={p.warn} /></View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">PSX prices are 2 working days behind</Text>
            <Text variant="caption" tone="ink2">Figures use the last published prices.</Text>
          </View>
        </View>
      </Card>

      <SectionHeader title="Holdings" action="See all" onAction={() => {}} />
      <Segmented options={[{ value: 'overview', label: 'Overview' }, { value: 'funds', label: 'Funds' }, { value: 'stocks', label: 'Stocks' }]} value={seg} onChange={setSeg} accessibilityLabel="Sample segments" />
      <Gap h={space.md} />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <ListRow leading={<StockLogo symbol="OGDC" />} title="OGDC" subtitle="500 shares · avg 268.40" trailing={<Money value={157935} />} trailingSub={<Pill tone="pos" text="+0.79%" />} onPress={() => {}} />
        <Divider inset={52} />
        <ListRow leading={<StockLogo symbol="HUBC" />} title="HUBC" subtitle="300 shares · avg 141.10" trailing={<Money value={46230} />} trailingSub={<Pill tone="neg" text="-1.12%" />} onPress={() => {}} />
        <Divider inset={52} />
        <ListRow leading={<AmcLogo code="meezan" name="Al Meezan" />} title="Meezan Rozana Amdani Fund" subtitle="10,412.3 units · NAV 13 Nov" trailing={<Money value={520615} />}
          trailingSub={<Text variant="caption" tone="pos">+Rs 20.6K · +4.12%</Text>} onPress={() => {}} />
      </Card>

      <SectionHeader title="Where it went" />
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {[['Restaurant', 'Food', 8200, 44.6], ['DirectionsCar', 'Transport', 4100, 22.3], ['Receipt', 'Bills', 3050, 16.6]].map(([icon, name, amt, share], i) => (
          <View key={String(name)}>
            {i > 0 ? <Divider inset={52} /> : null}
            <ListRow leading={<CategoryIcon icon={String(icon)} />} title={String(name)} subtitle={`${share}% of spending`} trailing={<Money value={Number(amt)} />}
              trailingSub={<View style={{ width: 72 }}><ShareBar share={Number(share)} /></View>} onPress={() => {}} />
          </View>
        ))}
      </Card>

      <SectionHeader title="Keypad" />
      <Card>
        <Text variant="display" align="center">Rs {amount || '0'}</Text>
        <Keypad onKey={(k) => setAmount((a) => pressKey(a, k))} />
      </Card>

      <SectionHeader title="States" />
      <Card><EmptyState icon={<Landmark size={32} color={p.muted} />} title="No shares yet" body="Add a trade on the web app." action="Learn more" onAction={() => {}} /></Card>
      <Gap />
      <Card style={{ gap: 10 }}><Skeleton height={14} width={90} /><Skeleton height={40} width="70%" /><Skeleton height={60} /></Card>
      <Gap h={space.lg} />
      <Button label="Primary action" onPress={() => {}} />
      <Gap h={space.sm} />
      <Button label="Secondary" kind="secondary" onPress={() => {}} />
      <Gap h={space.sm} />
      <Button label="Delete" kind="danger" onPress={() => {}} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  need: { flexDirection: 'row', gap: space.md, padding: space.lg },
  needIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
