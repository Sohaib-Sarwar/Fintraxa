/**
 * Black Apple-glass panel (owner, 2026-11-14), the same in both themes: near-black fading to black, a faint
 * sheen over the upper part and a softly lit top edge. Used for holdings, fund / stock pages and payment lists.
 * Text on it uses GLASS_INK / GLASS_INK2 (light), figures dark.pos / dark.neg.
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { glassLevels, LiquidLayers, useGlass } from './glass';
import { ChevronRight } from './icons';
import { Text } from './Text';
import { font, space } from './tokens';

export const GLASS_INK = '#F3F4F2';
export const GLASS_INK2 = 'rgba(243,244,242,0.6)';
export const GLASS_LINE = 'rgba(255,255,255,0.08)';

export function BlackGlass({ children, style, onPress, accessibilityLabel, liquid }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string;
  /** Always Liquid Glass here, whatever the Style setting (owner: the upload screens). */
  liquid?: boolean;
}) {
  // Glass style (Me › Appearance): Liquid Glass body, rim and sheen at the chosen transparency instead of black.
  const base = useGlass();
  const g = liquid && !base.on ? glassLevels(true, base.clear) : base;
  const radius = (StyleSheet.flatten(style)?.borderRadius as number | undefined) ?? 22;
  const body = (
    <>
      {g.on ? <LiquidLayers g={g} radius={radius} /> : (
        <>
          <LinearGradient colors={['#0A0A0B', '#000000']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.015)', 'rgba(255,255,255,0)']} locations={[0, 0.45, 1]} end={{ x: 0.6, y: 0.8 }}
            style={StyleSheet.absoluteFill} pointerEvents="none" />
        </>
      )}
      {children}
    </>
  );
  const look = [styles.glass, g.on && styles.liquid, style];
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [...look, { opacity: pressed ? 0.88 : 1 }]}>{body}</Pressable>
    );
  }
  return <View style={look}>{body}</View>;
}

/** A 2-column grid of figures on black glass: small label, figure, optional coloured sub-line. */
/** A 2-column figure grid; an item with `onPress` is tappable and shows a small chevron after its label. */
export function GlassStats({ items }: { items: { label: string; value: string; color?: string; sub?: string; subColor?: string; onPress?: () => void; onLongPress?: () => void; hint?: string }[] }) {
  return (
    <View style={styles.grid}>
      {items.map((it, i) => {
        const body = (
          <>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { flexShrink: 1 }]} numberOfLines={1}>{it.label}</Text>
              {it.onPress ? <ChevronRight size={12} color={GLASS_INK2} strokeWidth={2.4} /> : null}
            </View>
            <Text style={[styles.value, { color: it.color ?? GLASS_INK }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{it.value}</Text>
            {it.sub ? <Text style={[styles.label, { color: it.subColor ?? GLASS_INK2 }]} numberOfLines={1}>{it.sub}</Text> : null}
          </>
        );
        const cell = [styles.cell, i % 2 === 1 && styles.cellRight, i >= 2 && styles.cellTop];
        return it.onPress ? (
          <Pressable key={it.label} onPress={it.onPress} onLongPress={it.onLongPress} accessibilityRole="button" accessibilityLabel={`${it.label}, ${it.value}. Open`} accessibilityHint={it.hint}
            style={({ pressed }) => [...cell, { opacity: pressed ? 0.7 : 1 }]}>{body}</Pressable>
        ) : <View key={it.label} style={cell}>{body}</View>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  glass: {
    borderRadius: 22, overflow: 'hidden', paddingHorizontal: space.lg, paddingVertical: space.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderTopColor: 'rgba(255,255,255,0.20)',
  },
  liquid: { borderWidth: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', paddingVertical: space.sm, paddingRight: space.md, gap: 1 },
  cellRight: { paddingLeft: space.md, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: GLASS_LINE },
  cellTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  label: { color: GLASS_INK2, fontFamily: font.medium, fontSize: 11.5 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  value: { fontFamily: font.num, fontSize: 16, lineHeight: 21 },
});
