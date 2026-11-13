import { Image } from 'expo-image';
import { Fingerprint } from '@/ui/icons';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut, startAuth, useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { openVault } from '@/lib/vault';
import { Button } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { SCREEN_PAD, space } from '@/ui/tokens';
import { unlock } from './useSession';

/**
 * Locked: the system biometric prompt appears immediately (no custom screen first, plan §6.2). This screen
 * is only what's behind it — the mark, a retry, and "Use password" after a cancel or 3 failures.
 */
export function LockScreen() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
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

  /** Password route: open the vault without the fingerprint, sign out, and show sign-in (prefilled flow). */
  const usePassword = async () => {
    await openVault({ biometric: false }).catch(() => {});
    await startAuth().catch(() => {}); // subscribe, so the coming password sign-in reaches the app
    // The bound key can't be read without the fingerprint, so the old session is unreachable: sign in again.
    await signOut().catch(() => {});
    useAuth.setState({ locked: false, ready: true, notice: 'Sign in with your password. You can turn fingerprint unlock back on in Me › Security.' });
  };

  return (
    <View style={[styles.root, { backgroundColor: p.bg, paddingTop: insets.top, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.center}>
        <Image source={require('../../../assets/mark.png')} style={styles.mark} contentFit="contain" accessibilityLabel="Fintraxa" />
        <Text variant="title" align="center">Fintraxa is locked</Text>
        <Text variant="body" tone="ink2" align="center">Unlock with your fingerprint to see your money.</Text>
      </View>
      <View style={styles.actions}>
        <Button label="Unlock" icon={Fingerprint} onPress={tryUnlock} loading={busy} />
        {fails > 0 ? <Button label="Use password instead" kind="ghost" onPress={usePassword} /> : null}
        {fails >= 3 ? <Text variant="caption" tone="muted" align="center">Too many tries? Use your password; your data stays safe on the server.</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: SCREEN_PAD, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  mark: { width: 88, height: 88, marginBottom: space.lg },
  actions: { gap: space.md },
});
