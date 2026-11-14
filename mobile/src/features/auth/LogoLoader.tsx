/**
 * The Fintraxa mark as its own loader (owner, 2026-11-15: "lazy loader of Fintraxa logo itself"): the mark breathes
 * softly while a thin arc of light circles it. Idle (`loading` false) it is just the mark. Eased, no bounce; UI thread.
 */
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

export function LogoLoader({ size = 84, loading = false }: { size?: number; loading?: boolean }) {
  const breathe = useSharedValue(0);
  const spin = useSharedValue(0);
  const ring = useSharedValue(0);
  useEffect(() => {
    if (loading) {
      ring.set(withTiming(1, { duration: 260 }));
      breathe.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true));
      spin.set(0);
      spin.set(withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1, false));
    } else {
      ring.set(withTiming(0, { duration: 220 }));
      cancelAnimation(breathe);
      cancelAnimation(spin);
      breathe.set(withTiming(0, { duration: 300 }));
    }
  }, [loading, breathe, spin, ring]);

  const markStyle = useAnimatedStyle(() => ({ opacity: 1 - 0.3 * breathe.get(), transform: [{ scale: 1 - 0.05 * breathe.get() }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.get(), transform: [{ rotate: `${spin.get() * 360}deg` }] }));
  const box = size * 1.42;
  const r = box / 2 - 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }} accessibilityRole={loading ? 'progressbar' : 'image'}
      accessibilityLabel={loading ? 'Signing in' : 'Fintraxa'}>
      <Animated.View style={[StyleSheet.absoluteFill, ringStyle]} pointerEvents="none">
        <Svg width={box} height={box}>
          <Defs>
            <LinearGradient id="arc" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Circle cx={box / 2} cy={box / 2} r={r} stroke="rgba(255,255,255,0.10)" strokeWidth={1.5} fill="none" />
          <Circle cx={box / 2} cy={box / 2} r={r} stroke="url(#arc)" strokeWidth={2} fill="none" strokeLinecap="round" strokeDasharray={`${c * 0.28} ${c}`} />
        </Svg>
      </Animated.View>
      <Animated.View style={markStyle}>
        <Image source={require('../../../assets/mark.png')} style={{ width: size, height: size }} contentFit="contain" />
      </Animated.View>
    </View>
  );
}
