/**
 * Locked (owner, 2026-11-15: "the auto lock uses the same login wallpaper screen with fingerprint prompted"): the
 * sign-in landing's look — a portrait wallpaper, the Fintraxa mark and name, the fingerprint at the S24 Ultra sensor
 * spot — and the system fingerprint prompt opens by itself. Swipe up or tap the fingerprint to ask again; after a
 * cancel, "Use password" signs out to the password sheet (the bound key can't be read without the fingerprint).
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { pickBackdrop } from '@/features/auth/backdrops';
import { FingerprintGlyph } from '@/features/auth/FingerprintGlyph';
import { LogoLoader } from '@/features/auth/LogoLoader';
import { signOut, startAuth, useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { openVault } from '@/lib/vault';
import { ChevronUp } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { font, space } from '@/ui/tokens';
import { unlock } from './useSession';

const INK = '#FFFFFF';
/** Same spot as the sign-in landing (AuthScreen.tsx): the S24 Ultra sensor, ~16% of the screen height up. */
const SENSOR_FROM_BOTTOM = 0.16;

export function LockScreen() {
  const insets = useSafeAreaInsets();
  const [bg] = useState(pickBackdrop);
  const [fails, setFails] = useState(0);
  const [busy, setBusy] = useState(false);
  const asked = useRef(false);

  const tryUnlock = async () => {
    if (busy) return;
    setBusy(true);
    const r = await unlock().catch(() => 'cancelled' as const);
    setBusy(false);
    if (r === 'ok') haptic.success();
    else if (r === 'cancelled') { haptic.warning(); setFails((n) => n + 1); }
  };

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    tryUnlock();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- prompt once on mount

  /** Password route: open the vault without the fingerprint, sign out, and show sign-in. */
  const usePassword = async () => {
    await openVault({ biometric: false }).catch(() => {});
    await startAuth().catch(() => {});
    await signOut().catch(() => {});
    useAuth.setState({ locked: false, ready: true, notice: 'Sign in with your password. Fingerprint unlock can be turned back on in Me › Security.' });
  };

  const nudge = useSharedValue(0);
  useEffect(() => {
    nudge.set(withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) })), -1, false));
  }, [nudge]);
  const arrow = useAnimatedStyle(() => ({ transform: [{ translateY: -8 * nudge.get() }], opacity: 0.55 + 0.45 * nudge.get() }));
  const pan = usePanGesture({
    activeOffsetY: [-12, 12],
    onDeactivate: (e) => { 'worklet'; if (e.translationY < -80 || e.velocityY < -700) scheduleOnRN(tryUnlock); },
  });

  const sensorBottom = Math.round(Dimensions.get('screen').height * SENSOR_FROM_BOTTOM);
  return (
    <GestureDetector gesture={pan}>
      <View style={styles.root} accessibilityViewIsModal>
        <Image source={bg} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} accessibilityIgnoresInvertColors />
        <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.55)']} locations={[0, 0.3, 0.6, 1]} style={StyleSheet.absoluteFill} />

        <Animated.View entering={FadeIn.duration(500)} style={[styles.brand, { top: insets.top + 80 }]}>
          <LogoLoader size={72} loading={busy} />
          <Text style={styles.wordmark}>FINTRAXA</Text>
        </Animated.View>

        <Pressable onPress={tryUnlock} accessibilityRole="button" accessibilityLabel="Swipe up to unlock with fingerprint" style={[styles.swipe, { bottom: sensorBottom + 64 }]}>
          <Animated.View style={arrow}><ChevronUp size={26} color={INK} strokeWidth={2.2} /></Animated.View>
          <Text style={styles.swipeText}>Swipe up</Text>
        </Pressable>
        <Pressable onPress={tryUnlock} hitSlop={12} accessibilityRole="button" accessibilityLabel="Unlock with fingerprint" style={[styles.sensor, { bottom: sensorBottom - 30 }]}>
          <FingerprintGlyph size={42} color="rgba(255,255,255,0.9)" />
        </Pressable>

        {fails > 0 ? (
          <Pressable onPress={usePassword} hitSlop={10} accessibilityRole="button" style={[styles.password, { bottom: insets.bottom + space.lg }]}>
            <Text style={styles.passwordText}>Use password</Text>
          </Pressable>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#030604' },
  brand: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 6 },
  wordmark: { color: INK, fontFamily: font.semibold, fontSize: 15, lineHeight: 20, letterSpacing: 6, opacity: 0.92 },
  swipe: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 2 },
  swipeText: { color: INK, fontFamily: font.medium, fontSize: 13, lineHeight: 18, letterSpacing: 0.4, opacity: 0.85 },
  sensor: { position: 'absolute', alignSelf: 'center', width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  password: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  passwordText: { color: 'rgba(255,255,255,0.7)', fontFamily: font.medium, fontSize: 12.5, lineHeight: 18, textDecorationLine: 'underline' },
});
