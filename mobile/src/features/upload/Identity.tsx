/**
 * What the document is, revealed in order (owner, 2026-11-15: "show me through animation what doc is it, what AMC or
 * broker, what fund"): the document type, then the broker / AMC / CDC mark zooms in with its name, then each fund or
 * stock found slides in one after another. Eased, no bounce. Static (no delays) when `animate` is false.
 */
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { BlackGlass, GLASS_INK, GLASS_INK2 } from '@/ui/BlackGlass';
import { CandlestickChart, FileText, HandCoins, LineChart } from '@/ui/icons';
import { AmcLogo, BrokerLogo, StockLogo } from '@/ui/Logos';
import { Text } from '@/ui/Text';
import { font, space } from '@/ui/tokens';

export type DocKind = 'trades' | 'dividends' | 'fund';
export const DOC_LABEL: Record<DocKind, string> = { trades: 'Trade confirmation', dividends: 'Dividend report', fund: 'Fund statement' };
const DOC_ICON = { trades: CandlestickChart, dividends: HandCoins, fund: LineChart } as const;
const EASE = Easing.bezier(0.2, 0, 0, 1);

/** The mutual-fund entry types in plain words (the web's mfLabels TYPE_LABEL). */
export const TYPE_LABEL: Record<string, string> = {
  purchase: 'Purchase', redemption: 'Redemption', switch_in: 'Switch in', switch_out: 'Switch out',
  transfer_in: 'Transfer in', transfer_out: 'Transfer out', dividend_cash: 'Cash dividend',
  dividend_reinvest: 'Dividend reinvested', bonus_units: 'Bonus units', capital_refund_units: 'Refund of capital',
  cgt_deduction: 'CGT deducted', cgt_reversal: 'CGT reversal', cgt_refund_cash: 'CGT refund (cash)',
  cgt_refund_reinvest: 'CGT refund (units)', zakat_deduction: 'Zakat', wht_deduction: 'Withholding tax',
  sales_load: 'Sales load', fee_charge: 'Fee / charge', other_adjustment: 'Adjustment', unknown: 'Unclassified',
};

const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bAmc\b/g, 'AMC');

export function Identity({ kind, source, items, pages, fileName, animate = true }: {
  kind: DocKind; source: { code: string; name: string }; items: string[]; pages?: number; fileName?: string; animate?: boolean;
}) {
  const Icon = DOC_ICON[kind];
  const d = (ms: number) => (animate ? ms : 0);
  const shown = items.slice(0, 6);
  return (
    <BlackGlass style={styles.card}>
      <Animated.View entering={animate ? FadeIn.duration(240).easing(EASE) : undefined} style={styles.kindRow}>
        <Icon size={14} color={GLASS_INK2} />
        <Text style={styles.kind}>{DOC_LABEL[kind]}{pages ? ` · ${pages} page${pages === 1 ? '' : 's'}` : ''}</Text>
      </Animated.View>
      <View style={styles.sourceRow}>
        <Animated.View entering={animate ? ZoomIn.duration(320).delay(d(180)).easing(EASE) : undefined}>
          {kind === 'trades' ? <BrokerLogo code={source.code} size={52} />
            : kind === 'fund' ? <AmcLogo code={source.code} name={source.name} size={52} />
              : <View style={styles.cdc}><Text style={styles.cdcText}>CDC</Text></View>}
        </Animated.View>
        <Animated.View entering={animate ? FadeInDown.duration(300).delay(d(320)).easing(EASE) : undefined} style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={2}>{source.name}</Text>
          {fileName ? <Text style={styles.file} numberOfLines={1}><FileText size={11} color={GLASS_INK2} /> {fileName}</Text> : null}
        </Animated.View>
      </View>
      {shown.length ? (
        <View style={styles.items}>
          {shown.map((it, i) => (
            <Animated.View key={`${it}-${i}`} entering={animate ? FadeInDown.duration(260).delay(d(480 + i * 90)).easing(EASE) : undefined} style={styles.item}>
              {kind === 'fund' ? <View style={styles.dot} /> : <StockLogo symbol={it} size={18} />}
              <Text style={styles.itemText} numberOfLines={1}>{kind === 'fund' ? titleCase(it) : it}</Text>
            </Animated.View>
          ))}
          {items.length > shown.length ? (
            <Animated.View entering={animate ? FadeIn.duration(200).delay(d(480 + shown.length * 90)) : undefined} style={styles.item}>
              <Text style={styles.itemText}>+{items.length - shown.length} more</Text>
            </Animated.View>
          ) : null}
        </View>
      ) : null}
    </BlackGlass>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md, paddingVertical: space.lg },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kind: { color: GLASS_INK2, fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.3, textTransform: 'uppercase' },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { color: GLASS_INK, fontFamily: font.bold, fontSize: 18, letterSpacing: -0.2 },
  file: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 11.5, marginTop: 2 },
  cdc: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  cdcText: { color: GLASS_INK, fontFamily: font.bold, fontSize: 13 },
  items: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', maxWidth: '100%' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  itemText: { color: GLASS_INK, fontFamily: font.medium, fontSize: 12.5, flexShrink: 1 },
});
