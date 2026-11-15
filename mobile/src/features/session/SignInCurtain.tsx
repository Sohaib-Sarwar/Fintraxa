/**
 * Sign-in → Home without a half-loaded page in between (owner, 2026-11-15: "after a fingerprint login I briefly see
 * 'Nothing tracked'; keep the login loader until Home is ready, then open it instantly and smoothly").
 *
 * When a sign-in starts, the sign-in landing's look (same wallpaper, the Fintraxa mark animating) is laid over the
 * whole app. Home calls `markHomeReady()` once its figures are on screen (from the cache that's the first frame);
 * the curtain then zooms slightly and fades — like unlocking an iPhone — revealing a finished Home. If Home takes
 * longer than 8 s (no cache and a slow network) the curtain lifts anyway and Home shows its placeholders.
 * The same `ready` flag lets the cold-start splash wait for Home (app/_layout.tsx).
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { create } from 'zustand';
import { LogoLoader } from '@/features/auth/LogoLoader';
import { Text } from '@/ui/Text';
import { font } from '@/ui/tokens';

type Curtain = { source: number | null; ready: boolean; show: (source: number) => void; clear: () => void };
export const useCurtain = create<Curtain>()((set) => ({
  source: null,
  ready: false,
  show: (source) => set({ source, ready: false }),
  clear: () => set({ source: null }),
}));

/** Home has painted real content (or knows there is none). */
export const markHomeReady = () => { if (!useCurtain.getState().ready) useCurtain.setState({ ready: true }); };

const MAX_WAIT_MS = 8000;

export function SignInCurtain() {
  const source = useCurtain((s) => s.source);
  if (!source) return null;
  return <CurtainView source={source} />;
}

function CurtainView({ source }: { source: number }) {
  const insets = useSafeAreaInsets();
  const ready = useCurtain((s) => s.ready);
  const k = useSharedValue(0); // 0 = covering, 1 = gone

  useEffect(() => {
    const t = setTimeout(markHomeReady, MAX_WAIT_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const clear = () => useCurtain.getState().clear();
    k.set(withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }, (done) => { if (done) scheduleOnRN(clear); }));
  }, [ready, k]);

  const style = useAnimatedStyle(() => ({ opacity: 1 - k.get(), transform: [{ scale: 1 + 0.08 * k.get() }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, style]} pointerEvents={ready ? 'none' : 'auto'} accessibilityLabel="Signing in" accessibilityLiveRegion="polite">
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
      <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.55)']} locations={[0, 0.3, 0.6, 1]} style={StyleSheet.absoluteFill} />
      {/* Exactly where the landing draws the mark, so the hand-over is seamless. */}
      <View style={[styles.brand, { top: insets.top + 80 }]}>
        <LogoLoader size={72} loading />
        <Text style={styles.wordmark} numberOfLines={1}>FINTRAXA</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#030604', zIndex: 40, elevation: 40 },
  brand: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 6 },
  wordmark: { alignSelf: 'stretch', textAlign: 'center', color: '#FFFFFF', fontFamily: font.semibold, fontSize: 15, lineHeight: 20, letterSpacing: 6, opacity: 0.92 },
});
