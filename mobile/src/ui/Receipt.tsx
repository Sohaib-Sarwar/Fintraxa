/**
 * A formal receipt on black Apple glass (owner, 2026-11-14: "click to see the formal invoice like web"), shared by
 * income / expense, fund entries and stock trades: icon or logo, title, the amount big (signed, green for money in),
 * a status line, a dashed tear line, then every detail as label / value rows, and a short reference at the foot.
 * `fill` (owner, 2026-11-15: "cover the available space, no scrolling"): the card takes the whole space it is given
 * and spreads its rows evenly down it, a little tighter, so a full receipt reads on one screen.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { BlackGlass, GLASS_INK, GLASS_INK2, GLASS_LINE } from './BlackGlass';
import { Text } from './Text';
import { dark, font, space } from './tokens';

export type ReceiptRow = { label: string; value: string };

export function Receipt({ icon, title, subtitle, amount, positive, status, rows, reference, fill = false }: {
  icon: ReactNode; title: string; subtitle?: string; amount: string; positive?: boolean; status?: string; rows: ReceiptRow[]; reference?: string; fill?: boolean;
}) {
  const list = rows.map((r, i) => (
    <View key={r.label} style={[styles.row, fill && styles.rowFill, i > 0 && styles.rowSep]}>
      <Text style={styles.label}>{r.label}</Text>
      <Text style={styles.value} numberOfLines={fill ? 2 : 3}>{r.value}</Text>
    </View>
  ));
  return (
    <BlackGlass style={[styles.card, fill && styles.cardFill]}>
      <View style={[styles.top, fill && { gap: 4 }]}>
        {icon}
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={styles.small} numberOfLines={1}>{subtitle}</Text> : null}
        <Text style={[styles.amount, { color: positive ? dark.pos : GLASS_INK }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{amount}</Text>
        {status ? <View style={styles.status}><Text style={styles.statusText}>{status}</Text></View> : null}
      </View>
      <View style={[styles.tear, fill && { marginVertical: space.md }]}>
        {Array.from({ length: 28 }, (_, i) => <View key={i} style={styles.dash} />)}
      </View>
      {fill ? <View style={styles.rowsFill}>{list}</View> : list}
      {reference ? <Text style={[styles.small, styles.ref, fill && { marginTop: space.sm }]}>Ref · {reference}</Text> : null}
    </BlackGlass>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space.xl },
  cardFill: { flex: 1, paddingVertical: space.lg },
  rowsFill: { flex: 1, justifyContent: 'space-evenly' },
  rowFill: { minHeight: 0, paddingVertical: 4, flexShrink: 1 },
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
