/**
 * What the live passive card opens (owner, 2026-11-28: "formally, concisely, how today, sleep and the daily
 * average are calculated — like the web's hover"): the rate first, then one line per figure. Same smoky glass sheet
 * from the bottom as Home's card (WorthSheet), drawn by the tabs layout.
 */
import type { ComponentRef, RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { create } from 'zustand';
import { rupees } from '@/features/widget/earnings';
import { GlassSheet } from '@/ui/GlassSheet';
import { useHidden } from '@/ui/Figures';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { font, space } from '@/ui/tokens';

export type LiveExplain = {
  avgPerMonth: number; months: number; perSecond: number; perDay: number; perNight: number; month: number;
  /** "This tax year", "11 pm – 7 am" */
  period: string; sleep: string; sleepHours: number;
};

export const useLiveSheet = create<{ data: LiveExplain | null; open: (d: LiveExplain) => void; close: () => void }>()((set) => ({
  data: null,
  open: (data) => set({ data }),
  close: () => set({ data: null }),
}));

export function LiveSheet({ blurTarget }: { blurTarget: RefObject<ComponentRef<typeof View> | null> }) {
  const p = useTheme();
  const hidden = useHidden();
  const data = useLiveSheet((s) => s.data);
  const close = useLiveSheet((s) => s.close);
  if (!data) return null;
  const money = (n: number, d = 2) => (hidden ? '••••••' : rupees(n, d));
  const line = p.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const rate = [
    { k: 'Average a month', sub: `Passive income after tax, ${data.period.toLowerCase()} (${data.months} month${data.months === 1 ? '' : 's'})`, v: money(data.avgPerMonth) },
    { k: 'Per day', sub: 'Monthly average ÷ 30.44 days', v: money(data.perDay) },
    { k: 'Per second', sub: 'Per day ÷ 86,400 seconds', v: money(data.perSecond, 6) },
  ];
  const figures = [
    { k: 'Earned today', sub: 'Per second × seconds since 12 am. Restarts at midnight.' },
    { k: 'Last night', sub: `Per second × ${data.sleepHours} hours (${data.sleep}).` },
    { k: 'Yesterday', sub: 'One full day at the rate.' },
    { k: 'This month', sub: 'What was actually received since the 1st, after tax.' },
  ];
  return (
    <GlassSheet blurTarget={blurTarget} onClose={close} smoky maxHeight={0.8}>
      <Text variant="caption" tone="muted">How it’s counted</Text>
      <View style={styles.totalRow}>
        <Text style={[styles.total, { color: p.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {hidden ? '••••••' : rupees(data.perDay, 2).replace(/^Rs /, '')}
        </Text>
        <Text style={[styles.pkr, { color: p.muted }]}>PKR a day</Text>
      </View>

      <View style={[styles.list, { borderColor: line }]}>
        {rate.map((r, i) => (
          <View key={r.k} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: line }]}>
            <View style={{ flex: 1 }}>
              <Text variant="body">{r.k}</Text>
              <Text variant="caption" tone="muted">{r.sub}</Text>
            </View>
            <Text style={[styles.value, { color: p.ink }]}>{r.v}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.list, { borderColor: line }]}>
        {figures.map((f, i) => (
          <View key={f.k} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: line }]}>
            <View style={{ flex: 1 }}>
              <Text variant="body">{f.k}</Text>
              <Text variant="caption" tone="muted">{f.sub}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text variant="caption" tone="muted" style={styles.note}>
        Today, last night and yesterday are estimates at your average, the same counter as the web. This month is actual.
      </Text>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 2 },
  total: { fontFamily: font.numHeavy, fontSize: 34, lineHeight: 42, letterSpacing: -1, fontVariant: ['tabular-nums'], flexShrink: 1 },
  pkr: { fontFamily: font.semibold, fontSize: 13, marginBottom: 8 },
  list: { marginTop: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 54, paddingVertical: space.sm },
  value: { fontFamily: font.num, fontSize: 15, fontVariant: ['tabular-nums'] },
  note: { marginTop: space.md, marginBottom: space.sm },
});
