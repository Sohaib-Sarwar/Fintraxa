/**
 * A price's details (tap or long-press a stock's last price or a fund's NAV; owner, 2026-11-22): the price, the day it
 * is for, when it was fetched and where from — three rows, nothing else. Wording from @core/market/priceStamp.js.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { PriceStamp } from '@/data/engines';
import { GLASS_INK, GLASS_INK2, GLASS_LINE } from './BlackGlass';
import { CalendarDays, Clock, Globe, type LucideIcon } from './icons';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { dark, font, space } from './tokens';

export function PriceStampSheet({ stamp, logo, onClose }: { stamp: PriceStamp | null; logo?: ReactNode; onClose: () => void }) {
  return (
    <Sheet open={!!stamp} onClose={onClose} maxHeight={0.55}>
      {stamp ? (
        <View style={styles.body}>
          <View style={styles.head}>
            {logo}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name} numberOfLines={1}>{stamp.name}</Text>
              <Text style={styles.label}>{stamp.label}</Text>
            </View>
          </View>
          <Text style={styles.price} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{stamp.price}</Text>
          <View style={styles.group}>
            <Line icon={CalendarDays} label="Price date" value={stamp.forDate ?? '—'} first />
            <Line icon={Clock} label="Fetched" value={stamp.fetched ?? '—'} />
            <Line icon={Globe} label="Source" value={stamp.source} />
          </View>
          {stamp.note ? <Text style={styles.note}>{stamp.note}</Text> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

function Line({ icon: Icon, label, value, first }: { icon: LucideIcon; label: string; value: string; first?: boolean }) {
  return (
    <View style={[styles.line, !first && styles.lineSep]} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.iconWrap}><Icon size={15} color={GLASS_INK2} strokeWidth={2.2} /></View>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 16 },
  label: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12.5, marginTop: 1 },
  price: { color: GLASS_INK, fontFamily: font.numBold, fontSize: 34, letterSpacing: -0.8, marginTop: space.md, marginBottom: space.md, fontVariant: ['tabular-nums'] },
  group: { borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48 },
  lineSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  iconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  lineLabel: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 13.5 },
  lineValue: { flex: 1, textAlign: 'right', color: GLASS_INK, fontFamily: font.medium, fontSize: 14 },
  note: { color: dark.warn, fontFamily: font.regular, fontSize: 12.5, marginTop: space.sm, marginLeft: 4 },
});
