/**
 * App start-up and lock lifecycle (plan §6.2, §8):
 *   prefs hydrated → (fingerprint on? system prompt : silent) → vault open → session read → ready.
 * Auto-lock: after `autoLockMinutes` in the background (0 = immediately) the vault closes and the lock
 * screen replaces the app; coming back shows the system prompt straight away.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { lockNow, startAuth, useAuth } from '@/lib/auth';
import { useApp } from '@/lib/store';
import { supabase, wipeStoredSession } from '@/lib/supabase';
import { openVault, resetVault, type OpenResult } from '@/lib/vault';

export type Boot = 'starting' | 'locked' | 'ready';

/** After an invalidated fingerprint (new finger enrolled / biometrics removed): back to password sign-in. */
export async function handleInvalidated() {
  await wipeStoredSession();
  await resetVault();
  useApp.getState().set({ biometricEnabled: false, biometricUser: null });
  useAuth.setState({ session: null, user: null, locked: false, notice: 'Your fingerprints changed, so fingerprint unlock was turned off. Sign in with your password to turn it back on.' });
  await openVault({ biometric: false });
  await startAuth();
}

export async function unlock(): Promise<OpenResult> {
  const r = await openVault({ biometric: true });
  if (r === 'ok') {
    useAuth.setState({ locked: false });
    await startAuth();
    supabase.auth.startAutoRefresh();
  } else if (r === 'invalidated') {
    await handleInvalidated();
  }
  return r;
}

export function useSession(): Boot {
  const hydrated = useApp((s) => s.hydrated);
  const ready = useAuth((s) => s.ready);
  const locked = useAuth((s) => s.locked);
  const started = useRef(false);

  useEffect(() => {
    if (!hydrated || started.current) return;
    started.current = true;
    const { biometricEnabled } = useApp.getState();
    if (biometricEnabled) {
      useAuth.setState({ locked: true });
    } else {
      openVault({ biometric: false }).then(startAuth).catch(() => useAuth.setState({ ready: true }));
    }
  }, [hydrated]);

  // Auto-lock timer.
  const leftAt = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const { biometricEnabled, autoLockMinutes } = useApp.getState();
      if (!biometricEnabled || !useAuth.getState().session) return;
      if (state === 'background') {
        leftAt.current = Date.now();
        if (autoLockMinutes === 0) lockNow();
      } else if (state === 'active' && leftAt.current !== null) {
        if (Date.now() - leftAt.current >= autoLockMinutes * 60_000) lockNow();
        leftAt.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  if (locked) return 'locked';
  return ready ? 'ready' : 'starting';
}
