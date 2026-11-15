/**
 * App start-up and lock lifecycle (plan §6.2, §8):
 *   prefs hydrated → (fingerprint on? system prompt : silent) → vault open → session read → ready.
 * Auto-lock: after `autoLockMinutes` in the background (0 = immediately) the vault closes and the lock
 * screen replaces the app; coming back shows the system prompt straight away.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { autoLock, signOut, startAuth, useAuth } from '@/lib/auth';
import { restartedForUpdate } from '@/lib/otaUpdates';
import { useApp } from '@/lib/store';
import { supabase, wipeStoredSession } from '@/lib/supabase';
import { openVault, resetVault, type OpenResult } from '@/lib/vault';

export type Boot = 'starting' | 'locked' | 'ready';

/** Last touch on the app (module state: touches are frequent, the store is written only every 15 s). */
let lastActive = Date.now();
export function markActive() { lastActive = Date.now(); }

/** After an invalidated fingerprint (new finger enrolled / biometrics removed): back to password sign-in. */
export async function handleInvalidated() {
  await wipeStoredSession();
  await resetVault();
  useApp.getState().set({ biometricEnabled: false, biometricUser: null });
  useAuth.setState({ session: null, user: null, locked: false, notice: 'Your fingerprints changed, so fingerprint unlock was turned off. Sign in with your password to turn it back on.' });
  await openVault({ biometric: false });
  await startAuth();
}

/** `onVerified` runs once the fingerprint is accepted, before the lock screen goes (the sign-in curtain goes up). */
export async function unlock(onVerified?: () => void): Promise<OpenResult> {
  const r = await openVault({ biometric: true });
  if (r === 'ok') {
    onVerified?.();
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
      useAuth.setState({ locked: true }); // a cold start always asks for the fingerprint
    } else {
      // A cold start means the app was closed — back-button exit, swiped from recents, or ended by Android — and
      // closing signs out (owner, 2026-11-15). The restart that applies an update is not a close.
      // Signed out BEFORE the stored session is published, so Home never starts loading behind the splash.
      Promise.all([openVault({ biometric: false }), restartedForUpdate()]).then(async ([, updating]) => {
        if (!updating) await signOut().catch(() => {});
        await startAuth();
      }).catch(() => useAuth.setState({ ready: true }));
    }
  }, [hydrated]);

  // The idle clock starts when a session begins or the app is unlocked — never earlier, so time spent on the
  // landing or lock screen can't sign you out the moment you get in.
  useEffect(() => useAuth.subscribe((st, prev) => {
    if ((st.session && !prev.session) || (prev.locked && !st.locked)) markActive();
  }), []);

  // Auto-lock: away from the app for `autoLockMinutes` (0 = at once), or no touch for that long while it is open
  // (at least a minute, so reading a page never locks it).
  const leftAt = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const { autoLockMinutes } = useApp.getState();
      if (state === 'background') {
        leftAt.current = Date.now();
        useApp.getState().set({ lastActiveAt: lastActive });
        if (autoLockMinutes === 0) autoLock('closed');
      } else if (state === 'active') {
        if (leftAt.current !== null && Date.now() - leftAt.current >= autoLockMinutes * 60_000) autoLock('closed');
        leftAt.current = null;
        markActive();
      }
    });
    const timer = setInterval(() => {
      const { autoLockMinutes } = useApp.getState();
      const idle = Date.now() - lastActive;
      if (idle >= Math.max(1, autoLockMinutes) * 60_000) autoLock('idle');
      // Remember the last use now and then, so a killed app still knows when it was last touched.
      if (Date.now() - useApp.getState().lastActiveAt > 15_000) useApp.getState().set({ lastActiveAt: lastActive });
    }, 10_000);
    return () => { sub.remove(); clearInterval(timer); };
  }, []);

  if (locked) return 'locked';
  return ready ? 'ready' : 'starting';
}
