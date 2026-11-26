/**
 * "Still there?" (banking-app pattern, 2026-11-26): 30 seconds before an idle lock / sign-out, a dimmed overlay with
 * the countdown and two choices. Any tap on it keeps the session (markActive); the timers live in useSession.ts.
 * Drawn over everything except the lock screen; announced to TalkBack as an alert.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { countdown } from '@core/session/policy.js';
import { markActive, useIdle } from '@/lib/activity';
import { autoLock, useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { useApp } from '@/lib/store';
import { BlackGlass, GLASS_INK, GLASS_INK2 } from '@/ui/BlackGlass';
import { Timer } from '@/ui/icons';
import { Button } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { font, space } from '@/ui/tokens';

export function IdleWarning() {
  const warnUntil = useIdle((s) => s.warnUntil);
  const signedIn = useAuth((s) => !!s.session && !s.locked);
  const locks = useApp((s) => s.biometricEnabled);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (warnUntil === null) return undefined;
    haptic.light();
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [warnUntil]);

  if (warnUntil === null || !signedIn) return null;
  const left = Math.max(0, warnUntil - now);
  const stay = () => { haptic.tick(); markActive(); };

  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={StyleSheet.absoluteFill}>
      <Pressable style={styles.dim} onPress={stay} accessibilityLabel="Stay signed in" />
      <View style={styles.center} pointerEvents="box-none">
        <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.wrap}>
        <BlackGlass liquid style={styles.card}>
          <View style={styles.icon}><Timer size={24} color={GLASS_INK} strokeWidth={2} /></View>
          <Text style={styles.title}>Still there?</Text>
          <Text style={styles.body}>
            For your security, Fintraxa will {locks ? 'lock' : 'sign you out'} in
          </Text>
          <Text style={styles.count} accessibilityLabel={`${Math.ceil(left / 1000)} seconds`}>{countdown(left)}</Text>
          <View style={styles.actions}>
            <Button label={locks ? 'Lock now' : 'Sign out'} kind="secondary" style={{ flex: 1 }} onPress={() => { haptic.light(); autoLock('idle'); }} />
            <Button label={locks ? 'Keep using' : 'Stay signed in'} style={{ flex: 1.4 }} onPress={stay} />
          </View>
        </BlackGlass>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.62)' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  wrap: { width: '100%', maxWidth: 380 },
  card: { width: '100%', maxWidth: 380, alignItems: 'center', paddingVertical: space.xl, paddingHorizontal: space.lg, gap: space.xs },
  icon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: space.sm },
  title: { color: GLASS_INK, fontFamily: font.bold, fontSize: 21, textAlign: 'center' },
  body: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  count: { color: GLASS_INK, fontFamily: font.numBold, fontSize: 40, letterSpacing: -1, marginVertical: space.xs },
  actions: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch', marginTop: space.md },
});
