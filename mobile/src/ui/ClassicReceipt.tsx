/**
 * The earlier receipt look, kept for stock trades, dividends and fund entries (owner, 2026-11-28: "undo the app
 * receipt format for stocks, divs, funds"; income / expense use the bank-style slip in Receipt.tsx).
 * A formal receipt on black Apple glass (owner, 2026-11-14: "click to see the formal invoice like web"), shared by
 * income / expense, fund entries, stock trades and dividends: icon or logo, title, the amount big (signed, green for
 * money in), one status line, a dashed tear line, then the financial details as label / value rows, and a short
 * reference at the foot.
 * `fill` (owner, 2026-11-15: "cover the available space, no scrolling"): the card takes the whole space it is given
 * and spreads its rows evenly down it. On a short screen or with large system fonts the rows scroll inside the card
 * instead of overflowing it (owner, 2026-11-26: receipts overflowed).
 * Rows: a long label or value wraps to two lines at most, never past the card; `strong` marks the total.
 */
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { BlackGlass, GLASS_INK, GLASS_INK2, GLASS_LINE } from './BlackGlass';
import { CaptureSafe } from './Logos';
import type { ReceiptRow } from './Receipt';
import { Text } from './Text';
import { dark, font, space } from './tokens';

export function ClassicReceipt({ icon, title, subtitle, amount, positive, status, rows, reference, fill = false }: {
  icon: ReactNode; title: string; subtitle?: string; amount: string; positive?: boolean; status?: string; rows: ReceiptRow[]; reference?: string; fill?: boolean;
}) {
  const shown = rows.filter((r) => r.value !== '' && r.value !== null && r.value !== undefined);
  const list = shown.map((r, i) => (
    <View key={r.label} style={[styles.row, fill && styles.rowFill, i > 0 && styles.rowSep, r.strong && styles.rowStrong]}
      accessible accessibilityLabel={`${r.label}: ${r.value}`}>
      <Text style={[styles.label, r.strong && styles.labelStrong]} numberOfLines={2}>{r.label}</Text>
      <Text style={[styles.value, r.strong && styles.valueStrong]} numberOfLines={2}>{r.value}</Text>
    </View>
  ));
  return (
    <CaptureSafe.Provider value>
    <BlackGlass style={[styles.card, fill && styles.cardFill]}>
      <View style={[styles.top, fill && { gap: 4 }]}>
        {icon}
        <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
        <Text style={[styles.amount, { color: positive ? dark.pos : GLASS_INK }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{amount}</Text>
        {status ? <View style={styles.status}><Text style={styles.statusText} numberOfLines={1}>{status}</Text></View> : null}
      </View>
      <View style={[styles.tear, fill && { marginVertical: space.md }]}>
        {Array.from({ length: 28 }, (_, i) => <View key={i} style={styles.dash} />)}
      </View>
      {fill ? (
        <ScrollView style={styles.rowsScroll} contentContainerStyle={styles.rowsFill} showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never">
          {list}
        </ScrollView>
      ) : list}
      {reference ? <Text style={[styles.small, styles.ref, fill && { marginTop: space.sm }]} numberOfLines={1}>Ref · {reference}</Text> : null}
    </BlackGlass>
    </CaptureSafe.Provider>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space.xl },
  cardFill: { flex: 1, paddingVertical: space.lg },
  rowsScroll: { flex: 1 },
  rowsFill: { flexGrow: 1, justifyContent: 'space-evenly' },
  rowFill: { minHeight: 40, paddingVertical: 4 },
  top: { alignItems: 'center', gap: 6 },
  title: { color: GLASS_INK, fontFamily: font.bold, fontSize: 17, lineHeight: 22, textAlign: 'center', marginTop: 4, maxWidth: '100%' },
  subtitle: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12, lineHeight: 16, textAlign: 'center', maxWidth: '92%' },
  small: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12 },
  amount: { fontFamily: font.numHeavy, fontSize: 34, lineHeight: 41, letterSpacing: -0.8, marginTop: 6, maxWidth: '100%' },
  status: { maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' },
  statusText: { color: GLASS_INK2, fontFamily: font.semibold, fontSize: 11.5 },
  tear: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: space.lg, overflow: 'hidden' },
  dash: { width: 6, height: 1.5, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.16)' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, minHeight: 44, paddingVertical: 6 },
  rowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  rowStrong: { borderTopColor: 'rgba(255,255,255,0.18)' },
  label: { flexShrink: 1, maxWidth: '50%', color: GLASS_INK2, fontFamily: font.medium, fontSize: 13, lineHeight: 17 },
  labelStrong: { color: GLASS_INK, fontFamily: font.semibold },
  value: { flex: 1, color: GLASS_INK, fontFamily: font.semibold, fontSize: 13.5, lineHeight: 18, textAlign: 'right' },
  valueStrong: { fontFamily: font.numBold, fontSize: 15, lineHeight: 20 },
  ref: { textAlign: 'center', marginTop: space.lg },
});
