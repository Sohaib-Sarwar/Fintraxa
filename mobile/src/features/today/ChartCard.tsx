/**
 * The Home chart card, shared by Home, Mutual funds, Stocks, Wallet and Passive income (owner, 2026-11-14): a
 * title, the glass Bar | Pie switch (bar first), the bar chart (tap a bar to select, hold and slide for that
 * month's detail card) and the web-style allocation donut. Pitch black in the dark Solid style, glass in Glass.
 * `height` fixes the card's height; without it the card flexes to fill its parent (Home).
 */
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApp } from '@/lib/store';
import { BarChart, type Bar } from '@/ui/charts';
import { GlassToggle } from '@/ui/GlassToggle';
import { ChartColumn, CircleDashed, type LucideIcon } from '@/ui/icons';
import { Card } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { space } from '@/ui/tokens';
import { AllocationDonut, type DonutItem } from './AllocationDonut';

export type ChartKind = 'bar' | 'pie';
type PieTabs<T extends string> = { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: LucideIcon }[] };

export function ChartCard<B extends Bar, T extends string = string>({
  barTitle, pieTitle = 'Allocation', bars, selected, onSelect, format, renderTip, pieItems = [], pieCenter = '', pieTabs, hidden, height, switcher,
}: {
  barTitle: string; pieTitle?: string; bars: B[]; selected?: string | null; onSelect?: (key: string) => void; format: (v: number) => string;
  renderTip?: (b: B) => ReactNode; pieItems?: DonutItem[]; pieCenter?: string; pieTabs?: PieTabs<T>; hidden: boolean; height?: number;
  /** Replaces the Bar | Pie switch with the page's own glass switch (Wallet: Expenses | Income); bars only. */
  switcher?: PieTabs<T>;
}) {
  const p = useTheme();
  const glass = useApp((s) => s.material) === 'glass';
  const [kind, setKind] = useState<ChartKind>('bar');
  const [box, setBox] = useState({ w: 0, h: 0 });
  const tabsH = kind === 'pie' && pieTabs ? 50 : 0;
  return (
    <Card style={[styles.card, height ? { height } : styles.flex, p.mode === 'dark' && !glass && styles.black]}>
      <View style={styles.head}>
        <Text variant="headline" style={{ flex: 1 }} numberOfLines={1} accessibilityLiveRegion="polite">{kind === 'pie' ? pieTitle : barTitle}</Text>
        {switcher ? (
          <GlassToggle<T> value={switcher.value} onChange={switcher.onChange} accessibilityLabel="Chart" options={switcher.options} />
        ) : (
          <GlassToggle<ChartKind> value={kind} onChange={setKind} accessibilityLabel="Chart type"
            options={[{ value: 'bar', icon: ChartColumn, label: 'Bar chart' }, { value: 'pie', icon: CircleDashed, label: 'Pie chart' }]} />
        )}
      </View>
      <View style={styles.flex} onLayout={(e) => setBox({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) })}>
        {kind === 'pie' && pieTabs && !switcher ? (
          <View style={styles.tabs}>
            <GlassToggle<T> value={pieTabs.value} onChange={pieTabs.onChange} accessibilityLabel="Pie view" options={pieTabs.options} />
          </View>
        ) : null}
        {!box.h ? null : kind === 'bar' || switcher ? (
          <BarChart bars={bars} selected={selected} onSelect={onSelect} height={Math.max(180, box.h)} format={format} renderTip={renderTip} />
        ) : (
          <AllocationDonut key={pieTabs?.value ?? 'pie'} items={pieItems} width={box.w} height={box.h - tabsH} hidden={hidden} centerLabel={pieCenter} />
        )}
      </View>
    </Card>
  );
}

/** Rows for a held bar's detail card: the month, then label/value lines. */
export function TipRows({ title, rows }: { title: string; rows: { k: string; v: ReactNode }[] }) {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="bodyStrong" numberOfLines={1}>{title}</Text>
      {rows.map((r) => (
        <View key={r.k} style={styles.tipRow}>
          <Text variant="caption" tone="ink2" style={{ flex: 1 }} numberOfLines={1}>{r.k}</Text>
          {r.v}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 260, paddingBottom: space.md },
  flex: { flex: 1 },
  // Pitch black like the page in the dark Solid style (owner), with a hairline edge so the card still reads.
  black: { backgroundColor: '#000000', borderColor: 'rgba(255,255,255,0.10)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  tabs: { alignItems: 'center', marginBottom: space.sm },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
