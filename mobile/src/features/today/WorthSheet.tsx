/**
 * What Home's card opens (owner, 2026-11-14: "only the important text", dark Apple glass from the bottom): the
 * net-worth total, then Mutual funds, PSX and Dividends with their share of the total, and one short line.
 * Smoky glass sheet that follows the finger (`GlassSheet` → `SheetFrame`), drawn by the tabs layout.
 */
import type { ComponentRef, RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { autoDecimals, compactNumber, group, isLong } from '@/lib/format';
import { GlassSheet } from '@/ui/GlassSheet';
import { Money, useHidden } from '@/ui/Figures';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { font, space } from '@/ui/tokens';
import { useWorthSheet } from './worthSheetStore';

export function WorthSheet({ blurTarget }: { blurTarget: RefObject<ComponentRef<typeof View> | null> }) {
  const p = useTheme();
  const hidden = useHidden();
  const data = useWorthSheet((s) => s.data);
  const close = useWorthSheet((s) => s.close);
  if (!data) return null;
  const rows = [
    ...(data.funds !== null ? [{ k: 'Mutual funds', v: data.funds }] : []),
    ...(data.stocks !== null ? [{ k: 'PSX shares', v: data.stocks }] : []),
    ...(data.dividends !== null ? [{ k: `Dividends · ${data.period}`, v: data.dividends }] : []),
  ];
  const line = p.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  return (
    <GlassSheet blurTarget={blurTarget} onClose={close} smoky maxHeight={0.6}>
      <Text variant="caption" tone="muted">Net worth</Text>
      <View style={styles.totalRow}>
        <Text style={[styles.total, { color: p.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {hidden ? '••••••' : isLong(data.total) ? compactNumber(data.total) : group(data.total, autoDecimals(data.total))}
        </Text>
        <Text style={[styles.pkr, { color: p.muted }]}>PKR</Text>
      </View>
      <View style={[styles.list, { borderColor: line }]}>
        {rows.map((r, i) => {
          const pct = data.total > 0 ? Math.round((r.v / data.total) * 100) : 0;
          return (
            <View key={r.k} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: line }]}>
              <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>{r.k}</Text>
              <Text variant="caption" tone="muted" style={styles.pct}>{hidden ? '' : `${pct}%`}</Text>
              <Money value={r.v} variant="num" />
            </View>
          );
        })}
      </View>
      <Text variant="caption" tone="muted" style={styles.note}>Holdings at the latest prices, plus dividends received. Bank cash isn’t included.</Text>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 2 },
  total: { fontFamily: font.numHeavy, fontSize: 34, lineHeight: 42, letterSpacing: -1, fontVariant: ['tabular-nums'], flexShrink: 1 },
  pkr: { fontFamily: font.semibold, fontSize: 13, marginBottom: 8 },
  list: { marginTop: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 50 },
  pct: { fontFamily: font.numMedium, minWidth: 36, textAlign: 'right' },
  note: { marginTop: space.md, marginBottom: space.sm },
});
