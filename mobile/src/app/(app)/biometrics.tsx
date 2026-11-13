import { router } from 'expo-router';
import { Fingerprint } from '@/ui/icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUid } from '@/data/queries';
import { haptic } from '@/lib/haptics';
import { useApp } from '@/lib/store';
import { enableBiometricKey } from '@/lib/vault';
import { Button } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { SCREEN_PAD, space } from '@/ui/tokens';

/** Offered once after the first sign-in (plan §6.1 step 4); the system prompt does the rest. */
export default function EnableBiometrics() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const uid = useUid();
  const [busy, setBusy] = useState(false);
  const done = () => { if (uid) useApp.getState().markBiometricAsked(uid); router.replace('/'); };

  const enable = async () => {
    setBusy(true);
    const ok = await enableBiometricKey();
    setBusy(false);
    if (ok) {
      useApp.getState().set({ biometricEnabled: true, biometricUser: uid ?? null });
      haptic.success();
      done();
    } else {
      haptic.warning();
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: p.bg, paddingTop: insets.top, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.center}>
        <View style={[styles.badge, { backgroundColor: p.accentSoft }]}><Fingerprint size={52} color={p.accent} strokeWidth={1.6} /></View>
        <Text variant="title" align="center">Unlock with your fingerprint next time?</Text>
        <Text variant="body" tone="ink2" align="center">Faster than a password, and your figures stay hidden from anyone else holding your phone. Your fingerprint never leaves the phone.</Text>
      </View>
      <View style={{ gap: space.md }}>
        <Button label="Use fingerprint" icon={Fingerprint} onPress={enable} loading={busy} />
        <Button label="Not now" kind="ghost" onPress={done} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: SCREEN_PAD, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingHorizontal: space.md },
  badge: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
});
