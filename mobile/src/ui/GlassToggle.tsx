/**
 * Glass switch (owner's `small swicth buttons UI.jpg` + the web's `Seg` glass tokens): a frosted capsule with a lit
 * bottom edge and one glassy thumb that glides to the chosen option (eased, no bounce). Icon options, e.g. the Home
 * chart's donut | bars switch from `PIE CHART UI.jpg`, or text options (the pie's All | Funds | Stocks).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import type { LucideIcon } from './icons';
import { Text } from './Text';
import { useTheme } from './theme';
import { font } from './tokens';

const ICON_SEG = 44;
const TEXT_SEG = 74;
const H = 36;
const PAD = 3;

export function GlassToggle<T extends string>({ options, value, onChange, accessibilityLabel }: {
  options: { value: T; icon?: LucideIcon; label: string }[]; value: T; onChange: (v: T) => void; accessibilityLabel: string;
}) {
  const p = useTheme();
  const dark = p.mode === 'dark';
  const SEG = options.every((o) => o.icon) ? ICON_SEG : TEXT_SEG;
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const x = useSharedValue(idx * SEG);
  useEffect(() => { x.set(withTiming(idx * SEG, { duration: 320, easing: Easing.bezier(0.3, 0.7, 0.2, 1) })); }, [idx, x, SEG]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}
      style={[styles.wrap, {
        borderColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(16,20,12,0.10)',
        borderBottomColor: dark ? 'rgba(255,255,255,0.22)' : 'rgba(16,20,12,0.16)',
      }]}>
      <LinearGradient colors={dark ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)'] : ['rgba(255,255,255,0.95)', 'rgba(236,238,241,0.95)']}
        style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.thumb, { width: SEG }, thumb, { borderColor: dark ? 'rgba(255,255,255,0.14)' : 'rgba(16,20,12,0.08)' }]}>
        <LinearGradient colors={dark ? ['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.07)'] : ['#FFFFFF', '#E6E9E2']} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label} hitSlop={4}
            onPress={() => { if (!on) { haptic.tick(); onChange(o.value); } }} style={[styles.seg, { width: SEG }]}>
            {o.icon ? <o.icon size={18} color={on ? p.ink : p.muted} strokeWidth={on ? 2.3 : 2} />
              : <Text variant="label" style={{ color: on ? p.ink : p.muted, fontFamily: font.semibold, fontSize: 12.5 }} numberOfLines={1}>{o.label}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', padding: PAD, borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
  thumb: { position: 'absolute', top: PAD, left: PAD, height: H, borderRadius: H / 2, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  seg: { height: H, alignItems: 'center', justifyContent: 'center' },
});
