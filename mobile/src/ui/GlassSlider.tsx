/**
 * A glass slider (0…1): frosted track, accent fill, a glassy thumb that follows the finger. Used for the Liquid
 * Glass transparency in Me. Reports on every move (`onChange`) so surfaces update live.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { haptic } from '@/lib/haptics';
import { useTheme } from './theme';

const THUMB = 26;

export function GlassSlider({ value, onChange, accessibilityLabel, steps = 20 }: {
  value: number; onChange: (v: number) => void; accessibilityLabel: string; steps?: number;
}) {
  const p = useTheme();
  const [w, setW] = useState(0);
  const last = useRef(value);
  const pick = (e: GestureResponderEvent) => {
    if (w <= THUMB) return;
    const x = e.nativeEvent.locationX - THUMB / 2;
    const v = Math.round(Math.min(1, Math.max(0, x / (w - THUMB))) * steps) / steps;
    if (v !== last.current) { last.current = v; haptic.tick(); onChange(v); }
  };
  const left = Math.max(0, (w - THUMB) * value);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={styles.wrap}
      onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderTerminationRequest={() => false}
      onResponderGrant={pick} onResponderMove={pick}
      accessible accessibilityRole="adjustable" accessibilityLabel={accessibilityLabel} accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(Math.min(1, Math.max(0, value + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1))))}>
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: left + THUMB / 2, backgroundColor: p.accentOnDark }]} />
      </View>
      <View style={[styles.thumb, { left }]} pointerEvents="none">
        <LinearGradient colors={['rgba(255,255,255,0.95)', 'rgba(220,222,226,0.9)']} style={StyleSheet.absoluteFill} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 36, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden', marginHorizontal: 2 },
  fill: { height: 6, borderRadius: 3 },
  thumb: {
    position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
});
