import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';
import { GLASS_INK, GLASS_INK2 } from '@/ui/BlackGlass';
import { AlertTriangle, Check, FileText, X } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { alpha, dark, font, space } from '@/ui/tokens';

export type StepState = 'pending' | 'active' | 'done' | 'warn' | 'error';
export type Step = { id: string; label: string; state: StepState; detail?: string | null };

/** Black-glass document with a scan line sweeping over it while working; a check / cross badge at the end. */
export function ScanDoc({ state }: { state: 'working' | 'done' | 'error' }) {
  const p = useTheme();
  const y = useSharedValue(0);
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (state === 'working') {
      y.set(withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, true));
      pulse.set(withRepeat(withSequence(withTiming(1.06, { duration: 700 }), withTiming(1, { duration: 700 })), -1, false));
    } else {
      y.set(withTiming(0, { duration: 200 }));
      pulse.set(withTiming(1, { duration: 200 }));
    }
  }, [state, y, pulse]);
  const line = useAnimatedStyle(() => ({ transform: [{ translateY: 10 + y.get() * 78 }], opacity: state === 'working' ? 1 : 0 }));
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: pulse.get() }] }));
  const tint = state === 'error' ? dark.neg : p.accentOnDark;
  return (
    <View style={styles.scanWrap}>
      <Animated.View style={[styles.halo, { backgroundColor: alpha(tint, 0.14) }, halo]} />
      <View style={styles.doc}>
        <FileText size={42} color={tint} strokeWidth={1.5} />
        <Animated.View style={[styles.scanLine, { backgroundColor: tint, shadowColor: tint }, line]} />
      </View>
      {state !== 'working' ? (
        <Animated.View entering={ZoomIn.duration(220)} style={[styles.badge, { backgroundColor: state === 'done' ? dark.pos : dark.neg, borderColor: p.bg }]}>
          {state === 'done' ? <Check size={18} color="#04150C" strokeWidth={3} /> : <X size={18} color="#FFFFFF" strokeWidth={3} />}
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Live checklist for black glass: each step slides in when it starts; spinner → check (or warning). */
export function StepList({ steps }: { steps: Step[] }) {
  const p = useTheme();
  return (
    <View accessibilityLiveRegion="polite">
      {steps.filter((s) => s.state !== 'pending').map((s) => {
        // Minimal (owner: icons, not coloured text): done = a quiet white check; only warnings and errors take colour.
        const c = s.state === 'done' ? GLASS_INK : s.state === 'warn' ? dark.warn : s.state === 'error' ? dark.neg : p.accentOnDark;
        return (
          <Animated.View key={s.id} entering={FadeInDown.duration(260)} style={styles.step}>
            <View style={[styles.stepIcon, { backgroundColor: s.state === 'done' ? 'rgba(255,255,255,0.08)' : alpha(c, 0.14) }]}>
              {s.state === 'active' ? <ActivityIndicator size="small" color={c} />
                : s.state === 'done' ? <Check size={15} color={c} strokeWidth={3} />
                  : s.state === 'warn' ? <AlertTriangle size={14} color={c} /> : <X size={15} color={c} strokeWidth={3} />}
            </View>
            <Text style={styles.stepLabel} numberOfLines={1}>{s.label}</Text>
            {s.detail ? <Text style={styles.stepDetail} numberOfLines={1}>{s.detail}</Text> : null}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scanWrap: { alignSelf: 'center', width: 140, height: 140, alignItems: 'center', justifyContent: 'center', marginVertical: space.md },
  halo: { position: 'absolute', width: 140, height: 140, borderRadius: 70 },
  doc: {
    width: 80, height: 100, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderTopColor: 'rgba(255,255,255,0.22)',
    backgroundColor: '#0A0A0B', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  scanLine: { position: 'absolute', top: 0, left: 8, right: 8, height: 3, borderRadius: 2, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  badge: { position: 'absolute', right: 24, bottom: 16, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 46 },
  stepIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { color: GLASS_INK, fontFamily: font.medium, fontSize: 14 },
  stepDetail: { flex: 1, textAlign: 'right', color: GLASS_INK2, fontFamily: font.regular, fontSize: 12 },
});
