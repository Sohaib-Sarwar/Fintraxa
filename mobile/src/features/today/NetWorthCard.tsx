/**
 * Home's main card, a premium payment card (owner, 2026-11-14): contactless symbol top-left, the gold Fintraxa
 * mark top-right (where a card network's logo would be), the net worth as the one big, heavy figure, and
 * Mutual funds / PSX / Dividends in a lighter weight along the bottom like the card-holder fields.
 * Long-press the card to pick its design in a Google Wallet-style carousel (`CardPicker`).
 */
import { Image } from 'expo-image';
import { createContext, useContext, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { autoDecimals, compactNumber, group, isLong, MASK, money } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useApp } from '@/lib/store';
import { useHidden } from '@/ui/Figures';
import { Nfc } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { dark, font, light, space } from '@/ui/tokens';
import { CardArt, designOf, type CardDesignId } from './cardDesigns';
import { useCardPicker } from './cardPickerStore';

export const CARD_RATIO = 1.586; // ISO/IEC 7810 ID-1, a real card's shape
const INK = '#F5F5F3';
const INK2 = 'rgba(245,245,243,0.66)';
/** Ink on the card: light on the dark designs, dark on Platinum Silver. Read by things drawn on the card (aside). */
export type CardInk = { ink: string; ink2: string; line: string; shadow: boolean; pos: string; neg: string };
const LIGHT_INK: CardInk = { ink: INK, ink2: INK2, line: 'rgba(255,255,255,0.22)', shadow: true, pos: dark.pos, neg: dark.neg };
const DARK_INK: CardInk = { ink: '#141518', ink2: 'rgba(20,21,24,0.62)', line: 'rgba(0,0,0,0.18)', shadow: false, pos: light.pos, neg: light.neg };
const CardInkContext = createContext<CardInk>(LIGHT_INK);
export const useCardInk = () => useContext(CardInkContext);

/** `signed`: a gain/loss figure, shown green when positive and red when negative (owner, 2026-11-15). */
export type Holder = { label: string; value: number; onPress?: () => void; signed?: boolean };

function Figure({ value, size, weight, hidden, signed }: { value: number; size: number; weight: string; hidden: boolean; signed?: boolean }) {
  const c = useCardInk();
  const tint = signed && !hidden && value !== 0 ? (value > 0 ? c.pos : c.neg) : c.ink;
  const text = hidden ? MASK : isLong(value) ? compactNumber(value) : group(value, autoDecimals(value));
  return <Text style={[c.shadow && styles.shadow, { color: tint, fontFamily: weight, fontSize: size, lineHeight: size * 1.18, letterSpacing: size > 30 ? -1 : -0.2, fontVariant: ['tabular-nums'] }]}
    numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} accessibilityLabel={hidden ? 'Amount hidden' : money(value)}>{text}</Text>;
}

/** The card itself; also drawn by the design picker. Type and padding scale with the card's width. */
export function CardFace({ design, label, value, holders, width, hidden, onPress, onLongPress, aside, figure }: {
  design: CardDesignId; label: string; value: number; holders: Holder[]; width: number; hidden: boolean; onPress?: () => void; onLongPress?: () => void;
  /** Shown to the right of the big figure (Wallet: the change vs last month). */
  aside?: React.ReactNode;
  /** Draws the big figure itself at this size (Passive: the live counter repaints only itself, not the card). */
  figure?: (size: number) => React.ReactNode;
}) {
  const k = Math.min(1, width / 360);
  const c = designOf(design).ink === 'dark' ? DARK_INK : LIGHT_INK;
  const sh = c.shadow ? styles.shadow : null;
  return (
    <CardInkContext.Provider value={c}>
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} disabled={!onPress && !onLongPress}
      accessibilityRole="button" accessibilityHint={onLongPress ? 'Shows how net worth is calculated. Long-press to change the card design' : undefined}
      style={[styles.card, { width, height: width / CARD_RATIO, paddingHorizontal: space.xl * k, paddingVertical: space.lg * k, borderRadius: 22 * k }]}>
      <CardArt id={design} />
      <View style={styles.top}>
        <Nfc size={24 * k} color={c.ink2} strokeWidth={1.7} accessibilityLabel="Contactless" />
        {designOf(design).mark === false ? null
          : <Image source={require('../../../assets/mark.png')} style={{ width: 42 * k, height: 42 * k }} contentFit="contain" accessibilityLabel="Fintraxa" />}
      </View>
      <View>
        <Text style={[styles.label, sh, { fontSize: 13 * k, color: c.ink2 }]}>{label}</Text>
        <View style={styles.amountRow}>
          <View style={{ flexShrink: 1 }}>{figure ? figure(40 * k) : <Figure value={value} size={40 * k} weight={font.numHeavy} hidden={hidden} />}</View>
          <Text style={[styles.pkr, sh, { marginBottom: 8 * k, color: c.ink2 }]}>PKR</Text>
          {aside ? <View style={[styles.aside, { marginBottom: 6 * k }]}>{aside}</View> : null}
        </View>
      </View>
      {/* Holder fields: equal columns, hairline dividers, label over value, one baseline. */}
      <View style={styles.bottom}>
        {holders.map((h, i) => (
          <Pressable key={h.label} onPress={h.onPress} disabled={!h.onPress} hitSlop={6} accessibilityRole="button"
            accessibilityLabel={`${h.label}: ${money(h.value)}${h.onPress ? '. Open' : ''}`}
            style={({ pressed }) => [styles.holder, i > 0 && [styles.holderSep, { borderLeftColor: c.line }], { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.holderLabel, sh, { fontSize: 11.5 * k, color: c.ink2 }]} numberOfLines={1}>{h.label}</Text>
            <Figure value={h.value} size={16 * k} weight={font.numMedium} hidden={hidden} signed={h.signed} />
          </Pressable>
        ))}
      </View>
    </Pressable>
    </CardInkContext.Provider>
  );
}

export function NetWorthCard({ label, value, holders, onPress, aside }: { label: string; value: number; holders: Holder[]; onPress?: () => void; aside?: React.ReactNode }) {
  const hidden = useHidden();
  const design = useApp((s) => s.cardDesign);
  const open = useCardPicker((s) => s.open);
  const [w, setW] = useState(0);
  return (
    <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} style={!w ? { aspectRatio: CARD_RATIO } : null}>
      {w ? (
        <CardFace design={design} label={label} value={value} holders={holders} hidden={hidden} width={w} onPress={onPress} aside={aside}
          onLongPress={() => { haptic.light(); open({ label, value, holders: holders.map(({ label: l, value: v, signed: s }) => ({ label: l, value: v, signed: s })) }); }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', justifyContent: 'space-between', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: '#0A0A0B' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shadow: { textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  label: { color: INK2, fontFamily: font.medium, letterSpacing: 0.2 },
  amountRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  aside: { marginLeft: 'auto', paddingLeft: 4 },
  pkr: { color: INK2, fontFamily: font.semibold, fontSize: 13, letterSpacing: 0.6 },
  bottom: { flexDirection: 'row', alignItems: 'flex-end' },
  holder: { flex: 1, gap: 2, minWidth: 0 },
  holderSep: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(255,255,255,0.22)', paddingLeft: space.md, marginLeft: space.md },
  holderLabel: { color: INK2, fontFamily: font.medium, letterSpacing: 0.2 },
});
