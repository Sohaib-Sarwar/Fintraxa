/**
 * A formal receipt on black Apple glass (owner, 2026-11-14: "click to see the formal invoice like web"), shared by
 * income / expense, fund entries and stock trades: icon or logo, title, the amount big (signed, green for money in),
 * a status line, a dashed tear line, then every detail as label / value rows, and a short reference at the foot.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { BlackGlass, GLASS_INK, GLASS_INK2, GLASS_LINE } from './BlackGlass';
import { Text } from './Text';
import { dark, font, space } from './tokens';

export type ReceiptRow = { label: string; value: string };

export function Receipt({ icon, title, subtitle, amount, positive, status, rows, reference }: {
  icon: ReactNode; title: string; subtitle?: string; amount: string; positive?: boolean; status?: string; rows: ReceiptRow[]; reference?: string;
}) {
  return (
    <BlackGlass style={styles.card}>
      <View style={styles.top}>
        {icon}
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={styles.small} numberOfLines={1}>{subtitle}</Text> : null}
        <Text style={[styles.amount, { color: positive ? dark.pos : GLASS_INK }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{amount}</Text>
        {status ? <View style={styles.status}><Text style={styles.statusText}>{status}</Text></View> : null}
      </View>
      <View style={styles.tear}>
        {Array.from({ length: 28 }, (_, i) => <View key={i} style={styles.dash} />)}
      </View>
      {rows.map((r, i) => (
        <View key={r.label} style={[styles.row, i > 0 && styles.rowSep]}>
          <Text style={styles.label}>{r.label}</Text>
          <Text style={styles.value} numberOfLines={3}>{r.value}</Text>
        </View>
      ))}
      {reference ? <Text style={[styles.small, styles.ref]}>Ref · {reference}</Text> : null}
    </BlackGlass>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space.xl },
  top: { alignItems: 'center', gap: 6 },
  title: { color: GLASS_INK, fontFamily: font.bold, fontSize: 17, lineHeight: 22, textAlign: 'center', marginTop: 4 },
  small: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12 },
  amount: { fontFamily: font.numHeavy, fontSize: 34, lineHeight: 41, letterSpacing: -0.8, marginTop: 6 },
  status: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' },
  statusText: { color: GLASS_INK2, fontFamily: font.semibold, fontSize: 11.5 },
  tear: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: space.lg, overflow: 'hidden' },
  dash: { width: 6, height: 1.5, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.16)' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.lg, minHeight: 44, paddingVertical: 6 },
  rowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  label: { color: GLASS_INK2, fontFamily: font.medium, fontSize: 13 },
  value: { flexShrink: 1, color: GLASS_INK, fontFamily: font.semibold, fontSize: 13.5, textAlign: 'right' },
  ref: { textAlign: 'center', marginTop: space.lg },
});
