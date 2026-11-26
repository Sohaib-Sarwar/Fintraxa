/**
 * App start-up and session lifecycle (plan §6.2, §8; banking-grade rules 2026-11-26 — @core/session/policy.js):
 *   prefs hydrated → (fingerprint on? system prompt : silent) → vault open → session read → ready.
 *
 * While signed in:
 *  - Idle in the app for the Auto-lock time (min 1 min, default 5) → a 30-second "Still there?" warning
 *    (features/session/IdleWarning.tsx) → lock (fingerprint) or sign out with the reason. Any touch, key or scroll
 *    counts (lib/activity.ts) — also inside Modal windows and, on the web build, anywhere in the document.
 *  - Away in the background for the Auto-lock time (0 = at once) → lock / sign out on return. Screens the app opened
 *    itself (file / photo picker, fingerprint prompt, a link) are not "away" for up to 10 min (holdSession).
 *  - 12 hours since the user last signed in → sign in again (the token's own sign-in time; reason shown).
 * Starting the app: the phone app was closed → session ends (owner, 2026-11-15) — except an update restart and
 * Android ending the app behind a picker it opened; the phone web keeps the session on a reload of the same tab
 * used within the Auto-lock time (a browser reload or tab restore is not closing the app).
 * Every automatic sign-out ends THIS device's session only (lib/auth.ts signOut, scope 'local').
 */
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { authTimeFromToken, onColdStart, onReturn, PHONE_WARN_MS, phoneIdleMs, sessionState } from '@core/session/policy.js';
import { holdUntil, lastActiveAt, markActive, useIdle } from '@/lib/activity';
import { autoLock, endSession, signOut, startAuth, useAuth } from '@/lib/auth';
import { restartedForUpdate } from '@/lib/otaUpdates';
import { useApp } from '@/lib/store';
import { supabase, wipeStoredSession } from '@/lib/supabase';
import { openVault, resetVault, type OpenResult } from '@/lib/vault';

export type Boot = 'starting' | 'locked' | 'ready';
export { markActive } from '@/lib/activity';

const TICK_MS = 5_000;
const isWeb = Platform.OS === 'web';

/** Web build: true when this tab already ran the app (a reload or a restored tab), false for a new tab / launch. */
function webSameTab(): boolean {
  if (!isWeb) return false;
  try {
    const seen = globalThis.sessionStorage?.getItem('fx.tab') === '1';
    globalThis.sessionStorage?.setItem('fx.tab', '1');
    return seen;
  } catch {
    return false;
  }
}

/** After an invalidated fingerprint (new finger enrolled / biometrics removed): back to password sign-in. */
export async function handleInvalidated() {
  await wipeStoredSession();
  await resetVault();
  useApp.getState().set({ biometricEnabled: false, biometricUser: null });
  useAuth.setState({ session: null, user: null, locked: false, notice: { title: 'Fingerprint unlock turned off', text: 'Your fingerprints changed, so fingerprint unlock was turned off. Sign in with your password to turn it back on.' } });
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

/** One check of the open session against the policy (also run on returning to the app). */
function checkSession() {
  const { session, locked } = useAuth.getState();
  if (!session || locked) { if (useIdle.getState().warnUntil !== null) useIdle.setState({ warnUntil: null }); return; }
  const now = Date.now();
  const { autoLockMinutes } = useApp.getState();
  // A screen the app opened (picker, prompt) is in front: the user hasn't gone anywhere.
  if (holdUntil() > now) { markActive(); return; }
  const st = sessionState({
    now, lastActive: lastActiveAt(), idleMs: phoneIdleMs(autoLockMinutes), warnMs: PHONE_WARN_MS,
    authAt: authTimeFromToken(session.access_token),
  });
  if (st.state === 'expired') { useIdle.setState({ warnUntil: null }); endSession('expired').catch(() => {}); return; }
  if (st.state === 'idle') { useIdle.setState({ warnUntil: null }); autoLock('idle').catch(() => {}); return; }
  if (st.state === 'warn') { if (useIdle.getState().warnUntil === null) useIdle.setState({ warnUntil: now + st.msLeft }); return; }
  if (useIdle.getState().warnUntil !== null) useIdle.setState({ warnUntil: null });
}

/** Remember when the app was last used (persisted), so a fresh start can tell a reload from a closed app. */
const persistActive = () => useApp.getState().set({ lastActiveAt: lastActiveAt() });

export function useSession(): Boot {
  const hydrated = useApp((s) => s.hydrated);
  const ready = useAuth((s) => s.ready);
  const locked = useAuth((s) => s.locked);
  const started = useRef(false);

  useEffect(() => {
    if (!hydrated || started.current) return;
    started.current = true;
    const { biometricEnabled, lastActiveAt: lastUse, autoLockMinutes, holdUntil: held } = useApp.getState();
    const sameTab = webSameTab();
    const decide = (updating: boolean) => onColdStart({ web: isWeb, now: Date.now(), lastActiveAt: lastUse, autoLockMinutes, holdUntil: held, sameTab, updating });
    useApp.getState().set({ holdUntil: 0 });
    if (biometricEnabled) {
      // A fresh start asks for the fingerprint — unless it is the same browser tab reloading, used moments ago (web
      // only: on the phone the session key itself is released only by the fingerprint).
      if (!isWeb || decide(false) === 'end') { useAuth.setState({ locked: true }); return; }
      openVault({ biometric: false }).then(() => startAuth()).catch(() => useAuth.setState({ ready: true }));
      return;
    }
    // A fresh start of the phone app means it was closed — back-button exit, swiped from recents, or ended by
    // Android — and closing signs out (owner, 2026-11-15). Signed out BEFORE the stored session is published, so
    // Home never starts loading behind the splash. Not a close: the update restart, Android ending the app behind a
    // picker it opened, and (web) reloading the same tab.
    Promise.all([openVault({ biometric: false }), restartedForUpdate()]).then(async ([, updating]) => {
      if (decide(updating) === 'end') await signOut().catch(() => {});
      await startAuth();
    }).catch(() => useAuth.setState({ ready: true }));
  }, [hydrated]);

  // The idle clock starts when a session begins or the app is unlocked — never earlier, so time spent on the
  // landing or lock screen can't sign you out the moment you get in.
  useEffect(() => useAuth.subscribe((st, prev) => {
    if ((st.session && !prev.session) || (prev.locked && !st.locked)) markActive();
  }), []);

  const leftAt = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const { autoLockMinutes } = useApp.getState();
      if (state === 'background') {
        leftAt.current = Date.now();
        persistActive();
        if (autoLockMinutes === 0 && holdUntil() <= Date.now()) autoLock('away');
      } else if (state === 'active') {
        const verdict = onReturn({ now: Date.now(), leftAt: leftAt.current, autoLockMinutes, holdUntil: holdUntil() });
        leftAt.current = null;
        if (verdict === 'lock') { autoLock('away'); return; }
        markActive();
        checkSession(); // the 12-hour limit may have passed while away
      }
    });
    const timer = setInterval(() => {
      checkSession();
      // Remember the last use now and then, so a killed app (or a reloaded tab) still knows when it was last touched.
      if (Math.abs(lastActiveAt() - useApp.getState().lastActiveAt) > 15_000) persistActive();
    }, TICK_MS);

    // Web build: every pointer, key, wheel and scroll anywhere in the document is activity (react-native-web's
    // onTouchStart misses mouse and keyboard use), and leaving the page records the last use.
    const doc = isWeb ? globalThis.document : null;
    const win = isWeb ? globalThis.window : null;
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    let lastDocMark = 0;
    const onDoc = () => { const t = Date.now(); if (t - lastDocMark > 1000) { lastDocMark = t; markActive(); } };
    events.forEach((e) => doc?.addEventListener(e, onDoc, { capture: true, passive: true }));
    win?.addEventListener('pagehide', persistActive);
    return () => {
      sub.remove();
      clearInterval(timer);
      events.forEach((e) => doc?.removeEventListener(e, onDoc, { capture: true }));
      win?.removeEventListener('pagehide', persistActive);
    };
  }, []);

  if (locked) return 'locked';
  return ready ? 'ready' : 'starting';
}
