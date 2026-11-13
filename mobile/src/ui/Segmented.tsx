import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import { Text } from './Text';
import { useTheme } from './theme';

type Option<T extends string> = { value: T; label: string };

/** Segmented control with a sliding thumb (UI-thread spring) and a light tick on change. */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: {
  options: Option<T>[]; value: T; onChange: (v: T) => void; accessibilityLabel: string;
}) {
  const p = useTheme();
  const [w, setW] = useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const seg = w / options.length;
  const thumb = useAnimatedStyle(() => ({ width: seg - 4, transform: [{ translateX: withSpring(idx * seg + 2, { damping: 22, stiffness: 280 }) }] }), [idx, seg]);
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: p.surface2, borderColor: p.border }]}>
      {w > 0 ? <Animated.View style={[styles.thumb, { backgroundColor: p.mode === 'dark' ? p.surface3 : p.surface }, p.mode === 'light' && styles.lift, thumb]} /> : null}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label}
            onPress={() => { if (!on) { haptic.tick(); onChange(o.value); } }} style={styles.item}>
            <Text variant="label" tone={on ? 'ink' : 'ink2'} weight={on ? 'Inter_600SemiBold' : undefined}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', height: 40, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 0, position: 'relative' },
  thumb: { position: 'absolute', top: 2, bottom: 2, borderRadius: 10 },
  lift: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
