/**
 * Component gallery (plan M1-T2): every UI building block with SAMPLE figures (not anyone's data), for
 * checking dark/light, font scaling and TalkBack labels. Development builds only — release builds redirect.
 * Open: fintraxa://dev-ui, or /dev-ui on the web dev server. `?light` forces the light palette.
 * `?receipt=stock|dividend|bank|fund|expense` shows a sample receipt screen (with its working Download).
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
import { AmcLogo, BankLogo, CategoryIcon, StockLogo } from '@/ui/Logos';
import { ReceiptScreen, type ReceiptProps } from '@/ui/Receipt';
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

// Sample receipts (made-up figures) for checking the slip and its download on each kind of logo.
const SAMPLE_RECEIPTS: Record<string, ReceiptProps> = {
  stock: {
    icon: <StockLogo symbol="HBL" size={48} />, title: 'HBL', subtitle: 'Habib Bank Limited', amount: '−Rs 25,312.50', status: 'Buy',
    rows: [{ label: 'Trade date', value: '14 Nov 2026' }, { label: 'Settlement date', value: '18 Nov 2026' }, { label: 'Shares × price', value: '100 × Rs 252.50' },
      { label: 'Trade value', value: 'Rs 25,250.00' }, { label: 'Charges', value: '+Rs 62.50' }, { label: 'Net paid', value: 'Rs 25,312.50', strong: true }, { label: 'Broker', value: 'AKD Securities' }],
    reference: 'A1B2C3D4',
  },
  dividend: {
    icon: <StockLogo symbol="MEBL" size={48} />, title: 'MEBL', subtitle: 'Meezan Bank Limited', amount: '+Rs 1,190.00', positive: true, status: 'Interim dividend',
    rows: [{ label: 'Payment date', value: '2 Oct 2026' }, { label: 'Shares × per share', value: '200 × Rs 7' }, { label: 'Gross dividend', value: 'Rs 1,400.00' },
      { label: 'Tax withheld (15%)', value: '−Rs 210.00' }, { label: 'Net received', value: 'Rs 1,190.00', strong: true }, { label: 'Warrant no.', value: '000123' }],
    reference: 'D1V2D3N4',
  },
  bank: {
    icon: <BankLogo symbol="UBL" size={48} />, title: 'Savings account', subtitle: 'UBL Ameen', amount: '+Rs 4,250.00', positive: true, status: 'Savings profit',
    rows: [{ label: 'Date', value: '1 Nov 2026' }, { label: 'Category', value: 'Profit on savings' }, { label: 'Gross profit', value: 'Rs 5,000.00' },
      { label: 'Tax withheld (15%)', value: '−Rs 750.00' }, { label: 'Net credited', value: 'Rs 4,250.00', strong: true }],
    reference: 'S4V1NG55',
  },
  fund: {
    icon: <AmcLogo code="meezan" name="Al Meezan Investments" size={48} />, title: 'Meezan Cash Fund', subtitle: 'Al Meezan Investments', amount: 'Rs 50,000.00', status: 'Purchase',
    rows: [{ label: 'Date', value: '10 Nov 2026' }, { label: 'Units × NAV', value: '943.1234 × Rs 53.0158' }, { label: 'Amount', value: 'Rs 50,000.00', strong: true }],
    reference: 'MF-0098',
  },
  expense: {
    icon: <CategoryIcon icon="Restaurant" size={48} tone="glass" />, title: 'Food & Dining', amount: '−Rs 1,850.00', status: 'Expense',
    rows: [{ label: 'Date', value: '27 Nov 2026' }, { label: 'Note', value: 'Dinner' }], reference: 'E5X6P7N8',
  },
};

export default function DevUi() {
  const p = useTheme();
  const { light, receipt } = useLocalSearchParams<{ light?: string; receipt?: string }>();
  const [seg, setSeg] = useState<'overview' | 'funds' | 'stocks'>('overview');
  const [amount, setAmount] = useState('1250');
  const [scrub, setScrub] = useState<Point | null>(null);
  useEffect(() => { if (light !== undefined) useApp.getState().set({ themePref: 'light' }); }, [light]);
  if (!__DEV__) return <Redirect href="/" />;
  if (receipt) return <ReceiptScreen classic={['stock', 'dividend', 'fund'].includes(receipt)} receipt={SAMPLE_RECEIPTS[receipt] ?? SAMPLE_RECEIPTS.stock} file={`sample-${receipt}.png`} />;
  const last = SAMPLE[SAMPLE.length - 1];

  return (
    <Screen title="UI samples" right={<Pill text="Sample data" tone="accent" />}>
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
